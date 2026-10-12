/**
 * database/queries/vistorias.js
 * CRUD da tabela "vistorias". Lê/escreve no cache em memória (Store),
 * que é sempre hidratado a partir do Supabase e mantido em sincronia
 * (ver assets/js/store.js e database/supabase.js).
 */
const VistoriasQuery = {
  listar(filtros = {}) {
    let rows = Store.select('vistorias');
    if (filtros.area) rows = rows.filter((v) => v.area_local === filtros.area);
    if (filtros.setor) rows = rows.filter((v) => v.setor_processo === filtros.setor);
    if (filtros.responsavel) rows = rows.filter((v) => v.realizada_por === filtros.responsavel);
    if (filtros.status) rows = rows.filter((v) => v.status === filtros.status);
    if (filtros.dataInicio) rows = rows.filter((v) => v.data >= filtros.dataInicio);
    if (filtros.dataFim) rows = rows.filter((v) => v.data <= filtros.dataFim);
    if (filtros.busca) {
      const b = filtros.busca.toLowerCase();
      rows = rows.filter((v) =>
        [v.area_local, v.setor_processo, v.realizada_por, v.observacao]
          .filter(Boolean)
          .some((f) => f.toLowerCase().includes(b))
      );
    }
    return rows.sort((a, b) => (a.data < b.data ? 1 : -1));
  },

  obter(id) {
    return Store.getById('vistorias', id);
  },

  criar(dados) {
    return Store.insert('vistorias', {
      data: dados.data,
      area_local: dados.area_local,
      realizada_por: dados.realizada_por,
      setor_processo: dados.setor_processo,
      observacao: dados.observacao || '',
      status: 'Não Iniciado',
    });
  },

  atualizar(id, patch) {
    return Store.update('vistorias', id, patch);
  },

  excluir(id) {
    // Cascade manual: remove NCs e tudo que depende delas.
    const ncs = Store.select('nao_conformidades', (n) => n.vistoria_id === id);
    ncs.forEach((nc) => NCQuery.excluir(nc.id));
    return Store.delete('vistorias', id);
  },

  /** Recalcula e persiste o status geral da vistoria com base nas NCs. */
  recalcularStatus(id) {
    const ncs = Store.select('nao_conformidades', (n) => n.vistoria_id === id);
    let status = 'Não Iniciado';
    if (ncs.length > 0) {
      const todasConcluidas = ncs.every((n) => n.status === 'Concluída');
      const algumaIniciada = ncs.some((n) => n.status !== 'Pendente');
      status = todasConcluidas ? 'Concluída' : algumaIniciada ? 'Em andamento' : 'Não Iniciado';
    }
    return Store.update('vistorias', id, { status });
  },
};

window.VistoriasQuery = VistoriasQuery;
