/**
 * database/queries/auditorias10s.js
 * Acesso aos dados do módulo Auditorias 10S (via Store, como os demais módulos):
 *   auditorias_10s  -> a auditoria
 *   auditoria_itens -> perguntas do checklist (Sim/Não + pontos)
 *   auditoria_acoes -> plano de ação
 */
const T_AUD = 'auditorias_10s';
const T_ITEM = 'auditoria_itens';
const T_ACAO = 'auditoria_acoes';

const Auditorias10SQuery = {
  // ---------------------------------------------------------
  // Auditoria
  // ---------------------------------------------------------
  listar({ busca = '', status = '', rodada = '' } = {}) {
    const q = busca.trim().toLowerCase();
    return Store.select(T_AUD, (a) => {
      if (status && a.status !== status) return false;
      if (rodada && String(a.rodada) !== String(rodada)) return false;
      if (q) {
        const texto = [a.area_numero, a.area_descricao, a.auditores, a.prefeito, a.observacao].join(' ').toLowerCase();
        if (!texto.includes(q)) return false;
      }
      return true;
    }).sort((x, y) => (y.data || '').localeCompare(x.data || '') || (y.created_at || '').localeCompare(x.created_at || ''));
  },

  obter(id) {
    return Store.getById(T_AUD, id);
  },

  /** Cria a auditoria e já monta o checklist com as perguntas dos 10 sensos. */
  criar(dados) {
    const aud = Store.insert(T_AUD, {
      data: dados.data || Utils.hoje(),
      area_numero: dados.area_numero ?? null,
      area_descricao: dados.area_descricao || '',
      auditores: dados.auditores || '',
      prefeito: dados.prefeito || '',
      rodada: dados.rodada || 1,
      nc_aceitas: dados.nc_aceitas ?? null,
      nota_comprometimento: null,
      nota_lideranca: null,
      nota_sensos: null,
      nota_organizacao: null,
      nota_comunicacao: null,
      observacao: '',
      status: 'Em andamento',
    });
    CHECKLIST_10S.forEach((s) => {
      s.itens.forEach((it, i) => {
        Store.insert(T_ITEM, {
          auditoria_id: aud.id,
          senso: s.senso,
          ordem: i + 1,
          pergunta: it.pergunta,
          invertida: !!it.invertida,
          resposta: null,
          pontos: null,
          obs: '',
        });
      });
    });
    return aud;
  },

  atualizar(id, patch) {
    return Store.update(T_AUD, id, patch);
  },

  /** Exclui a auditoria; no Supabase os filhos saem por "on delete cascade". */
  excluir(id) {
    Store.deleteWhere(T_ITEM, (r) => r.auditoria_id === id);
    Store.deleteWhere(T_ACAO, (r) => r.auditoria_id === id);
    return Store.delete(T_AUD, id);
  },

  // ---------------------------------------------------------
  // Checklist
  // ---------------------------------------------------------
  itens(auditoriaId) {
    return Store.select(T_ITEM, (i) => i.auditoria_id === auditoriaId)
      .sort((a, b) => a.senso - b.senso || a.ordem - b.ordem);
  },

  atualizarItem(id, patch) {
    return Store.update(T_ITEM, id, patch);
  },

  /** Pontos sugeridos ao marcar Sim/Não (pergunta "invertida": Sim é o resultado ruim). */
  pontosSugeridos(resposta, invertida) {
    if (resposta !== 'Sim' && resposta !== 'Não') return null;
    const bom = invertida ? resposta === 'Não' : resposta === 'Sim';
    return bom ? 1 : 0;
  },

  // ---------------------------------------------------------
  // Plano de ação
  // ---------------------------------------------------------
  acoes(auditoriaId) {
    return Store.select(T_ACAO, (a) => a.auditoria_id === auditoriaId)
      .sort((a, b) => a.numero - b.numero || (a.created_at || '').localeCompare(b.created_at || ''));
  },

  proximoNumeroAcao(auditoriaId) {
    return this.acoes(auditoriaId).reduce((m, a) => Math.max(m, a.numero || 0), 0) + 1;
  },

  criarAcao(auditoriaId, dados) {
    return Store.insert(T_ACAO, {
      auditoria_id: auditoriaId,
      numero: dados.numero || this.proximoNumeroAcao(auditoriaId),
      nao_conformidade: dados.nao_conformidade || '',
      acao: dados.acao || '',
      responsavel: dados.responsavel || '',
      onde: dados.onde || '',
      prazo_previsto: dados.prazo_previsto || null,
      prazo_realizado: dados.prazo_realizado || null,
      status: dados.status || 'Pendente',
      observacoes: dados.observacoes || '',
    });
  },

  atualizarAcao(id, patch) {
    return Store.update(T_ACAO, id, patch);
  },

  excluirAcao(id) {
    return Store.delete(T_ACAO, id);
  },

  /** "Atrasada" é calculada na hora (prazo vencido e ação ainda aberta); não é gravada. */
  acaoAtrasada(a) {
    if (!a.prazo_previsto || !['Pendente', 'Em andamento'].includes(a.status)) return false;
    return Utils.diasAte(a.prazo_previsto) < 0;
  },

  acaoAberta(a) {
    return ['Pendente', 'Em andamento'].includes(a.status);
  },

  // ---------------------------------------------------------
  // Nota
  // ---------------------------------------------------------
  calcular(id) {
    const auditoria = this.obter(id);
    if (!auditoria) return null;
    return Nota10S.calcular({ auditoria, itens: this.itens(id), acoes: this.acoes(id) });
  },
};

window.Auditorias10SQuery = Auditorias10SQuery;
