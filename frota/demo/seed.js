/* Dados fictícios da demo — Sistema de Gestão de Frota */
window.DEMO_NS = 'frota';
window.DEMO_NUMERIC_IDS = true;
window.DEMO_USER = { id: 'demo-user-0001', email: 'gestor@frota.demo', nome: 'Gestor de Frota (Demo)' };
window.DEMO_PK = { eficiencia_competencias: 'mes', eficiencia_config: 'id', manutencoes_meses: 'mes', producao_meses: 'mes' };
window.DEMO_FILE_URL = function (bucket, path) {
  if (bucket === 'checklists') return 'demo/checklist-demo.webm';
  var p = String(path || '').toLowerCase();
  if (/\.(mp4|webm|mov)$/.test(p)) return 'demo/checklist-demo.webm';
  if (/\.pdf$/.test(p)) return 'demo/documento-demo.pdf';
  if (/avaria|sinistro|para-choque|lateral/.test(p)) return 'demo/fotos/avaria.jpg';
  if (/pneu/.test(p)) return 'demo/fotos/pneu.jpg';
  return null;
};

(function () {
  var D = window.DemoData;
  var MODELOS = [
    ['VW Delivery 9.170', 2021], ['VW Delivery 11.180', 2022], ['Mercedes-Benz Accelo 1016', 2020], ['Ford Cargo 1119', 2019],
    ['Iveco Tector 11-190', 2022], ['VW Constellation 24.280', 2021], ['Mercedes-Benz Atego 1719', 2023]
  ];
  var KML = { '9.170': 6.1, '11.180': 5.6, '1016': 5.9, '1119': 5.2, '11-190': 5.4, '24.280': 3.6, '1719': 4.4 };
  function grupo(m) { var x = String(m).match(/\d{1,2}[.-]\d{2,3}|\d{3,4}/); return x ? x[0] : m; }
  var WD = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
  var RESP = ['Carlos', 'Marcos', 'Rafael', 'Bruno', 'Luiz', 'Equipe'];
  var FORNEC = ['Oficina Exemplo Diesel', 'Auto Peças Modelo', 'Pneus & Cia Demo', 'Elétrica Diesel Fictícia', 'Interna'];

  window.DEMO_SEED = function () {
    D.reseed(55);
    var veiculos = [], motoristas = [];
    for (var m = 0; m < 22; m++) {
      var st = m === 20 ? 'inativo' : 'ativo';
      motoristas.push({ id: m + 1, nome: D.person().toUpperCase(), cpf: D.cpfFake(), cnh: '000' + D.int(10000000, 99999999), categoria: m % 3 === 0 ? 'E' : 'D', validade: D.day(D.int(-20, 900)), funcao: m < 18 ? 'MOTORISTA DE CAMINHÃO' : 'AJUDANTE DE ENTREGA', departamento: 'DISTRIBUIÇÃO', primeiro_dia: D.day(-D.int(120, 1500)), status: st, obs: '', pontos: 0, created_at: D.ts(-300, 9), updated_at: D.ts(-30, 9) });
    }
    for (var v = 0; v < 18; v++) {
      var mod = MODELOS[v % MODELOS.length];
      veiculos.push({ id: v + 1, placa: D.plate(), modelo: mod[0], ano: mod[1], renavam: '0' + D.int(1000000000, 9999999999), motorista: motoristas[v].nome, status: v === 4 ? 'manutencao' : 'ativo', motivo: v === 4 ? 'Aguardando peça do sistema de freio' : '', obs: '', created_at: D.ts(-300, 9), updated_at: D.ts(-5, 9) });
    }
    // veículos leves (ignorados no cálculo de KM/L)
    ['LEV1A11', 'LEV2B22'].forEach(function (p, i) { veiculos.push({ id: 19 + i, placa: p, modelo: 'Fiat Fiorino', ano: 2022, renavam: '0' + D.int(1000000000, 9999999999), motorista: '', status: 'ativo', motivo: '', obs: 'Veículo de apoio', created_at: D.ts(-300, 9), updated_at: D.ts(-30, 9) }); });
    var trucks = veiculos.slice(0, 18);

    // ---------- multas e pontos ----------
    var INFR = [
      ['Transitar em velocidade superior à máxima permitida em até 20%', 'Média', 130.16, 4],
      ['Avançar o sinal vermelho do semáforo', 'Gravíssima', 293.47, 7],
      ['Estacionar em local proibido pela sinalização', 'Média', 195.23, 4],
      ['Transitar em faixa exclusiva de ônibus', 'Gravíssima', 293.47, 7],
      ['Dirigir utilizando telefone celular', 'Gravíssima', 293.47, 7],
      ['Deixar de usar cinto de segurança', 'Grave', 195.23, 5],
      ['Transitar em horário/local de restrição para caminhões', 'Média', 130.16, 4]
    ];
    var ORG = ['DETRAN-RJ', 'Prefeitura do Rio (CET-RIO)', 'PRF', 'Prefeitura de Niterói'];
    var LOC = ['Av. Brasil, km 25', 'Linha Amarela, sentido Barra', 'Rod. Presidente Dutra, km 180', 'Av. das Américas, 5000', 'Rua Exemplo, 120 — Centro'];
    var STM = ['pago', 'pago', 'aceito', 'aguardando_aceite', 'aguardando_assinatura', 'recorrendo', 'pendente', 'pago', 'recorrida'];
    var multas = [], pontos = [];
    for (var i = 0; i < 26; i++) {
      var inf = INFR[i % INFR.length], vv = trucks[D.int(0, 17)], off = -D.int(3, 160), stt = off > -20 ? D.pick(['pendente', 'aguardando_aceite', 'aguardando_assinatura']) : (off > -45 ? D.pick(['aceito', 'recorrendo', 'pago']) : D.pick(['pago', 'pago', 'recorrida', 'sem_necessidade', 'pago']));
      var mot = motoristas[vv.id - 1].nome;
      multas.push({ id: i + 1, placa: vv.placa, motorista: mot, auto: 'E0' + D.int(1000000, 9999999), orgao: D.pick(ORG), data: D.day(off), hora: D.pad(D.int(6, 19)) + ':' + D.pad(D.int(0, 59)), municipio: D.pick(['Rio de Janeiro', 'Duque de Caxias', 'Niterói', 'Nova Iguaçu']), local: D.pick(LOC), infracao: inf[0], gravidade: inf[1], valor: inf[2], tipo_pagamento: stt === 'pago' && D.chance(0.4) ? 'desconto20' : 'normal', status: stt, prioridade: i === 2 || i === 9, prazo_aceite: D.day(off + 30), envio_rca: stt !== 'pendente' ? D.day(off + 5) : null, prazo_recurso: D.day(off + 40), obs: stt === 'recorrendo' ? 'Recurso protocolado — aguardando julgamento.' : '', created_at: D.ts(off + 3, 10), updated_at: D.ts(off + 6, 10) });
      if (['pago', 'aceito', 'recorrida'].indexOf(stt) >= 0 || D.chance(0.3)) pontos.push({ id: pontos.length + 1, multa_id: i + 1, motorista: mot, data: D.day(off), placa: vv.placa, auto: multas[i].auto, gravidade: inf[1], pontos: inf[3], aceitou: stt === 'aceito' || stt === 'pago' ? 'SIM' : 'Pendente', motivo: inf[0], created_at: D.ts(off + 6, 10) });
    }

    // ---------- óleo e tacógrafos ----------
    var oleo = trucks.map(function (t, k) {
      var off = k === 5 ? -98 : (k === 11 ? -75 : -D.int(5, 62)), km = D.int(60000, 380000);
      return { id: k + 1, tipo: 'Motor', placa: t.placa, modelo: t.modelo, data_ultima_troca: D.day(off), km_ultima_vistoria: km + D.int(1000, 9000), km_proxima_troca: km + 15000, km_faltando: 15000 - D.int(1000, 14000), obs: '', created_at: D.ts(off, 10) };
    });
    var taco = trucks.map(function (t, k) {
      var off = -D.int(30, 700);
      var val = k === 3 ? -6 : (k === 7 ? 18 : off + 730);
      return { id: k + 1, placa: t.placa, data_emissao: D.day(val - 730), data_validade: D.day(val), status: val < 0 ? 'vencido' : 'ativo', obs: k === 3 ? 'Agendar aferição no INMETRO' : '', created_at: D.ts(-200, 10) };
    });

    // ---------- manutenções ----------
    var SERV = [['Troca de pastilhas de freio', 'Freio', 680, 1450], ['Revisão preventiva 30.000 km', 'Revisão', 1200, 2800], ['Troca de pneus dianteiros', 'Pneu', 2400, 4200], ['Alinhamento e balanceamento', 'Suspensão', 180, 320], ['Troca de bateria', 'Elétrica', 650, 980], ['Reparo no sistema de arrefecimento', 'Motor', 900, 2300], ['Substituição de lâmpadas e lanternas', 'Elétrica', 90, 260], ['Troca de embreagem', 'Transmissão', 3200, 5400]];
    var manut = [], meses = {};
    for (var k2 = 0; k2 < 70; k2++) {
      var sv = SERV[D.int(0, SERV.length - 1)], t2 = trucks[D.int(0, 17)], off2 = -D.int(0, 150);
      var dstr = D.day(off2); meses[dstr.slice(0, 7)] = 1;
      manut.push({ id: k2 + 1, data: dstr, mes: dstr.slice(0, 7), placa: t2.placa, servico: sv[0], tipo: sv[1], origem: D.pick(FORNEC), valor: D.money(sv[2], sv[3]), validade: sv[1] === 'Pneu' || sv[1] === 'Elétrica' ? D.day(off2 + 365) : null, status: off2 > -5 ? D.pick(['pendente', 'em andamento']) : 'concluido', descricao: sv[0] + ' — veículo ' + t2.modelo + '.', created_at: D.ts(off2, 11) });
    }
    var manutMeses = Object.keys(meses).sort().reverse().map(function (x) { return { mes: x }; });

    // ---------- produção do dia (segunda a sábado) ----------
    var prod = [], pmeses = {};
    var PSERV = ['Troca de lâmpada de freio', 'Verificação de vazamento de ar', 'Calibragem de pneus', 'Reaperto de rodas', 'Lubrificação do chassi', 'Troca de palheta do limpador', 'Ajuste de freio de estacionamento', 'Atendimento a chamado do motorista', 'Lavagem do baú', 'Troca de filtro de ar'];
    for (var d = -45; d <= 0; d++) {
      var dt = D.dateOffset(d); if (dt.getDay() === 0) continue;
      var n = D.int(2, 5);
      for (var j = 0; j < n; j++) {
        var ds = D.iso(dt); pmeses[ds.slice(0, 7)] = 1;
        prod.push({ id: prod.length + 1, dia_semana: WD[dt.getDay()], data: ds, mes: ds.slice(0, 7), placa: trucks[D.int(0, 17)].placa, servico: D.pick(PSERV), responsaveis: D.pick(RESP), obs: '', created_at: D.ts(d, 9 + j) });
      }
    }
    var prodMeses = Object.keys(pmeses).sort().reverse().map(function (x) { return { mes: x }; });

    // ---------- chamados (QR Code) ----------
    var CH = [['freios', 'alta', 'Freio puxando para a direita ao frear em descida.'], ['pneus', 'medio', 'Pneu traseiro esquerdo perdendo pressão.'], ['eletrica', 'leve', 'Luz de ré queimada.'], ['mecanica', 'urgente', 'Motor perdendo força e fumaça escura no escapamento.'], ['lataria', 'medio', 'Para-choque traseiro amassado após manobra no cliente.'], ['documento', 'leve', 'CRLV do veículo não está no porta-documentos.'], ['mecanica', 'alta', 'Barulho metálico na suspensão dianteira.'], ['eletrica', 'medio', 'Painel acendendo luz de bateria.'], ['outro', 'leve', 'Ar-condicionado da cabine sem gelar.']];
    var chamados = CH.map(function (c, i) {
      var t3 = trucks[(i * 5) % 18], off3 = -i * 3, st3 = i < 2 ? 'aberto' : i < 4 ? 'em_manutencao' : i < 5 ? 'em_analise' : 'resolvido';
      var cri = D.ts(off3, 7 + (i % 5));
      var hist = [{ status: 'aberto', criado_em: cri, observacao: 'Chamado aberto pelo motorista via QR Code' }];
      if (st3 !== 'aberto') hist.push({ status: 'em_analise', criado_em: D.ts(off3, 13), observacao: '' });
      if (st3 === 'em_manutencao' || st3 === 'resolvido') hist.push({ status: 'em_manutencao', criado_em: D.ts(off3 + 1, 9), observacao: 'Encaminhado para a oficina' });
      if (st3 === 'resolvido') hist.push({ status: 'resolvido', criado_em: D.ts(off3 + 2, 16), observacao: '' });
      return { id: i + 1, placa: t3.placa, modelo: t3.modelo, motorista_nome: motoristas[t3.id - 1].nome, categoria: c[0], status: st3, prioridade: c[1], descricao: c[2], observacao_interna: st3 !== 'aberto' ? 'Verificado pela equipe de frota.' : '', solucao: st3 === 'resolvido' ? 'Serviço executado e veículo liberado.' : '', foto_url: c[0] === 'lataria' ? 'demo/fotos/avaria.jpg' : (c[0] === 'pneus' ? 'demo/fotos/pneu.jpg' : null), historico: hist, created_at: cri, updated_at: hist[hist.length - 1].criado_em };
    });

    // ---------- checklists em vídeo ----------
    var checklists = [];
    for (var c2 = 0; c2 < 28; c2++) {
      var off4 = -Math.floor(c2 / 3), t4 = trucks[(c2 * 7) % 18], ini = D.ts(off4, D.int(15, 19));
      checklists.push({ id: c2 + 1, placa: t4.placa, responsavel: D.pick(['Carlos', 'Luiz', 'Rafael', 'Marcos', 'Bruno']), hora_inicio: ini, criado_em: ini, data: ini.slice(0, 10), duracao_segundos: D.int(45, 140), nome_arquivo: t4.placa + '_' + ini.slice(0, 10) + '.mp4', status_upload: 'enviado', storage_path: 'demo/' + t4.placa + '_' + c2 + '.mp4' });
    }

    // ---------- BRAT e sinistros ----------
    var brats = [
      { titulo: 'Colisão traseira em via urbana', tipo: 'Colisão', status: 'em_analise', desc: 'Veículo atingido na traseira durante parada em semáforo. Terceiro assumiu responsabilidade.' },
      { titulo: 'Avaria em portão do cliente', tipo: 'Avaria em terceiro', status: 'concluido', desc: 'Baú encostou no portão durante manobra de ré no cliente.' },
      { titulo: 'Furto de estepe', tipo: 'Furto', status: 'aguardando_docs', desc: 'Estepe furtado durante pernoite em pátio externo.' },
      { titulo: 'Tombamento de carga', tipo: 'Carga', status: 'concluido', desc: 'Carga deslocou em curva; parte das caixas avariadas.' }
    ].map(function (b, i) { var t5 = trucks[i * 4 + 1], off5 = -D.int(10, 120); return { id: i + 1, titulo: b.titulo, data: D.day(off5), placa: t5.placa, motorista: motoristas[t5.id - 1].nome, numero_brat: 'RJ' + D.int(1000000, 9999999), tipo: b.tipo, status: b.status, local: D.pick(LOC), descricao: b.desc, obs: '', qtd_arquivos: 2, created_at: D.ts(off5, 15) }; });
    var bratArq = [];
    brats.forEach(function (b) {
      bratArq.push({ id: bratArq.length + 1, brat_id: b.id, nome_original: 'foto-avaria-' + b.id + '.jpg', nome: 'foto-avaria-' + b.id + '.jpg', storage_path: 'brat/' + b.id + '/avaria.jpg', mime_type: 'image/jpeg', tamanho: 180000, categoria: 'foto', created_at: b.created_at });
      bratArq.push({ id: bratArq.length + 1, brat_id: b.id, nome_original: 'boletim-' + b.id + '.pdf', nome: 'boletim-' + b.id + '.pdf', storage_path: 'brat/' + b.id + '/boletim.pdf', mime_type: 'application/pdf', tamanho: 95000, categoria: 'pdf', created_at: b.created_at });
    });
    var sin = [
      ['Avaria', 'Lateral do baú riscada em poste', 'Motorista', 1850, 'em_reparo'], ['Sinistro', 'Colisão com veículo de passeio em cruzamento', 'Terceiro', 7400, 'acionado_seguro'],
      ['Avaria', 'Retrovisor direito quebrado', 'Motorista', 420, 'concluido'], ['Avaria', 'Para-choque dianteiro amassado', 'Em análise', 1200, 'orcamento'],
      ['Sinistro', 'Pedra no para-brisa na rodovia', 'Sem culpa', 980, 'concluido'], ['Avaria', 'Porta do baú desalinhada', 'Compartilhada', 650, 'pendente']
    ].map(function (s, i) { var t6 = trucks[(i * 3 + 2) % 18], off6 = -D.int(3, 100); return { id: i + 1, data: D.day(off6), placa: t6.placa, motorista: motoristas[t6.id - 1].nome, tipo: s[0], status: s[4], avaria: s[1], local: D.pick(LOC), responsabilidade: s[2], valor: s[3], data_previsao: s[4] === 'concluido' ? null : D.day(D.int(3, 20)), numero_sinistro: s[0] === 'Sinistro' ? 'SIN-' + D.int(100000, 999999) : '', seguradora: s[0] === 'Sinistro' ? 'Seguradora Exemplo' : '', houve_terceiro: s[0] === 'Sinistro', anexo: '', obs: '', created_at: D.ts(off6, 16) }; });
    var sinArq = [];
    sin.forEach(function (s) {
      sinArq.push({ id: sinArq.length + 1, sinistro_id: s.id, nome_original: 'avaria-' + s.id + '.jpg', storage_path: 'sinistros/' + s.id + '/avaria.jpg', mime_type: 'image/jpeg', tamanho: 210000, categoria: 'foto', created_at: s.created_at });
      if (s.id % 2) sinArq.push({ id: sinArq.length + 1, sinistro_id: s.id, nome_original: 'video-avaria-' + s.id + '.mp4', storage_path: 'sinistros/' + s.id + '/video.mp4', mime_type: 'video/mp4', tamanho: 46000, categoria: 'video', created_at: s.created_at });
    });

    // ---------- eficiência (KM/L) ----------
    var effMeses = [-4, -3, -2, -1].map(function (k) { var x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + k); return x.getFullYear() + '-' + D.pad(x.getMonth() + 1); });
    var comp = [], efv = [], idEf = 1;
    effMeses.forEach(function (mes, mi) {
      comp.push({ mes: mes, arquivo: 'Relatorio_Abastecimento_' + mes + '.xls', importado_em: D.ts(-100 + mi * 30, 10), importado_por: 'Gestor de Frota (Demo)', veiculos_encontrados: 18, veiculos_processados: 18, veiculos_nao_cadastrados: 0, problemas: [] });
      trucks.forEach(function (t7, ti) {
        var base = KML[grupo(t7.modelo)] || 5;
        var kml = +(base * (0.82 + D.rnd() * 0.3) + mi * 0.05).toFixed(2);
        var litros = D.int(380, 1100), dist = +(kml * litros).toFixed(0);
        var m1 = motoristas[t7.id - 1].nome, m2 = motoristas[(t7.id + 3) % 18].nome;
        var occ1 = D.int(8, 18), occ2 = D.int(0, 5);
        var mots = [{ nome: m1, ocorrencias: occ1, km_l: kml, km_l_editado_manualmente: false }];
        if (occ2) mots.push({ nome: m2, ocorrencias: occ2, km_l: +(kml * (0.9 + D.rnd() * 0.15)).toFixed(2), km_l_editado_manualmente: false });
        efv.push({ id: idEf++, mes: mes, placa: t7.placa, modelo: t7.modelo, modelo_grupo: grupo(t7.modelo), motorista_predominante: m1, motoristas: mots, empate: false, km_l: kml, km_l_relatorio: kml, km_l_editado_manualmente: false, km_l_auditado: true, distancia: dist, litros: litros, valor: +(litros * 6.19).toFixed(2), registros_relatorio: occ1 + occ2, registros: occ1 + occ2, modelo_divergente: false, modelo_completado_cadastro: false, origem_arquivo: 'Relatorio_Abastecimento_' + mes + '.xls' });
      });
    });

    var profiles = [
      { id: 'demo-user-0001', usuario: 'gestor@frota.demo', nome: 'Gestor de Frota (Demo)', perfil: 'admin', status: 'ativo', ultimo_acesso: D.ts(0, 8), created_at: D.ts(-200, 9) },
      { id: 'user-2', usuario: 'luiz@frota.demo', nome: 'Luiz', perfil: 'admin', status: 'ativo', ultimo_acesso: D.ts(-1, 17), created_at: D.ts(-200, 9) },
      { id: 'user-3', usuario: 'supervisor@frota.demo', nome: 'Supervisor da Frota', perfil: 'admin', status: 'ativo', ultimo_acesso: D.ts(-2, 8), created_at: D.ts(-180, 9) },
      { id: 'user-4', usuario: 'diretoria@frota.demo', nome: 'Diretoria (consulta)', perfil: 'visitante', status: 'ativo', ultimo_acesso: D.ts(-6, 10), created_at: D.ts(-120, 9) }
    ];
    var aud = [], aid = 1;
    manut.slice(-6).concat(multas.slice(-4)).forEach(function (r) {
      var tb = r.servico ? 'manutencoes' : 'multas';
      aud.push({ id: aid++, criado_em: r.created_at, usuario_id: 'user-2', usuario_nome: 'Luiz', modulo: tb, acao: 'criar', registro_id: r.id, alteracoes: { novo: r } });
    });
    aud.push({ id: aid++, criado_em: D.ts(-1, 11), usuario_id: 'user-3', usuario_nome: 'Supervisor da Frota', modulo: 'multas', acao: 'editar', registro_id: 3, alteracoes: { status: { antes: 'aguardando_aceite', depois: 'aceito' } } });
    var lixeira = [{ id: 1, modulo: 'manutencoes', tabela_origem: 'manutencoes', registro_id: 999, titulo: 'Lançamento duplicado de alinhamento', dados: { id: 999, data: D.day(-12), placa: trucks[2].placa, servico: 'Alinhamento e balanceamento', tipo: 'Suspensão', origem: 'Interna', valor: 220, status: 'concluido' }, deleted_at: D.ts(-10, 15), restored_at: null, created_at: D.ts(-10, 15) }];

    return {
      veiculos: veiculos, motoristas: motoristas, multas: multas, pontos: pontos, trocas_oleo: oleo, tacografos: taco,
      manutencoes: manut, manutencoes_meses: manutMeses, producao_dia: prod, producao: [], producao_meses: prodMeses,
      chamados: chamados, checklists: checklists, brats: brats, brat_arquivos: bratArq, sinistros_avarias: sin, sinistros_arquivos: sinArq,
      eficiencia_config: [{ id: 1, meta_kml: 4.5, atualizado_em: D.ts(-60, 9), atualizado_por: 'Gestor de Frota (Demo)' }], eficiencia_competencias: comp, eficiencia_veiculos_mes: efv, eficiencia_roteiros: [],
      profiles: profiles, auditoria: aud, lixeira_operacional: lixeira, anexos_frota: []
    };
  };

  // Emula os gatilhos do banco: auditoria automática e lixeira na exclusão lógica.
  var TABLE_TO_KEY = { multas: 'multas', pontos: 'pontos', motoristas: 'motoristas', veiculos: 'veiculos', chamados: 'chamados', tacografos: 'tacografos', trocas_oleo: 'oleo', manutencoes: 'manutencoes', producao_dia: 'producao', brats: 'brat', sinistros_avarias: 'sinistros', checklists: 'checklists' };
  function nextId(rows) { return rows.reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1; }
  window.DEMO_HOOKS = {
    afterWrite: function (t, op, before, after, api) {
      if (!TABLE_TO_KEY[t]) return;
      var u = window.DEMO_USER, log = api.table('auditoria');
      var row = { id: nextId(log), criado_em: new Date().toISOString(), usuario_id: u.id, usuario_nome: u.nome, modulo: t, registro_id: (after || before).id };
      if (op === 'INSERT') { row.acao = 'criar'; row.alteracoes = { novo: after }; }
      else if (op === 'DELETE') { row.acao = 'excluir'; row.alteracoes = { removido: before }; }
      else {
        if (after.deleted_at && !before.deleted_at) {
          row.acao = 'excluir'; row.alteracoes = { removido: before };
          var lx = api.table('lixeira_operacional');
          lx.push({ id: nextId(lx), modulo: TABLE_TO_KEY[t], tabela_origem: t, registro_id: before.id, titulo: [before.placa, before.servico || before.motorista || before.nome || before.titulo, before.data].filter(Boolean).join(' • '), dados: before, deleted_at: after.deleted_at, restored_at: null, created_at: after.deleted_at });
        } else {
          var ch = {};
          Object.keys(after).forEach(function (k) { if (k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k])) ch[k] = { antes: before[k], depois: after[k] }; });
          if (!Object.keys(ch).length) return;
          row.acao = 'editar'; row.alteracoes = ch;
        }
      }
      log.push(row);
    }
  };
  window.DEMO_RPC = {
    fn_touch_last_login: function (a, db, api) { var p = api.table('profiles').find(function (x) { return x.id === window.DEMO_USER.id; }); if (p) p.ultimo_acesso = new Date().toISOString(); return null; },
    fn_admin_listar_usuarios: function (a, db, api) { return api.table('profiles').slice().sort(function (x, y) { return String(x.nome).localeCompare(String(y.nome)); }); },
    fn_admin_criar_usuario: function (a, db, api) { var p = { id: api.uuid(), usuario: a.p_usuario + '@frota.demo', nome: a.p_nome, perfil: a.p_perfil || 'visitante', status: 'ativo', ultimo_acesso: null, created_at: new Date().toISOString() }; api.table('profiles').push(p); return p.id; },
    fn_admin_atualizar_usuario: function (a, db, api) { var p = api.table('profiles').find(function (x) { return x.id === a.p_id; }); if (p) Object.assign(p, { nome: a.p_nome, perfil: a.p_perfil, status: a.p_status }); return null; },
    fn_admin_redefinir_senha: function () { return null; }
  };
})();
