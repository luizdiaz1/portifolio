/**
 * assets/js/utils.js — helpers compartilhados por todos os módulos.
 */
const Utils = {
  hoje() {
    return new Date().toISOString().slice(0, 10);
  },

  formatarData(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  formatarDataHora(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR');
  },

  diasAte(iso) {
    if (!iso) return null;
    const hoje = new Date(this.hoje() + 'T00:00:00');
    const alvo = new Date(iso + 'T00:00:00');
    return Math.round((alvo - hoje) / 86400000);
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  nl2br(str) {
    return this.escapeHtml(str).replace(/\n/g, '<br>');
  },

  criticidadeClass(c) {
    return (
      {
        Baixa: 'tag-baixa',
        Média: 'tag-media',
        Alta: 'tag-alta',
        Crítica: 'tag-critica',
      }[c] || 'tag-media'
    );
  },

  statusClass(s) {
    return (
      {
        Pendente: 'tag-pendente',
        'Em andamento': 'tag-andamento',
        Concluída: 'tag-concluida',
        Atrasada: 'tag-atrasada',
        'Não Iniciado': 'tag-pendente',
      }[s] || 'tag-pendente'
    );
  },

  eficaciaClass(e) {
    return (
      {
        Eficaz: 'tag-concluida',
        'Parcialmente eficaz': 'tag-atencao',
        Ineficaz: 'tag-atrasada',
        'Pendente de verificação': 'tag-pendente',
      }[e] || 'tag-pendente'
    );
  },

  debounce(fn, wait = 250) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  toast(msg, tipo = 'sucesso') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.textContent = msg;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  confirmar(mensagem) {
    return window.confirm(mensagem);
  },

  qs(id) {
    return document.getElementById(id);
  },
};

window.Utils = Utils;
