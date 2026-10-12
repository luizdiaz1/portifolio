/* Dados fictícios da demo — Qualidade 10S */
window.DEMO_NS = 'qualidade10s';
window.DEMO_USER = { id: 'demo-admin', email: 'qualidade@exemplo.com', nome: 'Analista da Qualidade (Demo)' };

(function () {
  var D = window.DemoData;
  var FOTOS = {
    prateleira: 'demo/fotos/prateleira-desorganizada.jpg',
    corredor: 'demo/fotos/corredor-obstruido.jpg',
    piso: 'demo/fotos/piso-molhado.jpg',
    extintor: 'demo/fotos/extintor-obstruido.jpg',
    mesa: 'demo/fotos/mesa-documentos.jpg',
    cabos: 'demo/fotos/cabos-soltos.jpg',
    caixas: 'demo/fotos/caixas-identificadas.jpg',
    organizada: 'demo/fotos/prateleira-organizada.jpg'
  };
  var MODELOS = [
    { foto: 'prateleira', area: 'Armazém — Rua B', desc: 'Caixas fora do endereço e volumes no chão em frente à prateleira.', risco: 'Avaria de produto e dificuldade de separação.', acao: 'Reendereçar volumes e liberar a área frontal da prateleira.', sensos: ['Organização', 'Utilização'], crit: 'Média' },
    { foto: 'corredor', area: 'Expedição — Doca 3', desc: 'Palete parado no corredor de circulação de empilhadeiras.', risco: 'Risco de colisão e bloqueio de rota de fuga.', acao: 'Definir área demarcada para paletes em espera.', sensos: ['Segurança', 'Organização'], crit: 'Alta' },
    { foto: 'piso', area: 'Recebimento', desc: 'Piso molhado próximo à câmara fria sem sinalização.', risco: 'Escorregamento e queda de colaboradores.', acao: 'Instalar sinalização fixa e rotina de secagem a cada turno.', sensos: ['Segurança', 'Limpeza'], crit: 'Crítica' },
    { foto: 'extintor', area: 'Armazém — Rua D', desc: 'Acesso ao extintor obstruído por caixas.', risco: 'Atraso na resposta a princípio de incêndio.', acao: 'Demarcar área livre de 1 m em frente aos extintores.', sensos: ['Segurança', 'Disciplina'], crit: 'Alta' },
    { foto: 'mesa', area: 'Escritório Administrativo', desc: 'Documentos acumulados sem identificação na estação de trabalho.', risco: 'Perda de documentos e retrabalho.', acao: 'Criar pastas por assunto e rotina semanal de descarte.', sensos: ['Utilização', 'Padronização'], crit: 'Baixa' },
    { foto: 'cabos', area: 'Oficina da Frota', desc: 'Cabos de equipamentos soltos na área de circulação.', risco: 'Tropeço e dano aos equipamentos.', acao: 'Instalar canaletas e organizar pontos de energia.', sensos: ['Segurança', 'Conservação'], crit: 'Média' },
    { foto: 'prateleira', area: 'Almoxarifado', desc: 'Materiais sem etiqueta de identificação.', risco: 'Uso de material errado e tempo perdido na busca.', acao: 'Etiquetar posições com código e descrição do item.', sensos: ['Padronização', 'Organização'], crit: 'Baixa' },
    { foto: 'mesa', area: 'Refeitório', desc: 'Utensílios e itens pessoais deixados sobre as mesas após o horário.', risco: 'Condições inadequadas de higiene.', acao: 'Reforçar orientação e incluir checagem no fechamento.', sensos: ['Limpeza', 'Disciplina'], crit: 'Baixa' }
  ];
  var AREAS = ['Armazém', 'Expedição', 'Recebimento', 'Escritório Administrativo', 'Oficina da Frota', 'Almoxarifado'];
  var PESSOAS = ['Carla Duarte', 'Marcos Sampaio', 'Juliana Lacerda', 'Rodrigo Moura', 'Patrícia Gomes', 'Thiago Rezende'];

  window.DEMO_SEED = function () {
    D.reseed(1010);
    var vistorias = [], ncs = [], ncSensos = [], evid = [], acomp = [], ret = [];
    var offsets = [-84, -70, -56, -41, -28, -15, -6, -1];
    offsets.forEach(function (off, vi) {
      var vid = 'vis-' + (vi + 1);
      var recente = off > -10;
      var status = recente ? (off === -1 ? 'Em andamento' : 'Em andamento') : 'Concluída';
      var area = AREAS[vi % AREAS.length];
      vistorias.push({ id: vid, data: D.day(off), area_local: area, realizada_por: PESSOAS[vi % 3], setor_processo: area === 'Escritório Administrativo' ? 'Administrativo' : 'Operação logística', observacao: vi === 0 ? 'Primeira vistoria do ciclo — base para comparação.' : '', status: status, created_at: D.ts(off, 9), updated_at: D.ts(off, 17) });
      var n = D.int(2, 4);
      for (var k = 0; k < n; k++) {
        var m = MODELOS[(vi * 3 + k) % MODELOS.length];
        var ncid = vid + '-nc' + (k + 1);
        var prazo = off + D.int(10, 25);
        var st;
        if (!recente) st = D.chance(0.8) ? 'Concluída' : (prazo < 0 ? 'Atrasada' : 'Em andamento');
        else st = D.pick(['Pendente', 'Em andamento']);
        ncs.push({ id: ncid, vistoria_id: vid, numero: k + 1, area_local: m.area, responsavel: D.pick(PESSOAS), prazo: D.day(prazo), criticidade: m.crit, descricao: m.desc, impacto_risco: m.risco, acao_corretiva: m.acao, status: st, created_at: D.ts(off, 10 + k), updated_at: D.ts(off, 10 + k) });
        m.sensos.forEach(function (s, si) { ncSensos.push({ id: ncid + '-s' + si, nc_id: ncid, senso: s, created_at: D.ts(off, 10), updated_at: D.ts(off, 10) }); });
        evid.push({ id: ncid + '-f1', nc_id: ncid, foto_url: FOTOS[m.foto], storage_path: null, nome_arquivo: m.foto + '.jpg', created_at: D.ts(off, 11), updated_at: D.ts(off, 11) });
        if (st === 'Concluída') evid.push({ id: ncid + '-f2', nc_id: ncid, foto_url: m.foto === 'prateleira' ? FOTOS.organizada : FOTOS.caixas, storage_path: null, nome_arquivo: 'depois.jpg', created_at: D.ts(prazo - 2, 15), updated_at: D.ts(prazo - 2, 15) });
        acomp.push({ id: ncid + '-a1', nc_id: ncid, acao_tratativa: m.acao, responsavel: D.pick(PESSOAS), prazo: D.day(prazo), status: st === 'Atrasada' ? 'Atrasada' : st, created_at: D.ts(off + 1, 9), updated_at: D.ts(off + 3, 9) });
        if (st === 'Concluída') ret.push({ id: ncid + '-r1', nc_id: ncid, resultado_correcao: 'Ação executada e verificada em campo.', eficacia: D.chance(0.8) ? 'Eficaz' : 'Parcialmente eficaz', data_retorno: D.day(prazo - 1), responsavel: PESSOAS[0], created_at: D.ts(prazo - 1, 16), updated_at: D.ts(prazo - 1, 16) });
      }
    });

    // Auditorias 10S (checklist dos sensos + plano de ação + nota do prefeito)
    var auds = [], itens = [], acoes = [];
    var CK = window.CHECKLIST_10S || [];
    [{ off: -60, area: 1, desc: 'Armazém e Expedição', st: 'Concluída', q: 0.72 }, { off: -30, area: 2, desc: 'Escritório Administrativo', st: 'Concluída', q: 0.84 }, { off: -3, area: 1, desc: 'Armazém e Expedição', st: 'Em andamento', q: 0.8 }]
      .forEach(function (a, ai) {
        var aid = 'aud-' + (ai + 1);
        var completa = a.st === 'Concluída';
        auds.push({ id: aid, data: D.day(a.off), area_numero: a.area, area_descricao: a.desc, auditores: 'Carla Duarte, Marcos Sampaio', prefeito: a.area === 1 ? 'Rodrigo Moura / Thiago Rezende' : 'Juliana Lacerda / Patrícia Gomes', rodada: ai === 2 ? 2 : 1, nc_aceitas: 6,
          nota_comprometimento: completa ? D.int(7, 10) : null, nota_lideranca: completa ? D.int(6, 10) : null, nota_sensos: completa ? D.int(6, 9) : null, nota_organizacao: completa ? D.int(6, 10) : null, nota_comunicacao: completa ? D.int(7, 10) : null,
          observacao: completa ? 'Área evoluiu em organização; manter foco em segurança.' : 'Auditoria em preenchimento.', status: a.st, created_at: D.ts(a.off, 9), updated_at: D.ts(a.off, 16) });
        CK.forEach(function (sn) {
          (sn.itens || []).forEach(function (it, ii) {
            var avaliado = completa || sn.senso <= 4;
            var bom = D.rnd() < a.q;
            var resp = avaliado ? ((it.invertida ? !bom : bom) ? 'Sim' : 'Não') : null;
            itens.push({ id: aid + '-i' + sn.senso + '-' + ii, auditoria_id: aid, senso: sn.senso, ordem: ii + 1, pergunta: it.pergunta, invertida: !!it.invertida, resposta: resp, pontos: avaliado ? (bom ? 1 : (D.chance(0.4) ? 0.5 : 0)) : null, obs: avaliado && !bom ? 'Ajustar até a próxima rodada.' : '', created_at: D.ts(a.off, 10), updated_at: D.ts(a.off, 10) });
          });
        });
        var nAc = D.int(2, 4);
        for (var k = 0; k < nAc; k++) {
          var m = MODELOS[(ai * 2 + k) % MODELOS.length];
          var stA = completa ? D.pick(['Concluída', 'Concluída', 'Em andamento']) : 'Pendente';
          acoes.push({ id: aid + '-ac' + (k + 1), auditoria_id: aid, numero: k + 1, nao_conformidade: m.desc, acao: m.acao, responsavel: D.pick(PESSOAS), onde: m.area, prazo_previsto: D.day(a.off + 15), prazo_realizado: stA === 'Concluída' ? D.day(a.off + D.int(7, 14)) : null, status: stA, observacoes: '', created_at: D.ts(a.off, 15), updated_at: D.ts(a.off, 15) });
        }
      });

    var sensos = [
      [1, 'Utilização', 'Seiri', 'Separar o necessário do desnecessário.'], [2, 'Organização', 'Seiton', 'Um lugar para cada coisa e cada coisa em seu lugar.'],
      [3, 'Limpeza', 'Seiso', 'Manter o ambiente, os móveis e os equipamentos limpos e conservados.'], [4, 'Padronização', 'Seiketsu', 'Manter e padronizar as condições dos três primeiros sensos.'],
      [5, 'Disciplina', 'Shitsuke', 'Praticar os padrões e normas como hábito.'], [6, 'Determinação e União', 'Shikari Yaro', 'Cooperação, comprometimento e participação nas ações do programa.'],
      [7, 'Treinamento', 'Shido', 'Orientar e capacitar as pessoas para a função.'], [8, 'Economia e Combate aos Desperdícios', 'Setsuyaku', 'Uso consciente dos recursos e combate ao desperdício.'],
      [9, 'Princípios Morais e Éticos', 'Shisei Rinri', 'Respeito, conduta profissional e ética no ambiente de trabalho.'], [10, 'Responsabilidade Social', 'Sekinin Shakai', 'Responsabilidade com as pessoas, a empresa e a sociedade.']
    ].map(function (s) { return { id: String(s[0]), numero: s[0], nome: s[1], japones: s[2], descricao: s[3], ativo: true, created_at: '2026-01-05T12:00:00Z', updated_at: '2026-01-05T12:00:00Z' }; });

    var profiles = [
      { id: 'demo-admin', email: 'qualidade@exemplo.com', nome: 'Analista da Qualidade (Demo)', role: 'admin', ativo: true, created_at: D.ts(-120, 9), updated_at: D.ts(-120, 9) },
      { id: 'user-2', email: 'carla.duarte@exemplo.com', nome: 'Carla Duarte', role: 'admin', ativo: true, created_at: D.ts(-110, 9), updated_at: D.ts(-110, 9) },
      { id: 'user-3', email: 'marcos.sampaio@exemplo.com', nome: 'Marcos Sampaio', role: 'visitante', ativo: true, created_at: D.ts(-90, 9), updated_at: D.ts(-90, 9) },
      { id: 'user-4', email: 'gerencia@exemplo.com', nome: 'Gerência Operacional', role: 'visitante', ativo: true, created_at: D.ts(-60, 9), updated_at: D.ts(-60, 9) }
    ];
    var log = [], lid = 1;
    vistorias.forEach(function (v) {
      log.push({ id: lid++, created_at: v.created_at, user_id: 'user-2', user_email: 'carla.duarte@exemplo.com', user_nome: 'Carla Duarte', acao: 'login', tabela: null, registro_id: null, rotulo: null, detalhes: null });
      log.push({ id: lid++, created_at: v.created_at, user_id: 'user-2', user_email: 'carla.duarte@exemplo.com', user_nome: 'Carla Duarte', acao: 'criou', tabela: 'vistorias', registro_id: v.id, rotulo: v.area_local + ' · ' + v.data, detalhes: null });
    });
    ncs.filter(function (n) { return n.status === 'Concluída'; }).slice(0, 8).forEach(function (n) {
      log.push({ id: lid++, created_at: n.updated_at, user_id: 'user-2', user_email: 'carla.duarte@exemplo.com', user_nome: 'Carla Duarte', acao: 'editou', tabela: 'nao_conformidades', registro_id: n.id, rotulo: 'NC ' + D.pad(n.numero) + ' · ' + n.area_local, detalhes: { status: { de: 'Em andamento', para: 'Concluída' } } });
    });

    return { sensos: sensos, vistorias: vistorias, nao_conformidades: ncs, nc_sensos: ncSensos, evidencias: evid, acompanhamentos: acomp, retornos: ret, auditorias_10s: auds, auditoria_itens: itens, auditoria_acoes: acoes, profiles: profiles, auditoria: log };
  };

  var ROT = { vistorias: function (r) { return r.area_local + ' · ' + r.data; }, nao_conformidades: function (r) { return 'NC ' + String(r.numero || '').padStart(2, '0') + ' · ' + (r.area_local || ''); }, auditorias_10s: function (r) { return 'Área ' + (r.area_numero || '') + ' · ' + (r.area_descricao || ''); } };
  var LOGGED = { vistorias: 1, nao_conformidades: 1, evidencias: 1, acompanhamentos: 1, retornos: 1, auditorias_10s: 1, auditoria_acoes: 1, profiles: 1 };
  function addLog(api, acao, tabela, row, detalhes) {
    var log = api.table('auditoria');
    var u = window.DEMO_USER;
    log.push({ id: log.reduce(function (m, r) { return Math.max(m, r.id || 0); }, 0) + 1, created_at: new Date().toISOString(), user_id: u.id, user_email: u.email, user_nome: u.nome, acao: acao, tabela: tabela, registro_id: row ? row.id : null, rotulo: row && ROT[tabela] ? ROT[tabela](row) : (row && (row.nome || row.acao_tratativa || row.nome_arquivo || row.acao)) || null, detalhes: detalhes || null });
  }
  window.DEMO_HOOKS = {
    afterWrite: function (t, op, before, after, api) {
      if (!LOGGED[t]) return;
      if (op === 'UPDATE') {
        var det = {};
        Object.keys(after || {}).forEach(function (k) { if (k !== 'updated_at' && JSON.stringify(before[k]) !== JSON.stringify(after[k])) det[k] = { de: before[k], para: after[k] }; });
        if (!Object.keys(det).length) return;
        addLog(api, 'editou', t, after, det);
      } else addLog(api, op === 'INSERT' ? 'criou' : 'excluiu', t, after || before, null);
    }
  };
  window.DEMO_RPC = {
    registrar_evento: function (args, db, api) { addLog(api, args.p_acao, null, null, null); return null; },
    finalizar_novo_usuario: function (args, db, api) {
      api.table('profiles').push({ id: args.p_id, email: (window.DEMO_LAST_SIGNUP && window.DEMO_LAST_SIGNUP.email) || 'novo.usuario@exemplo.com', nome: args.p_nome, role: args.p_role || 'visitante', ativo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return null;
    }
  };
})();
