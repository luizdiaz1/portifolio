/**
 * database/queries/acompanhamentos.js
 * CRUD de "acompanhamentos" (ação / tratativa / responsável / prazo / status
 * por NC), usado na tabela "ACOMPANHAMENTO DAS AÇÕES" do relatório e no
 * módulo Acompanhamento.
 */
const AcompanhamentoQuery = {
  listarPorNC(ncId) {
    return Store.select('acompanhamentos', (a) => a.nc_id === ncId).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  },

  listarTodos() {
    const rows = Store.select('acompanhamentos');
    rows.forEach((a) => this.aplicarAtraso(a));
    return rows;
  },

  /** Gera automaticamente um acompanhamento "seed" quando uma NC é criada,
   * usando a ação corretiva recomendada, responsável e prazo já informados. */
  seedDesdeNC(nc) {
    const existentes = this.listarPorNC(nc.id);
    if (existentes.length) return existentes[0];
    return Store.insert('acompanhamentos', {
      nc_id: nc.id,
      acao_tratativa: nc.acao_corretiva || '',
      responsavel: nc.responsavel || '',
      prazo: nc.prazo || null,
      status: nc.status || 'Pendente',
    });
  },

  atualizar(id, patch) {
    const row = Store.update('acompanhamentos', id, patch);
    if (row && patch.status) {
      // Reflete o status também na NC de origem (mantém tudo coerente).
      NCQuery.atualizarStatus(row.nc_id, patch.status);
    }
    return row;
  },

  aplicarAtraso(a) {
    if (!a.prazo) return a;
    const hoje = new Date().toISOString().slice(0, 10);
    if (a.prazo < hoje && a.status !== 'Concluída' && a.status !== 'Atrasada') {
      Store.update('acompanhamentos', a.id, { status: 'Atrasada' });
      a.status = 'Atrasada';
    }
    return a;
  },

  /** Visão completa (NC + vistoria) para tabela do módulo Acompanhamento e do relatório. */
  listarComContexto(vistoriaId = null) {
    let ncs = vistoriaId
      ? NCQuery.listarPorVistoria(vistoriaId)
      : Store.select('nao_conformidades');
    return ncs.map((nc) => {
      let acomp = this.listarPorNC(nc.id)[0];
      if (!acomp) acomp = this.seedDesdeNC(nc);
      this.aplicarAtraso(acomp);
      const vistoria = Store.getById('vistorias', nc.vistoria_id);
      return {
        acompanhamento_id: acomp.id,
        nc_id: nc.id,
        nc_numero: nc.numero,
        area: nc.area_local,
        acao: acomp.acao_tratativa,
        responsavel: acomp.responsavel,
        prazo: acomp.prazo,
        status: acomp.status,
        vistoria_id: nc.vistoria_id,
        vistoria_data: vistoria ? vistoria.data : '-',
      };
    });
  },
};

window.AcompanhamentoQuery = AcompanhamentoQuery;
