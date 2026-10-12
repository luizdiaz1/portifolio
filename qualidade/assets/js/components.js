/**
 * assets/js/components.js
 * Componentes globais reutilizáveis por todos os módulos:
 *  - Modal genérico
 *  - Lightbox de evidências fotográficas (ampliar / navegar / excluir)
 */

const Modal = {
  open({ title, bodyHtml, footerHtml, size = 'md', onClose }) {
    const overlay = Utils.qs('modal-overlay');
    const box = Utils.qs('modal-box');
    Utils.qs('modal-title').textContent = title || '';
    Utils.qs('modal-body').innerHTML = bodyHtml || '';
    Utils.qs('modal-footer').innerHTML = footerHtml || '';
    box.classList.toggle('modal-lg', size === 'lg');
    overlay.classList.add('open');
    this._onClose = onClose;
  },
  close() {
    Utils.qs('modal-overlay').classList.remove('open');
    if (this._onClose) this._onClose();
    this._onClose = null;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Utils.qs('modal-close').addEventListener('click', () => Modal.close());
  Utils.qs('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') Modal.close();
  });
});

const Lightbox = {
  fotos: [],
  index: 0,

  open(fotos, startIndex = 0) {
    if (!fotos || !fotos.length) return;
    this.fotos = fotos;
    this.index = startIndex;
    Utils.qs('lightbox-overlay').classList.add('open');
    this._render();
  },

  close() {
    Utils.qs('lightbox-overlay').classList.remove('open');
  },

  prev() {
    this.index = (this.index - 1 + this.fotos.length) % this.fotos.length;
    this._render();
  },

  next() {
    this.index = (this.index + 1) % this.fotos.length;
    this._render();
  },

  _render() {
    const foto = this.fotos[this.index];
    Utils.qs('lightbox-img').src = foto.foto_url;
    Utils.qs('lightbox-counter').textContent = `Foto ${this.index + 1} de ${this.fotos.length}`;
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Utils.qs('lightbox-close').addEventListener('click', () => Lightbox.close());
  Utils.qs('lightbox-prev').addEventListener('click', () => Lightbox.prev());
  Utils.qs('lightbox-next').addEventListener('click', () => Lightbox.next());
  Utils.qs('lightbox-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-overlay') Lightbox.close();
  });
  document.addEventListener('keydown', (e) => {
    if (!Utils.qs('lightbox-overlay').classList.contains('open')) return;
    if (e.key === 'Escape') Lightbox.close();
    if (e.key === 'ArrowLeft') Lightbox.prev();
    if (e.key === 'ArrowRight') Lightbox.next();
  });
});

/** Constrói o grid de fotos (miniaturas + botão adicionar) usado nos
 * blocos de NC do formulário de vistoria. `onAdd`/`onDelete` são callbacks. */
function renderFotoGrid(fotos, { onAdd, onDelete, inputId }) {
  const thumbs = fotos
    .map(
      (f, i) => `
      <div class="foto-thumb" data-idx="${i}" data-action="ver-foto">
        <img src="${f.foto_url}" alt="Evidência ${i + 1}">
        <button class="foto-del" data-action="del-foto" data-id="${f.id}" title="Excluir foto">✕</button>
      </div>`
    )
    .join('');
  return `
    <div class="foto-grid">
      ${thumbs}
      <label class="foto-add-btn">
        <span class="plus">+</span>
        <span>Adicionar fotos</span>
        <input type="file" id="${inputId}" accept="image/*" multiple capture="environment" style="display:none">
      </label>
    </div>`;
}
