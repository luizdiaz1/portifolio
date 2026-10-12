/**
 * assets/js/app.js
 * Roteador simples baseado em hash + renderização de navegação lateral.
 * Cada módulo expõe `render(container, params)` e é chamado pelo router.
 */

const NAV_ITEMS = [
  { route: 'dashboard', icon: '▦', label: 'Dashboard' },
  { route: 'vistorias', icon: '📋', label: 'Vistorias' },
  { route: 'nao-conformidades', icon: '⚠', label: 'Não Conformidades' },
  { route: 'acompanhamento', icon: '🎯', label: 'Acompanhamento' },
  { route: 'evidencias', icon: '🖼', label: 'Evidências' },
  { route: 'relatorios', icon: '📄', label: 'Relatórios' },
  { route: 'auditorias-10s', icon: '✔', label: 'Auditorias 10S' },
  { route: 'alertas', icon: '🔔', label: 'Central de Alertas', badgeKey: 'total' },
  { route: 'usuarios', icon: '👥', label: 'Usuários', adminOnly: true },
  { route: 'auditoria', icon: '🛡', label: 'Log de atividades', adminOnly: true },
];

const TITLES = {
  dashboard: ['Dashboard', 'Visão geral das vistorias e não conformidades'],
  vistorias: ['Vistorias', 'Lista, filtros e acompanhamento das vistorias realizadas'],
  'nao-conformidades': ['Não Conformidades', 'Todas as NCs cadastradas, independente da vistoria'],
  acompanhamento: ['Acompanhamento', 'Ações corretivas em andamento'],
  evidencias: ['Evidências', 'Fotos cadastradas em todas as vistorias'],
  relatorios: ['Relatórios', 'Vistorias e auditorias 10S · visualização, impressão A4 e compartilhamento'],
  alertas: ['Central de Alertas', 'Pontos que exigem atenção imediata'],
  usuarios: ['Usuários', 'Cadastro de usuários e perfis de acesso'],
  'auditorias-10s': ['Auditorias 10S', 'Checklist dos 10 sensos, plano de ação e nota do prefeito'],
  auditoria: ['Log de atividades', 'Registro de acessos e alterações feitas no sistema'],
};

