/**
 * utils/nota10s.js
 * Cálculo da nota do prefeito (planilha "Cálculo para avaliação dos prefeitos").
 * Funções puras: recebem os dados e devolvem números, sem tocar em tela nem banco.
 *
 *   Nota das NCs         = 10 × (1 − encontradas ÷ aceitas), limitada de 0 a 10
 *   Nota do checklist    = pontos obtidos ÷ pontos possíveis × 10
 *   Nota comportamental  = Σ (nota do critério × peso do critério ÷ 100)
 *   Nota geral           = 40% NCs + 30% checklist + 30% comportamental
 *
 * Pontos possíveis = número de itens que receberam pontuação (item sem pontos
 * não foi avaliado e não entra na conta).
 */
const Nota10S = {
  _num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  },

  checklist(itens) {
    const porSenso = {};
    let pontos = 0;
    let possiveis = 0;
    let semPontuacao = 0;
    (itens || []).forEach((it) => {
      const s = (porSenso[it.senso] = porSenso[it.senso] || { pontos: 0, possiveis: 0, total: 0 });
      s.total += 1;
      const p = this._num(it.pontos);
      if (p === null) {
        if (it.senso <= SENSOS_ATE_NOTA) semPontuacao += 1;
        return;
      }
      s.pontos += p;
      s.possiveis += 1;
      pontos += p;
      possiveis += 1;
    });
    return { pontos, possiveis, semPontuacao, porSenso, nota: possiveis ? (pontos / possiveis) * 10 : null };
  },

  naoConformidades(acoes, aceitas) {
    const encontradas = (acoes || []).filter((a) => a.status !== 'Cancelado').length;
    const ac = this._num(aceitas);
    let nota = null;
    if (ac !== null) {
      if (ac === 0) nota = encontradas === 0 ? 10 : 0;
      else nota = Math.min(10, Math.max(0, 10 * (1 - encontradas / ac)));
    }
    return { encontradas, aceitas: ac, nota };
  },

  comportamental(auditoria) {
    let total = 0;
    let faltando = 0;
    const linhas = CRITERIOS_COMPORTAMENTAIS.map((c) => {
      const nota = this._num(auditoria[c.campo]);
      if (nota === null) faltando += 1;
      const ponderada = ((nota || 0) * c.peso) / 100;
      total += ponderada;
      return { ...c, nota, ponderada };
    });
    return { linhas, total, faltando };
  },

  calcular({ auditoria, itens, acoes }) {
    const chk = this.checklist(itens);
    const nc = this.naoConformidades(acoes, auditoria.nc_aceitas);
    const comp = this.comportamental(auditoria);
    const P = PESOS_NOTA_10S;
    const ponderadoNc = ((nc.nota || 0) * P.nc) / 100;
    const ponderadoChk = ((chk.nota || 0) * P.checklist) / 100;
    const ponderadoComp = (comp.total * P.comportamental) / 100;
    const geral = ponderadoNc + ponderadoChk + ponderadoComp;
    // "Completa" = todas as três partes têm dados para serem calculadas.
    const completa = nc.nota !== null && chk.nota !== null && comp.faltando === 0;
    return { chk, nc, comp, ponderadoNc, ponderadoChk, ponderadoComp, geral, completa };
  },

  /** Número no padrão brasileiro (vírgula), com casas fixas. */
  fmt(n, casas = 2) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  },

  /** Pontos: 26,5 / 4 / 0,5 (sem zeros à toa). */
  fmtPontos(n) {
    if (n === null || n === undefined) return '—';
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  },
};

window.Nota10S = Nota10S;
