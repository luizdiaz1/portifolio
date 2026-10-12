const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = qs('#app');

const config = window.APP_CONFIG || {};
const hasSupabase = Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && window.supabase);
/* Sessão do controle: o token emitido pelo servidor (função controle_login) é enviado em todas as
   consultas ao banco no cabeçalho x-controle-token. As políticas (RLS) do Supabase usam esse token
   para descobrir o usuário e o perfil — sem token válido o banco não devolve nem altera nada. */
const SESSION_TOKEN_KEY = 'cv_controle_sessao_token';
function sessionToken() {
  try { return sessionStorage.getItem(SESSION_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY) || ''; } catch { return ''; }
}
function storeSessionToken(token, remember) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    if (remember) localStorage.setItem(SESSION_TOKEN_KEY, token); else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {}
}
function clearSessionToken() {
  try { sessionStorage.removeItem(SESSION_TOKEN_KEY); localStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
}
function fetchWithSession(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const token = sessionToken();
  // Só nas chamadas à API de dados (/rest/v1). Storage e Realtime seguem sem alteração.
  if (token && url.includes('/rest/v1/')) {
    const headers = new Headers(init.headers || (typeof input !== 'string' && input ? input.headers : undefined));
    headers.set('x-controle-token', token);
    init = {...init, headers};
  }
  return fetch(input, init);
}
const supa = hasSupabase ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {global: {fetch: fetchWithSession}}) : null;
const STORAGE_BUCKET = config.STORAGE_BUCKET || 'assinaturas-veiculos';
const DELIVERY_PHOTOS_BUCKET = config.DELIVERY_PHOTOS_BUCKET || 'fotos-entregas';
const CONTROLE_AUTH_KEY = 'cv_controle_admin_logado';
const LEGACY_MONITORAMENTO_AUTH_KEY = 'cv_monitoramento_admin_logado';
const UI_THEME_KEY = 'cv_preferencia_tema';
const UI_SIDEBAR_KEY = 'cv_menu_recolhido';
const DRIVER_PROGRESS_KEY = 'cv_motorista_progresso_temporario';
const DRIVER_ACTIVE_MOVEMENT_KEY = 'cv_condutor_movimento_ativo';
const MAPA_PADRAO_LAT = Number(config.MAPA_PADRAO_LAT ?? -22.9106);
const MAPA_PADRAO_LNG = Number(config.MAPA_PADRAO_LNG ?? -43.1756);
const MAPA_PADRAO_ZOOM = Number(config.MAPA_PADRAO_ZOOM ?? 16);
const MAPA_CENTRAL_ENDERECO = String(config.MAPA_CENTRAL_ENDERECO || 'Praça Floriano, Centro, Rio de Janeiro - RJ');
let leafletLoader = null;

const state = {
  route: 'login',            // 'login' | 'monitor' | 'driver' (definido por applyRoute() a partir da URL e do perfil)
  loginVariant: 'controle',  // 'controle' (/login) | 'condutor' (/condutor)
  session: null,             // usuário autenticado: {id, nome, login, perfil, motorista_id, motorista_nome}
  authMode: 'legacy',        // 'server' quando o SQL de perfis está aplicado no Supabase
  tab: 'painel',
  vehicles: [],
  movements: [],
  occurrences: [],
  drivers: [],
  clients: [],
  routeStops: [],
  maintenances: [],
  users: [],
  audit: [],
  maintFilters: { search:'', status:'todos', tipo:'todos', from:'', to:'', sort:'data_desc' },
  auditFilters: { search:'', usuario:'todos', modulo:'todos', acao:'todos', from:'', to:'' },
  userSearch: '',
  filters: { search: '', status: 'todos' },
  reportFilters: { dataInicial: '', dataFinal: '', motorista: 'todos', veiculo: 'todos', status: 'todos' },
  vehicleHistoryFilters: { veiculo: 'todos', status: 'todos', search: '' },
  dashboardFilters: { periodo: '30' },
  theme: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(UI_THEME_KEY));
      return saved === 'light' ? 'light' : 'dark';
    } catch { return 'dark'; }
  })(),
  sidebarCollapsed: (() => {
    try { return JSON.parse(localStorage.getItem(UI_SIDEBAR_KEY)) === true; }
    catch { return false; }
  })(),
  selectedMovement: null,
  modal: null,
  isLoading: false,
};

const nowISO = () => new Date().toISOString();
const currentTimeValue = () => new Date().toTimeString().slice(0,5);
function isoForTodayTime(timeValue) {
  const d = new Date();
  const [h, m] = String(timeValue || currentTimeValue()).slice(0,5).split(':').map(Number);
  d.setHours(Number.isFinite(h) ? h : d.getHours(), Number.isFinite(m) ? m : d.getMinutes(), 0, 0);
  return d.toISOString();
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(16).slice(2) + Date.now());
const todayKey = () => new Date().toISOString().slice(0,10);
const dateBR = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
const timeBR = (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '—';
const dateTimeBR = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}) : '—';
const onlyDateInput = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const normalizePlate = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, 8);

function applyUiPreferences() {
  const logged = state.route === 'monitor' && isMonitorAuthenticated();
  document.body.classList.toggle('ro', logged && !can('write'));
  document.body.classList.toggle('no-del', logged && !can('delete'));
  document.body.dataset.theme = state.theme === 'light' ? 'light' : 'dark';
  document.body.dataset.sidebar = state.sidebarCollapsed ? 'collapsed' : 'expanded';
  document.documentElement.style.colorScheme = state.theme === 'light' ? 'light' : 'dark';
}
function themeToggleLabel() {
  return state.theme === 'light' ? 'Modo escuro' : 'Modo claro';
}
function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  setLocal(UI_THEME_KEY, state.theme);
  applyUiPreferences();
  render();
}
function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  setLocal(UI_SIDEBAR_KEY, state.sidebarCollapsed);
  applyUiPreferences();
  render();
}

function getLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function setLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function defaultVehicles() {
  return [
    {id:uid(), placa:'KRK7H15', renavam:'01071890848', modelo:'FIORINO', ano:2016, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'RJR5C96', renavam:'01283320077', modelo:'ARGO', ano:2022, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'TEO8F93', renavam:'', modelo:'POLO', ano:null, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'TEO8F94', renavam:'', modelo:'POLO', ano:null, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'TEO8G05', renavam:'', modelo:'POLO', ano:null, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'TXO4D66', renavam:'', modelo:'ARGO BRA.', ano:null, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()},
    {id:uid(), placa:'TYY2C11', renavam:'', modelo:'POLO TRACK', ano:null, contrato:'', status:'disponivel', observacao:'Veículo da frota comercial confirmado', created_at:nowISO()}
  ];
}
const LocalDB = {
  async init() {
    let vehicles = getLocal('cv_vehicles', null);
    if (!vehicles) {
      vehicles = defaultVehicles();
      setLocal('cv_vehicles', vehicles);
      setLocal('cv_movements', []);
    } else {
      const confirmed = defaultVehicles();
      for (const v of confirmed) {
        const idx = vehicles.findIndex(x => normalizePlate(x.placa) === v.placa);
        if (idx >= 0) vehicles[idx] = {...vehicles[idx], placa:v.placa, modelo:v.modelo, renavam:vehicles[idx].renavam || v.renavam, ano:vehicles[idx].ano || v.ano, observacao:vehicles[idx].observacao || v.observacao};
        else vehicles.push(v);
      }
      setLocal('cv_vehicles', vehicles);
    }
    state.vehicles = vehicles;
    state.movements = getLocal('cv_movements', []);
    state.occurrences = getLocal('cv_occurrences', []);
    state.drivers = getLocal('cv_drivers', []);
    state.clients = getLocal('cv_clients', []);
    state.routeStops = getLocal('cv_route_stops', []);
    state.maintenances = getLocal('cv_maintenances', []);
    state.users = getLocal('cv_users', []);
    state.audit = getLocal('cv_audit', []);
  },
  persist() {
    setLocal('cv_vehicles', state.vehicles);
    setLocal('cv_movements', state.movements);
    setLocal('cv_occurrences', state.occurrences);
    setLocal('cv_drivers', state.drivers);
    setLocal('cv_clients', state.clients);
    setLocal('cv_route_stops', state.routeStops);
    setLocal('cv_maintenances', state.maintenances);
    setLocal('cv_users', state.users);
    setLocal('cv_audit', state.audit);
  },
  async saveVehicle(vehicle) {
    const placa = normalizePlate(vehicle.placa);
    if (!placa) throw new Error('Informe a placa.');
    const payload = {...vehicle, placa,
      modelo: vehicle.modelo?.trim() || 'Veículo',
      renavam: vehicle.renavam?.trim() || '',
      ano: vehicle.ano ? Number(vehicle.ano) : null,
      status: vehicle.status || 'disponivel'};
    const existing = state.vehicles.find(v => v.id === payload.id || normalizePlate(v.placa) === placa);
    if (existing) Object.assign(existing, payload);
    else state.vehicles.unshift({...payload, id: uid(), created_at: nowISO()});
    this.persist();
  },
  async removeVehicle(id) {
    if (state.movements.some(m => m.veiculo_id === id && m.status === 'em_uso')) throw new Error('Este veículo está em uso. Registre a entrada antes de excluir.');
    state.vehicles = state.vehicles.filter(v => v.id !== id);
    this.persist();
  },
  async createMovement(data) {
    const vehicle = state.vehicles.find(v => v.id === data.veiculo_id);
    if (!vehicle) throw new Error('Veículo não encontrado.');
    if (openMovementByVehicle(vehicle.id)) throw new Error('Este veículo já está em uso.');
    const movement = {
      id: uid(), numero_uso: generateUseNumber(), veiculo_id: vehicle.id, placa: vehicle.placa, modelo: vehicle.modelo,
      motorista_id: data.motorista_id || null, motorista: data.motorista.trim(), cliente_id: data.cliente_id || null, cliente_nome: selectedClientName(data), ...destinationPayload(data),
      observacao_saida: data.observacao_saida?.trim() || '',
      saida_at: nowISO(), chegada_at: '', status: 'em_uso', assinatura_status: 'saida_assinada',
      assinatura_saida_url: data.assinatura_saida_url || '', assinatura_saida_at: nowISO(),
      assinatura_entrega_url: '', assinatura_entrega_at: '',
      assinatura_anexo_nome: '', assinatura_anexo_url: '', observacao_chegada: '', created_at: nowISO()
    };
    state.movements.unshift(movement);
    vehicle.status = 'em_uso';
    this.persist();
    await this.addRouteStopFromMovement(movement, data);
    return movement;
  },
  async closeMovement(id, data) {
    const m = state.movements.find(x => x.id === id);
    if (!m) throw new Error('Registro não encontrado.');
    m.chegada_at = isoForTodayTime(data.hora_chegada);
    m.status = 'finalizado';
    m.observacao_chegada = data.observacao_chegada || '';
    m.assinatura_entrega_url = data.assinatura_entrega_url || m.assinatura_entrega_url || '';
    m.assinatura_entrega_at = m.assinatura_entrega_url ? nowISO() : '';
    m.assinatura_status = m.assinatura_saida_url && m.assinatura_entrega_url ? 'conferida' : 'assinatura_incompleta';
    const v = state.vehicles.find(x => x.id === m.veiculo_id);
    if (v) v.status = 'disponivel';
    state.routeStops.forEach(item => { if (item.movimento_id === id && item.status === 'pendente') { item.status = 'visitado'; item.chegada_at = item.chegada_at || nowISO(); item.updated_at = nowISO(); } });
    this.persist();
    return m;
  },
  async updateMovement(id, patch) {
    const m = state.movements.find(x => x.id === id);
    if (!m) throw new Error('Registro não encontrado.');
    Object.assign(m, patch);
    this.persist();
    return m;
  },
  async attachFile(id, file) {
    const dataUrl = await fileToDataURL(file);
    return this.updateMovement(id, {assinatura_anexo_nome:file.name, assinatura_anexo_url:dataUrl});
  },

  async saveDriver(driver) {
    const payload = normalizeDriverPayload(driver);
    if (!payload.nome) throw new Error('Informe o nome do condutor.');
    const existing = state.drivers.find(d => d.id === payload.id || (payload.matricula && normalizeTextKey(d.matricula).toLowerCase() === payload.matricula.toLowerCase()) || normalizeTextKey(d.nome).toLowerCase() === payload.nome.toLowerCase());
    if (existing) Object.assign(existing, payload, {updated_at: nowISO()});
    else state.drivers.unshift({...payload, id: uid(), created_at: nowISO(), updated_at: nowISO()});
    this.persist();
    return existing || state.drivers[0];
  },
  async removeDriver(id) {
    state.drivers = state.drivers.filter(d => d.id !== id);
    this.persist();
  },
  async saveClient(client) {
    const payload = normalizeClientPayload(client);
    if (!payload.nome) throw new Error('Informe o nome do cliente.');
    const existing = state.clients.find(c => c.id === payload.id || normalizeTextKey(c.nome).toLowerCase() === payload.nome.toLowerCase());
    if (existing) Object.assign(existing, payload, {updated_at: nowISO()});
    else state.clients.unshift({...payload, id: uid(), created_at: nowISO(), updated_at: nowISO()});
    this.persist();
    return existing || state.clients[0];
  },
  async removeClient(id) {
    state.clients = state.clients.filter(c => c.id !== id);
    state.routeStops = state.routeStops.filter(s => s.cliente_id !== id);
    this.persist();
  },
  async completeCurrentRouteStop(movimentoId, photos={}) {
    const current = currentRouteStop(state.movements.find(m => m.id === movimentoId) || {id: movimentoId});
    if (!current) return null;
    current.fotos_antes = Array.isArray(photos.fotos_antes) ? photos.fotos_antes : (current.fotos_antes || []);
    current.fotos_depois = Array.isArray(photos.fotos_depois) ? photos.fotos_depois : (current.fotos_depois || []);
    current.assinatura_entrega_url = photos.assinatura_entrega_url || current.assinatura_entrega_url || '';
    current.assinatura_entrega_at = current.assinatura_entrega_url ? (current.assinatura_entrega_at || nowISO()) : '';
    current.status = 'visitado';
    current.chegada_at = current.chegada_at || nowISO();
    current.updated_at = nowISO();
    this.persist();
    return current;
  },
  async addRouteStop(data, photos={}) {
    const stop = normalizeRouteStopPayload(data);
    if (!stop.movimento_id) throw new Error('Não foi possível identificar automaticamente o roteiro em andamento.');
    if (!stop.cliente_nome && !stop.endereco) throw new Error('Informe o próximo cliente.');
    await this.completeCurrentRouteStop(stop.movimento_id, photos);
    const created = {...stop, id: uid(), ordem: nextRouteOrder(stop.movimento_id), status: 'pendente', fotos_antes: [], fotos_depois: [], created_at: nowISO(), updated_at: nowISO()};
    state.routeStops.unshift(created);
    this.setMovementCurrentClient(stop.movimento_id, created);
    this.persist();
    return created;
  },
  async finalizeRoute(movimentoId, photos={}) {
    const movement = state.movements.find(m => m.id === movimentoId);
    if (!movement) throw new Error('Uso em andamento não encontrado.');
    await this.completeCurrentRouteStop(movimentoId, photos);
    movement.updated_at = nowISO();
    this.persist();
    return movement;
  },
  setMovementCurrentClient(movimentoId, stop) {
    const movement = state.movements.find(m => m.id === movimentoId);
    if (!movement || !stop) return;
    movement.cliente_id = stop.cliente_id || null;
    movement.cliente_nome = routeStopLabel(stop);
    movement.destino = stop.endereco || routeStopLabel(stop);
    if (validLatLng(numberValue(stop.lat), numberValue(stop.lng))) {
      movement.destino_lat = stop.lat;
      movement.destino_lng = stop.lng;
    }
    movement.destino_waze_url = stop.waze_url || movement.destino_waze_url || '';
    movement.destino_maps_url = stop.maps_url || movement.destino_maps_url || '';
    movement.updated_at = nowISO();
  },
  async addRouteStopFromMovement(movement, data) {
    const clientName = selectedClientName(data) || data.cliente_nome || data.destino || '';
    if (!data.cliente_id && !clientName) return null;
    return this.addRouteStop({movimento_id: movement.id, cliente_id: data.cliente_id || null, cliente_nome: clientName, endereco: data.destino || clientName, destino_lat: data.destino_lat, destino_lng: data.destino_lng, destino_waze_url: data.destino_waze_url, destino_maps_url: data.destino_maps_url});
  },
  async saveOccurrence(data) {
    const occurrence = normalizeOccurrencePayload(data);
    if (occurrence.id) {
      const existing = state.occurrences.find(o => o.id === occurrence.id);
      if (!existing) throw new Error('Ocorrência não encontrada.');
      Object.assign(existing, occurrence, {updated_at: nowISO()});
      this.persist();
      return existing;
    }
    const created = {...occurrence, id: uid(), created_at: nowISO(), updated_at: nowISO()};
    state.occurrences.unshift(created);
    this.persist();
    return created;
  },
  async removeOccurrence(id) {
    state.occurrences = state.occurrences.filter(o => o.id !== id);
    this.persist();
  },
  async refresh() { this.persist(); }
};

/* usuarios_controle: lista as colunas explicitamente — a coluna senha_hash não é lida pelo navegador
   (o SQL de perfis bloqueia essa coluna na API). motorista_id só existe depois do SQL de perfis. */