const Router = {
  current: { route: 'dashboard', params: {} },

  parse() {
    const hash = location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);
    const route = parts[0] || 'dashboard';
    const params = { id: parts[1] || null, extra: parts[2] || null };
    return { route, params };
  },

  navigate(path) {
    location.hash = path.startsWith('/') ? path : '/' + path;
  },

  async resolve() {
    const { route, params } = this.parse();

    // Rotas restritas: o banco já recusa, aqui só evitamos abrir a tela.
    if (['usuarios', 'auditoria'].includes(route) && !Auth.ehAdmin()) {
      this.navigate('dashboard');
      return;
    }
    if (route === 'vistorias' && params.id === 'nova' && !Auth.podeEscrever()) {
      this.navigate('vistorias');
      return;
    }

    // Redesenho da MESMA tela (tempo real, salvar campo): mantém a posição de rolagem.
    // Navegação para outra tela começa do topo, como antes.
    const mesmaTela = JSON.stringify(this.current) === JSON.stringify({ route, params });
    const rolagem = mesmaTela ? window.scrollY : 0;

    this.current = { route, params };
    Edicao.sincronizar(route, params);
    this._updateNav(route);
    this._updateTopbar(route, params);
    const container = Utils.qs('view-root');
    container.innerHTML = '';

    const modules = {
      dashboard: DashboardModule,
      vistorias: VistoriasModule,
      'nao-conformidades': NCModule,
      acompanhamento: AcompanhamentoModule,
      evidencias: EvidenciasModule,
      relatorios: RelatoriosModule,
      usuarios: UsuariosModule,
      auditoria: AuditoriaModule,
      'auditorias-10s': Auditorias10SModule,
      alertas: DashboardModule.renderAlertas ? DashboardModule : null,
    };

    if (route === 'alertas') {
      DashboardModule.renderAlertasFull(container);
      return;
    }

    const mod = modules[route];
    if (mod && mod.render) {
      mod.render(container, params);
    } else {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Página não encontrada</h3></div>`;
    }

    if (mesmaTela) window.scrollTo(0, rolagem);

    // Fecha sidebar mobile ao navegar
    Utils.qs('sidebar').classList.remove('open');
  },

  _updateNav(route) {
    const alertCount = AlertsEngine.gerar().length;
    const nav = Utils.qs('sidebar-nav');
    nav.innerHTML = NAV_ITEMS.filter((item) => !item.adminOnly || Auth.ehAdmin()).map((item) => {
      const active = route === item.route ? 'active' : '';
      const badge =
        item.badgeKey && alertCount > 0 ? `<span class="nav-badge">${alertCount}</span>` : '';
      return `<div class="nav-item ${active}" data-route="${item.route}">
        <span class="nav-icon">${item.icon}</span>
        <span>${item.label}</span>
        ${badge}
      </div>`;
    }).join('');
    nav.querySelectorAll('.nav-item').forEach((el) => {
      el.addEventListener('click', () => Router.navigate(el.dataset.route));
    });
  },

  _updateTopbar(route, params) {
    const base = TITLES[route] || ['Qualidade 10S', ''];
    let title = base[0];
    let sub = base[1];
    if (route === 'vistorias' && params.id === 'nova') { title = 'Nova Vistoria'; sub = 'Cadastro completo em etapas'; }
    if (route === 'vistorias' && params.id && params.id !== 'nova') { title = 'Detalhes da Vistoria'; sub = 'Edição e acompanhamento'; }
    if (route === 'auditorias-10s' && params.id) {
      const a = Auditorias10SQuery.obter(params.id);
      title = a ? `${a.rodada}ª auditoria · Área ${a.area_numero ?? '?'}` : 'Auditoria 10S';
      sub = 'Checklist, plano de ação e nota do prefeito';
      if (params.extra === 'relatorio') sub = 'Relatório oficial · impressão A4 · salvar em PDF';
    }
    if (route === 'relatorios' && params.id && !['vistorias', 'auditorias'].includes(params.id)) { title = 'Relatório de Vistoria'; sub = 'Visualização oficial · impressão A4 · compartilhamento'; }
    Utils.qs('topbar-title').textContent = title;
    Utils.qs('topbar-sub').textContent = sub;
  },
};

/** Abre o app já autenticado: carrega os dados, liga o tempo real e desenha a tela. */
async function iniciarApp() {
  Utils.qs('login-screen').classList.add('hidden');
  Utils.qs('app-shell').classList.remove('hidden');
  Auth.aplicarPerfil();

  // Carrega os dados reais do Supabase antes de desenhar a tela e liga a
  // assinatura de tempo real (mudanças de outros usuários chegam sozinhas).
  await window.QualidadeDB.pullAll();
  window.QualidadeDB.subscribeRealtime();
  Auth.assinarMeuPerfil();

  window.addEventListener('hashchange', () => Router.resolve());
  Router.resolve();

  Utils.qs('menu-toggle').addEventListener('click', () => Utils.qs('sidebar').classList.toggle('open'));
  Utils.qs('btn-sair').addEventListener('click', () => Auth.sair());
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.QualidadeDB || !window.QualidadeDB.enabled) {
    // Supabase ainda não configurado: mostra um aviso claro em vez de abrir
    // um app "vazio" sem persistência nenhuma.
    Utils.qs('app-shell').classList.remove('hidden');
    Utils.qs('view-root').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔌</div>
        <h3>Supabase não configurado</h3>
        <p>Preencha SUPABASE_URL e SUPABASE_ANON_KEY em <code>database/supabase.js</code>
        (veja o README) para conectar o sistema ao banco de dados.</p>
      </div>`;
    return;
  }

  // Sem sessão válida (ou usuário inativo): tela de login. Com sessão: abre direto.
  const perfil = await Auth.iniciar();
  if (!perfil) {
    Auth.mostrarLogin(iniciarApp);
    return;
  }
  await iniciarApp();
});
