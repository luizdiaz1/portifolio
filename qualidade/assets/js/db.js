/**
 * assets/js/db.js
 * ---------------------------------------------------------
 * Adaptador de persistência local (localStorage).
 * Simula as tabelas do schema Supabase (database/sql/schema.sql)
 * para que o sistema funcione totalmente offline/local até a
 * conexão com o Supabase ser ativada (database/supabase.js).
 *
 * Cada "tabela" é uma chave no localStorage contendo um array
 * de objetos JSON. As funções abaixo replicam operações CRUD
 * básicas (select / insert / update / delete) com a mesma
 * semântica que as queries reais teriam.
 * ---------------------------------------------------------
 */

const STORAGE_PREFIX = 'q10s_';
const TABLES = [
  'vistorias',
  'nao_conformidades',
  'nc_sensos',
  'evidencias',
  'acompanhamentos',
  'retornos',
];

function _key(table) {
  return STORAGE_PREFIX + table;
}

function _readTable(table) {
  const raw = localStorage.getItem(_key(table));
  return raw ? JSON.parse(raw) : [];
}

function _writeTable(table, rows) {
  localStorage.setItem(_key(table), JSON.stringify(rows));
}

function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const LocalDB = {
  /** Retorna todas as linhas de uma tabela, opcionalmente filtradas. */
  select(table, filterFn) {
    const rows = _readTable(table);
    return filterFn ? rows.filter(filterFn) : rows;
  },

  /** Retorna uma linha por id. */
  getById(table, id) {
    return _readTable(table).find((r) => r.id === id) || null;
  },

  /** Insere uma nova linha, gerando id/created_at automaticamente. */
  insert(table, data) {
    const rows = _readTable(table);
    const now = new Date().toISOString();
    const row = { id: _uuid(), created_at: now, updated_at: now, ...data };
    rows.push(row);
    _writeTable(table, rows);
    return row;
  },

  /** Atualiza uma linha por id. */
  update(table, id, patch) {
    const rows = _readTable(table);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    rows[idx] = { ...rows[idx], ...patch, updated_at: new Date().toISOString() };
    _writeTable(table, rows);
    return rows[idx];
  },

  /** Remove uma linha por id. */
  delete(table, id) {
    const rows = _readTable(table);
    const filtered = rows.filter((r) => r.id !== id);
    _writeTable(table, filtered);
    return filtered.length !== rows.length;
  },

  /** Remove todas as linhas relacionadas a um campo (ex.: cascade manual). */
  deleteWhere(table, filterFn) {
    const rows = _readTable(table);
    const kept = rows.filter((r) => !filterFn(r));
    _writeTable(table, kept);
    return rows.length - kept.length;
  },

  /** Limpa todas as tabelas (usado em "Resetar dados de exemplo"). */
  resetAll() {
    TABLES.forEach((t) => localStorage.removeItem(_key(t)));
  },

  /** Exporta todo o banco local como JSON (para backup manual). */
  exportAll() {
    const dump = {};
    TABLES.forEach((t) => (dump[t] = _readTable(t)));
    return dump;
  },

  /** Importa um JSON previamente exportado. */
  importAll(dump) {
    TABLES.forEach((t) => {
      if (dump[t]) _writeTable(t, dump[t]);
    });
  },

  uuid: _uuid,
};

window.LocalDB = LocalDB;
