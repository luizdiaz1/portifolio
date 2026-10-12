/**
 * modules/auditoria/auditoria.js
 * Log de atividades (somente administrador): quem entrou, saiu, criou, editou
 * ou excluiu o quê e quando. Os registros de dados são gravados por trigger
 * no banco (database/sql/auth-auditoria.sql) e não podem ser alterados pelo app.
 */
const TABELA_ROTULO = {
  vistorias: 'Vistoria',
  nao_conformidades: 'Não conformidade',
  nc_sensos: 'Senso 10S',
  evidencias: 'Evidência',
  acompanhamentos: 'Acompanhamento',
  retornos: 'Retorno / eficácia',
  profiles: 'Usuário',
  auditorias_10s: 'Auditoria 10S',
  auditoria_itens: 'Item do checklist 10S',
  auditoria_acoes: 'Ação do plano 10S',
};

const CAMPO_ROTULO = {
  data: 'Data', area_local: 'Área/Local', realizada_por: 'Realizada por', setor_processo: 'Setor/Processo',
  observacao: 'Observação', status: 'Status', numero: 'Nº', responsavel: 'Responsável', prazo: 'Prazo',
  criticidade: 'Criticidade', descricao: 'Descrição', impacto_risco: 'Impacto/Risco',
  acao_corretiva: 'Ação corretiva', senso: 'Senso', nome_arquivo: 'Arquivo', acao_tratativa: 'Ação/Tratativa',
  resultado_correcao: 'Resultado da correção', eficacia: 'Eficácia', data_retorno: 'Data do retorno',
  nome: 'Nome', email: 'E-mail', role: 'Perfil', ativo: 'Situação',
  area_numero: 'Área nº', area_descricao: 'Locais da área', auditores: 'Auditores', prefeito: 'Prefeito/Sub',
  rodada: 'Auditoria nº', nc_aceitas: 'NCs aceitas', nota_comprometimento: 'Nota: comprometimento',
  nota_lideranca: 'Nota: liderança', nota_sensos: 'Nota: sensos', nota_organizacao: 'Nota: organização',
  nota_comunicacao: 'Nota: comunicação', pergunta: 'Pergunta', resposta: 'Resposta', pontos: 'Pontos', obs: 'Observação',
  nao_conformidade: 'Não conformidade', acao: 'Ação', onde: 'Onde', prazo_previsto: 'Prazo previsto',
  prazo_realizado: 'Prazo realizado', observacoes: 'Observações', invertida: 'Pergunta invertida',
};

const CAMPOS_OCULTOS = ['id', 'vistoria_id', 'nc_id', 'auditoria_id', 'ordem', 'invertida'];
const POR_PAGINA = 100;

