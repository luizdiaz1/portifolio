/**
 * modules/dashboard/dashboard.js
 */
const DashboardModule = {
  render(container) {
    const vistorias = VistoriasQuery.listar();
    const ncs = NCQuery.listarTodas();
    const alertas = AlertsEngine.gerar();

    const kpis = {
      vistorias: vistorias.length,
      ncTotal: ncs.length,
      ncCriticas: ncs.filter((n) => n.criticidade === 'Crítica').length,
      ncPendentes: ncs.filter((n) => n.status === 'Pendente').length,
      ncAndamento: ncs.filter((n) => n.status === 'Em andamento').length,
      ncConcluidas: ncs.filter((n) => n.status === 'Concluída').length,
      ncAtrasadas: ncs.filter((n) => n.status === 'Atrasada').length,
    };

    container.innerHTML = `
      <div class="kpi-grid">
        ${this._kpi(kpis.vistorias, 'Vistorias realizadas', 'kpi-preto')}
        ${this._kpi(kpis.ncTotal, 'Não conformidades', 'kpi-amarelo')}
        ${this._kpi(kpis.ncCriticas, 'NC críticas', 'kpi-vermelho')}
        ${this._kpi(kpis.ncPendentes, 'NC pendentes', 'kpi-laranja')}
        ${this._kpi(kpis.ncAndamento, 'NC em andamento', 'kpi-azul')}
        ${this._kpi(kpis.ncConcluidas, 'NC concluídas', 'kpi-verde')}
        ${this._kpi(kpis.ncAtrasadas, 'NC atrasadas', 'kpi-vermelho')}
        ${this._kpi(alertas.length, 'Alertas ativos', 'kpi-preto')}
      </div>

      <div class="section-row">
        <h2>Últimas vistorias</h2>
        <a href="#/vistorias" class="btn btn-ghost btn-sm">Ver todas →</a>
      </div>
      <div class="table-wrap">
        ${this._tabelaVistorias(vistorias.slice(0, 6))}
      </div>

      <div class="section-row">
        <h2>Central de Alertas</h2>
        <a href="#/alertas" class="btn btn-ghost btn-sm">Ver todos →</a>
      </div>
      <div class="card">
        ${this._listaAlertas(alertas.slice(0, 5))}
      </div>
    `;

    container.querySelectorAll('[data-goto-vistoria]').forEach((el) => {
      el.addEventListener('click', () => Router.navigate('vistorias/' + el.dataset.gotoVistoria));
    });
    container.querySelectorAll('[data-goto-alerta]').forEach((el) => {
      el.addEventListener('click', () => Router.navigate('vistorias/' + el.dataset.gotoAlerta));
    });
  },

  renderAlertasFull(container) {
    const alertas = AlertsEngine.gerar();
    container.innerHTML = `
      <div class="card">
        <div class="card-title">Todos os alertas ativos (${alertas.length})</div>
        ${this._listaAlertas(alertas)}
      </div>
    `;
    container.querySelectorAll('[data-goto-alerta]').forEach((el) => {
      el.addEventListener('click', () => Router.navigate('vistorias/' + el.dataset.gotoAlerta));
    });
  },

  _kpi(value, label, cls) {
    return `<div class="kpi-card ${cls}"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
  },

  _tabelaVistorias(vistorias) {
    if (!vistorias.length) {
      return `<div class="table-empty">Nenhuma vistoria cadastrada ainda. Clique em <strong>+ Nova Vistoria</strong> para começar.</div>`;
    }
    const rows = vistorias
      .map((v) => {
        const resumo = NCQuery.resumoVistoria(v.id);
        return `<tr data-goto-vistoria="${v.id}" style="cursor:pointer">
          <td>${Utils.formatarData(v.data)}</td>
          <td>${Utils.escapeHtml(v.area_local)}</td>
          <td>${Utils.escapeHtml(v.setor_processo)}</td>
          <td>${resumo.total} NC</td>
          <td><span class="tag ${Utils.statusClass(v.status)}">${v.status}</span></td>
        </tr>`;
      })
      .join('');
    return `<table class="data-table">
      <thead><tr><th>Data</th><th>Área/Local</th><th>Setor</th><th>NCs</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  },

  _listaAlertas(alertas) {
    if (!alertas.length) {
      return `<div class="empty-state"><div class="empty-icon">✅</div><p>Nenhum alerta no momento. Tudo sob controle.</p></div>`;
    }
    return `<div class="alert-list">
      ${alertas
        .map(
          (a) => `<div class="alert-item tipo-${a.tipo}" data-goto-alerta="${a.vistoria_id}">
            <span class="alert-icon">${a.icone}</span>
            <div>
              <div class="alert-title">${Utils.escapeHtml(a.titulo)}</div>
              <div class="alert-detail">${Utils.escapeHtml(a.detalhe)}</div>
            </div>
          </div>`
        )
        .join('')}
    </div>`;
  },
};

window.DashboardModule = DashboardModule;
