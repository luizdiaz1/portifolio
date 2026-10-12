/*
  Módulo: Eficiência Operacional (consumo médio de combustível / KM/L)
  ----------------------------------------------------------------------
  v2 — Importação mensal por competência. Autocontido — não depende de
  variáveis internas de assets/js/app.js (que roda numa IIFE isolada). A
  única ponte usada é a que o próprio app.js expõe de propósito:
  window.FrotaStable = {loadAll, showPage, state}.

  Princípio central: uma importação = um mês completo do relatório
  "Abastecimentos Por Veículo". O sistema:
    1) processa TODOS os veículos do relatório automaticamente;
    2) usa a média KM/L que o PRÓPRIO relatório já calcula e audita
       (nunca recalcula a partir dos abastecimentos individuais);
    3) identifica o motorista predominante de cada veículo no mês
       (por contagem de ocorrências, com detecção de empate);
    4) mostra uma tela de conferência antes de gravar qualquer coisa;
    5) protege contra reimportação silenciosa do mesmo período.

  Dados são gravados em duas tabelas (ver database/eficiencia_operacional.sql):
    - eficiencia_competencias: 1 linha por mês importado.
    - eficiencia_veiculos_mes: 1 linha por veículo, por mês (a unidade que
      o dashboard efetivamente usa).

  Este módulo NUNCA cria lançamento manual de abastecimento — a única
  forma de entrada de dados é a importação do relatório mensal existente.
*/
(function () {
  'use strict';

  if (window.__FROTA_EFICIENCIA_MODULE_V2__) return;
  window.__FROTA_EFICIENCIA_MODULE_V2__ = true;

  var DEFAULT_META = 4.5;
  var cachedMeta = DEFAULT_META;
  var metaLoaded = false;      // true assim que a 1ª tentativa (sucesso OU falha) terminar
  var metaBootAttempted = false; // garante que o render() só dispara essa 1ª tentativa uma única vez
  var metaLoadInFlight = null;
  var importBusy = false;
  var lastImportError = null;   // mensagem visível na tela (toast() sozinho não aparece pro usuário, só no console)
  var chartInstances = {};

  // ---------- helpers básicos (mesmo padrão defensivo usado em outros módulos) ----------
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function clean(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function N(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    var s = String(v).trim().replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    var lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (lastComma >= 0) {
      s = s.replace(',', '.');
    }
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function fmtNum(v, casas) {
    var n = Number(v) || 0;
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 2 : casas, maximumFractionDigits: casas == null ? 2 : casas });
  }
  function fmtDateISO(iso) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).split('-').reverse().join('/') : '-';
  }
  var MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  function monthLabel(m) {
    if (!m || !/^\d{4}-\d{2}$/.test(m)) return 'Todos os meses';
    var idx = Number(m.slice(5, 7)) - 1;
    return (MESES_PT[idx] || m) + '/' + m.slice(0, 4);
  }
  function canonicalPlate(v) {
    return String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }
  function titleCase(v) {
    return String(v || '').trim().toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, function (m, sep, c) { return sep + c.toUpperCase(); });
  }
  function tag(text, cls) {
    return '<span class="tag ' + (cls || 'gray') + '">' + esc(text) + '</span>';
  }
  function toast(msg) {
    try { if (typeof window.toast === 'function') { window.toast(msg); return; } } catch (e) {}
    console.log('[Eficiência]', msg);
  }

  // ---------- ponte com o app.js ----------
  function getState() {
    return (window.FrotaStable && window.FrotaStable.state) || null;
  }
  function getRows() {
    var st = getState();
    return (st && Array.isArray(st.data.eficiencia)) ? st.data.eficiencia : [];
  }
  function getVeiculos() {
    var st = getState();
    return (st && Array.isArray(st.data.veiculos)) ? st.data.veiculos : [];
  }
  function currentUserLabel() {
    var st = getState();
    var u = st && st.user;
    return u ? (u.nome || u.usuario || 'usuário') : 'sistema';
  }
  function isAdmin() {
    var st = getState();
    return !!(st && st.user && st.user.perfil === 'admin');
  }
  function getClient() {
    var st = getState();
    if (st && st.db && typeof st.db.from === 'function') return st.db;
    try {
      var cfg = window.FROTA_CONFIG || {};
      if (window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey) {
        return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      }
    } catch (e) {}
    return null;
  }
  function isActivePage() {
    var st = getState();
    return !!(st && st.current === 'eficiencia');
  }
  function refreshAppData() {
    var api = window.FrotaStable;
    if (api && typeof api.loadAll === 'function') { api.loadAll({ keepPage: true, manual: true }); return; }
    render();
  }

  // ---------- meta configurável ----------
  // IMPORTANTE: esta função SEMPRE resolve (nunca rejeita) e SEMPRE marca
  // metaLoaded = true ao final, mesmo se a tabela ainda não existir ou a
  // conexão falhar. Isso evita que render() fique re-tentando indefinidamente
  // (era exatamente esse o bug que travava a tela em loop).
  function ensureMetaLoaded(forceRetry) {
    if (metaLoaded && !forceRetry) return Promise.resolve(cachedMeta);
    if (metaLoadInFlight) return metaLoadInFlight;
    var client = getClient();
    if (!client) {
      metaLoaded = true;
      return Promise.resolve(cachedMeta);
    }
    metaLoadInFlight = client.from('eficiencia_config').select('*').eq('id', 1).maybeSingle()
      .then(function (res) {
        if (res && !res.error && res.data) {
          var v = N(res.data.meta_kml);
          cachedMeta = v > 0 ? v : DEFAULT_META;
        } else if (res && res.error) {
          console.warn('Eficiência: não foi possível carregar a meta (tabela eficiencia_config existe?):', res.error.message || res.error);
        }
        return cachedMeta;
      })
      .catch(function (e) {
        console.warn('Eficiência: falha ao carregar meta de consumo:', e);
        return cachedMeta;
      })
      .then(function (v) { metaLoaded = true; metaLoadInFlight = null; return v; });
    return metaLoadInFlight;
  }
  function saveConfig(novaMeta) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Sem conexão com o banco.'));
    var payload = { id: 1, meta_kml: novaMeta, atualizado_em: new Date().toISOString(), atualizado_por: currentUserLabel() };
    return client.from('eficiencia_config').upsert(payload).then(function (res) {
      if (res && res.error) throw res.error;
      cachedMeta = novaMeta;
      return novaMeta;
    });
  }

  // ---------- parsing de datas e números da planilha ----------
  function excelSerialToISO(serial) {
    var ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = dias entre 1899-12-30 e 1970-01-01
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }
  function parseDateFlexible(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 90000) return excelSerialToISO(v);
    var s = String(v).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    return '';
  }

  // ---------- estado de dados (competências + veículos-mês) ----------
  var dataLoaded = false;
  var dataLoadInFlight = null;
  var competencias = [];        // [{mes, arquivo, importado_em, veiculos_processados, ...}] mais recente primeiro
  var veiculosMes = [];         // TODOS os registros de eficiencia_veiculos_mes, de todas as competências
  var roteirosMap = new Map();  // 'placa|motorista_chave' -> {roteiro, motorista_nome, ...}
  var selectedMonth = '';       // '' = todas as competências
  var filtroModelo = '';
  var filtroMotorista = '';
  var filtroPlaca = '';
  var stagingImport = null;     // {mes, arquivo, veiculos:[...], jaExiste:{...}|null, resumo:{...}}
  var expandedPlaca = '';       // placa exibida no painel de detalhe (overlay)

  function chaveRoteiro(placa, motorista) { return canonicalPlate(placa) + '|' + clean(motorista); }
  function roteiroDe(placa, motorista) {
    if (!motorista) return '';
    var r = roteirosMap.get(chaveRoteiro(placa, motorista));
    return r ? (r.roteiro || '') : '';
  }
  function loadAllData(force) {
    if (dataLoaded && !force) return Promise.resolve();
    if (dataLoadInFlight) return dataLoadInFlight;
    var client = getClient();
    if (!client) { dataLoaded = true; return Promise.resolve(); }
    dataLoadInFlight = Promise.all([
      client.from('eficiencia_competencias').select('*').order('mes', { ascending: false }),
      client.from('eficiencia_veiculos_mes').select('*').order('mes', { ascending: false }),
      client.from('eficiencia_roteiros').select('*')
    ]).then(function (results) {
      var compRes = results[0], vmRes = results[1], rtRes = results[2];
      if (compRes && !compRes.error && Array.isArray(compRes.data)) competencias = compRes.data;
      if (vmRes && !vmRes.error && Array.isArray(vmRes.data)) veiculosMes = vmRes.data;
      if (rtRes && !rtRes.error && Array.isArray(rtRes.data)) {
        roteirosMap = new Map();
        rtRes.data.forEach(function (r) { roteirosMap.set(r.placa + '|' + r.motorista_chave, r); });
      }
      if ((compRes && compRes.error) || (vmRes && vmRes.error)) {
        console.warn('Eficiência: falha ao carregar competências/veículos-mês (as tabelas v2 existem no banco?):', (compRes && compRes.error) || (vmRes && vmRes.error));
      }
      if (rtRes && rtRes.error) {
        console.warn('Eficiência: falha ao carregar roteiros (tabela eficiencia_roteiros existe? rode a v3 do SQL):', rtRes.error);
      }
    }).catch(function (e) {
      console.warn('Eficiência: erro ao carregar dados.', e);
    }).then(function () {
      dataLoaded = true;
      dataLoadInFlight = null;
    });
    return dataLoadInFlight;
  }
  function salvarRoteiro(placa, motorista, texto) {
    var client = getClient();
    if (!client || !motorista) return Promise.reject(new Error('Sem motorista identificado para este veículo.'));
    var row = {
      placa: canonicalPlate(placa), motorista_chave: clean(motorista), motorista_nome: motorista,
      roteiro: texto, atualizado_em: new Date().toISOString(), atualizado_por: currentUserLabel()
    };
    return client.from('eficiencia_roteiros').upsert(row).then(function (res) {
      if (res && res.error) throw res.error;
      roteirosMap.set(row.placa + '|' + row.motorista_chave, row);
    });
  }
  function salvarRegistros(id, novoValor) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Sem conexão com o Supabase.'));
    return client.from('eficiencia_veiculos_mes').update({ registros: novoValor }).eq('id', id).then(function (res) {
      if (res && res.error) throw res.error;
      var row = veiculosMes.find(function (v) { return v.id === id; });
      if (row) row.registros = novoValor;
    });
  }
  // Permite corrigir manualmente a média KM/L quando o relatório vier com um
  // valor errado/implausível (leitura de odômetro ruim etc.). Recalcula
  // "distancia" mantendo "litros" como peso — assim o valor corrigido entra
  // corretamente na média ponderada da frota e nos rankings, em vez de só
  // mudar visualmente na linha da tabela. Se o veículo não tinha litros
  // registrados (era um caso descartado por implausibilidade), usa peso 1
  // para não distorcer a frota com um peso inventado.
  function salvarKmL(id, novoValor) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Sem conexão com o Supabase.'));
    var row = veiculosMes.find(function (v) { return v.id === id; });
    var litrosBase = (row && toNum2(row.litros) > 0) ? toNum2(row.litros) : 1;
    var distanciaRecalc = novoValor * litrosBase;
    var patch = { km_l: novoValor, km_l_editado_manualmente: true, litros: litrosBase, distancia: distanciaRecalc };
    return client.from('eficiencia_veiculos_mes').update(patch).eq('id', id).then(function (res) {
      if (res && res.error) throw res.error;
      if (row) Object.assign(row, patch);
    });
  }
  // Corrige manualmente o KM/L de UM motorista específico dentro de um
  // veículo/mês (o valor inicial vem copiado da média oficial do veículo,
  // já que o relatório não separa por motorista — mas cada um pode ser
  // ajustado individualmente aqui). Grava dentro do próprio array
  // "motoristas" (jsonb) do veículo, sem mexer nos outros motoristas dele.
  function salvarKmLMotorista(veiculoId, nomeMotorista, novoValor) {
    var client = getClient();
    if (!client) return Promise.reject(new Error('Sem conexão com o Supabase.'));
    var row = veiculosMes.find(function (v) { return v.id === veiculoId; });
    if (!row) return Promise.reject(new Error('Veículo não encontrado.'));
    var motoristasAtualizados = (row.motoristas || []).map(function (m) {
      if (clean(m.nome) === clean(nomeMotorista)) return Object.assign({}, m, { km_l: novoValor, km_l_editado_manualmente: true });
      return m;
    });
    return client.from('eficiencia_veiculos_mes').update({ motoristas: motoristasAtualizados }).eq('id', veiculoId).then(function (res) {
      if (res && res.error) throw res.error;
      row.motoristas = motoristasAtualizados;
    });
  }
  // Apaga por completo os dados de uma competência (mês) já importada — os
  // veículos daquele mês e a própria competência. Os ROTEIROS não são
  // apagados (ficam ligados a placa+motorista, não a um mês específico, e
  // continuam valendo se o mesmo motorista/veículo aparecer numa importação
  // futura). Ação destrutiva e definitiva — por isso pede confirmação e é
  // restrita a admin.
  function reverterImportacao(mes) {
    if (!mes) return;
    if (!isAdmin()) { toast('Apenas um usuário administrador pode reverter uma importação.'); return; }
    var comp = competencias.find(function (c) { return c.mes === mes; });
    var qtd = comp ? comp.veiculos_processados : veiculosMes.filter(function (v) { return v.mes === mes; }).length;
    var confirmado = window.confirm(
      'Reverter a importação de ' + monthLabel(mes) + '?\n\n' +
      'Isso vai apagar os ' + qtd + ' veículo(s) importados nesse período e a competência inteira.\n' +
      'Os roteiros já preenchidos NÃO serão apagados.\n\n' +
      'Essa ação não pode ser desfeita. Deseja continuar?'
    );
    if (!confirmado) return;
    var client = getClient();
    if (!client) { toast('Sem conexão com o Supabase.'); return; }
    Promise.all([
      client.from('eficiencia_veiculos_mes').delete().eq('mes', mes),
      client.from('eficiencia_competencias').delete().eq('mes', mes)
    ]).then(function (resList) {
      var comErro = resList.find(function (r) { return r && r.error; });
      if (comErro) throw comErro.error;
      if (selectedMonth === mes) selectedMonth = '';
      return loadAllData(true);
    }).then(function () {
      toast('Importação de ' + monthLabel(mes) + ' revertida.');
      if (isActivePage()) render();
    }).catch(function (e) {
      toast('Não foi possível reverter a importação. Veja o console (F12).');
      console.warn(e);
    });
  }

  // ---------- parser: formato simples (fallback) — 1 linha = 1 veículo já consolidado ----------
  // Usado apenas se o arquivo NÃO for o relatório em blocos (ex.: alguém monta uma
  // planilha simples à mão com Placa/Modelo/Motorista/KM-L). Não é o caminho principal.
  var COLUMN_ALIASES_SIMPLES = {
    placa: ['placa', 'veiculo', 'veículo', 'carro'],
    modelo: ['modelo'],
    motorista: ['motorista predominante', 'motorista', 'condutor', 'operador'],
    kml: ['media km/l', 'média km/l', 'km/l', 'kml'],
    registros: ['registros', 'qtd registros', 'quantidade de registros']
  };
  function detectColumnsSimples(headerRow) {
    var normalized = headerRow.map(function (h) { return clean(h); });
    var found = {};
    Object.keys(COLUMN_ALIASES_SIMPLES).forEach(function (field) {
      var aliases = COLUMN_ALIASES_SIMPLES[field];
      var idx = -1;
      for (var a = 0; a < aliases.length && idx === -1; a++) {
        for (var i = 0; i < normalized.length; i++) {
          if (normalized[i] && normalized[i].indexOf(aliases[a]) !== -1) { idx = i; break; }
        }
      }
      found[field] = idx;
    });
    return found;
  }
  function parseSimples(rows, fileName) {
    var veiculos = [];
    if (!rows.length) return { veiculos: veiculos, periodoDetectado: '' };
    var cols = detectColumnsSimples(rows[0]);
    rows.slice(1).forEach(function (row) {
      if (!row || !row.length) return;
      var placa = cols.placa >= 0 ? String(row[cols.placa] || '').trim() : '';
      if (!placa) return;
      var kml = cols.kml >= 0 ? N(row[cols.kml]) : 0;
      var motorista = cols.motorista >= 0 ? String(row[cols.motorista] || '').trim() : '';
      var modeloTxt = cols.modelo >= 0 ? String(row[cols.modelo] || '').trim() : '';
      veiculos.push({
        placa: canonicalPlate(placa),
        modelo: modeloTxt,
        modelo_grupo: extrairGrupoModelo(modeloTxt),
        motoristas: motorista ? [{ nome: motorista, ocorrencias: 1 }] : [],
        motorista_predominante: motorista ? titleCase(motorista) : null,
        empate: false,
        km_l: kml > 0 ? kml : null,
        km_l_auditado: true,
        distancia: 0, litros: 0, valor: 0,
        registros: cols.registros >= 0 ? N(row[cols.registros]) : 0,
        erro: null,
        origem_arquivo: fileName
      });
    });
    return { veiculos: veiculos, periodoDetectado: '' };
  }

  // ---------- parser: relatório em blocos (Ticket Log / cartão-combustível) ----------
  // Repetido por veículo: cabeçalho do veículo -> dados do veículo -> cabeçalho da
  // transação -> N linhas de abastecimento -> linha de totais/consolidação oficial.
  // A média KM/L usada é SEMPRE a que o próprio relatório calcula (nunca recalculada
  // a partir dos abastecimentos individuais) — ver seção "*Média Km/L" abaixo.
  function rowFindIndex(row, alias, exact) {
    for (var i = 0; i < row.length; i++) {
      var c = clean(row[i]);
      if (!c) continue;
      if (exact ? c === alias : c.indexOf(alias) !== -1) return i;
    }
    return -1;
  }
  function isBlockReport(rows) {
    var limit = Math.min(rows.length, 300);
    for (var i = 0; i < limit; i++) {
      var r = rows[i] || [];
      if (clean(r[0]) === 'data/hora' && rowFindIndex(r, 'posto') !== -1) return true;
    }
    return false;
  }
  function detectarPeriodoRelatorio(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var row = rows[i] || [];
      for (var j = 0; j < row.length; j++) {
        var c = String(row[j] || '');
        if (clean(c).indexOf('periodo') === 0) {
          var m = c.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (m) return m[3] + '-' + m[2];
        }
      }
    }
    return '';
  }
  // Exceções manuais de agrupamento (pedido explícito do usuário): alguns
  // números de modelo devem ser tratados como se fossem outro, por decisão
  // operacional — não é um erro de leitura do relatório.
  var EXCECOES_GRUPO_MODELO = { '815': '1016' };
  function extrairGrupoModelo(modeloTexto) {
    var m = String(modeloTexto || '').match(/\d{3,4}/);
    if (m) return EXCECOES_GRUPO_MODELO[m[0]] || m[0];
    var t = String(modeloTexto || '').trim().toUpperCase();
    return t || 'SEM MODELO';
  }
  function parseBlocos(rows, fileName) {
    var veiculos = [];
    var currentPlaca = '', currentModelo = '';
    var tx = null;
    var motoristaCounts = {};
    var registrosCount = 0;

    // Limite de sanidade: nenhum caminhão faz mais que ~20 KM/L na vida real.
    // O relatório às vezes traz uma leitura de odômetro com problema (o
    // próprio relatório detecta isso e por ISSO exclui da média auditada —
    // mas quando cai no fallback "bruto" porque a auditada não existe, esse
    // mesmo problema pode aparecer ali também). Sem esse limite, um único
    // veículo com leitura errada distorce a eficiência da frota inteira.
    var KML_MAXIMO_PLAUSIVEL = 20;
    // Limite por REGISTRO individual (abastecimento a abastecimento): usado
    // no recálculo de emergência (fallback 2, ver finalizar()) para separar
    // um trecho longo, porém real, de um erro de leitura de odômetro. Frota
    // de entrega local/regional (Campo Grande/RJ) — o maior trecho real já
    // confirmado entre dois abastecimentos foi de 3.262 km (RIR7J57,
    // Junho/2026, confirmado com o usuário); um caso de 5.290 km (RIR7J59,
    // Julho/2026) foi confirmado como IMPOSSÍVEL pelo usuário, que conhece a
    // operação real da frota. 4.000 km fica entre os dois, com folga.
    var REGISTRO_DIST_MAXIMA_PLAUSIVEL = 4000;
    // Status de abastecimento que o próprio relatório do CTF documenta como
    // inválidos para a média (ver rodapé "Obs Médias" do relatório):
    // L-odômetro menor, Z-odômetro zerado, K-odômetro parado,
    // F-sem odômetro anterior válido, C-contingência, A-auditado.
    var STATUS_INVALIDOS = { l: 1, z: 1, k: 1, f: 1, c: 1, a: 1 };
    function statusInvalido(raw) {
      var partes = clean(raw).split(/\s+/);
      for (var i = 0; i < partes.length; i++) { if (STATUS_INVALIDOS[partes[i]]) return true; }
      return false;
    }

    // Piso de distância para o "lookahead" (ver finalizar()): só olhamos a
    // correção "L" seguinte como evidência de erro quando o próprio registro
    // já é grande o bastante pra ser ambíguo. Sem esse piso, qualquer
    // abastecimento pequeno e legítimo que por acaso vem antes de um "L" não
    // relacionado seria descartado à toa.
    var LOOKAHEAD_DIST_MINIMA = 1500;

    // Piso "moderado": um registro incluído no recálculo acima disso não é
    // descartado (não é impossível), mas também foge bastante do padrão
    // observado na frota (~200–600 km por abastecimento, raros casos até
    // ~4.000 km). Quando isso acontece, marcamos o veículo para revisão
    // humana em vez de simplesmente confiar no número — situações assim
    // geralmente envolvem problema físico no odômetro (painel, sensor), não
    // um erro simples de digitação que dá pra resolver só com regras.
    var SUSPEITA_REVISAO_MANUAL = 2000;

    function finalizar(valoresRow, cols, registrosDetalhe) {
      // IMPORTANTE: "*Média Km/L" (auditada) é calculada em cima de "Σ Km
      // p/Média" e "Σ Volume p/Média" — NÃO em cima de "Total Dist/Tempo" e
      // "Volume Total" (que geram a "Média Km/L" bruta, uma métrica
      // DIFERENTE). Cada uma tem seu próprio par de distância/litros; usar
      // km_l de uma fonte com distância/litros da outra produz um número sem
      // sentido (foi exatamente esse bug que causava "134 KM/L" no dashboard).
      var kmlAuditado = N(valoresRow[cols.kmlOficial]);
      var kmlBruto = cols.kmlBruto >= 0 ? N(valoresRow[cols.kmlBruto]) : 0;
      var auditadoValido = kmlAuditado > 0 && kmlAuditado <= KML_MAXIMO_PLAUSIVEL;
      var km_l = null, distancia = 0, litros = 0, usouAuditado = false, fonteKml = null;
      if (auditadoValido) {
        km_l = kmlAuditado; usouAuditado = true; fonteKml = 'auditado';
        distancia = N(valoresRow[cols.distAuditado]); litros = N(valoresRow[cols.volAuditado]);
      }
      // FALLBACK 2 — recálculo a partir dos abastecimentos individuais.
      // Vem ANTES do "bruto" de propósito: o "bruto" é Total Dist/Tempo ÷
      // Volume Total, uma razão simples que NÃO filtra abastecimentos com
      // status inválido — então um abastecimento com 0 km e status "L" (por
      // exemplo) entra só no litro, sem entrar no km, e derruba o km/L à
      // toa mesmo passando no teste de sanidade (≤ 20 km/L). O recálculo
      // aqui aplica o mesmo filtro que o relatório diz usar para a média
      // auditada (status L/Z/K/F/C/A fora, ARLA fora, salto de odômetro
      // impossível fora), então é mais confiável que o bruto sempre que
      // conseguimos os abastecimentos linha a linha. Mesmo método usado
      // manualmente nos relatórios de Abril–Julho/2026.
      var recalculado = false, registrosExcluidos = 0, precisaRevisao = false;
      if (!km_l && registrosDetalhe && registrosDetalhe.length) {
        var somaD = 0, somaV = 0;
        registrosDetalhe.forEach(function (r, idx) {
          var combArla = clean(r.comb) === 'ar';
          // dist<=0 cobre tanto os status L/Z/K/F (sempre vêm com 0 km) quanto
          // "P" (abastecimento parcial, também comum vir com 0 km) — um
          // abastecimento sem quilometragem associada só pioraria a média
          // artificialmente (soma litro sem somar km), então é sempre excluído.
          // Também exclui o registro ANTERIOR a um status "L": por definição
          // do próprio relatório, "L" significa que o odômetro deste
          // abastecimento é MENOR que o do abastecimento anterior — ou seja,
          // é o próprio CTF apontando que a dupla (anterior, este) está
          // quebrada. Isso confirma o registro anterior como erro de leitura
          // mesmo quando o valor sozinho não seria "impossível" (ex.: um
          // salto de ~3.000 km que passaria no limite de plausibilidade, mas
          // que o próprio relatório corrige logo em seguida).
          var proximoCorrige = r.dist >= LOOKAHEAD_DIST_MINIMA && registrosDetalhe[idx + 1] && statusInvalido(registrosDetalhe[idx + 1].status)
            && clean(registrosDetalhe[idx + 1].status).split(/\s+/).indexOf('l') !== -1;
          var invalido = statusInvalido(r.status) || combArla || r.dist > REGISTRO_DIST_MAXIMA_PLAUSIVEL || r.dist <= 0 || proximoCorrige;
          if (invalido) { registrosExcluidos++; return; }
          if (r.dist >= SUSPEITA_REVISAO_MANUAL) precisaRevisao = true;
          somaD += r.dist; somaV += r.vol;
        });
        if (somaV > 0) {
          var kmlRecalc = somaD / somaV;
          if (kmlRecalc > 0 && kmlRecalc <= KML_MAXIMO_PLAUSIVEL) {
            km_l = kmlRecalc; usouAuditado = false; fonteKml = 'recalculado';
            distancia = somaD; litros = somaV; recalculado = true;
          }
        }
      }
      // FALLBACK 3 — "Média Km/L" bruto do relatório (Total Dist/Tempo ÷
      // Volume Total). Último recurso, só quando não há registrosDetalhe
      // disponível (ex.: formato de relatório mais simples) para fazer o
      // recálculo filtrado acima.
      var brutoValido = kmlBruto > 0 && kmlBruto <= KML_MAXIMO_PLAUSIVEL;
      if (!km_l && brutoValido) {
        km_l = kmlBruto; usouAuditado = false; fonteKml = 'bruto';
        distancia = N(valoresRow[cols.distTotal]); litros = N(valoresRow[cols.volTotal]);
      }
      // O KM/L de cada motorista NÃO é calculado — o relatório não traz uma
      // média separada por motorista (só por veículo, misturando todo mundo
      // que abasteceu aquele caminhão no bloco). Por decisão do usuário: todo
      // motorista que dirigiu esse veículo no mês recebe a MESMA média — a
      // oficial do veículo, lida acima — e cada um pode ser corrigido
      // manualmente na tela depois, se precisar.
      var motoristasArr = Object.keys(motoristaCounts).map(function (n) {
        return { nome: titleCase(n), ocorrencias: motoristaCounts[n], km_l: km_l, km_l_editado_manualmente: false };
      }).sort(function (a, b) { return b.ocorrencias - a.ocorrencias; });
      veiculos.push({
        placa: canonicalPlate(currentPlaca),
        modelo: currentModelo,
        modelo_grupo: extrairGrupoModelo(currentModelo),
        motoristas: motoristasArr,
        motorista_predominante: null,
        empate: false,
        km_l: km_l,
        km_l_auditado: usouAuditado,
        km_l_fonte: fonteKml,
        km_l_recalculado: recalculado,
        km_l_precisa_revisao: precisaRevisao,
        registros_excluidos_recalculo: registrosExcluidos,
        distancia: distancia,
        litros: litros,
        valor: N(valoresRow[cols.valorTotal]),
        registros: registrosCount,
        erro: registrosCount === 0 ? 'Nenhum abastecimento encontrado para este veículo no período' : (!km_l ? 'Leitura de odômetro implausível no relatório e no recálculo manual (KM/L descartado)' : (precisaRevisao ? 'Recalculado, mas com abastecimento(s) fora do padrão da frota (≥ ' + SUSPEITA_REVISAO_MANUAL + ' km) — revisar manualmente o histórico de odômetro deste veículo antes de confiar 100% no número.' : null)),
        origem_arquivo: fileName
      });
    }

    var registrosDetalhe = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || [];
      if (clean(row[0]) === 'id' && rowFindIndex(row, 'placa') !== -1) {
        var placaIdx = rowFindIndex(row, 'placa');
        var modeloIdx = rowFindIndex(row, 'modelo');
        var dataRow = rows[i + 1] || [];
        currentPlaca = String(dataRow[placaIdx] || '').trim();
        currentModelo = modeloIdx >= 0 ? String(dataRow[modeloIdx] || '').trim() : '';
        tx = null;
        motoristaCounts = {};
        registrosCount = 0;
        registrosDetalhe = [];
        continue;
      }
      if (clean(row[0]) === 'data/hora' && rowFindIndex(row, 'posto') !== -1) {
        tx = {
          data: 0,
          apelido: rowFindIndex(row, 'apelido'),
          matrMot: rowFindIndex(row, 'matr.mot'),
          dist: rowFindIndex(row, 'dist', true),
          vol: rowFindIndex(row, 'vol', true),
          comb: rowFindIndex(row, 'comb', true),
          status: rowFindIndex(row, 'st', true)
        };
        continue;
      }
      var resumoKmlIdx = rowFindIndex(row, '*media km/l', true);
      if (resumoKmlIdx !== -1 && currentPlaca) {
        var valoresRow = rows[i + 1] || [];
        finalizar(valoresRow, {
          kmlOficial: resumoKmlIdx,
          kmlBruto: rowFindIndex(row, 'media km/l', true),
          distAuditado: rowFindIndex(row, 'km p/', false),
          volAuditado: rowFindIndex(row, 'volume p/', false),
          distTotal: rowFindIndex(row, 'total dist/tempo', true),
          volTotal: rowFindIndex(row, 'volume total', true),
          valorTotal: rowFindIndex(row, 'total valor', true)
        }, registrosDetalhe);
        tx = null;
        currentPlaca = '';
        continue;
      }
      if (tx && parseDateFlexible(row[tx.data])) {
        registrosCount++;
        var motorista = String(row[tx.apelido] || row[tx.matrMot] || '').trim();
        if (motorista) motoristaCounts[motorista] = (motoristaCounts[motorista] || 0) + 1;
        registrosDetalhe.push({
          dist: N(row[tx.dist]),
          vol: N(row[tx.vol]),
          comb: tx.comb >= 0 ? String(row[tx.comb] || '') : '',
          status: tx.status >= 0 ? String(row[tx.status] || '') : ''
        });
      }
    }
    return { veiculos: veiculos, periodoDetectado: detectarPeriodoRelatorio(rows) };
  }

  // ---------- cruzamento com o cadastro de Veículos ----------
  // Placas que devem ser sempre ignoradas na importação/validação — não geram
  // erro, alerta, nem aparecem como "não encontrado no cadastro". São
  // simplesmente removidas do processamento, como se nunca tivessem existido
  // no relatório.
  var PLACAS_IGNORADAS = [
    // demo: placas fictícias de veículos leves que não entram no cálculo
    'LEV1A11', 'LEV2B22', 'LEV3C33'
  ].map(canonicalPlate);
  var PLACAS_IGNORADAS_SET = new Set(PLACAS_IGNORADAS);
  function removerPlacasIgnoradas(veiculos) {
    return veiculos.filter(function (v) { return !PLACAS_IGNORADAS_SET.has(canonicalPlate(v.placa)); });
  }

  function cruzarComCadastro(veiculos) {
    var cadastro = getVeiculos();
    var byPlaca = new Map();
    cadastro.forEach(function (v) { byPlaca.set(canonicalPlate(v.placa || v.carro || ''), v); });
    return veiculos.map(function (v) {
      var cad = byPlaca.get(v.placa);
      var modeloCad = cad ? String(cad.modelo || '').trim() : '';
      // Comparação tolerante: usa o NÚMERO do modelo (ex.: 1117), não o texto
      // completo — "ACELLO 1117" e "M.Benz 1117" são considerados o mesmo
      // modelo. Quando o relatório vem incompleto (ex.: só "ACELLO", sem
      // número) mas o cadastro tem o modelo completo, usamos o modelo do
      // CADASTRO como fonte da verdade — sem marcar divergência — em vez de
      // alertar por um dado que o próprio relatório não informou direito.
      var numCad = extrairGrupoModelo(modeloCad);
      var numRel = v.modelo_grupo || extrairGrupoModelo(v.modelo);
      var numCadValido = /^\d+$/.test(numCad);
      var numRelValido = /^\d+$/.test(numRel);
      var divergente = false;
      var modeloEfetivo = v.modelo;
      var modeloGrupoEfetivo = v.modelo_grupo;
      var completadoPeloCadastro = false;
      if (cad && modeloCad && v.modelo) {
        if (numCadValido && numRelValido) {
          divergente = numCad !== numRel;
        } else if (!numRelValido && numCadValido) {
          // relatório incompleto ("ACELLO" solto) — adota o modelo do cadastro
          modeloEfetivo = modeloCad;
          modeloGrupoEfetivo = numCad;
          completadoPeloCadastro = true;
        } else if (numRelValido && !numCadValido) {
          // relatório tem número (mais específico que o cadastro) — mantém o do relatório
          divergente = false;
        } else {
          // nenhum dos dois tem número — só resta comparar o texto mesmo
          divergente = clean(modeloCad) !== clean(v.modelo);
        }
      }
      return Object.assign({}, v, {
        naoEncontradoNoCadastro: !cad,
        modelo_divergente: divergente,
        modelo: modeloEfetivo,
        modelo_grupo: modeloGrupoEfetivo,
        modeloOriginalRelatorio: v.modelo,
        modelo_completado_cadastro: completadoPeloCadastro,
        modeloCadastro: modeloCad
      });
    });
  }

  // ---------- importação: parse -> conferência (staging) -> confirmar ----------
  function ensureXLSX() { return typeof window.XLSX !== 'undefined'; }
  function readWorkbook(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = new Uint8Array(ev.target.result);
          var wb = window.XLSX.read(data, { type: 'array', cellDates: false });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          resolve(window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }));
        } catch (e) { reject(e); }
      };
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      reader.readAsArrayBuffer(file);
    });
  }
  function mesMaisFrequente(veiculos, periodoDetectado) {
    if (periodoDetectado) return periodoDetectado;
    // fallback: não deveria ser necessário no formato em blocos (já detecta via metadados),
    // mas se algum dia faltar, não há data por veículo consolidado para inferir — deixa em aberto.
    return '';
  }
  function handleFileSelected(file) {
    if (!file || importBusy || stagingImport) return;
    lastImportError = null;
    if (!ensureXLSX()) {
      lastImportError = 'A biblioteca de leitura de planilhas (SheetJS) não carregou. Verifique sua conexão e recarregue a página (F5). Se persistir, veja o console (F12) por um erro de rede.';
      render();
      return;
    }
    importBusy = true;
    render();
    readWorkbook(file).then(function (rows) {
      if (!rows.length) throw new Error('Arquivo vazio ou ilegível.');
      var parsed = isBlockReport(rows) ? parseBlocos(rows, file.name) : parseSimples(rows, file.name);
      parsed.veiculos = removerPlacasIgnoradas(parsed.veiculos);
      var mes = mesMaisFrequente(parsed.veiculos, parsed.periodoDetectado);
      if (!mes) throw new Error('Não foi possível identificar o período (mês/ano) deste relatório. Confira se a planilha tem a linha "Período: DD/MM/AAAA - DD/MM/AAAA" nos metadados, ou se o formato é o esperado.');
      if (!parsed.veiculos.length) throw new Error('Nenhum veículo foi reconhecido nesta planilha. Confira se é o relatório "Abastecimentos Por Veículo" original, sem edições, e se o arquivo não está corrompido.');
      var cruzados = cruzarComCadastro(parsed.veiculos);
      var naoEncontrados = cruzados.filter(function (v) { return v.naoEncontradoNoCadastro; }).length;
      var divergentes = cruzados.filter(function (v) { return v.modelo_divergente; }).length;
      var comErro = cruzados.filter(function (v) { return v.erro; }).length;
      var motoristasDistintos = new Set();
      cruzados.forEach(function (v) { (v.motoristas || []).forEach(function (m) { motoristasDistintos.add(clean(m.nome)); }); });
      var registrosTotais = cruzados.reduce(function (s, v) { return s + (v.registros || 0); }, 0);
      var modelosDistintos = Array.from(new Set(cruzados.map(function (v) { return v.modelo_grupo; }).filter(Boolean))).sort();
      importBusy = false;
      return loadAllData(true).then(function () {
        var existente = competencias.find(function (c) { return c.mes === mes; }) || null;
        stagingImport = {
          mes: mes, arquivo: file.name, veiculos: cruzados, jaExiste: existente,
          resumo: {
            encontrados: cruzados.length, naoEncontrados: naoEncontrados, divergentes: divergentes,
            comErro: comErro, motoristasDistintos: motoristasDistintos.size, registrosTotais: registrosTotais, modelosDistintos: modelosDistintos
          }
        };
        if (isActivePage()) render();
      });
    }).catch(function (err) {
      console.warn('Falha na importação de eficiência:', err);
      importBusy = false;
      lastImportError = (err && err.message) || 'Falha ao importar o arquivo. Veja o console (F12) para detalhes técnicos.';
      if (isActivePage()) render();
    });
  }
  function cancelarStaging() { stagingImport = null; lastImportError = null; render(); }
  function confirmarImportacao(modo) {
    // modo: 'adicionar' (mescla, mantém o resto do mês intacto) ou
    // 'substituir' (apaga tudo do mês e recoloca do zero). Se não vier modo
    // e não havia competência anterior, é uma importação nova — comporta-se
    // como 'substituir' (equivalente, já que não há nada pra apagar).
    if (!stagingImport || importBusy) return;
    var client = getClient();
    if (!client) { lastImportError = 'Sem conexão com o Supabase. Verifique sua internet e tente novamente.'; render(); return; }
    var modoFinal = modo || (stagingImport.jaExiste ? 'adicionar' : 'substituir');
    importBusy = true;
    lastImportError = null;
    render();
    try {
      confirmarImportacaoInner(client, modoFinal);
    } catch (e) {
      // Blindagem: qualquer exceção síncrona inesperada aqui NÃO pode deixar
      // o botão travado em "Salvando..." para sempre.
      console.error('Eficiência: erro inesperado ao confirmar importação.', e);
      importBusy = false;
      lastImportError = (e && e.message) || 'Erro inesperado ao confirmar a importação. Veja o console (F12).';
      render();
    }
  }
  function confirmarImportacaoInner(client, modo) {
    var mes = stagingImport.mes;
    var veiculos = stagingImport.veiculos;
    var base = Date.now();
    var linhas = veiculos.map(function (v, i) {
      return {
        id: base * 1000 + i, mes: mes, placa: v.placa, modelo: v.modelo, modelo_grupo: v.modelo_grupo,
        motorista_predominante: null, motoristas: v.motoristas,
        empate: false, km_l: v.km_l, km_l_relatorio: v.km_l, km_l_editado_manualmente: false, km_l_auditado: v.km_l_auditado,
        distancia: v.distancia, litros: v.litros, valor: v.valor,
        registros_relatorio: v.registros || 0, registros: v.registros || 0,
        modelo_divergente: v.modelo_divergente, modelo_completado_cadastro: v.modelo_completado_cadastro || false, origem_arquivo: v.origem_arquivo
      };
    });
    var problemas = [];
    veiculos.forEach(function (v) {
      if (v.modelo_divergente) problemas.push({ placa: v.placa, tipo: 'modelo_divergente' });
      if (v.naoEncontradoNoCadastro) problemas.push({ placa: v.placa, tipo: 'nao_cadastrado' });
      if (v.erro) problemas.push({ placa: v.placa, tipo: 'erro', detalhe: v.erro });
    });

    // 'substituir': apaga tudo do mês antes de gravar (comportamento antigo).
    // 'adicionar': NÃO apaga nada — grava por cima usando a chave única
    // (mes, placa), que atualiza só os veículos deste arquivo e preserva os
    // demais que já estavam salvos (é o que permite importar aos poucos,
    // um motorista/veículo de cada vez, sem perder o que já foi importado).
    var apagarAntigos = (modo === 'substituir' && stagingImport.jaExiste)
      ? client.from('eficiencia_veiculos_mes').delete().eq('mes', mes)
      : Promise.resolve({ error: null });
    var competenciaRowInicial = {
      mes: mes, arquivo: stagingImport.arquivo, importado_em: new Date().toISOString(), importado_por: currentUserLabel(),
      veiculos_encontrados: veiculos.length, veiculos_processados: veiculos.length,
      veiculos_nao_cadastrados: stagingImport.resumo.naoEncontrados, problemas: problemas
    };
    var salvarVeiculos = function () {
      return modo === 'adicionar'
        ? client.from('eficiencia_veiculos_mes').upsert(linhas, { onConflict: 'mes,placa' })
        : client.from('eficiencia_veiculos_mes').insert(linhas);
    };

    apagarAntigos.then(function (res) {
      if (res && res.error) throw res.error;
      // A competência precisa ser gravada ANTES dos veículos: a tabela
      // eficiencia_veiculos_mes tem uma foreign key que exige que a
      // competência já exista (senão o Postgres recusa o insert com
      // "violates foreign key constraint eficiencia_veiculos_mes_mes_fkey").
      // IMPORTANTE: salvarVeiculos() só é CHAMADA aqui dentro, depois que a
      // competência já terminou de gravar — chamar client.from(...).insert()
      // mais cedo dispararia a requisição na hora (é síncrono), antes da
      // competência existir, mesmo que o resultado só fosse usado depois.
      return client.from('eficiencia_competencias').upsert(competenciaRowInicial);
    }).then(function (res) {
      if (res && res.error) throw res.error;
      return salvarVeiculos();
    }).then(function (res) {
      if (res && res.error) throw res.error;
      if (modo !== 'adicionar') return Promise.resolve({ error: null });
      // No modo "adicionar", o total de veículos da competência é a soma de
      // TUDO que já está salvo pra esse mês (não só o lote deste arquivo) —
      // agora que os veículos já foram gravados, corrige a contagem.
      return client.from('eficiencia_veiculos_mes').select('placa').eq('mes', mes).then(function (res2) {
        var totalAtual = (res2 && Array.isArray(res2.data)) ? res2.data.length : veiculos.length;
        return client.from('eficiencia_competencias').upsert({
          mes: mes, arquivo: stagingImport.arquivo, importado_em: new Date().toISOString(), importado_por: currentUserLabel(),
          veiculos_encontrados: totalAtual, veiculos_processados: totalAtual,
          veiculos_nao_cadastrados: stagingImport.resumo.naoEncontrados, problemas: problemas
        });
      });
    }).then(function (res) {
      if (res && res.error) throw res.error;
      stagingImport = null;
      importBusy = false;
      return loadAllData(true);
    }).then(function () {
      selectedMonth = mes;
      if (isActivePage()) render();
    }).catch(function (err) {
      console.warn('Falha ao salvar importação de eficiência:', err);
      importBusy = false;
      var msg = (err && err.message) || 'Falha ao salvar a importação.';
      if (/relation .* does not exist|schema cache/i.test(msg)) {
        msg = 'As tabelas de competência mensal ainda não existem no banco (ou estão desatualizadas). Rode o script database/eficiencia_operacional.sql (versão mais recente, com as seções v2 e v3) no Supabase.';
      }
      lastImportError = msg;
      if (isActivePage()) render();
    });
  }

  // ---------- filtros e agregações ----------
  function mesesDisponiveis() {
    return competencias.map(function (c) { return c.mes; }).sort();
  }
  // Aplica os filtros de modelo/motorista/placa, mas NÃO o de período — usado
  // pelo gráfico de evolução mensal, que precisa olhar todas as competências
  // ao mesmo tempo mesmo quando os outros filtros estão ativos (spec: "Todos
  // os indicadores, rankings e gráficos devem reagir automaticamente aos filtros").
  function aplicarFiltrosSemPeriodo(lista, ignorarMotorista) {
    return lista.filter(function (v) {
      if (filtroModelo && v.modelo !== filtroModelo) return false;
      if (!ignorarMotorista && filtroMotorista && !(v.motoristas || []).some(function (m) { return clean(m.nome) === clean(filtroMotorista); })) return false;
      if (filtroPlaca && v.placa.indexOf(filtroPlaca.toUpperCase()) === -1) return false;
      return true;
    });
  }
  function veiculosFiltrados(ignorarMotorista) {
    var base = selectedMonth ? veiculosMes.filter(function (v) { return v.mes === selectedMonth; }) : veiculosMes;
    return aplicarFiltrosSemPeriodo(base, ignorarMotorista);
  }
  function fleetHero(lista) {
    var distancia = 0, litros = 0, comKml = 0, recalculados = 0;
    lista.forEach(function (v) { if (v.km_l) { distancia += toNum2(v.distancia); litros += toNum2(v.litros); comKml++; if (v.km_l_recalculado) recalculados++; } });
    return { distancia: distancia, litros: litros, kml: litros > 0 ? distancia / litros : null, veiculos: lista.length, comKml: comKml, recalculados: recalculados };
  }
  function toNum2(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
  function rankingPorModelo(lista) {
    var map = new Map();
    lista.forEach(function (v) {
      if (!v.km_l) return;
      var modelo = v.modelo || 'Sem modelo informado';
      if (!map.has(modelo)) map.set(modelo, []);
      map.get(modelo).push(v);
    });
    var out = [];
    map.forEach(function (veics, modelo) {
      var ordenado = veics.slice().sort(function (a, b) { return b.km_l - a.km_l; });
      var media = veics.reduce(function (s, v) { return s + v.km_l; }, 0) / veics.length;
      out.push({ modelo: modelo, veiculos: ordenado, media: media });
    });
    out.sort(function (a, b) { return b.veiculos.length - a.veiculos.length; });
    return out;
  }
  function historicoPorPlaca(placa) {
    return veiculosMes.filter(function (v) { return v.placa === placa; }).slice().sort(function (a, b) { return a.mes.localeCompare(b.mes); });
  }
  function mesAnteriorDe(mes) {
    var todos = mesesDisponiveis();
    var idx = todos.indexOf(mes);
    return idx > 0 ? todos[idx - 1] : null;
  }
  function pontosDeAtencao(lista, ranking) {
    var mediaPorModelo = {};
    ranking.forEach(function (r) { mediaPorModelo[r.modelo] = r.media; });
    var pontos = [];
    lista.forEach(function (v) {
      if (!v.km_l) return;
      var motivos = [];
      var mediaModelo = mediaPorModelo[v.modelo || 'Sem modelo informado'];
      if (mediaModelo && mediaModelo > 0) {
        var diffModelo = ((v.km_l - mediaModelo) / mediaModelo) * 100;
        if (diffModelo <= -10) motivos.push({ tipo: 'modelo', texto: '▼ ' + Math.abs(diffModelo).toFixed(1).replace('.', ',') + '% abaixo da média do modelo' });
      }
      if (v.km_l < cachedMeta) {
        var diffMeta = ((v.km_l - cachedMeta) / cachedMeta) * 100;
        motivos.push({ tipo: 'meta', texto: '▼ ' + Math.abs(diffMeta).toFixed(1).replace('.', ',') + '% abaixo da meta' });
      }
      var mesAnt = mesAnteriorDe(v.mes);
      if (mesAnt) {
        var anterior = veiculosMes.find(function (x) { return x.placa === v.placa && x.mes === mesAnt; });
        if (anterior && anterior.km_l) {
          var diffMes = ((v.km_l - anterior.km_l) / anterior.km_l) * 100;
          if (diffMes <= -8) motivos.push({ tipo: 'mes_anterior', texto: '▼ ' + Math.abs(diffMes).toFixed(1).replace('.', ',') + '% em relação a ' + monthLabel(mesAnt) });
        }
      }
      if (motivos.length) pontos.push({ veiculo: v, motivos: motivos });
    });
    pontos.sort(function (a, b) { return a.veiculo.km_l - b.veiculo.km_l; });
    return pontos;
  }

  // ---------- badges (integração com Veículos e Motoristas) ----------
  function ultimaCompetenciaComDados() {
    return competencias.length ? competencias[0].mes : '';
  }
  function vehicleBadgeHtml(placaValue) {
    try {
      var placa = canonicalPlate(placaValue);
      if (!placa || !veiculosMes.length) return '';
      var registros = historicoPorPlaca(placa);
      if (!registros.length) return '';
      var ultimo = registros[registros.length - 1];
      if (!ultimo.km_l) return '';
      var cls = kmlClass(ultimo.km_l, cachedMeta);
      return ' <span class="tag ' + cls + '" title="Eficiência (KM/L) em ' + esc(monthLabel(ultimo.mes)) + ' — meta ' + fmtNum(cachedMeta, 2) + '">⛽ ' + fmtNum(ultimo.km_l, 1) + ' KM/L</span>';
    } catch (e) { return ''; }
  }
  function driverBadgeHtml(nome) {
    try {
      if (!nome || !veiculosMes.length) return '';
      var alvo = clean(nome);
      // Procura o motorista dentro da lista de motoristas de cada veículo
      // (não existe mais um "motorista principal" por veículo — cada um tem
      // sua própria média individual, já calculada na importação).
      var ultimoMes = '';
      veiculosMes.forEach(function (v) {
        var achou = (v.motoristas || []).some(function (m) { return clean(m.nome) === alvo; });
        if (achou && v.mes > ultimoMes) ultimoMes = v.mes;
      });
      if (!ultimoMes) return '';
      var kmls = [];
      veiculosMes.filter(function (v) { return v.mes === ultimoMes; }).forEach(function (v) {
        var m = (v.motoristas || []).find(function (mm) { return clean(mm.nome) === alvo; });
        if (m && m.km_l) kmls.push(m.km_l);
      });
      if (!kmls.length) return '';
      var media = kmls.reduce(function (s, k) { return s + k; }, 0) / kmls.length;
      return '<div class="person-points-45" style="margin-top:8px"><span>Eficiência média (KM/L) — ' + esc(monthLabel(ultimoMes)) + '</span><strong class="tag-inline">' + fmtNum(media, 1) + '</strong><small>' + (media >= cachedMeta ? 'acima da meta' : 'abaixo da meta') + '</small></div>';
    } catch (e) { return ''; }
  }
  function kmlClass(kml, meta) {
    if (!kml) return 'gray';
    var ratio = meta > 0 ? kml / meta : 0;
    if (ratio >= 1) return 'green';
    if (ratio >= 0.9) return 'amber';
    return 'red';
  }
  // Mini-barra de progresso reutilizada na tabela e no ranking — mesma escala
  // 0..2x-meta do medidor do hero, então a meta cai sempre no meio (50%) em
  // qualquer lugar que essa barra apareça. Leitura consistente no módulo todo.
  function miniBarHtml(kml, meta) {
    var scaleMax = meta > 0 ? meta * 2 : 10;
    var frac = kml ? Math.min(kml / scaleMax, 1) * 100 : 0;
    var cls = kmlClass(kml, meta);
    return '<div class="efi-mini-bar"><div class="efi-mini-bar-fill ' + cls + '" style="width:' + frac.toFixed(1) + '%"></div><div class="efi-mini-bar-meta"></div></div>';
  }

  // ---------- UI: blocos de HTML ----------
  // ---------- medidor tipo "marcador de combustível" (elemento de assinatura do hero) ----------
  // Semicírculo: 0 na ponta esquerda, meta sempre exatamente no topo (12h) —
  // a escala é sempre 2x a meta, então a meta cai sempre no meio do arco.
  // Isso torna a leitura consistente mesmo quando a meta muda.
  function buildGaugeSvg(kml, meta) {
    var scaleMax = meta > 0 ? meta * 2 : 10;
    var frac = kml ? Math.min(kml / scaleMax, 0.999) : 0;
    var cx = 110, cy = 106, r = 82;
    function pt(thetaDeg) {
      var t = thetaDeg * Math.PI / 180;
      return [(cx + r * Math.cos(t)).toFixed(2), (cy - r * Math.sin(t)).toFixed(2)];
    }
    var trackStart = pt(179.9), trackEnd = pt(0.1);
    var trackPath = 'M ' + trackStart.join(',') + ' A ' + r + ',' + r + ' 0 1 1 ' + trackEnd.join(',');
    var valueTheta = Math.min(180 - frac * 180, 179.9);
    var valStart = pt(179.9), valEnd = pt(valueTheta);
    var valuePath = frac > 0.002 ? ('M ' + valStart.join(',') + ' A ' + r + ',' + r + ' 0 0 1 ' + valEnd.join(',')) : '';
    var metaP1 = pt(86), metaP2 = pt(94); // marquinha radial no topo, marcando a meta
    var cls = kmlClass(kml, meta);
    var color = kml === null ? 'var(--muted2)' : (cls === 'green' ? 'var(--green)' : cls === 'amber' ? 'var(--yellow)' : 'var(--red)');
    var lblEnd = pt(0), lblStart = pt(180);
    return '' +
      '<svg class="efi-gauge" viewBox="0 0 220 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Medidor de eficiência da frota">' +
      '  <path d="' + trackPath + '" fill="none" stroke="var(--line2)" stroke-width="15" stroke-linecap="round" />' +
      (valuePath ? '  <path d="' + valuePath + '" fill="none" stroke="' + color + '" stroke-width="15" stroke-linecap="round" />' : '') +
      '  <line x1="' + metaP1[0] + '" y1="' + metaP1[1] + '" x2="' + metaP2[0] + '" y2="' + metaP2[1] + '" stroke="var(--text)" stroke-width="3" stroke-linecap="round" opacity="0.55" />' +
      '  <text x="' + lblStart[0] + '" y="128" text-anchor="middle" class="efi-gauge-scale">0</text>' +
      '  <text x="' + lblEnd[0] + '" y="128" text-anchor="middle" class="efi-gauge-scale">' + fmtNum(scaleMax, 0) + '</text>' +
      '  <text x="110" y="20" text-anchor="middle" class="efi-gauge-scale">meta ' + fmtNum(meta, 1) + '</text>' +
      '  <text x="110" y="98" text-anchor="middle" class="efi-gauge-value" fill="' + color + '">' + (kml === null ? '—' : fmtNum(kml, 2)) + '</text>' +
      '  <text x="110" y="122" text-anchor="middle" class="efi-gauge-unit">KM/L</text>' +
      '</svg>';
  }
  function confiabilidadeAvisoHtml(hero) {
    var recalculados = (hero.recalculados || 0);
    var extra = recalculados > 0
      ? (' Neste período, ' + recalculados + ' veículo(s) precisaram de recálculo automático porque o relatório do CTF trouxe leitura de odômetro inválida.')
      : '';
    return '' +
      '<div class="efi-aviso-confiabilidade">' +
      '  <strong>⚠ Este número é uma média aproximada, não exata.</strong>' +
      '  <p>O sistema CTF (fonte oficial dos dados) tem falhas conhecidas de leitura de odômetro em alguns veículos todo mês, o que torna impossível calcular uma média 100% exata. O sistema corrige automaticamente os erros que consegue identificar com segurança (recalculando a partir dos abastecimentos individuais quando o resumo do próprio relatório vem inconsistente), mas uma margem de imprecisão residual é inevitável enquanto essas falhas do CTF não forem resolvidas na fonte.' + extra + '</p>' +
      '</div>';
  }
  function heroHtml(hero) {
    var acima = hero.kml !== null && hero.kml >= cachedMeta;
    var comparacaoTag = hero.kml === null ? tag('Sem dados suficientes', 'gray') : tag(acima ? '✅ Acima da meta' : '⚠ Abaixo da meta', acima ? 'green' : 'red');
    var metaEditBtn = isAdmin() ? '<button class="icon-btn" id="efiEditMeta" type="button" title="Alterar meta de KM/L">✎ Meta</button>' : '';
    var abaixoCount = veiculosFiltrados().filter(function (v) { return v.km_l && v.km_l < cachedMeta; }).length;
    return '' +
      '<article class="card efi-hero">' +
      '  <div class="efi-hero-top">' +
      '    <div class="efi-hero-gauge-col">' +
      '      <span class="efi-eyebrow">Eficiência média da frota</span>' +
      buildGaugeSvg(hero.kml, cachedMeta) +
      '      <div class="efi-hero-compare">' + comparacaoTag + '</div>' +
      '    </div>' +
      '    <div class="efi-hero-side">' +
      '      <div class="efi-hero-actions">' + metaEditBtn + '</div>' +
      '      <div id="efiMetaEditBox" class="efi-meta-edit" hidden>' +
      '        <label>Nova meta de consumo (KM/L)<input type="number" step="0.01" min="0.1" id="efiMetaInput" value="' + fmtNum(cachedMeta, 2) + '" /></label>' +
      '        <div class="row-actions"><button class="btn primary compact" id="efiSalvarMeta" type="button">Salvar meta</button><button class="btn compact" id="efiCancelarMeta" type="button">Cancelar</button></div>' +
      '        <small class="muted">Ao alterar, todos os indicadores do módulo passam a usar a nova meta automaticamente.</small>' +
      '      </div>' +
      '      <div class="grid stats-grid efi-hero-stats">' +
      '        <article class="stat-card"><span>Veículos no período</span><strong>' + hero.veiculos + '</strong><small>' + hero.comKml + ' com KM/L calculado</small></article>' +
      '        <article class="stat-card"><span>Abaixo da meta</span><strong>' + abaixoCount + '</strong><small>de ' + hero.veiculos + ' veículo(s)</small></article>' +
      '        <article class="stat-card"><span>Distância no período</span><strong>' + fmtNum(hero.distancia, 0) + '</strong><small>km percorridos</small></article>' +
      '        <article class="stat-card"><span>Litros consumidos</span><strong>' + fmtNum(hero.litros, 0) + '</strong><small>litros no período</small></article>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</article>' +
      confiabilidadeAvisoHtml(hero);
  }
  function importBarHtml() {
    var erroHtml = lastImportError ? '<div class="efi-import-feedback error"><b>Não foi possível importar.</b><br/>' + esc(lastImportError) + '</div>' : '';
    return '<div class="module-tools clean-tools efi-import-bar">' +
      '<label class="btn primary efi-import-btn" for="efiFileInput">' + (importBusy ? 'Processando...' : '📥 Importar Relatório Mensal') + '</label>' +
      '<input type="file" id="efiFileInput" accept=".xlsx,.xls,.csv" hidden ' + (importBusy ? 'disabled' : '') + ' />' +
      '<button class="btn" id="efiRefreshBtn" type="button">Atualizar dados</button>' +
      '<span class="muted efi-import-hint">Uma importação por mês — o sistema identifica o período e todos os veículos automaticamente.</span>' +
      '</div>' + erroHtml;
  }
  function filtrosHtml() {
    var meses = mesesDisponiveis();
    var modelos = Array.from(new Set(veiculosMes.map(function (v) { return v.modelo; }).filter(Boolean))).sort();
    var folders = '<button class="folder ' + (!selectedMonth ? 'active' : '') + '" data-mes="">' +
      '<strong>Todas as competências</strong><small>visão geral</small></button>' +
      meses.slice().reverse().map(function (m) {
        return '<button class="folder ' + (selectedMonth === m ? 'active' : '') + '" data-mes="' + esc(m) + '"><strong>' + esc(monthLabel(m)) + '</strong><small>competência</small></button>';
      }).join('');
    var selModelo = '<select class="select" id="efiFiltroModelo"><option value="">Todos os modelos</option>' +
      modelos.map(function (m) { return '<option value="' + esc(m) + '" ' + (filtroModelo === m ? 'selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>';
    var inputPlaca = '<input class="search" id="efiFiltroPlaca" placeholder="Buscar placa..." value="' + esc(filtroPlaca) + '" />';
    var reverterBtn = (selectedMonth && isAdmin())
      ? '<button class="btn danger compact" id="efiReverterImportacao" type="button" style="margin-left:auto">🗑 Reverter Importação de ' + esc(monthLabel(selectedMonth)) + '</button>'
      : '';
    return '<div class="folders" id="efiFolders">' + folders + '</div>' +
      '<div class="module-tools clean-tools" style="margin-top:10px">' + selModelo + inputPlaca + reverterBtn + '</div>';
  }
  // Uma "pasta" por motorista — mesmo padrão visual das pastas de período.
  // Clicar numa pasta filtra a tela inteira pra mostrar só aquele motorista
  // (todos os veículos que ele dirigiu, com os registros e KM/L dele).
  function motoristaFoldersHtml(lista) {
    var porMotorista = new Map();
    lista.forEach(function (v) {
      (v.motoristas || []).forEach(function (m) {
        if (!porMotorista.has(m.nome)) porMotorista.set(m.nome, { registros: 0, veiculos: new Set(), kmls: [] });
        var e = porMotorista.get(m.nome);
        e.registros += m.ocorrencias;
        e.veiculos.add(v.placa);
        if (m.km_l) e.kmls.push(m.km_l);
      });
    });
    var nomes = Array.from(porMotorista.keys()).sort();
    if (!nomes.length) return '';
    var totalBtn = '<button class="folder ' + (!filtroMotorista ? 'active' : '') + '" data-motorista="">' +
      '<strong>Todos os motoristas</strong><small>' + nomes.length + ' motorista(s)</small></button>';
    var botoes = nomes.map(function (nome) {
      var e = porMotorista.get(nome);
      var media = e.kmls.length ? e.kmls.reduce(function (a, b) { return a + b; }, 0) / e.kmls.length : null;
      return '<button class="folder ' + (clean(filtroMotorista) === clean(nome) ? 'active' : '') + '" data-motorista="' + esc(nome) + '">' +
        '<strong>' + esc(nome) + '</strong><small>' + e.registros + ' registro(s) · ' + e.veiculos.size + ' veículo(s)' + (media ? ' · ' + fmtNum(media, 1) + ' KM/L' : '') + '</small></button>';
    }).join('');
    return '<div class="clean-head" style="margin-top:16px"><h3>Motoristas</h3><small>' + nomes.length + '</small></div>' +
      '<div class="folders" id="efiMotoristaFolders">' + totalBtn + botoes + '</div>';
  }
  // Visão focada de UM motorista: só os veículos que ele dirigiu, com o
  // registros e o KM/L dele em cada um — nada de outros motoristas na tela.
  function motoristaFocoHtml(nome, lista) {
    var itens = lista.map(function (v) {
      var m = (v.motoristas || []).find(function (mm) { return clean(mm.nome) === clean(nome); });
      return m ? { v: v, m: m } : null;
    }).filter(Boolean);
    if (!itens.length) return '<div class="clean-empty">Nenhum registro deste motorista neste período/filtro.</div>';
    var totalRegistros = itens.reduce(function (s, x) { return s + x.m.ocorrencias; }, 0);
    var kmls = itens.map(function (x) { return x.m.km_l; }).filter(Boolean);
    var mediaGeral = kmls.length ? kmls.reduce(function (a, b) { return a + b; }, 0) / kmls.length : null;
    var cards = itens.map(function (x) {
      var roteiroAtual = roteiroDe(x.v.placa, nome);
      return '' +
        '<article class="efi-vcard">' +
        '  <div class="efi-vcard-head">' +
        '    <button type="button" class="efi-open-detalhe" data-placa="' + esc(x.v.placa) + '">🚛 <span class="plate">' + esc(x.v.placa) + '</span></button>' +
        '    <span class="muted">Modelo ' + esc(x.v.modelo_grupo || '-') + '</span>' +
        '  </div>' +
        '  <div class="efi-driver-list">' +
        '    <div class="efi-driver-row">' +
        '      <div class="efi-driver-top"><span class="efi-driver-name muted">Nesse veículo</span><span class="efi-driver-kml"><input type="number" step="0.01" min="0" max="30" class="efi-inline-input efi-kml-motorista-input" style="max-width:76px;display:inline-block" value="' + (x.m.km_l != null ? x.m.km_l : '') + '" placeholder="—" data-id="' + x.v.id + '" data-motorista="' + esc(nome) + '" /> <small>KM/L</small>' + (x.m.km_l_editado_manualmente ? ' ' + tag('editado', 'gray') : '') + '</span></div>' +
        '      <div class="efi-driver-bottom">' +
        '        <span class="efi-driver-registros"><strong>' + x.m.ocorrencias + '</strong> registro' + (x.m.ocorrencias === 1 ? '' : 's') + '</span>' +
        '        <input type="text" class="efi-inline-input efi-roteiro-input efi-roteiro-input-mini" placeholder="Roteiro (opcional)" value="' + esc(roteiroAtual) + '" data-placa="' + esc(x.v.placa) + '" data-motorista="' + esc(nome) + '" />' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</article>';
    }).join('');
    var temSemEstimativa = itens.some(function (x) { return !x.m.km_l; });
    var legenda = temSemEstimativa ? '<p class="muted" style="font-size:12px;margin:10px 0 0">* Sem estimativa: menos de dois abastecimentos consecutivos com odômetro/litros consistentes para calcular a distância percorrida por esse motorista.</p>' : '';
    return '' +
      '<article class="card efi-hero" style="margin-bottom:16px">' +
      '  <span class="efi-eyebrow">Motorista</span>' +
      '  <strong class="efi-hero-value" style="font-size:26px">' + esc(nome) + '</strong>' +
      '  <div class="grid stats-grid" style="margin-top:14px">' +
      '    <article class="stat-card"><span>Registros no período</span><strong>' + totalRegistros + '</strong></article>' +
      '    <article class="stat-card"><span>Veículos conduzidos</span><strong>' + itens.length + '</strong></article>' +
      '    <article class="stat-card"><span>Média KM/L (nos veículos dele)</span><strong>' + (mediaGeral ? fmtNum(mediaGeral, 2) : '—') + '</strong></article>' +
      '  </div>' +
      '</article>' +
      '<div class="efi-vcard-grid">' + cards + '</div>' + legenda;
  }
  function medalha(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''; }
  function rankingModeloHtml(ranking) {
    if (!ranking.length) return '<div class="empty">Nenhum veículo com KM/L calculado neste período/filtro.</div>';
    return ranking.map(function (r) {
      var linhas = r.veiculos.map(function (v, i) {
        var comp = v.km_l >= cachedMeta ? tag('acima da meta', 'green') : tag('abaixo da meta', 'red');
        var qtdMotoristas = (v.motoristas || []).length;
        return '<div class="efi-rank-row">' +
          '<span class="efi-rank-medal">' + (medalha(i) || (i + 1) + 'º') + '</span>' +
          '<span class="efi-rank-nome"><span class="plate">' + esc(v.placa) + '</span><small>' + qtdMotoristas + ' motorista' + (qtdMotoristas === 1 ? '' : 's') + '</small></span>' +
          '<span class="efi-rank-valor">' + fmtNum(v.km_l, 2) + ' KM/L</span>' +
          comp +
          '</div>';
      }).join('');
      return '<article class="card efi-modelo-card">' +
        '<div class="efi-modelo-head"><h3>' + esc(r.modelo) + '</h3><span class="muted">Média do modelo: <b>' + fmtNum(r.media, 2) + ' KM/L</b> · Meta: ' + fmtNum(cachedMeta, 2) + '</span></div>' +
        linhas + '</article>';
    }).join('');
  }
  function pontosAtencaoHtml(pontos) {
    if (!pontos.length) return '';
    var cards = pontos.slice(0, 20).map(function (p) {
      var v = p.veiculo;
      var qtdMotoristas = (v.motoristas || []).length;
      return '<article class="clean-record-card">' +
        '<div class="clean-record-main">' +
        '<div class="clean-title-row"><span class="plate">' + esc(v.placa) + '</span><b>' + esc(v.modelo || '') + '</b></div>' +
        '<div class="clean-info-grid">' +
        '<div class="clean-info"><span>Motoristas no período</span><b>' + qtdMotoristas + '</b></div>' +
        '<div class="clean-info"><span>Média KM/L</span><b>' + fmtNum(v.km_l, 2) + '</b></div>' +
        '<div class="clean-info"><span>Competência</span><b>' + esc(monthLabel(v.mes)) + '</b></div>' +
        '</div>' +
        '<div class="clean-desc">' + p.motivos.map(function (m) { return esc(m.texto); }).join(' &nbsp;·&nbsp; ') + '</div>' +
        '</div></article>';
    }).join('');
    return '<section class="clean-panel"><div class="clean-head"><h3>⚠️ Pontos de Atenção</h3><small>' + pontos.length + ' caso(s)</small></div><div class="clean-card-list">' + cards + '</div></section><div style="height:14px"></div>';
  }
  function cardsAgrupadosHtml(lista) {
    if (!lista.length) return '<div class="clean-empty">Nenhum veículo neste período/filtro.</div>';
    var grupos = new Map();
    lista.forEach(function (v) {
      var g = v.modelo_grupo || 'SEM MODELO';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(v);
    });
    var gruposOrdenados = Array.from(grupos.keys()).sort(function (a, b) {
      var na = parseInt(a, 10), nb = parseInt(b, 10);
      var aNum = !isNaN(na) && String(na) === a, bNum = !isNaN(nb) && String(nb) === b;
      if (aNum && bNum) return na - nb;
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    });
    return gruposOrdenados.map(function (grupo) {
      var veics = grupos.get(grupo).slice().sort(function (a, b) { return (b.km_l || 0) - (a.km_l || 0); });
      var cards = veics.map(function (v) {
        var cls = kmlClass(v.km_l, cachedMeta);
        var farol = !v.km_l ? '⚪' : (v.km_l >= cachedMeta ? '🟢' : (cls === 'amber' ? '🟡' : '🔴'));
        var avisos = (v.modelo_divergente ? tag('modelo diverge', 'amber') : '') + (v.naoEncontradoNoCadastro ? tag('não cadastrado', 'red') : '') + (v.modelo_completado_cadastro ? tag('modelo do cadastro', 'gray') : '');
        var qtdMotoristas = (v.motoristas || []).length;
        var resumoMotoristas = qtdMotoristas
          ? '<button type="button" class="efi-open-detalhe" data-placa="' + esc(v.placa) + '">' + qtdMotoristas + ' motorista' + (qtdMotoristas === 1 ? '' : 's') + ' — ver detalhe</button>'
          : '<span class="muted">Nenhum motorista identificado</span>';
        return '' +
          '<article class="efi-vcard">' +
          '  <div class="efi-vcard-head">' +
          '    <button type="button" class="efi-open-detalhe" data-placa="' + esc(v.placa) + '">🚛 <span class="plate">' + esc(v.placa) + '</span></button>' +
          '    <div class="efi-vcard-avisos">' + avisos + '</div>' +
          '  </div>' +
          '  <div class="efi-vcard-kml">' +
          '    <span title="Eficiência do veículo (auditada pelo relatório)">' + farol + '</span>' +
          '    <input type="number" step="0.01" min="0" max="30" class="efi-inline-input efi-kml-input" value="' + (v.km_l != null ? v.km_l : '') + '" placeholder="—" data-id="' + v.id + '" />' +
          '    <span class="muted">KM/L do veículo' + (v.km_l_editado_manualmente ? ' · ' + tag('editado', 'gray') : (v.km_l && !v.km_l_auditado ? ' · <small class="muted">bruta</small>' : '')) + '</span>' +
          miniBarHtml(v.km_l, cachedMeta) +
          '  </div>' +
          '  <div class="efi-vcard-footer">' +
          '    <span class="efi-driver-registros"><strong>' + (v.registros != null ? v.registros : 0) + '</strong> registros no total</span>' +
          '    <span class="efi-vcard-motoristas-resumo">' + resumoMotoristas + '</span>' +
          '  </div>' +
          '</article>';
      }).join('');
      return '<div class="efi-modelo-group">' +
        '<div class="efi-modelo-group-head"><h4>Modelo ' + esc(grupo) + '</h4><span class="muted">' + veics.length + ' veículo(s)</span></div>' +
        '<div class="efi-vcard-grid">' + cards + '</div>' +
        '</div>';
    }).join('');
  }

  // ---------- tela de conferência (antes de gravar no banco) ----------
  function renderStaging() {
    var s = stagingImport;
    var erroSalvarHtml = lastImportError ? '<div class="efi-import-feedback error"><b>Não foi possível confirmar a importação.</b><br/>' + esc(lastImportError) + '</div>' : '';
    var duplicadoBanner = s.jaExiste ? (
      '<div class="efi-import-feedback error">' +
      '<b>Este período já possui uma importação.</b><br/>' +
      esc(monthLabel(s.mes)) + ' — ' + s.jaExiste.veiculos_processados + ' veículo(s) processados anteriormente em ' + fmtDateISO((s.jaExiste.importado_em || '').slice(0, 10)) + '.<br/>' +
      'Escolha abaixo: <b>Adicionar</b> mescla este arquivo com o que já existe (atualiza só os veículos deste arquivo, mantém o resto). <b>Substituir</b> apaga tudo do mês e recoloca só o que está neste arquivo.' +
      '</div>'
    ) : '';
    var problemasHtml = '';
    if (s.resumo.naoEncontrados || s.resumo.divergentes || s.resumo.comErro) {
      var comProblema = s.veiculos.filter(function (v) { return v.naoEncontradoNoCadastro || v.modelo_divergente || v.erro; });
      var cardsProblema = comProblema.map(function (v) {
        var linhas = [];
        if (v.erro) linhas.push(tag(v.erro, 'red'));
        if (v.naoEncontradoNoCadastro) linhas.push(tag('Não encontrado no cadastro de Veículos', 'red'));
        if (v.modelo_divergente) linhas.push(tag('Modelo divergente do cadastro', 'amber'));
        var detalheModelo = v.modelo_divergente ? '<div class="clean-desc">Relatório: "' + esc(v.modelo) + '" · Cadastro: "' + esc(v.modeloCadastro) + '"</div>' : '';
        return '<article class="clean-record-card"><div class="clean-record-main">' +
          '<div class="clean-title-row">⚠ <span class="plate">' + esc(v.placa) + '</span> ' + linhas.join(' ') + '</div>' +
          detalheModelo +
          '</div></article>';
      }).join('');
      problemasHtml = '<section class="clean-panel"><div class="clean-head"><h3>⚠ Pontos que precisam de revisão</h3><small>' + comProblema.length + ' de ' + s.veiculos.length + ' veículo(s)</small></div>' +
        '<div class="clean-card-list">' + cardsProblema + '</div></section><div style="height:14px"></div>';
    }
    var tabela = s.veiculos.slice().sort(function (a, b) { return a.placa.localeCompare(b.placa); }).map(function (v) {
      var motoristasResumo = (v.motoristas || []).map(function (m) { return m.nome + ' (' + m.ocorrencias + ')'; }).join(', ') || 'Nenhum motorista identificado';
      return '<div class="clean-info-grid"><div class="clean-info"><span>' + esc(v.placa) + ' · ' + esc(v.modelo || '-') + '</span><b>' +
        esc(motoristasResumo) + ' — ' + (v.km_l ? fmtNum(v.km_l, 2) + ' KM/L' : 'sem KM/L') +
        '</b></div></div>';
    }).join('');
    var html = '' +
      erroSalvarHtml +
      '<article class="card efi-hero">' +
      '  <span class="efi-eyebrow">Resumo da Importação</span>' +
      '  <strong class="efi-hero-value" style="font-size:28px">' + esc(monthLabel(s.mes)) + '</strong>' +
      '  <div class="efi-hero-compare">Arquivo: <b>' + esc(s.arquivo) + '</b></div>' +
      '  <div class="grid stats-grid" style="margin-top:16px">' +
      '    <article class="stat-card"><span>Veículos encontrados</span><strong>' + s.resumo.encontrados + '</strong></article>' +
      '    <article class="stat-card"><span>Motoristas encontrados</span><strong>' + s.resumo.motoristasDistintos + '</strong></article>' +
      '    <article class="stat-card"><span>Registros de abastecimento</span><strong>' + s.resumo.registrosTotais + '</strong></article>' +
      '    <article class="stat-card"><span>Registros com erro</span><strong>' + s.resumo.comErro + '</strong></article>' +
      '  </div>' +
      '  <div class="efi-hero-compare" style="margin-top:14px">Modelos encontrados: <b>' + esc(s.resumo.modelosDistintos.join(', ')) + '</b></div>' +
      '</article>' +
      duplicadoBanner +
      problemasHtml +
      '<section class="clean-panel"><div class="clean-head"><h3>Veículos identificados</h3><small>' + s.veiculos.length + '</small></div>' +
      '<div style="max-height:420px;overflow:auto">' + tabela + '</div></section>' +
      '<div class="module-tools clean-tools" style="margin-top:14px">' +
      (s.jaExiste
        ? '<button class="btn primary" id="efiConfirmarAdicionar" type="button" ' + (importBusy ? 'disabled' : '') + '>' + (importBusy ? 'Salvando...' : '➕ Adicionar a ' + esc(monthLabel(s.mes))) + '</button>' +
          '<button class="btn danger" id="efiConfirmarSubstituir" type="button" ' + (importBusy ? 'disabled' : '') + '>🗑 Substituir ' + esc(monthLabel(s.mes)) + ' inteiro</button>'
        : '<button class="btn primary" id="efiConfirmarAdicionar" type="button" ' + (importBusy ? 'disabled' : '') + '>' + (importBusy ? 'Salvando...' : 'Confirmar Importação') + '</button>') +
      '<button class="btn" id="efiCancelarImportacao" type="button" ' + (importBusy ? 'disabled' : '') + '>Cancelar</button>' +
      '</div>';
    var root = document.getElementById('pageRoot');
    if (!root) return;
    root.innerHTML = html;
    var confirmarAdicionarBtn = document.getElementById('efiConfirmarAdicionar');
    if (confirmarAdicionarBtn) confirmarAdicionarBtn.addEventListener('click', function () { confirmarImportacao('adicionar'); });
    var confirmarSubstituirBtn = document.getElementById('efiConfirmarSubstituir');
    if (confirmarSubstituirBtn) confirmarSubstituirBtn.addEventListener('click', function () {
      var ok = window.confirm('Isso vai apagar TODOS os veículos já salvos em ' + monthLabel(s.mes) + ' e recolocar só os deste arquivo. Motoristas/veículos de outras importações desse mês que não estiverem neste arquivo serão perdidos.\n\nTem certeza?');
      if (ok) confirmarImportacao('substituir');
    });
    var cancelBtn = document.getElementById('efiCancelarImportacao');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelarStaging);
  }

  // ---------- painel de detalhe de um veículo ----------
  function fecharDetalhe() {
    expandedPlaca = '';
    var overlay = document.getElementById('efiDetalheOverlay');
    if (overlay) overlay.remove();
  }
  function abrirDetalhe(placa) {
    expandedPlaca = placa;
    var historico = historicoPorPlaca(placa);
    if (!historico.length) return;
    var atual = historico[historico.length - 1];
    var ranking = rankingPorModelo(veiculosFiltrados().filter(function (v) { return v.mes === atual.mes; }));
    var doModelo = ranking.find(function (r) { return r.modelo === atual.modelo; });
    var posicao = doModelo ? doModelo.veiculos.findIndex(function (v) { return v.placa === placa; }) + 1 : null;
    var histLinhas = historico.map(function (h) {
      return '<div class="clean-info-grid"><div class="clean-info"><span>' + esc(monthLabel(h.mes)) + '</span><b>' + (h.km_l ? fmtNum(h.km_l, 2) + ' KM/L' : 'sem dados') + '</b></div></div>';
    }).join('');
    var motoristasDoVeiculo = (atual.motoristas || []).slice().sort(function (a, b) { return b.ocorrencias - a.ocorrencias; });
    var avisoMotoristas = '<p class="muted" style="margin:8px 0 10px;font-size:12px">O relatório não separa a média KM/L por motorista — só por veículo (todos que abasteceram aquele caminhão juntos). Por isso, todo motorista começa com a mesma média oficial do veículo, e pode ser corrigido individualmente aqui se você tiver uma informação melhor pra ele.</p>';
    var motoristasHtml = motoristasDoVeiculo.length ? motoristasDoVeiculo.map(function (m) {
      var roteiroAtual = roteiroDe(atual.placa, m.nome);
      return '' +
        '<div class="efi-driver-row">' +
        '  <div class="efi-driver-top">' +
        '    <span class="efi-driver-name">' + esc(m.nome) + '</span>' +
        '    <span class="efi-driver-kml"><input type="number" step="0.01" min="0" max="30" class="efi-inline-input efi-kml-motorista-input" style="max-width:76px;display:inline-block" value="' + (m.km_l != null ? m.km_l : '') + '" placeholder="—" data-id="' + atual.id + '" data-motorista="' + esc(m.nome) + '" /> <small>KM/L</small>' + (m.km_l_editado_manualmente ? ' ' + tag('editado', 'gray') : '') + '</span>' +
        '  </div>' +
        '  <div class="efi-driver-bottom">' +
        '    <span class="efi-driver-registros"><strong>' + m.ocorrencias + '</strong> registro' + (m.ocorrencias === 1 ? '' : 's') + '</span>' +
        '    <input type="text" class="efi-inline-input efi-roteiro-input efi-roteiro-input-mini" placeholder="Roteiro (opcional)" value="' + esc(roteiroAtual) + '" data-placa="' + esc(atual.placa) + '" data-motorista="' + esc(m.nome) + '" />' +
        '  </div>' +
        '</div>';
    }).join('') : '<div class="clean-empty" style="padding:8px 0">Nenhum motorista identificado no relatório.</div>';
    var html = '' +
      '<div class="efi-overlay-backdrop" id="efiDetalheOverlay">' +
      '  <div class="efi-overlay-panel">' +
      '    <div class="efi-overlay-head"><h3>' + esc(atual.placa) + ' · ' + esc(atual.modelo || '-') + '</h3><button class="icon-btn" id="efiFecharDetalhe" type="button">✕</button></div>' +
      '    <div class="clean-info-grid">' +
      '      <div class="clean-info"><span>Período</span><b>' + esc(monthLabel(atual.mes)) + '</b></div>' +
      '      <div class="clean-info"><span>Motoristas no período</span><b>' + motoristasDoVeiculo.length + '</b></div>' +
      '      <div class="clean-info"><span>KM/L do veículo (auditado pelo relatório)</span><b><input type="number" step="0.01" min="0" max="30" class="efi-inline-input efi-kml-input" style="max-width:90px" value="' + (atual.km_l != null ? atual.km_l : '') + '" placeholder="—" data-id="' + atual.id + '" /></b></div>' +
      '      <div class="clean-info"><span>Total de registros</span><b><input type="number" min="0" class="efi-inline-input efi-registros-input" style="max-width:80px" value="' + (atual.registros != null ? atual.registros : 0) + '" data-id="' + atual.id + '" /></b></div>' +
      '      <div class="clean-info"><span>Meta</span><b>' + fmtNum(cachedMeta, 2) + ' KM/L</b></div>' +
      '      <div class="clean-info"><span>Diferença da meta</span><b>' + (atual.km_l ? (atual.km_l >= cachedMeta ? '+' : '') + fmtNum(atual.km_l - cachedMeta, 2) + ' KM/L' : '—') + '</b></div>' +
      '      <div class="clean-info"><span>Média do modelo</span><b>' + (doModelo ? fmtNum(doModelo.media, 2) + ' KM/L' : '—') + '</b></div>' +
      '      <div class="clean-info"><span>Posição no modelo</span><b>' + (posicao ? posicao + 'º de ' + doModelo.veiculos.length : '—') + '</b></div>' +
      '    </div>' +
      '    <h4 style="margin:18px 0 4px">Motoristas e registros individuais</h4>' + avisoMotoristas +
      '    <div class="efi-driver-list">' + motoristasHtml + '</div>' +
      '    <h4 style="margin:18px 0 8px">Histórico mensal</h4>' + histLinhas +
      '  </div>' +
      '</div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
    var overlay = document.getElementById('efiDetalheOverlay');
    if (overlay) overlay.addEventListener('click', function (ev) { if (ev.target === overlay) fecharDetalhe(); });
    var closeBtn = document.getElementById('efiFecharDetalhe');
    if (closeBtn) closeBtn.addEventListener('click', fecharDetalhe);
    bindDynamicInputs(overlay);
  }

  // ---------- gráficos ----------
  function destroyCharts() {
    Object.keys(chartInstances).forEach(function (k) { try { chartInstances[k].destroy(); } catch (e) {} });
    chartInstances = {};
  }
  function drawCharts(lista, ranking) {
    destroyCharts();
    if (typeof window.Chart === 'undefined') return;
    var GRID = 'rgba(255,255,255,.08)', TXT = '#b5afa3', YELLOW = '#ffb400', GREEN = '#32d074', RED = '#d83933';
    var scalesTxt = { x: { ticks: { color: TXT }, grid: { color: GRID } }, y: { ticks: { color: TXT }, grid: { color: GRID } } };

    var elEvolucao = document.getElementById('efiChartEvolucao');
    if (elEvolucao) {
      var meses = mesesDisponiveis();
      var comFiltros = aplicarFiltrosSemPeriodo(veiculosMes);
      var porMes = meses.map(function (m) {
        var doMes = comFiltros.filter(function (v) { return v.mes === m && v.km_l; });
        var d = doMes.reduce(function (s, v) { return s + toNum2(v.distancia); }, 0);
        var l = doMes.reduce(function (s, v) { return s + toNum2(v.litros); }, 0);
        return l > 0 ? d / l : null;
      });
      var temFiltroAtivo = filtroModelo || filtroMotorista || filtroPlaca;
      chartInstances.evolucao = new window.Chart(elEvolucao, {
        type: 'line',
        data: { labels: meses.map(monthLabel), datasets: [
          { label: temFiltroAtivo ? 'KM/L (filtro aplicado)' : 'KM/L da frota', data: porMes, borderColor: YELLOW, backgroundColor: 'rgba(255,180,0,.18)', tension: .3, fill: true },
          { label: 'Meta', data: meses.map(function () { return cachedMeta; }), borderColor: GREEN, borderDash: [6, 4], pointRadius: 0 }
        ] },
        options: { responsive: true, plugins: { legend: { labels: { color: TXT } } }, scales: scalesTxt }
      });
    }
    var elModelos = document.getElementById('efiChartModelos');
    if (elModelos) {
      var top = ranking.slice(0, 10);
      chartInstances.modelos = new window.Chart(elModelos, {
        type: 'bar',
        data: { labels: top.map(function (r) { return r.modelo; }), datasets: [{ label: 'Média KM/L', data: top.map(function (r) { return r.media; }), backgroundColor: top.map(function (r) { return r.media >= cachedMeta ? GREEN : RED; }) }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: scalesTxt }
      });
    }
    var selectModelo = document.getElementById('efiChartMotoristasModelo');
    var elMotoristas = document.getElementById('efiChartMotoristas');
    if (elMotoristas && ranking.length) {
      var modeloEscolhido = (selectModelo && selectModelo.value) || ranking[0].modelo;
      var r = ranking.find(function (x) { return x.modelo === modeloEscolhido; }) || ranking[0];
      chartInstances.motoristas = new window.Chart(elMotoristas, {
        type: 'bar',
        data: { labels: r.veiculos.map(function (v) { return v.placa; }), datasets: [
          { label: 'KM/L', data: r.veiculos.map(function (v) { return v.km_l; }), backgroundColor: r.veiculos.map(function (v) { return v.km_l >= cachedMeta ? GREEN : RED; }) }
        ] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: scalesTxt }
      });
    }
  }

  // ---------- render principal ----------
  function render() {
    try { renderInner(); } catch (e) {
      console.error('Eficiência: erro ao renderizar o módulo.', e);
      var root = document.getElementById('pageRoot');
      if (root) root.innerHTML = '<div class="empty">Ocorreu um erro ao carregar o módulo de Eficiência Operacional. Veja o console (F12) para detalhes, ou clique em "Atualizar dados".</div>' +
        '<div class="module-tools clean-tools"><button class="btn" id="efiRefreshBtn" type="button">Atualizar dados</button></div>';
      var btn = document.getElementById('efiRefreshBtn');
      if (btn) btn.addEventListener('click', refreshAppData);
    }
  }
  function renderInner() {
    if (!metaBootAttempted) {
      metaBootAttempted = true;
      ensureMetaLoaded().then(function () { if (isActivePage()) render(); });
    }
    if (!dataLoaded) {
      loadAllData().then(function () { if (isActivePage()) render(); });
    }

    if (stagingImport) { renderStaging(); return; }

    var root = document.getElementById('pageRoot');
    if (!root) return;

    if (!competencias.length) {
      root.innerHTML = importBarHtml() +
        '<div class="empty">Nenhuma competência importada ainda. Clique em <b>Importar Relatório Mensal</b> para carregar o relatório "Abastecimentos Por Veículo" do mês e gerar a análise automaticamente.</div>';
      bindEvents();
      return;
    }

    var lista = veiculosFiltrados();
    var listaTodosMotoristas = veiculosFiltrados(true); // ignora o filtro de motorista, só pra montar as pastas

    var html = '';
    html += importBarHtml();
    html += filtrosHtml();
    html += motoristaFoldersHtml(listaTodosMotoristas);

    if (filtroMotorista) {
      html += motoristaFocoHtml(filtroMotorista, lista);
      root.innerHTML = html;
      bindEvents();
      return;
    }

    var hero = fleetHero(lista);
    var ranking = rankingPorModelo(lista);
    var pontos = pontosDeAtencao(lista, ranking);

    html += heroHtml(hero);
    html += pontosAtencaoHtml(pontos);
    html += '<div class="grid cards-2">' +
      '<article class="card"><h3>Evolução da média KM/L por mês</h3><canvas id="efiChartEvolucao" height="220"></canvas></article>' +
      '<article class="card"><h3>Média por modelo</h3><canvas id="efiChartModelos" height="220"></canvas></article>' +
      '</div><div style="height:14px"></div>';
    var modeloOptions = ranking.map(function (r) { return '<option value="' + esc(r.modelo) + '">' + esc(r.modelo) + ' (' + r.veiculos.length + ')</option>'; }).join('');
    html += '<article class="card">' +
      '<div class="clean-head" style="padding:0 0 10px"><h3>Veículos por modelo</h3>' +
      (ranking.length > 1 ? '<select class="select" id="efiChartMotoristasModelo">' + modeloOptions + '</select>' : '') +
      '</div><canvas id="efiChartMotoristas" height="220"></canvas></article><div style="height:14px"></div>';
    var muitosModelos = ranking.length > 6;
    html += '<section class="clean-panel"><div class="clean-head"><h3>Comparação por Modelo</h3><small>' + ranking.length + ' modelo(s)' + (muitosModelos ? ' — role para ver todos' : '') + '</small></div>' +
      '<div' + (muitosModelos ? ' style="max-height:640px;overflow:auto;padding-right:4px"' : '') + '>' + rankingModeloHtml(ranking) + '</div></section>';
    html += '<div style="height:14px"></div>';
    html += '<section class="clean-panel"><div class="clean-head"><h3>Veículos por Modelo</h3><small>' + lista.length + ' veículo(s)</small></div>' + cardsAgrupadosHtml(lista) + '</section>';

    root.innerHTML = html;
    bindEvents();
    drawCharts(lista, ranking);
  }

  function bindEvents() {
    var fileInput = document.getElementById('efiFileInput');
    if (fileInput) fileInput.addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      handleFileSelected(file);
      ev.target.value = '';
    });
    var refreshBtn = document.getElementById('efiRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      ensureMetaLoaded(true);
      loadAllData(true).then(function () { if (isActivePage()) render(); });
    });

    var editBtn = document.getElementById('efiEditMeta');
    var editBox = document.getElementById('efiMetaEditBox');
    if (editBtn && editBox) editBtn.addEventListener('click', function () { editBox.hidden = !editBox.hidden; });
    var salvarBtn = document.getElementById('efiSalvarMeta');
    if (salvarBtn) salvarBtn.addEventListener('click', function () {
      var input = document.getElementById('efiMetaInput');
      var val = N(input && input.value);
      if (val <= 0) { toast('Informe uma meta válida.'); return; }
      salvarBtn.disabled = true;
      saveConfig(val).then(function () { if (isActivePage()) render(); }).catch(function (e) {
        toast('Não foi possível salvar a meta. A tabela eficiencia_config existe no banco?');
        console.warn(e);
        salvarBtn.disabled = false;
      });
    });
    var cancelarBtn = document.getElementById('efiCancelarMeta');
    if (cancelarBtn) cancelarBtn.addEventListener('click', function () { if (editBox) editBox.hidden = true; });

    var folders = document.getElementById('efiFolders');
    if (folders) folders.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.folder');
      if (!btn) return;
      selectedMonth = btn.dataset.mes || '';
      render();
    });
    var motoristaFolders = document.getElementById('efiMotoristaFolders');
    if (motoristaFolders) motoristaFolders.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.folder');
      if (!btn) return;
      filtroMotorista = btn.dataset.motorista || '';
      render();
    });
    var selModelo = document.getElementById('efiFiltroModelo');
    if (selModelo) selModelo.addEventListener('change', function () { filtroModelo = selModelo.value; render(); });
    var inputPlaca = document.getElementById('efiFiltroPlaca');
    if (inputPlaca) inputPlaca.addEventListener('input', function () {
      filtroPlaca = inputPlaca.value;
      var cursorPos = inputPlaca.selectionStart;
      render();
      // render() reconstrói a tela inteira (inclusive esse input), então sem
      // isso o campo perderia o foco a cada letra digitada — o usuário teria
      // que clicar de novo pra continuar digitando.
      var novoInput = document.getElementById('efiFiltroPlaca');
      if (novoInput) {
        novoInput.focus();
        try { novoInput.setSelectionRange(cursorPos, cursorPos); } catch (e) {}
      }
    });
    var reverterBtn = document.getElementById('efiReverterImportacao');
    if (reverterBtn) reverterBtn.addEventListener('click', function () { reverterImportacao(selectedMonth); });

    var chartModeloSel = document.getElementById('efiChartMotoristasModelo');
    if (chartModeloSel) chartModeloSel.addEventListener('change', function () {
      var lista = veiculosFiltrados();
      drawCharts(lista, rankingPorModelo(lista));
    });

    document.querySelectorAll('.efi-open-detalhe').forEach(function (btn) {
      btn.addEventListener('click', function () { abrirDetalhe(btn.dataset.placa); });
    });
    bindDynamicInputs(document);
  }
  // Liga os eventos dos inputs editáveis (KM/L, registros, roteiro) dentro de
  // um container qualquer — usado tanto no render principal quanto no painel
  // de detalhe (que é criado depois, direto no body, fora do fluxo normal).
  function bindDynamicInputs(container) {
    container.querySelectorAll('.efi-registros-input').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.dataset.id);
        var val = Math.max(0, Math.round(N(input.value)));
        input.value = val;
        salvarRegistros(id, val).catch(function (e) {
          toast('Não foi possível salvar a quantidade de registros.');
          console.warn(e);
        });
      });
    });
    container.querySelectorAll('.efi-kml-input').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.dataset.id);
        var val = N(input.value);
        if (val <= 0) { toast('Informe um KM/L válido, maior que zero.'); return; }
        if (val > 30) { toast('Esse valor parece implausível para um caminhão (acima de 30 KM/L). Confira antes de salvar.'); return; }
        input.disabled = true;
        salvarKmL(id, val).then(function () {
          if (isActivePage()) render();
        }).catch(function (e) {
          toast('Não foi possível salvar o KM/L.');
          console.warn(e);
          input.disabled = false;
        });
      });
    });
    container.querySelectorAll('.efi-kml-motorista-input').forEach(function (input) {
      input.addEventListener('change', function () {
        var id = Number(input.dataset.id);
        var motorista = input.dataset.motorista;
        var val = N(input.value);
        if (val <= 0) { toast('Informe um KM/L válido, maior que zero.'); return; }
        if (val > 30) { toast('Esse valor parece implausível para um caminhão (acima de 30 KM/L). Confira antes de salvar.'); return; }
        input.disabled = true;
        salvarKmLMotorista(id, motorista, val).then(function () {
          if (isActivePage()) render();
        }).catch(function (e) {
          toast('Não foi possível salvar o KM/L desse motorista.');
          console.warn(e);
          input.disabled = false;
        });
      });
    });
    container.querySelectorAll('.efi-roteiro-input').forEach(function (input) {
      input.addEventListener('change', function () {
        var placa = input.dataset.placa, motorista = input.dataset.motorista;
        salvarRoteiro(placa, motorista, input.value).catch(function (e) {
          toast('Não foi possível salvar o roteiro. A tabela eficiencia_roteiros existe no banco (rode a v3 do SQL)?');
          console.warn(e);
        });
      });
    });
  }

  // Tenta carregar a meta e os dados assim que o script sobe, para os badges
  // (Veículos e Motoristas) já funcionarem mesmo antes do usuário abrir a
  // página de Eficiência. Nunca lança erro — se falhar, tenta de novo (uma
  // única vez) quando a página for aberta.
  ensureMetaLoaded();
  loadAllData();

  window.EficienciaFrota = {
    render: render,
    vehicleBadgeHtml: vehicleBadgeHtml,
    driverBadgeHtml: driverBadgeHtml
  };
})();
