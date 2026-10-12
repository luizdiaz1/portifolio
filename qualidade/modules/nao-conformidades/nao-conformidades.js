/**
 * modules/nao-conformidades/nao-conformidades.js
 * Lista todas as NCs do sistema, independentemente da vistoria,
 * com filtros por criticidade, status, responsável, setor e prazo.
 */
const NCModule = {
  render(container) {
    const setores = [...new Set(VistoriasQuery.listar().map((v) => v.setor_processo))];

    container.innerHTML = `
      <div class="filter-bar">
        <div class="field"><label>Criticidade</label>
          <select id="nf-crit"><option value="">Todas</option>${CRITICIDADES.map((c) => `<option>${c}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Status</label>
          <select id="nf-status"><option value="">Todos</option>${['Pendente', 'Em andamento', 'Concluída', 'Atrasada'].map((s) => `<option>${s}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Setor</label>
          <select id="nf-setor"><option value="">Todos</option>${setores.map((s) => `<option>${Utils.escapeHtml(s)}</option>`).join('')}</select>
        </div>
        <div class="field search"><label>Responsável</label><input type="text" id="nf-resp" placeholder="Nome do responsável"></div>
        <div class="field"><label>Prazo de</label><input type="date" id="nf-prazo-ini"></div>
        <div class="field"><label>Prazo até</label><input type="date" id="nf-prazo-fim"></div>
        <button class="btn btn-secondary" id="nf-limpar">Limpar filtros</button>
      </div>
      <div class="table-wrap" id="nc-lista"></div>
    `;

    const aplicar = () => {
      const filtros = {
        criticidade: Utils.qs('nf-crit').value,
        status: Utils.qs('nf-status').value,
        setor: Utils.qs('nf-setor').value,
        responsavel: Utils.qs('nf-resp').value,
        prazoInicio: Utils.qs('nf-prazo-ini').value,
        prazoFim: Utils.qs('nf-prazo-fim').value,
      };
      this._pintar(NCQuery.listarTodas(filtros));
    };

    ['nf-crit', 'nf-status', 'nf-setor', 'nf-prazo-ini', 'nf-prazo-fim'].forEach((id) => Utils.qs(id).addEventListener('change', aplicar));
    Utils.qs('nf-resp').addEventListener('input', Utils.debounce(aplicar, 200));
    Utils.qs('nf-limpar').addEventListener('click', () => {
      ['nf-crit', 'nf-status', 'nf-setor', 'nf-prazo-ini', 'nf-prazo-fim'].forEach((id) => (Utils.qs(id).value = ''));
      Utils.qs('nf-resp').value = '';
      aplicar();
    });

    this._pintar(NCQuery.listarTodas());
  },

  _pintar(ncs) {
    const el = Utils.qs('nc-lista');
    if (!ncs.length) {
      el.innerHTML = `<div class="table-empty">Nenhuma não conformidade encontrada com esses filtros.</div>`;
      return;
    }
    const rows = ncs
      .map((nc) => {
        const vistoria = Store.getById('vistorias', nc.vistoria_id);
        return `<tr class="${nc.status === 'Atrasada' ? 'row-atrasada' : ''}">
          <td>NC ${String(nc.numero).padStart(2, '0')}</td>
          <td>${Utils.escapeHtml(nc.area_local)}</td>
          <td>${vistoria ? Utils.formatarData(vistoria.data) : '—'}</td>
          <td>${Utils.escapeHtml(nc.responsavel) || '—'}</td>
          <td>${nc.prazo ? Utils.formatarData(nc.prazo) : 'A definir'}</td>
          <td><span class="tag ${Utils.criticidadeClass(nc.criticidade)}">${nc.criticidade}</span></td>
          <td><span class="tag ${Utils.statusClass(nc.status)}">${nc.status}</span></td>
          <td><button class="btn btn-ghost btn-sm" data-abrir="${nc.vistoria_id}">Abrir vistoria →</button></td>
        </tr>`;
      })
      .join('');
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>NC</th><th>Área/Local</th><th>Vistoria</th><th>Responsável</th><th>Prazo</th><th>Criticidade</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => Router.navigate('vistorias/' + b.dataset.abrir)));
  },
};

window.NCModule = NCModule;
