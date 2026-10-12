/**
 * assets/js/theme.js
 * Tema claro/escuro. Carregado no <head> para aplicar o tema antes da primeira pintura.
 * - Sem escolha salva: segue o tema do sistema operacional.
 * - Clique no botão #theme-toggle: alterna e guarda a escolha neste navegador.
 * Não toca em dados, Supabase nem rotas.
 */
(function () {
  var KEY = 'qualidade-tema';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function salvo() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function atual() {
    return salvo() || (mq && mq.matches ? 'dark' : 'light');
  }
  function aplicar(tema) {
    root.setAttribute('data-theme', tema);
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      var txt = tema === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
      btn.setAttribute('aria-label', txt);
      btn.setAttribute('title', txt);
    }
  }

  aplicar(atual());

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (!salvo()) aplicar(atual()); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    aplicar(atual());
    btn.addEventListener('click', function () {
      var novo = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, novo); } catch (e) {}
      aplicar(novo);
    });
  });
})();