const USER_COLUMNS_BASE = 'id,nome,login,perfil,status,ultimo_acesso,created_at,updated_at';
const USER_COLUMNS = USER_COLUMNS_BASE + ',motorista_id';
let userColumnsSupported = USER_COLUMNS;
function isMissingColumnError(err) {
  return err && (err.code === '42703' || /column .* does not exist|could not find the .* column/i.test(String(err.message || '')));
}
async function loadControleUsers() {
  let res = await supa.from('usuarios_controle').select(userColumnsSupported).order('nome', {ascending:true}).limit(500);
  if (res.error && isMissingColumnError(res.error) && userColumnsSupported !== USER_COLUMNS_BASE) {
    userColumnsSupported = USER_COLUMNS_BASE;
    res = await supa.from('usuarios_controle').select(userColumnsSupported).order('nome', {ascending:true}).limit(500);
  }
  if (res.error && (isMissingTableError(res.error) || res.error.code === '42501')) return [];
  if (res.error) throw res.error;
  return res.data || [];
}
const SupabaseDB = {
  async init() { await this.refresh(); this.subscribe(); },
  async refresh() {
    const optionalList = async (table, orderColumn, ascending=false, limit=800) => {
      let query = supa.from(table).select('*');
      if (orderColumn) query = query.order(orderColumn, {ascending});
      if (limit) query = query.limit(limit);
      const res = await query;
      if (res.error && isMissingTableError(res.error)) return [];
      if (res.error) throw res.error;
      return res.data || [];
    };
    const [vehiclesRes, movementsRes, occurrences, drivers, clients, routeStops, maintenances, users, audit] = await Promise.all([
      supa.from('veiculos_passeio').select('*').order('placa', {ascending:true}),
      supa.from('movimentacoes_veiculos').select('*').order('created_at', {ascending:false}).limit(1200),
      optionalList('ocorrencias_monitoramento', 'created_at', false, 1000),
      optionalList('motoristas_promotores', 'nome', true, 1000),
      optionalList('clientes_rota', 'nome', true, 1000),
      optionalList('movimentacoes_clientes', 'created_at', false, 2000),
      optionalList('manutencoes_veiculos', 'created_at', false, 1500),
      loadControleUsers(),
      optionalList('auditoria_controle', 'created_at', false, 1500)
    ]);
    if (vehiclesRes.error) throw vehiclesRes.error;
    if (movementsRes.error) throw movementsRes.error;
    state.vehicles = vehiclesRes.data || [];
    state.movements = movementsRes.data || [];
    state.occurrences = occurrences || [];
    state.drivers = drivers || [];
    state.clients = clients || [];
    state.routeStops = routeStops || [];
    state.maintenances = maintenances || [];
    state.users = users || [];
    state.audit = audit || [];
  },
  subscribe() {
    // Atualização em tempo real: quando qualquer dispositivo altera dados,
    // busca os dados novos e atualiza só o conteúdo da aba se algo mudou
    // de fato (ver silentRefresh) — não redesenha a tela inteira.
    if (this.channel) return;
    this.channel = supa.channel('controle-veiculos-passeio')
      .on('postgres_changes', {event:'*', schema:'public', table:'veiculos_passeio'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'movimentacoes_veiculos'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'ocorrencias_monitoramento'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'motoristas_promotores'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'clientes_rota'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'movimentacoes_clientes'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'manutencoes_veiculos'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'usuarios_controle'}, () => silentRefresh().catch(() => {}))
      .on('postgres_changes', {event:'*', schema:'public', table:'auditoria_controle'}, () => silentRefresh().catch(() => {}))
      .subscribe();
  },
  async saveVehicle(vehicle) {
    const placa = normalizePlate(vehicle.placa);
    if (!placa) throw new Error('Informe a placa.');
    const payload = {
      placa,
      modelo: vehicle.modelo?.trim() || 'Veículo',
      renavam: vehicle.renavam?.trim() || '',
      ano: vehicle.ano ? Number(vehicle.ano) : null,
      contrato: vehicle.contrato?.trim() || '',
      status: vehicle.status || 'disponivel',
      observacao: vehicle.observacao?.trim() || ''
    };
    let res;
    if (vehicle.id) res = await supa.from('veiculos_passeio').update(payload).eq('id', vehicle.id).select().single();
    else res = await supa.from('veiculos_passeio').insert(payload).select().single();
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async removeVehicle(id) {
    if (state.movements.some(m => m.veiculo_id === id && m.status === 'em_uso')) throw new Error('Este veículo está em uso. Registre a entrada antes de excluir.');
    const res = await supa.from('veiculos_passeio').delete().eq('id', id);
    if (res.error) throw res.error;
    await this.refresh();
  },
  async createMovement(data) {
    const vehicle = state.vehicles.find(v => v.id === data.veiculo_id);
    if (!vehicle) throw new Error('Veículo não encontrado.');
    if (openMovementByVehicle(vehicle.id)) throw new Error('Este veículo já está em uso.');
    const payload = {
      numero_uso: generateUseNumber(), veiculo_id: vehicle.id, placa: vehicle.placa, modelo: vehicle.modelo,
      motorista_id: data.motorista_id || null, motorista: data.motorista.trim(), cliente_id: data.cliente_id || null, cliente_nome: selectedClientName(data), ...destinationPayload(data),
      observacao_saida: data.observacao_saida?.trim() || '',
      saida_at: nowISO(), status: 'em_uso', assinatura_status: 'saida_assinada',
      assinatura_saida_url: data.assinatura_saida_url || '', assinatura_saida_at: nowISO()
    };
    let res = await supa.from('movimentacoes_veiculos').insert(payload).select().single();
    if (res.error && isMovementSchemaError(res.error)) {
      res = await supa.from('movimentacoes_veiculos').insert(stripMovementExtraFields(payload)).select().single();
    }
    if (res.error) throw res.error;
    await supa.from('veiculos_passeio').update({status:'em_uso'}).eq('id', vehicle.id);
    await this.addRouteStopFromMovement(res.data, data);
    await this.refresh();
    return state.movements.find(m => m.id === res.data.id) || res.data;
  },
  async closeMovement(id, data) {
    const m = state.movements.find(x => x.id === id);
    if (!m) throw new Error('Registro não encontrado.');
    const assinaturaEntrega = data.assinatura_entrega_url || m.assinatura_entrega_url || '';
    const patch = {
      chegada_at: isoForTodayTime(data.hora_chegada), status: 'finalizado',
      observacao_chegada: data.observacao_chegada || '',
      assinatura_entrega_url: assinaturaEntrega,
      assinatura_entrega_at: assinaturaEntrega ? nowISO() : null,
      assinatura_status: m.assinatura_saida_url && assinaturaEntrega ? 'conferida' : 'assinatura_incompleta'
    };
    const res = await supa.from('movimentacoes_veiculos').update(patch).eq('id', id).select().single();
    if (res.error) throw res.error;
    await supa.from('veiculos_passeio').update({status:'disponivel'}).eq('id', m.veiculo_id);
    await supa.from('movimentacoes_clientes').update({status:'visitado', chegada_at: nowISO()}).eq('movimento_id', id).eq('status', 'pendente');
    await this.refresh();
    return res.data;
  },
  async updateMovement(id, patch) {
    const res = await supa.from('movimentacoes_veiculos').update(patch).eq('id', id).select().single();
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async attachFile(id, file) {
    const cleanName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `${id}/${Date.now()}_${cleanName}`;
    const upload = await supa.storage.from(STORAGE_BUCKET).upload(path, file, {upsert:true});
    if (upload.error) throw upload.error;
    const {data} = supa.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return this.updateMovement(id, {assinatura_anexo_nome:file.name, assinatura_anexo_url:data.publicUrl});
  },

  async saveDriver(driver) {
    const payload = normalizeDriverPayload(driver);
    if (!payload.nome) throw new Error('Informe o nome do condutor.');
    let res;
    if (payload.id) { const {id, ...patch} = payload; res = await supa.from('motoristas_promotores').update(patch).eq('id', id).select().single(); }
    else res = await supa.from('motoristas_promotores').insert(payload).select().single();
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async removeDriver(id) {
    const res = await supa.from('motoristas_promotores').delete().eq('id', id);
    if (res.error) throw res.error;
    await this.refresh();
  },
  async saveClient(client) {
    const payload = normalizeClientPayload(client);
    if (!payload.nome) throw new Error('Informe o nome do cliente.');
    let res;
    if (payload.id) { const {id, ...patch} = payload; res = await supa.from('clientes_rota').update(patch).eq('id', id).select().single(); }
    else res = await supa.from('clientes_rota').insert(payload).select().single();
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async removeClient(id) {
    const res = await supa.from('clientes_rota').delete().eq('id', id);
    if (res.error) throw res.error;
    await this.refresh();
  },
  async uploadDeliveryPhotos(stopId, photos={}) {
    const uploadCategory = async (files, category) => {
      const result = [];
      for (const file of (files || []).slice(0, 5)) {
        const cleanName = String(file.name || 'foto.jpg').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
        const path = `${stopId}/${category}/${Date.now()}_${uid()}_${cleanName}`;
        const upload = await supa.storage.from(DELIVERY_PHOTOS_BUCKET).upload(path, file, {upsert:true, contentType:file.type || 'image/jpeg'});
        if (upload.error) throw upload.error;
        const {data} = supa.storage.from(DELIVERY_PHOTOS_BUCKET).getPublicUrl(path);
        result.push(data.publicUrl);
      }
      return result;
    };
    return {
      fotos_antes: await uploadCategory(photos.fotos_antes, 'antes'),
      fotos_depois: await uploadCategory(photos.fotos_depois, 'depois')
    };
  },
  async completeCurrentRouteStop(movimentoId, photos={}) {
    const current = currentRouteStop(state.movements.find(m => m.id === movimentoId) || {id: movimentoId});
    if (!current) return null;
    let uploaded = photos;
    const hasFiles = (photos.fotos_antes || []).length || (photos.fotos_depois || []).length;
    if (hasFiles) uploaded = await this.uploadDeliveryPhotos(current.id, photos);
    const patch = {
      status: 'visitado',
      chegada_at: current.chegada_at || nowISO(),
      fotos_antes: uploaded.fotos_antes || current.fotos_antes || [],
      fotos_depois: uploaded.fotos_depois || current.fotos_depois || [],
      assinatura_entrega_url: photos.assinatura_entrega_url || current.assinatura_entrega_url || null,
      assinatura_entrega_at: photos.assinatura_entrega_url ? nowISO() : (current.assinatura_entrega_at || null)
    };
    const res = await supa.from('movimentacoes_clientes').update(patch).eq('id', current.id).select().single();
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async addRouteStop(data, photos={}) {
    const payload = normalizeRouteStopPayload(data);
    if (!payload.movimento_id) throw new Error('Não foi possível identificar automaticamente o roteiro em andamento.');
    if (!payload.cliente_nome && !payload.endereco) throw new Error('Informe o próximo cliente.');
    await this.completeCurrentRouteStop(payload.movimento_id, photos);
    const res = await supa.from('movimentacoes_clientes').insert({...payload, ordem: nextRouteOrder(payload.movimento_id), status:'pendente', fotos_antes:[], fotos_depois:[]}).select().single();
    if (res.error) throw res.error;
    await this.setMovementCurrentClient(payload.movimento_id, res.data);
    await this.refresh();
    return res.data;
  },
  async finalizeRoute(movimentoId, photos={}) {
    const movement = state.movements.find(m => m.id === movimentoId);
    if (!movement) throw new Error('Uso em andamento não encontrado.');
    await this.completeCurrentRouteStop(movimentoId, photos);
    await this.refresh();
    return state.movements.find(m => m.id === movimentoId) || movement;
  },
  async setMovementCurrentClient(movimentoId, stop) {
    if (!movimentoId || !stop) return;
    const patch = {
      cliente_id: stop.cliente_id || null,
      cliente_nome: routeStopLabel(stop),
      destino: stop.endereco || routeStopLabel(stop)
    };
    if (validLatLng(numberValue(stop.lat), numberValue(stop.lng))) {
      patch.destino_lat = stop.lat;
      patch.destino_lng = stop.lng;
    }
    if (stop.waze_url) patch.destino_waze_url = stop.waze_url;
    if (stop.maps_url) patch.destino_maps_url = stop.maps_url;
    const res = await supa.from('movimentacoes_veiculos').update(patch).eq('id', movimentoId);
    if (res.error && !isMovementSchemaError(res.error)) throw res.error;
  },
  async addRouteStopFromMovement(movement, data) {
    const clientName = selectedClientName(data) || data.cliente_nome || data.destino || '';
    if (!data.cliente_id && !clientName) return null;
    return this.addRouteStop({movimento_id: movement.id, cliente_id: data.cliente_id || null, cliente_nome: clientName, endereco: data.destino || clientName, destino_lat: data.destino_lat, destino_lng: data.destino_lng, destino_waze_url: data.destino_waze_url, destino_maps_url: data.destino_maps_url});
  },
  async saveOccurrence(data) {
    const payload = normalizeOccurrencePayload(data);
    let res;
    if (payload.id) {
      const id = payload.id;
      delete payload.id;
      res = await supa.from('ocorrencias_monitoramento').update(payload).eq('id', id).select().single();
    } else {
      delete payload.id;
      res = await supa.from('ocorrencias_monitoramento').insert(payload).select().single();
    }
    if (res.error) throw res.error;
    await this.refresh();
    return res.data;
  },
  async removeOccurrence(id) {
    const res = await supa.from('ocorrencias_monitoramento').delete().eq('id', id);
    if (res.error) throw res.error;
    await this.refresh();
  }
};


/* ===== Manutenção, Usuários e Auditoria: acesso a dados ===== */
const TODAY_ISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateOnlyBR = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const MAINT_STATUS = {
  agendada:['Agendada','warn'], em_andamento:['Em andamento','info'], aguardando_peca:['Aguardando peça','warn'],
  concluida:['Concluída','signed'], cancelada:['Cancelada','occurrence']
};
const MAINT_ACTIVE = ['em_andamento','aguardando_peca'];
const MAINT_TIPOS = ['Preventiva','Corretiva','Revisão','Troca de óleo','Pneus','Freios','Elétrica','Funilaria / Pintura','Outro'];
const PERFIS = ['Administrador','Gestor','Visualizador','Condutor'];
function maintStatusBadge(st) { const m = MAINT_STATUS[st] || [st || '—','done']; return `<span class="status ${m[1]}">${m[0]}</span>`; }
function normalizeMaintenancePayload(d={}) {
  const v = state.vehicles.find(x => x.id === d.veiculo_id);
  if (!v) throw new Error('Selecione um veículo.');
  const motivo = String(d.motivo || '').trim();
  if (!motivo) throw new Error('Informe o motivo / descrição.');
  const status = MAINT_STATUS[d.status] ? d.status : 'agendada';
  const data = d.data || TODAY_ISO();
  let conclusao = d.data_conclusao || null;
  if (status === 'concluida' && !conclusao) conclusao = TODAY_ISO();
  if (status !== 'concluida') conclusao = d.data_conclusao || null;
  if (conclusao && conclusao < data) throw new Error('A data de conclusão não pode ser anterior à data da manutenção.');
  const payload = {
    veiculo_id: v.id, placa: v.placa, modelo: v.modelo || '', data, tipo: String(d.tipo || 'Outro').trim() || 'Outro', motivo, status,
    responsavel: String(d.responsavel || '').trim() || null, previsao_conclusao: d.previsao_conclusao || null,
    data_conclusao: conclusao, observacao: String(d.observacao || '').trim() || null
  };
  if (d.id) payload.id = d.id;
  return payload;
}
/* Mensagens ao usuário: nunca expõe detalhes técnicos (banco, SQL, rede). Detalhes vão para o console. */
function userMessage(err, fallback = 'Não foi possível concluir a ação. Tente novamente.') {
  try { console.error(err); } catch {}
  const msg = String(err?.message || '');
  const technical = !msg || err?.code || err?.details || err?.hint
    || /supabase|postgres|postgrest|relation|column|schema|violates|constraint|duplicate key|jwt|fetch|network|failed to|sql|pgrst|row-level|policy|undefined|null|unexpected|json|syntaxerror|typeerror|referenceerror|bucket|storage|https|config\.js|tabela/i.test(msg);
  if (isMissingTableError(err)) return 'Este recurso ainda não está disponível. Fale com o administrador do sistema.';
  return technical ? fallback : msg;
}
function dbWriteError(err) {
  return userMessage(err, 'Não foi possível salvar. Tente novamente.');
}
const ExtraLocal = {
  async saveMaintenance(data) {
    const payload = normalizeMaintenancePayload(data);
    if (payload.id) {
      const ex = state.maintenances.find(x => x.id === payload.id); if (!ex) throw new Error('Manutenção não encontrada.');
      Object.assign(ex, payload, {updated_at: nowISO()}); this.persist(); return ex;
    }
    const created = {...payload, id: uid(), criado_por: currentUser().nome, created_at: nowISO(), updated_at: nowISO()};
    state.maintenances.unshift(created); this.persist(); return created;
  },
  async removeMaintenance(id) { state.maintenances = state.maintenances.filter(x => x.id !== id); this.persist(); },
  async saveUser(data) {
    const row = {nome: data.nome, login: data.login, perfil: data.perfil, status: data.status};
    if (data.senha_hash) row.senha_hash = data.senha_hash;
    if ('motorista_id' in data) row.motorista_id = data.motorista_id || null;
    if (row.motorista_id && state.users.some(u => u.motorista_id === row.motorista_id && u.id !== data.id)) throw new Error('Este condutor já está vinculado a outro usuário.');
    if (data.id) { const ex = state.users.find(u => u.id === data.id); if (!ex) throw new Error('Usuário não encontrado.'); Object.assign(ex, row, {updated_at: nowISO()}); this.persist(); return ex; }
    const created = {...row, id: uid(), created_at: nowISO(), updated_at: nowISO(), ultimo_acesso: null};
    state.users.push(created); this.persist(); return created;
  },
  async removeUser(id) { state.users = state.users.filter(u => u.id !== id); this.persist(); },
  async touchUserLogin(id) { const u = state.users.find(x => x.id === id); if (u) { u.ultimo_acesso = nowISO(); this.persist(); } },
  async addAudit(entry) { const row = {...entry, id: uid(), created_at: nowISO()}; state.audit.unshift(row); state.audit = state.audit.slice(0, 1500); this.persist(); return row; }
};
const ExtraSupabase = {
  async saveMaintenance(data) {
    const payload = normalizeMaintenancePayload(data);
    let res;
    if (payload.id) { const id = payload.id; delete payload.id; res = await supa.from('manutencoes_veiculos').update(payload).eq('id', id).select().single(); }
    else { payload.criado_por = currentUser().nome; res = await supa.from('manutencoes_veiculos').insert(payload).select().single(); }
    if (res.error) throw res.error;
    await this.refresh(); return res.data;
  },
  async removeMaintenance(id) { const res = await supa.from('manutencoes_veiculos').delete().eq('id', id); if (res.error) throw res.error; await this.refresh(); },
  async saveUser(data) {
    const row = {nome: data.nome, login: data.login, perfil: data.perfil, status: data.status};
    if (data.senha_hash) row.senha_hash = data.senha_hash;
    if ('motorista_id' in data) row.motorista_id = data.motorista_id || null;
    let res;
    if (data.id) res = await supa.from('usuarios_controle').update(row).eq('id', data.id).select(userColumnsSupported).single();
    else res = await supa.from('usuarios_controle').insert(row).select(userColumnsSupported).single();
    if (res.error && isMissingColumnError(res.error) && 'motorista_id' in row) throw new Error('O perfil Condutor ainda não está habilitado no banco. Fale com o administrador do sistema.');
    if (res.error && res.error.code === '23514') throw new Error('Este perfil ainda não está habilitado no banco. Fale com o administrador do sistema.');
    if (res.error) {
      if (res.error.code === '23505') throw new Error(/motorista/i.test(String(res.error.message || '') + String(res.error.details || '')) ? 'Este condutor já está vinculado a outro usuário.' : 'Já existe um usuário com esse e-mail.');
      throw res.error;
    }
    await this.refresh(); return res.data;
  },
  async removeUser(id) { const res = await supa.from('usuarios_controle').delete().eq('id', id); if (res.error) throw res.error; await this.refresh(); },
  async touchUserLogin(id) { await supa.from('usuarios_controle').update({ultimo_acesso: nowISO()}).eq('id', id); },
  async addAudit(entry) {
    const res = await supa.from('auditoria_controle').insert(entry).select().single();
    if (res.error) throw res.error;
    state.audit.unshift(res.data); state.audit = state.audit.slice(0, 1500); return res.data;
  }
};
Object.assign(LocalDB, ExtraLocal);
Object.assign(SupabaseDB, ExtraSupabase);

const DB = hasSupabase ? SupabaseDB : LocalDB;

/* ===== Sessão, perfis e auditoria automática ===== */
const CONTROLE_USER_KEY = 'cv_controle_usuario';
function storedUser() {
  try {
    const raw = sessionStorage.getItem(CONTROLE_USER_KEY) || localStorage.getItem(CONTROLE_USER_KEY);
    const u = raw ? JSON.parse(raw) : null;
    return u && u.id && u.nome ? u : null;
  } catch { return null; }
}
const STAFF_PERFIS = ['Administrador','Gestor','Visualizador'];
const CONDUTOR_PERFIL = 'Condutor';
function isStaffPerfil(p) { return STAFF_PERFIS.includes(p); }
function currentUser() {
  const u = state.session;
  if (!u) return {id:null, nome:'', login:'', perfil:'Visualizador', motorista_id:null, motorista_nome:''};
  // No modo servidor o perfil vem sempre da sessão validada pelo banco.
  if (state.authMode === 'server') return u;
  const live = (state.users || []).find(x => x.id === u.id);
  return live ? {...u, id:live.id, nome:live.nome, login:live.login, perfil:live.perfil, motorista_id: live.motorista_id ?? u.motorista_id ?? null} : u;
}
function normalizeSession(u) {
  if (!u || !u.id) return null;
  return {id:u.id, nome:u.nome || '', login:u.login || '', perfil:u.perfil || 'Visualizador', motorista_id:u.motorista_id || null, motorista_nome:u.motorista_nome || ''};
}
/* Área do condutor = usuário autenticado com perfil Condutor. */
function isCondutorArea() { return Boolean(state.session) && currentUser().perfil === CONDUTOR_PERFIL; }
function condutorDriverRecord() {
  const u = currentUser();
  if (!u.motorista_id) return null;
  return (state.drivers || []).find(d => d.id === u.motorista_id) || {id:u.motorista_id, nome:u.motorista_nome || u.nome, matricula:'', setor:'', telefone:''};
}
function setCurrentUser(u, remember) {
  const snap = JSON.stringify({id:u.id, nome:u.nome, login:u.login, perfil:u.perfil, motorista_id:u.motorista_id || null});
  sessionStorage.setItem(CONTROLE_USER_KEY, snap);
  if (remember) localStorage.setItem(CONTROLE_USER_KEY, snap); else localStorage.removeItem(CONTROLE_USER_KEY);
}
function clearCurrentUser() { sessionStorage.removeItem(CONTROLE_USER_KEY); localStorage.removeItem(CONTROLE_USER_KEY); }
function firstName(n='') { return String(n).trim().split(/\s+/)[0] || ''; }
function can(action) {
  const p = currentUser().perfil;
  if (action === 'admin' || action === 'delete') return p === 'Administrador';
  if (action === 'write') return p !== 'Visualizador';
  return true;
}
async function hashPassword(login, senha) {
  if (!(window.crypto && crypto.subtle)) throw new Error('Não foi possível proteger a senha neste navegador. Tente em outro navegador.');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`demo-controle:${String(login).trim().toLowerCase()}:${senha}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function logAudit({acao, modulo, registro='', detalhes='', user=null}) {
  try {
    const u = user || currentUser();
    await DB.addAudit({usuario:u.nome, perfil:u.perfil, acao, modulo, registro:String(registro || ''), detalhes:String(detalhes || '')});
  } catch (err) { console.warn('Auditoria não registrada:', err); }
}
(function wireAudit() {
  const live = () => state.route === 'monitor' && isMonitorAuthenticated();
  const READONLY_MSG = 'Seu perfil permite apenas visualizar.';
  const guard = (name, perm) => {
    const orig = DB[name].bind(DB);
    DB[name] = async function(...args) {
      if (live() && !can(perm)) throw new Error(READONLY_MSG);
      return orig(...args);
    };
  };
  ['createMovement','closeMovement','updateMovement','attachFile','completeCurrentRouteStop','addRouteStop','finalizeRoute','addRouteStopFromMovement','setMovementCurrentClient']
    .forEach(n => { if (typeof DB[n] === 'function') guard(n, 'write'); });
  const wrap = (name, spec) => {
    const orig = DB[name].bind(DB);
    DB[name] = async function(...args) {
      if (live() && spec.perm && !can(spec.perm)) throw new Error(READONLY_MSG);
      let pre = null; try { pre = spec.pre ? spec.pre(...args) : null; if (pre) pre = {...pre}; } catch {}
      const res = await orig(...args);
      try { if (live()) { const e = spec.entry(args, res, pre); if (e) logAudit({modulo: spec.modulo, ...e}); } } catch (err) { console.warn(err); }
      return res;
    };
  };
  const chg = (pre, d, field, label) => (pre && d[field] !== undefined && String(pre[field] ?? '') !== String(d[field] ?? '') ? `${label}: ${pre[field] || '—'} → ${d[field] || '—'}` : '');
  wrap('saveVehicle', {perm:'write', modulo:'Veículos', pre:d => d.id ? state.vehicles.find(v => v.id === d.id) : null,
    entry:([d],r,pre) => ({acao: pre ? 'Alterou veículo' : 'Cadastrou veículo', registro: normalizePlate(d.placa), detalhes:[d.modelo, chg(pre,d,'status','status')].filter(Boolean).join(' • ')})});
  wrap('removeVehicle', {perm:'delete', modulo:'Veículos', pre:id => state.vehicles.find(v => v.id === id), entry:([id],r,pre) => ({acao:'Excluiu veículo', registro: pre?.placa || id, detalhes: pre?.modelo || ''})});
  wrap('saveDriver', {perm:'write', modulo:'Condutores', pre:d => d.id ? state.drivers.find(x => x.id === d.id) : null, entry:([d],r,pre) => ({acao: pre ? 'Alterou condutor' : 'Cadastrou condutor', registro: d.nome || '', detalhes:[d.matricula, chg(pre,d,'status','status')].filter(Boolean).join(' • ')})});
  wrap('removeDriver', {perm:'delete', modulo:'Condutores', pre:id => state.drivers.find(x => x.id === id), entry:([id],r,pre) => ({acao:'Excluiu condutor', registro: pre?.nome || id})});
  wrap('saveClient', {perm:'write', modulo:'Clientes', pre:d => d.id ? state.clients.find(x => x.id === d.id) : null, entry:([d],r,pre) => ({acao: pre ? 'Alterou cliente' : 'Cadastrou cliente', registro: d.nome || '', detalhes: chg(pre,d,'status','status')})});
  wrap('removeClient', {perm:'delete', modulo:'Clientes', pre:id => state.clients.find(x => x.id === id), entry:([id],r,pre) => ({acao:'Excluiu cliente', registro: pre?.nome || id})});
  wrap('saveOccurrence', {perm:'write', modulo:'Ocorrências', pre:d => d.id ? state.occurrences.find(x => x.id === d.id) : null,
    entry:([d],r,pre) => ({acao: !pre ? 'Registrou ocorrência' : (d.status === 'resolvida' && pre.status !== 'resolvida' ? 'Resolveu ocorrência' : 'Alterou ocorrência'), registro: d.placa || pre?.placa || '', detalhes:[d.tipo || pre?.tipo, chg(pre,d,'status','status')].filter(Boolean).join(' • ')})});
  wrap('removeOccurrence', {perm:'delete', modulo:'Ocorrências', pre:id => state.occurrences.find(x => x.id === id), entry:([id],r,pre) => ({acao:'Excluiu ocorrência', registro: pre?.placa || id, detalhes: pre?.tipo || ''})});
  wrap('saveMaintenance', {perm:'write', modulo:'Manutenção', pre:d => d.id ? state.maintenances.find(x => x.id === d.id) : null,
    entry:([d],r,pre) => { const st = r?.status || d.status; const placa = r?.placa || pre?.placa || '';
      const acao = !pre ? 'Criou manutenção' : (st === 'concluida' && pre.status !== 'concluida' ? 'Concluiu manutenção' : (st === 'cancelada' && pre.status !== 'cancelada' ? 'Cancelou manutenção' : 'Alterou manutenção'));
      return {acao, registro: placa, detalhes:[r?.motivo || d.motivo, pre && pre.status !== st ? `status: ${(MAINT_STATUS[pre.status]||[pre.status])[0]} → ${(MAINT_STATUS[st]||[st])[0]}` : ''].filter(Boolean).join(' • ')}; }});
  wrap('removeMaintenance', {perm:'delete', modulo:'Manutenção', pre:id => state.maintenances.find(x => x.id === id), entry:([id],r,pre) => ({acao:'Excluiu manutenção', registro: pre?.placa || id, detalhes: pre?.motivo || ''})});
  wrap('saveUser', {perm:'admin', modulo:'Usuários', pre:d => d.id ? state.users.find(x => x.id === d.id) : null,
    entry:([d],r,pre) => ({acao: pre ? 'Alterou usuário' : 'Criou usuário', registro: d.login || pre?.login || '', detalhes:[d.perfil, chg(pre,d,'perfil','perfil'), chg(pre,d,'status','status'), d.senha_hash && pre ? 'senha redefinida' : ''].filter(Boolean).join(' • ')})});
  wrap('removeUser', {perm:'admin', modulo:'Usuários', pre:id => state.users.find(x => x.id === id), entry:([id],r,pre) => ({acao:'Excluiu usuário', registro: pre?.login || id, detalhes: pre?.nome || ''})});
})();
let autoRefreshTimer = null;

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const signaturePadResizers = [];
document.addEventListener('controle:refreshDestinationMaps', () => {
  signaturePadResizers.forEach(fn => { try { fn(); } catch {} });
});
async function uploadSignatureDataUrl(prefix, dataUrl) {
  if (!dataUrl) return '';
  if (!hasSupabase || !supa) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${prefix}/${Date.now()}_assinatura.png`;
  const upload = await supa.storage.from(STORAGE_BUCKET).upload(path, blob, {upsert: true, contentType: 'image/png'});
  if (upload.error) throw upload.error;
  const {data} = supa.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function signaturePadHtml(name, {label = 'Assinatura', required = true, hint = 'Assine no quadro acima com o dedo ou o mouse.'} = {}) {
  return `
    <div class="field full" data-signature-field>
      <label>${label}${required ? '' : ' <span class="muted">(opcional)</span>'}</label>
      <div class="signature-pad" data-signature-required="${required ? '1' : '0'}">
        <canvas data-signature-canvas></canvas>
        <button type="button" class="btn ghost small" data-signature-clear>Limpar</button>
      </div>
      <input type="hidden" name="${name}" data-signature-input>
      <span class="signature-hint muted">${hint}</span>
    </div>`;
}

function initSignaturePad(field) {
  if (!field || field.dataset.signatureReady === '1') return;
  field.dataset.signatureReady = '1';
  const canvas = qs('[data-signature-canvas]', field);
  const input = qs('[data-signature-input]', field);
  const clearBtn = qs('[data-signature-clear]', field);
  if (!canvas || !input) return;
  const ctx = canvas.getContext('2d');
  input.value = '';
  let drawing = false;
  let hasStroke = false;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
  }
  resize();
  signaturePadResizers.push(resize);
  window.addEventListener('resize', resize);
  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const src = e.touches && e.touches[0] ? e.touches[0] : e;
    return {x: src.clientX - rect.left, y: src.clientY - rect.top};
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStroke = true;
    input.value = canvas.toDataURL('image/png');
  }
  function end() { drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, {passive: false});
  canvas.addEventListener('touchmove', move, {passive: false});
  canvas.addEventListener('touchend', end);
  if (clearBtn) clearBtn.onclick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStroke = false;
    input.value = '';
  };
}
function initSignaturePads(root = document) {
  qsa('[data-signature-field]', root).forEach(initSignaturePad);
}
function validateSignatures(form) {
  const fields = qsa('[data-signature-field]', form);
  for (const field of fields) {
    const pad = qs('.signature-pad', field);
    const input = qs('[data-signature-input]', field);
    if (pad?.dataset.signatureRequired === '1' && !input?.value) return false;
  }
  return true;
}


function numberValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
function formatLatLng(lat, lng) {
  return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}
function isEmptySavedDestinationText(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^(destino salvo|ponto selecionado no mapa)\s*\(\s*0+(?:[.,]0+)?\s*,\s*0+(?:[.,]0+)?\s*\)$/i.test(text);
}
function sanitizeDestinationFormData(data={}) {
  const copy = {...data};
  const lat = numberValue(copy.destino_lat);
  const lng = numberValue(copy.destino_lng);
  if (!validLatLng(lat, lng)) {
    copy.destino_lat = '';
    copy.destino_lng = '';
    copy.destino_waze_url = '';
    copy.destino_maps_url = '';
    if (isEmptySavedDestinationText(copy.destino)) copy.destino = '';
  }
  return copy;
}
function buildWazeUrlFromCoords(lat, lng) {
  return validLatLng(lat, lng) ? `https://waze.com/ul?ll=${formatLatLng(lat, lng)}&navigate=yes&utm_source=controle_frota_comercial` : '';
}
function buildWazeUrlFromText(destination='') {
  const dest = String(destination || '').trim();
  return dest ? `https://waze.com/ul?q=${encodeURIComponent(dest)}&navigate=yes&utm_source=controle_frota_comercial` : '';
}
function originParamFromLocation(origin) {
  return origin && validLatLng(origin.lat, origin.lng) ? `origin=${formatLatLng(origin.lat, origin.lng)}&` : '';
}
function buildMapsUrlFromCoords(lat, lng, origin=null) {
  if (!validLatLng(lat, lng)) return '';
  return `https://www.google.com/maps/dir/?api=1&${originParamFromLocation(origin)}destination=${formatLatLng(lat, lng)}&travelmode=driving`;
}
function buildMapsUrlFromText(destination='', origin=null) {
  const dest = String(destination || '').trim();
  return dest ? `https://www.google.com/maps/dir/?api=1&${originParamFromLocation(origin)}destination=${encodeURIComponent(dest)}&travelmode=driving` : '';
}
function routeFallbackUrl(provider, destination='', lat=null, lng=null, origin=null) {
  if (provider === 'maps') return validLatLng(lat, lng) ? buildMapsUrlFromCoords(lat, lng, origin) : buildMapsUrlFromText(destination, origin);
  return validLatLng(lat, lng) ? buildWazeUrlFromCoords(lat, lng) : buildWazeUrlFromText(destination);
}
function routeLinkHtml(provider, label, destination='', lat=null, lng=null, className='') {
  const href = routeFallbackUrl(provider, destination, lat, lng);
  if (!href) return '';
  const attrs = [
    `href="${escapeHtml(href)}"`,
    `target="_blank"`,
    `rel="noopener"`,
    `data-route-provider="${escapeHtml(provider)}"`,
    `data-route-destination="${escapeHtml(destination || '')}"`
  ];
  if (validLatLng(lat, lng)) {
    attrs.push(`data-route-lat="${escapeHtml(lat)}"`, `data-route-lng="${escapeHtml(lng)}"`);
  }
  return `<a${className ? ` class="${escapeHtml(className)}"` : ''} ${attrs.join(' ')}>${escapeHtml(label)}</a>`;
}
function getCurrentLocationForRoute() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
      () => resolve(null),
      {enableHighAccuracy:true, timeout:10000, maximumAge:60000}
    );
  });
}
async function openRouteLink(link) {
  const provider = link?.dataset?.routeProvider;
  if (!provider) return;
  const destination = link.dataset.routeDestination || '';
  const lat = numberValue(link.dataset.routeLat);
  const lng = numberValue(link.dataset.routeLng);
  toast('Permita a localização para usar sua posição como ponto de partida.');
  const origin = await getCurrentLocationForRoute();
  if (!origin) toast('Localização não liberada. Abrindo rota sem ponto de partida definido.');
  const url = routeFallbackUrl(provider, destination, lat, lng, origin);
  if (!url) {
    toast('Cliente/ponto indisponível para rota.');
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    toast('O navegador bloqueou a nova aba. Abrindo rota nesta tela.');
    location.href = url;
  }
}
function destinationPayload(data) {
  const destino = String(data.destino || '').trim();
  const lat = numberValue(data.destino_lat);
  const lng = numberValue(data.destino_lng);
  const payload = { destino };
  if (validLatLng(lat, lng)) {
    payload.destino_lat = lat;
    payload.destino_lng = lng;
    payload.destino_waze_url = data.destino_waze_url || buildWazeUrlFromCoords(lat, lng);
    payload.destino_maps_url = data.destino_maps_url || buildMapsUrlFromCoords(lat, lng);
  } else if (destino) {
    payload.destino_waze_url = data.destino_waze_url || buildWazeUrlFromText(destino);
    payload.destino_maps_url = data.destino_maps_url || buildMapsUrlFromText(destino);
  }
  return payload;
}
function stripDestinationExtraFields(payload) {
  const copy = {...payload};
  delete copy.destino_lat;
  delete copy.destino_lng;
  delete copy.destino_waze_url;
  delete copy.destino_maps_url;
  return copy;
}
function stripMovementExtraFields(payload) {
  const copy = stripDestinationExtraFields(payload);
  delete copy.motorista_id;
  delete copy.cliente_id;
  delete copy.cliente_nome;
  return copy;
}
function isMissingTableError(err) {
  const text = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''}`.toLowerCase();
  return err?.code === '42P01' || err?.code === 'PGRST205' || text.includes('could not find the table') || text.includes('relation') && text.includes('does not exist');
}
function isMovementSchemaError(err) {
  const text = `${err?.code || ''} ${err?.message || ''} ${err?.details || ''}`.toLowerCase();
  return text.includes('destino_lat') || text.includes('destino_lng') || text.includes('destino_waze_url') || text.includes('destino_maps_url') || text.includes('motorista_id') || text.includes('cliente_id') || text.includes('cliente_nome') || text.includes('schema cache');
}
function destinationLinks(m) {
  const lat = numberValue(m.destino_lat);
  const lng = numberValue(m.destino_lng);
  const destino = String(m.destino || m.cliente_nome || '').trim();
  const waze = routeFallbackUrl('waze', destino, lat, lng) || m.destino_waze_url || '';
  const maps = routeFallbackUrl('maps', destino, lat, lng) || m.destino_maps_url || '';
  return {waze, maps, destino, lat, lng};
}
function destinationCellHtml(m) {
  const links = destinationLinks(m);
  const buttons = [
    routeLinkHtml('waze', 'Waze', links.destino, links.lat, links.lng),
    routeLinkHtml('maps', 'Mapa', links.destino, links.lat, links.lng)
  ].filter(Boolean).join(' • ');
  return `${escapeHtml(m.destino || m.cliente_nome || '—')}${buttons ? `<br><span class="destination-table-links">${buttons}</span>` : ''}`;
}

function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(true);
  if (leafletLoader) return leafletLoader;
  leafletLoader = new Promise(resolve => {
    if (!qs('link[data-leaflet-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet-css', '1');
      document.head.appendChild(link);
    }
    const existingScript = qs('script[data-leaflet-js]');
    if (existingScript && !window.L?.map) {
      existingScript.addEventListener('load', () => resolve(Boolean(window.L?.map)), {once:true});
      existingScript.addEventListener('error', () => resolve(false), {once:true});
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-leaflet-js', '1');
    script.onload = () => resolve(Boolean(window.L?.map));
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return leafletLoader;
}

function destinationPickerHtml(options={}) {
  const label = escapeHtml(options.label || 'Cliente / ponto da rota');
  const placeholder = escapeHtml(options.placeholder || 'Digite o cliente, endereço ou selecione no mapa');
  const required = options.required === false ? '' : ' required';
  const context = escapeHtml(options.context || 'rota');
  const autoSave = options.autoSave === false ? '0' : '1';
  const helper = options.helper || 'Digite uma parte do cliente/endereço e clique em <strong>Buscar</strong>, ou toque direto no mapa para marcar o ponto. Depois o sistema libera os links do Waze e do mapa.';
  return `<div class="field full destination-picker" data-destination-picker data-destination-context="${context}" data-destination-autosave="${autoSave}">
    <label>${label}</label>
    <input name="destino"${required} data-destination-input placeholder="${placeholder}" autocomplete="off" />
    <input type="hidden" name="destino_lat" data-destination-lat>
    <input type="hidden" name="destino_lng" data-destination-lng>
    <input type="hidden" name="destino_waze_url" data-destination-waze>
    <input type="hidden" name="destino_maps_url" data-destination-maps>
    <div class="destination-actions">
      <button class="btn small" type="button" data-destination-search>Buscar</button>
      <button class="btn small" type="button" data-destination-locate>Centralizar na base</button>
      <button class="btn small" type="button" data-destination-clear>Limpar ponto</button>
    </div>
    <div class="destination-results" data-destination-results></div>
    <div class="destination-map" data-destination-map><span>Carregando mapa...</span></div>
    <div class="destination-details" data-destination-details>${helper}</div>
  </div>`;
}

function refreshDestinationMaps(root=document) {
  qsa('[data-destination-map]', root).forEach(mapEl => {
    const leafletMap = mapEl._controleCarrosLeafletMap;
    if (!leafletMap) return;
    const marker = mapEl._controleCarrosLeafletMarker;
    const refresh = () => {
      try { leafletMap.invalidateSize(false); } catch {}
      try { if (marker?.getLatLng) leafletMap.panTo(marker.getLatLng(), {animate:false}); } catch {}
    };
    refresh();
    requestAnimationFrame(refresh);
    [80, 180, 420, 900].forEach(ms => setTimeout(refresh, ms));
  });
}

async function nominatimSearch(query, limit=5) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Busca indisponível. Selecione o ponto no mapa.');
  return await res.json();
}
async function nominatimReverse(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=pt-BR&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  const data = await res.json();
  return data.display_name || '';
}

function initDestinationPickers(root=document) {
  qsa('[data-destination-picker]', root).forEach(picker => {
    if (picker.dataset.destinationReady === '1') return;
    picker.dataset.destinationReady = '1';
    const input = qs('[data-destination-input]', picker);
    const latField = qs('[data-destination-lat]', picker);
    const lngField = qs('[data-destination-lng]', picker);
    const wazeField = qs('[data-destination-waze]', picker);
    const mapsField = qs('[data-destination-maps]', picker);
    const mapEl = qs('[data-destination-map]', picker);
    const details = qs('[data-destination-details]', picker);
    const resultsEl = qs('[data-destination-results]', picker);
    const searchBtn = qs('[data-destination-search]', picker);
    const locateBtn = qs('[data-destination-locate]', picker);
    const clearBtn = qs('[data-destination-clear]', picker);
    const shouldAutoSave = picker.dataset.destinationAutosave !== '0';
    const autosave = () => { if (shouldAutoSave) saveDriverProgress(); };
    if (!input || !mapEl || !details) return;

    let map = null;
    let marker = null;
    let selected = null;

    function sanitizePickerFields() {
      const clean = sanitizeDestinationFormData({
        destino: input.value,
        destino_lat: latField?.value,
        destino_lng: lngField?.value,
        destino_waze_url: wazeField?.value,
        destino_maps_url: mapsField?.value
      });
      input.value = clean.destino || '';
      if (latField) latField.value = clean.destino_lat || '';
      if (lngField) lngField.value = clean.destino_lng || '';
      if (wazeField) wazeField.value = clean.destino_waze_url || '';
      if (mapsField) mapsField.value = clean.destino_maps_url || '';
    }

    sanitizePickerFields();

    function refreshMapView() {
      if (!map) return;
      const refresh = () => {
        try { map.invalidateSize(false); } catch {}
      };
      refresh();
      requestAnimationFrame(refresh);
      [120, 350, 800].forEach(ms => setTimeout(refresh, ms));
    }

    function bindMapVisibilityRefresh() {
      if (!map || mapEl.dataset.mapRefreshReady === '1') return;
      mapEl.dataset.mapRefreshReady = '1';
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(refreshMapView);
        resizeObserver.observe(mapEl);
      }
      if (window.IntersectionObserver) {
        const visibilityObserver = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) refreshMapView();
        });
        visibilityObserver.observe(mapEl);
      }
      window.addEventListener('resize', refreshMapView);
      const modal = mapEl.closest('.modal');
      if (modal) modal.addEventListener('scroll', refreshMapView, {passive:true});
      document.addEventListener('controle:refreshDestinationMaps', refreshMapView);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) refreshMapView();
      });
    }

    function setDetails(helper='') {
      sanitizePickerFields();
      const lat = numberValue(latField?.value);
      const lng = numberValue(lngField?.value);
      const hasPoint = validLatLng(lat, lng);
      const destination = input.value.trim();
      const waze = hasPoint ? buildWazeUrlFromCoords(lat, lng) : buildWazeUrlFromText(destination);
      const maps = hasPoint ? buildMapsUrlFromCoords(lat, lng) : buildMapsUrlFromText(destination);
      if (wazeField) wazeField.value = waze;
      if (mapsField) mapsField.value = maps;
      const coords = hasPoint ? `<div><span>Coordenadas:</span> ${escapeHtml(formatLatLng(lat, lng))}</div>` : '';
      const linkButtons = destination || hasPoint ? `<div class="destination-link-buttons">${routeLinkHtml('waze', 'Abrir no Waze', destination, lat, lng, 'btn small')}${routeLinkHtml('maps', 'Abrir no mapa', destination, lat, lng, 'btn small')}</div>` : '';
      details.innerHTML = `${destination ? `<div><span>Cliente / ponto:</span> ${escapeHtml(destination)}</div>` : ''}${coords}${helper ? `<div class="route-hint">${escapeHtml(helper)}</div>` : ''}${linkButtons}` || 'Digite uma parte do cliente/endereço e clique em Buscar, ou toque direto no mapa para marcar o ponto.';
    }

    function selectPoint(lat, lng, label='Ponto selecionado no mapa', moveMap=true) {
      if (!validLatLng(lat, lng)) return;
      selected = {lat, lng};
      if (latField) latField.value = String(lat);
      if (lngField) lngField.value = String(lng);
      if (!input.value.trim() || input.value.startsWith('Ponto selecionado')) input.value = `${label} (${formatLatLng(lat, lng)})`;
      if (map && window.L) {
        if (!marker) marker = window.L.marker([lat, lng], {draggable:true}).addTo(map);
        marker.setLatLng([lat, lng]);
        mapEl._controleCarrosLeafletMarker = marker;
        if (moveMap) map.setView([lat, lng], Math.max(map.getZoom(), 15));
        marker.off('dragend');
        marker.on('dragend', async () => {
          const p = marker.getLatLng();
          if (latField) latField.value = String(p.lat);
          if (lngField) lngField.value = String(p.lng);
          input.value = `Ponto selecionado no mapa (${formatLatLng(p.lat, p.lng)})`;
          setDetails('Ponto ajustado no mapa.');
          const name = await nominatimReverse(p.lat, p.lng).catch(() => '');
          if (name) { input.value = name; setDetails('Endereço identificado pelo mapa.'); }
        });
      }
      setDetails('Ponto marcado. Você pode abrir no Waze ou no mapa para navegar.');
      nominatimReverse(lat, lng).then(name => {
        if (name && selected?.lat === lat && selected?.lng === lng) {
          input.value = name;
          setDetails('Endereço identificado pelo mapa.');
        }
      }).catch(() => {});
    }

    function showSearchResults(items) {
      if (!resultsEl) return;
      if (!items.length) {
        resultsEl.innerHTML = '<div class="muted">Nenhum resultado encontrado. Tente outro termo ou toque no mapa.</div>';
        return;
      }
      resultsEl.innerHTML = items.map((item, index) => `<button type="button" class="destination-result" data-destination-result="${index}">${escapeHtml(item.display_name || item.name || 'Ponto da rota')}</button>`).join('');
      qsa('[data-destination-result]', resultsEl).forEach(btn => {
        btn.onclick = () => {
          const item = items[Number(btn.dataset.destinationResult)];
          const lat = numberValue(item.lat);
          const lng = numberValue(item.lon);
          input.value = item.display_name || item.name || `Ponto da rota (${formatLatLng(lat, lng)})`;
          resultsEl.innerHTML = '';
          selectPoint(lat, lng, input.value, true);
          autosave();
        };
      });
    }

    async function doSearch() {
      const query = input.value.trim();
      if (!query) return toast('Digite pelo menos uma parte do cliente/endereço ou toque no mapa.');
      if (resultsEl) resultsEl.innerHTML = '<div class="muted">Buscando...</div>';
      try {
        const items = await nominatimSearch(query);
        showSearchResults(items);
        if (items[0]) {
          const lat = numberValue(items[0].lat);
          const lng = numberValue(items[0].lon);
          if (validLatLng(lat, lng) && map) map.setView([lat, lng], 14);
        }
      } catch (err) {
        if (resultsEl) resultsEl.innerHTML = `<div class="muted">Busca indisponível no momento.</div>`;
      }
    }

    loadLeaflet().then(ok => {
      if (!ok) {
        mapEl.innerHTML = '<span>Mapa indisponível. Digite o cliente/endereço normalmente.</span>';
        setDetails('Sem mapa no momento. O cliente/endereço será salvo como texto.');
        return;
      }
      const center = [MAPA_PADRAO_LAT, MAPA_PADRAO_LNG];
      mapEl.classList.add('leaflet-ready');
      map = window.L.map(mapEl, {scrollWheelZoom:false}).setView(center, MAPA_PADRAO_ZOOM);
      mapEl._controleCarrosLeafletMap = map;
      bindMapVisibilityRefresh();
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      refreshMapView();
      map.on('click', ev => {
        if (!ev?.latlng) return;
        input.value = `Ponto selecionado no mapa (${formatLatLng(ev.latlng.lat, ev.latlng.lng)})`;
        selectPoint(ev.latlng.lat, ev.latlng.lng, 'Ponto selecionado no mapa', false);
        autosave();
      });
      const savedLat = numberValue(latField?.value);
      const savedLng = numberValue(lngField?.value);
      if (validLatLng(savedLat, savedLng)) {
        selectPoint(savedLat, savedLng, input.value.trim() || 'Ponto salvo', true);
      }
      refreshMapView();
      setDetails();
    });

    if (searchBtn) searchBtn.onclick = ev => { ev.preventDefault(); doSearch(); };
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); doSearch(); }
    });
    input.addEventListener('input', () => {
      if (!input.value.trim()) {
        if (latField) latField.value = '';
        if (lngField) lngField.value = '';
        if (wazeField) wazeField.value = '';
        if (mapsField) mapsField.value = '';
        if (resultsEl) resultsEl.innerHTML = '';
        if (marker && map) { marker.remove(); marker = null; mapEl._controleCarrosLeafletMarker = null; }
      }
      setDetails();
      autosave();
    });
    if (clearBtn) clearBtn.onclick = ev => {
      ev.preventDefault();
      if (latField) latField.value = '';
      if (lngField) lngField.value = '';
      if (wazeField) wazeField.value = '';
      if (mapsField) mapsField.value = '';
      if (resultsEl) resultsEl.innerHTML = '';
      if (marker && map) { marker.remove(); marker = null; mapEl._controleCarrosLeafletMarker = null; }
      selected = null;
      setDetails('Ponto removido. Você pode digitar o cliente/endereço como texto.');
      autosave();
    };
    if (locateBtn) locateBtn.onclick = async ev => {
      ev.preventDefault();
      if (!map) return toast('Aguarde o mapa carregar.');
      locateBtn.disabled = true;
      let lat = MAPA_PADRAO_LAT;
      let lng = MAPA_PADRAO_LNG;
      try {
        const items = await nominatimSearch(MAPA_CENTRAL_ENDERECO, 1);
        const foundLat = numberValue(items?.[0]?.lat);
        const foundLng = numberValue(items?.[0]?.lon);
        if (validLatLng(foundLat, foundLng)) {
          lat = foundLat;
          lng = foundLng;
        }
      } catch {}
      map.setView([lat, lng], Math.max(MAPA_PADRAO_ZOOM, 16), {animate:true});
      refreshMapView();
      locateBtn.disabled = false;
      toast('Mapa centralizado na base (endereço fictício da demo).');
    };
  });
}

function destinationSuccessLinksHtml(m) {
  const links = destinationLinks(m);
  const waze = routeLinkHtml('waze', 'Abrir no Waze', links.destino, links.lat, links.lng, 'btn small');
  const maps = routeLinkHtml('maps', 'Abrir no mapa', links.destino, links.lat, links.lng, 'btn small');
  if (!waze && !maps) return '';
  return `<div class="destination-success-actions">${waze}${maps}</div>`;
}


function activeDrivers() {
  return (state.drivers || []).filter(d => (d.status || 'ativo') !== 'inativo').sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
}
function activeClients() {
  return (state.clients || []).filter(c => (c.status || 'ativo') !== 'inativo').sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR'));
}
function normalizeDriverPayload(data={}) {
  return {
    id: data.id || undefined,
    nome: String(data.nome || data.motorista || '').trim(),
    matricula: String(data.matricula || '').trim(),
    setor: String(data.setor || '').trim(),
    telefone: String(data.telefone || '').trim(),
    status: data.status || 'ativo',
    observacao: String(data.observacao || '').trim()
  };
}
function normalizeClientPayload(data={}) {
  const lat = numberValue(data.destino_lat ?? data.lat);
  const lng = numberValue(data.destino_lng ?? data.lng);
  const endereco = String(data.endereco || data.destino || '').trim();
  const payload = {
    id: data.id || undefined,
    nome: String(data.nome || data.cliente_nome || '').trim(),
    telefone: String(data.telefone || '').trim(),
    endereco,
    status: data.status || 'ativo',
    observacao: String(data.observacao || '').trim()
  };
  if (validLatLng(lat, lng)) {
    payload.lat = lat;
    payload.lng = lng;
    payload.waze_url = data.destino_waze_url || data.waze_url || buildWazeUrlFromCoords(lat, lng);
    payload.maps_url = data.destino_maps_url || data.maps_url || buildMapsUrlFromCoords(lat, lng);
  } else if (endereco) {
    payload.waze_url = data.destino_waze_url || data.waze_url || buildWazeUrlFromText(endereco);
    payload.maps_url = data.destino_maps_url || data.maps_url || buildMapsUrlFromText(endereco);
  }
  return payload;
}
function selectedDriverName(data={}) {
  const manual = String(data.motorista_manual || '').trim();
  if (manual) return manual;
  const id = data.motorista_id || data.driver_id;
  const driver = state.drivers.find(d => d.id === id);
  return String(data.motorista || driver?.nome || '').trim();
}
function selectedClientName(data={}) {
  const id = data.cliente_id || data.client_id;
  const client = state.clients.find(c => c.id === id);
  return String(data.cliente_nome || client?.nome || '').trim();
}
function normalizeMovementDriverData(data={}) {
  if (isCondutorArea()) {
    // Na área do condutor o registro é sempre do condutor logado (o banco também exige isso).
    const own = condutorDriverRecord() || {};
    return {...data, motorista_id: own.id || null, motorista: own.nome || currentUser().nome, matricula: own.matricula || '', cliente_nome: selectedClientName(data) || data.cliente_nome || ''};
  }
  const driver = state.drivers.find(d => d.id === data.motorista_id);
  const manual = String(data.motorista_manual || '').trim();
  return {
    ...data,
    motorista_id: data.motorista_id && data.motorista_id !== '__manual' ? data.motorista_id : null,
    motorista: manual || data.motorista || driver?.nome || '',
    matricula: data.matricula || driver?.matricula || '',
    cliente_nome: selectedClientName(data) || data.cliente_nome || ''
  };
}
function clientToDestination(client={}) {
  const lat = numberValue(client.lat);
  const lng = numberValue(client.lng);
  const destino = [client.nome, client.endereco].filter(Boolean).join(' - ');
  const data = {destino, destino_lat:'', destino_lng:'', destino_waze_url:'', destino_maps_url:''};
  if (validLatLng(lat, lng)) {
    data.destino_lat = lat;
    data.destino_lng = lng;
    data.destino_waze_url = client.waze_url || buildWazeUrlFromCoords(lat, lng);
    data.destino_maps_url = client.maps_url || buildMapsUrlFromCoords(lat, lng);
  } else if (destino) {
    data.destino_waze_url = client.waze_url || buildWazeUrlFromText(destino);
    data.destino_maps_url = client.maps_url || buildMapsUrlFromText(destino);
  }
  return data;
}
function normalizeRouteStopPayload(data={}) {
  const client = state.clients.find(c => c.id === data.cliente_id);
  const dest = client ? clientToDestination(client) : sanitizeDestinationFormData(data);
  const lat = numberValue(data.destino_lat ?? dest.destino_lat ?? data.lat);
  const lng = numberValue(data.destino_lng ?? dest.destino_lng ?? data.lng);
  const endereco = String(data.endereco || data.destino || dest.destino || client?.endereco || '').trim();
  const clienteNome = String(data.cliente_nome || client?.nome || '').trim();
  const payload = {
    movimento_id: data.movimento_id || data.movement_id || null,
    cliente_id: data.cliente_id || null,
    cliente_nome: clienteNome || endereco,
    endereco,
    observacao: String(data.observacao || '').trim(),
    status: data.status || 'pendente'
  };
  if (validLatLng(lat, lng)) {
    payload.lat = lat;
    payload.lng = lng;
    payload.waze_url = data.destino_waze_url || data.waze_url || buildWazeUrlFromCoords(lat, lng);
    payload.maps_url = data.destino_maps_url || data.maps_url || buildMapsUrlFromCoords(lat, lng);
  } else if (endereco || clienteNome) {
    const text = endereco || clienteNome;
    payload.waze_url = data.destino_waze_url || data.waze_url || buildWazeUrlFromText(text);
    payload.maps_url = data.destino_maps_url || data.maps_url || buildMapsUrlFromText(text);
  }
  return payload;
}
function routeStopsForMovement(id) {
  return (state.routeStops || []).filter(s => s.movimento_id === id).sort((a,b)=>(a.ordem || 0) - (b.ordem || 0) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}
function nextRouteOrder(movementId) {
  const orders = routeStopsForMovement(movementId).map(s => Number(s.ordem || 0)).filter(Number.isFinite);
  return orders.length ? Math.max(...orders) + 1 : 1;
}
function movementClientName(m) {
  return m.cliente_nome || routeStopsForMovement(m.id)[0]?.cliente_nome || '';
}

function routeStopsForReport(rows) {
  const ids = new Set((rows || []).map(m => m.id));
  return (state.routeStops || []).filter(s => ids.has(s.movimento_id));
}
function currentRouteStop(m) {
  const stops = routeStopsForMovement(m.id);
  return stops.find(s => s.status === 'pendente') || null;
}
function routeStopLabel(stop) {
  if (!stop) return '';
  return String(stop.cliente_nome || stop.endereco || 'Cliente').trim();
}
function routeStopRouteLinksHtml(stop) {
  if (!stop) return '';
  const label = routeStopLabel(stop);
  const lat = numberValue(stop.lat);
  const lng = numberValue(stop.lng);
  return [
    routeLinkHtml('waze', 'Waze', label || stop.endereco || '', lat, lng),
    routeLinkHtml('maps', 'Mapa', label || stop.endereco || '', lat, lng)
  ].filter(Boolean).join('');
}
function movementRouteTitle(m) {
  const current = currentRouteStop(m);
  return routeStopLabel(current) || m.cliente_nome || m.destino || '—';
}
function routeProgressText(m) {
  const stops = routeStopsForMovement(m.id);
  const done = stops.filter(s => s.status === 'visitado').length;
  const current = currentRouteStop(m);
  if (!stops.length) return m.status === 'finalizado' ? 'Rota finalizada' : 'Sem cliente registrado';
  if (current) return `${done} concluído(s) • atual: ${routeStopLabel(current)}`;
  return `${done} concluído(s) • rota finalizada`;
}
function routeFlowStepperHtml(m, compact=false) {
  const stops = routeStopsForMovement(m.id);
  if (!stops.length) return '';
  return `<div class="route-stepper ${compact ? 'compact' : ''}">${stops.map(s => {
    const done = s.status === 'visitado';
    const current = s.status === 'pendente';
    const state = done ? 'done' : current ? 'current' : 'pending';
    const statusText = done ? 'Concluído' : current ? 'Em andamento' : 'Pendente';
    return `<div class="route-step ${state}">
      <span class="route-step-dot">${escapeHtml(s.ordem || '')}º</span>
      <span class="route-step-body"><b>${escapeHtml(routeStopLabel(s))}</b><small>${statusText}</small></span>
    </div>`;
  }).join('')}</div>`;
}
function routeProgressStatsHtml(m) {
  const stops = routeStopsForMovement(m.id);
  const done = stops.filter(s => s.status === 'visitado').length;
  const current = currentRouteStop(m);
  return `<div class="route-progress-stats">
    <span><strong>${done}</strong> concluído(s)</span>
    <span><strong>${current ? 1 : 0}</strong> em andamento</span>
    <span><strong>${stops.length}</strong> cliente(s) na rota</span>
  </div>`;
}
function movementRoutePlainText(m) {
  const stops = routeStopsForMovement(m.id);
  if (!stops.length) return m.cliente_nome || m.destino || '—';
  return stops.map(s => `${s.ordem || ''}º ${routeStopLabel(s)} (${s.status === 'visitado' ? 'concluído' : 'atual'})`).join(' | ');
}
function movementRouteDisplayHtml(m) {
  const stops = routeStopsForMovement(m.id);
  const current = currentRouteStop(m);
  if (!stops.length) {
    const fallback = m.cliente_nome || m.destino || '';
    if (!fallback) return destinationCellHtml(m);
    return `<div class="route-overview"><div class="route-current"><strong>Atual:</strong> ${escapeHtml(fallback)}</div>${destinationSuccessLinksHtml(m)}</div>`;
  }
  const done = stops.filter(s => s.status === 'visitado').length;
  const currentLine = current
    ? `<div class="route-current"><strong>Cliente atual:</strong> ${escapeHtml(routeStopLabel(current))}</div>`
    : `<div class="route-current"><strong>${m.status === 'finalizado' ? 'Rota finalizada' : 'Roteiro finalizado • aguardando devolução'}</strong></div>`;
  const summary = `<div class="route-compact-meta"><span>${done} concluído(s)</span><span>${stops.length} cliente(s) na rota</span></div>`;
  const links = current ? routeStopRouteLinksHtml(current) : '';
  return `<div class="route-overview">${currentLine}${summary}${links ? `<span class="destination-table-links">${links}</span>` : ''}</div>`;
}
function routeTimelineHtml(m) {
  const stops = routeStopsForMovement(m.id);
  if (!stops.length) return `<div class="empty">Nenhum cliente registrado nessa rota.</div>`;
  return `<div class="timeline-list route-timeline">${stops.map(s => `<div class="timeline-item ${s.status === 'pendente' ? 'route-current-item' : ''}">
    <strong>${escapeHtml(s.ordem || '')}º ${escapeHtml(routeStopLabel(s))}</strong>
    <span>${s.status === 'visitado' ? 'Concluído' : 'Em andamento'}${s.chegada_at ? ' • ' + dateTimeBR(s.chegada_at) : ''}</span>
    ${s.endereco ? `<span>${escapeHtml(s.endereco)}</span>` : ''}
    ${s.observacao ? `<span>Obs.: ${escapeHtml(s.observacao)}</span>` : ''}
    <span class="destination-table-links">${routeStopRouteLinksHtml(s)}</span>
  </div>`).join('')}</div>`;
}

function routePointLetter(index) {
  const n = Number(index || 0);
  return `C${Number.isFinite(n) && n >= 0 ? n + 1 : 1}`;
}
function routeDisplayStopsForMovement(m) {
  const stops = routeStopsForMovement(m.id);
  if (stops.length) return stops;
  const fallbackName = String(m.cliente_nome || m.destino || '').trim();
  if (!fallbackName) return [];
  return [{
    id: `fallback-${m.id}`,
    movimento_id: m.id,
    cliente_id: m.cliente_id || null,
    cliente_nome: fallbackName,
    endereco: m.destino || fallbackName,
    lat: m.destino_lat,
    lng: m.destino_lng,
    waze_url: m.destino_waze_url,
    maps_url: m.destino_maps_url,
    ordem: 1,
    status: m.status === 'finalizado' ? 'visitado' : 'pendente',
    chegada_at: m.chegada_at || '',
    created_at: m.saida_at || m.created_at || ''
  }];
}
function routeCoordFromPair(latValue, lngValue) {
  const lat = numberValue(latValue);
  const lng = numberValue(lngValue);
  return validLatLng(lat, lng) ? {lat, lng} : null;
}
function routeCoordFromText(value='') {
  const text = String(value || '');
  if (!text) return null;
  const decoded = (() => {
    try { return decodeURIComponent(text); } catch { return text; }
  })();
  const patterns = [
    /[?&]ll=(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/i,
    /[?&]q=(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/i,
    /@(-?\d+(?:[.,]\d+)?),(-?\d+(?:[.,]\d+)?)/i,
    /(-?\d{1,2}(?:[.,]\d+)?)\s*,\s*(-?\d{1,3}(?:[.,]\d+)?)/
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const point = routeCoordFromPair(match[1], match[2]);
    if (point) return point;
  }
  return null;
}
function sameRouteText(a='', b='') {
  const clean = value => normalizeTextKey(value).toLowerCase().replace(/\s+/g, ' ').trim();
  const left = clean(a);
  const right = clean(b);
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}
function findClientForRouteStop(stop) {
  if (!stop) return null;
  const byId = state.clients.find(c => c.id === stop.cliente_id);
  if (byId) return byId;
  return state.clients.find(c =>
    sameRouteText(c.nome, stop.cliente_nome) ||
    sameRouteText(c.endereco, stop.endereco) ||
    sameRouteText(`${c.nome || ''} ${c.endereco || ''}`, `${stop.cliente_nome || ''} ${stop.endereco || ''}`)
  ) || null;
}
function routeStopPoint(stop, movement=null) {
  const client = findClientForRouteStop(stop) || {};
  const candidates = [
    routeCoordFromPair(stop?.lat, stop?.lng),
    routeCoordFromPair(stop?.destino_lat, stop?.destino_lng),
    routeCoordFromPair(stop?.latitude, stop?.longitude),
    routeCoordFromPair(client.lat, client.lng),
    routeCoordFromText(stop?.maps_url),
    routeCoordFromText(stop?.waze_url),
    routeCoordFromText(client.maps_url),
    routeCoordFromText(client.waze_url),
    routeCoordFromText(stop?.endereco),
    routeCoordFromText(stop?.cliente_nome)
  ];
  const isFirstStop = Number(stop?.ordem || 0) === 1;
  const matchesCurrentMovementClient = movement && (
    sameRouteText(stop?.cliente_nome, movement.cliente_nome) ||
    sameRouteText(stop?.endereco, movement.destino)
  );
  if (movement && (isFirstStop || matchesCurrentMovementClient)) {
    candidates.push(routeCoordFromPair(movement.destino_lat, movement.destino_lng));
    candidates.push(routeCoordFromText(movement.destino_maps_url));
    candidates.push(routeCoordFromText(movement.destino_waze_url));
  }
  return candidates.find(Boolean) || null;
}
function routePointStatusText(stop) {
  return stop?.status === 'visitado' ? 'Concluído' : 'Em andamento';
}
function routePointStatusClass(stop) {
  return stop?.status === 'visitado' ? 'done' : 'current';
}
function routeMapPoints(m) {
  return routeDisplayStopsForMovement(m).map((stop, index) => {
    const point = routeStopPoint(stop, m);
    return {
      stop,
      index,
      letter: routePointLetter(index),
      label: routeStopLabel(stop),
      status: routePointStatusClass(stop),
      statusText: routePointStatusText(stop),
      lat: point?.lat,
      lng: point?.lng
    };
  });
}

function routeEvidenceButtonHtml(stop) {
  const before = Array.isArray(stop?.fotos_antes) ? stop.fotos_antes : [];
  const after = Array.isArray(stop?.fotos_depois) ? stop.fotos_depois : [];
  const hasSignature = Boolean(stop?.assinatura_entrega_url);
  const total = before.length + after.length;
  if (!total && !hasSignature) return `<div class="route-evidence-empty">Sem comprovação anexada</div>`;
  return `<div class="route-evidence-actions"><button type="button" class="btn small evidence-btn" data-view-delivery-evidence="${escapeHtml(stop.id)}">📷 Ver fotos${total ? ` • ${total}` : ''}</button>${hasSignature ? `<span class="evidence-signature-ok">✓ Assinatura</span>` : ''}</div>`;
}
function movementEvidenceHtml(m) {
  const stops = routeStopsForMovement(m.id);
  const withEvidence = stops.filter(s => (Array.isArray(s.fotos_antes) && s.fotos_antes.length) || (Array.isArray(s.fotos_depois) && s.fotos_depois.length) || s.assinatura_entrega_url);
  const photoCount = withEvidence.reduce((sum, s) => sum + (Array.isArray(s.fotos_antes) ? s.fotos_antes.length : 0) + (Array.isArray(s.fotos_depois) ? s.fotos_depois.length : 0), 0);
  if (!withEvidence.length) return `<span class="pill muted evidence-summary-empty">Sem fotos</span>`;
  return `<span class="pill evidence-summary">📷 ${photoCount} foto${photoCount === 1 ? '' : 's'}</span>`;
}
function movementEvidenceButtonHtml(m) {
  const stops = routeStopsForMovement(m.id);
  const completed = stops.filter(s => s.status === 'visitado');
  const withEvidence = completed.filter(s => (Array.isArray(s.fotos_antes) && s.fotos_antes.length) || (Array.isArray(s.fotos_depois) && s.fotos_depois.length) || s.assinatura_entrega_url);
  const fullyDocumented = completed.filter(s => Array.isArray(s.fotos_antes) && s.fotos_antes.length && Array.isArray(s.fotos_depois) && s.fotos_depois.length && s.assinatura_entrega_url).length;
  if (!completed.length) return `<span class="evidence-status muted"><b>—</b><small>Nenhuma entrega</small></span>`;
  const pending = completed.length - withEvidence.length;
  return `<div class="evidence-control"><button type="button" class="evidence-main-btn ${pending ? 'attention' : 'complete'}" data-route-details="${escapeHtml(m.id)}" title="Abrir a rota e ver a comprovação por cliente"><span class="evidence-main-icon">▣</span><span><b>${fullyDocumented}/${completed.length}</b><small>completa${fullyDocumented === 1 ? '' : 's'}</small></span></button>${pending ? `<span class="evidence-pending-count">${pending} pendente${pending === 1 ? '' : 's'}</span>` : `<span class="evidence-ok-text">Tudo conferido</span>`}</div>`;
}
function openDeliveryEvidenceModal(stopId) {
  const stop = (state.routeStops || []).find(s => s.id === stopId);
  if (!stop) return;
  const before = Array.isArray(stop.fotos_antes) ? stop.fotos_antes : [];
  const after = Array.isArray(stop.fotos_depois) ? stop.fotos_depois : [];
  const signature = stop.assinatura_entrega_url || '';
  const gallery = (items, label, cls) => `<section class="evidence-gallery ${cls}"><div class="evidence-gallery-head"><div><h4>${label}</h4><span>${items.length}/5 fotos</span></div></div>${items.length ? `<div class="evidence-photo-grid">${items.map((url,i) => `<button type="button" class="evidence-photo" data-view-delivery-photo="${escapeHtml(url)}" aria-label="Abrir foto ${label.toLowerCase()} ${i+1}"><img src="${escapeHtml(url)}" alt="${label} ${i+1}"><span>${i+1}</span></button>`).join('')}</div>` : `<div class="evidence-empty">Nenhuma foto registrada.</div>`}</section>`;
  openModal('Comprovação da entrega', `<div class="delivery-evidence-modal"><div class="evidence-client-head"><div><span class="route-detail-kicker">Entrega finalizada</span><h2>${escapeHtml(routeStopLabel(stop) || 'Cliente')}</h2><p>${escapeHtml(stop.endereco || 'Sem endereço informado')} ${stop.chegada_at ? `• ${escapeHtml(dateTimeBR(stop.chegada_at))}` : ''}</p></div><span class="pill done-pill">Concluído</span></div><div class="evidence-grid">${gallery(before,'Antes','before')}${gallery(after,'Depois','after')}</div><section class="evidence-signature-section"><div class="evidence-gallery-head"><div><h4>Assinatura do condutor</h4><span>${signature && stop.assinatura_entrega_at ? dateTimeBR(stop.assinatura_entrega_at) : 'Não registrada'}</span></div></div>${signature ? `<div class="evidence-signature"><img src="${escapeHtml(signature)}" alt="Assinatura do condutor"></div>` : `<div class="evidence-empty">Nenhuma assinatura registrada.</div>`}</section></div>`);
}
function openDeliveryPhotoModal(url) {
  if (!url) return;
  const root = qs('#modalRoot');
  if (!root) return;

  root.innerHTML = `
    <div class="delivery-lightbox" data-delivery-lightbox role="dialog" aria-modal="true" aria-label="Foto da entrega">
      <button type="button" class="delivery-lightbox-close" data-close-delivery-lightbox aria-label="Fechar foto">✕</button>
      <div class="delivery-lightbox-stage" data-lightbox-stage>
        <img src="${escapeHtml(url)}" alt="Foto da entrega ampliada" data-lightbox-image draggable="false">
      </div>
      <div class="delivery-lightbox-toolbar">
        <button type="button" class="btn" data-lightbox-zoom-out aria-label="Diminuir zoom">−</button>
        <button type="button" class="btn" data-lightbox-reset title="Restaurar zoom">100%</button>
        <button type="button" class="btn" data-lightbox-zoom-in aria-label="Aumentar zoom">+</button>
        <button type="button" class="btn" data-lightbox-new-tab>↗ Abrir em nova aba</button>
      </div>
    </div>`;

  const lightbox = qs('[data-delivery-lightbox]');
  const image = qs('[data-lightbox-image]');
  let scale = 1;
  const applyZoom = () => {
    scale = Math.min(3, Math.max(0.75, scale));
    image.style.transform = `scale(${scale})`;
    const resetBtn = qs('[data-lightbox-reset]');
    if (resetBtn) resetBtn.textContent = `${Math.round(scale * 100)}%`;
  };

  qs('[data-close-delivery-lightbox]').onclick = closeModal;
  qs('[data-lightbox-zoom-in]').onclick = () => { scale += 0.25; applyZoom(); };
  qs('[data-lightbox-zoom-out]').onclick = () => { scale -= 0.25; applyZoom(); };
  qs('[data-lightbox-reset]').onclick = () => { scale = 1; applyZoom(); };
  qs('[data-lightbox-new-tab]').onclick = () => window.open(url, '_blank', 'noopener,noreferrer');
  lightbox.onclick = (event) => {
    if (event.target === lightbox) closeModal();
  };
  image.ondblclick = () => { scale = scale === 1 ? 2 : 1; applyZoom(); };
  lightbox.addEventListener('wheel', (event) => {
    event.preventDefault();
    scale += event.deltaY < 0 ? 0.1 : -0.1;
    applyZoom();
  }, { passive: false });
  applyZoom();
}
function routePointCardsHtml(m) {
  const items = routeMapPoints(m);
  if (!items.length) return `<div class="empty">Nenhum cliente registrado nessa rota.</div>`;
  return `<div class="route-point-list">${items.map(item => {
    const s = item.stop;
    const point = routeStopPoint(s, m);
    const address = String(s.endereco || '').trim();
    const links = routeStopRouteLinksHtml(s);
    return `<article class="route-point-card ${item.status}">
      <div class="route-point-badge">${escapeHtml(item.letter)}</div>
      <div class="route-point-content">
        <div class="route-point-title"><strong>${escapeHtml(item.label || 'Cliente')}</strong>${statusBadge(s.status === 'visitado' ? 'visitado' : 'em_andamento')}</div>
        ${address ? `<p>${escapeHtml(address)}</p>` : ''}
        <div class="route-point-meta">
          ${s.created_at ? `<span>Registro: ${dateTimeBR(s.created_at)}</span>` : ''}
          ${s.chegada_at ? `<span>Concluído: ${dateTimeBR(s.chegada_at)}</span>` : ''}
          ${point ? `<span>Mapa: ${escapeHtml(formatLatLng(point.lat, point.lng))}</span>` : '<span>Sem ponto no mapa</span>'}
        </div>
        ${s.observacao ? `<div class="route-point-note">${escapeHtml(s.observacao)}</div>` : ''}
        ${links ? `<div class="destination-table-links">${links}</div>` : ''}
        ${routeEvidenceButtonHtml(s)}
      </div>
    </article>`;
  }).join('')}</div>`;
}
async function drawRoadRouteOnMap(map, points, fallbackLine) {
  if (!map || !points || points.length < 2) return;
  const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const route = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(route) || route.length < 2) return;
    if (fallbackLine) {
      try { map.removeLayer(fallbackLine); } catch {}
    }
    const latLngs = route.map(([lng, lat]) => [lat, lng]);
    window.L.polyline(latLngs, {color:'#facc15', weight:5, opacity:.92}).addTo(map);
  } catch {}
}
async function geocodeRoutePoint(item) {
  if (!item || validLatLng(item.lat, item.lng)) return item;
  const stop = item.stop || {};
  const client = findClientForRouteStop(stop) || {};
  const query = [stop.endereco, stop.cliente_nome, client.endereco, client.nome].map(v => String(v || '').trim()).find(Boolean);
  if (!query || query.length < 3) return item;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {headers:{'Accept':'application/json'}});
    if (!res.ok) return item;
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    const point = routeCoordFromPair(first?.lat, first?.lon);
    if (point) {
      item.lat = point.lat;
      item.lng = point.lng;
    }
  } catch {}
  return item;
}
async function resolveRouteMapPoints(m) {
  const items = routeMapPoints(m);
  for (const item of items) {
    if (!validLatLng(item.lat, item.lng)) await geocodeRoutePoint(item);
  }
  return items;
}
async function initRouteDetailsMap(id) {
  const m = state.movements.find(x => x.id === id);
  const mapEl = qsa('[data-route-map]').find(el => el.dataset.routeMap === id);
  if (!m || !mapEl) return;
  const allItems = await resolveRouteMapPoints(m);
  const points = allItems.filter(p => validLatLng(p.lat, p.lng)).sort((a,b)=>a.index-b.index);
  const missing = allItems.filter(p => !validLatLng(p.lat, p.lng));
  if (!points.length) {
    mapEl.innerHTML = '<div class="route-map-empty"><strong>Mapa sem clientes com ponto cadastrado</strong><span>Cadastre o endereço/ponto dos clientes para a rota aparecer no mapa.</span></div>';
    return;
  }
  const ok = await loadLeaflet();
  if (!ok) {
    mapEl.innerHTML = '<div class="route-map-empty"><strong>Mapa indisponível</strong><span>A rota continua registrada na lista de clientes.</span></div>';
    return;
  }
  mapEl.innerHTML = '';
  mapEl.classList.add('leaflet-ready');
  const map = window.L.map(mapEl, {scrollWheelZoom:false}).setView([points[0].lat, points[0].lng], 13);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  const group = window.L.featureGroup().addTo(map);
  points.forEach(point => {
    const icon = window.L.divIcon({
      className: `route-map-point-icon ${point.status}`,
      html: `<span>${escapeHtml(point.letter)}</span>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });
    window.L.marker([point.lat, point.lng], {icon}).addTo(group).bindPopup(`<strong>${escapeHtml(point.letter)} • Cliente ${point.index + 1}</strong><br>${escapeHtml(point.label || 'Cliente')}<br>${escapeHtml(point.statusText)}`);
  });
  let fallbackLine = null;
  if (points.length > 1) {
    const latLngs = points.map(p => [p.lat, p.lng]);
    fallbackLine = window.L.polyline(latLngs, {color:'#facc15', weight:4, opacity:.72, dashArray:'8,10'}).addTo(map);
    drawRoadRouteOnMap(map, points, fallbackLine);
  }
  if (missing.length) {
    const note = window.L.control({position:'bottomleft'});
    note.onAdd = () => {
      const div = window.L.DomUtil.create('div', 'route-map-note');
      div.innerHTML = `${missing.length} cliente(s) sem ponto no mapa`;
      return div;
    };
    note.addTo(map);
  }
  try {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 15);
    else map.fitBounds(group.getBounds().pad(.24));
  } catch {}
  const refresh = () => { try { map.invalidateSize(false); } catch {} };
  requestAnimationFrame(refresh);
  [120, 320, 700, 1200].forEach(ms => setTimeout(refresh, ms));
}

