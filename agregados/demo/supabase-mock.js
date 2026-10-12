/*
 * Banco de dados simulado para demonstração.
 * Substitui o cliente do Supabase por uma implementação em memória,
 * persistida no navegador (localStorage) apenas para esta demo.
 * Nenhum dado sai do navegador.
 *
 * Configuração esperada antes deste arquivo:
 *   window.DEMO_NS    -> nome único da demo (chave de armazenamento)
 *   window.DEMO_SEED  -> function() { return { tabela: [linhas], ... } }
 *   window.DEMO_RPC   -> { nome_funcao(args, db) { return data } } (opcional)
 *   window.DEMO_USER  -> { id, email, nome, ... } (opcional)
 */
(function () {
  'use strict';
  var NS = 'demo:' + (window.DEMO_NS || 'app') + ':v1';
  var memFiles = new Map(); // caminho -> objectURL (somente nesta aba)

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function nowIso() { return new Date().toISOString(); }

  function freshSeed() {
    var s = {};
    try { s = (window.DEMO_SEED ? window.DEMO_SEED() : {}) || {}; } catch (e) { console.error('[demo] seed', e); }
    return s;
  }
  var db = null;
  function ensure() {
    if (db) return db;
    try { db = JSON.parse(localStorage.getItem(NS) || 'null'); } catch (e) { db = null; }
    if (!db || typeof db !== 'object') { db = freshSeed(); save(); }
    return db;
  }
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(NS, JSON.stringify(db)); } catch (e) { /* armazenamento indisponível: segue em memória */ }
    }, 50);
  }
  function table(name) { ensure(); if (!Array.isArray(db[name])) db[name] = []; return db[name]; }

  // ---------- comparação ----------
  function isNum(v) { return v !== null && v !== '' && typeof v !== 'boolean' && !isNaN(Number(v)); }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (isNum(a) && isNum(b) && !(typeof a === 'string' && /^\d{4}-\d\d/.test(a))) return Number(a) - Number(b);
    a = String(a); b = String(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function eqv(a, b) {
    if (a == null || b == null) return a == b;
    if (typeof a === 'boolean' || typeof b === 'boolean') return String(a) === String(b);
    return String(a) === String(b);
  }
  function likeRe(p, flags) {
    var s = String(p).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.').replace(/\*/g, '.*');
    return new RegExp('^' + s + '$', flags);
  }
  function parseVal(v) {
    if (v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  }
  function containsVal(field, v) {
    if (field == null) return false;
    if (Array.isArray(v)) {
      var arr = Array.isArray(field) ? field : [];
      return v.every(function (x) { return arr.some(function (y) { return eqv(x, y); }); });
    }
    if (typeof v === 'object') {
      var obj = typeof field === 'string' ? (function () { try { return JSON.parse(field); } catch (e) { return {}; } })() : field;
      return Object.keys(v).every(function (k) { return eqv(obj[k], v[k]); });
    }
    if (typeof v === 'string' && v.charAt(0) === '{') {
      var items = v.slice(1, -1).split(',').filter(Boolean);
      return containsVal(field, items);
    }
    return false;
  }
  function makePred(col, op, val) {
    return function (r) {
      var f = r[col];
      switch (op) {
        case 'eq': return eqv(f, val);
        case 'neq': return !eqv(f, val);
        case 'gt': return f != null && cmp(f, val) > 0;
        case 'gte': return f != null && cmp(f, val) >= 0;
        case 'lt': return f != null && cmp(f, val) < 0;
        case 'lte': return f != null && cmp(f, val) <= 0;
        case 'like': return f != null && likeRe(val).test(String(f));
        case 'ilike': return f != null && likeRe(val, 'i').test(String(f));
        case 'is': return val === null || val === 'null' ? f == null : eqv(f, val);
        case 'in': {
          var list = Array.isArray(val) ? val : String(val).replace(/^\(|\)$/g, '').split(',').map(function (x) { return x.replace(/^"|"$/g, ''); });
          return list.some(function (x) { return eqv(f, x); });
        }
        case 'cs': case 'contains': return containsVal(f, val);
        default: return true;
      }
    };
  }
  function splitTop(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }
  function parseOr(str) {
    var preds = splitTop(str).map(function (part) {
      part = part.trim();
      var m = part.match(/^(and|or)\((.*)\)$/);
      if (m) {
        var inner = parseOr(m[2]);
        return m[1] === 'and'
          ? function (r) { return inner.list.every(function (p) { return p(r); }); }
          : inner.any;
      }
      var bits = part.split('.');
      var col = bits.shift();
      var neg = false;
      if (bits[0] === 'not') { neg = true; bits.shift(); }
      var op = bits.shift();
      var val = parseVal(bits.join('.'));
      var p = makePred(col, op, val);
      return neg ? function (r) { return !p(r); } : p;
    });
    return { list: preds, any: function (r) { return preds.some(function (p) { return p(r); }); } };
  }

  // ---------- relações embutidas: select('*, tabela(col)') ----------
  function parseEmbeds(cols) {
    var res = [];
    if (!cols || typeof cols !== 'string') return res;
    var re = /(?:(\w+):)?(\w+)(?:!(\w+))?\s*\(/g, m;
    while ((m = re.exec(cols))) res.push({ alias: m[1] || m[2], table: m[2], hint: m[3] });
    return res;
  }
  function singular(t) { return t.replace(/oes$/, 'ao').replace(/ies$/, 'y').replace(/es$/, '').replace(/s$/, ''); }
  function attachEmbeds(rows, embeds, base) {
    if (!embeds.length) return rows;
    return rows.map(function (row) {
      var r = Object.assign({}, row);
      embeds.forEach(function (e) {
        var rel = table(e.table);
        var fkCandidates = [e.hint, e.table + '_id', singular(e.table) + '_id', e.table.replace(/s$/, '') + '_id'].filter(Boolean);
        var fk = fkCandidates.find(function (k) { return k in row; });
        if (fk) {
          var hit = rel.find(function (x) { return eqv(x.id, row[fk]); });
          r[e.alias] = hit ? clone(hit) : null;
        } else {
          var back = [singular(base) + '_id', base + '_id'].find(function (k) { return rel.some(function (x) { return k in x; }); });
          r[e.alias] = back ? clone(rel.filter(function (x) { return eqv(x[back], row.id); })) : [];
        }
      });
      return r;
    });
  }

  function nextId(rows) {
    if (rows.length && rows.every(function (r) { return typeof r.id === 'number' || /^\d+$/.test(String(r.id)); })) {
      return rows.reduce(function (m, r) { return Math.max(m, Number(r.id) || 0); }, 0) + 1;
    }
    if (!rows.length && window.DEMO_NUMERIC_IDS) return 1;
    return uuid();
  }

  // ---------- construtor de consultas ----------
  function Query(name) {
    this.t = name; this.op = 'select'; this.preds = []; this.orders = [];
    this.cols = '*'; this.opts = {}; this.lim = null; this.rng = null; this.mode = null; this.payload = null; this.upsertOpts = {};
  }
  var P = Query.prototype;
  P.select = function (cols, opts) { this.cols = cols || '*'; if (this.op === 'select') this.opts = opts || {}; else this.returning = true; return this; };
  P.insert = function (rows) { this.op = 'insert'; this.payload = rows; return this; };
  P.upsert = function (rows, o) { this.op = 'upsert'; this.payload = rows; this.upsertOpts = o || {}; return this; };
  P.update = function (patch) { this.op = 'update'; this.payload = patch; return this; };
  P.delete = function () { this.op = 'delete'; return this; };
  ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'].forEach(function (op) {
    P[op] = function (c, v) { this.preds.push(makePred(c, op, v)); return this; };
  });
  P.contains = function (c, v) { this.preds.push(makePred(c, 'cs', v)); return this; };
  P.containedBy = P.overlaps = function () { return this; };
  P.match = function (obj) { var self = this; Object.keys(obj || {}).forEach(function (k) { self.eq(k, obj[k]); }); return this; };
  P.not = function (c, op, v) { var p = makePred(c, op, parseVal(v)); this.preds.push(function (r) { return !p(r); }); return this; };
  P.or = function (s) { this.preds.push(parseOr(s).any); return this; };
  P.filter = function (c, op, v) { this.preds.push(makePred(c, op, parseVal(v))); return this; };
  P.textSearch = function (c, q) { return this.ilike(c, '%' + q + '%'); };
  P.order = function (c, o) { o = o || {}; this.orders.push({ c: c, asc: o.ascending !== false, nf: o.nullsFirst }); return this; };
  P.limit = function (n) { this.lim = n; return this; };
  P.range = function (a, b) { this.rng = [a, b]; return this; };
  P.single = function () { this.mode = 'single'; return this; };
  P.maybeSingle = function () { this.mode = 'maybe'; return this; };
  P.abortSignal = P.returns = P.throwOnError = function () { return this; };
  P.csv = function () { return this; };

  function hook(t, op, before, after) {
    var h = window.DEMO_HOOKS;
    if (!h) return;
    try {
      if (h.afterWrite) h.afterWrite(t, op, before, after, api);
    } catch (e) { console.error('[demo] hook', e); }
  }
  function beforeInsert(t, item) {
    var h = window.DEMO_HOOKS;
    if (h && h.beforeInsert) { try { h.beforeInsert(t, item, api); } catch (e) { console.error(e); } }
  }
  P._match = function (r) { return this.preds.every(function (p) { return p(r); }); };
  P._exec = function () {
    var self = this, rows = table(this.t), data = null, count = null;
    var now = nowIso();
    if (this.op === 'insert' || this.op === 'upsert') {
      var list = Array.isArray(this.payload) ? this.payload : [this.payload];
      var keys = String(this.upsertOpts.onConflict || (window.DEMO_PK || {})[this.t] || 'id').split(',').map(function (s) { return s.trim(); });
      data = list.map(function (src) {
        var item = clone(src) || {};
        if (self.op === 'upsert') {
          var hit = rows.find(function (r) { return keys.every(function (k) { return item[k] != null && eqv(r[k], item[k]); }); });
          if (hit) {
            if (self.upsertOpts.ignoreDuplicates) return clone(hit);
            Object.assign(hit, item);
            if ('updated_at' in hit) hit.updated_at = now;
            return clone(hit);
          }
        }
        if (item.id == null) item.id = nextId(rows);
        if (!('created_at' in item)) item.created_at = now;
        beforeInsert(self.t, item);
        rows.push(item);
        hook(self.t, 'INSERT', null, clone(item));
        return clone(item);
      });
      save();
    } else if (this.op === 'update') {
      data = [];
      rows.forEach(function (r) {
        if (!self._match(r)) return;
        var before = clone(r);
        Object.assign(r, clone(self.payload));
        hook(self.t, 'UPDATE', before, clone(r));
        if ('updated_at' in r && !(self.payload && 'updated_at' in self.payload)) r.updated_at = now;
        data.push(clone(r));
      });
      save();
    } else if (this.op === 'delete') {
      data = rows.filter(function (r) { return self._match(r); }).map(clone);
      db[this.t] = rows.filter(function (r) { return !self._match(r); });
      data.forEach(function (r) { hook(self.t, 'DELETE', r, null); });
      save();
    } else {
      var res = rows.filter(function (r) { return self._match(r); });
      this.orders.forEach(function () {});
      if (this.orders.length) {
        var ords = this.orders.slice();
        res = res.slice().sort(function (a, b) {
          for (var i = 0; i < ords.length; i++) {
            var o = ords[i], av = a[o.c], bv = b[o.c];
            if (av == null && bv != null) return o.nf ? -1 : (o.asc ? 1 : 1);
            if (bv == null && av != null) return o.nf ? 1 : -1;
            var d = cmp(av, bv);
            if (d) return o.asc ? d : -d;
          }
          return 0;
        });
      }
      count = res.length;
      if (this.rng) res = res.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) res = res.slice(0, this.lim);
      data = attachEmbeds(res.map(clone), parseEmbeds(this.cols), this.t);
      if (this.opts.head) data = null;
    }
    if (this.op !== 'select' && !this.returning && this.mode == null) {
      // o Supabase não devolve linhas sem .select(); devolver não atrapalha.
    }
    if (this.mode === 'single') {
      if (!data || data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: '' }, count: count, status: 406 };
      data = data[0];
    } else if (this.mode === 'maybe') {
      data = data && data.length ? data[0] : null;
    }
    return { data: data, error: null, count: count, status: 200, statusText: 'OK' };
  };
  P.then = function (ok, fail) {
    var self = this;
    return new Promise(function (resolve) { setTimeout(function () { resolve(self._exec()); }, 0); }).then(ok, fail);
  };
  P.catch = function (f) { return this.then(null, f); };
  P.finally = function (f) { return this.then(function (v) { f && f(); return v; }, function (e) { f && f(); throw e; }); };

  // ---------- auth ----------
  var demoUser = Object.assign({ id: 'demo-user-0001', email: 'demo@exemplo.com', nome: 'Usuário Demonstração' }, window.DEMO_USER || {});
  function makeUser() {
    return { id: demoUser.id, email: demoUser.email, aud: 'authenticated', role: 'authenticated', user_metadata: { nome: demoUser.nome, name: demoUser.nome, full_name: demoUser.nome }, app_metadata: {}, created_at: '2026-01-05T12:00:00Z' };
  }
  function makeSession() { return { access_token: 'demo-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'demo', user: makeUser() }; }
  var SIGNED_OUT_KEY = NS + ':signedOut';
  function signedOut() { try { return sessionStorage.getItem(SIGNED_OUT_KEY) === '1'; } catch (e) { return false; } }
  function setSignedOut(v) { try { v ? sessionStorage.setItem(SIGNED_OUT_KEY, '1') : sessionStorage.removeItem(SIGNED_OUT_KEY); } catch (e) {} }
  var authListeners = [];
  function emit(evt) { var s = signedOut() ? null : makeSession(); authListeners.forEach(function (cb) { try { cb(evt, s); } catch (e) { console.error(e); } }); }
  var auth = {
    getSession: function () { return Promise.resolve({ data: { session: signedOut() ? null : makeSession() }, error: null }); },
    getUser: function () { return Promise.resolve({ data: { user: signedOut() ? null : makeUser() }, error: null }); },
    signInWithPassword: function () { setSignedOut(false); setTimeout(function () { emit('SIGNED_IN'); }); return Promise.resolve({ data: { user: makeUser(), session: makeSession() }, error: null }); },
    signUp: function (o) { window.DEMO_LAST_SIGNUP = o; return Promise.resolve({ data: { user: Object.assign(makeUser(), { id: uuid(), email: (o && o.email) || 'novo@exemplo.com' }), session: null }, error: null }); },
    signOut: function () { setSignedOut(true); setTimeout(function () { emit('SIGNED_OUT'); }); return Promise.resolve({ error: null }); },
    onAuthStateChange: function (cb) {
      authListeners.push(cb);
      setTimeout(function () { try { cb('INITIAL_SESSION', signedOut() ? null : makeSession()); } catch (e) { console.error(e); } });
      return { data: { subscription: { unsubscribe: function () { authListeners = authListeners.filter(function (x) { return x !== cb; }); } } } };
    },
    updateUser: function () { return Promise.resolve({ data: { user: makeUser() }, error: null }); },
    resetPasswordForEmail: function () { return Promise.resolve({ data: {}, error: null }); },
    refreshSession: function () { return Promise.resolve({ data: { session: makeSession() }, error: null }); },
    admin: { createUser: function () { return Promise.resolve({ data: { user: makeUser() }, error: null }); } }
  };

  // ---------- storage ----------
  function placeholderSvg(label) {
    var txt = String(label || 'arquivo').split('/').pop().slice(0, 40).replace(/[<&>]/g, '');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfd8dc"/><stop offset="1" stop-color="#90a4ae"/></linearGradient></defs>' +
      '<rect width="640" height="420" fill="url(#g)"/><g fill="#607d8b" opacity=".55"><rect x="150" y="190" width="300" height="110" rx="10"/><rect x="450" y="225" width="80" height="75" rx="8"/>' +
      '<circle cx="210" cy="310" r="30"/><circle cx="470" cy="310" r="30"/></g>' +
      '<text x="320" y="70" font-family="Arial" font-size="22" text-anchor="middle" fill="#263238">Imagem de demonstração</text>' +
      '<text x="320" y="100" font-family="Arial" font-size="15" text-anchor="middle" fill="#37474f">' + txt + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.DEMO_PLACEHOLDER = placeholderSvg;
  function fileUrl(bucket, path) {
    var key = bucket + '/' + path;
    var b = ensure().__blobs || {};
    var mapped = null;
    if (typeof window.DEMO_FILE_URL === 'function') { try { mapped = window.DEMO_FILE_URL(bucket, path); } catch (e) {} }
    return memFiles.get(key) || b[key] || mapped || placeholderSvg(path);
  }
  function shrinkImage(file) {
    return new Promise(function (resolve) {
      try {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var max = 900, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          var out = c.toDataURL('image/jpeg', 0.72);
          resolve(out.length < 400000 ? out : null);
        };
        img.onerror = function () { resolve(null); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }
  function bucketApi(bucket) {
    return {
      upload: function (path, file) {
        var key = bucket + '/' + path;
        try { memFiles.set(key, URL.createObjectURL(file)); } catch (e) {}
        var files = table('__storage');
        files.push({ id: uuid(), bucket: bucket, name: path, size: file && file.size, type: file && file.type, created_at: nowIso() });
        save();
        var done = { data: { path: path, fullPath: key, id: uuid() }, error: null };
        // Imagens: guarda uma cópia reduzida para continuar visível após recarregar a página.
        if (!file || !/^image\//.test(file.type || '') || /svg/.test(file.type)) return Promise.resolve(done);
        return shrinkImage(file).then(function (url) {
          if (url) { var b = ensure(); b.__blobs = b.__blobs || {}; b.__blobs[key] = url; memFiles.set(key, url); save(); }
          return done;
        }, function () { return done; });
      },
      update: function (path, file) { return this.upload(path, file); },
      getPublicUrl: function (path) { return { data: { publicUrl: fileUrl(bucket, path) } }; },
      createSignedUrl: function (path) { return Promise.resolve({ data: { signedUrl: fileUrl(bucket, path) }, error: null }); },
      createSignedUrls: function (paths) { return Promise.resolve({ data: (paths || []).map(function (p) { return { path: p, signedUrl: fileUrl(bucket, p), error: null }; }), error: null }); },
      download: function (path) {
        return fetch(fileUrl(bucket, path)).then(function (r) { return r.blob(); })
          .then(function (b) { return { data: b, error: null }; }, function (e) { return { data: null, error: { message: String(e) } }; });
      },
      remove: function (paths) { var b = ensure().__blobs || {}; (paths || []).forEach(function (p) { memFiles.delete(bucket + '/' + p); delete b[bucket + '/' + p]; }); save(); return Promise.resolve({ data: [], error: null }); },
      list: function (prefix) {
        var items = table('__storage').filter(function (f) { return f.bucket === bucket && (!prefix || f.name.indexOf(prefix) === 0); })
          .map(function (f) { return { name: f.name.slice(prefix ? prefix.length + 1 : 0), id: f.id, metadata: { size: f.size } }; });
        return Promise.resolve({ data: items, error: null });
      },
      move: function () { return Promise.resolve({ data: {}, error: null }); },
      copy: function () { return Promise.resolve({ data: {}, error: null }); }
    };
  }
  var storage = {
    from: bucketApi,
    listBuckets: function () { return Promise.resolve({ data: [], error: null }); },
    getBucket: function (id) { return Promise.resolve({ data: { id: id, public: true }, error: null }); },
    createBucket: function () { return Promise.resolve({ data: {}, error: null }); }
  };

  // ---------- realtime (sem efeito na demo) ----------
  function channel(name, cfg) {
    var handlers = [], tracked = null;
    var presKey = (cfg && cfg.config && cfg.config.presence && cfg.config.presence.key) || 'demo';
    function firePresence() { handlers.forEach(function (h) { if (h.type === 'presence') { try { h.cb({}); } catch (e) { console.error(e); } } }); }
    var ch = {
      topic: name,
      on: function (type, filter, cb) { handlers.push({ type: type, cb: typeof filter === 'function' ? filter : cb }); return ch; },
      subscribe: function (cb) { if (typeof cb === 'function') setTimeout(function () { cb('SUBSCRIBED'); }); return ch; },
      unsubscribe: function () { return Promise.resolve('ok'); },
      send: function () { return Promise.resolve('ok'); },
      track: function (meta) { tracked = meta; setTimeout(firePresence); return Promise.resolve('ok'); },
      untrack: function () { tracked = null; return Promise.resolve('ok'); },
      presenceState: function () { var o = {}; if (tracked) o[presKey] = [tracked]; return o; }
    };
    return ch;
  }

  function rpc(name, args) {
    var fn = window.DEMO_RPC && window.DEMO_RPC[name];
    var q = {
      then: function (ok, fail) {
        return new Promise(function (resolve) {
          setTimeout(function () {
            try {
              var out = fn ? fn(args || {}, ensure(), api) : null;
              if (out && out.__error) resolve({ data: null, error: out.__error });
              else { save(); resolve({ data: out === undefined ? null : out, error: null }); }
            } catch (e) { resolve({ data: null, error: { message: e.message } }); }
          });
        }).then(ok, fail);
      }
    };
    q.single = q.maybeSingle = q.select = q.eq = q.order = q.limit = function () { return q; };
    return q;
  }

  var client = {
    from: function (t) { return new Query(t); },
    rpc: rpc,
    auth: auth,
    storage: storage,
    channel: channel,
    removeChannel: function () { return Promise.resolve('ok'); },
    removeAllChannels: function () { return Promise.resolve([]); },
    getChannels: function () { return []; },
    functions: { invoke: function () { return Promise.resolve({ data: null, error: null }); } },
    schema: function () { return client; }
  };

  var api = {
    db: function () { return ensure(); },
    table: table,
    save: save,
    reset: function () {
      try { localStorage.removeItem(NS); sessionStorage.removeItem(SIGNED_OUT_KEY); } catch (e) {}
      location.reload();
    },
    uuid: uuid,
    client: client
  };
  window.DemoDB = api;
  window.supabase = { createClient: function () { return client; } };
  window.DEMO_SUPABASE_CLIENT = client;

  // ---------- selo de demonstração ----------
  function badge() {
    if (document.getElementById('demo-badge')) return;
    var el = document.createElement('div');
    el.id = 'demo-badge';
    el.setAttribute('role', 'note');
    el.innerHTML = '<strong>DEMO</strong><span>Dados fictícios · salvos só neste navegador</span><button type="button" title="Voltar aos dados iniciais da demonstração">Restaurar dados</button>';
    var st = document.createElement('style');
    st.textContent = '#demo-badge{position:fixed;left:50%;transform:translateX(-50%);bottom:10px;z-index:2147483000;display:flex;align-items:center;gap:8px;' +
      'background:#111827;color:#f9fafb;font:12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:6px 6px 6px 10px;border-radius:999px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.25);opacity:.92;max-width:calc(100vw - 24px)}' +
      '#demo-badge strong{background:#f59e0b;color:#111827;border-radius:999px;padding:2px 7px;font-size:11px;letter-spacing:.06em}' +
      '#demo-badge span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#demo-badge button{all:unset;cursor:pointer;background:#374151;border-radius:999px;padding:4px 9px;font-size:11px}' +
      '#demo-badge button:hover{background:#4b5563}' +
      '@media (max-width:560px){#demo-badge span{display:none}}' +
      '@media print{#demo-badge{display:none}}';
    document.head.appendChild(st);
    document.body.appendChild(el);
    el.querySelector('button').addEventListener('click', function () {
      (window.DemoDB || api).reset();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', badge); else badge();
})();
