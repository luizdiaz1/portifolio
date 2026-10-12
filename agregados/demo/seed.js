/* Dados fictícios da demo — Sistema de Agregados */
window.DEMO_NS = 'agregados';
window.DEMO_USER = { id: 'demo-gestor', email: 'gestor@exemplo.com', nome: 'Gestor Demonstração' };

(function () {
  var D = window.DemoData;
  function calc(base, recl, dev, sin) {
    var exc = !recl && !dev, seg = !sin, combo = exc && seg;
    var pct = Number(((exc ? 0.2 : 0) + (seg ? 0.2 : 0) + (combo ? 0.2 : 0)).toFixed(1));
    var com = base * 0.025, bonus = base * pct / 100;
    return { percentual_comissao: 2.5, valor_comissao: +com.toFixed(2), bonus_percentual: pct, valor_bonus: +bonus.toFixed(2), valor_final: +(com + bonus).toFixed(2) };
  }
  var seq = 0;
  function codigo(dateStr) { seq++; return 'SRV-' + dateStr.slice(0, 4) + dateStr.slice(5, 7) + '-' + D.pad(seq, 4); }
  window.DEMO_NEXT_CODE = function () { return seq; };

  window.DEMO_SEED = function () {
    D.reseed(4242); seq = 0;
    var cidades = ['Centro de Distribuição', 'Zona Norte', 'Zona Oeste', 'Baixada', 'Região Serrana', 'Litoral Sul', 'Região dos Lagos', 'Vale do Rio'];
    var agregados = [];
    for (var i = 0; i < 7; i++) {
      agregados.push({
        id: 'agr-' + (i + 1), nome: D.person(), documento: D.cpfFake(), telefone: D.phone(),
        status: i !== 6,
        observacoes: '[CAMINHÃO] Placa: ' + D.plate() + ' | Modelo: ' + D.pick(['VUC baú', 'Caminhão 3/4 baú', 'Toco baú', 'Truck sider']) + '\n' +
          (i === 2 ? '[NOTAS] Prefere rotas na Zona Oeste' : (i === 6 ? '[NOTAS] Cadastro inativo — contrato encerrado' : '')),
        created_at: D.ts(-120 + i * 3)
      });
    }
    var servicos = [], ocorrencias = [], ciots = [];
    for (var d = -58; d <= 0; d++) {
      var dt = D.dateOffset(d);
      if (dt.getDay() === 0) continue;
      var n = D.int(1, 3);
      for (var k = 0; k < n; k++) {
        var ag = agregados[D.int(0, 5)];
        var dataStr = D.day(d);
        var base = D.money(6000, 28000);
        var andamento = d >= -1 && D.chance(0.7);
        var cancelado = !andamento && D.chance(0.04);
        var recl = D.chance(0.12), dev = D.chance(0.1), sin = D.chance(0.05);
        var notas = D.int(8, 45);
        var s = {
          id: 'srv-' + (servicos.length + 1), codigo_servico: codigo(dataStr), agregado_id: ag.id, data_servico: dataStr,
          hora_inicio: D.pad(D.int(5, 9)) + ':' + D.pad(D.pick([0, 15, 30, 45])), notas_saida: notas,
          descricao: 'Rota ' + D.pick(cidades) + ' — ' + D.int(6, 22) + ' clientes',
          origem: 'CD Exemplo', destino: D.pick(cidades), valor_base: base,
          status: andamento ? 'Em andamento' : (cancelado ? 'Cancelado' : 'Finalizado'),
          entregas_realizadas: null, quantidade_entregas: null, houve_reclamacao: null, entregas_descricao: null,
          reclamacao_descricao: null, devolucao_realizada: null, devolucao_causada_motorista: null, devolucao_descricao: null,
          percentual_comissao: 2.5, valor_comissao: null, bonus_percentual: null, valor_bonus: null, valor_final: null,
          hora_retorno: null, notas_retorno: null, created_at: D.ts(d, 6)
        };
        if (s.status === 'Finalizado') {
          var todas = !D.chance(0.12);
          Object.assign(s, calc(base, recl, dev, sin), {
            entregas_realizadas: todas, quantidade_entregas: D.int(6, 22), houve_reclamacao: recl,
            entregas_descricao: todas ? null : 'Cliente fechado no horário da entrega; reentrega agendada.',
            reclamacao_descricao: recl ? 'Cliente relatou atraso na janela de recebimento.' : null,
            devolucao_causada_motorista: dev, devolucao_descricao: dev ? 'Avaria em 2 volumes por acomodação da carga.' : null,
            hora_retorno: D.pad(D.int(14, 19)) + ':' + D.pad(D.pick([0, 10, 20, 40, 50])), notas_retorno: D.int(0, 3)
          });
          if (sin) ocorrencias.push({ id: 'oc-' + (ocorrencias.length + 1), servico_id: s.id, agregado_id: ag.id, tipo: 'Sinistro', descricao: D.pick(['Colisão leve em manobra no pátio do cliente.', 'Retrovisor danificado em via estreita.', 'Pneu furado com atraso de 1h na rota.']), status: D.chance(0.5) ? 'Aberta' : 'Resolvida', created_at: D.ts(d, 18) });
        }
        if (s.status === 'Cancelado') s.descricao += ' (cancelado: veículo indisponível)';
        servicos.push(s);
      }
    }
    for (var c = 0; c < 12; c++) {
      var a2 = agregados[D.int(0, 5)], off = -D.int(0, 55);
      ciots.push({
        id: 'ciot-' + (c + 1), numero_ciot: '0000' + D.int(10000000, 99999999), agregado_id: a2.id, data_emissao: D.day(off),
        status: off > -7 ? 'Ativo' : (D.chance(0.1) ? 'Cancelado' : 'Finalizado'), origem: 'CD Exemplo', destino: D.pick(cidades),
        valor_contrato: D.money(1500, 9000), observacoes: '', created_at: D.ts(off, 9)
      });
    }
    var auditoria = [];
    servicos.slice(-8).forEach(function (s, i) {
      auditoria.push({ id: i + 1, created_at: s.created_at, usuario_id: 'demo-gestor', usuario_email: 'gestor@exemplo.com', operacao: s.status === 'Finalizado' ? 'UPDATE' : 'INSERT', tabela: 'servicos', registro_id: s.id, descricao: s.status === 'Finalizado' ? 'Registro atualizado' : 'Registro criado', dados_anteriores: null, dados_novos: s });
    });
    return {
      profiles: [{ id: 'demo-gestor', nome: 'Gestor Demonstração', role: 'gestor' }],
      agregados: agregados, servicos: servicos, ciots: ciots, ocorrencias: ocorrencias, auditoria: auditoria
    };
  };

  var AUDITED = { servicos: 1, agregados: 1, ciots: 1, ocorrencias: 1 };
  window.DEMO_HOOKS = {
    beforeInsert: function (t, row, api) {
      if (t === 'servicos' && !row.codigo_servico) {
        var all = api.table('servicos');
        var n = all.length + 1;
        var d = String(row.data_servico || new Date().toISOString());
        row.codigo_servico = 'SRV-' + d.slice(0, 4) + d.slice(5, 7) + '-' + D.pad(n, 4);
      }
    },
    afterWrite: function (t, op, before, after, api) {
      if (!AUDITED[t]) return;
      var log = api.table('auditoria');
      var id = log.reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1;
      log.push({ id: id, created_at: new Date().toISOString(), usuario_id: 'demo-gestor', usuario_email: 'gestor@exemplo.com', operacao: op, tabela: t, registro_id: String((after || before).id), descricao: op === 'INSERT' ? 'Registro criado' : op === 'UPDATE' ? 'Registro atualizado' : 'Registro excluído', dados_anteriores: before, dados_novos: after });
    }
  };
})();
