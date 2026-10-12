/**
 * assets/js/auth.js
 * ---------------------------------------------------------
 * Login (Supabase Auth) + perfil de acesso do usuário logado.
 *
 * Perfis:
 *   - admin     : lê e altera tudo, gerencia usuários, vê a auditoria;
 *   - visitante : somente leitura (não cria, edita nem exclui).
 *
 * A regra REAL de acesso está no banco (RLS, ver
 * database/sql/auth-auditoria.sql). Aqui a tela apenas esconde /
 * desabilita o que o perfil não pode usar, para não induzir a erro.
 * ---------------------------------------------------------
 */

// Campos e botões de escrita que o visitante não pode usar. Esconder por CSS
// (body.role-visitante, ver main.css) cobre os botões; os campos são
// desabilitados aqui, a cada redesenho da tela.
const CONTROLES_SOMENTE_LEITURA = [
  '#d-data', '#d-area', '#d-por', '#d-setor', '#d-obs',
  '[data-f]', '[data-senso-real]', '[data-status-real]', '[data-ret]',
  '[data-set-status]', '[data-foto-real-input]',
  '[data-w]', '[data-nota]', // controles de escrita do módulo Auditorias 10S
].join(',');

/**
 * Modo de edição das telas de detalhe (vistoria e auditoria 10S).
 * As telas abrem TRAVADAS (só leitura); o administrador precisa clicar em
 * "Editar" para alterar qualquer coisa. Ao sair da tela, volta a travar.
 * Visitante nunca edita (continua valendo a regra de perfil abaixo).
 */
const Edicao = {
  aplicavel: false, // a tela atual é um detalhe que tem modo de edição
  ativo: false,     // o botão "Editar" foi acionado nesta tela
  chave: null,      // identifica a tela (ex.: "vistorias/<id>"); abas da mesma auditoria compartilham a chave
  _pendente: null,  // chave que deve abrir já em modo edição (botão "Editar" das listas, auditoria recém-criada)

  chaveDe(route, params) {
    if (route === 'vistorias' && params.id && params.id !== 'nova') return 'vistorias/' + params.id;
    if (route === 'auditorias-10s' && params.id && params.extra !== 'relatorio') return 'auditorias-10s/' + params.id;
    return null;
  },

  /** Chamado pelo Router a cada navegação / redesenho. */
  sincronizar(route, params) {
    const chave = this.chaveDe(route, params);
    this.aplicavel = !!chave;
    if (chave !== this.chave) {
      this.chave = chave;
      this.ativo = !!chave && this._pendente === chave && Auth.podeEscrever();
    }
    this._pendente = null;
    document.body.classList.toggle('view-travada', this.travado());
  },

  /** Faz a próxima abertura da tela `chave` já cair em modo edição. */
  pedir(chave) {
    if (Auth.podeEscrever()) this._pendente = chave;
  },

  travado() {
    return this.aplicavel && !this.ativo;
  },

  ligar() {
    if (!Auth.podeEscrever()) return;
    this.ativo = true;
    this._refletir();
  },

  desligar() {
    this.ativo = false;
    this._refletir();
  },

  _refletir() {
    document.body.classList.toggle('view-travada', this.travado());
    if (this.travado()) {
      Auth._forcarSomenteLeitura();
    } else if (Auth.podeEscrever()) {
      Utils.qs('view-root').querySelectorAll(CONTROLES_SOMENTE_LEITURA).forEach((el) => { el.disabled = false; });
    }
    this._pintarBarra();
  },

  barraHtml() {
    return `<div class="edicao-barra" id="edicao-barra">
      <span id="edicao-status"></span>
      <button type="button" class="btn btn-sm btn-primary" id="btn-edicao"></button>
    </div>`;
  },

  ligarBarra() {
    const btn = Utils.qs('btn-edicao');
    if (!btn) return;
    btn.addEventListener('click', () => (this.ativo ? this.desligar() : this.ligar()));
    this._pintarBarra();
  },

  _pintarBarra() {
    const btn = Utils.qs('btn-edicao');
    const txt = Utils.qs('edicao-status');
    const barra = Utils.qs('edicao-barra');
    if (!btn || !txt || !barra) return;
    barra.classList.toggle('editando', this.ativo);
    if (this.ativo) {
      txt.textContent = 'Modo edição — cada alteração é salva ao sair do campo.';
      btn.textContent = '✓ Concluir edição';
    } else {
      txt.textContent = 'Somente visualização — clique em Editar para fazer alterações.';
      btn.textContent = '✎ Editar';
    }
  },
};
window.Edicao = Edicao;

