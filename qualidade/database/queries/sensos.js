/**
 * database/queries/sensos.js
 * Catálogo dos sensos (tabela "sensos"). Se a tabela ainda não foi criada
 * no Supabase (ou está vazia), usa a lista do checklist como reserva, para
 * as telas continuarem funcionando.
 */
const SensosQuery = {
  listar() {
    const rows = Store.select('sensos', (s) => s.ativo !== false).sort((a, b) => a.numero - b.numero);
    if (rows.length) return rows;
    return (window.CHECKLIST_10S || []).map((s) => ({
      id: String(s.senso), numero: s.senso, nome: s.nome, japones: s.japones, ativo: true,
    }));
  },

  /** Nomes na ordem dos sensos (é o texto gravado em nc_sensos.senso). */
  nomes() {
    return this.listar().map((s) => s.nome);
  },
};

window.SensosQuery = SensosQuery;
