/* Dados fictícios da demo — Controle de Veículos de Passeio (frota comercial) */
window.DEMO_NS = 'promotor';

(function () {
  var D = window.DemoData;
  var CENTER = [-22.9106, -43.1756];
  var SESSION_KEY = 'demo:promotor:session';

  function signature(seedN) {
    var st = 9000 + seedN * 7919;
    function r() { st = (st * 1664525 + 1013904223) % 4294967296; return st / 4294967296; }
    function ri(a, b) { return a + Math.floor(r() * (b - a + 1)); }
    var x = 20, y = 70, d = 'M' + x + ' ' + y;
    for (var i = 0; i < 7; i++) {
      var nx = x + ri(22, 42), ny = ri(30, 105);
      d += ' Q' + (x + ri(5, 30)) + ' ' + ri(10, 120) + ' ' + nx + ' ' + ny;
      x = nx;
    }
    d += ' M' + ri(40, 80) + ' ' + ri(95, 110) + ' L' + (x - ri(0, 30)) + ' ' + ri(85, 100);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="130" viewBox="0 0 320 130"><rect width="320" height="130" fill="#fff"/>' +
      '<path d="' + d + '" fill="none" stroke="#1a237e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function waze(lat, lng) { return 'https://waze.com/ul?ll=' + lat + ',' + lng + '&navigate=yes'; }
  function maps(lat, lng) { return 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng; }

  window.DEMO_SEED = function () {
    D.reseed(777);
    var modelos = [['VW Polo', 2023], ['VW Virtus', 2024], ['Chevrolet Onix', 2023], ['Hyundai HB20', 2022], ['Fiat Argo', 2024], ['Renault Kwid', 2022], ['VW Gol', 2021], ['Fiat Mobi', 2023]];
    var veiculos = modelos.map(function (m, i) {
      return { id: 'vei-' + (i + 1), placa: D.plate(), modelo: m[0], renavam: '0' + D.int(1000000000, 9999999999), ano: m[1], contrato: 'LOC-' + D.int(1000, 9999), status: 'disponivel', observacao: i === 5 ? 'Veículo reserva' : '', created_at: D.ts(-200, 9), updated_at: D.ts(-10, 9) };
    });
    var setores = ['Promoção', 'Merchandising', 'Comercial', 'Trade Marketing'];
    var motoristas = [];
    for (var i = 0; i < 7; i++) motoristas.push({ id: 'mot-' + (i + 1), nome: D.person(), matricula: 'PR-' + D.pad(101 + i, 4), setor: setores[i % 4], telefone: D.phone(), status: i === 6 ? 'inativo' : 'ativo', observacao: '', created_at: D.ts(-180, 9), updated_at: D.ts(-30, 9) });
    var clientes = D.clientes.slice(0, 12).map(function (nome, i) {
      var lat = +(CENTER[0] + (D.rnd() - 0.5) * 0.12).toFixed(6), lng = +(CENTER[1] + (D.rnd() - 0.5) * 0.16).toFixed(6);
      return { id: 'cli-' + (i + 1), nome: nome, telefone: '(21) 3' + D.int(100, 999) + '-' + D.int(1000, 9999), endereco: 'Rua Exemplo ' + D.int(1, 40) + ', ' + D.int(10, 999) + ' — ' + D.pick(D.bairros), status: 'ativo', observacao: i % 4 === 0 ? 'Recebimento até 11h' : '', lat: lat, lng: lng, waze_url: waze(lat, lng), maps_url: maps(lat, lng), created_at: D.ts(-150, 9), updated_at: D.ts(-20, 9) };
    });

    var movs = [], stops = [], sigN = 0, daily = {};
    for (var d = -60; d <= 0; d++) {
      var dt = D.dateOffset(d);
      if (dt.getDay() === 0) continue;
      var nUsos = d === 0 ? 3 : D.int(2, 4);
      var livres = veiculos.slice(0, 7);
      for (var k = 0; k < nUsos; k++) {
        var v = livres[(k + Math.abs(d)) % livres.length];
        var mo = motoristas[(k * 2 + Math.abs(d)) % 6];
        var ativo = d === 0;
        var dayKey = D.iso(dt).replace(/-/g, '');
        daily[dayKey] = (daily[dayKey] || 0) + 1;
        var saida = D.ts(d, 7 + k, D.int(0, 50));
        var chegada = ativo ? null : D.ts(d, 15 + D.int(0, 2), D.int(0, 59));
        var semEntrega = !ativo && D.chance(0.08);
        var id = 'mov-' + (movs.length + 1);
        var nStops = D.int(2, 4);
        var lastC = null;
        for (var s = 0; s < nStops; s++) {
          var c = clientes[(k * 3 + s + Math.abs(d)) % clientes.length];
          lastC = c;
          var pendente = ativo && s === nStops - 1;
          var antes = !pendente && D.chance(0.35);
          stops.push({ id: id + '-s' + (s + 1), movimento_id: id, cliente_id: c.id, cliente_nome: c.nome, endereco: c.endereco, observacao: '', status: pendente ? 'pendente' : 'visitado', ordem: s + 1, lat: c.lat, lng: c.lng, waze_url: c.waze_url, maps_url: c.maps_url, chegada_at: pendente ? null : D.ts(d, 8 + k + s, D.int(0, 59)), fotos_antes: antes ? ['demo/fotos/gondola-antes.jpg'] : [], fotos_depois: antes ? ['demo/fotos/gondola-depois.jpg'] : [], assinatura_entrega_url: null, assinatura_entrega_at: null, created_at: D.ts(d, 8 + k + s) });
          if (ativo && s >= 1) break;
        }
        movs.push({
          id: id, numero_uso: dayKey + '-' + D.pad(daily[dayKey]), veiculo_id: v.id, placa: v.placa, modelo: v.modelo, motorista_id: mo.id, motorista: mo.nome,
          cliente_id: lastC.id, cliente_nome: lastC.nome, destino: lastC.endereco, destino_lat: lastC.lat, destino_lng: lastC.lng, destino_waze_url: lastC.waze_url, destino_maps_url: lastC.maps_url,
          observacao_saida: D.chance(0.2) ? 'Tanque com 3/4' : '', saida_at: saida, chegada_at: chegada, status: ativo ? 'em_uso' : 'finalizado',
          observacao_chegada: ativo ? '' : (D.chance(0.15) ? 'Veículo devolvido com sujeira interna' : ''),
          assinatura_status: ativo ? 'saida_assinada' : (semEntrega ? 'assinatura_incompleta' : 'conferida'),
          assinatura_saida_url: signature(++sigN), assinatura_saida_at: saida,
          assinatura_entrega_url: ativo || semEntrega ? '' : signature(++sigN), assinatura_entrega_at: ativo || semEntrega ? null : chegada,
          created_at: saida, updated_at: chegada || saida
        });
        if (ativo) v.status = 'em_uso';
      }
    }
    veiculos[7].status = 'manutencao';

    var tipos = ['Preventiva', 'Troca de óleo', 'Pneus', 'Revisão', 'Freios', 'Funilaria / Pintura'];
    var manut = [];
    for (var m = 0; m < 8; m++) {
      var vv = veiculos[m % 8], off = -D.int(0, 80);
      var st = m === 7 ? 'em_andamento' : (m === 6 ? 'agendada' : 'concluida');
      manut.push({ id: 'man-' + (m + 1), veiculo_id: vv.id, placa: vv.placa, modelo: vv.modelo, data: m === 7 ? D.day(-2) : (m === 6 ? D.day(5) : D.day(off)), tipo: m === 7 ? 'Freios' : tipos[m % tipos.length], motivo: m === 7 ? 'Ruído ao frear — troca de pastilhas' : 'Serviço programado conforme quilometragem', status: st, responsavel: 'Oficina Credenciada Exemplo', previsao_conclusao: st !== 'concluida' ? D.day(st === 'agendada' ? 5 : 1) : null, data_conclusao: st === 'concluida' ? D.day(off + 1) : null, observacao: '', criado_por: 'Gestor Demonstração', created_at: D.ts(off, 10), updated_at: D.ts(off + 1, 10) });
    }
    var occ = [
      ['Avaria', 'alta', 'aberta', 'Arranhão na porta traseira esquerda identificado na devolução.'],
      ['Veículo sujo', 'baixa', 'resolvida', 'Veículo devolvido com sujeira interna; condutor orientado.'],
      ['Multa informada', 'media', 'em_andamento', 'Notificação de estacionamento irregular recebida — identificar condutor.'],
      ['Problema mecânico', 'alta', 'resolvida', 'Luz de injeção acesa durante a rota; veículo enviado à oficina.'],
      ['Outro', 'media', 'aberta', 'Cartão de abastecimento não localizado no veículo.']
    ].map(function (o, i) {
      var mv = movs[movs.length - 6 - i * 5];
      return { id: 'occ-' + (i + 1), movimento_id: mv.id, veiculo_id: mv.veiculo_id, numero_uso: mv.numero_uso, placa: mv.placa, motorista: mv.motorista, tipo: o[0], prioridade: o[1], status: o[2], descricao: o[3], criado_por: 'Controle', created_at: mv.chegada_at || mv.saida_at, updated_at: mv.chegada_at || mv.saida_at };
    });
    var usuarios = [
      { id: 'u-admin', nome: 'Administrador Demo', login: 'admin@exemplo.com', perfil: 'Administrador', status: 'ativo', motorista_id: null },
      { id: 'u-gestor', nome: 'Gestor Demonstração', login: 'gestor@exemplo.com', perfil: 'Gestor', status: 'ativo', motorista_id: null },
      { id: 'u-visual', nome: 'Diretoria (consulta)', login: 'consulta@exemplo.com', perfil: 'Visualizador', status: 'ativo', motorista_id: null },
      { id: 'u-cond1', nome: motoristas[0].nome, login: 'condutor@exemplo.com', perfil: 'Condutor', status: 'ativo', motorista_id: motoristas[0].id },
      { id: 'u-cond2', nome: motoristas[1].nome, login: 'condutor2@exemplo.com', perfil: 'Condutor', status: 'ativo', motorista_id: motoristas[1].id }
    ].map(function (u) { return Object.assign(u, { ultimo_acesso: D.ts(-D.int(0, 5), 8), created_at: D.ts(-120, 9), updated_at: D.ts(-10, 9) }); });
    var audit = [];
    movs.slice(-12).forEach(function (mv, i) {
      audit.push({ id: 'aud-' + (i + 1), usuario: 'Gestor Demonstração', perfil: 'Gestor', acao: mv.status === 'finalizado' ? 'Registrou entrada' : 'Registrou saída', modulo: 'Rotas', registro: mv.numero_uso + ' • ' + mv.placa, detalhes: mv.motorista, created_at: mv.chegada_at || mv.saida_at });
    });
    return { veiculos_passeio: veiculos, motoristas_promotores: motoristas, clientes_rota: clientes, movimentacoes_veiculos: movs, movimentacoes_clientes: stops, manutencoes_veiculos: manut, ocorrencias_monitoramento: occ, usuarios_controle: usuarios, auditoria_controle: audit };
  };

  function getSess() { try { var v = localStorage.getItem(SESSION_KEY); return v === null ? 'u-admin' : v; } catch (e) { return 'u-admin'; } }
  function setSess(v) { try { localStorage.setItem(SESSION_KEY, v); } catch (e) {} }
  function sessionFor(api, id) {
    var u = api.table('usuarios_controle').find(function (x) { return x.id === id && x.status === 'ativo'; });
    if (!u) return null;
    var mot = u.motorista_id ? api.table('motoristas_promotores').find(function (m) { return m.id === u.motorista_id; }) : null;
    return { token: 'demo-token', id: u.id, nome: u.nome, login: u.login, perfil: u.perfil, motorista_id: u.motorista_id || null, motorista_nome: mot ? mot.nome : '' };
  }
  window.DEMO_RPC = {
    controle_sessao_atual: function (a, db, api) { var id = getSess(); return id === 'none' ? null : sessionFor(api, id); },
    controle_login: function (a, db, api) {
      var login = String(a.p_login || '').trim().toLowerCase();
      var u = api.table('usuarios_controle').find(function (x) { return String(x.login).toLowerCase() === login && x.status === 'ativo'; });
      if (!u) return null;
      setSess(u.id); u.ultimo_acesso = new Date().toISOString();
      return sessionFor(api, u.id);
    },
    controle_logout: function () { setSess('none'); return null; }
  };
  // "Restaurar dados" também volta para o administrador.
  var origReset = null;
  document.addEventListener('DOMContentLoaded', function () {
    if (window.DemoDB && !origReset) { origReset = window.DemoDB.reset; window.DemoDB.reset = function () { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} origReset(); }; }
  });
})();
