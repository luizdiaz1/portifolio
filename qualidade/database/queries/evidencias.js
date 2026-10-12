/**
 * database/queries/evidencias.js
 * CRUD de "evidencias" (fotos vinculadas a cada NC).
 */
const EvidenciasQuery = {
  listarPorNC(ncId) {
    return Store.select('evidencias', (e) => e.nc_id === ncId).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
  },

  listarTodas() {
    return Store.select('evidencias').sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async adicionar(ncId, file) {
    // A NC pode ter acabado de ser criada e sua gravação ainda estar na fila.
    // Primeiro esperamos essa fila para não violar a FK nc_id ao inserir a foto.
    if (window.QualidadeDB.flushPendingWrites) {
      await window.QualidadeDB.flushPendingWrites();
    }

    // Diferente das demais gravações otimistas, a evidência precisa
    // estar confirmada no Storage E na tabela antes de retornar.
    const row = await window.QualidadeDB.salvarEvidenciaFoto(file, ncId);
    Store.insertLocal('evidencias', row);
    return row;
  },

  async excluir(id) {
    const row = Store.getById('evidencias', id);
    if (!row) return false;

    // Primeiro remove o arquivo físico quando temos o path salvo.
    // Evidências antigas sem storage_path continuam sendo removidas
    // normalmente da tabela.
    if (row.storage_path && window.QualidadeDB.deleteEvidenciaFoto) {
      await window.QualidadeDB.deleteEvidenciaFoto(row.storage_path);
    }

    return Store.delete('evidencias', id);
  },

  /** Retorna a evidência com contexto (vistoria/NC) para o módulo Evidências. */
  listarComContexto() {
    const evidencias = this.listarTodas();
    return evidencias.map((e) => {
      const nc = Store.getById('nao_conformidades', e.nc_id);
      const vistoria = nc ? Store.getById('vistorias', nc.vistoria_id) : null;
      return {
        ...e,
        nc_numero: nc ? nc.numero : '-',
        nc_area: nc ? nc.area_local : '-',
        vistoria_data: vistoria ? vistoria.data : '-',
        vistoria_id: vistoria ? vistoria.id : null,
      };
    });
  },
};

window.EvidenciasQuery = EvidenciasQuery;
