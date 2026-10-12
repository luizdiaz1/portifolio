/**
 * modules/relatorios/relatorios.js
 * Central de relatórios do sistema: abas separadas para Vistorias e Auditorias 10S.
 *   #/relatorios                -> aba Vistorias (padrão)
 *   #/relatorios/vistorias      -> aba Vistorias
 *   #/relatorios/auditorias     -> aba Auditorias 10S
 *   #/relatorios/<id>           -> relatório oficial da vistoria
 *   #/auditorias-10s/<id>/relatorio -> relatório oficial da auditoria (módulo Auditorias 10S)
 * O layout do relatório de vistoria reproduz o modelo oficial enviado pela Qualidade.
 */
const RelatoriosModule = {
  render(container, params) {
    if (params.id === 'auditorias') return this._renderSeletor(container, 'auditorias');
    if (params.id && params.id !== 'vistorias') return this._renderRelatorio(container, params.id);
    this._renderSeletor(container, 'vistorias');
  },

  /** Cabeçalho + abas; o conteúdo da aba escolhida vem de _tabelaVistorias / _tabelaAuditorias. */
  _renderSeletor(container, aba) {
    const nVist = VistoriasQuery.listar().length;
    const nAud = Auditorias10SQuery.listar().length;
    container.innerHTML = `
      <div class="report-selector-head">
        <div>
          <div class="eyebrow">DOCUMENTOS DA QUALIDADE</div>
          <h2>Relatórios do sistema</h2>
          <p>Visualize, imprima em A4 ou compartilhe os relatórios oficiais da empresa.</p>
        </div>
      </div>
      <div class="tabs">
        <button class="tab-btn ${aba === 'vistorias' ? 'active' : ''}" data-rel-aba="vistorias">Vistorias (${nVist})</button>
        <button class="tab-btn ${aba === 'auditorias' ? 'active' : ''}" data-rel-aba="auditorias">Auditorias 10S (${nAud})</button>
      </div>
      <div id="rel-aba">${aba === 'auditorias' ? this._tabelaAuditorias() : this._tabelaVistorias()}</div>`;

    container.querySelectorAll('[data-rel-aba]').forEach((b) =>
      b.addEventListener('click', () => Router.navigate('relatorios/' + b.dataset.relAba))
    );
    container.querySelectorAll('[data-gerar]').forEach((b) => b.addEventListener('click', () => Router.navigate('relatorios/' + b.dataset.gerar)));
    container.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', () => this._compartilhar(b.dataset.share)));
    container.querySelectorAll('[data-gerar-aud]').forEach((b) => b.addEventListener('click', () => Router.navigate('auditorias-10s/' + b.dataset.gerarAud + '/relatorio')));
    container.querySelectorAll('[data-share-aud]').forEach((b) => b.addEventListener('click', () => this._compartilhar(b.dataset.shareAud, 'auditoria')));
  },

  _tabelaAuditorias() {
    const auditorias = Auditorias10SQuery.listar();
    const esc = Utils.escapeHtml;
    return `
      <div class="card">
        <div class="card-title">Auditorias 10S disponíveis</div>
        <div class="table-wrap">
          ${auditorias.length ? `<table class="data-table report-list-table">
            <thead><tr><th>Data</th><th>Auditoria</th><th>Área</th><th>Prefeito / Sub</th><th>Nota geral</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>${auditorias.map((a) => {
              const c = Auditorias10SQuery.calcular(a.id);
              const area = [a.area_numero ? `Área ${a.area_numero}` : '', a.area_descricao].filter(Boolean).join(' · ');
              const nota = c && c.completa
                ? `<strong>${Nota10S.fmt(c.geral)}</strong>`
                : '<span class="tag tag-atencao" title="Faltam dados para fechar a nota">incompleta</span>';
              return `<tr>
                <td>${Utils.formatarData(a.data)}</td>
                <td>${a.rodada}ª auditoria</td>
                <td>${esc(area) || '—'}</td>
                <td>${esc(a.prefeito) || '—'}</td>
                <td>${nota}</td>
                <td><span class="tag ${a.status === 'Concluída' ? 'tag-concluida' : 'tag-andamento'}">${esc(a.status)}</span></td>
                <td><div class="table-actions">
                  <button class="btn btn-primary btn-sm" data-gerar-aud="${a.id}">Ver relatório</button>
                  <button class="btn btn-secondary btn-sm" data-share-aud="${a.id}" title="Compartilhar relatório">Compartilhar</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : `<div class="table-empty">Nenhuma auditoria cadastrada ainda. Crie uma em <strong>Auditorias 10S</strong>.</div>`}
        </div>
      </div>`;
  },

  _tabelaVistorias() {
    const vistorias = VistoriasQuery.listar();
    return `
      <div class="card">
        <div class="card-title">Vistorias disponíveis</div>
        <div class="table-wrap">
          ${vistorias.length ? `<table class="data-table report-list-table">
            <thead><tr><th>Data</th><th>Área / Local</th><th>Setor / Processo</th><th>NCs</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>${vistorias.map(v => {
              const r = NCQuery.resumoVistoria(v.id);
              return `<tr>
                <td>${Utils.formatarData(v.data)}</td>
                <td><strong>${Utils.escapeHtml(v.area_local)}</strong></td>
                <td>${Utils.escapeHtml(v.setor_processo)}</td>
                <td>${r.total}</td>
                <td><span class="tag ${Utils.statusClass(v.status)}">${v.status}</span></td>
                <td><div class="table-actions">
                  <button class="btn btn-primary btn-sm" data-gerar="${v.id}">Ver relatório</button>
                  <button class="btn btn-secondary btn-sm" data-share="${v.id}" title="Compartilhar relatório">Compartilhar</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>` : `<div class="table-empty">Nenhuma vistoria cadastrada ainda. Crie uma em <strong>Vistorias</strong>.</div>`}
        </div>
      </div>`;
  },

  /* =========================================================
     RELATÓRIO DE VISTORIA (tela / impressão)
     O mesmo "modelo" alimenta a tela, o PDF e o DOCX
     (ver modules/relatorios/relatorio-export.js).
     ========================================================= */

  /** Densidade das fotos: 6 por página (2 colunas, padrão) ou 9 (3 colunas). */
  _densidade: 6,

  /** Monta todos os dados do relatório de uma vistoria (sem HTML). */
  modelo(vistoriaId) {
    const v = VistoriasQuery.obter(vistoriaId);
    if (!v) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const resumo = NCQuery.resumoVistoria(vistoriaId);
    const nomesSensos = SensosQuery.nomes();
    const ncs = NCQuery.listarPorVistoria(vistoriaId).map((nc) => {
      const sensos = NCQuery.sensosDaNC(nc.id);
      const fotos = EvidenciasQuery.listarPorNC(nc.id).map((f, i) => ({
        id: f.id,
        url: f.foto_url,
        indice: i + 1,
        legenda: `Foto ${pad(i + 1)} · NC ${pad(nc.numero)}`,
        registro: f.created_at ? new Date(f.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '',
      }));
      return {
        id: nc.id,
        numero: pad(nc.numero),
        area_local: nc.area_local || '',
        responsavel: nc.responsavel || '',
        prazo: nc.prazo ? Utils.formatarData(nc.prazo) : '',
        criticidade: nc.criticidade || '',
        descricao: nc.descricao || '',
        impacto_risco: nc.impacto_risco || '',
        acao_corretiva: nc.acao_corretiva || '',
        sensos: nomesSensos.map((s) => ({ nome: s, marcado: sensos.includes(s) })),
        sensosMarcados: nomesSensos.filter((s) => sensos.includes(s)),
        fotos,
        retorno: RetornosQuery.ultimoPorNC(nc.id) || null,
      };
    });
    const acoes = AcompanhamentoQuery.listarComContexto(vistoriaId).map((a) => ({
      nc: pad(a.nc_numero),
      acao: a.acao || '',
      responsavel: a.responsavel || '',
      prazo: a.prazo ? Utils.formatarData(a.prazo) : 'A definir',
      status: a.status || 'Pendente',
    }));
    const dataCod = String(v.data || '').replace(/-/g, '') || 'SD';
    return {
      id: v.id,
      codigo: `VST-${dataCod}-${String(v.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}`,
      data: Utils.formatarData(v.data),
      area_local: v.area_local || '',
      realizada_por: v.realizada_por || '',
      setor_processo: v.setor_processo || '',
      status: v.status || '',
      observacao: v.observacao || '',
      resumo: {
        total: resumo.total,
        criticas: resumo.criticas,
        prazos: resumo.prazosDefinidos === resumo.total && resumo.total ? 'Todos' : `${resumo.prazosDefinidos} de ${resumo.total}`,
        status: resumo.status,
      },
      ncs,
      totalFotos: ncs.reduce((s, n) => s + n.fotos.length, 0),
      acoes,
      geradoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    };
  },

  _renderRelatorio(container, vistoriaId) {
    const m = this.modelo(vistoriaId);
    if (!m) {
      container.innerHTML = `<div class="empty-state"><h3>Vistoria não encontrada</h3><p>O relatório solicitado não está disponível neste dispositivo.</p></div>`;
      return;
    }
    const esc = (s) => Utils.escapeHtml(String(s ?? ''));
    const txt = (s, vazio = 'Não informado.') => (s ? Utils.nl2br(s) : `<span class="rpt-vazio">${vazio}</span>`);
    const campo = (rotulo, valor, cls = '') => `<div class="rpt-campo ${cls}"><span class="rpt-rotulo">${rotulo}</span><span class="rpt-valor">${valor ? esc(valor) : '—'}</span></div>`;

    container.innerHTML = `
      <div class="report-toolbar rpt-toolbar no-print">
        <button class="btn btn-secondary" id="r-voltar">← Relatórios</button>
        <div class="rpt-toolbar-acoes">
          <div class="rpt-densidade" role="group" aria-label="Fotos por página">
            <span>Fotos por página</span>
            <button type="button" data-dens="6" class="${this._densidade === 6 ? 'ativo' : ''}" title="2 colunas · fotos maiores">6</button>
            <button type="button" data-dens="9" class="${this._densidade === 9 ? 'ativo' : ''}" title="3 colunas · mais fotos por página">9</button>
          </div>
          <button class="btn btn-secondary" id="r-share">Compartilhar</button>
          <button class="btn btn-secondary" id="r-imprimir">Imprimir</button>
          <button class="btn btn-secondary" id="r-docx">Baixar documento editável</button>
          <button class="btn btn-primary" id="r-pdf">Baixar PDF</button>
        </div>
      </div>

      <article class="report-page rpt dens-${this._densidade}">
        <header class="rpt-cabecalho">
          <div class="rpt-logo"><img src="assets/images/logo-exemplo.jpeg" alt="Distribuidora Exemplo"></div>
          <div class="rpt-titulo">
            <div class="rpt-titulo-sup">GESTÃO DA QUALIDADE · 10S</div>
            <h1>Relatório de Vistoria</h1>
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
          <h2 class="rpt-h2"><span>1</span>Identificação da vistoria</h2>
          <div class="rpt-grade g4">
            ${campo('Data da vistoria', m.data)}
            ${campo('Área / Local', m.area_local)}
            ${campo('Setor / Processo', m.setor_processo)}
            ${campo('Realizada por', m.realizada_por)}
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>2</span>Resumo</h2>
          <div class="rpt-kpis">
            <div class="rpt-kpi"><strong>${m.resumo.total}</strong><span>Não conformidades</span></div>
            <div class="rpt-kpi ${m.resumo.criticas ? 'alerta' : ''}"><strong>${m.resumo.criticas}</strong><span>NC críticas</span></div>
            <div class="rpt-kpi"><strong>${esc(m.resumo.prazos)}</strong><span>Prazos definidos</span></div>
            <div class="rpt-kpi"><strong>${m.totalFotos}</strong><span>Evidências fotográficas</span></div>
            <div class="rpt-kpi"><strong class="txt">${esc(m.resumo.status)}</strong><span>Status geral</span></div>
          </div>
          <div class="rpt-bloco">
            <div class="rpt-rotulo">Observação geral / principais pontos de atenção</div>
            <div class="rpt-texto">${txt(m.observacao, 'Nenhuma observação registrada.')}</div>
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>3</span>Não conformidades e evidências</h2>
          ${m.ncs.length ? m.ncs.map((nc) => this._ncHtml(nc, campo, txt, esc)).join('') : '<p class="rpt-vazio rpt-sem-nc">Nenhuma não conformidade registrada nesta vistoria.</p>'}
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>4</span>Acompanhamento das ações</h2>
          <div class="rpt-tabela-wrap">
            <table class="rpt-tabela">
              <thead><tr><th class="c-nc">NC</th><th>Ação / tratativa</th><th class="c-resp">Responsável</th><th class="c-prazo">Prazo</th><th class="c-status">Status</th></tr></thead>
              <tbody>${m.acoes.length ? m.acoes.map((a) => `<tr>
                <td class="c-nc">NC ${a.nc}</td><td data-label="Ação / tratativa">${esc(a.acao) || '—'}</td><td class="c-resp" data-label="Responsável">${esc(a.responsavel) || '—'}</td><td class="c-prazo" data-label="Prazo">${esc(a.prazo)}</td><td class="c-status" data-label="Status">${esc(a.status)}</td>
              </tr>`).join('') : '<tr><td colspan="5" class="rpt-vazio">Nenhuma ação registrada.</td></tr>'}</tbody>
            </table>
          </div>
        </section>

        <section class="rpt-secao">
          <h2 class="rpt-h2"><span>5</span>Retorno e eficácia</h2>
          <div class="rpt-tabela-wrap">
            <table class="rpt-tabela">
              <thead><tr><th class="c-nc">NC</th><th>Resultado da correção</th><th>Eficácia da ação</th></tr></thead>
              <tbody>${m.ncs.length ? m.ncs.map((nc) => `<tr>
                <td class="c-nc">NC ${nc.numero}</td>
                <td data-label="Resultado da correção">${nc.retorno ? (esc(nc.retorno.resultado_correcao) || '—') : '<span class="rpt-vazio">Pendente de registro.</span>'}</td>
                <td data-label="Eficácia da ação">${nc.retorno ? (esc(nc.retorno.eficacia) || 'Pendente de verificação') : '<span class="rpt-vazio">Pendente de verificação.</span>'}</td>
              </tr>`).join('') : '<tr><td colspan="3" class="rpt-vazio">Nenhum registro.</td></tr>'}</tbody>
            </table>
          </div>
        </section>

        <footer class="rpt-rodape">
          <span>Distribuidora Exemplo · Gestão da Qualidade · ${esc(m.codigo)}</span>
          <span>Gerado em ${esc(m.geradoEm)}</span>
        </footer>
      </article>
    `;

    Utils.qs('r-voltar').addEventListener('click', () => Router.navigate('relatorios/vistorias'));
    Utils.qs('r-imprimir').addEventListener('click', () => this._imprimir());
    Utils.qs('r-share').addEventListener('click', () => this._compartilhar(vistoriaId));
    Utils.qs('r-pdf').addEventListener('click', (e) => this._exportar('pdf', vistoriaId, e.currentTarget));
    Utils.qs('r-docx').addEventListener('click', (e) => this._exportar('docx', vistoriaId, e.currentTarget));
    container.querySelectorAll('[data-dens]').forEach((b) => b.addEventListener('click', () => {
      this._densidade = Number(b.dataset.dens) === 9 ? 9 : 6;
      container.querySelectorAll('[data-dens]').forEach((x) => x.classList.toggle('ativo', x === b));
      const pg = container.querySelector('.rpt');
      pg.classList.remove('dens-6', 'dens-9');
      pg.classList.add('dens-' + this._densidade);
    }));
    container.querySelectorAll('[data-rpt-foto]').forEach((el) => {
      el.addEventListener('click', () => {
        const nc = m.ncs.find((n) => n.id === el.dataset.rptFoto);
        if (!nc) return;
        Lightbox.open(nc.fotos.map((f) => ({ foto_url: f.url })), Number(el.dataset.idx) || 0);
      });
    });
  },

  _ncHtml(nc, campo, txt, esc) {
    const crit = (nc.criticidade || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    const fotos = nc.fotos;
    return `
      <div class="rpt-nc">
        <div class="rpt-nc-cab">
          <h3><span class="rpt-nc-num">NC ${nc.numero}</span>Não conformidade ${nc.numero}</h3>
          ${nc.criticidade ? `<span class="rpt-crit crit-${esc(crit)}">Criticidade ${esc(nc.criticidade)}</span>` : ''}
        </div>
        <div class="rpt-grade g3">
          ${campo('Área / Local', nc.area_local)}
          ${campo('Responsável', nc.responsavel)}
          ${campo('Prazo', nc.prazo || 'A definir')}
        </div>
        <div class="rpt-bloco">
          <div class="rpt-rotulo">Descrição do desvio</div>
          <div class="rpt-texto">${txt(nc.descricao)}</div>
        </div>
        <div class="rpt-bloco">
          <div class="rpt-rotulo">Senso(s) 10S infringido(s)</div>
          <ul class="rpt-sensos">${nc.sensos.map((s) => `<li class="${s.marcado ? 'on' : ''}"><i aria-hidden="true"></i>${esc(s.nome)}</li>`).join('')}</ul>
        </div>
        <div class="rpt-grade g2">
          <div class="rpt-bloco"><div class="rpt-rotulo">Impacto / risco</div><div class="rpt-texto">${txt(nc.impacto_risco)}</div></div>
          <div class="rpt-bloco acao"><div class="rpt-rotulo">Ação corretiva recomendada</div><div class="rpt-texto">${txt(nc.acao_corretiva)}</div></div>
        </div>
        <div class="rpt-evid-cab">
          <span>Evidências fotográficas · NC ${nc.numero}</span>
          <small>${fotos.length ? `${fotos.length} foto${fotos.length > 1 ? 's' : ''}` : 'sem registro'}</small>
        </div>
        ${fotos.length ? `<div class="rpt-fotos ${fotos.length === 1 ? 'unica' : ''}">${fotos.map((f, i) => `
          <figure class="rpt-foto">
            <button type="button" class="rpt-foto-img" data-rpt-foto="${esc(nc.id)}" data-idx="${i}" aria-label="Ampliar ${esc(f.legenda)}">
              <img src="${esc(f.url)}" alt="${esc(f.legenda)}" decoding="async">
            </button>
            <figcaption><strong>${esc(f.legenda)}</strong>${f.registro ? `<span>${esc(f.registro)}</span>` : ''}</figcaption>
          </figure>`).join('')}</div>` : '<div class="rpt-sem-fotos">Nenhuma evidência fotográfica registrada para esta não conformidade.</div>'}
      </div>`;
  },

  async _exportar(tipo, vistoriaId, btn) {
    if (!window.RelatorioExport) { Utils.toast('Módulo de exportação não carregado.', 'erro'); return; }
    const m = this.modelo(vistoriaId);
    if (!m) return;
    const rotulo = btn.textContent;
    document.querySelectorAll('#r-pdf, #r-docx').forEach((b) => { b.disabled = true; });
    btn.textContent = tipo === 'pdf' ? 'Gerando PDF…' : 'Gerando DOCX…';
    try {
      const progresso = (feitas, total) => { btn.textContent = `Preparando fotos ${feitas}/${total}…`; };
      if (tipo === 'pdf') await window.RelatorioExport.pdf(m, { densidade: this._densidade, progresso });
      else await window.RelatorioExport.docx(m, { densidade: this._densidade, progresso });
      Utils.toast(tipo === 'pdf' ? 'PDF gerado.' : 'Documento editável (DOCX) gerado.');
    } catch (err) {
      console.error('[Qualidade10S] Falha ao exportar relatório:', err);
      Utils.toast(tipo === 'pdf'
        ? 'Não foi possível gerar o PDF (' + (err.message || err) + '). Use "Imprimir" → Salvar como PDF.'
        : 'Não foi possível gerar o DOCX (' + (err.message || err) + ').', 'erro');
    } finally {
      document.querySelectorAll('#r-pdf, #r-docx').forEach((b) => { b.disabled = false; });
      btn.textContent = rotulo;
    }
  },

  async _compartilhar(id, tipo = 'vistoria') {
    const hash = tipo === 'auditoria'
      ? `#/auditorias-10s/${encodeURIComponent(id)}/relatorio`
      : `#/relatorios/${encodeURIComponent(id)}`;
    const url = `${location.origin}${location.pathname}${hash}`;
    if (!QualidadeDB.enabled) {
      Utils.toast('O compartilhamento por link entre dispositivos exige o Supabase conectado. Para enviar agora, use Imprimir / Salvar PDF.', true);
      return;
    }
    const nome = tipo === 'auditoria' ? 'Auditoria 10S' : 'Vistoria';
    const titulo = `Relatório de ${nome} — Qualidade · Distribuidora Exemplo`;
    const texto = `Relatório de ${nome} • Qualidade • 10S`;
    try {
      if (navigator.share) {
        await navigator.share({ title: titulo, text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      Utils.toast('Link do relatório copiado.');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      Utils.toast('Não foi possível compartilhar. Use Imprimir / Salvar PDF.', true);
    }
  },

  async _imprimir() {
    const imgs = [...document.querySelectorAll('.rpt img')];
    await Promise.race([
      Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    document.body.classList.add('printing-report');
    const finalizar = () => {
      document.body.classList.remove('printing-report');
      window.removeEventListener('afterprint', finalizar);
    };
    window.addEventListener('afterprint', finalizar);
    setTimeout(() => window.print(), 50);
  },
};

window.RelatoriosModule = RelatoriosModule;
