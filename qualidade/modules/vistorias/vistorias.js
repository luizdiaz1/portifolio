/**
 * modules/vistorias/vistorias.js
 * Lista de vistorias, wizard de cadastro (+ Nova Vistoria) e tela de
 * detalhe/edição de uma vistoria já existente (com gestão completa de
 * NCs, evidências, acompanhamento e retorno).
 */
const CRITICIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];

const VistoriasModule = {
  wizard: null, // estado do wizard em memória
  _abertas: new Set(), // NCs abertas na tela de detalhe: sobrevive a qualquer redesenho

  render(container, params) {
    if (params.id === 'nova') return this._renderWizard(container);
    if (params.id) return this._renderDetail(container, params.id);
    return this._renderLista(container);
  },

  // =========================================================
  // LISTA
  // =========================================================
  _renderLista(container) {
    container.innerHTML = `
      <div class="filter-bar">
        <div class="field search">
          <label>Buscar</label>
          <input type="search" id="f-busca" placeholder="Área, setor, responsável...">
        </div>
        <div class="field">
          <label>Status</label>
          <select id="f-status"><option value="">Todos</option>
            <option>Não Iniciado</option><option>Em andamento</option><option>Concluída</option>
          </select>
        </div>
        <div class="field"><label>De</label><input type="date" id="f-data-ini"></div>
        <div class="field"><label>Até</label><input type="date" id="f-data-fim"></div>
        <button class="btn btn-secondary" id="f-limpar">Limpar filtros</button>
        <button class="btn btn-primary" id="v-nova">+ Nova vistoria</button>
      </div>
      <div class="table-wrap" id="lista-vistorias"></div>
    `;

    const aplicarFiltros = () => {
      const filtros = {
        busca: Utils.qs('f-busca').value,
        status: Utils.qs('f-status').value,
        dataInicio: Utils.qs('f-data-ini').value,
        dataFim: Utils.qs('f-data-fim').value,
      };
      this._pintarListaVistorias(VistoriasQuery.listar(filtros));
    };

    ['f-busca'].forEach((id) => Utils.qs(id).addEventListener('input', Utils.debounce(aplicarFiltros, 200)));
    ['f-status', 'f-data-ini', 'f-data-fim'].forEach((id) => Utils.qs(id).addEventListener('change', aplicarFiltros));
    Utils.qs('v-nova').addEventListener('click', () => Router.navigate('vistorias/nova'));
    Utils.qs('f-limpar').addEventListener('click', () => {
      Utils.qs('f-busca').value = '';
      Utils.qs('f-status').value = '';
      Utils.qs('f-data-ini').value = '';
      Utils.qs('f-data-fim').value = '';
      aplicarFiltros();
    });

    this._pintarListaVistorias(VistoriasQuery.listar());
  },

  _pintarListaVistorias(vistorias) {
    const el = Utils.qs('lista-vistorias');
    if (!vistorias.length) {
      el.innerHTML = `<div class="table-empty">Nenhuma vistoria encontrada.</div>`;
      return;
    }
    const rows = vistorias
      .map((v) => {
        const resumo = NCQuery.resumoVistoria(v.id);
        return `<tr>
          <td>${Utils.formatarData(v.data)}</td>
          <td>${Utils.escapeHtml(v.area_local)}</td>
          <td>${Utils.escapeHtml(v.setor_processo)}</td>
          <td>${Utils.escapeHtml(v.realizada_por)}</td>
          <td>${resumo.total} NC${resumo.criticas ? ` <span class="tag tag-critica">${resumo.criticas} crítica(s)</span>` : ''}</td>
          <td><span class="tag ${Utils.statusClass(v.status)}">${v.status}</span></td>
          <td class="table-actions">
            <button class="btn btn-ghost btn-sm" data-act="ver" data-id="${v.id}">Visualizar</button>
            <button class="btn btn-ghost btn-sm" data-act="editar" data-id="${v.id}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-act="relatorio" data-id="${v.id}">Relatório</button>
            <button class="btn btn-ghost btn-sm" data-act="excluir" data-id="${v.id}">Excluir</button>
          </td>
        </tr>`;
      })
      .join('');
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>Data</th><th>Área/Local</th><th>Setor</th><th>Responsável</th><th>NCs</th><th>Status</th><th>Ações</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    el.querySelectorAll('[data-act="ver"]').forEach((b) => b.addEventListener('click', () => Router.navigate('vistorias/' + b.dataset.id)));
    el.querySelectorAll('[data-act="editar"]').forEach((b) =>
      b.addEventListener('click', () => {
        Edicao.pedir('vistorias/' + b.dataset.id);
        Router.navigate('vistorias/' + b.dataset.id);
      })
    );
    el.querySelectorAll('[data-act="relatorio"]').forEach((b) => b.addEventListener('click', () => Router.navigate('relatorios/' + b.dataset.id)));
    el.querySelectorAll('[data-act="excluir"]').forEach((b) =>
      b.addEventListener('click', () => {
        if (Utils.confirmar('Excluir esta vistoria e todas as suas NCs, fotos e históricos? Esta ação não pode ser desfeita.')) {
          VistoriasQuery.excluir(b.dataset.id);
          Utils.toast('Vistoria excluída.');
          this._pintarListaVistorias(VistoriasQuery.listar());
        }
      })
    );
  },

  // =========================================================
  // WIZARD — + Nova Vistoria
  // =========================================================
  _renderWizard(container) {
    this.wizard = {
      step: 1,
      dados: { data: Utils.hoje(), area_local: '', realizada_por: '', setor_processo: '', observacao: '' },
      ncs: [],
    };
    this._paintWizard(container);
  },

  _paintWizard(container) {
    const w = this.wizard;
    container.innerHTML = `
      <div class="stepper">
        ${this._stepPill(1, 'Dados da vistoria', w.step)}
        <div class="step-connector"></div>
        ${this._stepPill(2, 'Não conformidades', w.step)}
        <div class="step-connector"></div>
        ${this._stepPill(3, 'Revisão', w.step)}
      </div>
      <div id="wizard-step-content"></div>
    `;
    container.querySelectorAll('.step-pill').forEach((el) => {
      el.addEventListener('click', () => {
        const n = parseInt(el.dataset.step, 10);
        if (n < w.step || (n === w.step + 1 && this._validarStepAtual())) {
          w.step = n;
          this._paintWizard(container);
        } else if (n <= w.step) {
          w.step = n;
          this._paintWizard(container);
        }
      });
    });
    this._paintWizardStep();
  },

  _stepPill(n, label, current) {
    const cls = n === current ? 'active' : n < current ? 'done' : '';
    return `<div class="step-pill ${cls}" data-step="${n}"><span class="step-num">${n < current ? '✓' : n}</span> ${label}</div>`;
  },

  _validarStepAtual() {
    const w = this.wizard;
    if (w.step === 1) {
      if (!w.dados.area_local || !w.dados.realizada_por || !w.dados.setor_processo) {
        Utils.toast('Preencha Área/Local, Realizada por e Setor/Processo.', 'erro');
        return false;
      }
    }
    return true;
  },

  _paintWizardStep() {
    const w = this.wizard;
    const holder = Utils.qs('wizard-step-content');
    if (w.step === 1) holder.innerHTML = this._stepDadosHtml();
    if (w.step === 2) holder.innerHTML = this._stepNCsHtml();
    if (w.step === 3) holder.innerHTML = this._stepRevisaoHtml();
    this._bindStepEvents();
  },

  _stepDadosHtml() {
    const d = this.wizard.dados;
    return `
      <div class="card">
        <div class="card-title">Dados da vistoria</div>
        <div class="form-grid">
          <div class="field"><label>Data da vistoria</label><input type="date" id="w-data" value="${d.data}"></div>
          <div class="field"><label>Área / Local</label><input type="text" id="w-area" placeholder="Ex: G1" value="${Utils.escapeHtml(d.area_local)}"></div>
          <div class="field"><label>Realizada por</label><input type="text" id="w-por" placeholder="Nome do responsável" value="${Utils.escapeHtml(d.realizada_por)}"></div>
          <div class="field"><label>Setor / Processo</label><input type="text" id="w-setor" placeholder="Ex: Expedição" value="${Utils.escapeHtml(d.setor_processo)}"></div>
          <div class="field span-2"><label>Observação geral / principais pontos de atenção</label>
            <textarea id="w-obs" placeholder="Visão geral da vistoria...">${Utils.escapeHtml(d.observacao)}</textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="border:none; padding-top:20px;">
        <button class="btn btn-primary" id="w-next1">Avançar →</button>
      </div>
    `;
  },

  _stepNCsHtml() {
    const ncs = this.wizard.ncs;
    return `
      <div class="section-row" style="margin-top:0">
        <h2>Não Conformidades (${ncs.length})</h2>
        <button class="btn btn-primary btn-sm" id="w-add-nc">+ Adicionar Não Conformidade</button>
      </div>
      ${ncs.length ? ncs.map((nc, i) => this._ncBlockWizard(nc, i)).join('') : `<div class="empty-state"><div class="empty-icon">📝</div><p>Nenhuma NC adicionada ainda. Clique em "+ Adicionar Não Conformidade".</p></div>`}
      <div class="modal-footer" style="border:none; padding-top:10px; justify-content:space-between;">
        <button class="btn btn-secondary" id="w-back2">← Voltar</button>
        <button class="btn btn-primary" id="w-next2">Avançar →</button>
      </div>
    `;
  },

  _ncBlockWizard(nc, i) {
    const fotosPreview = nc.fotos
      .map(
        (f, fi) => `<div class="foto-thumb" data-ver-foto="${i}:${fi}">
          <img src="${f.previewUrl}">
          <button class="foto-del" data-del-foto="${i}:${fi}">✕</button>
        </div>`
      )
      .join('');
    return `
    <div class="nc-block open" data-nc-idx="${i}">
      <div class="nc-block-header" data-toggle-nc="${i}">
        <span class="nc-num-badge">NC ${String(i + 1).padStart(2, '0')}</span>
        <span class="nc-title-txt">${Utils.escapeHtml(nc.area_local) || 'Nova não conformidade'}</span>
        <span class="tag ${Utils.criticidadeClass(nc.criticidade)}">${nc.criticidade}</span>
        <button class="btn btn-ghost btn-sm" data-remove-nc="${i}">Remover</button>
        <span class="nc-collapse-icon">▾</span>
      </div>
      <div class="nc-block-body">
        <div class="form-grid cols-3">
          <div class="field"><label>Área / Local</label><input type="text" data-nc-field="area_local" data-nc="${i}" value="${Utils.escapeHtml(nc.area_local)}"></div>
          <div class="field"><label>Responsável</label><input type="text" data-nc-field="responsavel" data-nc="${i}" value="${Utils.escapeHtml(nc.responsavel)}"></div>
          <div class="field"><label>Prazo</label><input type="date" data-nc-field="prazo" data-nc="${i}" value="${nc.prazo}"></div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Criticidade</label>
          <div class="criticidade-picker">
            ${CRITICIDADES.map(
              (c) => `<div class="crit-option sel-${c.toLowerCase().replace('í','i')} ${nc.criticidade === c ? 'selected' : ''}" data-crit="${c}" data-nc="${i}">${c}</div>`
            ).join('')}
          </div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Descrição do desvio</label>
          <textarea data-nc-field="descricao" data-nc="${i}" placeholder="Descreva exatamente o problema encontrado...">${Utils.escapeHtml(nc.descricao)}</textarea>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Senso(s) 10S infringido(s)</label>
          <div class="checkbox-grid">
            ${SensosQuery.nomes().map(
              (s) => `<label class="checkbox-item ${nc.sensos.includes(s) ? 'checked' : ''}">
                <input type="checkbox" data-nc-senso="${s}" data-nc="${i}" ${nc.sensos.includes(s) ? 'checked' : ''}> ${s}
              </label>`
            ).join('')}
          </div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Evidências fotográficas</label>
          <div class="foto-grid">
            ${fotosPreview}
            <label class="foto-add-btn">
              <span class="plus">+</span><span>Adicionar fotos</span>
              <input type="file" accept="image/*" multiple capture="environment" data-nc-foto="${i}" style="display:none">
            </label>
          </div>
        </div>

        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Impacto / Risco</label><textarea data-nc-field="impacto_risco" data-nc="${i}">${Utils.escapeHtml(nc.impacto_risco)}</textarea></div>
          <div class="field"><label>Ação corretiva recomendada</label><textarea data-nc-field="acao_corretiva" data-nc="${i}">${Utils.escapeHtml(nc.acao_corretiva)}</textarea></div>
        </div>
      </div>
    </div>`;
  },

  _stepRevisaoHtml() {
    const w = this.wizard;
    return `
      <div class="card">
        <div class="card-title">Resumo</div>
        <div class="report-grid">
          <div><div class="rg-label">Data</div><div class="rg-value">${Utils.formatarData(w.dados.data)}</div></div>
          <div><div class="rg-label">Área/Local</div><div class="rg-value">${Utils.escapeHtml(w.dados.area_local)}</div></div>
          <div><div class="rg-label">Realizada por</div><div class="rg-value">${Utils.escapeHtml(w.dados.realizada_por)}</div></div>
          <div><div class="rg-label">Setor/Processo</div><div class="rg-value">${Utils.escapeHtml(w.dados.setor_processo)}</div></div>
        </div>
      </div>
      <div class="section-row"><h2>Não conformidades (${w.ncs.length})</h2></div>
      ${
        w.ncs.length
          ? w.ncs
              .map(
                (nc, i) => `<div class="card" style="margin-bottom:10px">
                <strong>NC ${String(i + 1).padStart(2, '0')} — ${Utils.escapeHtml(nc.area_local) || '—'}</strong>
                <span class="tag ${Utils.criticidadeClass(nc.criticidade)}" style="margin-left:8px">${nc.criticidade}</span>
                <p style="margin-top:8px">${Utils.escapeHtml(nc.descricao) || '<em>Sem descrição</em>'}</p>
                <p style="color:var(--cinza-500); font-size:12px;">${nc.fotos.length} foto(s) anexada(s) · ${nc.sensos.length} senso(s) 10S selecionado(s)</p>
              </div>`
              )
              .join('')
          : `<div class="empty-state"><p>Nenhuma NC cadastrada. Você pode salvar a vistoria mesmo assim e adicionar NCs depois.</p></div>`
      }
      <div class="modal-footer" style="border:none; padding-top:10px; justify-content:space-between;">
        <button class="btn btn-secondary" id="w-back3">← Voltar</button>
        <button class="btn btn-primary" id="w-salvar">Criar Vistoria</button>
      </div>
    `;
  },

  _bindStepEvents() {
    const w = this.wizard;
    const container = Utils.qs('view-root');

    if (w.step === 1) {
      ['w-data:data', 'w-area:area_local', 'w-por:realizada_por', 'w-setor:setor_processo', 'w-obs:observacao'].forEach((pair) => {
        const [id, field] = pair.split(':');
        Utils.qs(id).addEventListener('input', (e) => (w.dados[field] = e.target.value));
      });
      Utils.qs('w-next1').addEventListener('click', () => {
        if (this._validarStepAtual()) { w.step = 2; this._paintWizard(container); }
      });
    }

    if (w.step === 2) {
      Utils.qs('w-add-nc').addEventListener('click', () => {
        w.ncs.push({ area_local: '', responsavel: '', prazo: '', criticidade: 'Média', descricao: '', impacto_risco: '', acao_corretiva: '', sensos: [], fotos: [] });
        this._paintWizard(container);
      });
      Utils.qs('w-back2').addEventListener('click', () => { w.step = 1; this._paintWizard(container); });
      Utils.qs('w-next2').addEventListener('click', () => { w.step = 3; this._paintWizard(container); });

      container.querySelectorAll('[data-toggle-nc]').forEach((el) =>
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-remove-nc]')) return;
          el.closest('.nc-block').classList.toggle('open');
        })
      );
      container.querySelectorAll('[data-remove-nc]').forEach((el) =>
        el.addEventListener('click', () => {
          w.ncs.splice(parseInt(el.dataset.removeNc, 10), 1);
          this._paintWizardStep();
        })
      );
      container.querySelectorAll('[data-nc-field]').forEach((el) =>
        el.addEventListener('input', (e) => {
          w.ncs[parseInt(el.dataset.nc, 10)][el.dataset.ncField] = e.target.value;
        })
      );
      container.querySelectorAll('[data-crit]').forEach((el) =>
        el.addEventListener('click', () => {
          w.ncs[parseInt(el.dataset.nc, 10)].criticidade = el.dataset.crit;
          this._paintWizardStep();
        })
      );
      container.querySelectorAll('[data-nc-senso]').forEach((el) =>
        el.addEventListener('change', (e) => {
          const nc = w.ncs[parseInt(el.dataset.nc, 10)];
          const s = el.dataset.ncSenso;
          if (e.target.checked) { if (!nc.sensos.includes(s)) nc.sensos.push(s); }
          else nc.sensos = nc.sensos.filter((x) => x !== s);
          el.closest('.checkbox-item').classList.toggle('checked', e.target.checked);
        })
      );
      container.querySelectorAll('[data-nc-foto]').forEach((el) =>
        el.addEventListener('change', (e) => {
          const idx = parseInt(el.dataset.ncFoto, 10);
          Array.from(e.target.files).forEach((file) => {
            w.ncs[idx].fotos.push({ file, previewUrl: URL.createObjectURL(file) });
          });
          this._paintWizardStep();
        })
      );
      container.querySelectorAll('[data-del-foto]').forEach((el) =>
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const [ni, fi] = el.dataset.delFoto.split(':').map(Number);
          w.ncs[ni].fotos.splice(fi, 1);
          this._paintWizardStep();
        })
      );
      container.querySelectorAll('[data-ver-foto]').forEach((el) =>
        el.addEventListener('click', () => {
          const [ni, fi] = el.dataset.verFoto.split(':').map(Number);
          const fotos = w.ncs[ni].fotos.map((f) => ({ foto_url: f.previewUrl }));
          Lightbox.open(fotos, fi);
        })
      );
    }

    if (w.step === 3) {
      Utils.qs('w-back3').addEventListener('click', () => { w.step = 2; this._paintWizard(container); });
      Utils.qs('w-salvar').addEventListener('click', () => this._salvarVistoria());
    }
  },

  async _salvarVistoria() {
    const w = this.wizard;
    const btn = Utils.qs('w-salvar');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    let vistoria = null;
    const falhas = { sensos: 0, fotos: 0 };
    let ultimoErro = null;

    try {
      vistoria = VistoriasQuery.criar(w.dados);
      for (const nc of w.ncs) {
        const ncRow = NCQuery.criar(vistoria.id, nc);
        AcompanhamentoQuery.seedDesdeNC(ncRow);
        try {
          await NCQuery.sincronizarSensos(ncRow.id, nc.sensos);
        } catch (err) {
          falhas.sensos += 1;
          ultimoErro = err;
          console.error('[Qualidade10S] Falha ao salvar os sensos da NC:', err);
        }
        // Uma foto com problema não pode derrubar as demais nem o restante da vistoria.
        for (const foto of nc.fotos) {
          try {
            await EvidenciasQuery.adicionar(ncRow.id, foto.file);
          } catch (err) {
            falhas.fotos += 1;
            ultimoErro = err;
            console.error('[Qualidade10S] Falha ao salvar a foto:', err);
          }
        }
      }
    } catch (err) {
      console.error('[Qualidade10S] Falha ao salvar a vistoria:', err);
      if (!vistoria) {
        // Nada foi criado: a pessoa pode corrigir e tentar de novo.
        btn.disabled = false;
        btn.textContent = 'Criar Vistoria';
        Utils.toast('Não foi possível salvar a vistoria: ' + (err.message || 'erro desconhecido'), 'erro');
        return;
      }
      ultimoErro = err;
      falhas.fotos += 1;
    }

    this.wizard = null;
    if (falhas.sensos || falhas.fotos) {
      const partes = [];
      if (falhas.fotos) partes.push(falhas.fotos + ' foto(s)');
      if (falhas.sensos) partes.push('os sensos de ' + falhas.sensos + ' NC(s)');
      Utils.toast(
        'Vistoria criada, mas não foi possível salvar ' + partes.join(' e ') + ': ' +
          ((ultimoErro && ultimoErro.message) || 'erro desconhecido') +
          '. Abra a vistoria para tentar de novo.',
        'erro'
      );
    } else {
      Utils.toast('Vistoria criada com sucesso!');
    }
    Router.navigate('relatorios/' + vistoria.id);
  },

  // =========================================================
  // DETALHE / EDIÇÃO DE VISTORIA EXISTENTE
  // =========================================================
  _renderDetail(container, id) {
    const vistoria = VistoriasQuery.obter(id);
    if (!vistoria) {
      container.innerHTML = `<div class="empty-state"><h3>Vistoria não encontrada</h3></div>`;
      return;
    }
    const resumo = NCQuery.resumoVistoria(id);
    const ncs = NCQuery.listarPorVistoria(id);

    container.innerHTML = `
      ${Edicao.barraHtml()}
      <div class="card" style="margin-bottom:20px">
        <div class="card-title">Dados da vistoria</div>
        <div class="form-grid">
          <div class="field"><label>Data da vistoria</label><input type="date" id="d-data" value="${vistoria.data}"></div>
          <div class="field"><label>Área / Local</label><input type="text" id="d-area" value="${Utils.escapeHtml(vistoria.area_local)}"></div>
          <div class="field"><label>Realizada por</label><input type="text" id="d-por" value="${Utils.escapeHtml(vistoria.realizada_por)}"></div>
          <div class="field"><label>Setor / Processo</label><input type="text" id="d-setor" value="${Utils.escapeHtml(vistoria.setor_processo)}"></div>
          <div class="field span-2"><label>Observação geral / principais pontos de atenção</label><textarea id="d-obs">${Utils.escapeHtml(vistoria.observacao)}</textarea></div>
        </div>
      </div>

      <div class="kpi-grid">
        ${DashboardModule._kpi(resumo.total, 'Total de NC', 'kpi-amarelo')}
        ${DashboardModule._kpi(resumo.criticas, 'NC críticas', 'kpi-vermelho')}
        ${DashboardModule._kpi(resumo.prazosDefinidos + ' de ' + resumo.total, 'Prazos definidos', 'kpi-azul')}
        <div class="kpi-card kpi-preto"><div class="kpi-value"><span class="tag ${Utils.statusClass(resumo.status)}">${resumo.status}</span></div><div class="kpi-label">Status geral</div></div>
      </div>

      <div class="section-row">
        <h2>Não conformidades (${ncs.length})</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" id="d-relatorio">Gerar relatório</button>
          <button class="btn btn-primary btn-sm" id="d-add-nc">+ Adicionar Não Conformidade</button>
        </div>
      </div>
      <div id="d-ncs-holder"></div>
    `;

    Edicao.ligarBarra();

    // Auto-save dados da vistoria
    const campos = { 'd-data': 'data', 'd-area': 'area_local', 'd-por': 'realizada_por', 'd-setor': 'setor_processo', 'd-obs': 'observacao' };
    Object.entries(campos).forEach(([elId, field]) => {
      Utils.qs(elId).addEventListener('change', (e) => {
        VistoriasQuery.atualizar(id, { [field]: e.target.value });
        Utils.toast('Dados da vistoria atualizados.');
      });
    });

    Utils.qs('d-relatorio').addEventListener('click', () => Router.navigate('relatorios/' + id));
    Utils.qs('d-add-nc').addEventListener('click', () => {
      if (Edicao.travado()) return;
      const nc = NCQuery.criar(id, { criticidade: 'Média', sensos: [] });
      AcompanhamentoQuery.seedDesdeNC(nc);
      this._abertas.add(nc.id); // a NC nova já nasce aberta
      this._renderDetail(container, id);
      Utils.toast('Não conformidade adicionada.');
    });

    this._pintarNCsDetalhe(id);
  },

  _pintarNCsDetalhe(vistoriaId) {
    const holder = Utils.qs('d-ncs-holder');
    const ncs = NCQuery.listarPorVistoria(vistoriaId);
    if (!ncs.length) {
      holder.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>Nenhuma NC cadastrada. Clique em "+ Adicionar Não Conformidade".</p></div>`;
      return;
    }
    holder.innerHTML = ncs.map((nc) => this._ncBlockDetalhe(nc)).join('');
    this._bindNCDetalheEvents(vistoriaId);
  },

  _ncBlockDetalhe(nc) {
    const sensos = NCQuery.sensosDaNC(nc.id);
    const fotos = EvidenciasQuery.listarPorNC(nc.id);
    const retorno = RetornosQuery.ultimoPorNC(nc.id);
    const fotosThumbs = fotos
      .map((f, i) => `<div class="foto-thumb" data-ver-foto-real data-nc="${nc.id}" data-idx="${i}">
        <img src="${f.foto_url}"><button class="foto-del" data-del-foto-real="${f.id}">✕</button>
      </div>`)
      .join('');
    return `
    <div class="nc-block ${this._abertas.has(nc.id) ? 'open' : ''}" data-nc-id="${nc.id}">
      <div class="nc-block-header" data-toggle-nc-real>
        <span class="nc-num-badge">NC ${String(nc.numero).padStart(2, '0')}</span>
        <span class="nc-title-txt">${Utils.escapeHtml(nc.area_local) || 'Sem área definida'}</span>
        <span class="tag ${Utils.criticidadeClass(nc.criticidade)}">${nc.criticidade}</span>
        <span class="tag ${Utils.statusClass(nc.status)}">${nc.status}</span>
        <button class="btn btn-ghost btn-sm" data-remove-nc-real="${nc.id}">Excluir</button>
        <span class="nc-collapse-icon">▾</span>
      </div>
      <div class="nc-block-body">
        <div class="form-grid cols-3">
          <div class="field"><label>Área / Local</label><input type="text" data-f="area_local" value="${Utils.escapeHtml(nc.area_local)}"></div>
          <div class="field"><label>Responsável</label><input type="text" data-f="responsavel" value="${Utils.escapeHtml(nc.responsavel)}"></div>
          <div class="field"><label>Prazo</label><input type="date" data-f="prazo" value="${nc.prazo || ''}"></div>
        </div>
        <div class="field" style="margin-top:14px">
          <label>Criticidade</label>
          <div class="criticidade-picker">
            ${CRITICIDADES.map((c) => `<div class="crit-option sel-${c.toLowerCase().replace('í','i')} ${nc.criticidade === c ? 'selected' : ''}" data-crit-real="${c}">${c}</div>`).join('')}
          </div>
        </div>
        <div class="field" style="margin-top:14px"><label>Descrição do desvio</label><textarea data-f="descricao">${Utils.escapeHtml(nc.descricao)}</textarea></div>
        <div class="field" style="margin-top:14px">
          <label>Senso(s) 10S infringido(s)</label>
          <div class="checkbox-grid">
            ${SensosQuery.nomes().map((s) => `<label class="checkbox-item ${sensos.includes(s) ? 'checked' : ''}"><input type="checkbox" data-senso-real="${s}" ${sensos.includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
          </div>
        </div>
        <div class="field" style="margin-top:14px">
          <label>Evidências fotográficas</label>
          <div class="foto-grid">
            ${fotosThumbs}
            <label class="foto-add-btn"><span class="plus">+</span><span>Adicionar fotos</span>
              <input type="file" accept="image/*" multiple capture="environment" data-foto-real-input style="display:none"></label>
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px">
          <div class="field"><label>Impacto / Risco</label><textarea data-f="impacto_risco">${Utils.escapeHtml(nc.impacto_risco)}</textarea></div>
          <div class="field"><label>Ação corretiva recomendada</label><textarea data-f="acao_corretiva">${Utils.escapeHtml(nc.acao_corretiva)}</textarea></div>
        </div>

        <div class="field" style="margin-top:14px">
          <label>Status da ação</label>
          <select data-status-real>
            ${['Pendente', 'Em andamento', 'Concluída', 'Atrasada'].map((s) => `<option ${nc.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="report-block-label" style="margin-top:20px">Retorno / Eficácia</div>
        <div class="form-grid">
          <div class="field"><label>Resultado da correção</label><textarea data-ret="resultado_correcao">${Utils.escapeHtml(retorno?.resultado_correcao || '')}</textarea></div>
          <div class="field">
            <label>Eficácia da ação</label>
            <select data-ret="eficacia">
              ${['Pendente de verificação', 'Eficaz', 'Parcialmente eficaz', 'Ineficaz'].map((e) => `<option ${retorno?.eficacia === e ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Data do retorno</label><input type="date" data-ret="data_retorno" value="${retorno?.data_retorno || ''}"></div>
          <div class="field"><label>Responsável pelo retorno</label><input type="text" data-ret="responsavel" value="${Utils.escapeHtml(retorno?.responsavel || '')}"></div>
        </div>
        <button class="btn btn-dark btn-sm" data-salvar-retorno style="margin-top:10px">Registrar retorno</button>
        ${RetornosModule.historicoHtml(nc.id)}
      </div>
    </div>`;
  },

  _filaSensos: {}, // ncId -> { rodando, proximo }

  /** Grava os sensos de uma NC no servidor sem bloquear a tela; junta cliques seguidos em uma só gravação. */
  _sincronizarSensosEmFila(ncId, desejado) {
    const f = this._filaSensos[ncId] || (this._filaSensos[ncId] = { rodando: false, proximo: null });
    f.proximo = desejado;
    if (f.rodando) return;
    f.rodando = true;
    (async () => {
      let falhou = false;
      while (f.proximo) {
        const lista = f.proximo;
        f.proximo = null;
        try {
          await NCQuery.sincronizarSensos(ncId, lista);
        } catch (err) {
          falhou = true;
          console.error('[Qualidade10S] Falha ao salvar senso:', err);
          Utils.toast('Não foi possível salvar os sensos: ' + (err.message || 'erro desconhecido'), 'erro');
        }
      }
      f.rodando = false;
      if (falhou) {
        // Volta ao que o servidor realmente tem.
        try { await window.QualidadeDB.pullAll(); } catch (e) { /* segue */ }
        Router.resolve();
      }
    })();
  },

  _bindNCDetalheEvents(vistoriaId) {
    const holder = Utils.qs('d-ncs-holder');

    holder.querySelectorAll('[data-toggle-nc-real]').forEach((el) =>
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-remove-nc-real]')) return;
        const bloco = el.closest('.nc-block');
        bloco.classList.toggle('open');
        if (bloco.classList.contains('open')) this._abertas.add(bloco.dataset.ncId);
        else this._abertas.delete(bloco.dataset.ncId);
      })
    );

    holder.querySelectorAll('[data-remove-nc-real]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (Utils.confirmar('Excluir esta não conformidade, suas fotos e históricos?')) {
          NCQuery.excluir(el.dataset.removeNcReal);
          this._pintarNCsDetalhe(vistoriaId);
          Utils.toast('NC excluída.');
        }
      })
    );

    holder.querySelectorAll('.nc-block').forEach((block) => {
      const ncId = block.dataset.ncId;

      block.querySelectorAll('[data-f]').forEach((el) =>
        el.addEventListener('change', (e) => {
          NCQuery.atualizar(ncId, { [el.dataset.f]: e.target.value });
          Utils.toast('NC atualizada.');
        })
      );

      block.querySelectorAll('[data-crit-real]').forEach((el) =>
        el.addEventListener('click', () => {
          if (Edicao.travado() || !Auth.podeEscrever()) return;
          NCQuery.atualizar(ncId, { criticidade: el.dataset.critReal });
          this._pintarNCsDetalhe(vistoriaId);
        })
      );

      // Sensos: a tela responde na hora (marca, atualiza o cache) e a gravação confirmada
      // no servidor roda em segundo plano, uma por vez por NC, sempre com o ÚLTIMO estado
      // marcado. Nada é desabilitado e a tela não é redesenhada.
      block.querySelectorAll('[data-senso-real]').forEach((el) =>
        el.addEventListener('change', (e) => {
          el.closest('.checkbox-item').classList.toggle('checked', e.target.checked);
          const desejado = Array.from(block.querySelectorAll('[data-senso-real]:checked')).map((c) => c.dataset.sensoReal);
          NCQuery.definirSensosLocal(ncId, desejado);
          this._sincronizarSensosEmFila(ncId, desejado);
        })
      );

      block.querySelectorAll('[data-status-real]').forEach((el) =>
        el.addEventListener('change', (e) => {
          NCQuery.atualizarStatus(ncId, e.target.value);
          this._pintarNCsDetalhe(vistoriaId);
          Utils.toast('Status atualizado.');
        })
      );

      const inputFoto = block.querySelector('[data-foto-real-input]');
      if (inputFoto) {
        inputFoto.addEventListener('change', async (e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          try {
            for (const file of files) {
              await EvidenciasQuery.adicionar(ncId, file);
            }
            this._pintarNCsDetalhe(vistoriaId);
            Utils.toast('Foto(s) adicionada(s).');
          } catch (err) {
            console.error('[Qualidade10S] Falha ao salvar evidência:', err);
            Utils.toast('Não foi possível salvar a foto: ' + (err.message || 'erro desconhecido'), 'erro');
            this._pintarNCsDetalhe(vistoriaId);
          } finally {
            e.target.value = '';
          }
        });
      }

      block.querySelectorAll('[data-del-foto-real]').forEach((el) =>
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await EvidenciasQuery.excluir(el.dataset.delFotoReal);
            this._pintarNCsDetalhe(vistoriaId);
            Utils.toast('Foto excluída.');
          } catch (err) {
            console.error('[Qualidade10S] Falha ao excluir evidência:', err);
            Utils.toast('Não foi possível excluir a foto: ' + (err.message || 'erro desconhecido'), 'erro');
          }
        })
      );

      block.querySelectorAll('[data-ver-foto-real]').forEach((el) =>
        el.addEventListener('click', () => {
          const fotos = EvidenciasQuery.listarPorNC(ncId);
          Lightbox.open(fotos, parseInt(el.dataset.idx, 10));
        })
      );

      const btnRetorno = block.querySelector('[data-salvar-retorno]');
      if (btnRetorno) {
        btnRetorno.addEventListener('click', () => {
          const dados = {};
          block.querySelectorAll('[data-ret]').forEach((el) => (dados[el.dataset.ret] = el.value));
          RetornosQuery.registrar(ncId, dados);
          this._pintarNCsDetalhe(vistoriaId);
          Utils.toast('Retorno registrado com sucesso.');
        });
      }
    });
  },
};

window.VistoriasModule = VistoriasModule;
