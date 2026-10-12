/**
 * assets/js/store.js
 * ---------------------------------------------------------
 * Cache local EM MEMÓRIA (nada é salvo no navegador/localStorage).
 * Fonte de dados real é sempre o Supabase:
 *   - ao abrir o app, database/supabase.js -> pullAll() busca tudo
 *     do Supabase e chama Store.hydrate(table, rows) para preencher
 *     este cache;
 *   - toda escrita (insert/update/delete) atualiza este cache
 *     imediatamente (tela responde na hora) E é replicada ao
 *     Supabase em segundo plano (database/supabase.js -> push);
 *   - mudanças feitas por outros usuários chegam via Supabase
 *     Realtime e são aplicadas aqui por Store.applyRemote(...).
 *
 * Dar F5 sempre recarrega os dados de novo a partir do Supabase —
 * não existe persistência local. Os módulos e a camada
 * database/queries/*.js continuam lendo/escrevendo em Store de
 * forma síncrona, exatamente como liam antes; só a origem dos
 * dados mudou.
 * ---------------------------------------------------------
 */

const TABLES = [
  'sensos',
  'vistorias',
  'nao_conformidades',
  'nc_sensos',
  'evidencias',
  'acompanhamentos',
  'retornos',
  'auditorias_10s',
  'auditoria_itens',
  'auditoria_acoes',
];

const _data = {};
TABLES.forEach((t) => { _data[t] = []; });

function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Dispara a réplica para o Supabase (no-op se não estiver conectado). */
function _syncPush(table, op, payload) {
  // Visitante é somente leitura: nada é enviado ao servidor (o banco também recusaria).
  // Isso também cobre ajustes automáticos feitos ao abrir a tela (ex.: marcar "Atrasada"),
  // que para o visitante ficam só em memória.
  if (window.Auth && !window.Auth.podeEscrever()) return;
  if (window.QualidadeDB && window.QualidadeDB.enabled) {
    window.QualidadeDB.push(table, op, payload);
  }
}

const Store = {
  /** Retorna todas as linhas de uma tabela, opcionalmente filtradas. */
  select(table, filterFn) {
    const rows = _data[table] || [];
    return filterFn ? rows.filter(filterFn) : rows.slice();
  },

  /** Retorna uma linha por id. */
  getById(table, id) {
    return (_data[table] || []).find((r) => r.id === id) || null;
  },

  /** Insere uma nova linha, gerando id/created_at automaticamente. */
  insert(table, data) {
    const now = new Date().toISOString();
    const row = { id: _uuid(), created_at: now, updated_at: now, ...data };
    _data[table].push(row);
    _syncPush(table, 'insert', row);
    return row;
  },

  /**
   * Insere uma linha que já foi confirmada no Supabase.
   * Não dispara outro push. Usado em operações que precisam esperar
   * a confirmação do servidor, como o upload de evidências.
   */
  insertLocal(table, row) {
    if (!_data[table]) _data[table] = [];
    const idx = _data[table].findIndex((r) => r.id === row.id);
    if (idx === -1) _data[table].push(row);
    else _data[table][idx] = { ..._data[table][idx], ...row };
    return row;
  },

  /** Atualiza uma linha por id. */
  update(table, id, patch) {
    const rows = _data[table];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    _syncPush(table, 'update', rows[idx]);
    return rows[idx];
  },

  /** Remove uma linha por id. */
  delete(table, id) {
    const rows = _data[table];
    const before = rows.length;
    _data[table] = rows.filter((r) => r.id !== id);
    if (_data[table].length !== before) _syncPush(table, 'delete', { id });
    return _data[table].length !== before;
  },

  /** Remove todas as linhas relacionadas a um filtro (cascade manual em memória).
   * Não replica ao Supabase: lá o cascade já acontece via FK "on delete cascade",
   * e o evento realtime de DELETE dessas linhas filhas volta sozinho. */
  deleteWhere(table, filterFn) {
    const rows = _data[table];
    const before = rows.length;
    _data[table] = rows.filter((r) => !filterFn(r));
    return before - _data[table].length;
  },

  /** Substitui o conteúdo em memória de uma tabela (usado ao hidratar a partir
   * do Supabase). Não dispara sync de volta. */
  hydrate(table, rows) {
    _data[table] = rows || [];
  },

  /** Aplica em memória um evento vindo do Supabase Realtime (upsert/delete idempotente). */
  applyRemote(table, eventType, newRow, oldRow) {
    const rows = _data[table] || (_data[table] = []);
    if (eventType === 'DELETE') {
      const id = (oldRow && oldRow.id) || (newRow && newRow.id);
      _data[table] = rows.filter((r) => r.id !== id);
      return;
    }
    const idx = rows.findIndex((r) => r.id === newRow.id);
    if (idx === -1) rows.push(newRow);
    else rows[idx] = { ...rows[idx], ...newRow };
  },

  uuid: _uuid,
};

window.Store = Store;
