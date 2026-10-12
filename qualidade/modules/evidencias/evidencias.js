/**
 * modules/evidencias/evidencias.js
 * Galeria de todas as evidências fotográficas cadastradas no sistema,
 * com contexto (vistoria / NC / área / data) e visualizador ampliado.
 */
const EvidenciasModule = {
  render(container) {
    const evidencias = EvidenciasQuery.listarComContexto();

    if (!evidencias.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">🖼</div><h3>Nenhuma evidência cadastrada</h3><p>As fotos adicionadas às não conformidades aparecerão aqui.</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="filter-bar">
        <div class="field search"><label>Buscar por área</label><input type="search" id="ev-busca" placeholder="Ex: Expedição"></div>
      </div>
      <div class="foto-grid" id="ev-grid" style="grid-template-columns:repeat(auto-fill, minmax(160px, 1fr));"></div>
    `;

    const pintar = (lista) => {
      Utils.qs('ev-grid').innerHTML = lista
        .map(
          (e, i) => `
          <div class="foto-thumb" style="aspect-ratio:4/3" data-idx="${i}">
            <img src="${e.foto_url}">
          </div>`
        )
        .join('');

      Utils.qs('ev-grid').querySelectorAll('.foto-thumb').forEach((el) => {
        el.addEventListener('click', () => Lightbox.open(lista, parseInt(el.dataset.idx, 10)));
      });
    };

    pintar(evidencias);

    Utils.qs('ev-busca').addEventListener(
      'input',
      Utils.debounce((e) => {
        const termo = e.target.value.toLowerCase();
        pintar(evidencias.filter((ev) => (ev.nc_area || '').toLowerCase().includes(termo)));
      }, 200)
    );

    // Legenda com contexto (vistoria/NC/área/data) abaixo da galeria
    const legenda = document.createElement('div');
    legenda.className = 'card';
    legenda.style.marginTop = '20px';
    legenda.innerHTML = `<div class="card-title">Contexto das evidências</div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Vistoria</th><th>NC</th><th>Área</th><th>Data</th><th></th></tr></thead>
        <tbody>
          ${evidencias
            .map(
              (e) => `<tr>
              <td>${e.vistoria_data !== '-' ? Utils.formatarData(e.vistoria_data) : '—'}</td>
              <td>NC ${String(e.nc_numero).padStart(2, '0')}</td>
              <td>${Utils.escapeHtml(e.nc_area)}</td>
              <td>${Utils.formatarDataHora(e.created_at)}</td>
              <td>${e.vistoria_id ? `<button class="btn btn-ghost btn-sm" data-abrir="${e.vistoria_id}">Abrir vistoria →</button>` : ''}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table></div>`;
    container.appendChild(legenda);
    legenda.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => Router.navigate('vistorias/' + b.dataset.abrir)));
  },
};

window.EvidenciasModule = EvidenciasModule;
