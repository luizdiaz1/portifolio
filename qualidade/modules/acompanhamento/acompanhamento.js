/**
 * modules/acompanhamento/acompanhamento.js
 * Visão consolidada das ações corretivas (ACOMPANHAMENTO DAS AÇÕES),
 * com destaque visual para atrasadas, próximas do prazo e concluídas.
 */
const AcompanhamentoModule = {
  render(container) {
    container.innerHTML = `
      <div class="tabs">
        <button class="tab-btn active" data-tab="todas">Todas</button>
        <button class="tab-btn" data-tab="atrasadas">Atrasadas</button>
        <button class="tab-btn" data-tab="proximas">Próximas do prazo</button>
        <button class="tab-btn" data-tab="concluidas">Concluídas</button>
      </div>
      <div class="table-wrap" id="acomp-lista"></div>
    `;
    container.querySelectorAll('.tab-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._pintar(btn.dataset.tab);
      })
    );
    this._pintar('todas');
  },

  _pintar(filtro) {
    let itens = AcompanhamentoQuery.listarComContexto();
    if (filtro === 'atrasadas') itens = itens.filter((i) => i.status === 'Atrasada');
    if (filtro === 'concluidas') itens = itens.filter((i) => i.status === 'Concluída');
    if (filtro === 'proximas')
      itens = itens.filter((i) => {
        const dias = Utils.diasAte(i.prazo);
        return i.status !== 'Concluída' && dias !== null && dias >= 0 && dias <= 5;
      });

    const el = Utils.qs('acomp-lista');
    if (!itens.length) {
      el.innerHTML = `<div class="table-empty">Nenhum item encontrado nesta visão.</div>`;
      return;
    }
    const rows = itens
      .map(
        (i) => `<tr class="${i.status === 'Atrasada' ? 'row-atrasada' : ''}">
          <td>NC ${String(i.nc_numero).padStart(2, '0')}</td>
          <td>${Utils.escapeHtml(i.area) || '—'}</td>
          <td>${Utils.escapeHtml(i.acao) || '<em>Não definida</em>'}</td>
          <td>${Utils.escapeHtml(i.responsavel) || '—'}</td>
          <td>${i.prazo ? Utils.formatarData(i.prazo) : 'A definir'}</td>
          <td>
            <select data-set-status="${i.acompanhamento_id}" data-nc="${i.nc_id}">
              ${['Pendente', 'Em andamento', 'Concluída', 'Atrasada'].map((s) => `<option ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><button class="btn btn-ghost btn-sm" data-abrir="${i.vistoria_id}">Abrir vistoria →</button></td>
        </tr>`
      )
      .join('');
    el.innerHTML = `<table class="data-table">
      <thead><tr><th>NC</th><th>Área</th><th>Ação / Tratativa</th><th>Responsável</th><th>Prazo</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

    el.querySelectorAll('[data-set-status]').forEach((sel) =>
      sel.addEventListener('change', (e) => {
        AcompanhamentoQuery.atualizar(sel.dataset.setStatus, { status: e.target.value });
        Utils.toast('Status da ação atualizado.');
        this._pintar(document.querySelector('.tab-btn.active').dataset.tab);
      })
    );
    el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => Router.navigate('vistorias/' + b.dataset.abrir)));
  },
};

window.AcompanhamentoModule = AcompanhamentoModule;