const AuditoriaModule = {
  _token: 0,
  _pagina: 0,
  _total: 0,
  _filtros: {},

  async render(container) {
    const token = ++this._token;
    this._pagina = 0;
    this._filtros = {};

    let usuarios = [];
    try {
      usuarios = await Auth.listarUsuarios();
    } catch (err) { /* segue sem a lista de usuários no filtro */ }
    if (token !== this._token || Router.current.route !== 'auditoria') return;

    container.innerHTML = `
      <div class="filter-bar">
        <div class="field"><label>Usuário</label>
          <select id="au-user"><option value="">Todos</option>
            ${usuarios.map((u) => `<option value="${u.id}">${Utils.escapeHtml(u.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Ação</label>
          <select id="au-acao">
            <option value="">Todas</option>
            <option value="login">Entrou</option><option value="logout">Saiu</option>
            <option value="criou">Criou</option><option value="editou">Editou</option><option value="excluiu">Excluiu</option>
          </select>
        </div>
        <div class="field"><label>Registro</label>
          <select id="au-tabela"><option value="">Todos</option>
            ${Object.entries(TABELA_ROTULO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>De</label><input type="date" id="au-ini"></div>
        <div class="field"><label>Até</label><input type="date" id="au-fim"></div>
        <div class="field search"><label>Buscar no registro</label><input type="search" id="au-busca" placeholder="Área, NC, nome..."></div>
        <button class="btn btn-secondary" id="au-limpar">Limpar filtros</button>
      </div>
      <div class="table-wrap" id="au-lista"><div class="table-empty">Carregando...</div></div>
      <div class="au-rodape" id="au-rodape"></div>`;

    const aplicar = () => {
      this._filtros = {
        user: Utils.qs('au-user').value,
        acao: Utils.qs('au-acao').value,
        tabela: Utils.qs('au-tabela').value,
        ini: Utils.qs('au-ini').value,
        fim: Utils.qs('au-fim').value,
        busca: Utils.qs('au-busca').value.trim(),
      };
      this._pagina = 0;
      this._carregar(false);
    };
    ['au-user', 'au-acao', 'au-tabela', 'au-ini', 'au-fim'].forEach((id) => Utils.qs(id).addEventListener('change', aplicar));
    Utils.qs('au-busca').addEventListener('input', Utils.debounce(aplicar, 300));
    Utils.qs('au-limpar').addEventListener('click', () => {
      ['au-user', 'au-acao', 'au-tabela', 'au-ini', 'au-fim', 'au-busca'].forEach((id) => (Utils.qs(id).value = ''));
      aplicar();
    });

    this._carregar(false);
  },

  async _carregar(anexar) {
    const token = this._token;
    const f = this._filtros;
    const de = this._pagina * POR_PAGINA;

    let q = Auth.client
      .from('auditoria')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(de, de + POR_PAGINA - 1);
    if (f.user) q = q.eq('user_id', f.user);
    if (f.acao) q = q.eq('acao', f.acao);
    if (f.tabela) q = q.eq('tabela', f.tabela);
    if (f.ini) q = q.gte('created_at', new Date(f.ini + 'T00:00:00').toISOString());
    if (f.fim) q = q.lte('created_at', new Date(f.fim + 'T23:59:59.999').toISOString());
    if (f.busca) q = q.ilike('rotulo', '%' + f.busca.replace(/[%_,()]/g, ' ') + '%');

    const { data, error, count } = await q;
    if (token !== this._token || Router.current.route !== 'auditoria') return;

    const lista = Utils.qs('au-lista');
    if (error) {
      lista.innerHTML = `<div class="table-empty">Não foi possível carregar a auditoria: ${Utils.escapeHtml(error.message)}</div>`;
      Utils.qs('au-rodape').innerHTML = '';
      return;
    }

    this._total = count || 0;
    const linhas = (data || []).map((r) => this._linha(r)).join('');

    if (!anexar) {
      if (!data.length) {
        lista.innerHTML = `<div class="table-empty">Nenhum registro encontrado com esses filtros.</div>`;
        Utils.qs('au-rodape').innerHTML = '';
        return;
      }
      lista.innerHTML = `<table class="data-table au-table">
        <thead><tr><th>Data / hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
        <tbody id="au-corpo">${linhas}</tbody>
      </table>`;
    } else {
      Utils.qs('au-corpo').insertAdjacentHTML('beforeend', linhas);
    }

    const mostrados = Math.min((this._pagina + 1) * POR_PAGINA, this._total);
    const rodape = Utils.qs('au-rodape');
    rodape.innerHTML = `<span>Mostrando ${mostrados} de ${this._total} registro(s)</span>
      ${mostrados < this._total ? '<button class="btn btn-secondary btn-sm" id="au-mais">Carregar mais</button>' : ''}`;
    const mais = Utils.qs('au-mais');
    if (mais) {
      mais.addEventListener('click', () => {
        mais.disabled = true;
        this._pagina += 1;
        this._carregar(true);
      });
    }
  },

  _linha(r) {
    const quem = r.user_nome
      ? `<strong>${Utils.escapeHtml(r.user_nome)}</strong><div class="au-sub">${Utils.escapeHtml(r.user_email || '')}</div>`
      : `<em>Sistema</em><div class="au-sub">sem usuário (painel Supabase)</div>`;
    return `<tr>
      <td class="au-quando">${Utils.formatarDataHora(r.created_at)}</td>
      <td>${quem}</td>
      <td>${this._tagAcao(r.acao)}</td>
      <td>${this._registro(r)}</td>
      <td class="au-detalhes">${this._detalhes(r)}</td>
    </tr>`;
  },

  _tagAcao(acao) {
    const map = {
      login: ['Entrou', 'tag-pendente'],
      logout: ['Saiu', 'tag-pendente'],
      criou: ['Criou', 'tag-concluida'],
      editou: ['Editou', 'tag-andamento'],
      excluiu: ['Excluiu', 'tag-atrasada'],
    };
    const [txt, cls] = map[acao] || [acao, 'tag-pendente'];
    return `<span class="tag ${cls}">${txt}</span>`;
  },

  _registro(r) {
    if (r.acao === 'login') return 'Acesso ao sistema';
    if (r.acao === 'logout') return 'Saída do sistema';
    const tipo = TABELA_ROTULO[r.tabela] || r.tabela || '';
    return `<strong>${Utils.escapeHtml(tipo)}</strong>${r.rotulo ? `<div class="au-sub">${Utils.escapeHtml(r.rotulo)}</div>` : ''}`;
  },

  _valor(campo, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (campo === 'role') return Auth.rotuloPerfil(v);
    if (campo === 'ativo') return v ? 'Ativo' : 'Inativo';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    let s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = Utils.formatarData(s);
    return s.length > 140 ? s.slice(0, 140) + '…' : s;
  },

  _detalhes(r) {
    const det = r.detalhes;
    if (!det || typeof det !== 'object') return '';
    const rot = (k) => CAMPO_ROTULO[k] || k;

    if (r.acao === 'editou') {
      const itens = Object.entries(det).map(([k, m]) =>
        `<li><span class="au-campo">${Utils.escapeHtml(rot(k))}:</span> ${Utils.escapeHtml(this._valor(k, m.de))} <span class="au-seta">→</span> ${Utils.escapeHtml(this._valor(k, m.para))}</li>`
      );
      if (!itens.length) return '';
      if (itens.length === 1) return `<ul class="au-lista">${itens[0]}</ul>`;
      return `<details><summary>${itens[0].replace(/^<li>|<\/li>$/g, '')} <em>+${itens.length - 1}</em></summary><ul class="au-lista">${itens.join('')}</ul></details>`;
    }

    if (r.acao === 'criou' || r.acao === 'excluiu') {
      const itens = Object.entries(det)
        .filter(([k, v]) => !CAMPOS_OCULTOS.includes(k) && v !== null && v !== '')
        .map(([k, v]) => `<li><span class="au-campo">${Utils.escapeHtml(rot(k))}:</span> ${Utils.escapeHtml(this._valor(k, v))}</li>`);
      if (!itens.length) return '';
      return `<details><summary>Ver dados</summary><ul class="au-lista">${itens.join('')}</ul></details>`;
    }
    return '';
  },
};

window.AuditoriaModule = AuditoriaModule;
