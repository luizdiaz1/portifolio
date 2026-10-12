/**
 * database/supabase.js
 * ---------------------------------------------------------
 * Ponto único de conexão com o Supabase. O Supabase é a ÚNICA
 * fonte de dados do sistema (nada é salvo em localStorage) —
 * DEMO: o cliente abaixo é simulado (demo/supabase-mock.js) e guarda os dados só no navegador.
 *
 * PARA CONFIGURAR:
 * 1. Crie um projeto gratuito em https://supabase.com (ou use um já existente).
 * 2. No SQL Editor do projeto, rode NESTA ORDEM:
 *      a) database/sql/schema.sql
 *      b) database/sql/realtime.sql
 * 3. Preencha SUPABASE_URL e SUPABASE_ANON_KEY abaixo com os
 *    valores de Project Settings > API.
 *
 * A partir daí: o app carrega os dados do Supabase ao abrir, toda
 * alteração feita por qualquer usuário é gravada no banco e
 * replicada nos outros navegadores abertos em tempo real (sem
 * precisar dar F5), via Supabase Realtime.
 * ---------------------------------------------------------
 */

const SUPABASE_URL = 'https://demo.local'; // demonstração: sem servidor real
const SUPABASE_ANON_KEY = 'demo';

const SYNC_TABLES = [
  'sensos', 'vistorias', 'nao_conformidades', 'nc_sensos', 'evidencias', 'acompanhamentos', 'retornos',
  'auditorias_10s', 'auditoria_itens', 'auditoria_acoes',
];

let supabaseClient = null;
const _configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_URL.includes('SEU-PROJETO');

/**
 * "Manter-me conectado"
 * O Supabase Auth guarda apenas os TOKENS de sessão (nunca a senha). Este
 * adaptador decide ONDE esses tokens ficam, usando o mesmo mecanismo de sessão
 * do SDK (persistSession + autoRefreshToken):
 *   - marcado    -> localStorage: a sessão sobrevive ao fechar o navegador;
 *   - desmarcado -> sessionStorage: a sessão termina ao fechar o navegador.
 * A preferência (só "1"/"0") fica em localStorage. Usuários que já tinham
 * sessão salva antes desta opção continuam conectados (comportamento antigo).
 */
const LEMBRAR_KEY = 'q10s-manter-conectado';
const SessaoStorage = (() => {
  const seguro = (fn, padrao = null) => { try { return fn(); } catch (e) { return padrao; } };
  const lembrar = () => seguro(() => localStorage.getItem(LEMBRAR_KEY)) !== '0';
  return {
    lembrar,
    /** Estado inicial do checkbox: só vem marcado se o usuário escolheu isso antes. */
    marcado: () => seguro(() => localStorage.getItem(LEMBRAR_KEY)) === '1',
    definirLembrar(valor) { seguro(() => localStorage.setItem(LEMBRAR_KEY, valor ? '1' : '0')); },
    getItem(key) {
      const local = seguro(() => localStorage.getItem(key));
      if (local !== null && lembrar()) return local;
      const sess = seguro(() => sessionStorage.getItem(key));
      return sess !== null ? sess : null;
    },
    setItem(key, value) {
      if (lembrar()) {
        seguro(() => localStorage.setItem(key, value));
        seguro(() => sessionStorage.removeItem(key));
      } else {
        seguro(() => sessionStorage.setItem(key, value));
        seguro(() => localStorage.removeItem(key));
      }
    },
    removeItem(key) {
      seguro(() => localStorage.removeItem(key));
      seguro(() => sessionStorage.removeItem(key));
    },
  };
})();
window.SessaoStorage = SessaoStorage;

if (_configured && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storage: SessaoStorage },
  });
  console.info('[Qualidade10S] Conectado ao Supabase.');
} else if (!_configured) {
  console.warn('[Qualidade10S] SUPABASE_URL/SUPABASE_ANON_KEY ainda não foram preenchidos em database/supabase.js.');
} else if (!window.supabase) {
  console.error('[Qualidade10S] SDK do Supabase não carregou (verifique a tag <script> do supabase-js no index.html / conexão com a internet).');
}

/** Cliente descartável, sem sessão salva. Usado só para cadastrar um usuário novo
 * (signUp) sem trocar a sessão do administrador que está logado. */
function criarClienteTemporario() {
  if (!_configured || !window.supabase) throw new Error('Supabase não configurado.');
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'q10s-novo-usuario',
    },
  });
}

