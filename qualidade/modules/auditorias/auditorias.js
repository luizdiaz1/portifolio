/**
 * modules/auditorias/auditorias.js
 * Módulo "Auditorias 10S": lista de auditorias e, dentro de cada uma,
 *   - Checklist  : perguntas dos 10 sensos (Sim/Não + pontos + observação)
 *   - Plano de ação : uma linha por não conformidade encontrada
 *   - Nota do prefeito : cálculo da nota (NCs 40% · checklist 30% · comportamental 30%)
 *
 * Rota: #/auditorias-10s            -> lista
 *       #/auditorias-10s/<id>/<aba> -> detalhe (aba: checklist | plano | nota)
 * As contas ficam em utils/nota10s.js; os dados em database/queries/auditorias10s.js.
 */
const Auditorias10SModule = {
  ABAS: [
    ['checklist', 'Checklist'],
    ['plano', 'Plano de ação'],
    ['nota', 'Nota do prefeito'],
  ],

  render(container, params) {
    if (params.id && params.extra === 'relatorio') return this._renderRelatorio(container, params.id);
    if (params.id) return this._renderDetalhe(container, params.id, params.extra || 'checklist');
    return this._renderLista(container);
  },

  // =========================================================
  // LISTA
  // =========================================================
  _renderLista(container) {
    const todas = Auditorias10SQuery.listar();
    const rodadas = [...new Set(todas.map((a) => a.rodada))].sort((a, b) => a - b);

    // KPIs
    const notas = todas.map((a) => Auditorias10SQuery.calcular(a.id)).filter((c) => c && c.completa).map((c) => c.geral);
    const media = notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null;
    const acoes = Store.select('auditoria_acoes');
    const abertas = acoes.filter((a) => Auditorias10SQuery.acaoAberta(a));
    const atrasadas = abertas.filter((a) => Auditorias10SQuery.acaoAtrasada(a));

    container.innerHTML = `
      <div class="kpi-grid">
        ${DashboardModule._kpi(todas.length, 'Auditorias realizadas', 'kpi-preto')}
        ${DashboardModule._kpi(Nota10S.fmt(media), 'Nota geral média', 'kpi-verde')}
        ${DashboardModule._kpi(abertas.length, 'Ações em aberto', 'kpi-amarelo')}
        ${DashboardModule._kpi(atrasadas.length, 'Ações atrasadas', 'kpi-vermelho')}
      </div>
      <div class="filter-bar">
        <div class="field search"><label>Buscar</label><input type="search" id="al-busca" placeholder="Área, auditor, prefeito..."></div>
        <div class="field"><label>Auditoria</label>
          <select id="al-rodada"><option value="">Todas</option>${rodadas.map((r) => `<option value="${r}">${r}ª auditoria</option>`).join('')}</select>
        </div>
        <div class="field"><label>Status</label>
          <select id="al-status"><option value="">Todos</option><option>Em andamento</option><option>Concluída</option></select>
        </div>
        <button class="btn btn-secondary" id="al-limpar">Limpar filtros</button>
        <button class="btn btn-primary" id="al-nova" data-w>+ Nova auditoria</button>
      </div>
      <div class="table-wrap" id="al-lista"></div>`;

    const pintar = () => {
      const lista = Auditorias10SQuery.listar({
        busca: Utils.qs('al-busca').value,
        rodada: Utils.qs('al-rodada').value,
        status: Utils.qs('al-status').value,
      });
      this._pintarLista(lista, todas.length);
    };
    Utils.qs('al-busca').addEventListener('input', Utils.debounce(pintar, 200));
    ['al-rodada', 'al-status'].forEach((id) => Utils.qs(id).addEventListener('change', pintar));
    Utils.qs('al-limpar').addEventListener('click', () => {
      ['al-busca', 'al-rodada', 'al-status'].forEach((id) => (Utils.qs(id).value = ''));
      pintar();
    });
    Utils.qs('al-nova').addEventListener('click', () => this._abrirModalNova());
    pintar();
  },

  _pintarLista(lista, totalGeral) {
    const box = Utils.qs('al-lista');
    if (!lista.length) {
      box.innerHTML = `<div class="table-empty">${
        totalGeral ? 'Nenhuma auditoria encontrada com esses filtros.' : 'Nenhuma auditoria cadastrada ainda. Use “+ Nova auditoria” para começar.'
      }</div>`;
      return;
    }
    const linhas = lista.map((a) => {
      const c = Auditorias10SQuery.calcular(a.id);
      const area = [a.area_numero ? `Área ${a.area_numero}` : '', a.area_descricao].filter(Boolean).join(' · ');
      const notaCel = c.completa
        ? `<strong>${Nota10S.fmt(c.geral)}</strong>`
        : '<span class="tag tag-atencao" title="Faltam dados para fechar a nota (checklist, NCs aceitas ou notas comportamentais)">incompleta</span>';
      return `<tr class="linha-clicavel" data-abrir="${a.id}">
        <td>${Utils.formatarData(a.data)}</td>
        <td>${a.rodada}ª</td>
        <td class="al-area" title="${Utils.escapeHtml(area)}">${Utils.escapeHtml(area) || '—'}</td>
        <td>${Utils.escapeHtml(a.prefeito) || '—'}</td>
        <td>${Nota10S.fmtPontos(c.chk.pontos)} / ${c.chk.possiveis}</td>
        <td>${c.nc.encontradas} / ${c.nc.aceitas ?? '—'}</td>
        <td>${notaCel}</td>
        <td><span class="tag ${a.status === 'Concluída' ? 'tag-concluida' : 'tag-andamento'}">${a.status}</span></td>
        <td class="td-acoes">
          <button class="btn btn-ghost btn-sm" data-editar="${a.id}" data-w title="Abrir já em modo edição">Editar</button>
          <button class="btn btn-secondary btn-sm" data-relatorio="${a.id}" title="Abrir relatório para imprimir / salvar em PDF">Relatório</button>
          <button class="btn btn-ghost btn-sm" data-excluir="${a.id}" data-w title="Excluir auditoria">🗑</button>
        </td>
      </tr>`;
    }).join('');
    box.innerHTML = `<table class="data-table al-table">
      <thead><tr><th>Data</th><th>Auditoria</th><th>Área</th><th>Prefeito / Sub</th><th>Checklist</th><th>NCs<br><span class="hint-inline">enc. / aceitas</span></th><th>Nota geral</th><th>Status</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table>`;

    box.querySelectorAll('[data-abrir]').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-excluir]')) return;
        if (e.target.closest('[data-editar]')) {
          Edicao.pedir('auditorias-10s/' + tr.dataset.abrir);
          return Router.navigate('auditorias-10s/' + tr.dataset.abrir + '/checklist');
        }
        if (e.target.closest('[data-relatorio]')) return Router.navigate('auditorias-10s/' + tr.dataset.abrir + '/relatorio');
        Router.navigate('auditorias-10s/' + tr.dataset.abrir + '/checklist');
      })
    );
    box.querySelectorAll('[data-excluir]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const a = Auditorias10SQuery.obter(btn.dataset.excluir);
        if (!a) return;
        const nAcoes = Auditorias10SQuery.acoes(a.id).length;
        if (!Utils.confirmar(`Excluir a ${a.rodada}ª auditoria da Área ${a.area_numero ?? '?'} (${Utils.formatarData(a.data)})?\n\nO checklist e ${nAcoes} ação(ões) do plano também serão apagados. Isso não pode ser desfeito.`)) return;
        Auditorias10SQuery.excluir(a.id);
        Utils.toast('Auditoria excluída.');
        this._renderLista(Utils.qs('view-root'));
      })
    );
  },

  _abrirModalNova() {
    Modal.open({
      title: 'Nova auditoria 10S',
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Data da auditoria</label><input type="date" id="na-data" value="${Utils.hoje()}"></div>
          <div class="field"><label>Área nº</label><input type="number" id="na-area" min="1" step="1" placeholder="Ex.: 2"></div>
          <div class="field span-2"><label>Locais da área</label><input type="text" id="na-desc" placeholder="Ex.: 1º andar — Sala de Compras, Auditório, Copinha..."></div>
          <div class="field"><label>Auditores</label><input type="text" id="na-audit" placeholder="Ex.: Fabiano e Charles"></div>
          <div class="field"><label>Prefeito e subprefeito</label><input type="text" id="na-pref" placeholder="Ex.: Marianna e Adriana"></div>
          <div class="field"><label>Auditoria nº</label>
            <select id="na-rodada">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}ª auditoria</option>`).join('')}</select>
          </div>
          <div class="field"><label>NCs aceitas na área <span class="hint">(opcional agora)</span></label><input type="number" id="na-aceitas" min="0" step="1"></div>
        </div>
        <p class="hint-inline" style="margin-top:12px">O checklist dos 10 sensos já vem montado; é só marcar as respostas.</p>
        <div class="form-aviso form-aviso-erro hidden" id="na-erro"></div>`,
      footerHtml: `<button class="btn btn-secondary" id="na-cancelar">Cancelar</button><button class="btn btn-primary" id="na-salvar">Criar auditoria</button>`,
    });
    Utils.qs('na-cancelar').addEventListener('click', () => Modal.close());
    Utils.qs('na-salvar').addEventListener('click', () => {
      const data = Utils.qs('na-data').value;
      const area = parseInt(Utils.qs('na-area').value, 10);
      const erro = Utils.qs('na-erro');
      if (!data || !Number.isInteger(area) || area < 1) {
        erro.textContent = 'Informe a data e o número da área.';
        erro.classList.remove('hidden');
        return;
      }
      const aceitasTxt = Utils.qs('na-aceitas').value;
      const aud = Auditorias10SQuery.criar({
        data,
        area_numero: area,
        area_descricao: Utils.qs('na-desc').value.trim(),
        auditores: Utils.qs('na-audit').value.trim(),
        prefeito: Utils.qs('na-pref').value.trim(),
        rodada: parseInt(Utils.qs('na-rodada').value, 10),
        nc_aceitas: aceitasTxt === '' ? null : Math.max(0, parseInt(aceitasTxt, 10) || 0),
      });
      Modal.close();
      Utils.toast('Auditoria criada.');
      Edicao.pedir('auditorias-10s/' + aud.id); // recém-criada: já abre para preencher o checklist
      Router.navigate('auditorias-10s/' + aud.id + '/checklist');
    });
    Utils.qs('na-data').focus();
  },

  // =========================================================
  // DETALHE
  // =========================================================
  _renderDetalhe(container, id, aba) {
    const aud = Auditorias10SQuery.obter(id);
    if (!aud) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Auditoria não encontrada</h3>
        <p>Ela pode ter sido excluída por outro usuário.</p><button class="btn btn-secondary" id="au-volta">Voltar para a lista</button></div>`;
      Utils.qs('au-volta').addEventListener('click', () => Router.navigate('auditorias-10s'));
      return;
    }
    if (!this.ABAS.some(([k]) => k === aba)) aba = 'checklist';
    const esc = Utils.escapeHtml;

    container.innerHTML = `
      <div class="au-topo">
        <button class="btn btn-ghost btn-sm" id="au-voltar">← Todas as auditorias</button>
        <button class="btn btn-primary btn-sm" id="au-relatorio">Relatório · imprimir / PDF</button>
      </div>
      ${Edicao.barraHtml()}

      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Dados da auditoria</div>
        <div class="form-grid">
          <div class="field"><label>Data</label><input type="date" id="a-data" data-w value="${aud.data || ''}"></div>
          <div class="field"><label>Área nº</label><input type="number" id="a-area" data-w min="1" step="1" value="${aud.area_numero ?? ''}"></div>
          <div class="field span-2"><label>Locais da área</label><input type="text" id="a-desc" data-w value="${esc(aud.area_descricao)}"></div>
          <div class="field"><label>Auditores</label><input type="text" id="a-audit" data-w value="${esc(aud.auditores)}"></div>
          <div class="field"><label>Prefeito e subprefeito</label><input type="text" id="a-pref" data-w value="${esc(aud.prefeito)}"></div>
          <div class="field"><label>Auditoria nº</label>
            <select id="a-rodada" data-w>${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}" ${aud.rodada === n ? 'selected' : ''}>${n}ª auditoria</option>`).join('')}</select>
          </div>
          <div class="field"><label>Status</label>
            <select id="a-status" data-w>
              <option ${aud.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
              <option ${aud.status === 'Concluída' ? 'selected' : ''}>Concluída</option>
            </select>
          </div>
          <div class="field span-2"><label>Observações gerais</label><textarea id="a-obs" data-w>${esc(aud.observacao)}</textarea></div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card kpi-verde"><div class="kpi-value" data-out="geral">—</div><div class="kpi-label">Nota geral</div><div class="hint-inline" data-out="geral-obs"></div></div>
        <div class="kpi-card kpi-azul"><div class="kpi-value" data-out="chk-resumo">—</div><div class="kpi-label">Pontos do checklist</div></div>
        <div class="kpi-card kpi-amarelo"><div class="kpi-value" data-out="nc-resumo">—</div><div class="kpi-label">NCs encontradas / aceitas</div></div>
        <div class="kpi-card kpi-laranja"><div class="kpi-value" data-out="acoes-abertas">—</div><div class="kpi-label">Ações em aberto</div></div>
      </div>

      <div class="tabs">
        ${this.ABAS.map(([k, t]) => `<button class="tab-btn ${k === aba ? 'active' : ''}" data-aba="${k}">${t}</button>`).join('')}
      </div>
      <div id="aud-aba"></div>`;

    Utils.qs('au-voltar').addEventListener('click', () => Router.navigate('auditorias-10s'));
    Utils.qs('au-relatorio').addEventListener('click', () => Router.navigate(`auditorias-10s/${id}/relatorio`));
    container.querySelectorAll('[data-aba]').forEach((b) =>
      b.addEventListener('click', () => Router.navigate(`auditorias-10s/${id}/${b.dataset.aba}`))
    );

    Edicao.ligarBarra();

    // Dados da auditoria: salva ao sair do campo
    const campos = {
      'a-data': 'data', 'a-area': 'area_numero', 'a-desc': 'area_descricao', 'a-audit': 'auditores',
      'a-pref': 'prefeito', 'a-rodada': 'rodada', 'a-status': 'status', 'a-obs': 'observacao',
    };
    Object.entries(campos).forEach(([elId, campo]) => {
      Utils.qs(elId).addEventListener('change', (e) => {
        let v = e.target.value;
        if (campo === 'data' && !v) { e.target.value = Auditorias10SQuery.obter(id).data; return; }
        if (campo === 'area_numero') v = v === '' ? null : Math.max(1, parseInt(v, 10) || 1);
        if (campo === 'rodada') v = parseInt(v, 10);
        Auditorias10SQuery.atualizar(id, { [campo]: v });
        Utils.toast('Dados da auditoria atualizados.');
        this._atualizarSaidas(container, id);
      });
    });

    this._pintarAba(container, id, aba);
    this._atualizarSaidas(container, id);
  },

  _pintarAba(container, id, aba) {
    if (aba === 'plano') this._abaPlano(container, id);
    else if (aba === 'nota') this._abaNota(container, id);
    else this._abaChecklist(container, id);
    this._atualizarSaidas(container, id);
  },

  /** Preenche todos os valores calculados da tela ([data-out]) a partir dos dados atuais. */
  _atualizarSaidas(container, id) {
    const calc = Auditorias10SQuery.calcular(id);
    if (!calc) return;
    const N = Nota10S;
    const saidas = {
      // Sem todos os dados a nota geral não fecha: mostra "—" no destaque e o parcial só na aba da nota.
      geral: calc.completa ? N.fmt(calc.geral) : '—',
      'geral-tab': N.fmt(calc.geral),
      'geral-obs': this._textoFalta(calc),
      'chk-resumo': `${N.fmtPontos(calc.chk.pontos)} / ${calc.chk.possiveis}`,
      'chk-pontos': N.fmtPontos(calc.chk.pontos),
      'chk-possiveis': String(calc.chk.possiveis),
      'chk-nota': N.fmt(calc.chk.nota),
      'chk-aviso': calc.chk.semPontuacao
        ? `${calc.chk.semPontuacao} item(ns) dos sensos 1 a 8 estão sem pontuação e não entram no cálculo.`
        : '',
      'nc-resumo': `${calc.nc.encontradas} / ${calc.nc.aceitas ?? '—'}`,
      'nc-encontradas': String(calc.nc.encontradas),
      'nc-nota': N.fmt(calc.nc.nota),
      'comp-total': N.fmt(calc.comp.total),
      'int-nc': N.fmt(calc.nc.nota),
      'int-chk': N.fmt(calc.chk.nota),
      'int-comp': N.fmt(calc.comp.total),
      'pond-nc': N.fmt(calc.ponderadoNc),
      'pond-chk': N.fmt(calc.ponderadoChk),
      'pond-comp': N.fmt(calc.ponderadoComp),
      'acoes-abertas': String(Auditorias10SQuery.acoes(id).filter((a) => Auditorias10SQuery.acaoAberta(a)).length),
    };
    calc.comp.linhas.forEach((l) => { saidas['comp-' + l.campo] = N.fmt(l.ponderada); });
    Object.entries(calc.chk.porSenso).forEach(([s, v]) => {
      saidas['senso-' + s] = v.possiveis ? `${N.fmtPontos(v.pontos)} / ${v.possiveis} pts` : 'sem pontuação';
    });
    container.querySelectorAll('[data-out]').forEach((el) => {
      const v = saidas[el.dataset.out];
      if (v !== undefined) el.textContent = v;
    });
  },

  _textoFalta(calc) {
    if (calc.completa) return '';
    const falta = [];
    if (calc.nc.nota === null) falta.push('NCs aceitas');
    if (calc.chk.nota === null) falta.push('pontos do checklist');
    if (calc.comp.faltando) falta.push(`${calc.comp.faltando} nota(s) comportamental(is)`);
    return 'Nota geral incompleta — falta: ' + falta.join(', ');
  },

  // =========================================================
  // RELATÓRIO (A4 · tela, imprimir, PDF e DOCX)
  // Mesmo padrão visual do relatório de vistoria (classes .rpt-*).
  // O modelo abaixo alimenta a tela e a exportação
  // (RelatorioExport.pdfAuditoria / docxAuditoria).
  // =========================================================

  /** Monta todos os dados do relatório da auditoria (sem HTML). */
  modeloRelatorio(id) {
    const aud = Auditorias10SQuery.obter(id);
    if (!aud) return null;
    const Q = Auditorias10SQuery;
    const N = Nota10S;
    const P = PESOS_NOTA_10S;
    const calc = Q.calcular(id);
    const itens = Q.itens(id);
    const porSenso = {};
    itens.forEach((i) => (porSenso[i.senso] = porSenso[i.senso] || []).push(i));
    const notaTxt = (n) => (n === null || n === undefined ? '—' : N.fmt(n));

    const sensos = CHECKLIST_10S.map((sn) => {
      const lista = porSenso[sn.senso] || [];
      const r = calc.chk.porSenso[sn.senso] || { pontos: 0, possiveis: 0 };
      return {
        num: sn.senso,
        nome: sn.nome,
        japones: sn.japones || '',
        aviso: sn.aviso || '',
        pontos: r.possiveis ? r.pontos : null,
        possiveis: r.possiveis,
        pct: r.possiveis ? (r.pontos / r.possiveis) * 100 : null,
        pontosTxt: r.possiveis ? `${N.fmtPontos(r.pontos)} / ${r.possiveis} pts` : 'sem pontuação',
        itens: lista.map((i, k) => ({
          codigo: `${sn.senso}.${k + 1}`,
          pergunta: i.pergunta || '',
          resposta: i.resposta || '',
          pontos: i.pontos === null || i.pontos === undefined || i.pontos === '' ? null : Number(i.pontos),
          pontosTxt: i.pontos === null || i.pontos === undefined || i.pontos === '' ? '—' : N.fmtPontos(Number(i.pontos)),
          obs: i.obs || '',
        })),
      };
    });

    const acoes = Q.acoes(id).map((a) => ({
      numero: String(a.numero ?? '').padStart(2, '0'),
      nc: a.nao_conformidade || '',
      acao: a.acao || '',
      responsavel: a.responsavel || '',
      onde: a.onde || '',
      prazoPrevisto: a.prazo_previsto ? Utils.formatarData(a.prazo_previsto) : '—',
      prazoRealizado: a.prazo_realizado ? Utils.formatarData(a.prazo_realizado) : '—',
      status: a.status || 'Pendente',
      atrasada: Q.acaoAtrasada(a),
      obs: a.observacoes || '',
    }));

    const dataCod = String(aud.data || '').replace(/-/g, '') || 'SD';
    const compFaltaTudo = calc.comp.faltando === CRITERIOS_COMPORTAMENTAIS.length;
    return {
      id,
      codigo: `AUD-${dataCod}-${String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}`,
      data: Utils.formatarData(aud.data),
      area: aud.area_numero ? `Área ${aud.area_numero}` : '',
      rodada: aud.rodada ? `${aud.rodada}ª auditoria` : '',
      status: aud.status || '',
      auditores: aud.auditores || '',
      prefeito: aud.prefeito || '',
      locais: aud.area_descricao || '',
      observacao: aud.observacao || '',
      completa: calc.completa,
      aviso: this._textoFalta(calc),
      geral: calc.geral,
      geralTxt: calc.completa ? N.fmt(calc.geral) : '—',
      geralParcialTxt: N.fmt(calc.geral),
      componentes: [
        { nome: 'Não conformidades', peso: P.nc, nota: calc.nc.nota, notaTxt: notaTxt(calc.nc.nota),
          detalhe: `${calc.nc.encontradas} encontradas · ${calc.nc.aceitas ?? '—'} aceitas`, ponderado: N.fmt(calc.ponderadoNc) },
        { nome: 'Checklist 10S', peso: P.checklist, nota: calc.chk.nota, notaTxt: notaTxt(calc.chk.nota),
          detalhe: `${N.fmtPontos(calc.chk.pontos)} de ${calc.chk.possiveis} pontos`, ponderado: N.fmt(calc.ponderadoChk) },
        { nome: 'Comportamental / técnica', peso: P.comportamental, nota: compFaltaTudo ? null : calc.comp.total,
          notaTxt: compFaltaTudo ? '—' : N.fmt(calc.comp.total),
          detalhe: calc.comp.faltando ? `${calc.comp.faltando} critério(s) sem nota` : `${CRITERIOS_COMPORTAMENTAIS.length} critérios avaliados`,
          ponderado: N.fmt(calc.ponderadoComp) },
      ],
      semPontuacao: calc.chk.semPontuacao,
      comportamental: calc.comp.linhas.map((l) => ({ nome: l.nome, peso: l.peso, notaTxt: l.nota === null ? '—' : N.fmt(l.nota, 1), ponderada: N.fmt(l.ponderada) })),
      compTotal: N.fmt(calc.comp.total),
      sensos,
      acoes,
      acoesAbertas: acoes.filter((a) => ['Pendente', 'Em andamento'].includes(a.status)).length,
      acoesAtrasadas: acoes.filter((a) => a.atrasada).length,
      geradoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    };
  },

  _renderRelatorio(container, id) {
    const m = this.modeloRelatorio(id);
    if (!m) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Auditoria não encontrada</h3>
        <p>Ela pode ter sido excluída por outro usuário.</p><button class="btn btn-secondary" id="rel-volta">Voltar para a lista</button></div>`;
      Utils.qs('rel-volta').addEventListener('click', () => Router.navigate('auditorias-10s'));
      return;
    }
    const esc = (s) => Utils.escapeHtml(String(s ?? ''));
    const txt = (s, vazio = 'Não informado.') => (s ? Utils.nl2br(s) : `<span class="rpt-vazio">${vazio}</span>`);
    const campo = (rotulo, valor) => `<div class="rpt-campo"><span class="rpt-rotulo">${rotulo}</span><span class="rpt-valor">${valor ? esc(valor) : '—'}</span></div>`;
    const barra = (n, max = 10) => `<span class="rpt-barra" aria-hidden="true"><i style="width:${n === null || n === undefined ? 0 : Math.max(0, Math.min(100, (n / max) * 100)).toFixed(1)}%"></i></span>`;
    const resultado = (p) => (p === null ? '<span class="rpt-res res-na">Não avaliado</span>'
      : p >= 1 ? '<span class="rpt-res res-ok">Conforme</span>'
      : p > 0 ? '<span class="rpt-res res-parcial">Em parte</span>'
      : '<span class="rpt-res res-nok">Não conforme</span>');

    const blocosSenso = m.sensos.map((s) => `
      <div class="rpt-senso">
        <div class="rpt-senso-cab">
          <h3><span class="rpt-nc-num">${String(s.num).padStart(2, '0')}</span>Senso de ${esc(s.nome)}${s.japones ? ` <em>${esc(s.japones)}</em>` : ''}</h3>
          <span class="rpt-senso-pts">${esc(s.pontosTxt)}</span>
        </div>
        ${s.itens.length ? `<div class="rpt-tabela-wrap"><table class="rpt-tabela rpt-chk">
          <thead><tr><th class="c-cod">Nº</th><th>Item auditado</th><th class="c-resp-chk">Resposta</th><th class="c-pts">Pontos</th><th class="c-res">Resultado</th><th class="c-obs">Observação</th></tr></thead>
          <tbody>${s.itens.map((i) => `<tr>
            <td class="c-cod">${esc(i.codigo)}</td>
            <td data-label="Item auditado">${esc(i.pergunta)}</td>
            <td class="c-resp-chk" data-label="Resposta">${esc(i.resposta) || '—'}</td>
            <td class="c-pts" data-label="Pontos">${esc(i.pontosTxt)}</td>
            <td class="c-res" data-label="Resultado">${resultado(i.pontos)}</td>
            <td class="c-obs" data-label="Observação">${i.obs ? esc(i.obs) : '<span class="rpt-vazio">—</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`
        : `<div class="rpt-sem-fotos">${esc(s.aviso || 'Sem itens neste senso.')}</div>`}
      </div>`).join('');

    container.innerHTML = `
      <div class="report-toolbar rpt-toolbar no-print">
        <button class="btn btn-secondary" id="rel-voltar">← Voltar à auditoria</button>
        <div class="rpt-toolbar-acoes">
          <button class="btn btn-secondary" id="rel-share">Compartilhar</button>
          <button class="btn btn-secondary" id="rel-imprimir">Imprimir</button>
          <button class="btn btn-secondary" id="rel-docx">Baixar documento editável</button>
          <button class="btn btn-primary" id="rel-pdf">Baixar PDF</button>
        </div>
      </div>

      <article class="report-page rpt rpt-aud">
        <header class="rpt-cabecalho">
          <div class="rpt-logo"><img src="assets/images/logo-exemplo.jpeg" alt="Distribuidora Exemplo"></div>
          <div class="rpt-titulo">
            <div class="rpt-titulo-sup">GESTÃO DA QUALIDADE · 10S</div>
            <h1>Relatório de Auditoria 10S</h1>
          </div>
          <dl class="rpt-doc">
            <div><dt>Documento</dt><dd>${esc(m.codigo)}</dd></div>
            <div><dt>Data</dt><dd>${esc(m.data)}</dd></div>
            <div><dt>Status</dt><dd>${esc(m.status) || '—'}</dd></div>
          </dl>
          <div class="rpt-abelha"><img src="assets/images/selo-qualidade.png" alt="Selo da Qualidade"></div>
        </header>
        <div class="rpt-faixa" aria-hidden="true"></div>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>1</span>Identificação da auditoria</h2>
          <div class="rpt-grade g4">
            ${campo('Data da auditoria', m.data)}
            ${campo('Área', m.area)}
            ${campo('Auditoria nº', m.rodada)}
            ${campo('Status', m.status)}
          </div>
          <div class="rpt-grade g2c">
            ${campo('Auditores', m.auditores)}
            ${campo('Prefeito e subprefeito', m.prefeito)}
          </div>
          <div class="rpt-grade g1">${campo('Locais da área', m.locais)}</div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>2</span>Resultado da auditoria</h2>
          <div class="rpt-aud-resultado">
            <div class="rpt-aud-geral">
              <span class="rpt-rotulo">Nota geral</span>
              <strong>${esc(m.geralTxt)}<small>/ 10</small></strong>
              ${barra(m.completa ? m.geral : null)}
              <span class="rpt-aud-geral-sub">${m.completa ? 'NCs 40% · Checklist 30% · Comportamental 30%' : 'Cálculo incompleto'}</span>
            </div>
            <div class="rpt-aud-comps">
              ${m.componentes.map((c) => `<div class="rpt-aud-comp">
                <div class="rpt-aud-comp-top"><span class="rpt-rotulo">${esc(c.nome)}</span><span class="rpt-peso">Peso ${c.peso}%</span></div>
                <strong>${esc(c.notaTxt)}</strong>${barra(c.nota)}
                <span class="rpt-aud-comp-det">${esc(c.detalhe)}</span>
              </div>`).join('')}
            </div>
          </div>
          ${m.completa ? '' : `<div class="rpt-alerta">${esc(m.aviso)}</div>`}
          <div class="rpt-kpis k4">
            <div class="rpt-kpi"><strong>${m.acoes.length}</strong><span>Ações no plano</span></div>
            <div class="rpt-kpi"><strong>${m.acoesAbertas}</strong><span>Ações em aberto</span></div>
            <div class="rpt-kpi ${m.acoesAtrasadas ? 'alerta' : ''}"><strong>${m.acoesAtrasadas}</strong><span>Ações atrasadas</span></div>
            <div class="rpt-kpi"><strong>${m.semPontuacao}</strong><span>Itens sem pontuação</span></div>
          </div>
          <div class="rpt-bloco">
            <div class="rpt-rotulo">Observações gerais</div>
            <div class="rpt-texto">${txt(m.observacao, 'Nenhuma observação registrada.')}</div>
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>3</span>Desempenho por senso</h2>
          <div class="rpt-tabela-wrap">
            <table class="rpt-tabela rpt-desemp">
              <thead><tr><th class="c-cod">Senso</th><th>Descrição</th><th class="c-pts2">Pontos</th><th class="c-bar">Aproveitamento</th></tr></thead>
              <tbody>${m.sensos.map((s) => `<tr>
                <td class="c-cod">${String(s.num).padStart(2, '0')}</td>
                <td data-label="Descrição"><strong>${esc(s.nome)}</strong>${s.japones ? ` <em class="rpt-jp">${esc(s.japones)}</em>` : ''}</td>
                <td class="c-pts2" data-label="Pontos">${s.possiveis ? `${Nota10S.fmtPontos(s.pontos)} / ${s.possiveis}` : '—'}</td>
                <td class="c-bar" data-label="Aproveitamento">${s.pct === null ? '<span class="rpt-vazio">Não avaliado</span>' : `<span class="rpt-pct">${barra(s.pct, 100)}<b>${Math.round(s.pct)}%</b></span>`}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>4</span>Checklist dos 10 sensos</h2>
          <p class="rpt-legenda">Pontuação: 1 = conforme · 0,5 = em parte · 0 = não conforme · — = não avaliado</p>
          ${blocosSenso}
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>5</span>Plano de ação</h2>
          <div class="rpt-tabela-wrap">
            <table class="rpt-tabela rpt-plano">
              <thead><tr><th class="c-nc">Nº</th><th class="c-ncdesc">Não conformidade</th><th>Ação</th><th class="c-resp">Responsável</th><th class="c-prazo">Prazo previsto</th><th class="c-prazo">Realizado</th><th class="c-status">Status</th></tr></thead>
              <tbody>${m.acoes.length ? m.acoes.map((a) => `<tr>
                <td class="c-nc">${esc(a.numero)}</td>
                <td class="c-ncdesc" data-label="Não conformidade">${esc(a.nc) || '—'}</td>
                <td data-label="Ação">${esc(a.acao) || '—'}${a.obs ? `<div class="rpt-obs-acao"><strong>Obs.:</strong> ${esc(a.obs)}</div>` : ''}</td>
                <td class="c-resp" data-label="Responsável">${esc(a.responsavel) || '—'}${a.onde ? `<div class="rpt-sub">${esc(a.onde)}</div>` : ''}</td>
                <td class="c-prazo" data-label="Prazo previsto">${esc(a.prazoPrevisto)}</td>
                <td class="c-prazo" data-label="Realizado">${esc(a.prazoRealizado)}</td>
                <td class="c-status" data-label="Status"><span class="rpt-st ${a.atrasada ? 'st-atrasada' : 'st-' + esc(a.status.toLowerCase().normalize('NFD').replace(/[^a-z]/g, ''))}">${esc(a.status)}${a.atrasada ? ' · atrasada' : ''}</span></td>
              </tr>`).join('') : '<tr><td colspan="7" class="rpt-vazio">Nenhuma ação registrada.</td></tr>'}</tbody>
            </table>
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>6</span>Nota do prefeito</h2>
          <div class="rpt-tabela-wrap">
            <table class="rpt-tabela rpt-notas">
              <thead><tr><th>Nota comportamental / técnica</th><th class="c-num">Peso</th><th class="c-num">Nota</th><th class="c-num">Ponderada</th></tr></thead>
              <tbody>${m.comportamental.map((l) => `<tr>
                <td>${esc(l.nome)}</td><td class="c-num" data-label="Peso">${l.peso}%</td><td class="c-num" data-label="Nota">${esc(l.notaTxt)}</td><td class="c-num" data-label="Ponderada">${esc(l.ponderada)}</td>
              </tr>`).join('')}
              <tr class="rpt-total"><td colspan="3">Total comportamental</td><td class="c-num" data-label="Total">${esc(m.compTotal)}</td></tr></tbody>
            </table>
          </div>
          <div class="rpt-tabela-wrap rpt-mt">
            <table class="rpt-tabela rpt-notas">
              <thead><tr><th>Avaliação integrada</th><th class="c-num">Peso</th><th class="c-num">Resultado</th><th class="c-num">Ponderado</th></tr></thead>
              <tbody>${m.componentes.map((c) => `<tr>
                <td>${esc(c.nome)} <span class="rpt-sub-in">(${esc(c.detalhe)})</span></td><td class="c-num" data-label="Peso">${c.peso}%</td><td class="c-num" data-label="Resultado">${esc(c.notaTxt)}</td><td class="c-num" data-label="Ponderado">${esc(c.ponderado)}</td>
              </tr>`).join('')}
              <tr class="rpt-total"><td colspan="3">Nota geral${m.completa ? '' : ' (incompleta)'}</td><td class="c-num" data-label="Nota geral">${esc(m.geralParcialTxt)}</td></tr></tbody>
            </table>
          </div>
        </section>

        <footer class="rpt-rodape">
          <span>Distribuidora Exemplo · Gestão da Qualidade · ${esc(m.codigo)}</span>
          <span>Gerado em ${esc(m.geradoEm)}</span>
        </footer>
      </article>`;

    Utils.qs('rel-voltar').addEventListener('click', () => Router.navigate(`auditorias-10s/${id}/checklist`));
    Utils.qs('rel-imprimir').addEventListener('click', () => this._imprimir(Auditorias10SQuery.obter(id)));
    Utils.qs('rel-share').addEventListener('click', () => RelatoriosModule._compartilhar(id, 'auditoria'));
    Utils.qs('rel-pdf').addEventListener('click', (e) => this._exportar('pdf', id, e.currentTarget));
    Utils.qs('rel-docx').addEventListener('click', (e) => this._exportar('docx', id, e.currentTarget));
  },

  async _exportar(tipo, id, btn) {
    if (!window.RelatorioExport) { Utils.toast('Módulo de exportação não carregado.', 'erro'); return; }
    const m = this.modeloRelatorio(id);
    if (!m) return;
    const rotulo = btn.textContent;
    document.querySelectorAll('#rel-pdf, #rel-docx').forEach((b) => { b.disabled = true; });
    btn.textContent = tipo === 'pdf' ? 'Gerando PDF…' : 'Gerando DOCX…';
    try {
      if (tipo === 'pdf') await window.RelatorioExport.pdfAuditoria(m);
      else await window.RelatorioExport.docxAuditoria(m);
      Utils.toast(tipo === 'pdf' ? 'PDF gerado.' : 'Documento editável (DOCX) gerado.');
    } catch (err) {
      console.error('[Qualidade10S] Falha ao exportar relatório da auditoria:', err);
      Utils.toast(tipo === 'pdf'
        ? 'Não foi possível gerar o PDF (' + (err.message || err) + '). Use "Imprimir" → Salvar como PDF.'
        : 'Não foi possível gerar o DOCX (' + (err.message || err) + ').', 'erro');
    } finally {
      document.querySelectorAll('#rel-pdf, #rel-docx').forEach((b) => { b.disabled = false; });
      btn.textContent = rotulo;
    }
  },

  /** Abre a impressão (A4). O título da página vira o nome sugerido do arquivo PDF. */
  _imprimir(aud) {
    const nomeArquivo = [
      'Auditoria 10S',
      aud.area_numero ? `Area ${aud.area_numero}` : '',
      `${aud.rodada}a auditoria`,
      aud.data || '',
    ].filter(Boolean).join(' - ');
    const tituloOriginal = document.title;
    document.title = nomeArquivo;
    document.body.classList.add('printing-report');
    const finalizar = () => {
      document.body.classList.remove('printing-report');
      document.title = tituloOriginal;
      window.removeEventListener('afterprint', finalizar);
    };
    window.addEventListener('afterprint', finalizar);
    setTimeout(() => window.print(), 50);
  },

  // =========================================================
  // ABA: CHECKLIST
  // =========================================================
  _abaChecklist(container, id) {
    const holder = Utils.qs('aud-aba');
    const esc = Utils.escapeHtml;
    const itens = Auditorias10SQuery.itens(id);
    const porSenso = {};
    itens.forEach((i) => (porSenso[i.senso] = porSenso[i.senso] || []).push(i));
    const pontosOpt = (v) => {
      const cur = v === null || v === undefined ? '' : String(Number(v));
      return [['', '—'], ['0', '0'], ['0.5', '0,5'], ['1', '1']]
        .map(([val, txt]) => `<option value="${val}" ${cur === val ? 'selected' : ''}>${txt}</option>`).join('');
    };

    const blocos = CHECKLIST_10S.map((s) => {
      const lista = porSenso[s.senso] || [];
      const corpo = lista.length
        ? `<table class="data-table chk-table">
            <thead><tr><th>Item auditado</th><th>Resposta</th><th>Pontos</th><th>Observação</th></tr></thead>
            <tbody>${lista.map((i) => `
              <tr data-item="${i.id}">
                <td class="chk-pergunta">${esc(i.pergunta)}</td>
                <td><select data-w data-c="resposta" aria-label="Resposta">
                  <option value="">—</option>
                  <option ${i.resposta === 'Sim' ? 'selected' : ''}>Sim</option>
                  <option ${i.resposta === 'Não' ? 'selected' : ''}>Não</option>
                </select></td>
                <td><select data-w data-c="pontos" aria-label="Pontos">${pontosOpt(i.pontos)}</select></td>
                <td><input type="text" data-w data-c="obs" value="${esc(i.obs)}" placeholder="Observação"></td>
              </tr>`).join('')}
            </tbody></table>`
        : `<div class="table-empty">${esc(s.aviso || 'Sem itens neste senso.')}</div>`;
      return `
        <div class="nc-block open" data-senso-bloco="${s.senso}">
          <div class="nc-block-header" data-toggle>
            <span class="nc-num-badge">${s.senso}</span>
            <span class="nc-title-txt">Senso de ${esc(s.nome)} <span class="hint-inline">· ${esc(s.japones)}</span></span>
            <span class="chk-total" data-out="senso-${s.senso}"></span>
            <span class="nc-collapse-icon">▾</span>
          </div>
          <div class="nc-block-body chk-body">${corpo}</div>
        </div>`;
    }).join('');

    holder.innerHTML = `
      <p class="hint-inline" style="margin-bottom:12px">Marque Sim/Não: os pontos são sugeridos (1 ou 0) e você pode ajustar para 0,5 quando a conformidade for parcial.
      Item sem pontos não foi avaliado e fica fora do cálculo. <strong data-out="chk-aviso" class="chk-aviso"></strong></p>
      ${blocos}`;

    holder.querySelectorAll('[data-toggle]').forEach((h) =>
      h.addEventListener('click', () => h.parentElement.classList.toggle('open'))
    );
    holder.querySelectorAll('tr[data-item] [data-c]').forEach((el) =>
      el.addEventListener('change', () => this._salvarItem(container, id, el.closest('tr'), el))
    );
  },

  _salvarItem(container, id, tr, el) {
    const item = Store.getById('auditoria_itens', tr.dataset.item);
    if (!item) return;
    const Q = Auditorias10SQuery;
    const campo = el.dataset.c;
    const patch = {};
    if (campo === 'resposta') {
      const nova = el.value || null;
      const atual = item.pontos === null || item.pontos === undefined ? null : Number(item.pontos);
      // só troca os pontos se eram vazios ou o valor sugerido da resposta anterior (não pisa em ajuste manual)
      if (atual === null || atual === Q.pontosSugeridos(item.resposta, item.invertida)) {
        patch.pontos = Q.pontosSugeridos(nova, item.invertida);
        tr.querySelector('[data-c="pontos"]').value = patch.pontos === null ? '' : String(patch.pontos);
      }
      patch.resposta = nova;
    } else if (campo === 'pontos') {
      patch.pontos = el.value === '' ? null : Number(el.value);
    } else {
      patch.obs = el.value;
    }
    Q.atualizarItem(item.id, patch);
    this._atualizarSaidas(container, id);
  },

  // =========================================================
  // ABA: PLANO DE AÇÃO
  // =========================================================
  _abaPlano(container, id) {
    const holder = Utils.qs('aud-aba');
    const esc = Utils.escapeHtml;
    const Q = Auditorias10SQuery;
    const acoes = Q.acoes(id);

    const linhas = acoes.map((a) => {
      const atrasada = Q.acaoAtrasada(a);
      return `<tr class="${a.status === 'Cancelado' ? 'row-cancelada' : ''}" data-acao="${a.id}">
        <td><strong>${a.numero}</strong></td>
        <td>${esc(a.nao_conformidade) || '—'}</td>
        <td><div class="plano-acao" title="${esc(a.acao)}">${esc(a.acao) || '—'}</div></td>
        <td>${esc(a.responsavel) || '—'}</td>
        <td>${esc(a.onde) || '—'}</td>
        <td>${Utils.formatarData(a.prazo_previsto)}</td>
        <td>${Utils.formatarData(a.prazo_realizado)}</td>
        <td class="plano-status">
          <select data-w data-acao-status="${a.id}" aria-label="Status da ação">
            ${STATUS_ACAO_10S.map((s) => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          ${atrasada ? '<span class="tag tag-atrasada">Atrasada</span>' : ''}
        </td>
        <td class="td-acoes">
          <button class="btn btn-ghost btn-sm" data-ver="${a.id}" title="Abrir">✎</button>
          <button class="btn btn-ghost btn-sm" data-del="${a.id}" data-w title="Excluir ação">🗑</button>
        </td>
      </tr>`;
    }).join('');

    holder.innerHTML = `
      <div class="section-row" style="margin-top:0">
        <h2>Plano de ação (${acoes.length})</h2>
        <button class="btn btn-primary btn-sm" id="p-nova" data-w>+ Nova ação</button>
      </div>
      <div class="table-wrap">
        ${acoes.length ? `<table class="data-table plano-table">
          <thead><tr><th>Nº</th><th>Não conformidade</th><th>Ação</th><th>Responsável<br><span class="hint-inline">Prefeito / Sub</span></th><th>Onde</th><th>Prazo previsto</th><th>Prazo realizado</th><th>Status</th><th></th></tr></thead>
          <tbody>${linhas}</tbody></table>`
          : '<div class="table-empty">Nenhuma ação cadastrada. Cada não conformidade encontrada na auditoria vira uma linha aqui.</div>'}
      </div>
      <p class="hint-inline" style="margin-top:10px">As ações que não estão canceladas contam como “NCs encontradas” na nota. Ações abertas com prazo vencido aparecem como “Atrasada”.</p>`;

    Utils.qs('p-nova').addEventListener('click', () => this._abrirModalAcao(container, id, null));
    holder.querySelectorAll('[data-ver]').forEach((b) =>
      b.addEventListener('click', () => this._abrirModalAcao(container, id, b.dataset.ver))
    );
    holder.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = Store.getById('auditoria_acoes', b.dataset.del);
        if (!a || !Utils.confirmar(`Excluir a ação nº ${a.numero}? Se a NC só foi desconsiderada, prefira marcar como “Cancelado”.`)) return;
        Q.excluirAcao(a.id);
        Utils.toast('Ação excluída.');
        this._abaPlano(container, id);
        this._atualizarSaidas(container, id);
      })
    );
    holder.querySelectorAll('[data-acao-status]').forEach((sel) =>
      sel.addEventListener('change', () => {
        const a = Store.getById('auditoria_acoes', sel.dataset.acaoStatus);
        if (!a) return;
        const patch = { status: sel.value };
        if (sel.value === 'Concluída' && !a.prazo_realizado) {
          patch.prazo_realizado = Utils.hoje();
          Utils.toast('Ação concluída — prazo realizado preenchido com hoje.');
        }
        Q.atualizarAcao(a.id, patch);
        this._abaPlano(container, id);
        this._atualizarSaidas(container, id);
      })
    );
  },

  _abrirModalAcao(container, auditoriaId, acaoId) {
    const Q = Auditorias10SQuery;
    const esc = Utils.escapeHtml;
    const somenteLeitura = !Auth.podeEscrever() || Edicao.travado();
    const a = acaoId ? Store.getById('auditoria_acoes', acaoId) : null;
    if (acaoId && !a) return;

    Modal.open({
      title: a ? `Ação nº ${a.numero}` : 'Nova ação',
      size: 'lg',
      bodyHtml: `
        <div class="form-grid">
          <div class="field"><label>Nº</label><input type="number" id="pa-num" min="1" step="1" value="${a ? a.numero : Q.proximoNumeroAcao(auditoriaId)}"></div>
          <div class="field"><label>Status</label>
            <select id="pa-status">${STATUS_ACAO_10S.map((s) => `<option ${(a ? a.status : 'Pendente') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="field span-2"><label>Não conformidade</label><input type="text" id="pa-nc" value="${a ? esc(a.nao_conformidade) : ''}"></div>
          <div class="field span-2"><label>Ação</label><textarea id="pa-acao" rows="5">${a ? esc(a.acao) : ''}</textarea></div>
          <div class="field"><label>Responsável (prefeito / subprefeito)</label><input type="text" id="pa-resp" value="${a ? esc(a.responsavel) : ''}"></div>
          <div class="field"><label>Onde</label><input type="text" id="pa-onde" value="${a ? esc(a.onde) : ''}"></div>
          <div class="field"><label>Prazo previsto</label><input type="date" id="pa-prev" value="${a && a.prazo_previsto ? a.prazo_previsto : ''}"></div>
          <div class="field"><label>Prazo realizado</label><input type="date" id="pa-real" value="${a && a.prazo_realizado ? a.prazo_realizado : ''}"></div>
          <div class="field span-2"><label>Observações / status</label><textarea id="pa-obs">${a ? esc(a.observacoes) : ''}</textarea></div>
        </div>
        <div class="form-aviso form-aviso-erro hidden" id="pa-erro"></div>`,
      footerHtml: `<button class="btn btn-secondary" id="pa-cancelar">${somenteLeitura ? 'Fechar' : 'Cancelar'}</button>
        ${somenteLeitura ? '' : '<button class="btn btn-primary" id="pa-salvar">Salvar</button>'}`,
    });

    if (somenteLeitura) {
      ['pa-num', 'pa-status', 'pa-nc', 'pa-acao', 'pa-resp', 'pa-onde', 'pa-prev', 'pa-real', 'pa-obs']
        .forEach((i) => { Utils.qs(i).disabled = true; });
    }
    Utils.qs('pa-cancelar').addEventListener('click', () => Modal.close());
    const salvar = Utils.qs('pa-salvar');
    if (!salvar) return;
    salvar.addEventListener('click', () => {
      const numero = parseInt(Utils.qs('pa-num').value, 10);
      const erro = Utils.qs('pa-erro');
      const nc = Utils.qs('pa-nc').value.trim();
      if (!Number.isInteger(numero) || numero < 1) { erro.textContent = 'Informe o número da ação.'; erro.classList.remove('hidden'); return; }
      if (!nc) { erro.textContent = 'Descreva a não conformidade.'; erro.classList.remove('hidden'); return; }
      const dados = {
        numero,
        nao_conformidade: nc,
        acao: Utils.qs('pa-acao').value.trim(),
        responsavel: Utils.qs('pa-resp').value.trim(),
        onde: Utils.qs('pa-onde').value.trim(),
        prazo_previsto: Utils.qs('pa-prev').value || null,
        prazo_realizado: Utils.qs('pa-real').value || null,
        status: Utils.qs('pa-status').value,
        observacoes: Utils.qs('pa-obs').value.trim(),
      };
      if (a) Q.atualizarAcao(a.id, dados);
      else Q.criarAcao(auditoriaId, dados);
      Modal.close();
      Utils.toast(a ? 'Ação atualizada.' : 'Ação adicionada.');
      this._abaPlano(container, auditoriaId);
      this._atualizarSaidas(container, auditoriaId);
    });
  },

  // =========================================================
  // ABA: NOTA DO PREFEITO
  // =========================================================
  _abaNota(container, id) {
    const holder = Utils.qs('aud-aba');
    const aud = Auditorias10SQuery.obter(id);
    const P = PESOS_NOTA_10S;
    const notaInput = (c) => {
      const v = aud[c.campo];
      return `<input type="number" class="nota-input" data-w data-nota="${c.campo}" min="0" max="10" step="0.5" value="${v === null || v === undefined ? '' : Number(v)}" aria-label="${Utils.escapeHtml(c.nome)}">`;
    };

    holder.innerHTML = `
      <div class="nota-grid">
        <div class="card">
          <div class="card-title">1 · Não conformidades</div>
          <table class="data-table nota-table"><tbody>
            <tr><td>NCs encontradas <span class="hint-inline">(ações do plano, sem as canceladas)</span></td><td class="nota-num" data-out="nc-encontradas">—</td></tr>
            <tr><td>NCs aceitas na área</td><td class="nota-num"><input type="number" id="n-aceitas" class="nota-input" data-w min="0" step="1" value="${aud.nc_aceitas ?? ''}"></td></tr>
            <tr><td><strong>Nota</strong> <span class="hint-inline">10 × (1 − encontradas ÷ aceitas)</span></td><td class="nota-num"><strong data-out="nc-nota">—</strong></td></tr>
          </tbody></table>
        </div>

        <div class="card">
          <div class="card-title">2 · Checklist</div>
          <table class="data-table nota-table"><tbody>
            <tr><td>Pontos obtidos</td><td class="nota-num" data-out="chk-pontos">—</td></tr>
            <tr><td>Pontos possíveis <span class="hint-inline">(itens avaliados)</span></td><td class="nota-num" data-out="chk-possiveis">—</td></tr>
            <tr><td><strong>Nota</strong> <span class="hint-inline">obtidos ÷ possíveis × 10</span></td><td class="nota-num"><strong data-out="chk-nota">—</strong></td></tr>
          </tbody></table>
          <p class="hint-inline chk-aviso" data-out="chk-aviso" style="margin-top:8px"></p>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title">3 · Nota comportamental / técnica <span class="hint-inline">(notas de 0 a 10; critério sem nota conta 0)</span></div>
        <table class="data-table nota-table">
          <thead><tr><th>Critério</th><th class="nota-num">Peso</th><th class="nota-num">Nota</th><th class="nota-num">Nota ponderada</th></tr></thead>
          <tbody>
            ${CRITERIOS_COMPORTAMENTAIS.map((c) => `<tr>
              <td>${Utils.escapeHtml(c.nome)}</td><td class="nota-num">${c.peso}%</td>
              <td class="nota-num">${notaInput(c)}</td><td class="nota-num" data-out="comp-${c.campo}">—</td></tr>`).join('')}
            <tr class="nota-total"><td colspan="3"><strong>Total</strong></td><td class="nota-num"><strong data-out="comp-total">—</strong></td></tr>
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-title">Avaliação integrada</div>
        <table class="data-table nota-table">
          <thead><tr><th>Critério</th><th class="nota-num">Peso</th><th class="nota-num">Resultado</th><th class="nota-num">Ponderado</th></tr></thead>
          <tbody>
            <tr><td>Não conformidade</td><td class="nota-num">${P.nc}%</td><td class="nota-num" data-out="int-nc">—</td><td class="nota-num" data-out="pond-nc">—</td></tr>
            <tr><td>Checklist</td><td class="nota-num">${P.checklist}%</td><td class="nota-num" data-out="int-chk">—</td><td class="nota-num" data-out="pond-chk">—</td></tr>
            <tr><td>Nota comportamental / técnica</td><td class="nota-num">${P.comportamental}%</td><td class="nota-num" data-out="int-comp">—</td><td class="nota-num" data-out="pond-comp">—</td></tr>
            <tr class="nota-total"><td colspan="3"><strong>Nota geral</strong></td><td class="nota-num nota-geral"><strong data-out="geral-tab">—</strong></td></tr>
          </tbody>
        </table>
        <p class="hint-inline" style="margin-top:8px" data-out="geral-obs"></p>
      </div>`;

    Utils.qs('n-aceitas').addEventListener('change', (e) => {
      const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
      e.target.value = v === null ? '' : v;
      Auditorias10SQuery.atualizar(id, { nc_aceitas: v });
      this._atualizarSaidas(container, id);
    });
    holder.querySelectorAll('[data-nota]').forEach((inp) =>
      inp.addEventListener('change', () => {
        let v = null;
        if (inp.value !== '') {
          v = parseFloat(String(inp.value).replace(',', '.'));
          if (!Number.isFinite(v) || v < 0 || v > 10) {
            Utils.toast('A nota deve estar entre 0 e 10.', 'erro');
            const atual = Auditorias10SQuery.obter(id)[inp.dataset.nota];
            inp.value = atual === null || atual === undefined ? '' : Number(atual);
            return;
          }
        }
        Auditorias10SQuery.atualizar(id, { [inp.dataset.nota]: v });
        this._atualizarSaidas(container, id);
      })
    );
  },
};

window.Auditorias10SModule = Auditorias10SModule;
