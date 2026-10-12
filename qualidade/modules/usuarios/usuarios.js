/**
 * modules/usuarios/usuarios.js
 * Gestão de usuários (somente administrador): cadastrar, trocar o perfil
 * entre Administrador e Visitante (somente leitura) e ativar/desativar acesso.
 */
const UsuariosModule = {
  _token: 0,

  async render(container) {
    const token = ++this._token;
    container.innerHTML = `<div class="empty-state"><p>Carregando usuários...</p></div>`;

    let usuarios;
    try {
      usuarios = await Auth.listarUsuarios();
    } catch (err) {
      if (token !== this._token) return;
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠</div><h3>Não foi possível carregar os usuários</h3><p>${Utils.escapeHtml(err.message)}</p><p>Confirme que o arquivo <code>database/sql/auth-auditoria.sql</code> foi executado no Supabase.</p></div>`;
      return;
    }
    // Se o usuário já trocou de tela enquanto carregava, não desenha por cima.
    if (token !== this._token || Router.current.route !== 'usuarios') return;

    const meuId = Auth.perfil.id;
    const ativos = usuarios.filter((u) => u.ativo).length;

    const linhas = usuarios
      .map((u) => {
        const eu = u.id === meuId;
        const perfilCell = eu
          ? `<span class="tag tag-role-admin">Administrador</span> <span class="hint-inline">(você)</span>`
          : `<select data-role="${u.id}" aria-label="Perfil de ${Utils.escapeHtml(u.nome)}">
               <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option>
               <option value="visitante" ${u.role === 'visitante' ? 'selected' : ''}>Visitante (somente leitura)</option>
             </select>`;
        const situacao = u.ativo
          ? `<span class="tag tag-concluida">Ativo</span>`
          : `<span class="tag tag-pendente">Inativo</span>`;
        const acao = eu
          ? ''
          : `<button class="btn btn-ghost btn-sm" data-ativo="${u.id}" data-valor="${u.ativo ? '0' : '1'}">${u.ativo ? 'Desativar' : 'Ativar'}</button>`;
        return `<tr class="${u.ativo ? '' : 'row-inativa'}">
          <td><strong>${Utils.escapeHtml(u.nome)}</strong></td>
          <td>${Utils.escapeHtml(u.email)}</td>
          <td>${perfilCell}</td>
          <td>${situacao}</td>
          <td>${Utils.formatarDataHora(u.created_at)}</td>
          <td class="td-acoes">${acao}</td>
        </tr>`;
      })
      .join('');

    container.innerHTML = `
      <div class="section-row" style="margin-top:0">
        <div>
          <h2>Usuários (${usuarios.length})</h2>
          <div class="hint-inline">${ativos} ativo(s) · Administrador altera tudo; Visitante apenas consulta.</div>
        </div>
        <button class="btn btn-primary" id="u-novo">+ Novo usuário</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th></th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;

    Utils.qs('u-novo').addEventListener('click', () => this._abrirModalNovo());

    container.querySelectorAll('[data-role]').forEach((sel) =>
      sel.addEventListener('change', async () => {
        const anterior = sel.value === 'admin' ? 'visitante' : 'admin';
        sel.disabled = true;
        try {
          await Auth.atualizarUsuario(sel.dataset.role, { role: sel.value });
          Utils.toast('Perfil atualizado.');
        } catch (err) {
          sel.value = anterior;
          Utils.toast(err.message, 'erro');
        }
        sel.disabled = false;
      })
    );

    container.querySelectorAll('[data-ativo]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const ativar = btn.dataset.valor === '1';
        if (!ativar && !Utils.confirmar('Desativar este usuário? Ele perde o acesso ao sistema imediatamente.')) return;
        btn.disabled = true;
        try {
          await Auth.atualizarUsuario(btn.dataset.ativo, { ativo: ativar });
          Utils.toast(ativar ? 'Usuário ativado.' : 'Usuário desativado.');
          this.render(container);
        } catch (err) {
          Utils.toast(err.message, 'erro');
          btn.disabled = false;
        }
      })
    );
  },

  _senhaAleatoria() {
    const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint32Array(10);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => letras[b % letras.length]).join('');
  },

  _abrirModalNovo() {
    Modal.open({
      title: 'Novo usuário',
      bodyHtml: `
        <div class="form-grid">
          <div class="field span-2"><label>Nome</label><input type="text" id="nu-nome" autocomplete="off" placeholder="Nome completo"></div>
          <div class="field span-2"><label>E-mail (será o login)</label><input type="email" id="nu-email" autocomplete="off" placeholder="nome@empresa.com"></div>
          <div class="field">
            <label>Senha inicial <span class="hint">(mín. 6 caracteres)</span></label>
            <input type="text" id="nu-senha" autocomplete="off">
          </div>
          <div class="field">
            <label>&nbsp;</label>
            <button type="button" class="btn btn-secondary" id="nu-gerar">Gerar senha</button>
          </div>
          <div class="field span-2">
            <label>Perfil</label>
            <select id="nu-role">
              <option value="visitante" selected>Visitante — somente leitura</option>
              <option value="admin">Administrador — altera tudo e gerencia usuários</option>
            </select>
          </div>
        </div>
        <p class="hint-inline" style="margin-top:12px">Repasse o e-mail e a senha para a pessoa. O perfil pode ser trocado depois nesta tela.</p>
        <div class="form-aviso hidden" id="nu-aviso"></div>`,
      footerHtml: `
        <button class="btn btn-secondary" id="nu-cancelar">Cancelar</button>
        <button class="btn btn-primary" id="nu-salvar">Criar usuário</button>`,
    });

    Utils.qs('nu-gerar').addEventListener('click', () => { Utils.qs('nu-senha').value = this._senhaAleatoria(); });
    Utils.qs('nu-cancelar').addEventListener('click', () => Modal.close());
    Utils.qs('nu-salvar').addEventListener('click', () => this._salvarNovo());
    Utils.qs('nu-nome').focus();
  },

  async _salvarNovo() {
    const nome = Utils.qs('nu-nome').value.trim();
    const email = Utils.qs('nu-email').value.trim().toLowerCase();
    const senha = Utils.qs('nu-senha').value;
    const role = Utils.qs('nu-role').value;
    const aviso = Utils.qs('nu-aviso');
    const mostrar = (msg, tipo = 'erro') => {
      aviso.textContent = msg;
      aviso.className = 'form-aviso form-aviso-' + tipo;
    };

    if (!nome) return mostrar('Informe o nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrar('Informe um e-mail válido.');
    if (senha.length < 6) return mostrar('A senha precisa ter pelo menos 6 caracteres.');

    const btn = Utils.qs('nu-salvar');
    btn.disabled = true;
    btn.textContent = 'Criando...';
    try {
      const r = await Auth.criarUsuario({ nome, email, senha, role });
      if (r.precisaConfirmarEmail) {
        // O usuário foi criado e liberado, mas o Supabase ainda exige confirmar o e-mail.
        mostrar(
          'Usuário criado, mas o Supabase está exigindo confirmação de e-mail: a pessoa só consegue entrar depois de confirmar. ' +
            'Para entrar direto, desative "Confirm email" em Authentication → Providers → Email.',
          'atencao'
        );
        btn.textContent = 'Criado';
        Utils.qs('nu-cancelar').textContent = 'Fechar';
        this.render(Utils.qs('view-root'));
        return;
      }
      Modal.close();
      Utils.toast('Usuário criado.');
      this.render(Utils.qs('view-root'));
    } catch (err) {
      mostrar(err.message);
      btn.disabled = false;
      btn.textContent = 'Criar usuário';
    }
  },
};

window.UsuariosModule = UsuariosModule;
