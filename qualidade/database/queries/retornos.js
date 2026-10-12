/**
 * database/queries/retornos.js
 * CRUD de "retornos" (retorno / verificação de eficácia da ação).
 */
const RetornosQuery = {
  listarPorNC(ncId) {
    return Store.select('retornos', (r) => r.nc_id === ncId).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  },

  ultimoPorNC(ncId) {
    return this.listarPorNC(ncId)[0] || null;
  },

  registrar(ncId, dados) {
    const row = Store.insert('retornos', {
      nc_id: ncId,
      resultado_correcao: dados.resultado_correcao || '',
      eficacia: dados.eficacia || 'Pendente de verificação',
      data_retorno: dados.data_retorno || new Date().toISOString().slice(0, 10),
      responsavel: dados.responsavel || '',
    });
    if (dados.eficacia === 'Eficaz') {
      NCQuery.atualizarStatus(ncId, 'Concluída');
    }
    return row;
  },

  atualizar(id, patch) {
    return Store.update('retornos', id, patch);
  },
};

window.RetornosQuery = RetornosQuery;