function occurrenceLabel(o) {
  return `${o.tipo || 'Ocorrência'} • ${o.placa || 'Sem veículo'}${o.numero_uso ? ' • ' + o.numero_uso : ''}`;
}

function normalizeOccurrencePayload(data) {
  const ref = data.referencia || '';
  let movement = null;
  let vehicle = null;
  if (ref.startsWith('mov:')) movement = state.movements.find(m => m.id === ref.slice(4));
  if (ref.startsWith('veh:')) vehicle = state.vehicles.find(v => v.id === ref.slice(4));
  if (movement) vehicle = state.vehicles.find(v => v.id === movement.veiculo_id) || vehicle;
  return {
    id: data.id || undefined,
    movimento_id: movement?.id || data.movimento_id || null,
    veiculo_id: vehicle?.id || movement?.veiculo_id || data.veiculo_id || null,
    numero_uso: movement?.numero_uso || data.numero_uso || '',
    placa: movement?.placa || vehicle?.placa || data.placa || '',
    motorista: movement?.motorista || data.motorista || '',
    tipo: data.tipo || 'Outro',
    prioridade: data.prioridade || 'media',
    status: data.status || 'aberta',
    descricao: String(data.descricao || '').trim(),
    criado_por: data.criado_por || 'Controle'
  };
}


function legacyAuthFlag() {
  return sessionStorage.getItem(CONTROLE_AUTH_KEY) === '1' || localStorage.getItem(CONTROLE_AUTH_KEY) === '1' || sessionStorage.getItem(LEGACY_MONITORAMENTO_AUTH_KEY) === '1' || localStorage.getItem(LEGACY_MONITORAMENTO_AUTH_KEY) === '1';
}
/* Usuário autenticado com perfil do controle (Administrador, Gestor ou Visualizador). */
function isMonitorAuthenticated() {
  return Boolean(state.session) && isStaffPerfil(currentUser().perfil);
}
function setMonitorAuthenticated(remember=false) {
  sessionStorage.setItem(CONTROLE_AUTH_KEY, '1');
  sessionStorage.removeItem(LEGACY_MONITORAMENTO_AUTH_KEY);
  if (remember) localStorage.setItem(CONTROLE_AUTH_KEY, '1');
  else localStorage.removeItem(CONTROLE_AUTH_KEY);
  localStorage.removeItem(LEGACY_MONITORAMENTO_AUTH_KEY);
}
function clearLocalAuth() {
  clearSessionToken();
  clearCurrentUser();
  sessionStorage.removeItem(CONTROLE_AUTH_KEY);
  localStorage.removeItem(CONTROLE_AUTH_KEY);
  sessionStorage.removeItem(LEGACY_MONITORAMENTO_AUTH_KEY);
  localStorage.removeItem(LEGACY_MONITORAMENTO_AUTH_KEY);
}
function isMissingRpcError(err) {
  const msg = String(err?.message || '');
  return err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|function .* does not exist/i.test(msg));
}

/* ===== Autenticação =====
   Modo 'server' (SQL atualizacao_perfis_acesso_condutor.sql aplicado): a senha é conferida no banco
   (controle_login), que devolve um token de sessão. O perfil sempre vem do banco (controle_sessao_atual)
   e as políticas RLS aplicam as permissões — trocar a URL ou o localStorage não libera nada.
   Modo 'legacy': usado apenas enquanto o SQL novo não foi aplicado (ou sem Supabase), mantendo o
   comportamento anterior para o sistema não parar durante a atualização. */
async function restoreSession() {
  state.session = null;
  if (hasSupabase) {
    const {data, error} = await supa.rpc('controle_sessao_atual');
    if (!error) {
      state.authMode = 'server';
      state.session = normalizeSession(data);
      if (!state.session) clearLocalAuth();
      return;
    }
    if (!isMissingRpcError(error)) throw error;
    console.warn('Controle de perfis no banco ainda não aplicado (database/sql/atualizacao_perfis_acesso_condutor.sql). Usando validação antiga.');
  }
  state.authMode = 'legacy';
  const u = storedUser();
  if (u && (legacyAuthFlag() || u.perfil === CONDUTOR_PERFIL)) state.session = normalizeSession(u);
}
/* Confere no banco se a sessão ainda vale (usuário inativado, perfil alterado ou sessão expirada). */
async function checkServerSession() {
  if (state.authMode !== 'server' || !state.session) return true;
  const {data, error} = await supa.rpc('controle_sessao_atual');
  if (error) return true; // falha de rede: mantém e tenta de novo no próximo ciclo
  const fresh = normalizeSession(data);
  if (!fresh) return false;
  const changedArea = isStaffPerfil(fresh.perfil) !== isStaffPerfil(state.session.perfil);
  state.session = fresh;
  if (changedArea) { applyRoute(); render(); }
  return true;
}
async function loadLegacyUserForLogin(login) {
  if (!hasSupabase) return (state.users || []).find(u => String(u.login || '').toLowerCase() === login.toLowerCase()) || null;
  const res = await supa.from('usuarios_controle').select('*').ilike('login', login).limit(1);
  if (res.error) throw res.error;
  return (res.data || [])[0] || null;
}
async function authenticate(login, senha, remember) {
  login = String(login || '').trim();
  if (state.authMode === 'server') {
    const {data, error} = await supa.rpc('controle_login', {p_login: login, p_senha: senha, p_lembrar: Boolean(remember)});
    if (error) throw error;
    if (!data || !data.token) return null;
    clearLocalAuth();
    storeSessionToken(data.token, remember);
    state.session = normalizeSession(data);
    return state.session;
  }
  const row = await loadLegacyUserForLogin(login);
  if (!row || row.status !== 'ativo' || !row.senha_hash) return null;
  if (await hashPassword(row.login, senha) !== row.senha_hash) return null;
  const user = normalizeSession(row);
  setMonitorAuthenticated(remember);
  setCurrentUser(user, remember);
  DB.touchUserLogin(user.id).catch(() => {});
  state.session = user;
  return user;
}
async function logoutControle() {
  const u = currentUser();
  const wasCondutor = u.perfil === CONDUTOR_PERFIL;
  if (!wasCondutor) await logAudit({acao:'Logout', modulo:'Acesso', registro:u.login, detalhes:u.perfil, user:u});
  if (state.authMode === 'server') { try { await supa.rpc('controle_logout'); } catch {} }
  clearLocalAuth();
  clearDriverProgress();
  clearActiveDriverMovement();
  state.session = null;
  state.selectedMovement = null;
  // Sem sessão o banco não devolve mais nada; recarrega para não deixar dados na memória da página.
  if (state.authMode === 'server') { try { await DB.refresh(); } catch {} }
  navigate(wasCondutor ? '/condutor' : '/login', {replace:true});
}
function monitorBackButtonHtml() {
  if (!isMonitorAuthenticated()) return '';
  return `<button class="btn ghost monitor-return-btn" type="button" data-back-monitor>← Voltar para a tela de controle</button>`;
}

/* ===== Rotas e proteção por perfil =====
   /login       → login do controle
   /condutor    → login e área exclusiva do condutor
   demais rotas → área administrativa (cada aba tem um caminho, ex.: /veiculos, /usuarios)
   Não autenticado → /login (ou a tela de login de /condutor). Condutor fora de /condutor → /condutor.
   Perfil do controle em /condutor → área administrativa. */