const ROTULO_PERFIL = { admin: 'Administrador', visitante: 'Visitante' };

const Auth = {
  perfil: null,
  _canal: null,
  _observer: null,
  _aviso: '',

  get client() {
    return window.QualidadeDB && window.QualidadeDB.client;
  },

  ehAdmin() {
    return !!this.perfil && this.perfil.ativo === true && this.perfil.role === 'admin';
  },

  podeEscrever() {
    return this.ehAdmin();
  },

  rotuloPerfil(role) {
    return ROTULO_PERFIL[role] || role;
  },

  // ---------------------------------------------------------
  // Sessão / perfil
  // ---------------------------------------------------------
  async _carregarPerfil() {
    const { data: sess } = await this.client.auth.getSession();
    const uid = sess && sess.session && sess.session.user && sess.session.user.id;
    if (!uid) return null;
    const { data, error } = await this.client.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) throw error;
    return data || null;
  },

  /** Chamado ao abrir o app. Retorna o perfil se já existe sessão válida e ativa. */
  async iniciar() {
    try {
      const { data } = await this.client.auth.getSession();
      if (!data || !data.session) return null;
      const perfil = await this._carregarPerfil();
      if (!perfil || !perfil.ativo) {
        this._aviso = perfil
          ? 'Seu acesso está desativado. Fale com um administrador.'
          : 'Seu usuário ainda não foi liberado. Fale com um administrador.';
        await this.client.auth.signOut();
        return null;
      }
      this.perfil = perfil;
      return perfil;
    } catch (err) {
      console.error('[Qualidade10S] Falha ao restaurar a sessão:', err);
      this._aviso = 'Não foi possível verificar seu acesso. Entre novamente.';
      try { await this.client.auth.signOut(); } catch (e) { /* ignora */ }
      return null;
    }
  },

  async entrar(email, senha, manterConectado = false) {
    // Define onde o SDK guardará os tokens ANTES de criar a sessão.
    if (window.SessaoStorage) window.SessaoStorage.definirLembrar(manterConectado);
    const { error } = await this.client.auth.signInWithPassword({ email, password: senha });
    if (error) {
      const msg = /invalid login credentials/i.test(error.message)
        ? 'E-mail ou senha incorretos.'
        : /email not confirmed/i.test(error.message)
          ? 'Este e-mail ainda não foi confirmado.'
          : 'Não foi possível entrar: ' + error.message;
      throw new Error(msg);
    }
    let perfil = null;
    try {
      perfil = await this._carregarPerfil();
    } catch (err) {
      await this.client.auth.signOut();
      throw new Error('Não foi possível carregar seu perfil. Tente novamente.');
    }
    if (!perfil || !perfil.ativo) {
      await this.client.auth.signOut();
      throw new Error(perfil
        ? 'Seu acesso está desativado. Fale com um administrador.'
        : 'Seu usuário ainda não foi liberado. Fale com um administrador.');
    }
    this.perfil = perfil;
    this._registrarEvento('login');
    return perfil;
  },

  async sair() {
    try { await this._registrarEvento('logout'); } catch (e) { /* segue o logout */ }
    try { await this.client.auth.signOut(); } catch (e) { /* ignora */ }
    // Recarrega: zera o cache em memória e o realtime, e cai na tela de login.
    window.location.hash = '';
    window.location.reload();
  },

  async _registrarEvento(acao) {
    const { error } = await this.client.rpc('registrar_evento', { p_acao: acao });
    if (error) console.warn('[Qualidade10S] Não foi possível registrar o evento na auditoria:', error.message);
  },

  // ---------------------------------------------------------
  // Tela de login
  // ---------------------------------------------------------
  mostrarLogin(aoEntrar) {
    Utils.qs('app-shell').classList.add('hidden');
    const tela = Utils.qs('login-screen');
    tela.classList.remove('hidden');

    const erro = Utils.qs('login-erro');
    const btn = Utils.qs('login-btn');
    const lembrar = Utils.qs('login-lembrar');
    if (lembrar && window.SessaoStorage) lembrar.checked = window.SessaoStorage.marcado();
    erro.textContent = this._aviso || '';
    erro.classList.toggle('hidden', !this._aviso);

    Utils.qs('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      erro.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      try {
        await this.entrar(
          Utils.qs('login-email').value.trim(),
          Utils.qs('login-senha').value,
          Utils.qs('login-lembrar').checked
        );
        tela.classList.add('hidden');
        await aoEntrar();
      } catch (err) {
        erro.textContent = err.message;
        erro.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });
    Utils.qs('login-email').focus();
  },

  // ---------------------------------------------------------
  // Perfil aplicado na interface
  // ---------------------------------------------------------
  aplicarPerfil() {
    const p = this.perfil;
    document.body.classList.toggle('role-admin', this.ehAdmin());
    document.body.classList.toggle('role-visitante', !this.ehAdmin());
    if (!p) return;

    Utils.qs('user-nome').textContent = p.nome;
    Utils.qs('user-role').textContent = this.rotuloPerfil(p.role);
    Utils.qs('user-role').className = 'user-role role-' + p.role;
    const badge = Utils.qs('topbar-perfil');
    badge.classList.toggle('hidden', this.ehAdmin());
    badge.textContent = 'Somente leitura';

    this._iniciarObserver();
    this._forcarSomenteLeitura();
  },

  /** Desabilita os campos de edição sempre que a tela é redesenhada (visitante). */
  _iniciarObserver() {
    if (this._observer) return;
    const root = Utils.qs('view-root');
    this._observer = new MutationObserver(() => this._forcarSomenteLeitura());
    this._observer.observe(root, { childList: true, subtree: true });
  },

  _forcarSomenteLeitura() {
    if (this.podeEscrever() && !Edicao.travado()) return;
    Utils.qs('view-root').querySelectorAll(CONTROLES_SOMENTE_LEITURA).forEach((el) => {
      if (!el.disabled) el.disabled = true;
    });
  },

  /** Se um administrador mudar o perfil (ou desativar) de quem está logado, vale na hora. */
  assinarMeuPerfil() {
    if (!this.client || !this.perfil || this._canal) return;
    const uid = this.perfil.id;
    this._canal = this.client
      .channel('q10s-meu-perfil')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        async () => {
          try {
            const novo = await this._carregarPerfil();
            if (!novo || !novo.ativo) {
              alert('Seu acesso foi desativado por um administrador.');
              return this.sair();
            }
            const mudouRole = novo.role !== this.perfil.role;
            this.perfil = novo;
            this.aplicarPerfil();
            if (mudouRole) {
              Utils.toast('Seu perfil agora é: ' + this.rotuloPerfil(novo.role) + '.');
              Router.resolve();
            }
          } catch (err) {
            console.error('[Qualidade10S] Falha ao atualizar o perfil em tempo real:', err);
          }
        }
      )
      .subscribe();
  },

  // ---------------------------------------------------------
  // Administração de usuários (somente admin)
  // ---------------------------------------------------------
  async listarUsuarios() {
    const { data, error } = await this.client.from('profiles').select('*').order('nome');
    if (error) throw error;
    return data || [];
  },

  /**
   * Cria um usuário: cadastra no Supabase Auth com um cliente descartável (não
   * derruba a sessão do administrador) e libera o acesso via função do banco.
   * Retorna { precisaConfirmarEmail } quando o projeto exige confirmação por e-mail.
   */
  async criarUsuario({ nome, email, senha, role }) {
    if (!this.ehAdmin()) throw new Error('Apenas administradores podem criar usuários.');
    const tmp = window.QualidadeDB.criarClienteTemporario();
    const { data, error } = await tmp.auth.signUp({
      email,
      password: senha,
      options: { data: { nome } },
    });
    if (error) {
      if (/already registered|already been registered/i.test(error.message)) {
        throw new Error('Já existe um usuário com este e-mail.');
      }
      if (/password/i.test(error.message)) {
        throw new Error('Senha inválida: ' + error.message);
      }
      throw new Error(error.message);
    }
    // Com confirmação de e-mail ligada, e-mail repetido volta "sucesso" sem identidades.
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      throw new Error('Já existe um usuário com este e-mail.');
    }

    const { error: errRpc } = await this.client.rpc('finalizar_novo_usuario', {
      p_id: data.user.id,
      p_nome: nome,
      p_role: role,
    });
    if (errRpc) {
      throw new Error('A conta foi criada, mas não foi liberada: ' + errRpc.message);
    }
    return { precisaConfirmarEmail: !data.session };
  },

  /** Altera perfil e/ou situação (ativo) de um usuário. */
  async atualizarUsuario(id, patch) {
    const { data, error } = await this.client.from('profiles').update(patch).eq('id', id).select();
    if (error) throw new Error(error.message);
    if (!data || !data.length) throw new Error('Sem permissão para alterar este usuário.');
    return data[0];
  },
};

window.Auth = Auth;