/**
 * Salva uma evidência de ponta a ponta:
 * 1) envia o arquivo para o Storage;
 * 2) grava no banco a referência da foto;
 * 3) só retorna depois que os dois passos terminaram no servidor.
 *
 * Isso é importante porque Store.insert() é propositalmente otimista e
 * não espera o push terminar. Para fotos, o registro do banco precisa
 * estar confirmado antes de a UI considerar o upload concluído, senão
 * outro dispositivo pode abrir a vistoria antes de a evidência existir
 * na tabela `evidencias`.
 */
async function salvarEvidenciaFoto(file, ncId) {
  if (!supabaseClient) throw new Error('Supabase não configurado — não é possível enviar evidências.');

  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData || !sessionData.session) {
    throw new Error('Sua sessão expirou. Entre novamente para salvar a foto.');
  }

  const safeName = String(file.name || 'foto').replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = (window.Store && window.Store.uuid ? window.Store.uuid() : crypto.randomUUID());
  const path = `${ncId}/${id}_${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from('evidencias')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (uploadError) {
    console.error('[Qualidade10S] Falha no upload da evidência:', uploadError);
    throw uploadError;
  }

  const { data: publicData } = supabaseClient.storage.from('evidencias').getPublicUrl(path);
  if (!publicData || !publicData.publicUrl) {
    try {
      await supabaseClient.storage.from('evidencias').remove([path]);
    } catch (cleanupError) {
      console.warn('[Qualidade10S] Não foi possível remover o arquivo após falha na URL:', cleanupError);
    }
    throw new Error('O bucket de evidências não está configurado corretamente no Supabase.');
  }
  const row = {
    id,
    nc_id: ncId,
    foto_url: publicData.publicUrl,
    storage_path: path,
    nome_arquivo: file.name || safeName,
  };

  const { data, error: dbError } = await supabaseClient
    .from('evidencias')
    .insert(row)
    .select('*')
    .single();

  if (dbError) {
    // Evita deixar arquivo órfão no Storage quando o registro do banco falhar.
    try {
      await supabaseClient.storage.from('evidencias').remove([path]);
    } catch (cleanupError) {
      console.warn('[Qualidade10S] Não foi possível remover o arquivo órfão:', cleanupError);
    }
    console.error('[Qualidade10S] Falha ao registrar a evidência no banco:', dbError);
    throw dbError;
  }

  return data;
}

/** Mantido para compatibilidade com qualquer código externo que use o upload antigo. */
async function uploadEvidenciaFoto(file, ncId) {
  const row = await salvarEvidenciaFoto(file, ncId);
  return row.foto_url;
}

/** Remove uma foto do Storage. O registro da tabela é removido pela query de evidências. */
async function deleteEvidenciaFoto(path) {
  if (!supabaseClient) throw new Error('Supabase não configurado.');
  if (!path) return;
  const { error } = await supabaseClient.storage.from('evidencias').remove([path]);
  if (error) {
    console.error('[Qualidade10S] Falha ao excluir a evidência do Storage:', error);
    throw error;
  }
}

/** Busca todas as linhas de todas as tabelas no Supabase e hidrata o cache em memória (Store). */
async function pullAll() {
  if (!supabaseClient) return;
  await Promise.all(SYNC_TABLES.map(async (table) => {
    const { data, error } = await supabaseClient.from(table).select('*');
    if (error) {
      console.error(`[Qualidade10S] Falha ao carregar "${table}" do Supabase:`, error);
      return;
    }
    Store.hydrate(table, data || []);
  }));
}

/** Traduz o erro do Supabase para algo que dê pra agir em cima. */
function _mensagemErro(err) {
  const msg = (err && (err.message || err.details)) || 'erro desconhecido';
  if (/row-level security|permission denied/i.test(msg)) {
    return 'sem permissão para gravar. Seu perfil no banco não é Administrador ativo.';
  }
  if (/jwt|expired|not authenticated/i.test(msg)) return 'sessão expirada. Saia e entre novamente.';
  if (/foreign key/i.test(msg)) return 'registro pai não encontrado no servidor (' + msg + ').';
  if (/failed to fetch|network/i.test(msg)) return 'sem conexão com o servidor.';
  return msg;
}

let _ultimoAviso = 0;
function _avisarFalha(err) {
  // Uma falha costuma derrubar várias gravações seguidas: mostra um aviso só.
  const agora = Date.now();
  if (agora - _ultimoAviso < 6000) return;
  _ultimoAviso = agora;
  if (window.Utils && window.Utils.toast) {
    window.Utils.toast('Falha ao sincronizar: ' + _mensagemErro(err), 'erro');
  }
}

/** Fila de gravações: uma de cada vez, NA ORDEM em que aconteceram. Sem isso, a NC
 * (filha) podia chegar ao banco antes da vistoria (pai) e ser recusada pela chave estrangeira. */
let _fila = Promise.resolve();

/** Aguarda as gravações otimistas que já estavam na fila. */
function flushPendingWrites() {
  return _fila;
}

/** Replica uma escrita (insert/update/delete) para o Supabase. A UI já reflete a
 * mudança localmente na hora; isso só grava no servidor, em ordem. */
function push(table, op, payload) {
  if (!supabaseClient) return Promise.resolve();
  _fila = _fila.then(async () => {
    try {
      let error;
      if (op === 'insert') {
        ({ error } = await supabaseClient.from(table).insert(payload));
      } else if (op === 'update') {
        ({ error } = await supabaseClient.from(table).update(payload).eq('id', payload.id));
      } else if (op === 'delete') {
        ({ error } = await supabaseClient.from(table).delete().eq('id', payload.id));
      }
      if (error) throw error;
    } catch (err) {
      console.error(`[Qualidade10S] Falha ao sincronizar (${op} em "${table}") com o Supabase:`, err);
      _avisarFalha(err);
    }
  });
  return _fila;
}

let _rerenderTimer = null;

/** true se o usuário está com o cursor em um campo da tela (redesenhar apagaria o que ele digita). */
function _campoEmEdicao() {
  const el = document.activeElement;
  const root = document.getElementById('view-root');
  return !!(el && root && root.contains(el) && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
}

function _scheduleRerender(espera = 150) {
  clearTimeout(_rerenderTimer);
  // Pequeno debounce: agrupa vários eventos que chegam juntos (ex.: import em lote).
  _rerenderTimer = setTimeout(() => {
    // Router é declarado com `const` em app.js: não vira propriedade de `window`,
    // mas continua acessível aqui porque todos os <script> clássicos compartilham
    // o mesmo escopo global — nesse ponto (evento chegando depois do DOMContentLoaded)
    // ele já foi declarado.
    try {
      const { route, params } = Router.current;
      if (['usuarios', 'auditoria'].includes(route)) return;
      // Nova vistoria: o assistente guarda tudo em memória (campos, NCs e fotos ainda
      // não enviadas). Redesenhar a tela zeraria o assistente. Com vários usuários
      // usando o sistema, qualquer evento em tempo real (inclusive o eco da própria
      // gravação) disparava isso e apagava o que estava sendo preenchido.
      if (route === 'vistorias' && params && params.id === 'nova') return;
      // Se a pessoa está preenchendo um campo, espera ela terminar.
      if (_campoEmEdicao()) { _scheduleRerender(1200); return; }
      Router.resolve();
    } catch (e) { /* Router ainda não definido; ignora este evento */ }
  }, espera);
}

/**
 * false quando o evento só repete algo que a tela já mostra (o "eco" da própria gravação).
 * Evita redesenhar a página inteira a cada clique de quem está editando.
 */
function _mudouDeFato(table, tipo, nova, antiga) {
  try {
    if (tipo === 'DELETE') {
      const id = (antiga && antiga.id) || (nova && nova.id);
      return !!Store.getById(table, id);
    }
    if (table === 'nc_sensos') {
      return !Store.select(table, (r) => r.nc_id === nova.nc_id && r.senso === nova.senso).length;
    }
    const atual = Store.getById(table, nova.id);
    if (!atual) return true;
    return Object.keys(nova).some((k) => k !== 'updated_at' && JSON.stringify(atual[k]) !== JSON.stringify(nova[k]));
  } catch (e) {
    return true; // na dúvida, redesenha
  }
}

/** Assina mudanças em tempo real em todas as tabelas e mantém o cache em memória coerente. */
function subscribeRealtime() {
  if (!supabaseClient) return;
  const channel = supabaseClient.channel('q10s-mudancas');
  SYNC_TABLES.forEach((table) => {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        const mudou = _mudouDeFato(table, payload.eventType, payload.new, payload.old);
        Store.applyRemote(table, payload.eventType, payload.new, payload.old);
        if (mudou) _scheduleRerender();
      }
    );
  });
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') console.info('[Qualidade10S] Tempo real ativo — mudanças de outros usuários chegam automaticamente.');
  });
  return channel;
}

window.QualidadeDB = {
  client: supabaseClient,
  enabled: !!supabaseClient,
  uploadEvidenciaFoto,
  salvarEvidenciaFoto,
  deleteEvidenciaFoto,
  criarClienteTemporario,
  pullAll,
  push,
  flushPendingWrites,
  subscribeRealtime,
};