const TAB_PATHS = {
  painel:'/', dashboard:'/dashboard', movimentacoes:'/rotas', manutencao:'/manutencao', veiculos:'/veiculos',
  motoristas:'/motoristas', clientes:'/clientes', ocorrencias:'/ocorrencias', historico:'/historico',
  relatorios:'/relatorios', usuarios:'/usuarios', auditoria:'/auditoria'
};
const PATH_TABS = Object.fromEntries(Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab]));
Object.assign(PATH_TABS, {'/painel':'painel', '/inicio':'painel', '/movimentacoes':'movimentacoes', '/condutores':'motoristas'});
const ADMIN_ONLY_TABS = ['usuarios','auditoria'];
/* DEMO: rotas por hash (#/login, #/condutor...) para funcionar em qualquer hospedagem estática. */
function hashLoc() {
  const h = String(location.hash || '').replace(/^#/, '') || '/';
  const i = h.indexOf('?');
  return {path: i >= 0 ? h.slice(0, i) : h, search: i >= 0 ? h.slice(i) : ''};
}
function currentPath() {
  const p = hashLoc().path.replace(/\/index\.html$/i, '/').replace(/\/+$/, '').toLowerCase();
  return p || '/';
}
function safeNextPath(value) {
  const v = String(value || '');
  return /^\/[a-z0-9\-/]*$/i.test(v) && !/^\/(login|condutor)\b/i.test(v) ? v : '/';
}
function resolveRoute() {
  const path = currentPath();
  const params = new URLSearchParams(hashLoc().search);
  const s = state.session;
  const perfil = s ? currentUser().perfil : null;
  const staff = Boolean(s) && isStaffPerfil(perfil);
  const condutor = Boolean(s) && perfil === CONDUTOR_PERFIL;

  if (path === '/condutor') {
    if (condutor) return {route:'driver'};
    if (staff) return {redirect:'/'};              // perfil administrativo não vira condutor pela URL
    return {route:'login', loginVariant:'condutor'};
  }
  if (path === '/login') {
    if (condutor) return {redirect:'/condutor'};
    if (staff) return {redirect: safeNextPath(params.get('next'))};
    return {route:'login', loginVariant:'controle'};
  }
  // Tela antiga do condutor (?modo=motorista) deixou de ser pública.
  const legacyDriver = params.get('modo') === 'motorista';
  if (!s) return {redirect: legacyDriver ? '/condutor' : (path === '/' ? '/login' : '/login?next=' + encodeURIComponent(path))};
  if (condutor) return {redirect:'/condutor'};
  if (!staff) return {redirect:'/login'};
  if (legacyDriver) {
    // Registro assistido pelo controle (botão "Tela do condutor"): só para quem pode registrar.
    if (can('write')) return {route:'driver'};
    return {redirect:'/'};
  }
  const tab = PATH_TABS[path];
  if (!tab) return {redirect:'/'};
  if (ADMIN_ONLY_TABS.includes(tab) && !can('admin')) return {redirect:'/'};
  return {route:'monitor', tab};
}
function applyRoute() {
  for (let i = 0; i < 4; i++) {
    const r = resolveRoute();
    if (r.redirect !== undefined) {
      const target = r.redirect || '/';
      if (target === hashLoc().path + hashLoc().search) break;
      history.replaceState({}, '', '#' + target);
      continue;
    }
    state.route = r.route;
    if (r.loginVariant) state.loginVariant = r.loginVariant;
    if (r.tab) state.tab = r.tab;
    return;
  }
  // Proteção contra laço: na dúvida, tela de login (nunca mostra área protegida).
  state.route = 'login';
  state.loginVariant = currentPath() === '/condutor' ? 'condutor' : 'controle';
}
function navigate(path, {replace=false} = {}) {
  history[replace ? 'replaceState' : 'pushState']({}, '', '#' + path);
  applyRoute();
  render();
}
window.addEventListener('popstate', () => { applyRoute(); render(); });

function generateUseNumber() {
  const prefix = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const todayCount = state.movements.filter(m => String(m.numero_uso || '').includes(prefix) || (m.created_at || '').slice(0,10) === todayKey()).length + 1;
  return `USO-${prefix}-${String(todayCount).padStart(3,'0')}`;
}

function openMovementByVehicle(vehicleId) {
  return state.movements.find(m => m.veiculo_id === vehicleId && m.status === 'em_uso');
}
function isLate(m) { return false; }
function vehicleDisplay(v) { return `${v.placa} — ${v.modelo}${v.contrato ? ' • ' + v.contrato : ''}`; }
function hasActiveMaintenance(v) {
  const plate = normalizePlate(v.placa);
  return (state.maintenances || []).some(m => MAINT_ACTIVE.includes(m.status) && (m.veiculo_id === v.id || normalizePlate(m.placa) === plate));
}
function vehicleStatus(v) {
  const open = openMovementByVehicle(v.id);
  if (open) return 'em_uso';
  if (hasActiveMaintenance(v)) return 'manutencao';
  return v.status || 'disponivel';
}
/* ===== Redesign: ícones, rótulos e utilidades de interface ===== */
const ICONS = {
  home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  route:'<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
  chart:'<path d="M4 20V11M10 20V4M16 20v-6M3 20h18"/>',
  car:'<path d="M3.5 16v-3.2l1.9-4.9A2 2 0 0 1 7.3 6.6h9.4a2 2 0 0 1 1.9 1.3l1.9 4.9V16"/><path d="M3.5 16h17v2.2h-3V16M6.5 16v2.2h-3"/><path d="M3.5 12.8h17"/><circle cx="7.6" cy="14.6" r=".7"/><circle cx="16.4" cy="14.6" r=".7"/>',
  user:'<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  pin:'<path d="M12 21s7-6 7-11.3A7 7 0 0 0 5 9.7C5 15 12 21 12 21Z"/><circle cx="12" cy="9.7" r="2.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert:'<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.4v.2"/>',
  file:'<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  wrench:'<path d="M14.5 6.2a4 4 0 0 0 5.3 5.3l-.4 1.1-7.6 7.6a2.2 2.2 0 0 1-3.1-3.1l7.6-7.6Z"/>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.8 2H4.2Z"/><path d="M10 21h4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  menu:'<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 9.8"/>',
  more:'<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2A5 5 0 0 1 21 19"/>',
  shield:'<path d="M12 3 5 6v5.5c0 4.4 2.9 7.8 7 9.5 4.1-1.7 7-5.1 7-9.5V6Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  logout:'<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>'
};
function icon(name, cls='') {
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
const TAB_LABELS = {
  manutencao:'Manutenção', usuarios:'Usuários', auditoria:'Auditoria',
  painel:'Início', dashboard:'Dashboard', movimentacoes:'Rotas', rotas:'Rotas', veiculos:'Veículos',
  motoristas:'Condutores', clientes:'Clientes', historico:'Histórico', ocorrencias:'Ocorrências', relatorios:'Relatórios'
};
function userInitials(name) {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'C') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function capitalize(t='') { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function clockParts(d = new Date()) {
  return {
    date: d.toLocaleDateString('pt-BR', {day:'numeric', month:'long', year:'numeric'}),
    weekday: capitalize(d.toLocaleDateString('pt-BR', {weekday:'long'})),
    time: d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
  };
}

(function bindGlobalUiTicks() {
  if (window.__uiTicksBound) return;
  window.__uiTicksBound = true;
  setInterval(() => {
    const c = clockParts();
    qsa('[data-clock="time"]').forEach(el => el.textContent = c.time);
    qsa('[data-clock="date"]').forEach(el => el.textContent = c.date);
    qsa('[data-clock="weekday"]').forEach(el => el.textContent = c.weekday);
  }, 20000);
})();
function kpiCard({icon: ico, tone='blue', label, value, sub='', chip='', emph=false, tab=''}) {
  const tag = tab ? `button type="button" data-tab="${tab}"` : 'div';
  const end = tab ? 'button' : 'div';
  return `<${tag} class="kpi tone-${tone}${emph ? ' emph' : ''}${tab ? ' kpi-link' : ''}"><span class="kpi-ico">${icon(ico)}</span><div class="kpi-body"><small>${escapeHtml(label)}</small><strong>${value}</strong><em>${escapeHtml(sub)}</em></div>${chip ? `<span class="kpi-chip">${escapeHtml(chip)}</span>` : ''}</${end}>`;
}
function statusBadge(status) {
  const map = {
    disponivel:['Disponível','available'], em_uso:['Em uso','inuse'], ocorrencia:['Ocorrência','occurrence'], manutencao:['Manutenção','occurrence'], finalizado:['Finalizado','done'],
    pendente:['Pendente','pending'], assinada:['Assinada','signed'], anexada:['Anexada','attached'], saida_assinada:['Saída assinada','signed'], assinatura_incompleta:['Assinatura incompleta','pending'], conferida:['Conferida','attached'], aberta:['Aberta','pending'], em_andamento:['Em andamento','inuse'], resolvida:['Resolvida','signed'], alta:['Alta','occurrence'], media:['Média','pending'], baixa:['Baixa','done'], ativo:['Ativo','signed'], inativo:['Inativo','done'], visitado:['Visitado','signed']
  };
  const m = map[status] || [status || '—', 'done'];
  return `<span class="status ${m[1]}">${m[0]}</span>`;
}
function getMetrics() {
  const vehicles = state.vehicles;
  const open = state.movements.filter(m => m.status === 'em_uso');
  return {
    total: vehicles.length,
    available: vehicles.filter(v => vehicleStatus(v) === 'disponivel').length,
    inuse: open.length,
    occurrences: state.occurrences.filter(o => (o.status || 'aberta') !== 'resolvida').length,
    totalMovements: state.movements.length
  };
}

function driverDataSignature() {
  const pick = (list, f) => (list || []).map(f).join('|');
  return [pick(state.movements, m => m.id + m.updated_at + m.status), pick(state.routeStops, r => r.id + r.updated_at + r.status), pick(state.vehicles, v => v.id + v.status), pick(state.maintenances, m => m.id + m.status)].join('#');
}
async function silentRefresh() {
  if (state.route === 'login') return;
  if (!(await checkServerSession())) { await expireSession(); return; }
  if (qs('.modal-backdrop.open')) return;
  if (document.body.dataset.signatureDrawing === '1') return;
  if (document.activeElement && ['INPUT','TEXTAREA','SELECT','CANVAS'].includes(document.activeElement.tagName)) return;
  const before = state.route === 'driver' ? driverDataSignature() : '';
  await DB.refresh();
  if (state.route === 'driver' && isCondutorArea() && before === driverDataSignature()) return;
  // Tela do condutor com a etapa de fotos aberta (continuar/finalizar rota): não redesenha. Ao abrir a câmera/galeria o
  // navegador tira o foco da página e, ao voltar, redesenhar apagaria os campos de foto e as
  // fotos escolhidas (por isso o botão parecia não funcionar). Os dados já foram atualizados acima.
  if (state.route === 'driver' && qs('#driverContinuarRota.active, #driverFinalizarRota.active')) return;
  // Na tela do condutor (route 'driver') ou fora do controle logado,
  // mantém o comportamento normal de redesenhar tudo — são telas simples e
  // sem listas longas, então não há flicker perceptível.
  if (state.route !== 'monitor' || !isMonitorAuthenticated()) {
    render();
    return;
  }
  // No painel de controle, evita redesenhar a tela inteira (header,
  // sidebar, botões) a cada atualização — só troca o conteúdo da aba atual
  // se algo realmente mudou, para não causar o "flicker" visual.
  const main = qs('.app-shell main.main');
  if (!main) { render(); return; }
  const novoHtml = renderTab();
  if (main.innerHTML === novoHtml) return; // nada mudou, não toca na tela
  main.innerHTML = novoHtml;
  bindTabContent();
}

function toast(msg) {
  let el = qs('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

function setRoute(route) {
  // 'driver' a partir do controle = registro assistido (/?modo=motorista); 'monitor' = volta para a aba atual.
  if (route === 'driver') navigate('/?modo=motorista');
  else navigate(TAB_PATHS[state.tab] || '/');
}
function setTab(tab) {
  state.tab = tab;
  const path = TAB_PATHS[tab];
  if (state.route === 'monitor' && path && currentPath() !== path) history.replaceState({}, '', '#' + path);
  render();
}


function startAutoRefresh() {
  // A atualização automática (por tempo e em tempo real via Supabase
  // Realtime) busca dados novos e, se algo realmente mudou, troca apenas o
  // conteúdo da aba atual — não a tela inteira (header, sidebar e modal
  // continuam intactos). Por isso não causa mais o "flicker" visual.
  if (!hasSupabase || autoRefreshTimer) return;
  autoRefreshTimer = setInterval(() => {
    // Controle: atualiza sempre. Área do condutor: só enquanto a tela inicial está aberta
    // (nunca no meio de um formulário de retirada/devolução/rota).
    const condutorHome = state.route === 'driver' && isCondutorArea() && qs('#driverHome.active');
    if (state.route !== 'monitor' && !condutorHome) return;
    silentRefresh().catch(() => {});
  }, 8000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) silentRefresh().catch(() => {});
  });
}

async function expireSession() {
  const wasCondutor = state.session?.perfil === CONDUTOR_PERFIL;
  clearLocalAuth();
  clearDriverProgress();
  clearActiveDriverMovement();
  state.session = null;
  try { await DB.refresh(); } catch {}
  toast('Sua sessão terminou. Entre novamente.');
  navigate(wasCondutor ? '/condutor' : '/login', {replace:true});
}
async function init() {
  applyUiPreferences();
  app.innerHTML = `<div class="driver-shell"><div class="driver-card"><div class="driver-header"><div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div><h1>Carregando</h1><p>Preparando o Controle de Frota Comercial.</p></div></div></div>`;
  try {
    if (!hasSupabase) await DB.init();      // modo local: os usuários ficam no próprio navegador
    await restoreSession();                 // valida a sessão no banco antes de carregar qualquer dado
    if (hasSupabase) await DB.init();
    startAutoRefresh();
  } catch (err) { console.error(err); app.innerHTML = errorScreen(err); return; }
  applyRoute();
  render();
}

function errorScreen(err) {
  try { console.error(err); } catch {}
  return `<div class="driver-shell"><div class="driver-card"><div class="driver-header"><div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div><h1>Não foi possível abrir o sistema</h1><p>Não foi possível abrir o sistema agora. Verifique sua conexão e tente novamente em instantes.</p></div></div></div>`;
}

function render() {
  applyUiPreferences();
  // Cada tela confere a sessão/perfil novamente: nada protegido é desenhado sem o perfil certo.
  if (state.route === 'driver' && (isCondutorArea() || (isMonitorAuthenticated() && can('write')))) renderDriver();
  else if (state.route === 'monitor' && isMonitorAuthenticated()) renderMonitor();
  else renderMonitorLogin();
}


function renderMonitorLogin() {
  const isCondutorLogin = state.loginVariant === 'condutor';
  const firstAccess = !hasSupabase && !isCondutorLogin && !(state.users || []).length;
  app.innerHTML = firstAccess ? `
    <main class="login-shell">
      <section class="login-card">
        <div class="driver-header">
          <div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div>
          <h1>Primeiro acesso</h1>
          <p>Cadastre o administrador do sistema.</p>
        </div>
        <form id="firstAdminForm" class="form-grid login-form">
          <div class="field full"><label>Nome</label><input name="nome" required autocomplete="name"></div>
          <div class="field full"><label>E-mail</label><input name="login" type="email" required autocomplete="username"></div>
          <div class="field full"><label>Senha</label><input name="senha" type="password" minlength="6" required autocomplete="new-password" placeholder="Mínimo de 6 caracteres"></div>
          <button class="btn primary big full" type="submit">Criar administrador</button>
        </form>
      </section>
    </main>` : `
    <main class="login-shell">
      <section class="login-card">
        <div class="driver-header">
          <div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div>
          <h1>${isCondutorLogin ? 'Área do condutor' : 'Acesso do controle'}</h1>
          <p>${isCondutorLogin ? 'Entre com o e-mail e a senha fornecidos pelo administrador.' : 'Entre com seu usuário para abrir o painel de controle.'}</p>
        </div>
        <form id="monitorLoginForm" class="form-grid login-form">
          <div class="field full">
            <label>E-mail</label>
            <input name="usuario" type="email" inputmode="email" required autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="seu@email.com" autofocus>
          </div>
          <div class="field full">
            <label>Senha</label>
            <input name="senha" required type="password" autocomplete="current-password" placeholder="${isCondutorLogin ? 'Sua senha' : 'Senha do controle'}">
          </div>
          <label class="notice full login-remember"><input type="checkbox" name="lembrar" value="1"> ${isCondutorLogin ? 'Manter conectado neste aparelho.' : 'Manter controle conectado neste computador.'}</label>
          <button class="btn primary big full" type="submit">${isCondutorLogin ? 'Entrar' : 'Entrar no controle'}</button>
          <a class="btn big full" href="#${isCondutorLogin ? '/login' : '/condutor'}" data-login-switch>${isCondutorLogin ? 'Acesso do controle' : 'Sou condutor'}</a>
        </form>
        <p class="muted login-help">${isCondutorLogin ? 'Cada condutor acessa somente as próprias rotas e o próprio histórico.' : 'Condutores entram pela área do condutor.'}</p>
        <p class="muted login-help" style="margin-top:10px;padding:10px;border:1px dashed currentColor;border-radius:8px">Demonstração — qualquer senha funciona.<br>${isCondutorLogin ? 'Condutor: <b>condutor@exemplo.com</b>' : 'Administrador: <b>admin@exemplo.com</b> · Gestor: <b>gestor@exemplo.com</b> · Consulta: <b>consulta@exemplo.com</b>'}</p>
      </section>
    </main>`;
  bindMonitorLogin();
}
function bindMonitorLogin() {
  const first = qs('#firstAdminForm');
  if (first) first.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const login = String(d.login || '').trim().toLowerCase();
      const row = await DB.saveUser({nome:String(d.nome).trim(), login, perfil:'Administrador', status:'ativo', senha_hash: await hashPassword(login, d.senha)});
      setMonitorAuthenticated(true); setCurrentUser(row, true);
      state.session = normalizeSession(row);
      state.tab = 'painel'; navigate('/', {replace:true});
    } catch (err) { toast(userMessage(err, 'Não foi possível criar o administrador.')); }
  };
  const form = qs('#monitorLoginForm');
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    const usuario = String(data.usuario || '').trim();
    const senha = String(data.senha || '');
    const remember = Boolean(data.lembrar);
    let user = null;
    try { user = await authenticate(usuario, senha, remember); }
    catch (err) { if (btn) btn.disabled = false; toast(userMessage(err, 'Não foi possível entrar agora. Tente novamente.')); return; }
    if (!user) { if (btn) btn.disabled = false; toast('Usuário ou senha incorretos.'); return; }
    // Limpa progresso de formulário de outro condutor que tenha usado este aparelho.
    clearDriverProgress();
    clearActiveDriverMovement();
    try { await DB.refresh(); } catch (err) { console.error(err); }
    if (isStaffPerfil(user.perfil)) {
      logAudit({acao:'Login', modulo:'Acesso', registro:user.login, detalhes:user.perfil, user});
      toast('Controle liberado.');
    }
    // O destino é decidido pelo perfil validado, não pela tela em que o login foi feito.
    applyRoute();
    if (state.route === 'login') navigate(user.perfil === CONDUTOR_PERFIL ? '/condutor' : '/', {replace:true});
    else render();
  };
  const switchLink = qs('[data-login-switch]');
  if (switchLink) switchLink.onclick = ev => { ev.preventDefault(); navigate(switchLink.getAttribute('href').replace(/^#/, '')); };
}

function readActiveDriverMovementReference() {
  try {
    const raw = localStorage.getItem(DRIVER_ACTIVE_MOVEMENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeActiveDriverMovement(movement) {
  if (!movement) return;
  try {
    localStorage.setItem(DRIVER_ACTIVE_MOVEMENT_KEY, JSON.stringify({
      id: movement.id || '',
      numero_uso: movement.numero_uso || '',
      veiculo_id: movement.veiculo_id || '',
      placa: movement.placa || '',
      motorista_id: movement.motorista_id || '',
      motorista: movement.motorista || '',
      updated_at: nowISO()
    }));
  } catch {}
}
function clearActiveDriverMovement() {
  try { localStorage.removeItem(DRIVER_ACTIVE_MOVEMENT_KEY); } catch {}
}
function resolveActiveDriverMovement() {
  const progress = readDriverProgress() || {};
  const references = [
    progress.activeRouteMovement,
    ['retirada','continuar','finalizar_rota'].includes(progress.successType) ? progress.successMovement : null,
    readActiveDriverMovementReference()
  ].filter(Boolean);

  for (const ref of references) {
    const found = driverScopeMovements().find(m =>
      m.status === 'em_uso' && (
        (ref.id && m.id === ref.id) ||
        (ref.numero_uso && m.numero_uso === ref.numero_uso)
      )
    );
    if (found) {
      writeActiveDriverMovement(found);
      return found;
    }
  }

  const open = driverScopeMovements().filter(m => m.status === 'em_uso');
  const withdrawal = progress.withdrawal || {};
  if (withdrawal.veiculo_id) {
    const byVehicle = open.find(m => m.veiculo_id === withdrawal.veiculo_id);
    if (byVehicle) {
      writeActiveDriverMovement(byVehicle);
      return byVehicle;
    }
  }
  if (withdrawal.motorista_id) {
    const byDriver = open.filter(m => m.motorista_id === withdrawal.motorista_id);
    if (byDriver.length === 1) {
      writeActiveDriverMovement(byDriver[0]);
      return byDriver[0];
    }
  }
  if (open.length === 1) {
    writeActiveDriverMovement(open[0]);
    return open[0];
  }
  return null;
}
function driverActiveRouteState() {
  const movement = resolveActiveDriverMovement();
  if (!movement) return null;
  const stops = routeStopsForMovement(movement.id);
  const current = currentRouteStop(movement);
  return {
    movement,
    stops,
    current,
    finished: stops.length > 0 && !current
  };
}
function driverHomeHtml() {
  const route = driverActiveRouteState();
  if (!route) {
    return `
      <div class="driver-options">
        <button class="btn primary big" data-driver-action="retirada">Retirar veículo</button>
        <button class="btn big" data-driver-action="devolucao">Devolver veículo</button>
      </div>`;
  }
  const {movement, current, finished} = route;
  const currentName = current ? routeStopLabel(current) : 'Roteiro finalizado';
  return `
    <section class="driver-route-card ${finished ? 'finished' : ''}">
      <div class="driver-route-status">
        <span>${finished ? 'Roteiro finalizado' : 'Rota em andamento'}</span>
        <strong>${escapeHtml(movement.placa || '')} • ${escapeHtml(movement.motorista || '')}</strong>
      </div>
      <div class="driver-current-client">
        <small>${finished ? 'Último cliente concluído' : 'Cliente atual'}</small>
        <h2>${escapeHtml(currentName)}</h2>
        ${!finished && current ? `<div class="destination-table-links">${routeStopRouteLinksHtml(current)}</div>` : ''}
      </div>
      ${finished ? `
        <p class="muted driver-route-help">O roteiro foi encerrado. Ao retornar à empresa, registre a devolução do veículo.</p>
        <div class="driver-route-actions single">
          <button class="btn primary big" data-driver-action="devolucao">Devolver veículo</button>
        </div>` : `
        <p class="muted driver-route-help">Terminou o atendimento deste cliente? Escolha uma das opções abaixo.</p>
        <div class="driver-route-actions">
          <button class="btn primary big" data-driver-action="continuar">Continuar rota</button>
          <button class="btn big" data-driver-action="finalizar-rota">Finalizar roteiro</button>
        </div>`}
    </section>`;
}
/* Na área do condutor, só os usos do próprio condutor (o banco já filtra; aqui é reforço da interface). */
function driverScopeMovements() {
  if (!isCondutorArea()) return state.movements;
  const mine = currentUser().motorista_id;
  return mine ? state.movements.filter(m => m.motorista_id === mine) : [];
}

/* ===== Área do condutor (/condutor) ===== */
function condutorVehicleHtml(active) {
  if (!active) return `
    <div class="condutor-info-card">
      <small>Veículo</small>
      <strong>Nenhum veículo em uso</strong>
      <span>Ao retirar um veículo ele aparece aqui até a devolução.</span>
    </div>`;
  const v = state.vehicles.find(x => x.id === active.veiculo_id);
  return `
    <div class="condutor-info-card active">
      <small>Veículo em uso</small>
      <strong>${escapeHtml(active.placa || v?.placa || '')} — ${escapeHtml(active.modelo || v?.modelo || '')}</strong>
      <span>Uso ${escapeHtml(active.numero_uso || '—')} • retirado em ${escapeHtml(dateTimeBR(active.saida_at))}</span>
    </div>`;
}
function condutorStatsHtml(list) {
  const visited = list.reduce((n, m) => n + routeStopsForMovement(m.id).filter(st => st.status === 'visitado').length, 0);
  const last = list[0];
  return `
    <div class="condutor-stats">
      <div><small>Usos</small><strong>${list.length}</strong></div>
      <div><small>Clientes atendidos</small><strong>${visited}</strong></div>
      <div><small>Último uso</small><strong>${last ? escapeHtml(dateBR(last.saida_at)) : '—'}</strong></div>
    </div>`;
}
function condutorHistoryHtml(list) {
  const rows = list.slice(0, 20);
  return `
    <section class="condutor-history">
      <div class="condutor-section-head"><h3>Meu histórico</h3><span class="muted">${list.length > rows.length ? `últimos ${rows.length} de ${list.length}` : `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`}</span></div>
      ${rows.length ? `<div class="condutor-history-list">${rows.map(m => {
        const stops = routeStopsForMovement(m.id);
        const done = stops.filter(st => st.status === 'visitado').length;
        return `<article class="condutor-history-item">
          <div class="condutor-history-top"><strong>${escapeHtml(m.placa || '')} — ${escapeHtml(m.modelo || '')}</strong>${statusBadge(m.status)}</div>
          <span>${escapeHtml(m.numero_uso || '')}</span>
          <span>Saída ${escapeHtml(dateTimeBR(m.saida_at))}${m.chegada_at ? ` • Devolução ${escapeHtml(dateTimeBR(m.chegada_at))}` : ''}</span>
          <span>${stops.length ? `${done} de ${stops.length} ${stops.length === 1 ? 'cliente atendido' : 'clientes atendidos'} • ${escapeHtml(movementRouteTitle(m))}` : escapeHtml(m.cliente_nome || m.destino || 'Sem clientes registrados')}</span>
        </article>`;
      }).join('')}</div>` : `<div class="empty">Nenhum uso registrado ainda.</div>`}
    </section>`;
}
function renderCondutor() {
  const u = currentUser();
  const driver = condutorDriverRecord();
  const nome = driver?.nome || u.nome;
  const list = driverScopeMovements().slice().sort((a,b) => String(b.saida_at || b.created_at || '').localeCompare(String(a.saida_at || a.created_at || '')));
  const active = list.find(m => m.status === 'em_uso') || null;
  const meta = [driver?.matricula ? `Matrícula ${driver.matricula}` : '', driver?.setor || ''].filter(Boolean).join(' • ');
  app.innerHTML = `
    <main class="driver-shell condutor-shell">
      <section class="driver-card">
        <div class="condutor-bar">
          <div class="condutor-brand"><div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div><span>Área do condutor</span></div>
          <button class="btn ghost small" type="button" data-condutor-logout>${icon('logout')}<span>Sair</span></button>
        </div>
        <div class="condutor-ident">
          <small>Condutor</small>
          <h1>${escapeHtml(nome)}</h1>
          ${meta ? `<p>${escapeHtml(meta)}</p>` : ''}
        </div>

        <div id="driverHome" class="driver-step active">
          ${driver ? `
            ${condutorVehicleHtml(active)}
            ${driverHomeHtml()}
            ${condutorStatsHtml(list)}
            ${condutorHistoryHtml(list)}` : `
            <div class="notice">Seu usuário ainda não está vinculado a um cadastro de condutor. Procure o administrador do controle para liberar a retirada de veículos.</div>`}
        </div>

        ${driver ? `
        <div id="driverRetirada" class="driver-step">${driverWithdrawalForm()}</div>
        <div id="driverDevolucao" class="driver-step">${driverReturnForm()}</div>
        <div id="driverContinuarRota" class="driver-step">${driverContinueRouteForm()}</div>
        <div id="driverFinalizarRota" class="driver-step">${driverFinishRouteForm()}</div>
        <div id="driverSuccess" class="driver-step"></div>` : ''}
      </section>
    </main>`;
  const logout = qs('[data-condutor-logout]');
  if (logout) logout.onclick = () => logoutControle();
  if (driver) bindDriver();
}

function renderDriver() {
  if (isCondutorArea()) { renderCondutor(); return; }
  app.innerHTML = `
    <main class="driver-shell">
      <section class="driver-card">
        <div class="driver-header">
          <div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div>
          <h1>Controle de Frota Comercial</h1>
          <p>Registre a retirada ou devolução antes da liberação da chave.</p>
        </div>
        ${monitorBackButtonHtml()}

        <div id="driverHome" class="driver-step active">
          ${driverHomeHtml()}
        </div>

        <div id="driverRetirada" class="driver-step">
          ${driverWithdrawalForm()}
        </div>

        <div id="driverDevolucao" class="driver-step">
          ${driverReturnForm()}
        </div>

        <div id="driverContinuarRota" class="driver-step">
          ${driverContinueRouteForm()}
        </div>

        <div id="driverFinalizarRota" class="driver-step">
          ${driverFinishRouteForm()}
        </div>

        <div id="driverSuccess" class="driver-step"></div>
      </section>
    </main>`;
  bindDriver();
}


function driverSelectorHtml() {
  if (isCondutorArea()) {
    // Condutor logado: identificado pela sessão, sem escolher outro nome.
    const d = condutorDriverRecord() || {};
    const info = [d.matricula, d.setor].filter(Boolean).join(' • ') || 'Identificado pelo seu login.';
    return `<div class="field full">
      <label>Condutor</label>
      <input type="hidden" name="motorista_id" value="${escapeHtml(d.id || '')}">
      <input type="hidden" name="motorista" value="${escapeHtml(d.nome || currentUser().nome)}">
      <input type="hidden" name="matricula" value="${escapeHtml(d.matricula || '')}">
      <div class="driver-picker-card"><div class="driver-picker-info"><strong>${escapeHtml(d.nome || currentUser().nome)}</strong><span>${escapeHtml(info)}</span></div></div>
    </div>`;
  }
  const drivers = activeDrivers();
  return `<div class="field full driver-picker-field" data-driver-selector>
    <label>Condutor</label>
    <input type="hidden" name="motorista_id" data-driver-id-hidden>
    <input type="hidden" name="motorista" data-driver-name-hidden>
    <input type="hidden" name="matricula" data-driver-matricula-hidden>
    <div class="driver-picker-card">
      <div class="driver-picker-info">
        <strong data-driver-selected-text>${drivers.length ? 'Nenhum condutor selecionado' : 'Nenhum condutor cadastrado'}</strong>
        <span data-driver-selected-summary>${drivers.length ? 'Clique para escolher em uma tabela.' : 'Cadastre o condutor ou use a opção Outros.'}</span>
      </div>
      <button class="btn" type="button" data-open-driver-picker>Escolher condutor</button>
    </div>
  </div>
  <div class="field full driver-manual-field" data-driver-manual-field style="display:none">
    <label>Condutor não cadastrado</label>
    <input name="motorista_manual" autocomplete="name" placeholder="Digite o nome completo">
    <div class="destination-actions">
      <button class="btn small" type="button" data-self-register-driver>Cadastrar condutor</button>
    </div>
  </div>`;
}
function clientPickerHtml(required=false) {
  const clients = activeClients();
  return `<div class="field full" data-client-picker>
    <label>Cliente</label>
    <select name="cliente_id" data-client-select ${required ? 'required' : ''}>
      <option value="">${clients.length ? (required ? 'Selecione um cliente cadastrado' : 'Selecione um cliente') : 'Nenhum cliente cadastrado'}</option>
      ${clients.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.nome)}${c.endereco ? ' • ' + escapeHtml(c.endereco) : ''}</option>`).join('')}
    </select>
    <input type="hidden" name="cliente_nome" data-client-name-hidden>
    <div class="destination-actions"><button class="btn small" type="button" data-new-client-inline>Cadastrar cliente</button></div>
  </div>`;
}

function driverWithdrawalForm() {
  const available = state.vehicles.filter(v => vehicleStatus(v) === 'disponivel');
  return `
    <button class="btn ghost" data-back-driver>← Voltar</button>
    <h2>Retirada de veículo</h2>
    <p class="muted">Selecione o veículo e informe o primeiro cliente da rota.</p>
    <form id="withdrawalForm" class="form-grid">
      <div class="field full">
        <label>Veículo</label>
        <select name="veiculo_id" required>
          <option value="">Selecione</option>
          ${available.map(v => `<option value="${v.id}">${escapeHtml(vehicleDisplay(v))}</option>`).join('')}
        </select>
      </div>
      ${driverSelectorHtml()}
      ${clientPickerHtml(true)}
      ${destinationPickerHtml({label:'Endereço / ponto do primeiro cliente', placeholder:'Endereço do cliente ou ponto no mapa', required:false, helper:'Selecione o cliente cadastrado. O endereço/ponto será preenchido automaticamente quando existir no cadastro.'})}
      <div class="field full">
        <label>Observação</label>
        <textarea name="observacao_saida" placeholder="Opcional"></textarea>
      </div>
      ${signaturePadHtml('assinatura_saida_url', {label: 'Assinatura do condutor na retirada'})}
      <div class="field full">
        <label class="notice"><input type="checkbox" required /> Confirmo que estou retirando o veículo informado.</label>
      </div>
      <button class="btn primary big full" type="submit">Confirmar retirada e abrir rota</button>
    </form>`;
}

function driverReturnForm() {
  const open = driverScopeMovements().filter(m => m.status === 'em_uso');
  const activeMovement = resolveActiveDriverMovement();
  return `
    <button class="btn ghost" data-back-driver>← Voltar</button>
    <h2>Devolução de veículo</h2>
    <p class="muted">Confirme a hora da entrega.</p>
    <form id="returnForm" class="form-grid">
      ${activeMovement ? `
        <input type="hidden" name="movimento_id" value="${escapeHtml(activeMovement.id)}">
        <div class="field full">
          <div class="driver-active-use-summary">
            <small>Veículo em uso</small>
            <strong>${escapeHtml(activeMovement.placa)} — ${escapeHtml(activeMovement.modelo)}</strong>
            <span>${escapeHtml(activeMovement.motorista)} • ${escapeHtml(movementRouteTitle(activeMovement))}</span>
          </div>
        </div>` : `
        <div class="field full">
          <label>Veículo em uso</label>
          <select name="movimento_id" required>
            <option value="">Selecione</option>
            ${open.map(m => `<option value="${m.id}">${escapeHtml(m.placa)} — ${escapeHtml(m.modelo)} • ${escapeHtml(m.motorista)} • atual: ${escapeHtml(movementRouteTitle(m))}</option>`).join('')}
          </select>
        </div>`}
      <div class="field">
        <label>Hora da entrega</label>
        <input type="time" name="hora_chegada" required value="${currentTimeValue()}" />
      </div>
      <div class="field full">
        <label>Observação da devolução</label>
        <textarea name="observacao_chegada" placeholder="Opcional"></textarea>
      </div>
      ${signaturePadHtml('assinatura_entrega_url', {label: 'Assinatura do condutor na devolução'})}
      <div class="field full">
        <label class="notice"><input type="checkbox" required /> Confirmo a devolução do veículo informado.</label>
      </div>
      <button class="btn primary big full" type="submit">Confirmar devolução</button>
    </form>`;
}


function deliveryPhotosHtml() {
  return `
    <div class="field full">
      <div class="delivery-photos-card" data-delivery-photos>
        <div class="delivery-photos-head">
          <div>
            <strong>Fotos da entrega</strong>
            <p>Opcional • até 5 fotos em cada categoria.</p>
          </div>
        </div>
        <div class="delivery-photos-grid">
          ${deliveryPhotoColumnHtml('antes', 'Antes', 'Como estava a entrega antes do atendimento.')}
          ${deliveryPhotoColumnHtml('depois', 'Depois', 'Como ficou a entrega após o atendimento.')}
        </div>
      </div>
    </div>`;
}
function deliveryPhotoColumnHtml(category, label, helper) {
  return `
    <div class="delivery-photo-column" data-photo-category="${category}">
      <div class="delivery-photo-title"><strong>${label}</strong><span>até 5 fotos</span></div>
      <p class="delivery-photo-helper">${helper}</p>
      <div class="delivery-photo-actions">
        <label class="btn small" role="button">Tirar foto
          <input type="file" accept="image/*" capture="environment" data-delivery-photo-input="${category}-camera" class="file-hidden">
        </label>
        <label class="btn small" role="button">Galeria
          <input type="file" accept="image/*" multiple data-delivery-photo-input="${category}-gallery" class="file-hidden">
        </label>
      </div>
      <div class="delivery-photo-count" data-delivery-photo-count="${category}">0/5 fotos</div>
      <div class="delivery-photo-preview" data-delivery-photo-preview="${category}"></div>
    </div>`;
}
function getDeliveryPhotoFiles(form, category) {
  const root = qs('[data-delivery-photos]', form);
  if (!root) return [];
  return [
    ...(qs(`[data-delivery-photo-input="${category}-camera"]`, root)?._selectedFiles || []),
    ...(qs(`[data-delivery-photo-input="${category}-gallery"]`, root)?._selectedFiles || [])
  ].slice(0, 5);
}
function initDeliveryPhotoPickers(root=document) {
  qsa('[data-delivery-photo-input]', root).forEach(input => {
    if (input.dataset.photoReady === '1') return;
    input.dataset.photoReady = '1';
    input._selectedFiles = [];
    input.addEventListener('change', () => {
      const category = String(input.dataset.deliveryPhotoInput || '').split('-')[0];
      const container = input.closest('[data-photo-category]');
      if (!container) return;
      const allInputs = qsa('[data-delivery-photo-input]', container);
      const current = [];
      allInputs.forEach(el => (el._selectedFiles || []).forEach(file => {
        if (!current.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) current.push(file);
      }));
      if (input.files?.length) input._selectedFiles = [...(input._selectedFiles || []), ...input.files];
      const combined = [];
      allInputs.forEach(el => (el._selectedFiles || []).forEach(file => {
        if (!combined.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) combined.push(file);
      }));
      const limited = combined.slice(0, 5);
      allInputs.forEach(el => {
        el._selectedFiles = (el._selectedFiles || []).filter(file => limited.includes(file));
      });
      renderDeliveryPhotoPreview(container, category);
      input.value = '';
    });
  });
}
function renderDeliveryPhotoPreview(container, category) {
  const files = getDeliveryPhotoFiles(container.closest('form'), category);
  const preview = qs(`[data-delivery-photo-preview="${category}"]`, container);
  const count = qs(`[data-delivery-photo-count="${category}"]`, container);
  if (count) count.textContent = `${files.length}/5 fotos`;
  if (!preview) return;
  preview.innerHTML = files.map((file, index) => {
    const url = URL.createObjectURL(file);
    return `<div class="delivery-photo-thumb"><img src="${url}" alt="${category} ${index + 1}"><span>${index + 1}</span></div>`;
  }).join('');
}
function driverContinueRouteForm() {
  const route = driverActiveRouteState();
  const movement = route?.movement || null;
  return `
    <button class="btn ghost" data-back-driver>← Voltar</button>
    <h2>Selecionar próximo cliente</h2>
    <p class="muted">Escolha o próximo cliente. Ao confirmar, o cliente atual será marcado como concluído e o novo cliente ficará em andamento.</p>
    <form id="continueRouteForm" class="form-grid">
      <input type="hidden" name="movimento_id" value="${escapeHtml(movement?.id || '')}">
      ${movement ? `<div class="field full"><div class="notice"><strong>Uso em andamento:</strong> ${escapeHtml(movement.placa)} • ${escapeHtml(movement.motorista)}<br><strong>Cliente atual:</strong> ${escapeHtml(route?.current ? routeStopLabel(route.current) : movementRouteTitle(movement))}</div></div>` : `<div class="field full"><div class="notice">Nenhum roteiro em andamento foi encontrado neste dispositivo.</div></div>`}
      ${clientPickerHtml(true)}
      ${destinationPickerHtml({label:'Endereço / ponto do próximo cliente', placeholder:'Endereço do cliente ou ponto no mapa', required:false, helper:'Selecione o próximo cliente cadastrado. O endereço/ponto será preenchido automaticamente quando existir no cadastro.'})}
      <div class="field full"><label>Observação</label><textarea name="observacao" placeholder="Opcional"></textarea></div>
      ${signaturePadHtml('assinatura_entrega_url', {label: 'Assinatura do condutor na finalização da entrega', hint: 'Assine para confirmar a finalização deste cliente.'})}
      ${deliveryPhotosHtml()}
      <button class="btn primary big full" type="submit" ${movement ? '' : 'disabled'}>Concluir cliente e iniciar próximo</button>
    </form>`;
}
function driverFinishRouteForm() {
  const route = driverActiveRouteState();
  const movement = route?.movement || null;
  const currentName = route?.current ? routeStopLabel(route.current) : movementRouteTitle(movement || {});
  return `
    <button class="btn ghost" data-back-driver>← Voltar</button>
    <h2>Finalizar roteiro</h2>
    <p class="muted">Use esta opção quando não houver outro cliente para atender. Depois disso, a opção de próximo cliente não será mais exibida.</p>
    <form id="finishRouteForm" class="form-grid">
      <input type="hidden" name="movimento_id" value="${escapeHtml(movement?.id || '')}">
      <div class="field full">
        <div class="driver-finish-summary">
          <small>Cliente que será concluído</small>
          <strong>${escapeHtml(currentName || 'Cliente atual')}</strong>
          ${movement ? `<span>${escapeHtml(movement.placa || '')} • ${escapeHtml(movement.motorista || '')}</span>` : '<span>Nenhum roteiro em andamento encontrado.</span>'}
        </div>
      </div>
      ${signaturePadHtml('assinatura_entrega_url', {label: 'Assinatura do condutor na finalização da entrega', hint: 'Assine para confirmar a finalização deste cliente.'})}
      ${deliveryPhotosHtml()}
      <button class="btn primary big full" type="submit" ${movement ? '' : 'disabled'}>Concluir cliente e finalizar roteiro</button>
    </form>`;
}


function readDriverProgress() {
  const sources = [sessionStorage.getItem(DRIVER_PROGRESS_KEY), localStorage.getItem(DRIVER_PROGRESS_KEY)].filter(Boolean);
  for (const item of sources) {
    try { return JSON.parse(item); } catch {}
  }
  return null;
}
function writeDriverProgress(progress) {
  try {
    const text = JSON.stringify({...progress, updated_at: nowISO()});
    sessionStorage.setItem(DRIVER_PROGRESS_KEY, text);
    localStorage.setItem(DRIVER_PROGRESS_KEY, text);
  } catch {}
}
function clearDriverProgress() {
  try {
    sessionStorage.removeItem(DRIVER_PROGRESS_KEY);
    localStorage.removeItem(DRIVER_PROGRESS_KEY);
  } catch {}
}
function activeRouteFromDriverProgress() {
  const progress = readDriverProgress() || {};
  return progress.activeRouteMovement || (['retirada','continuar','finalizar_rota'].includes(progress.successType) ? progress.successMovement : null);
}
function driverCanContinueRoute() {
  const route = driverActiveRouteState();
  return Boolean(route && !route.finished && route.current);
}
function currentDriverStepId() {
  return qs('.driver-step.active')?.id || 'driverHome';
}
function formObject(selector) {
  const form = qs(selector);
  if (!form) return {};
  const data = Object.fromEntries(new FormData(form).entries());
  Object.keys(data).forEach(key => { if (key.startsWith('assinatura_')) delete data[key]; });
  return selector === '#withdrawalForm' || selector === '#continueRouteForm' ? sanitizeDestinationFormData(data) : data;
}
function setFormValues(selector, values={}) {
  const form = qs(selector);
  if (!form || !values) return;
  const safeValues = selector === '#withdrawalForm' || selector === '#continueRouteForm' ? sanitizeDestinationFormData(values) : values;
  Object.entries(safeValues).forEach(([name, value]) => {
    if (name.startsWith('assinatura_')) return;
    const fields = form.elements[name];
    if (!fields) return;
    const list = fields instanceof RadioNodeList ? [...fields] : [fields];
    list.forEach(field => {
      if (!field) return;
      if (field.type === 'checkbox' || field.type === 'radio') field.checked = field.value === String(value) || value === true || value === 'on';
      else field.value = value ?? '';
    });
  });
  const clientSelect = qs('[data-client-select]', form);
  if (clientSelect && clientSelect.value) clientSelect.dispatchEvent(new Event('change', {bubbles:true}));
  const driverBox = qs('[data-driver-selector]', form);
  if (driverBox) updateDriverSelectorVisual(driverBox);
}
function saveDriverProgress(stepId=currentDriverStepId(), extra={}) {
  if (state.route !== 'driver') return;
  const previous = readDriverProgress() || {};
  writeDriverProgress({
    ...previous,
    ...extra,
    step: stepId,
    withdrawal: formObject('#withdrawalForm'),
    returnData: formObject('#returnForm'),
    continueData: formObject('#continueRouteForm')
  });
}
function bindDriverProgressPersistence() {
  ['#withdrawalForm', '#returnForm', '#continueRouteForm', '#finishRouteForm'].forEach(selector => {
    const form = qs(selector);
    if (!form || form.dataset.progressReady === '1') return;
    form.dataset.progressReady = '1';
    form.addEventListener('input', () => saveDriverProgress(), true);
    form.addEventListener('change', () => saveDriverProgress(), true);
  });
}
function driverSuccessHtml(type, movement) {
  if (type === 'continuar') {
    return `
      <div class="success-box">
        <h2>Próximo cliente iniciado</h2>
        <p>O cliente anterior foi concluído e o cliente abaixo ficou em andamento.</p>
        <div class="use-number">${escapeHtml(movement.cliente_nome || movement.destino || 'Novo cliente')}</div>
        <p><strong>${escapeHtml(movement.placa || '')} ${movement.modelo ? '— ' + escapeHtml(movement.modelo) : ''}</strong></p>
        ${destinationSuccessLinksHtml(movement)}
      </div>
      <button class="btn primary big block" data-finish-driver data-preserve-active-route>Concluir</button>
    `;
  }
  if (type === 'finalizar_rota') {
    return `
      <div class="success-box">
        <h2>Roteiro finalizado</h2>
        <p>O último cliente foi concluído. A opção de próximo cliente não será mais exibida para este roteiro.</p>
        <div class="use-number">${escapeHtml(movement.numero_uso || 'Rota')}</div>
        <p><strong>${escapeHtml(movement.placa || '')} ${movement.modelo ? '— ' + escapeHtml(movement.modelo) : ''}</strong></p>
        <p class="muted">Ao retornar à empresa, registre a devolução do veículo.</p>
      </div>
      <button class="btn primary big block" data-driver-action="devolucao" type="button">Devolver veículo</button>
      <button class="btn big block" data-finish-driver data-preserve-active-route>Voltar ao início</button>
    `;
  }
  if (type === 'devolucao') {
    return `
      <div class="success-box">
        <h2>Devolução registrada</h2>
        <p>Entrega confirmada para o uso abaixo.</p>
        <div class="use-number">${escapeHtml(movement.numero_uso)}</div>
        <p><strong>${escapeHtml(movement.placa)} — ${escapeHtml(movement.modelo)}</strong></p>
        <p class="muted">Chegada registrada às ${timeBR(movement.chegada_at)}.</p>
      </div>
      <button class="btn primary big block" data-finish-driver>Concluir</button>
    `;
  }
  return `
    <div class="success-box">
      <h2>Retirada registrada</h2>
      <p>Saída assinada digitalmente. Informe este número ao controle antes de retirar a chave.</p>
      <div class="use-number">${escapeHtml(movement.numero_uso)}</div>
      <p><strong>${escapeHtml(movement.placa)} — ${escapeHtml(movement.modelo)}</strong></p>
      <p class="muted">Saída registrada às ${timeBR(movement.saida_at)}.</p>
      ${destinationSuccessLinksHtml(movement)}
    </div>
    <button class="btn primary big block" data-finish-driver data-preserve-active-route>Concluir</button>
  `;
}

function showDriverSuccess(type, movement) {
  const storedMovement = {...movement};
  if (type === 'devolucao') clearActiveDriverMovement();
  else writeActiveDriverMovement(storedMovement);
  saveDriverProgress('driverSuccess', {successType:type, successMovement:storedMovement});
  showSuccess(driverSuccessHtml(type, storedMovement));
}
function restoreDriverProgress() {
  const progress = readDriverProgress();
  if (!progress || state.route !== 'driver') return;
  if (progress.step === 'driverSuccess' && progress.successMovement) {
    const movement = state.movements.find(m => m.id === progress.successMovement.id || m.numero_uso === progress.successMovement.numero_uso) || progress.successMovement;
    showSuccess(driverSuccessHtml(progress.successType || 'retirada', movement));
    return;
  }
  setFormValues('#withdrawalForm', progress.withdrawal || {});
  setFormValues('#returnForm', progress.returnData || {});
  setFormValues('#continueRouteForm', progress.continueData || {});
  if (progress.step === 'driverRetirada' || progress.step === 'driverDevolucao' || progress.step === 'driverContinuarRota' || progress.step === 'driverFinalizarRota') {
    showDriverStep(progress.step, false);
  }
}
function bindDriverActionButtons(root=document) {
  qsa('[data-driver-action]', root).forEach(btn => btn.onclick = async () => {
    const action = btn.dataset.driverAction;
    const stepMap = {
      retirada: 'driverRetirada',
      devolucao: 'driverDevolucao',
      continuar: 'driverContinuarRota',
      'finalizar-rota': 'driverFinalizarRota'
    };
    if (action === 'continuar' || action === 'devolucao' || action === 'finalizar-rota') {
      try { await DB.refresh(); } catch {}
    }
    if (action === 'continuar' || action === 'finalizar-rota') {
      const route = driverActiveRouteState();
      if (!route) return toast('Não foi possível identificar o roteiro em andamento neste aparelho.');
      if (action === 'continuar' && route.finished) return toast('Este roteiro já foi finalizado. Registre a devolução do veículo.');
    }
    const nextStep = stepMap[action];
    if (!nextStep) return;
    if (action !== 'retirada') renderDriver();
    showDriverStep(nextStep);
  });
}
function bindDriver() {
  bindDriverActionButtons();
  qsa('[data-back-driver]').forEach(btn => btn.onclick = () => showDriverStep('driverHome'));
  qsa('[data-back-monitor]').forEach(btn => btn.onclick = () => { saveDriverProgress(); setRoute('monitor'); });
  const withdrawalForm = qs('#withdrawalForm');
  if (withdrawalForm) withdrawalForm.onsubmit = handleWithdrawal;
  const returnForm = qs('#returnForm');
  if (returnForm) returnForm.onsubmit = handleReturn;
  const continueRouteForm = qs('#continueRouteForm');
  if (continueRouteForm) continueRouteForm.onsubmit = handleContinueRoute;
  const finishRouteForm = qs('#finishRouteForm');
  if (finishRouteForm) finishRouteForm.onsubmit = handleFinishRoute;
  bindDriverSelectors();
  bindClientPickers();
  initDeliveryPhotoPickers();
  bindDriverProgressPersistence();
  restoreDriverProgress();
}

function showDriverStep(id, persist=true) {
  qsa('.driver-step').forEach(el => el.classList.remove('active'));
  const step = qs('#' + id);
  if (!step) return;
  step.classList.add('active');
  bindDriverSelectors(step);
  bindClientPickers(step);
  initDestinationPickers(step);
  initSignaturePads(step);
  initDeliveryPhotoPickers(step);
  qsa('[data-destination-map]', step).forEach(mapEl => {
    const leafletMap = mapEl._controleCarrosLeafletMap;
    if (leafletMap) {
      requestAnimationFrame(() => {
        try { leafletMap.invalidateSize(false); } catch {}
      });
      setTimeout(() => {
        try { leafletMap.invalidateSize(false); } catch {}
      }, 250);
    }
  });
  if (persist) saveDriverProgress(id);
}

async function handleWithdrawal(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!validateSignatures(form)) return toast('Assine no campo indicado antes de confirmar a retirada.');
  const raw = new FormData(form);
  const data = normalizeMovementDriverData(sanitizeDestinationFormData(Object.fromEntries(raw.entries())));
  if (!data.motorista?.trim()) return toast('Informe seu nome.');
  if (!selectedClientName(data) && !data.cliente_nome) return toast('Selecione ou cadastre o primeiro cliente da rota.');
  try {
    if (data.assinatura_saida_url) data.assinatura_saida_url = await uploadSignatureDataUrl('retiradas', data.assinatura_saida_url);
    const movement = await DB.createMovement(data);
    writeActiveDriverMovement(movement);
    const displayMovement = {...movement, ...destinationPayload(data)};
    showDriverSuccess('retirada', displayMovement);
  } catch (err) { toast(userMessage(err, 'Não foi possível registrar a saída e salvar o cliente da rota.')); }
}
async function handleReturn(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!validateSignatures(form)) return toast('Assine no campo indicado antes de confirmar a devolução.');
  const raw = new FormData(form);
  const data = Object.fromEntries(raw.entries());
  try {
    if (data.assinatura_entrega_url) data.assinatura_entrega_url = await uploadSignatureDataUrl(`devolucoes/${data.movimento_id || 'geral'}`, data.assinatura_entrega_url);
    const movement = await DB.closeMovement(data.movimento_id, data);
    clearActiveDriverMovement();
    showDriverSuccess('devolucao', movement);
  } catch (err) { toast(userMessage(err, 'Não foi possível registrar.')); }
}

async function handleContinueRoute(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!validateSignatures(form)) return toast('Assine no campo indicado antes de finalizar a entrega.');
  const data = normalizeMovementDriverData(sanitizeDestinationFormData(Object.fromEntries(new FormData(form).entries())));
  const activeMovement = resolveActiveDriverMovement();
  data.movimento_id = data.movimento_id || activeMovement?.id || '';
  const clientName = selectedClientName(data) || data.cliente_nome || '';
  if (!data.movimento_id) return toast('Não foi possível identificar automaticamente o roteiro em andamento.');
  if (!clientName && !String(data.destino || '').trim()) return toast('Selecione ou cadastre o próximo cliente da rota.');
  const photos = {
    fotos_antes: getDeliveryPhotoFiles(form, 'antes'),
    fotos_depois: getDeliveryPhotoFiles(form, 'depois'),
    assinatura_entrega_url: data.assinatura_entrega_url || ''
  };
  if (photos.fotos_antes.length > 5 || photos.fotos_depois.length > 5) return toast('Você pode adicionar no máximo 5 fotos em cada categoria.');
  try {
    if (photos.assinatura_entrega_url) photos.assinatura_entrega_url = await uploadSignatureDataUrl(`entregas/clientes`, photos.assinatura_entrega_url);
    const stop = await DB.addRouteStop(data, photos);
    const movement = state.movements.find(m => m.id === stop.movimento_id) || activeMovement;
    if (movement) writeActiveDriverMovement(movement);
    showDriverSuccess('continuar', routeStopDisplayMovement(stop));
  } catch (err) { toast(userMessage(err, 'Não foi possível concluir o cliente e continuar a rota.')); }
}
async function handleFinishRoute(e) {
  e.preventDefault();
  const form = e.currentTarget;
  if (!validateSignatures(form)) return toast('Assine no campo indicado antes de finalizar a entrega.');
  const data = Object.fromEntries(new FormData(form).entries());
  const activeMovement = resolveActiveDriverMovement();
  data.movimento_id = data.movimento_id || activeMovement?.id || '';
  if (!data.movimento_id) return toast('Nenhum roteiro em andamento foi encontrado.');
  const photos = {
    fotos_antes: getDeliveryPhotoFiles(form, 'antes'),
    fotos_depois: getDeliveryPhotoFiles(form, 'depois'),
    assinatura_entrega_url: data.assinatura_entrega_url || ''
  };
  if (photos.fotos_antes.length > 5 || photos.fotos_depois.length > 5) return toast('Você pode adicionar no máximo 5 fotos em cada categoria.');
  try {
    if (photos.assinatura_entrega_url) photos.assinatura_entrega_url = await uploadSignatureDataUrl(`entregas/clientes`, photos.assinatura_entrega_url);
    const movement = await DB.finalizeRoute(data.movimento_id, photos);
    clearActiveDriverMovement();
    showDriverSuccess('finalizar_rota', movement || activeMovement);
  } catch (err) { toast(userMessage(err, 'Não foi possível concluir o cliente e finalizar o roteiro.')); }
}
function routeStopDisplayMovement(stop) {
  return {
    id: stop.movimento_id,
    numero_uso: state.movements.find(m => m.id === stop.movimento_id)?.numero_uso || 'Rota',
    placa: state.movements.find(m => m.id === stop.movimento_id)?.placa || '',
    modelo: state.movements.find(m => m.id === stop.movimento_id)?.modelo || '',
    destino: stop.endereco || stop.cliente_nome || '',
    destino_lat: stop.lat,
    destino_lng: stop.lng,
    destino_waze_url: stop.waze_url,
    destino_maps_url: stop.maps_url,
    cliente_nome: stop.cliente_nome,
    status: 'em_uso'
  };
}

function showSuccess(html) {
  const el = qs('#driverSuccess');
  el.innerHTML = html;
  showDriverStep('driverSuccess');
  bindDriverActionButtons(el);
  const finish = qs('[data-finish-driver]', el);
  if (finish) finish.onclick = async () => {
    const preserveActiveRoute = finish.hasAttribute('data-preserve-active-route');
    if (preserveActiveRoute) {
      const progress = readDriverProgress() || {};
      const activeRouteMovement = progress.successMovement || progress.activeRouteMovement || null;
      writeDriverProgress({
        ...progress,
        step: 'driverHome',
        activeRouteMovement,
        successType: null,
        successMovement: null
      });
    } else {
      clearDriverProgress();
    }
    await DB.refresh();
    renderDriver();
  };
}

function renderMonitor() {
  const openOcc = getMetrics().occurrences;
  const cu = currentUser(); const user = cu.nome;
  app.innerHTML = `
    <div class="app-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <header class="topbar">
        <div class="topbar-left">
          <button class="icon-btn nav-burger" type="button" data-nav-open aria-label="Abrir menu">${icon('menu')}</button>
          <div class="brand">
            <div class="logo"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo"></div>
            <div class="brand-text"><h1>Controle de Frota Comercial</h1><p>Rotas <span class="crumb-sep">›</span> ${escapeHtml(TAB_LABELS[state.tab] || 'Início')}</p></div>
          </div>
        </div>
        <div class="top-actions">
          <button class="icon-btn top-icon" type="button" data-theme-toggle aria-label="${themeToggleLabel()}" title="${themeToggleLabel()}">${icon(state.theme === 'light' ? 'moon' : 'sun')}<span class="sr-label">${themeToggleLabel()}</span></button>
          <button class="icon-btn top-icon bell" type="button" data-tab="ocorrencias" aria-label="Ocorrências abertas" title="Ocorrências abertas">${icon('bell')}${openOcc ? `<b class="bell-count">${openOcc > 99 ? '99+' : openOcc}</b>` : ''}</button>
          ${can('write') ? `<button class="btn top-driver" type="button" onclick="setRoute('driver')">${icon('car')}<span>Tela do condutor</span></button>` : ''}
          <div class="user-chip" title="${escapeHtml(user)}"><span class="avatar">${escapeHtml(userInitials(user))}</span><span class="user-meta"><b>${escapeHtml(user)}</b><small>${escapeHtml(cu.perfil || 'Administrador')}</small></span></div>
          <button class="icon-btn top-icon" type="button" data-monitor-logout aria-label="Sair do controle" title="Sair do controle">${icon('logout')}</button>
        </div>
      </header>
      ${!can('write') ? `<div class="readonly-note">${icon('shield')}<span>Modo somente leitura: seu perfil permite apenas consultar as informações.</span></div>` : ''}
      <div class="layout">
        ${sidebar()}
        <main class="main">${renderTab()}</main>
      </div>
      <div class="nav-scrim" data-nav-close></div>
      ${bottomNav()}
    </div>
    <div id="modalRoot"></div>
  `;
  bindMonitor();
}
function sidebar() {
  const groups = [
    {items:[['painel','home','Início']]},
    {title:'Operação', items:[['movimentacoes','route','Rotas'], ['manutencao','wrench','Manutenção'], ['dashboard','chart','Dashboard']]},
    {title:'Frota', items:[['veiculos','car','Veículos'], ['motoristas','user','Condutores'], ['clientes','pin','Clientes']]},
    {title:'Ocorrências', items:[['ocorrencias','alert','Ocorrências'], ['historico','clock','Histórico']]},
    {title:'Relatórios', items:[['relatorios','file','Relatórios']]},
    ...(can('admin') ? [{title:'Administração', items:[['usuarios','users','Usuários'], ['auditoria','shield','Auditoria']]}] : [])
  ];
  const openOcc = getMetrics().occurrences;
  const btn = ([id, ico, label]) => `<button class="nav-btn ${state.tab===id?'active':''}" data-tab="${id}" title="${label}" ${state.tab===id?'aria-current="page"':''}><span class="nav-ico">${icon(ico)}</span><span class="nav-label">${label}</span>${id==='ocorrencias' && openOcc ? `<span class="nav-count">${openOcc}</span>` : ''}</button>`;
  return `<aside class="sidebar">
    <div class="sidebar-head">
      <button class="sidebar-toggle" type="button" data-toggle-sidebar aria-label="Alternar menu lateral" title="${state.sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}">${icon('menu')}</button>
      <span class="sidebar-title">Menu</span>
      <button class="icon-btn nav-close" type="button" data-nav-close aria-label="Fechar menu">✕</button>
    </div>
    <nav class="sidebar-nav">
      ${groups.map(g => `<div class="nav-group">${g.title ? `<div class="nav-group-title">${g.title}</div>` : ''}${g.items.map(btn).join('')}</div>`).join('')}
    </nav>
  </aside>`;
}
function bottomNav() {
  const items = [['painel','home','Início'], ['veiculos','car','Veículos'], ['movimentacoes','route','Rotas'], ['ocorrencias','alert','Ocorrências']];
  return `<nav class="bottom-nav" aria-label="Navegação principal">
    ${items.map(([id,ico,label]) => `<button type="button" class="bn-item ${state.tab===id?'active':''}" data-tab="${id}">${icon(ico)}<span>${label}</span></button>`).join('')}
    <button type="button" class="bn-item" data-nav-open>${icon('more')}<span>Mais</span></button>
  </nav>`;
}
function renderTab() {
  if (state.tab === 'painel') return tabDashboard();
  if (state.tab === 'dashboard') return tabExecutiveDashboard();
  if (state.tab === 'movimentacoes') return tabMovements();
  if (state.tab === 'rotas') return tabMovements();
  if (state.tab === 'veiculos') return tabVehicles();
  if (state.tab === 'motoristas') return tabDrivers();
  if (state.tab === 'clientes') return tabClients();
  if (state.tab === 'historico') return tabVehicleHistory();
  if (state.tab === 'ocorrencias') return tabOccurrences();
  if (state.tab === 'relatorios') return tabReports();
  if (state.tab === 'manutencao') return tabMaintenance();
  if (state.tab === 'usuarios') return can('admin') ? tabUsers() : tabDashboard();
  if (state.tab === 'auditoria') return can('admin') ? tabAudit() : tabDashboard();
  return tabDashboard();
}
function hero(title, subtitle, actions='') {
  return `<section class="hero"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="panel-actions">${actions}</div></section>`;
}
function metricsHtml() {
  const m = getMetrics();
  return `<div class="grid-cards kpi-grid">
    ${kpiCard({icon:'check', tone:'green', label:'Disponíveis', value:m.available, sub:'prontos para saída'})}
    ${kpiCard({icon:'car', tone:'blue', label:'Em uso', value:m.inuse, sub:'fora da empresa'})}
    ${kpiCard({icon:'alert', tone:m.occurrences ? 'red' : 'green', label:'Ocorrências', value:m.occurrences, sub:'aguardando conferência'})}
    ${kpiCard({icon:'clock', tone:'yellow', label:'Registros', value:m.totalMovements, sub:'histórico geral'})}
  </div>`;
}
function dashboardPeriodRows() {
  const days = Number(state.dashboardFilters.periodo || 30);
  if (!Number.isFinite(days) || days <= 0) return state.movements;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days + 1);
  cutoff.setHours(0,0,0,0);
  return state.movements.filter(m => new Date(m.saida_at || m.created_at || 0) >= cutoff);
}
function daysLabels(count=14) {
  const labels = [];
  for (let i=count-1; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toISOString().slice(0,10));
  }
  return labels;
}
function barChartHtml(title, subtitle, rows, options={}) {
  const max = Math.max(1, ...rows.map(r => Number(r[1]) || 0));
  return `<section class="panel chart-panel">
    <div class="panel-head"><div class="panel-title"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div></div>
    ${rows.length ? `<div class="bar-chart">${rows.map(([label,total]) => `<div class="bar-row"><div class="bar-label">${escapeHtml(label)}</div><div class="bar-track"><span style="width:${Math.max(4, Math.round((Number(total)||0) / max * 100))}%"></span></div><strong>${total}</strong></div>`).join('')}</div>` : `<div class="empty">Nenhum dado encontrado.</div>`}
  </section>`;
}
function dashboardPendingList(rows) {
  const pending = [
    ...rows.filter(m => m.status === 'em_uso').slice(0, 6).map(m => ({title:`${m.placa} em uso`, text:`${m.motorista || 'Condutor'} • saída ${dateTimeBR(m.saida_at)}`})),
    ...(state.occurrences || []).filter(o => (o.status || 'aberta') !== 'resolvida').slice(0, 6).map(o => ({title:`Ocorrência ${o.prioridade || 'média'}`, text:`${o.placa || 'Sem placa'} • ${o.tipo || 'Ocorrência'}`}))
  ].slice(0, 10);
  return `<section class="panel"><div class="panel-head"><div class="panel-title"><h3>Pendências para acompanhamento</h3><p>Itens que precisam de atenção do controle.</p></div></div>${pending.length ? `<div class="timeline-list">${pending.map(item => `<div class="timeline-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join('')}</div>` : `<div class="empty">Nenhuma pendência no momento.</div>`}</section>`;
}
function tabExecutiveDashboard() {
  const rows = dashboardPeriodRows();
  const stats = reportStats(rows);
  const durations = rows.map(m => usageMinutes(m, false)).filter(v => Number.isFinite(v));
  const avg = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : null;
  const dayCounts = new Map(daysLabels(14).map(d => [d, 0]));
  rows.forEach(m => { const key = movementDateKey(m); if (dayCounts.has(key)) dayCounts.set(key, dayCounts.get(key)+1); });
  const usoPorDia = [...dayCounts.entries()].map(([d,v]) => [dateInputBR(d).slice(0,5), v]);
  const usoPorVeiculo = countBy(rows, m => `${normalizeTextKey(m.placa)} • ${normalizeTextKey(m.modelo)}`).slice(0, 8);
  const usoPorCondutor = countBy(rows, m => m.motorista).slice(0, 8);
  const clientesAtendidos = countBy(state.routeStops || [], s => s.cliente_nome).slice(0, 8);
  const periodoLabel = state.dashboardFilters.periodo === '0' ? 'todo o histórico' : `${state.dashboardFilters.periodo} dias`;
  return `
    ${hero('Dashboard', 'Visão resumida para acompanhar uso, disponibilidade, pendências, clientes atendidos e ocorrências.', `<select class="dashboard-period" data-dashboard-period><option value="7" ${state.dashboardFilters.periodo==='7'?'selected':''}>7 dias</option><option value="30" ${state.dashboardFilters.periodo==='30'?'selected':''}>30 dias</option><option value="90" ${state.dashboardFilters.periodo==='90'?'selected':''}>90 dias</option><option value="0" ${state.dashboardFilters.periodo==='0'?'selected':''}>Todo histórico</option></select><button class="btn primary" data-export-report-pdf>Gerar PDF</button>`)}
    <div class="grid-cards report-grid">
      <div class="metric"><small>Usos no período</small><strong>${stats.total}</strong><div class="hint">${escapeHtml(periodoLabel)}</div></div>
      <div class="metric"><small>Veículos em uso</small><strong>${state.movements.filter(m => m.status === 'em_uso').length}</strong><div class="hint">neste momento</div></div>
      <div class="metric"><small>Tempo médio</small><strong>${formatDuration(avg)}</strong><div class="hint">usos concluídos</div></div>
      <div class="metric"><small>Clientes em atendimento</small><strong>${(state.routeStops || []).filter(s => s.status === 'pendente').length}</strong><div class="hint">clientes atuais nas rotas</div></div>
      <div class="metric"><small>Pendências</small><strong>${stats.ocorrenciasAbertas + stats.pendentes}</strong><div class="hint">uso e ocorrência</div></div>
    </div>
    <div class="split report-split">
      ${barChartHtml('Usos por dia', 'Quantidade de saídas nos últimos 14 dias.', usoPorDia)}
      ${barChartHtml('Uso por veículo', 'Carros mais utilizados no período.', usoPorVeiculo)}
    </div>
    <div class="split report-split">
      ${barChartHtml('Uso por condutor', 'Condutores com mais registros.', usoPorCondutor)}
      ${barChartHtml('Clientes mais atendidos', 'Clientes adicionados nas rotas.', clientesAtendidos)}
    </div>
    ${dashboardPendingList(rows)}
  `;
}
/* ===== Módulo: Manutenção ===== */
function maintIsLate(m) { return Boolean(m.previsao_conclusao) && ['agendada','em_andamento','aguardando_peca'].includes(m.status) && m.previsao_conclusao < TODAY_ISO(); }
function maintFiltered() {
  const f = state.maintFilters; const term = String(f.search || '').toLowerCase().trim();
  const rows = (state.maintenances || []).filter(m => {
    if (f.status !== 'todos' && m.status !== f.status) return false;
    if (f.tipo !== 'todos' && m.tipo !== f.tipo) return false;
    if (f.from && String(m.data || '') < f.from) return false;
    if (f.to && String(m.data || '') > f.to) return false;
    if (term && !`${m.placa} ${m.modelo} ${m.tipo} ${m.motivo} ${m.responsavel || ''} ${m.observacao || ''}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const cmp = {
    data_desc:(a,b) => String(b.data||'').localeCompare(String(a.data||'')) || String(b.created_at||'').localeCompare(String(a.created_at||'')),
    data_asc:(a,b) => String(a.data||'').localeCompare(String(b.data||'')),
    previsao:(a,b) => String(a.previsao_conclusao||'9999').localeCompare(String(b.previsao_conclusao||'9999')),
    placa:(a,b) => String(a.placa||'').localeCompare(String(b.placa||'')),
    status:(a,b) => String(a.status||'').localeCompare(String(b.status||''))
  }[f.sort] || (() => 0);
  return rows.sort(cmp);
}
function maintListHtml() {
  const rows = maintFiltered();
  if (!state.maintenances.length) return `<div class="empty">Nenhuma manutenção registrada ainda.${can('write') ? ' Use “Registrar manutenção” para começar.' : ''}</div>`;
  if (!rows.length) return `<div class="empty">Nenhuma manutenção corresponde aos filtros.</div>`;
  return `<div class="table-wrap dtable-wrap"><table class="dtable maint-table"><thead><tr><th>Data</th><th>Placa</th><th>Veículo</th><th>Tipo</th><th>Motivo</th><th>Status</th><th>Responsável</th><th>Previsão</th><th>Conclusão</th><th>Observações</th><th class="th-actions">Ações</th></tr></thead><tbody>
    ${rows.map(m => `<tr>
      <td data-label="Data">${dateOnlyBR(m.data)}</td>
      <td data-label="Placa"><span class="plate-cell">${icon('car')}<strong>${escapeHtml(m.placa)}</strong></span></td>
      <td data-label="Veículo">${escapeHtml(m.modelo || '—')}</td>
      <td data-label="Tipo">${escapeHtml(m.tipo || '—')}</td>
      <td data-label="Motivo" class="cell-wrap">${escapeHtml(m.motivo || '—')}</td>
      <td data-label="Status">${maintStatusBadge(m.status)}${maintIsLate(m) ? ' <span class="status occurrence">Atrasada</span>' : ''}</td>
      <td data-label="Responsável">${escapeHtml(m.responsavel || '—')}</td>
      <td data-label="Previsão">${dateOnlyBR(m.previsao_conclusao)}</td>
      <td data-label="Conclusão">${dateOnlyBR(m.data_conclusao)}</td>
      <td data-label="Observações" class="cell-wrap cell-obs">${escapeHtml(m.observacao || '—')}</td>
      <td data-label="Ações" class="td-actions"><div class="row-actions"><button class="icon-btn" data-maint-open="${m.id}">Detalhes</button>${can('write') ? `<button class="icon-btn" data-maint-edit="${m.id}">Editar</button>` : ''}</div></td>
    </tr>`).join('')}
  </tbody></table></div>
  <div class="list-count">${rows.length} de ${state.maintenances.length} manutenções</div>`;
}
function tabMaintenance() {
  const f = state.maintFilters;
  const list = state.maintenances || [];
  const count = st => list.filter(m => m.status === st).length;
  const late = list.filter(maintIsLate).length;
  const opt = (v, label, cur) => `<option value="${escapeHtml(v)}" ${cur === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  const tipos = [...new Set([...MAINT_TIPOS, ...list.map(m => m.tipo).filter(Boolean)])];
  return `
    ${hero('Manutenção', 'Acompanhe as manutenções da frota: o que está agendado, em andamento ou concluído.', can('write') ? `<button class="btn primary" data-new-maint>${icon('plus')}Registrar manutenção</button>` : '')}
    <div class="grid-cards kpi-grid">
      ${kpiCard({icon:'clock', tone:'yellow', label:'Agendadas', value:count('agendada'), sub:'ainda não iniciadas'})}
      ${kpiCard({icon:'wrench', tone:'blue', label:'Em andamento', value:count('em_andamento'), sub:'na oficina agora'})}
      ${kpiCard({icon:'alert', tone:late ? 'red' : 'orange', label:'Aguardando / atrasadas', value:count('aguardando_peca') + late, sub:`${count('aguardando_peca')} aguardando peça • ${late} atrasadas`})}
      ${kpiCard({icon:'check', tone:'green', label:'Concluídas', value:count('concluida'), sub:'no histórico'})}
    </div>
    <section class="panel">
      <div class="filters-bar">
        <label class="dash-search">${icon('search')}<input type="search" name="search" data-maint-filter placeholder="Buscar placa, modelo, tipo, motivo…" value="${escapeHtml(f.search)}" aria-label="Buscar manutenção"></label>
        <select name="status" data-maint-filter aria-label="Status"><option value="todos">Todos os status</option>${Object.entries(MAINT_STATUS).map(([k,v]) => opt(k, v[0], f.status)).join('')}</select>
        <select name="tipo" data-maint-filter aria-label="Tipo"><option value="todos">Todos os tipos</option>${tipos.map(t => opt(t, t, f.tipo)).join('')}</select>
        <label class="date-filter"><span>De</span><input type="date" name="from" data-maint-filter value="${escapeHtml(f.from)}"></label>
        <label class="date-filter"><span>Até</span><input type="date" name="to" data-maint-filter value="${escapeHtml(f.to)}"></label>
        <select name="sort" data-maint-filter aria-label="Ordenar">${opt('data_desc','Mais recentes',f.sort)}${opt('data_asc','Mais antigas',f.sort)}${opt('previsao','Previsão (próximas)',f.sort)}${opt('placa','Placa (A–Z)',f.sort)}${opt('status','Status',f.sort)}</select>
        <button class="btn ghost" type="button" data-maint-clear>Limpar</button>
      </div>
      <div id="maintList">${maintListHtml()}</div>
    </section>`;
}
function maintFormHtml(m={}) {
  const vehicles = [...state.vehicles].sort((a,b) => String(a.placa).localeCompare(String(b.placa)));
  const tipos = [...new Set([...MAINT_TIPOS, m.tipo].filter(Boolean))];
  return `<form id="maintForm" class="form-grid">
    <input type="hidden" name="id" value="${escapeHtml(m.id || '')}">
    <div class="field"><label>Data</label><input type="date" name="data" required value="${escapeHtml(m.data || TODAY_ISO())}"></div>
    <div class="field"><label>Veículo / placa</label><select name="veiculo_id" required><option value="">Selecione…</option>${vehicles.map(v => `<option value="${v.id}" ${m.veiculo_id === v.id ? 'selected' : ''}>${escapeHtml(v.placa)} — ${escapeHtml(v.modelo || '')}</option>`).join('')}</select></div>
    <div class="field"><label>Tipo de manutenção</label><select name="tipo">${tipos.map(t => `<option ${m.tipo === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}</select></div>
    <div class="field"><label>Status</label><select name="status">${Object.entries(MAINT_STATUS).map(([k,v]) => `<option value="${k}" ${(m.status || 'agendada') === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div class="field full"><label>Motivo / descrição</label><textarea name="motivo" required placeholder="Ex.: troca de óleo e filtros">${escapeHtml(m.motivo || '')}</textarea></div>
    <div class="field"><label>Previsão de conclusão</label><input type="date" name="previsao_conclusao" value="${escapeHtml(m.previsao_conclusao || '')}"></div>
    <div class="field"><label>Data de conclusão</label><input type="date" name="data_conclusao" value="${escapeHtml(m.data_conclusao || '')}"></div>
    <div class="field full"><label>Responsável <span class="muted">(oficina / pessoa)</span></label><input name="responsavel" value="${escapeHtml(m.responsavel || '')}"></div>
    <div class="field full"><label>Observações</label><textarea name="observacao">${escapeHtml(m.observacao || '')}</textarea></div>
    <button class="btn primary full" type="submit">${m.id ? 'Salvar alterações' : 'Registrar manutenção'}</button>
  </form>`;
}
function openMaintenanceModal(m={}) {
  if (!can('write')) { toast('Seu perfil não permite alterar manutenções.'); return; }
  openModal(m.id ? 'Editar manutenção' : 'Registrar manutenção', maintFormHtml(m));
  qs('#maintForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await DB.saveMaintenance(data); closeModal(); toast(data.id ? 'Manutenção atualizada.' : 'Manutenção registrada.'); render(); }
    catch (err) { toast(dbWriteError(err)); if (btn) btn.disabled = false; }
  };
}
function openMaintenanceDetails(id) {
  const m = state.maintenances.find(x => x.id === id); if (!m) return;
  const item = (k, v) => `<div class="detail-item"><small>${k}</small><b>${v}</b></div>`;
  const open = !['concluida','cancelada'].includes(m.status);
  openModal(`Manutenção • ${escapeHtml(m.placa)}`, `
    <div class="detail-head">${maintStatusBadge(m.status)}${maintIsLate(m) ? ' <span class="status occurrence">Atrasada</span>' : ''}</div>
    <div class="detail-grid">
      ${item('Veículo', escapeHtml(m.modelo || '—'))}${item('Placa', escapeHtml(m.placa))}
      ${item('Data', dateOnlyBR(m.data))}${item('Tipo', escapeHtml(m.tipo || '—'))}
      ${item('Previsão de conclusão', dateOnlyBR(m.previsao_conclusao))}${item('Data de conclusão', dateOnlyBR(m.data_conclusao))}
      ${item('Responsável', escapeHtml(m.responsavel || '—'))}${item('Registrado por', escapeHtml(m.criado_por || '—'))}
      <div class="detail-item full"><small>Motivo / descrição</small><b>${escapeHtml(m.motivo || '—')}</b></div>
      <div class="detail-item full"><small>Observações</small><b>${escapeHtml(m.observacao || '—')}</b></div>
    </div>
    <div class="detail-actions">
      ${can('write') ? `<button class="btn" data-m-edit>Editar</button>` : ''}
      ${can('write') && open ? `<button class="btn primary" data-m-done>Marcar como concluída</button>` : ''}
      ${can('delete') ? `<button class="btn ghost danger" data-m-del>Excluir</button>` : ''}
    </div>`);
  const e1 = qs('[data-m-edit]'); if (e1) e1.onclick = () => openMaintenanceModal(m);
  const e2 = qs('[data-m-done]'); if (e2) e2.onclick = async () => {
    try { await DB.saveMaintenance({...m, status:'concluida', data_conclusao: m.data_conclusao || TODAY_ISO()}); closeModal(); toast('Manutenção concluída.'); render(); } catch (err) { toast(dbWriteError(err)); }
  };
  const e3 = qs('[data-m-del]'); if (e3) e3.onclick = async () => {
    if (!confirm(`Excluir a manutenção de ${m.placa}?`)) return;
    try { await DB.removeMaintenance(m.id); closeModal(); toast('Manutenção excluída.'); render(); } catch (err) { toast(dbWriteError(err)); }
  };
}

/* ===== Módulo: Usuários ===== */
function perfilBadge(p) { const cls = p === 'Administrador' ? 'warn' : (p === 'Gestor' ? 'info' : 'done'); return `<span class="status ${cls}">${escapeHtml(p || '—')}</span>`; }
function dateTimeOrDash(v) { return v ? dateTimeBR(v) : '—'; }
function usersListHtml() {
  const term = String(state.userSearch || '').toLowerCase().trim();
  const me = currentUser();
  const rows = (state.users || []).filter(u => !term || `${u.nome} ${u.login} ${u.perfil}`.toLowerCase().includes(term));
  if (!rows.length) return `<div class="empty">${term ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário cadastrado.'}</div>`;
  return `<div class="table-wrap dtable-wrap"><table class="dtable"><thead><tr><th>Nome</th><th>E-mail (login)</th><th>Perfil</th><th>Status</th><th>Cadastro</th><th>Último acesso</th><th class="th-actions">Ações</th></tr></thead><tbody>
    ${rows.map(u => `<tr>
      <td data-label="Nome"><strong>${escapeHtml(u.nome)}</strong> ${me.id === u.id ? '<span class="you-tag">você</span>' : ''}</td>
      <td data-label="Login">${escapeHtml(u.login)}</td><td data-label="Perfil">${perfilBadge(u.perfil)}${u.perfil === CONDUTOR_PERFIL ? `<br><span class="muted">${escapeHtml((state.drivers || []).find(d => d.id === u.motorista_id)?.nome || 'Sem cadastro vinculado')}</span>` : ''}</td>
      <td data-label="Status">${u.status === 'ativo' ? '<span class="status signed">Ativo</span>' : '<span class="status done">Inativo</span>'}</td>
      <td data-label="Cadastro">${u.created_at ? dateBR(u.created_at) : '—'}</td><td data-label="Último acesso">${dateTimeOrDash(u.ultimo_acesso)}</td>
      <td data-label="Ações" class="td-actions"><div class="row-actions"><button class="icon-btn" data-user-edit="${u.id}">Editar</button>${me.id !== u.id ? `<button class="icon-btn" data-user-toggle="${u.id}">${u.status === 'ativo' ? 'Inativar' : 'Ativar'}</button><button class="icon-btn" data-user-delete="${u.id}">Excluir</button>` : ''}</div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function tabUsers() {
  const n = (state.users || []).length;
  return `
    ${hero('Usuários', 'Gerencie quem acessa o controle e qual perfil cada pessoa possui.', `<button class="btn primary" data-new-user>${icon('plus')}Novo usuário</button>`)}
    <div class="notice perfil-note"><b>Perfis:</b> Administrador (acesso total, usuários e auditoria) • Gestor (registra e altera, mas não exclui) • Visualizador (somente consulta, sem editar nada) • Condutor (acessa somente a área do condutor, com as próprias rotas).</div>
    <section class="panel">
      <div class="filters-bar"><label class="dash-search">${icon('search')}<input type="search" data-user-search placeholder="Buscar nome ou e-mail…" value="${escapeHtml(state.userSearch)}" aria-label="Buscar usuário"></label><span class="list-count inline">${n} ${n === 1 ? 'usuário' : 'usuários'}</span></div>
      <div id="userList">${usersListHtml()}</div>
    </section>`;
}
function openUserModal(u={}) {
  const isNew = !u.id;
  openModal(isNew ? 'Novo usuário' : 'Editar usuário', `
    <form id="userForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(u.id || '')}">
      <div class="field"><label>Nome</label><input name="nome" required value="${escapeHtml(u.nome || '')}" autocomplete="off"></div>
      <div class="field"><label>E-mail (login)</label><input name="login" type="email" required value="${escapeHtml(u.login || '')}" autocomplete="off" placeholder="nome@empresa.com" ${isNew ? '' : 'readonly'}></div>
      <div class="field"><label>Perfil</label><select name="perfil">${PERFIS.map(p => `<option ${ (u.perfil || 'Visualizador') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select name="status"><option value="ativo" ${u.status !== 'inativo' ? 'selected' : ''}>Ativo</option><option value="inativo" ${u.status === 'inativo' ? 'selected' : ''}>Inativo</option></select></div>
      <div class="field full" data-user-driver-field ${(u.perfil || 'Visualizador') === CONDUTOR_PERFIL ? '' : 'style="display:none"'}>
        <label>Cadastro do condutor</label>
        <select name="motorista_id">
          <option value="">Selecione o condutor cadastrado</option>
          ${(state.drivers || []).slice().sort((a,b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')).map(d => {
            const linked = (state.users || []).find(x => x.motorista_id === d.id && x.id !== u.id);
            return `<option value="${escapeHtml(d.id)}" ${u.motorista_id === d.id ? 'selected' : ''} ${linked ? 'disabled' : ''}>${escapeHtml(driverDisplay(d))}${linked ? ' (já vinculado)' : ''}${(d.status || 'ativo') === 'inativo' ? ' (inativo)' : ''}</option>`;
          }).join('')}
        </select>
        <span class="muted">O condutor entra em /condutor e vê somente as próprias rotas e o próprio histórico.</span>
      </div>
      <div class="field full"><label>${isNew ? 'Senha' : 'Nova senha'} ${isNew ? '' : '<span class="muted">(deixe em branco para manter)</span>'}</label><input name="senha" type="password" minlength="6" autocomplete="new-password" ${isNew ? 'required' : ''} placeholder="Mínimo de 6 caracteres"></div>
      <button class="btn primary full" type="submit">${isNew ? 'Criar usuário' : 'Salvar alterações'}</button>
    </form>`);
  const perfilSelect = qs('#userForm [name="perfil"]');
  const driverField = qs('#userForm [data-user-driver-field]');
  if (perfilSelect && driverField) perfilSelect.onchange = () => { driverField.style.display = perfilSelect.value === CONDUTOR_PERFIL ? '' : 'none'; };
  qs('#userForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter; if (btn) btn.disabled = true;
    const d = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const login = String(d.login || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) throw new Error('Informe um e-mail válido.');
      if (d.senha && String(d.senha).length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      if (isNew && (state.users || []).some(x => String(x.login).toLowerCase() === login.toLowerCase())) throw new Error('Já existe um usuário com esse e-mail.');
      const row = {id: d.id || undefined, nome: String(d.nome).trim(), login, perfil: d.perfil, status: d.status};
      if (d.perfil === CONDUTOR_PERFIL) {
        if (!d.motorista_id) throw new Error('Selecione o cadastro do condutor para este usuário.');
        row.motorista_id = d.motorista_id;
      } else if (u.motorista_id) row.motorista_id = null;
      if (d.senha) row.senha_hash = await hashPassword(login, d.senha);
      await DB.saveUser(row); closeModal(); toast(isNew ? 'Usuário criado.' : 'Usuário atualizado.'); render();
    } catch (err) { toast(dbWriteError(err)); if (btn) btn.disabled = false; }
  };
}

/* ===== Módulo: Auditoria ===== */
function auditFiltered() {
  const f = state.auditFilters; const term = String(f.search || '').toLowerCase().trim();
  return (state.audit || []).filter(a => {
    if (f.usuario !== 'todos' && a.usuario !== f.usuario) return false;
    if (f.modulo !== 'todos' && a.modulo !== f.modulo) return false;
    if (f.acao !== 'todos' && a.acao !== f.acao) return false;
    const day = String(a.created_at || '').slice(0, 10);
    const local = a.created_at ? (() => { const d = new Date(a.created_at); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : day;
    if (f.from && local < f.from) return false;
    if (f.to && local > f.to) return false;
    if (term && !`${a.usuario} ${a.acao} ${a.modulo} ${a.registro || ''} ${a.detalhes || ''}`.toLowerCase().includes(term)) return false;
    return true;
  });
}
function auditListHtml() {
  if (!state.audit.length) return `<div class="empty">Nenhuma ação registrada ainda. As ações feitas no controle passam a aparecer aqui automaticamente.</div>`;
  const all = auditFiltered(); const rows = all.slice(0, 500);
  if (!rows.length) return `<div class="empty">Nenhum registro corresponde aos filtros.</div>`;
  return `<div class="table-wrap dtable-wrap"><table class="dtable"><thead><tr><th>Data / hora</th><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>
    ${rows.map(a => `<tr>
      <td data-label="Data / hora">${escapeHtml(dateTimeBR(a.created_at))}</td>
      <td data-label="Usuário"><strong>${escapeHtml(a.usuario || '—')}</strong>${a.perfil ? `<div class="muted small">${escapeHtml(a.perfil)}</div>` : ''}</td>
      <td data-label="Ação">${escapeHtml(a.acao || '—')}</td><td data-label="Módulo">${escapeHtml(a.modulo || '—')}</td>
      <td data-label="Registro">${escapeHtml(a.registro || '—')}</td><td data-label="Detalhes" class="cell-wrap">${escapeHtml(a.detalhes || '—')}</td>
    </tr>`).join('')}
  </tbody></table></div><div class="list-count">${rows.length}${all.length > rows.length ? ` de ${all.length}` : ''} registros</div>`;
}
function tabAudit() {
  const f = state.auditFilters;
  const uniq = key => [...new Set((state.audit || []).map(a => a[key]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b)));
  const opt = (list, cur, all) => `<option value="todos">${all}</option>${list.map(v => `<option value="${escapeHtml(v)}" ${cur === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}`;
  return `
    ${hero('Auditoria', 'Veja quem fez cada ação no sistema, quando e o que foi alterado.', '')}
    <section class="panel">
      <div class="filters-bar">
        <label class="dash-search">${icon('search')}<input type="search" name="search" data-audit-filter placeholder="Buscar usuário, ação, registro…" value="${escapeHtml(f.search)}" aria-label="Buscar na auditoria"></label>
        <select name="usuario" data-audit-filter aria-label="Usuário">${opt(uniq('usuario'), f.usuario, 'Todos os usuários')}</select>
        <select name="modulo" data-audit-filter aria-label="Módulo">${opt(uniq('modulo'), f.modulo, 'Todos os módulos')}</select>
        <select name="acao" data-audit-filter aria-label="Ação">${opt(uniq('acao'), f.acao, 'Todas as ações')}</select>
        <label class="date-filter"><span>De</span><input type="date" name="from" data-audit-filter value="${escapeHtml(f.from)}"></label>
        <label class="date-filter"><span>Até</span><input type="date" name="to" data-audit-filter value="${escapeHtml(f.to)}"></label>
        <button class="btn ghost" type="button" data-audit-clear>Limpar</button>
      </div>
      <div id="auditList">${auditListHtml()}</div>
    </section>`;
}

function tabDrivers() {
  return `${hero('Condutores', 'Cadastro dos condutores autorizados a usar a frota comercial.', `<button class="btn primary" data-new-driver>Cadastrar condutor</button>`)}<section class="panel">${driversTable()}</section>`;
}
function driversTable() {
  const rows = state.drivers || [];
  if (!rows.length) return `<div class="empty">Nenhum condutor cadastrado. O condutor também pode se cadastrar pela tela do condutor.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Telefone</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${rows.map(d => `<tr><td><strong>${escapeHtml(d.nome || '—')}</strong></td><td>${escapeHtml(d.matricula || '—')}</td><td>${escapeHtml(d.setor || '—')}</td><td>${escapeHtml(d.telefone || '—')}</td><td>${statusBadge(d.status || 'ativo')}</td><td>${escapeHtml(d.observacao || '—')}</td><td><div class="row-actions"><button class="icon-btn" data-edit-driver="${d.id}">Editar</button><button class="icon-btn" data-delete-driver="${d.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`;
}
function tabClients() {
  return `${hero('Clientes', 'Cadastre clientes e pontos de atendimento para facilitar a rota do condutor.', `<button class="btn primary" data-new-client>Cadastrar cliente</button>`)}<section class="panel">${clientsTable()}</section>`;
}
function clientsTable() {
  const rows = state.clients || [];
  if (!rows.length) return `<div class="empty">Nenhum cliente cadastrado.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Endereço / ponto</th><th>Telefone</th><th>Status</th><th>Rotas</th><th>Ações</th></tr></thead><tbody>${rows.map(c => `<tr><td><strong>${escapeHtml(c.nome || '—')}</strong></td><td>${escapeHtml(c.endereco || '—')}<br><span class="destination-table-links">${routeLinkHtml('waze', 'Waze', c.endereco || c.nome, c.lat, c.lng)} ${routeLinkHtml('maps', 'Mapa', c.endereco || c.nome, c.lat, c.lng)}</span></td><td>${escapeHtml(c.telefone || '—')}</td><td>${statusBadge(c.status || 'ativo')}</td><td>${(state.routeStops || []).filter(s => s.cliente_id === c.id || s.cliente_nome === c.nome).length}</td><td><div class="row-actions"><button class="icon-btn" data-edit-client="${c.id}">Editar</button><button class="icon-btn" data-delete-client="${c.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

function tabDashboard() {
  const vehicles = state.vehicles || [];
  const total = vehicles.length;
  const open = state.movements.filter(m => m.status === 'em_uso');
  const maint = state.maintenances || [];
  const occOpen = (state.occurrences || []).filter(o => (o.status || 'aberta') !== 'resolvida');
  const isFine = o => String(o.tipo || '').toLowerCase().startsWith('multa');
  const finesOpen = occOpen.filter(isFine);
  const finesDone = (state.occurrences || []).filter(o => isFine(o) && (o.status || 'aberta') === 'resolvida').length;
  const occOther = occOpen.filter(o => !isFine(o));
  const occHigh = occOther.filter(o => String(o.prioridade || '').toLowerCase() === 'alta').length;

  // Situação da frota (reaproveita a mesma regra do resto do sistema)
  const counts = {em_uso:0, disponivel:0, manutencao:0, ocorrencia:0};
  vehicles.forEach(v => { const st = vehicleStatus(v); counts[st in counts ? st : 'ocorrencia'] += 1; });
  const pct = n => total ? Math.round(n / total * 100) : 0;

  // Manutenções
  const mCount = st => maint.filter(m => m.status === st).length;
  const mLate = maint.filter(maintIsLate);
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const cut30 = `${d30.getFullYear()}-${String(d30.getMonth()+1).padStart(2,'0')}-${String(d30.getDate()).padStart(2,'0')}`;
  const mDoneRecent = maint.filter(m => m.status === 'concluida' && String(m.data_conclusao || m.data || '') >= cut30).length;
  const mActive = maint.filter(m => ['em_andamento','aguardando_peca','agendada'].includes(m.status))
    .sort((a,b) => String(a.previsao_conclusao || '9999').localeCompare(String(b.previsao_conclusao || '9999'))).slice(0, 3);

  // Atenção / pendências (tudo calculado dos dados já carregados)
  const attention = [];
  if (finesOpen.length) attention.push({tone:'red', icon:'alert', text:`${finesOpen.length} ${finesOpen.length === 1 ? 'multa informada em aberto' : 'multas informadas em aberto'}`, tab:'ocorrencias', cta:'Ver ocorrências'});
  if (occOther.length) attention.push({tone: occHigh ? 'red' : 'orange', icon:'alert', text:`${occOther.length} ${occOther.length === 1 ? 'ocorrência aberta' : 'ocorrências abertas'}${occHigh ? ` • ${occHigh} de prioridade alta` : ''}`, tab:'ocorrencias', cta:'Ver ocorrências'});
  if (mLate.length) attention.push({tone:'red', icon:'clock', text:`${mLate.length} ${mLate.length === 1 ? 'manutenção atrasada' : 'manutenções atrasadas'}`, tab:'manutencao', cta:'Ver manutenção'});
  if (mCount('aguardando_peca')) attention.push({tone:'orange', icon:'wrench', text:`${mCount('aguardando_peca')} ${mCount('aguardando_peca') === 1 ? 'manutenção aguardando peça' : 'manutenções aguardando peça'}`, tab:'manutencao', cta:'Ver manutenção'});
  if (counts.manutencao) attention.push({tone:'blue', icon:'wrench', text:`${counts.manutencao} ${counts.manutencao === 1 ? 'veículo em manutenção' : 'veículos em manutenção'}`, tab:'manutencao', cta:'Ver manutenção'});
  const pendencias = finesOpen.length + occOther.length + mLate.length + mCount('aguardando_peca');

  // Desempenho: só o que existe de verdade (usos, tempo, condutores, frota utilizada)
  const t = ms => ms.saida_at || ms.created_at || '';
  const now = Date.now(), DAY = 86400000;
  const cur = state.movements.filter(x => { const d = new Date(t(x)).getTime(); return d && now - d <= 30 * DAY; });
  const prev = state.movements.filter(x => { const d = new Date(t(x)).getTime(); return d && now - d > 30 * DAY && now - d <= 60 * DAY; });
  const delta = prev.length ? Math.round((cur.length - prev.length) / prev.length * 100) : null;
  const durations = cur.map(x => usageMinutes(x, false)).filter(v => Number.isFinite(v));
  const avg = durations.length ? Math.round(durations.reduce((a,b) => a + b, 0) / durations.length) : null;
  const usedPlates = new Set(cur.map(x => normalizePlate(x.placa)).filter(Boolean)).size;
  const drivers30 = new Set(cur.map(x => normalizeTextKey(x.motorista)).filter(v => v !== '—')).size;

  const c = clockParts();
  const df = state.dashFilters || (state.dashFilters = {search:'', modelo:'todos'});
  const models = [...new Set(open.map(x => String(x.modelo || '').trim()).filter(Boolean))].sort();
  const seg = [['Em rota', counts.em_uso, 'var(--c-green)'], ['Disponível', counts.disponivel, 'var(--c-blue)'], ['Manutenção', counts.manutencao, 'var(--c-orange)'], ['Ocorrência / outros', counts.ocorrencia, 'var(--c-red)']];
  let acc = 0;
  const stops = total ? seg.filter(x => x[1] > 0).map(([, n, color]) => { const from = acc / total * 100; acc += n; return `${color} ${from}% ${acc / total * 100}%`; }) : [];
  const donut = stops.length ? `conic-gradient(${stops.join(',')})` : 'conic-gradient(var(--line-strong) 0 100%)';

  const lastMoves = state.movements.slice(0, 6).map(x => {
    const done = x.status === 'finalizado';
    const when = done ? (x.chegada_at || x.saida_at || x.created_at) : (x.saida_at || x.created_at);
    return {x, acao: done ? 'Retorno' : 'Saída de rota', when, chip: done ? '<span class="status signed">Finalizado</span>' : '<span class="status inuse">Em rota</span>'};
  });
  const canWrite = can('write');

  return `
    <section class="welcome compact">
      <div class="welcome-text">
        <h2>Olá, ${escapeHtml(firstName(currentUser().nome))}!</h2>
        <p>Aqui está o resumo da sua frota hoje.</p>
      </div>
      <div class="welcome-meta">
        <div class="wm-item">${icon('calendar')}<div><b data-clock="date">${escapeHtml(c.date)}</b><small data-clock="weekday">${escapeHtml(c.weekday)}</small></div></div>
        <div class="wm-item">${icon('clock')}<div><b data-clock="time">${escapeHtml(c.time)}</b><small>Horário do sistema</small></div></div>
      </div>
      <span class="welcome-car" aria-hidden="true">${icon('car')}</span>
    </section>

    <div class="grid-cards kpi-grid dash-kpis">
      ${kpiCard({icon:'check', tone:'green', label:'Veículos disponíveis', value:counts.disponivel, sub:`de ${total} veículos`, chip: total ? `${pct(counts.disponivel)}% da frota` : '', tab:'veiculos'})}
      ${kpiCard({icon:'route', tone:'blue', label:'Em uso', value:open.length, sub:'veículos em operação', chip: total ? `${pct(open.length)}% da frota` : '', tab:'movimentacoes'})}
      ${kpiCard({icon:'wrench', tone:counts.manutencao ? 'orange' : 'slate', label:'Em manutenção', value:counts.manutencao, sub: counts.manutencao === 1 ? 'veículo' : 'veículos', chip: mLate.length ? `${mLate.length} atrasada${mLate.length > 1 ? 's' : ''}` : '', tab:'manutencao'})}
      ${kpiCard({icon: pendencias ? 'alert' : 'check', tone: pendencias ? (finesOpen.length || occHigh || mLate.length ? 'red' : 'orange') : 'green', label:'Pendências', value:pendencias, sub: pendencias ? 'itens que precisam de atenção' : 'tudo em ordem', chip: pendencias ? 'Requer ação' : 'Em dia', emph:Boolean(pendencias)})}
    </div>

    ${canWrite ? `<div class="quick-actions" aria-label="Ações rápidas"><span class="qa-label">Ações rápidas</span>
      <button class="btn primary" type="button" data-open-manual>${icon('route')}Registrar saída</button>
      <button class="btn" type="button" data-new-maint>${icon('wrench')}Registrar manutenção</button>
      <button class="btn" type="button" data-new-vehicle>${icon('car')}Cadastrar veículo</button>
      <button class="btn" type="button" data-new-occurrence>${icon('alert')}Registrar ocorrência</button>
    </div>` : ''}

    <div class="dash-grid">
      <section class="panel dash-perf">
        <div class="panel-head"><div class="panel-title"><h3>Desempenho da frota</h3><p>Últimos 30 dias.</p></div></div>
        <div class="perf-grid">
          <div class="perf"><span class="perf-ico tone-blue">${icon('route')}</span><strong>${cur.length}</strong><small>usos registrados</small>${delta !== null ? `<em class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '↑' : '↓'} ${Math.abs(delta)}% vs. 30 dias anteriores</em>` : ''}</div>
          <div class="perf"><span class="perf-ico tone-green">${icon('car')}</span><strong>${usedPlates}<span class="perf-of"> / ${total}</span></strong><small>veículos utilizados</small></div>
          <div class="perf"><span class="perf-ico tone-yellow">${icon('clock')}</span><strong>${escapeHtml(formatDuration(avg))}</strong><small>tempo médio de uso</small></div>
          <div class="perf"><span class="perf-ico tone-blue">${icon('user')}</span><strong>${drivers30}</strong><small>condutores ativos</small></div>
        </div>
      </section>

      <section class="panel dash-status">
        <div class="panel-head"><div class="panel-title"><h3>Status da frota</h3><p>${total} ${total === 1 ? 'veículo cadastrado' : 'veículos cadastrados'}.</p></div></div>
        ${total ? `<div class="donut-wrap">
          <div class="donut" style="background:${donut}" role="img" aria-label="Distribuição da frota por status"><div class="donut-hole"><strong>${total}</strong><small>total</small></div></div>
          <ul class="donut-legend">${seg.map(([label, n, color]) => `<li><i style="background:${color}"></i><span>${label}</span><b>${n}</b><em>${pct(n)}%</em></li>`).join('')}</ul>
        </div>` : `<div class="empty">Nenhum veículo cadastrado.</div>`}
      </section>

      <section class="panel dash-open">
        <div class="panel-head dash-head">
          <div class="panel-title"><h3>Veículos em uso agora</h3><p>Saiba quais veículos estão em operação no momento.</p></div>
          <div class="dash-filters">
            ${open.length > 6 ? `<label class="dash-search">${icon('search')}<input type="search" data-dash-search placeholder="Buscar placa, modelo, condutor…" value="${escapeHtml(df.search)}" aria-label="Buscar veículo em uso"></label>` : ''}
            <button type="button" class="link-btn" data-tab="movimentacoes">Ver todos ${icon('arrow')}</button>
          </div>
        </div>
        ${open.length ? `<div class="table-wrap dtable-wrap"><table class="dtable"><thead><tr><th>Placa</th><th>Modelo</th><th>Condutor</th><th>Saída</th><th>Status</th><th class="th-actions">Ações</th></tr></thead><tbody>
          ${open.map(x => `<tr data-dash-row data-filter-text="${escapeHtml(`${x.placa} ${x.modelo} ${x.motorista}`.toLowerCase())}">
            <td data-label="Placa"><span class="plate-cell">${icon('car')}<strong>${escapeHtml(x.placa)}</strong></span></td>
            <td data-label="Modelo">${escapeHtml(x.modelo || '—')}</td>
            <td data-label="Condutor">${escapeHtml(x.motorista || '—')}</td>
            <td data-label="Saída">${escapeHtml(timeBR(x.saida_at))}</td>
            <td data-label="Status"><span class="status inuse">Em rota</span></td>
            <td data-label="Ações" class="td-actions"><div class="row-actions"><button class="icon-btn" data-route-details="${x.id}">Detalhes</button><button class="icon-btn" data-return-manual="${x.id}">Registrar entrega</button></div></td>
          </tr>`).join('')}
        </tbody></table><div class="empty dash-empty" hidden>Nenhum veículo corresponde à busca.</div></div>` : `<div class="empty">Quando um condutor registrar uma saída, o veículo aparece aqui.</div>`}
      </section>

      <section class="panel dash-attn ${pendencias ? 'has-alert' : ''}">
        <div class="panel-head"><div class="panel-title"><h3>Requer atenção</h3><p>O que precisa de ação agora.</p></div></div>
        ${attention.length ? `<div class="attn-list">${attention.map(a => `<button type="button" class="attn-item tone-${a.tone}" data-tab="${a.tab}"><span class="attn-ico">${icon(a.icon)}</span><span class="attn-text">${escapeHtml(a.text)}<small>${a.cta}</small></span>${icon('chevron')}</button>`).join('')}</div>`
          : `<div class="all-good">${icon('check')}<div><b>Está tudo em ordem.</b><small>Nenhuma pendência no momento.</small></div></div>`}
      </section>

      <section class="panel dash-maint">
        <div class="panel-head"><div class="panel-title"><h3>Manutenções</h3><p>Resumo do módulo.</p></div><button type="button" class="link-btn" data-tab="manutencao">Ver manutenção ${icon('arrow')}</button></div>
        <div class="mini-stats">
          <div><strong class="t-blue">${mCount('em_andamento')}</strong><small>em andamento</small></div>
          <div><strong class="t-yellow">${mCount('agendada')}</strong><small>agendadas</small></div>
          <div><strong class="t-green">${mDoneRecent}</strong><small>concluídas (30 dias)</small></div>
        </div>
        ${mActive.length ? `<ul class="mini-list">${mActive.map(m => `<li><b>${escapeHtml(m.placa)}</b><span>${escapeHtml(m.tipo || '')}${m.previsao_conclusao ? ` • prev. ${dateOnlyBR(m.previsao_conclusao)}` : ''}</span>${maintStatusBadge(m.status)}</li>`).join('')}</ul>` : ''}
      </section>

      <section class="panel dash-fines">
        <div class="panel-head"><div class="panel-title"><h3>Multas informadas</h3><p>Registradas como ocorrência.</p></div></div>
        <div class="fines-row">
          <div><strong class="${finesOpen.length ? 't-red' : ''}">${finesOpen.length}</strong><small>em aberto</small></div>
          <div><strong>${finesDone}</strong><small>resolvidas</small></div>
          <button type="button" class="btn ${finesOpen.length ? 'primary' : ''}" data-tab="ocorrencias">Ver multas ${icon('arrow')}</button>
        </div>
      </section>

      <section class="panel dash-recent">
        <div class="panel-head"><div class="panel-title"><h3>Últimas movimentações</h3><p>Registros mais recentes.</p></div><button type="button" class="link-btn" data-tab="historico">Histórico ${icon('arrow')}</button></div>
        ${lastMoves.length ? `<div class="reg-list">${lastMoves.map(({x, acao, when, chip}) => `
          <button type="button" class="reg-item" data-route-details="${x.id}">
            <span class="reg-ico">${icon('car')}</span>
            <span class="reg-main"><b>${escapeHtml(x.placa || '—')} <span class="reg-model">${escapeHtml(x.modelo || '')}</span></b><small>${acao} • ${escapeHtml(dateTimeBR(when))}</small></span>
            <span class="reg-status">${chip}</span>
          </button>`).join('')}</div>` : `<div class="empty">Nenhuma movimentação registrada.</div>`}
      </section>
    </div>`;
}
function movementCards(list, openOnly=false) {
  return `<div class="movement-cards">${list.map(m => `
    <article class="movement-card">
      <div class="movement-card-head">
        <div class="panel-title">
          <h3>${escapeHtml(m.placa)} • ${escapeHtml(m.motorista)}</h3>
          <p>${escapeHtml(m.modelo)} • saída ${timeBR(m.saida_at)}</p>
        </div>
        <div class="movement-card-status">${statusBadge(m.status)}</div>
      </div>
      <div class="movement-card-meta">
        <span>Uso <span class="kbd">${escapeHtml(m.numero_uso)}</span></span>
        ${routeStopsForMovement(m.id).length
          ? `<span>• ${escapeHtml(routeProgressText(m))}</span>`
          : (m.cliente_nome || m.destino ? `<span>• Cliente: ${escapeHtml(m.cliente_nome || m.destino)}</span>` : '')}
      </div>
      ${destinationSuccessLinksHtml(m)}
      <div class="movement-card-actions">
        <button class="btn" data-route-details="${m.id}">Detalhes da rota</button>
        ${openOnly ? `<button class="btn" data-return-manual="${m.id}">Registrar entrega</button>` : ''}
        <button class="btn" data-print-movement="${m.id}">Imprimir ficha</button>
      </div>
    </article>`).join('')}</div>`;
}
function compactList(list) {
  return `<div style="display:grid;gap:10px">${list.map(m => `
    <div style="border:1px solid var(--line);border-radius:16px;padding:12px;background:rgba(255,255,255,.035)">
      <div style="display:flex;justify-content:space-between;gap:10px"><strong>${escapeHtml(m.numero_uso)}</strong><span>${statusBadge(m.status)}</span></div>
      <div class="muted" style="margin-top:6px">${escapeHtml(m.motorista)} • ${escapeHtml(m.placa)} • ${dateTimeBR(m.saida_at)}</div>
    </div>`).join('')}</div>`;
}

function routeStopsSummaryHtml(m) {
  const stops = routeStopsForMovement(m.id);
  if (!stops.length) return '';
  return `<div class="route-summary">${stops.slice(0,4).map(s => `<span class="pill route-pill ${s.status === 'visitado' ? 'done' : 'current'}">${escapeHtml(s.ordem || '')}º ${escapeHtml(s.cliente_nome || s.endereco || 'Cliente')} • ${s.status === 'visitado' ? 'concluído' : 'atual'}</span>`).join('')}${stops.length > 4 ? `<span class="pill">+${stops.length - 4}</span>` : ''}</div>`;
}

function filteredMovements() {
  const s = state.filters.search.toLowerCase().trim();
  const status = state.filters.status;
  return state.movements.filter(m => {
    const routeText = routeStopsForMovement(m.id).map(stop => [stop.cliente_nome, stop.endereco, stop.status].join(' ')).join(' ');
    const matchesSearch = !s || [m.numero_uso,m.motorista,m.placa,m.modelo,m.destino,m.cliente_nome,routeText].join(' ').toLowerCase().includes(s);
    const matchesStatus = status === 'todos' || m.status === status;
    return matchesSearch && matchesStatus;
  });
}
function activeRouteFlowHtml() {
  const open = state.movements.filter(m => m.status === 'em_uso');
  if (!open.length) return '';
  return `<section class="panel route-flow-panel">
    <div class="panel-head"><div class="panel-title"><h3>Rotas em andamento</h3><p>Veja rapidamente quem está na rua, o cliente atual e o avanço da rota. A lista de clientes fica nos detalhes.</p></div></div>
    <div class="route-flow-grid">
      ${open.map(m => {
        const stops = routeStopsForMovement(m.id);
        const current = currentRouteStop(m);
        const done = stops.filter(s => s.status === 'visitado');
        const currentName = current ? routeStopLabel(current) : 'Roteiro finalizado';
        return `<article class="route-flow-card">
          <div class="route-flow-top"><strong>${escapeHtml(m.motorista || 'Condutor')}</strong><span>${statusBadge(m.status)}</span></div>
          <div class="route-flow-vehicle">${escapeHtml(m.placa || '—')} • ${escapeHtml(m.modelo || '—')} • saída ${timeBR(m.saida_at)}</div>
          <div class="route-flow-current ${current ? '' : 'finished'}"><small>${current ? 'Cliente em atendimento' : 'Situação da rota'}</small><b>${escapeHtml(currentName)}</b></div>
          ${stops.length ? `<div class="route-flow-meta"><span>${done.length} cliente(s) concluído(s)</span><span>${stops.length} cliente(s) na rota</span></div>` : `<div class="route-flow-empty">Nenhum cliente registrado nessa rota.</div>`}
          <div class="row-actions"><button class="btn small primary" data-route-details="${m.id}">Detalhes</button><button class="btn small" data-return-manual="${m.id}">Registrar entrega</button></div>
        </article>`;
      }).join('')}
    </div>
  </section>`;
}
function controlOverviewHtml() {
  const movements = state.movements || [];
  const routes = movements.filter(m => routeStopsForMovement(m.id).length || m.cliente_nome || m.destino);
  const active = routes.filter(m => m.status === 'em_uso').length;
  const finished = routes.filter(m => m.status === 'finalizado').length;
  const stops = routes.flatMap(m => routeStopsForMovement(m.id));
  const completed = stops.filter(s => s.status === 'visitado');
  const withProof = completed.filter(s => (Array.isArray(s.fotos_antes) && s.fotos_antes.length) || (Array.isArray(s.fotos_depois) && s.fotos_depois.length) || s.assinatura_entrega_url);
  const proofPct = completed.length ? Math.round((withProof.length / completed.length) * 100) : 0;
  return `<section class="control-overview">
    <div class="control-overview-head"><div><span class="section-kicker">Visão geral</span><h3>Acompanhamento das entregas</h3><p>Veja o andamento das rotas e confira rapidamente a comprovação de cada entrega.</p></div><div class="control-legend"><span><i class="legend-dot active"></i>Em andamento</span><span><i class="legend-dot done"></i>Concluído</span><span><i class="legend-dot proof"></i>Comprovação</span></div></div>
    <div class="control-summary-grid">
      <div class="control-summary-card"><span>Rotas em andamento</span><strong>${active}</strong><small>condutores na rua</small></div>
      <div class="control-summary-card"><span>Rotas finalizadas</span><strong>${finished}</strong><small>veículos que retornaram</small></div>
      <div class="control-summary-card"><span>Entregas concluídas</span><strong>${completed.length}</strong><small>clientes atendidos</small></div>
      <div class="control-summary-card proof-card"><div><span>Comprovação</span><strong>${proofPct}%</strong></div><div class="proof-progress"><span style="width:${proofPct}%"></span></div><small>${withProof.length} de ${completed.length} entregas com fotos ou assinatura</small></div>
    </div>
  </section>`;
}
function tabMovements() {
  const rows = filteredMovements();
  return `
    ${hero('Rotas', 'Controle de saída, entrega e roteiro em um único registro.', `<button class="btn primary" data-open-manual>Registrar saída</button>`)}
    <section class="panel routes-list-panel">
      <div class="control-table-head routes-list-head"><div><span class="section-kicker">Controle de rotas</span><h3>Rotas</h3><p>Consulte os principais dados e abra uma rota para ver todos os detalhes.</p></div><span class="control-results-count">${rows.length} registro${rows.length === 1 ? '' : 's'}</span></div>
      ${filtersHtml()}
      ${movementsTable(rows)}
    </section>`;
}
function filtersHtml() {
  return `<div class="searchbar">
    <input id="searchInput" placeholder="Pesquisar por uso, condutor, placa ou cliente" value="${escapeHtml(state.filters.search)}" />
    <select id="statusFilter">
      ${[['todos','Todos'],['em_uso','Em uso'],['finalizado','Finalizado'],['ocorrencia','Ocorrência']].map(([v,l]) => `<option value="${v}" ${state.filters.status===v?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>`;
}
function movementsTable(rows) {
  if (!rows.length) return `<div class="empty">Nenhuma rota encontrada.</div>`;
  return `<div class="table-wrap movements-wrap"><table class="movements-table routes-table">
    <colgroup>
      <col class="col-use"><col class="col-driver"><col class="col-vehicle"><col class="col-route"><col class="col-times"><col class="col-status"><col class="col-actions">
    </colgroup>
    <thead><tr><th>Uso</th><th>Condutor</th><th>Veículo</th><th>Rota</th><th>Saída / Entrega</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${rows.map(m => `<tr>
      <td class="cell-use"><span class="use-label">USO</span><strong>${escapeHtml(m.numero_uso || '—')}</strong></td>
      <td class="cell-driver"><strong>${escapeHtml(m.motorista || '—')}</strong></td>
      <td class="cell-vehicle"><strong>${escapeHtml(m.placa || '—')}</strong><br><span class="muted">${escapeHtml(m.modelo || '—')}</span></td>
      <td class="cell-destination route-cell">${movementRouteDisplayHtml(m)}</td>
      <td class="cell-times"><div><span class="date-label">Saída</span>${dateTimeBR(m.saida_at)}</div><div><span class="date-label">Entrega</span>${m.chegada_at ? dateTimeBR(m.chegada_at) : '<span class="muted">Em aberto</span>'}</div></td>
      <td class="cell-status">${statusBadge(m.status)}</td>
      <td class="cell-actions"><div class="control-actions compact-actions">
        <button class="control-action primary" data-route-details="${m.id}">Detalhes</button>
        ${m.status === 'em_uso' ? `<button class="control-action" title="Registrar entrega" data-return-manual="${m.id}">Entrega</button>` : ''}
      </div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function signatureCellHtml(m, compact=false) {
  const saida = m.assinatura_saida_url ? `<button type="button" class="pill signature-pill" data-view-signature="${escapeHtml(m.assinatura_saida_url)}" data-view-signature-label="Assinatura na retirada — ${escapeHtml(m.numero_uso || '')}">Retirada ✓</button>` : `<span class="pill muted">Retirada —</span>`;
  const entrega = m.assinatura_entrega_url ? `<button type="button" class="pill signature-pill" data-view-signature="${escapeHtml(m.assinatura_entrega_url)}" data-view-signature-label="Assinatura na devolução — ${escapeHtml(m.numero_uso || '')}">Devolução ✓</button>` : `<span class="pill muted">Devolução —</span>`;
  return `<div class="signature-stack ${compact ? 'compact' : ''}">${saida}${entrega}</div>`;
}
function openSignatureModal(url, label) {
  if (!url) return;
  openModal(label || 'Assinatura', `<div class="signature-view"><img src="${escapeHtml(url)}" alt="${escapeHtml(label || 'Assinatura')}"></div>`);
}

function routeMonitorTable(rows, title='Rotas') {
  if (!rows.length) return `<div class="empty">Nenhuma rota encontrada.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Uso</th><th>Condutor</th><th>Veículo</th><th>Cliente atual</th><th>Clientes finalizados</th><th>Comprovação</th><th>Início</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${rows.map(m => {
      const stops = routeStopsForMovement(m.id);
      const current = currentRouteStop(m);
      const done = stops.filter(s => s.status === 'visitado').length;
      return `<tr>
        <td><strong>${escapeHtml(m.numero_uso || '—')}</strong></td>
        <td>${escapeHtml(m.motorista || '—')}</td>
        <td><strong>${escapeHtml(m.placa || '—')}</strong><br><span class="muted">${escapeHtml(m.modelo || '—')}</span></td>
        <td>${current ? `<strong>${escapeHtml(routeStopLabel(current))}</strong><br><span class="muted">${escapeHtml(current.endereco || '—')}</span><br><span class="destination-table-links">${routeStopRouteLinksHtml(current)}</span>` : escapeHtml(m.status === 'finalizado' ? 'Rota finalizada' : 'Roteiro finalizado • aguardando devolução')}</td>
        <td>${done} de ${stops.length}</td>
        <td>${movementEvidenceButtonHtml(m)}</td>
        <td>${dateTimeBR(m.saida_at || m.created_at)}</td>
        <td>${statusBadge(m.status)}</td>
        <td><div class="row-actions"><button class="icon-btn details-btn" data-route-details="${m.id}">Detalhes</button>${m.status === 'em_uso' ? `<button class="icon-btn" data-return-manual="${m.id}">Finalizar uso</button>` : ''}</div></td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}
function tabRoutes() {
  const withRoutes = state.movements.filter(m => routeStopsForMovement(m.id).length || m.cliente_nome || m.destino);
  const open = withRoutes.filter(m => m.status === 'em_uso');
  const activeStops = (state.routeStops || []).filter(s => s.status === 'pendente');
  const finishedStops = (state.routeStops || []).filter(s => s.status === 'visitado');
  return `
    ${hero('Rotas', 'Acompanhe qual cliente cada condutor está atendendo agora e quais clientes já foram finalizados na rota.', (can('write') ? `<button class="btn primary" onclick="setRoute('driver')">Abrir tela do condutor</button>` : ''))}
    <div class="grid-cards report-grid">
      <div class="metric"><small>Rotas em aberto</small><strong>${open.length}</strong><div class="hint">usos de veículo em andamento</div></div>
      <div class="metric"><small>Clientes atuais</small><strong>${activeStops.length}</strong><div class="hint">em atendimento agora</div></div>
      <div class="metric"><small>Clientes finalizados</small><strong>${finishedStops.length}</strong><div class="hint">paradas concluídas</div></div>
      <div class="metric"><small>Total de clientes na rota</small><strong>${(state.routeStops || []).length}</strong><div class="hint">histórico de paradas</div></div>
      <div class="metric"><small>Rotas concluídas</small><strong>${withRoutes.filter(m => m.status === 'finalizado').length}</strong><div class="hint">veículo devolvido</div></div>
    </div>
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><h3>Em andamento agora</h3><p>Mostra o cliente atual de cada condutor e o avanço da rota.</p></div></div>
      ${routeMonitorTable(open, 'Rotas em andamento')}
    </section>
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><h3>Histórico de rotas</h3><p>Clientes finalizados, cliente atual e situação de cada uso.</p></div></div>
      ${routeMonitorTable(withRoutes.slice(0, 120), 'Histórico')}
    </section>`;
}
function openRouteDetailsModal(id) {
  const m = state.movements.find(x => x.id === id);
  if (!m) return;
  const stops = routeDisplayStopsForMovement(m);
  const currentIndex = stops.findIndex(s => s.status === 'pendente');
  const current = currentIndex >= 0 ? stops[currentIndex] : null;
  const done = stops.filter(s => s.status === 'visitado').length;
  const currentLabel = current ? routeStopLabel(current) : (m.status === 'finalizado' ? 'Rota finalizada' : movementRouteTitle(m));
  const currentPointLabel = current ? 'Cliente atual' : (m.status === 'finalizado' ? 'Rota concluída' : 'Rota');
  const geoCount = routeMapPoints(m).filter(p => validLatLng(p.lat, p.lng)).length;
  openModal('Detalhes da rota', `
    <div class="route-detail-modal">
      <div class="route-detail-hero">
        <div class="route-detail-hero-main">
          <span class="route-detail-kicker">Rota do condutor</span>
          <h2>${escapeHtml(m.motorista || 'Condutor')}</h2>
          <p><strong>${escapeHtml(m.numero_uso || '—')}</strong> • ${escapeHtml(m.placa || '—')} • ${escapeHtml(m.modelo || '—')} • saída ${dateTimeBR(m.saida_at || m.created_at)}</p>
        </div>
        <div class="route-detail-current-chip">
          <small>${escapeHtml(currentPointLabel)}</small>
          <strong>${escapeHtml(currentLabel || 'Sem cliente atual')}</strong>
          <span>${escapeHtml(routeProgressText(m))}</span>
        </div>
      </div>

      <div class="route-detail-info-grid">
        <div class="route-info-card"><small>Saída</small><strong>${dateTimeBR(m.saida_at || m.created_at)}</strong></div>
        <div class="route-info-card"><small>Entrega</small><strong>${m.chegada_at ? dateTimeBR(m.chegada_at) : 'Em aberto'}</strong></div>
        <div class="route-info-card"><small>Clientes</small><strong>${done} de ${stops.length}</strong></div>
        <div class="route-info-card"><small>Localizados</small><strong>${geoCount}</strong></div>
      </div>

      <div class="route-detail-layout">
        <section class="route-map-panel">
          <div class="route-map-head">
            <div><h4>Mapa da rota</h4><span>C1, C2, C3... seguem a ordem em que o condutor registra os clientes.</span></div>
            <span class="pill">${geoCount ? `${geoCount} cliente(s)` : 'Sem mapa'}</span>
          </div>
          <div class="route-map" data-route-map="${escapeHtml(m.id)}"><div class="route-map-empty">Carregando mapa da rota...</div></div>
          <div class="route-map-caption">O mapa usa C1, C2, C3... na ordem da rota e tenta mostrar todos os clientes com endereço ou ponto cadastrado.</div>
        </section>
        <section class="route-points-panel">
          <div class="route-detail-section-title">Clientes da rota</div>
          ${routePointCardsHtml(m)}
        </section>
      </div>

      <div class="route-detail-section-title">Assinaturas</div>
      <div class="route-detail-mini-grid signatures-grid">
        ${signatureCardHtml('Retirada', m.assinatura_saida_url, m.assinatura_saida_at)}
        ${signatureCardHtml('Devolução', m.assinatura_entrega_url, m.assinatura_entrega_at)}
      </div>
    </div>
  `);
  initRouteDetailsMap(m.id);
}
function signatureCardHtml(label, url, at) {
  return `<div class="signature-card">
    <small>${escapeHtml(label)}</small>
    ${url
      ? `<button type="button" class="signature-thumb" data-view-signature="${escapeHtml(url)}" data-view-signature-label="Assinatura — ${escapeHtml(label)}"><img src="${escapeHtml(url)}" alt="Assinatura de ${escapeHtml(label)}"></button>
         <span class="muted">${at ? dateTimeBR(at) : ''}</span>`
      : `<div class="signature-thumb empty-thumb">Sem assinatura</div>`}
  </div>`;
}


function tabVehicles() {
  return `
    ${hero('Veículos', 'Cadastro dos veículos da frota comercial. O condutor seleciona o veículo nesta lista ao registrar a saída.', `<button class="btn primary" data-new-vehicle>Cadastrar veículo</button>`)}
    ${metricsHtml()}
    <section class="panel">
      ${vehiclesTable()}
    </section>`;
}
function vehiclesTable() {
  if (!state.vehicles.length) return `<div class="empty">Nenhum veículo cadastrado.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Placa</th><th>Modelo</th><th>Ano</th><th>Renavam</th><th>Contrato</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead><tbody>
    ${state.vehicles.map(v => `<tr>
      <td><strong>${escapeHtml(v.placa)}</strong></td><td>${escapeHtml(v.modelo)}</td><td>${escapeHtml(v.ano || '—')}</td><td>${escapeHtml(v.renavam || '—')}</td><td>${escapeHtml(v.contrato || '—')}</td><td>${statusBadge(vehicleStatus(v))}</td><td>${escapeHtml(v.observacao || '—')}</td>
      <td><div class="row-actions"><button class="icon-btn" data-history-vehicle="${escapeHtml(v.placa)}">Histórico</button><button class="icon-btn" data-edit-vehicle="${v.id}">Editar</button><button class="icon-btn" data-delete-vehicle="${v.id}">Excluir</button></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function vehicleHistoryOptions() {
  const byPlate = new Map();
  state.vehicles.forEach(v => {
    const plate = normalizeHistoryPlate(v.placa);
    if (plate) byPlate.set(plate, `${plate}${v.modelo ? ' • ' + v.modelo : ''}`);
  });
  state.movements.forEach(m => {
    const plate = normalizeHistoryPlate(m.placa);
    if (plate && !byPlate.has(plate)) byPlate.set(plate, `${plate}${m.modelo ? ' • ' + m.modelo : ''}`);
  });
  return [...byPlate.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR'));
}
function filteredVehicleHistoryMovements() {
  const f = state.vehicleHistoryFilters;
  const search = String(f.search || '').trim().toLowerCase();
  return state.movements.filter(m => {
    const plate = normalizeHistoryPlate(m.placa);
    if (f.veiculo !== 'todos' && plate !== f.veiculo) return false;
    if (f.status === 'em_uso' && m.status !== 'em_uso') return false;
    if (f.status === 'finalizado' && m.status !== 'finalizado') return false;
    if (search) {
      const haystack = [m.numero_uso, m.motorista, m.placa, m.modelo, m.destino, m.observacao_saida, m.observacao_chegada].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
function filteredVehicleHistoryOccurrences() {
  const f = state.vehicleHistoryFilters;
  const search = String(f.search || '').trim().toLowerCase();
  return (state.occurrences || []).filter(o => {
    const plate = normalizeHistoryPlate(o.placa);
    if (f.veiculo !== 'todos' && plate !== f.veiculo) return false;
    if (search) {
      const haystack = [o.numero_uso, o.motorista, o.placa, o.tipo, o.prioridade, o.status, o.descricao].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
function vehicleHistoryStats(movements, occurrences) {
  const durations = movements.map(m => usageMinutes(m, false)).filter(v => Number.isFinite(v));
  const last = movements[0];
  return {
    total: movements.length,
    concluidos: movements.filter(m => m.status === 'finalizado').length,
    emUso: movements.filter(m => m.status === 'em_uso').length,
    tempoMedio: durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : null,
    ocorrencias: occurrences.length,
    ocorrenciasAbertas: occurrences.filter(o => (o.status || 'aberta') !== 'resolvida').length,
    ultimoUso: last ? dateTimeBR(last.saida_at || last.created_at) : '—'
  };
}
function vehicleHistoryFiltersHtml() {
  const f = state.vehicleHistoryFilters;
  const vehicles = vehicleHistoryOptions();
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title"><h3>Filtros do histórico</h3><p>Consulte o uso completo por placa, condutor, cliente, número do uso ou ocorrência.</p></div></div>
    <form class="form-grid three">
      <div class="field"><label>Veículo / placa</label><select data-history-filter name="veiculo"><option value="todos">Todos os veículos</option>${vehicles.map(([plate,label]) => `<option value="${escapeHtml(plate)}" ${f.veiculo===plate?'selected':''}>${escapeHtml(label)}</option>`).join('')}</select></div>
      <div class="field"><label>Status</label><select data-history-filter name="status">
        ${[['todos','Todos os registros'],['em_uso','Em uso'],['finalizado','Finalizados']].map(([v,l]) => `<option value="${v}" ${f.status===v?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <div class="field"><label>Pesquisa</label><input data-history-filter name="search" value="${escapeHtml(f.search)}" placeholder="Condutor, cliente, uso ou ocorrência"></div>
    </form>
  </section>`;
}
function vehicleHistoryMetricsHtml(stats) {
  return `<div class="grid-cards report-grid">
    <div class="metric"><small>Registros de uso</small><strong>${stats.total}</strong><div class="hint">histórico filtrado</div></div>
    <div class="metric"><small>Concluídos</small><strong>${stats.concluidos}</strong><div class="hint">com entrega registrada</div></div>
    <div class="metric"><small>Em uso</small><strong>${stats.emUso}</strong><div class="hint">sem entrega finalizada</div></div>
    <div class="metric"><small>Tempo médio</small><strong>${formatDuration(stats.tempoMedio)}</strong><div class="hint">registros com saída e retorno</div></div>
    <div class="metric"><small>Ocorrências abertas</small><strong>${stats.ocorrenciasAbertas}</strong><div class="hint">${stats.ocorrencias} ocorrências no histórico</div></div>
  </div>`;
}
function vehicleHistorySummaryRows() {
  const plates = vehicleHistoryOptions().map(([plate,label]) => ({plate,label}));
  return plates.map(({plate,label}) => {
    const movements = state.movements.filter(m => normalizeHistoryPlate(m.placa) === plate);
    const occurrences = (state.occurrences || []).filter(o => normalizeHistoryPlate(o.placa) === plate);
    const durations = movements.map(m => usageMinutes(m, false)).filter(v => Number.isFinite(v));
    const last = movements[0];
    return { plate, label, total: movements.length, emUso: movements.filter(m => m.status === 'em_uso').length, tempoMedio: durations.length ? Math.round(durations.reduce((a,b)=>a+b,0) / durations.length) : null, ocorrenciasAbertas: occurrences.filter(o => (o.status || 'aberta') !== 'resolvida').length, ultimoUso: last ? dateTimeBR(last.saida_at || last.created_at) : '—' };
  }).sort((a,b) => b.total - a.total || a.plate.localeCompare(b.plate,'pt-BR'));
}
function vehicleHistorySummaryTable() {
  const rows = vehicleHistorySummaryRows();
  if (!rows.length) return `<div class="empty">Nenhum histórico encontrado.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Veículo</th><th>Usos</th><th>Em uso</th><th>Tempo médio</th><th>Ocorrências abertas</th><th>Último uso</th><th>Ação</th></tr></thead><tbody>
    ${rows.map(r => `<tr>
      <td><strong>${escapeHtml(r.plate)}</strong><br><span class="muted">${escapeHtml(r.label.replace(r.plate, '').replace(/^\s*•\s*/, '') || '—')}</span></td>
      <td>${r.total}</td><td>${r.emUso}</td><td>${formatDuration(r.tempoMedio)}</td><td>${r.ocorrenciasAbertas}</td><td>${r.ultimoUso}</td>
      <td><button class="icon-btn" data-history-vehicle="${escapeHtml(r.plate)}">Abrir</button></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function vehicleHistoryMovementsTable(rows) {
  if (!rows.length) return `<div class="empty">Nenhum uso encontrado para o filtro selecionado.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Uso</th><th>Data</th><th>Condutor</th><th>Veículo</th><th>Cliente / rota</th><th>Tempo</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${rows.map(m => `<tr>
      <td><strong>${escapeHtml(m.numero_uso || '—')}</strong></td>
      <td>${dateTimeBR(m.saida_at || m.created_at)}</td>
      <td>${escapeHtml(m.motorista || '—')}</td>
      <td><strong>${escapeHtml(m.placa || '—')}</strong><br><span class="muted">${escapeHtml(m.modelo || '—')}</span></td>
      <td>${movementRouteDisplayHtml(m)}</td>
      <td>${formatDuration(usageMinutes(m, true))}</td>
      <td>${statusBadge(m.status)}</td>
      <td><div class="row-actions"><button class="icon-btn" data-print-movement="${m.id}">Imprimir</button></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function vehicleHistoryOccurrencesTable(rows) {
  if (!rows.length) return `<div class="empty">Nenhuma ocorrência encontrada para o filtro selecionado.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo/Uso</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th>Descrição</th><th>Ações</th></tr></thead><tbody>
    ${rows.map(o => `<tr>
      <td>${dateTimeBR(o.created_at)}</td>
      <td><strong>${escapeHtml(o.placa || '—')}</strong>${o.numero_uso ? `<br><span class="muted">${escapeHtml(o.numero_uso)}</span>` : ''}</td>
      <td>${escapeHtml(o.tipo || '—')}</td>
      <td>${statusBadge(o.prioridade || 'media')}</td>
      <td>${statusBadge(o.status || 'aberta')}</td>
      <td>${escapeHtml(o.descricao || '—')}</td>
      <td><div class="row-actions"><button class="icon-btn" data-edit-occurrence="${o.id}">Editar</button><button class="icon-btn" data-resolve-occurrence="${o.id}">Resolver</button></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function tabVehicleHistory() {
  const movements = filteredVehicleHistoryMovements();
  const occurrences = filteredVehicleHistoryOccurrences();
  const stats = vehicleHistoryStats(movements, occurrences);
  const selected = state.vehicleHistoryFilters.veiculo;
  return `
    ${hero('Histórico de veículos', 'Consulte o uso completo de cada carro, incluindo saídas, retornos, tempo de uso e ocorrências.', `<button class="btn primary" data-print-history>Gerar PDF do histórico</button><button class="btn" data-clear-history-filters>Limpar filtros</button>`)}
    ${vehicleHistoryFiltersHtml()}
    ${vehicleHistoryMetricsHtml(stats)}
    ${selected === 'todos' ? `<section class="panel"><div class="panel-head"><div class="panel-title"><h3>Resumo por veículo</h3><p>Visão geral consolidada de todos os carros cadastrados e usados.</p></div></div>${vehicleHistorySummaryTable()}</section>` : ''}
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><h3>Histórico de uso</h3><p>Lista de saídas e devoluções conforme os filtros selecionados.</p></div></div>
      ${vehicleHistoryMovementsTable(movements)}
    </section>
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><h3>Ocorrências do veículo</h3><p>Ocorrências vinculadas à placa selecionada ou ao filtro atual.</p></div></div>
      ${vehicleHistoryOccurrencesTable(occurrences)}
    </section>`;
}

function printVehicleHistoryRows(rows) {
  if (!rows.length) return '<p>Nenhum uso encontrado para o filtro selecionado.</p>';
  return `<table><thead><tr><th>Uso</th><th>Data</th><th>Condutor</th><th>Veículo</th><th>Cliente / rota</th><th>Tempo</th><th>Status</th></tr></thead><tbody>${rows.map(m => `<tr>
    <td>${escapeHtml(m.numero_uso || '—')}</td>
    <td>${dateTimeBR(m.saida_at || m.created_at)}</td>
    <td>${escapeHtml(m.motorista || '—')}</td>
    <td>${escapeHtml(m.placa || '—')}<br>${escapeHtml(m.modelo || '—')}</td>
    <td>${escapeHtml(movementRoutePlainText(m))}</td>
    <td>${formatDuration(usageMinutes(m, true))}</td>
    <td>${escapeHtml(movementPlainStatus(m))}</td>
  </tr>`).join('')}</tbody></table>`;
}
function printVehicleHistoryOccurrences(rows) {
  if (!rows.length) return '<p>Nenhuma ocorrência encontrada para o filtro selecionado.</p>';
  return `<table><thead><tr><th>Data</th><th>Veículo</th><th>Uso</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th>Descrição</th></tr></thead><tbody>${rows.map(o => `<tr>
    <td>${dateTimeBR(o.created_at)}</td>
    <td>${escapeHtml(o.placa || '—')}</td>
    <td>${escapeHtml(o.numero_uso || '—')}</td>
    <td>${escapeHtml(o.tipo || '—')}</td>
    <td>${escapeHtml(o.prioridade || '—')}</td>
    <td>${escapeHtml(o.status || 'aberta')}</td>
    <td>${escapeHtml(o.descricao || '—')}</td>
  </tr>`).join('')}</tbody></table>`;
}
function printVehicleHistory() {
  const movements = filteredVehicleHistoryMovements();
  const occurrences = filteredVehicleHistoryOccurrences();
  const stats = vehicleHistoryStats(movements, occurrences);
  const selected = state.vehicleHistoryFilters.veiculo === 'todos' ? 'Todos os veículos' : state.vehicleHistoryFilters.veiculo;
  printHtml(`${printHeader('Histórico de veículos', `Veículo: ${escapeHtml(selected)}`)}
    <h2 style="margin:0 0 8px">Resumo</h2>
    <table><tbody>
      <tr><th>Registros de uso</th><td>${stats.total}</td><th>Concluídos</th><td>${stats.concluidos}</td></tr>
      <tr><th>Em uso</th><td>${stats.emUso}</td><th>Ocorrências abertas</th><td>${stats.ocorrenciasAbertas}</td></tr>
      <tr><th>Tempo médio</th><td>${formatDuration(stats.tempoMedio)}</td></tr>
    </tbody></table>
    <h2 style="margin:18px 0 8px">Histórico de uso</h2>
    ${printVehicleHistoryRows(movements)}
    <h2 style="margin:18px 0 8px">Ocorrências</h2>
    ${printVehicleHistoryOccurrences(occurrences)}`);
}

function tabOccurrences() {
  return `
    ${hero('Ocorrências do controle', 'Registre problemas, avarias, multas informadas e qualquer situação separada da entrega do veículo.', `<button class="btn primary" data-new-occurrence>Nova ocorrência</button>`)}
    ${metricsHtml()}
    <section class="panel">
      ${occurrencesTable()}
    </section>`;
}
function occurrencesTable() {
  const rows = state.occurrences || [];
  if (!rows.length) return `<div class="empty">Nenhuma ocorrência registrada no controle.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo/Uso</th><th>Tipo</th><th>Descrição</th><th>Prioridade</th><th>Status</th><th>Ações</th></tr></thead><tbody>
    ${rows.map(o => `<tr>
      <td>${dateTimeBR(o.created_at)}</td>
      <td><strong>${escapeHtml(o.placa || '—')}</strong>${o.numero_uso ? `<br><span class="muted">${escapeHtml(o.numero_uso)}</span>` : ''}${o.motorista ? `<br><span class="muted">${escapeHtml(o.motorista)}</span>` : ''}</td>
      <td>${escapeHtml(o.tipo || '—')}</td>
      <td>${escapeHtml(o.descricao || '—')}</td>
      <td>${statusBadge(o.prioridade || 'media')}</td>
      <td>${statusBadge(o.status || 'aberta')}</td>
      <td><div class="row-actions"><button class="icon-btn" data-edit-occurrence="${o.id}">Editar</button><button class="icon-btn" data-resolve-occurrence="${o.id}">Resolver</button><button class="icon-btn" data-delete-occurrence="${o.id}">Excluir</button></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
}
function normalizeTextKey(value) {
  return String(value || '').trim() || '—';
}
function normalizeHistoryPlate(value) {
  return normalizePlate(value || '').trim();
}
function usageMinutes(m, useCurrentForOpen=false) {
  const start = m.saida_at || m.created_at;
  const end = m.chegada_at || (useCurrentForOpen && m.status === 'em_uso' ? nowISO() : '');
  if (!start || !end) return null;
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
}
function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`;
}
function movementDateKey(m) {
  return String(m.saida_at || m.created_at || '').slice(0, 10);
}
function movementPlainStatus(m) {
  if (m.status === 'finalizado') return 'Concluído';
  if (m.status === 'em_uso') return 'Pendente / em uso';
  if (m.status === 'ocorrencia') return 'Ocorrência';
  return m.status ? String(m.status).replace(/_/g, ' ') : '—';
}
function reportFilterOptions() {
  const condutores = [...new Set(state.movements.map(m => normalizeTextKey(m.motorista)).filter(v => v !== '—'))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const veiculos = [...new Map(state.movements.map(m => {
    const placa = normalizeTextKey(m.placa);
    const modelo = normalizeTextKey(m.modelo);
    const value = placa !== '—' ? placa : modelo;
    const label = placa !== '—' && modelo !== '—' ? `${placa} • ${modelo}` : value;
    return [value, label];
  }).filter(([value]) => value !== '—')).entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR'));
  return { condutores, veiculos };
}
function filteredReportMovements() {
  const f = state.reportFilters;
  return state.movements.filter(m => {
    const data = movementDateKey(m);
    if (f.dataInicial && (!data || data < f.dataInicial)) return false;
    if (f.dataFinal && (!data || data > f.dataFinal)) return false;
    if (f.motorista !== 'todos' && normalizeTextKey(m.motorista) !== f.motorista) return false;
    const veiculoKey = normalizeTextKey(m.placa) !== '—' ? normalizeTextKey(m.placa) : normalizeTextKey(m.modelo);
    if (f.veiculo !== 'todos' && veiculoKey !== f.veiculo) return false;
    if (f.status === 'concluidos' && m.status !== 'finalizado') return false;
    if (f.status === 'pendentes' && m.status !== 'em_uso') return false;
    if (f.status === 'sem_retorno' && m.chegada_at) return false;
    return true;
  });
}
function filteredReportOccurrences() {
  const f = state.reportFilters;
  return (state.occurrences || []).filter(o => {
    const data = String(o.created_at || '').slice(0, 10);
    if (f.dataInicial && (!data || data < f.dataInicial)) return false;
    if (f.dataFinal && (!data || data > f.dataFinal)) return false;
    if (f.veiculo !== 'todos' && normalizeTextKey(o.placa) !== f.veiculo) return false;
    return true;
  });
}
function countBy(list, getKey) {
  const result = new Map();
  list.forEach(item => {
    const key = normalizeTextKey(getKey(item));
    if (key === '—') return;
    result.set(key, (result.get(key) || 0) + 1);
  });
  return [...result.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}
function reportStats(rows) {
  const occurrences = filteredReportOccurrences();
  const abertas = occurrences.filter(o => (o.status || 'aberta') !== 'resolvida');
  return {
    total: rows.length,
    concluidos: rows.filter(m => m.status === 'finalizado').length,
    pendentes: rows.filter(m => m.status === 'em_uso').length,
    semRetorno: rows.filter(m => !m.chegada_at).length,
    condutores: new Set(rows.map(m => normalizeTextKey(m.motorista)).filter(v => v !== '—')).size,
    veiculos: new Set(rows.map(m => normalizeTextKey(m.placa) !== '—' ? normalizeTextKey(m.placa) : normalizeTextKey(m.modelo)).filter(v => v !== '—')).size,
    ocorrenciasAbertas: abertas.length,
    ocorrenciasAlta: abertas.filter(o => (o.prioridade || '').toLowerCase() === 'alta').length
  };
}

function dateInputBR(value) {
  const raw = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  return dateBR(value);
}
function reportPeriodText() {
  const f = state.reportFilters;
  if (!f.dataInicial && !f.dataFinal) return 'Todo o histórico disponível';
  return `${f.dataInicial ? dateInputBR(f.dataInicial) : 'início'} até ${f.dataFinal ? dateInputBR(f.dataFinal) : 'hoje'}`;
}
function reportFiltersHtml() {
  const f = state.reportFilters;
  const { condutores, veiculos } = reportFilterOptions();
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title"><h3>Filtros do relatório</h3><p>Use os filtros abaixo e exporte apenas o que a diretoria precisa ver.</p></div></div>
    <form id="reportFilterForm" class="form-grid three">
      <div class="field"><label>Data inicial</label><input data-report-filter type="date" name="dataInicial" value="${escapeHtml(f.dataInicial)}"></div>
      <div class="field"><label>Data final</label><input data-report-filter type="date" name="dataFinal" value="${escapeHtml(f.dataFinal)}"></div>
      <div class="field"><label>Status</label><select data-report-filter name="status">
        ${[['todos','Todos os registros'],['concluidos','Concluídos'],['pendentes','Pendentes / em uso'],['sem_retorno','Sem retorno informado']].map(([v,l]) => `<option value="${v}" ${f.status===v?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <div class="field"><label>Condutor</label><select data-report-filter name="motorista"><option value="todos">Todos</option>${condutores.map(v => `<option value="${escapeHtml(v)}" ${f.motorista===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></div>
      <div class="field"><label>Veículo / placa</label><select data-report-filter name="veiculo"><option value="todos">Todos</option>${veiculos.map(([v,l]) => `<option value="${escapeHtml(v)}" ${f.veiculo===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></div>
      <div class="field report-actions-field"><label>Ações</label><div class="row-actions"><button class="btn" type="button" data-clear-report-filters>Limpar filtros</button></div></div>
    </form>
  </section>`;
}
function reportMetricsHtml(stats) {
  return `<div class="grid-cards report-grid">
    <div class="metric"><small>Registros de uso</small><strong>${stats.total}</strong><div class="hint">no período filtrado</div></div>
    <div class="metric"><small>Concluídos</small><strong>${stats.concluidos}</strong><div class="hint">com entrega registrada</div></div>
    <div class="metric"><small>Pendentes</small><strong>${stats.pendentes}</strong><div class="hint">veículos ainda em uso</div></div>
    <div class="metric"><small>Ocorrências abertas</small><strong>${stats.ocorrenciasAbertas}</strong><div class="hint">${stats.ocorrenciasAlta} alta prioridade</div></div>
  </div>`;
}
function miniRankingTable(title, subtitle, rows, firstLabel='Item') {
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title"><h3>${title}</h3><p>${subtitle}</p></div></div>
    ${rows.length ? `<div class="table-wrap compact-table"><table><thead><tr><th>${firstLabel}</th><th>Qtd.</th></tr></thead><tbody>${rows.map(([label,total]) => `<tr><td>${escapeHtml(label)}</td><td><strong>${total}</strong></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">Nenhum dado encontrado.</div>`}
  </section>`;
}
function reportPreviewTable(rows) {
  const preview = rows.slice(0, 80);
  if (!preview.length) return `<div class="empty">Nenhum registro encontrado para os filtros selecionados.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Uso</th><th>Data</th><th>Condutor</th><th>Veículo</th><th>Cliente / rota</th><th>Saída</th><th>Retorno</th><th>Status</th></tr></thead><tbody>
    ${preview.map(m => `<tr>
      <td><strong>${escapeHtml(m.numero_uso || '—')}</strong></td>
      <td>${dateBR(m.saida_at || m.created_at)}</td>
      <td>${escapeHtml(m.motorista || '—')}</td>
      <td>${escapeHtml(m.placa || '—')}<br><span class="muted">${escapeHtml(m.modelo || '—')}</span></td>
      <td>${escapeHtml(movementRoutePlainText(m))}</td>
      <td>${timeBR(m.saida_at)}</td>
      <td>${m.chegada_at ? timeBR(m.chegada_at) : '—'}</td>
      <td>${escapeHtml(movementPlainStatus(m))}</td>
    </tr>`).join('')}
  </tbody></table></div>${rows.length > preview.length ? `<p class="muted">Mostrando ${preview.length} de ${rows.length} registros na prévia. O PDF e o CSV exportam todos os registros filtrados.</p>` : ''}`;
}
function tabReports() {
  const rows = filteredReportMovements();
  const stats = reportStats(rows);
  const usoPorVeiculo = countBy(rows, m => `${normalizeTextKey(m.placa)} • ${normalizeTextKey(m.modelo)}`).slice(0, 10);
  const usoPorCondutor = countBy(rows, m => m.motorista).slice(0, 10);
  const clientes = countBy(routeStopsForReport(rows), s => s.cliente_nome || s.endereco).slice(0, 10);
  return `
    ${hero('Relatórios', 'Relatório completo para acompanhamento e exportação em CSV dos registros de uso da frota comercial.', `<button class="btn primary" data-export-report-pdf>Gerar PDF</button><button class="btn" data-export-report-csv>Exportar CSV</button>`)}
    ${reportFiltersHtml()}
    ${reportMetricsHtml(stats)}
    <div class="split report-split">
      ${miniRankingTable('Uso por veículo', 'Veículos mais utilizados no período.', usoPorVeiculo, 'Veículo / placa')}
      ${miniRankingTable('Uso por condutor', 'Condutores com mais registros de uso.', usoPorCondutor, 'Condutor')}
    </div>
    <div class="split report-split">
      ${miniRankingTable('Clientes mais visitados', 'Clientes registrados nas rotas conforme os filtros do relatório.', clientes, 'Cliente')}
      ${miniRankingTable('Clientes finalizados', 'Clientes que já foram marcados como concluídos nas rotas.', countBy(routeStopsForReport(rows).filter(s => s.status === 'visitado'), s => s.cliente_nome || s.endereco).slice(0, 10), 'Cliente')}
    </div>
    <section class="panel">
      <div class="panel-head"><div class="panel-title"><h3>Prévia dos registros</h3><p>Dados que entrarão no PDF e no CSV conforme os filtros atuais.</p></div></div>
      ${reportPreviewTable(rows)}
    </section>`;
}
function clearReportFilters() {
  state.reportFilters = { dataInicial: '', dataFinal: '', motorista: 'todos', veiculo: 'todos', status: 'todos' };
  render();
}
function escapeCSV(value) {
  return `"${String(value ?? '—').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}
function downloadTextFile(filename, content, type='text/plain;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function exportReportCSV() {
  const rows = filteredReportMovements();
  const headers = ['Nº do uso','Data','Condutor','Veículo','Placa','Cliente atual','Rota completa','Horário de saída','Horário de retorno','Status','Observação saída','Observação retorno','Criado em'];
  const body = rows.map(m => [
    m.numero_uso || '—',
    dateBR(m.saida_at || m.created_at),
    m.motorista || '—',
    m.modelo || '—',
    m.placa || '—',
    movementRouteTitle(m) || '—',
    movementRoutePlainText(m) || '—',
    timeBR(m.saida_at),
    m.chegada_at ? timeBR(m.chegada_at) : '—',
    movementPlainStatus(m),
    m.observacao_saida || '—',
    m.observacao_chegada || '—',
    dateTimeBR(m.created_at)
  ]);
  const csv = [headers, ...body].map(row => row.map(escapeCSV).join(';')).join('\n');
  downloadTextFile(`relatorio-frota-comercial-${new Date().toISOString().slice(0,10)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8;');
  toast('CSV gerado com os registros filtrados.');
}
function printReport() {
  const rows = filteredReportMovements();
  printHtml(reportPrintHtml(rows));
}
function printRowsTable(rows) {
  if (!rows.length) return '<p>Nenhum registro encontrado para os filtros selecionados.</p>';
  return `<table><thead><tr><th>Data</th><th>Condutor</th><th>Veículo</th><th>Cliente / rota</th><th>Saída</th><th>Retorno</th><th>Status</th></tr></thead><tbody>${rows.map(m => `<tr>
    <td>${dateBR(m.saida_at || m.created_at)}</td>
    <td>${escapeHtml(m.motorista || '—')}</td>
    <td>${escapeHtml(m.placa || '—')}<br>${escapeHtml(m.modelo || '—')}</td>
    <td>${escapeHtml(movementRoutePlainText(m))}</td>
    <td>${timeBR(m.saida_at)}</td>
    <td>${m.chegada_at ? timeBR(m.chegada_at) : '—'}</td>
    <td>${escapeHtml(movementPlainStatus(m))}</td>
  </tr>`).join('')}</tbody></table>`;
}
function printSummaryTable(stats) {
  return `<table><tbody>
    <tr><th>Total de registros de uso</th><td>${stats.total}</td><th>Registros concluídos</th><td>${stats.concluidos}</td></tr>
    <tr><th>Registros pendentes / em uso</th><td>${stats.pendentes}</td><th>Registros sem retorno</th><td>${stats.semRetorno}</td></tr>
    <tr><th>Condutores ativos</th><td>${stats.condutores}</td><th>Veículos utilizados</th><td>${stats.veiculos}</td></tr>
    <tr><th>Ocorrências abertas</th><td>${stats.ocorrenciasAbertas}</td></tr>
  </tbody></table>`;
}
function printRankingTable(title, rows, label='Item') {
  return `<h2 style="margin:18px 0 8px">${title}</h2>${rows.length ? `<table><thead><tr><th>${label}</th><th>Quantidade</th></tr></thead><tbody>${rows.map(([name,total]) => `<tr><td>${escapeHtml(name)}</td><td>${total}</td></tr>`).join('')}</tbody></table>` : '<p>Nenhum dado encontrado.</p>'}`;
}
function printOccurrencesTable() {
  const rows = filteredReportOccurrences().filter(o => (o.status || 'aberta') !== 'resolvida').slice(0, 30);
  if (!rows.length) return '';
  return `<h2 style="margin:18px 0 8px">Ocorrências abertas</h2><table><thead><tr><th>Data</th><th>Veículo</th><th>Tipo</th><th>Prioridade</th><th>Descrição</th></tr></thead><tbody>${rows.map(o => `<tr><td>${dateBR(o.created_at)}</td><td>${escapeHtml(o.placa || '—')}</td><td>${escapeHtml(o.tipo || '—')}</td><td>${escapeHtml(o.prioridade || '—')}</td><td>${escapeHtml(o.descricao || '—')}</td></tr>`).join('')}</tbody></table>`;
}
function reportPrintHtml(rows) {
  const stats = reportStats(rows);
  const usoPorVeiculo = countBy(rows, m => `${normalizeTextKey(m.placa)} • ${normalizeTextKey(m.modelo)}`).slice(0, 12);
  const usoPorCondutor = countBy(rows, m => m.motorista).slice(0, 12);
  const clientes = countBy(routeStopsForReport(rows), s => s.cliente_nome || s.endereco).slice(0, 12);
  const clientesFinalizados = countBy(routeStopsForReport(rows).filter(s => s.status === 'visitado'), s => s.cliente_nome || s.endereco).slice(0, 12);
  return `${printHeader('Relatório - Frota Comercial', `Período: ${escapeHtml(reportPeriodText())}`)}
    <h2 style="margin:0 0 8px">Resumo geral</h2>
    ${printSummaryTable(stats)}
    ${printRankingTable('Uso por veículo', usoPorVeiculo, 'Veículo / placa')}
    ${printRankingTable('Uso por condutor', usoPorCondutor, 'Condutor')}
    ${printRankingTable('Clientes mais visitados', clientes, 'Cliente')}
    ${printRankingTable('Clientes finalizados', clientesFinalizados, 'Cliente')}
    ${printOccurrencesTable()}
    <h2 style="margin:18px 0 8px">Registros detalhados</h2>
    ${printRowsTable(rows)}`;
}

function bindMonitor() {
  bindMonitorShell();
  bindTabContent();
}

function bindMonitorShell() {
  qsa('[data-tab]').forEach(btn => btn.onclick = () => setTab(btn.dataset.tab));
  const sidebarToggle = qs('[data-toggle-sidebar]'); if (sidebarToggle) sidebarToggle.onclick = toggleSidebar;
  const themeToggle = qs('[data-theme-toggle]'); if (themeToggle) themeToggle.onclick = toggleTheme;
  const logout = qs('[data-monitor-logout]'); if (logout) logout.onclick = logoutControle;
  qsa('[data-nav-open]').forEach(b => b.onclick = () => document.body.classList.add('nav-open'));
  qsa('[data-nav-close]').forEach(b => b.onclick = () => document.body.classList.remove('nav-open'));
  document.body.classList.remove('nav-open');
}


function bindTopbarScrollBehavior() {
  const topbar = qs('.topbar');
  if (!topbar || topbar.dataset.scrollBound === '1') return;

  topbar.dataset.scrollBound = '1';
  let lastY = Math.max(0, window.scrollY || 0);
  let ticking = false;

  const updateTopbar = () => {
    const currentY = Math.max(0, window.scrollY || 0);
    const delta = currentY - lastY;

    // Sempre mostra no topo da página.
    if (currentY <= 8) {
      topbar.classList.remove('topbar-hidden');
      topbar.classList.add('topbar-showing');
    } else if (delta > 4) {
      // Descendo: esconde a topbar.
      topbar.classList.add('topbar-hidden');
      topbar.classList.remove('topbar-showing');
    } else if (delta < -4) {
      // Subindo: mostra novamente.
      topbar.classList.remove('topbar-hidden');
      topbar.classList.add('topbar-showing');
    }

    lastY = currentY;
    ticking = false;
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateTopbar);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

function bindTabContent() {
  const searchInput = qs('#searchInput'); if (searchInput) searchInput.oninput = e => { state.filters.search = e.target.value; render(); };
  const statusFilter = qs('#statusFilter'); if (statusFilter) statusFilter.onchange = e => { state.filters.status = e.target.value; render(); };
  qsa('[data-print]').forEach(btn => btn.onclick = () => printType(btn.dataset.print));
  const openManual = qs('[data-open-manual]'); if (openManual) openManual.onclick = () => openManualMovementModal();
  const newVehicle = qs('[data-new-vehicle]'); if (newVehicle) newVehicle.onclick = () => openVehicleModal();
  const newOccurrence = qs('[data-new-occurrence]'); if (newOccurrence) newOccurrence.onclick = () => openOccurrenceModal();
  qsa('[data-edit-vehicle]').forEach(btn => btn.onclick = () => openVehicleModal(state.vehicles.find(v => v.id === btn.dataset.editVehicle)));
  qsa('[data-delete-vehicle]').forEach(btn => btn.onclick = () => deleteVehicle(btn.dataset.deleteVehicle));
  qsa('[data-history-vehicle]').forEach(btn => btn.onclick = () => { state.vehicleHistoryFilters.veiculo = btn.dataset.historyVehicle || 'todos'; state.tab = 'historico'; render(); });
  qsa('[data-history-filter]').forEach(input => {
    const applyHistoryFilter = e => { state.vehicleHistoryFilters[e.target.name] = e.target.value; render(); };
    input.onchange = applyHistoryFilter;
    if (input.tagName === 'INPUT') input.oninput = applyHistoryFilter;
  });
  const clearHistory = qs('[data-clear-history-filters]'); if (clearHistory) clearHistory.onclick = () => { state.vehicleHistoryFilters = { veiculo:'todos', status:'todos', search:'' }; render(); };
  const printHistory = qs('[data-print-history]'); if (printHistory) printHistory.onclick = printVehicleHistory;
  qsa('[data-return-manual]').forEach(btn => btn.onclick = () => openReturnModal(btn.dataset.returnManual));
  qsa('[data-route-details]').forEach(btn => btn.onclick = () => openRouteDetailsModal(btn.dataset.routeDetails));
  qsa('[data-view-delivery-evidence]').forEach(btn => btn.onclick = () => openDeliveryEvidenceModal(btn.dataset.viewDeliveryEvidence));
  qsa('[data-view-delivery-photo]').forEach(btn => btn.onclick = () => openDeliveryPhotoModal(btn.dataset.viewDeliveryPhoto));
  qsa('[data-print-movement]').forEach(btn => btn.onclick = () => printMovement(btn.dataset.printMovement));
  qsa('[data-edit-occurrence]').forEach(btn => btn.onclick = () => openOccurrenceModal(state.occurrences.find(o => o.id === btn.dataset.editOccurrence)));
  qsa('[data-resolve-occurrence]').forEach(btn => btn.onclick = () => resolveOccurrence(btn.dataset.resolveOccurrence));
  qsa('[data-delete-occurrence]').forEach(btn => btn.onclick = () => deleteOccurrence(btn.dataset.deleteOccurrence));
  qsa('[data-report-filter]').forEach(input => input.onchange = e => { state.reportFilters[e.target.name] = e.target.value; render(); });
  const clearReport = qs('[data-clear-report-filters]'); if (clearReport) clearReport.onclick = clearReportFilters;
  const exportReportPdf = qs('[data-export-report-pdf]'); if (exportReportPdf) exportReportPdf.onclick = printReport;
  const exportReportCsv = qs('[data-export-report-csv]'); if (exportReportCsv) exportReportCsv.onclick = exportReportCSV;
  const dashboardPeriod = qs('[data-dashboard-period]'); if (dashboardPeriod) dashboardPeriod.onchange = e => { state.dashboardFilters.periodo = e.target.value; render(); };
  qsa('[data-maint-filter]').forEach(el => {
    const h = () => { state.maintFilters[el.name] = el.value; const box = qs('#maintList'); if (box) { box.innerHTML = maintListHtml(); bindTabContent(); } };
    el.oninput = h; el.onchange = h;
  });
  const maintClear = qs('[data-maint-clear]'); if (maintClear) maintClear.onclick = () => { state.maintFilters = { search:'', status:'todos', tipo:'todos', from:'', to:'', sort:'data_desc' }; render(); };
  const newMaint = qs('[data-new-maint]'); if (newMaint) newMaint.onclick = () => openMaintenanceModal();
  qsa('[data-maint-open]').forEach(b => b.onclick = () => openMaintenanceDetails(b.dataset.maintOpen));
  qsa('[data-maint-edit]').forEach(b => b.onclick = () => openMaintenanceModal(state.maintenances.find(m => m.id === b.dataset.maintEdit)));
  const userSearch = qs('[data-user-search]'); if (userSearch) userSearch.oninput = () => { state.userSearch = userSearch.value; const box = qs('#userList'); if (box) { box.innerHTML = usersListHtml(); bindTabContent(); } };
  const newUser = qs('[data-new-user]'); if (newUser) newUser.onclick = () => openUserModal();
  qsa('[data-user-edit]').forEach(b => b.onclick = () => openUserModal(state.users.find(u => u.id === b.dataset.userEdit)));
  qsa('[data-user-toggle]').forEach(b => b.onclick = async () => {
    const u = state.users.find(x => x.id === b.dataset.userToggle); if (!u) return;
    try { await DB.saveUser({id:u.id, nome:u.nome, login:u.login, perfil:u.perfil, status: u.status === 'ativo' ? 'inativo' : 'ativo'}); toast('Status atualizado.'); render(); } catch (err) { toast(dbWriteError(err)); }
  });
  qsa('[data-user-delete]').forEach(b => b.onclick = async () => {
    const u = state.users.find(x => x.id === b.dataset.userDelete); if (!u) return;
    if (!confirm(`Excluir o usuário ${u.nome}?`)) return;
    try { await DB.removeUser(u.id); toast('Usuário excluído.'); render(); } catch (err) { toast(dbWriteError(err)); }
  });
  qsa('[data-audit-filter]').forEach(el => {
    const h = () => { state.auditFilters[el.name] = el.value; const box = qs('#auditList'); if (box) { box.innerHTML = auditListHtml(); bindTabContent(); } };
    el.oninput = h; el.onchange = h;
  });
  const auditClear = qs('[data-audit-clear]'); if (auditClear) auditClear.onclick = () => { state.auditFilters = { search:'', usuario:'todos', modulo:'todos', acao:'todos', from:'', to:'' }; render(); };
  const dashSearch = qs('[data-dash-search]');
  if (dashSearch) {
    const applyDash = () => {
      state.dashFilters = { search: dashSearch.value, modelo: 'todos' };
      const term = dashSearch.value.toLowerCase().trim();
      let visible = 0;
      qsa('[data-dash-row]').forEach(row => {
        const ok = !term || row.dataset.filterText.includes(term);
        row.hidden = !ok; if (ok) visible += 1;
      });
      const empty = qs('.dash-empty'); if (empty) empty.hidden = visible > 0;
    };
    dashSearch.oninput = applyDash; applyDash();
  }
  const newDriver = qs('[data-new-driver]'); if (newDriver) newDriver.onclick = () => openDriverModal();
  qsa('[data-edit-driver]').forEach(btn => btn.onclick = () => openDriverModal(state.drivers.find(d => d.id === btn.dataset.editDriver)));
  qsa('[data-delete-driver]').forEach(btn => btn.onclick = () => deleteDriver(btn.dataset.deleteDriver));
  const newClient = qs('[data-new-client]'); if (newClient) newClient.onclick = () => openClientModal();
  qsa('[data-edit-client]').forEach(btn => btn.onclick = () => openClientModal(state.clients.find(c => c.id === btn.dataset.editClient)));
  qsa('[data-delete-client]').forEach(btn => btn.onclick = () => deleteClient(btn.dataset.deleteClient));
  bindDriverSelectors();
  bindClientPickers();
}


function openModal(title, body) {
  const root = qs('#modalRoot') || document.body.appendChild(document.createElement('div'));
  root.id = 'modalRoot';
  root.innerHTML = `<div class="modal-backdrop open"><div class="modal"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close-modal>✕</button></div>${body}</div></div>`;
  requestAnimationFrame(() => document.dispatchEvent(new CustomEvent('controle:refreshDestinationMaps')));
  setTimeout(() => document.dispatchEvent(new CustomEvent('controle:refreshDestinationMaps')), 180);
  qs('[data-close-modal]').onclick = closeModal;
  qs('.modal-backdrop').onclick = e => { if (e.target.classList.contains('modal-backdrop')) closeModal(); };
}
function closeModal() { const root = qs('#modalRoot'); if (root) root.innerHTML = ''; }


function openDriverModal(driver={}, options={}) {
  openModal(driver.id ? 'Editar condutor' : 'Cadastrar condutor', `
    <form id="driverForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(driver.id || '')}">
      <div class="field full"><label>Nome</label><input name="nome" required value="${escapeHtml(driver.nome || '')}" placeholder="Nome completo"></div>
      <div class="field"><label>Matrícula</label><input name="matricula" value="${escapeHtml(driver.matricula || '')}" placeholder="Opcional"></div>
      <div class="field"><label>Setor</label><input name="setor" value="${escapeHtml(driver.setor || '')}" placeholder="Setor"></div>
      <div class="field"><label>Telefone</label><input name="telefone" value="${escapeHtml(driver.telefone || '')}" placeholder="WhatsApp ou telefone"></div>
      <div class="field"><label>Status</label><select name="status"><option value="ativo" ${driver.status!=='inativo'?'selected':''}>Ativo</option><option value="inativo" ${driver.status==='inativo'?'selected':''}>Inativo</option></select></div>
      <div class="field full"><label>Observação</label><textarea name="observacao">${escapeHtml(driver.observacao || '')}</textarea></div>
      <button class="btn primary full" type="submit">Salvar condutor</button>
    </form>`);
  qs('#driverForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const saved = await DB.saveDriver(data);
      closeModal();
      if (typeof options.onSaved === 'function') {
        await options.onSaved(saved);
      } else {
        toast('Condutor salvo.');
        render();
      }
    } catch (err) { toast('Não foi possível salvar o condutor.'); }
  };
}
function openDriverSelfRegistrationModal(targetBox=null) {
  openDriverModal({}, targetBox ? {
    onSaved: async saved => {
      setDriverSelection(targetBox, saved);
      toast('Condutor cadastrado e selecionado.');
      saveDriverProgress();
    }
  } : {});
}
async function deleteDriver(id) {
  if (!confirm('Excluir este condutor?')) return;
  try { await DB.removeDriver(id); toast('Condutor excluído.'); render(); } catch (err) { toast('Não foi possível excluir.'); }
}
function openClientModal(client={}) {
  openModal(client.id ? 'Editar cliente' : 'Cadastrar cliente', `
    <form id="clientForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(client.id || '')}">
      <div class="field full"><label>Cliente</label><input name="nome" required value="${escapeHtml(client.nome || '')}" placeholder="Nome do cliente"></div>
      <div class="field"><label>Telefone</label><input name="telefone" value="${escapeHtml(client.telefone || '')}" placeholder="Opcional"></div>
      <div class="field"><label>Status</label><select name="status"><option value="ativo" ${client.status!=='inativo'?'selected':''}>Ativo</option><option value="inativo" ${client.status==='inativo'?'selected':''}>Inativo</option></select></div>
      ${destinationPickerHtml({label:'Endereço / ponto do cliente', placeholder:'Digite o endereço do cliente ou marque o ponto no mapa', context:'cliente', autoSave:false, required:false, helper:'Busque pelo endereço do cliente ou toque no mapa para salvar o ponto de atendimento.'})}
      <div class="field full"><label>Observação</label><textarea name="observacao">${escapeHtml(client.observacao || '')}</textarea></div>
      <button class="btn primary full" type="submit">Salvar cliente</button>
    </form>`);
  const form = qs('#clientForm');
  const dest = qs('[name="destino"]', form); if (dest) dest.value = client.endereco || '';
  const lat = qs('[name="destino_lat"]', form); if (lat) lat.value = client.lat || '';
  const lng = qs('[name="destino_lng"]', form); if (lng) lng.value = client.lng || '';
  const waze = qs('[name="destino_waze_url"]', form); if (waze) waze.value = client.waze_url || '';
  const maps = qs('[name="destino_maps_url"]', form); if (maps) maps.value = client.maps_url || '';
  initDestinationPickers(form);
  refreshDestinationMaps(form);
  setTimeout(() => refreshDestinationMaps(form), 250);
  setTimeout(() => refreshDestinationMaps(form), 700);
  form.onsubmit = async e => {
    e.preventDefault();
    const raw = sanitizeDestinationFormData(Object.fromEntries(new FormData(e.currentTarget).entries()));
    const data = {...raw, endereco: raw.destino || ''};
    try { await DB.saveClient(data); closeModal(); toast('Cliente salvo.'); render(); } catch (err) { toast('Não foi possível salvar o cliente.'); }
  };
}
async function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  try { await DB.removeClient(id); toast('Cliente excluído.'); render(); } catch (err) { toast('Não foi possível excluir.'); }
}
function driverDisplay(d={}) {
  return `${d.nome || 'Condutor'}${d.matricula ? ' • ' + d.matricula : ''}${d.setor ? ' • ' + d.setor : ''}`;
}
function setDriverSelection(box, driver=null, manual=false) {
  if (!box) return;
  const idField = qs('[data-driver-id-hidden]', box);
  const nameField = qs('[data-driver-name-hidden]', box);
  const matriculaField = qs('[data-driver-matricula-hidden]', box);
  const selectedText = qs('[data-driver-selected-text]', box);
  const summary = qs('[data-driver-selected-summary]', box);
  const manualField = box.nextElementSibling?.matches?.('[data-driver-manual-field]') ? box.nextElementSibling : null;
  const manualInput = manualField ? qs('[name="motorista_manual"]', manualField) : null;
  if (manual) {
    if (idField) idField.value = '';
    if (nameField) nameField.value = '';
    if (matriculaField) matriculaField.value = '';
    if (manualField) manualField.style.display = '';
    if (selectedText) selectedText.textContent = 'Outro condutor';
    if (summary) summary.textContent = 'Digite o nome abaixo ou cadastre o condutor.';
    setTimeout(() => manualInput?.focus(), 80);
    return;
  }
  if (driver) {
    if (idField) idField.value = driver.id || '';
    if (nameField) nameField.value = driver.nome || '';
    if (matriculaField) matriculaField.value = driver.matricula || '';
    if (manualInput) manualInput.value = '';
    if (manualField) manualField.style.display = 'none';
    if (selectedText) selectedText.textContent = driver.nome || 'Condutor selecionado';
    if (summary) summary.textContent = [driver.matricula, driver.setor, driver.telefone].filter(Boolean).join(' • ') || 'Condutor selecionado para a retirada.';
    return;
  }
  if (idField) idField.value = '';
  if (nameField) nameField.value = '';
  if (matriculaField) matriculaField.value = '';
  if (selectedText) selectedText.textContent = activeDrivers().length ? 'Nenhum condutor selecionado' : 'Nenhum condutor cadastrado';
  if (summary) summary.textContent = activeDrivers().length ? 'Clique para escolher em uma tabela.' : 'Cadastre o condutor ou use a opção Outros.';
}
function updateDriverSelectorVisual(box) {
  if (!box) return;
  const idField = qs('[data-driver-id-hidden]', box);
  const nameField = qs('[data-driver-name-hidden]', box);
  const selected = activeDrivers().find(d => d.id === idField?.value);
  if (selected) setDriverSelection(box, selected);
  else if (nameField?.value) setDriverSelection(box, {id: idField?.value || '', nome: nameField.value, matricula: qs('[data-driver-matricula-hidden]', box)?.value || ''});
  else setDriverSelection(box, null, false);
}
function openDriverPickerModal(box) {
  const drivers = activeDrivers();
  openModal('Escolher condutor', `
    <div class="driver-picker-modal">
      <div class="driver-picker-toolbar">
        <input class="driver-picker-search" data-driver-picker-search placeholder="Buscar por nome, matrícula, setor ou telefone">
        <button class="btn" type="button" data-driver-picker-register>Cadastrar condutor</button>
      </div>
      ${drivers.length ? `<div class="table-wrap driver-picker-table"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Telefone</th><th>Ação</th></tr></thead><tbody>
        ${drivers.map(d => `<tr data-driver-row data-search="${escapeHtml([d.nome,d.matricula,d.setor,d.telefone].join(' ').toLowerCase())}">
          <td><strong>${escapeHtml(d.nome || '—')}</strong></td>
          <td>${escapeHtml(d.matricula || '—')}</td>
          <td>${escapeHtml(d.setor || '—')}</td>
          <td>${escapeHtml(d.telefone || '—')}</td>
          <td><button class="btn small primary" type="button" data-driver-pick="${escapeHtml(d.id)}">Selecionar</button></td>
        </tr>`).join('')}
      </tbody></table></div>` : `<div class="empty">Nenhum condutor cadastrado ainda.</div>`}
      <div class="driver-picker-footer">
        <button class="btn" type="button" data-driver-picker-other>Outros</button>
        <span class="muted">Use “Outros” somente quando o condutor ainda não estiver cadastrado.</span>
      </div>
    </div>`);
  const search = qs('[data-driver-picker-search]');
  if (search) search.oninput = e => {
    const term = e.target.value.trim().toLowerCase();
    qsa('[data-driver-row]').forEach(row => row.style.display = row.dataset.search.includes(term) ? '' : 'none');
  };
  qsa('[data-driver-pick]').forEach(btn => btn.onclick = () => {
    const driver = activeDrivers().find(d => d.id === btn.dataset.driverPick);
    if (!driver) return;
    setDriverSelection(box, driver);
    closeModal();
    saveDriverProgress();
  });
  const other = qs('[data-driver-picker-other]');
  if (other) other.onclick = () => { setDriverSelection(box, null, true); closeModal(); saveDriverProgress(); };
  const register = qs('[data-driver-picker-register]');
  if (register) register.onclick = () => openDriverSelfRegistrationModal(box);
}
function bindDriverSelectors(root=document) {
  qsa('[data-driver-selector]', root).forEach(box => {
    if (box.dataset.driverPickerReady !== '1') {
      box.dataset.driverPickerReady = '1';
      const openBtn = qs('[data-open-driver-picker]', box);
      if (openBtn) openBtn.onclick = e => { e.preventDefault(); openDriverPickerModal(box); };
    }
    updateDriverSelectorVisual(box);
  });
  qsa('[data-self-register-driver]', root).forEach(btn => btn.onclick = e => {
    e.preventDefault();
    const targetBox = btn.closest('form') ? qs('[data-driver-selector]', btn.closest('form')) : null;
    openDriverSelfRegistrationModal(targetBox);
  });
}
function bindClientPickers(root=document) {
  qsa('[data-client-picker]', root).forEach(box => {
    const select = qs('[data-client-select]', box);
    const hidden = qs('[data-client-name-hidden]', box);
    if (!select) return;
    const form = box.closest('form') || document;
    const apply = () => {
      const client = state.clients.find(c => c.id === select.value);
      if (hidden) hidden.value = client?.nome || '';
      if (!client) return;
      const dest = clientToDestination(client);
      const destinationInput = qs('[data-destination-input]', form);
      const lat = qs('[data-destination-lat]', form);
      const lng = qs('[data-destination-lng]', form);
      const waze = qs('[data-destination-waze]', form);
      const maps = qs('[data-destination-maps]', form);
      if (destinationInput) destinationInput.value = dest.destino || '';
      if (lat) lat.value = dest.destino_lat || '';
      if (lng) lng.value = dest.destino_lng || '';
      if (waze) waze.value = dest.destino_waze_url || '';
      if (maps) maps.value = dest.destino_maps_url || '';
      if (destinationInput) destinationInput.dispatchEvent(new Event('input', {bubbles:true}));
      saveDriverProgress();
    };
    select.onchange = apply;
    if (select.value) apply();
  });
  qsa('[data-new-client-inline]', root).forEach(btn => btn.onclick = e => { e.preventDefault(); openClientModal(); });
}

function openVehicleModal(vehicle={}) {
  openModal(vehicle.id ? 'Editar veículo' : 'Cadastrar veículo', `
    <form id="vehicleForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(vehicle.id || '')}">
      <div class="field"><label>Placa</label><input name="placa" required value="${escapeHtml(vehicle.placa || '')}" placeholder="ABC1D23"></div>
      <div class="field"><label>Modelo</label><input name="modelo" required value="${escapeHtml(vehicle.modelo || '')}" placeholder="HB20, Argo, Mobi..."></div>
      <div class="field"><label>Ano</label><input name="ano" type="number" min="1900" max="2100" value="${escapeHtml(vehicle.ano || '')}" placeholder="2026"></div>
      <div class="field"><label>Renavam</label><input name="renavam" value="${escapeHtml(vehicle.renavam || '')}" placeholder="Opcional"></div>
      <div class="field"><label>Contrato</label><input name="contrato" value="${escapeHtml(vehicle.contrato || '')}" placeholder="Localiza, próprio..."></div>
      <div class="field"><label>Status</label><select name="status"><option value="disponivel">Disponível</option><option value="manutencao" ${vehicle.status==='manutencao'?'selected':''}>Manutenção</option><option value="ocorrencia" ${vehicle.status==='ocorrencia'?'selected':''}>Ocorrência</option></select></div>
      <div class="field full"><label>Observação</label><textarea name="observacao">${escapeHtml(vehicle.observacao || '')}</textarea></div>
      <button class="btn primary full" type="submit">Salvar veículo</button>
    </form>`);
  qs('#vehicleForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await DB.saveVehicle(data); closeModal(); toast('Veículo salvo.'); render(); } catch (err) { toast(userMessage(err, 'Erro ao salvar.')); }
  };
}
async function deleteVehicle(id) {
  if (!confirm('Excluir este veículo?')) return;
  try { await DB.removeVehicle(id); toast('Veículo excluído.'); render(); } catch (err) { toast(userMessage(err, 'Não foi possível excluir.')); }
}
function openManualMovementModal() {
  openModal('Registrar saída manual', `<form id="manualMovementForm" class="form-grid">${driverWithdrawalForm().replace(/<button class="btn ghost" data-back-driver>.*?<\/button>/,'').replace('<h2>Retirada de veículo</h2>','').replace('<p class="muted">Selecione o veículo e preencha seus dados.</p>','').replace('Confirmar retirada','Registrar saída')}</form>`.replace('<form id="withdrawalForm" class="form-grid">','').replace('</form>',''));
  const form = qs('#manualMovementForm');
  form.onsubmit = handleManualWithdrawal;
  bindDriverSelectors(form);
  bindClientPickers(form);
  initDestinationPickers(form);
  initSignaturePads(form);
}
async function handleManualWithdrawal(e) {
  e.preventDefault();
  if (!validateSignatures(e.currentTarget)) return toast('Assine no campo indicado antes de registrar a saída.');
  const data = normalizeMovementDriverData(sanitizeDestinationFormData(Object.fromEntries(new FormData(e.currentTarget).entries())));
  if (!data.motorista?.trim()) return toast('Informe o condutor.');
  if (!selectedClientName(data) && !data.cliente_nome) return toast('Selecione ou cadastre o primeiro cliente da rota.');
  try {
    if (data.assinatura_saida_url) data.assinatura_saida_url = await uploadSignatureDataUrl('retiradas', data.assinatura_saida_url);
    const m = await DB.createMovement(data); closeModal(); toast(`Saída registrada: ${m.numero_uso}`); render();
  } catch (err) { toast(userMessage(err, 'Erro ao registrar.')); }
}
function openReturnModal(id) {
  const m = state.movements.find(x => x.id === id);
  if (!m) return;
  openModal('Registrar entrega do veículo', `
    <p class="muted">${escapeHtml(m.numero_uso)} • ${escapeHtml(m.placa)} • ${escapeHtml(m.motorista)}</p>
    <form id="returnManualForm" class="form-grid">
      <div class="field"><label>Hora da entrega</label><input type="time" name="hora_chegada" required value="${currentTimeValue()}"></div>
      <div class="field full"><label>Observação</label><textarea name="observacao_chegada"></textarea></div>
      ${signaturePadHtml('assinatura_entrega_url', {label: 'Assinatura de quem está devolvendo', required: false, hint: 'Se o condutor estiver presente, colete a assinatura aqui.'})}
      <button class="btn primary full" type="submit">Confirmar entrega</button>
    </form>`);
  initSignaturePads(qs('#modalRoot'));
  qs('#returnManualForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      if (data.assinatura_entrega_url) data.assinatura_entrega_url = await uploadSignatureDataUrl(`entregas/${id}`, data.assinatura_entrega_url);
      await DB.closeMovement(id, data); closeModal(); toast('Entrega registrada.'); render();
    } catch (err) { toast(userMessage(err, 'Erro ao registrar entrega.')); }
  };
}

async function resolveOccurrence(id) {
  const occurrence = state.occurrences.find(o => o.id === id);
  if (!occurrence) return;
  try { await DB.saveOccurrence({...occurrence, status:'resolvida'}); toast('Ocorrência resolvida.'); render(); } catch (err) { toast(userMessage(err, 'Erro ao resolver.')); }
}
async function deleteOccurrence(id) {
  if (!confirm('Excluir esta ocorrência?')) return;
  try { await DB.removeOccurrence(id); toast('Ocorrência excluída.'); render(); } catch (err) { toast(userMessage(err, 'Erro ao excluir.')); }
}
function openOccurrenceModal(occurrence={}) {
  const refs = [
    ...state.movements.slice(0, 80).map(m => [`mov:${m.id}`, `${m.numero_uso} • ${m.placa} • ${m.motorista}`]),
    ...state.vehicles.map(v => [`veh:${v.id}`, `${v.placa} • ${v.modelo}`])
  ];
  const selectedRef = occurrence.movimento_id ? `mov:${occurrence.movimento_id}` : (occurrence.veiculo_id ? `veh:${occurrence.veiculo_id}` : '');
  openModal(occurrence.id ? 'Editar ocorrência' : 'Nova ocorrência', `
    <form id="occurrenceForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(occurrence.id || '')}">
      <div class="field full"><label>Registro ou veículo relacionado</label><select name="referencia"><option value="">Sem vínculo</option>${refs.map(([v,l]) => `<option value="${escapeHtml(v)}" ${selectedRef===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo</label><select name="tipo"><option ${occurrence.tipo==='Avaria'?'selected':''}>Avaria</option><option ${occurrence.tipo==='Multa informada'?'selected':''}>Multa informada</option><option ${occurrence.tipo==='Veículo sujo'?'selected':''}>Veículo sujo</option><option ${occurrence.tipo==='Problema mecânico'?'selected':''}>Problema mecânico</option><option ${occurrence.tipo==='Outro'?'selected':''}>Outro</option></select></div>
      <div class="field"><label>Prioridade</label><select name="prioridade"><option value="baixa" ${occurrence.prioridade==='baixa'?'selected':''}>Baixa</option><option value="media" ${!occurrence.prioridade || occurrence.prioridade==='media'?'selected':''}>Média</option><option value="alta" ${occurrence.prioridade==='alta'?'selected':''}>Alta</option></select></div>
      <div class="field"><label>Status</label><select name="status"><option value="aberta" ${!occurrence.status || occurrence.status==='aberta'?'selected':''}>Aberta</option><option value="em_andamento" ${occurrence.status==='em_andamento'?'selected':''}>Em andamento</option><option value="resolvida" ${occurrence.status==='resolvida'?'selected':''}>Resolvida</option></select></div>
      <div class="field full"><label>Descrição da ocorrência</label><textarea name="descricao" required placeholder="Descreva o ocorrido para o controle">${escapeHtml(occurrence.descricao || '')}</textarea></div>
      <button class="btn primary full" type="submit">Salvar ocorrência</button>
    </form>`);
  qs('#occurrenceForm').onsubmit = async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await DB.saveOccurrence(data); closeModal(); toast('Ocorrência salva.'); render(); } catch (err) { toast(userMessage(err, 'Erro ao salvar ocorrência.')); }
  };
}



function printType(type) {
  if (type === 'relatorio') return printReport();
}
function printMovement(id) {
  const m = state.movements.find(x => x.id === id);
  if (!m) return;
  printHtml(movementPrintHtml(m));
}
function printHtml(html) {
  let printNode = qs('#printRoot');
  if (!printNode) { printNode = document.createElement('div'); printNode.id = 'printRoot'; document.body.appendChild(printNode); }
  printNode.innerHTML = `<div class="print-page">${html}</div>`;
  setTimeout(() => window.print(), 50);
}
function printHeader(title, subtitle='') {
  return `<div class="print-title"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}<p>Data de impressão: ${new Date().toLocaleString('pt-BR')}</p></div><div style="display:flex;align-items:center;gap:10px"><img src="./assets/images/logo-exemplo.png" alt="Distribuidora Exemplo" style="width:56px;height:56px;object-fit:contain" /><strong>Controle de Frota Comercial</strong></div></div>`;
}
function movementPrintHtml(m) {
  return `${printHeader('Ficha de retirada e entrega de veículo', `Uso ${escapeHtml(m.numero_uso)}`)}
    <table><tbody>
      <tr><th>Nº do uso</th><td>${escapeHtml(m.numero_uso)}</td><th>Data</th><td>${dateBR(m.saida_at)}</td></tr>
      <tr><th>Condutor</th><td colspan="3">${escapeHtml(m.motorista)}</td></tr>
      <tr><th>Placa</th><td>${escapeHtml(m.placa)}</td><th>Modelo</th><td>${escapeHtml(m.modelo)}</td></tr>
      <tr><th>Saída</th><td>${timeBR(m.saida_at)}</td><th>Chegada</th><td>${m.chegada_at ? timeBR(m.chegada_at) : ''}</td></tr>
      <tr><th>Status</th><td>${escapeHtml(m.status)}</td><th>Cliente / rota</th><td>${escapeHtml(movementRoutePlainText(m))}</td></tr>
      <tr><th>Observações</th><td colspan="3">${escapeHtml([m.observacao_saida,m.observacao_chegada].filter(Boolean).join(' | '))}</td></tr>
    </tbody></table>
    <div class="print-signatures">
      <div><span>Assinatura na retirada</span>${m.assinatura_saida_url ? `<img src="${escapeHtml(m.assinatura_saida_url)}" alt="Assinatura na retirada">` : '<div class="print-signature-empty">Não assinada</div>'}</div>
      <div><span>Assinatura na devolução</span>${m.assinatura_entrega_url ? `<img src="${escapeHtml(m.assinatura_entrega_url)}" alt="Assinatura na devolução">` : '<div class="print-signature-empty">Não assinada</div>'}</div>
    </div>`;
}

window.addEventListener('pagehide', () => saveDriverProgress());
window.addEventListener('beforeunload', () => saveDriverProgress());

document.addEventListener('click', ev => {
  const routeLink = ev.target.closest('[data-route-provider]');
  if (!routeLink) return;
  ev.preventDefault();
  saveDriverProgress();
  openRouteLink(routeLink);
});

document.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-view-signature]');
  if (!btn) return;
  ev.preventDefault();
  openSignatureModal(btn.dataset.viewSignature, btn.dataset.viewSignatureLabel);
});

// Comprovações são criadas dinamicamente dentro do modal de detalhes da rota.
// Por isso, o clique precisa ser delegado ao document para continuar funcionando
// mesmo depois que o conteúdo do modal for inserido no DOM.
document.addEventListener('click', ev => {
  const evidenceBtn = ev.target.closest('[data-view-delivery-evidence]');
  if (evidenceBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    openDeliveryEvidenceModal(evidenceBtn.dataset.viewDeliveryEvidence);
    return;
  }

  const photoBtn = ev.target.closest('[data-view-delivery-photo]');
  if (photoBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    openDeliveryPhotoModal(photoBtn.dataset.viewDeliveryPhoto);
  }
});

init();
