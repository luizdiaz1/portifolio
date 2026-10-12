/* Utilitários para gerar dados fictícios (determinísticos) nas demos. */
(function () {
  'use strict';
  var seed = 20261012;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function int(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
  function chance(p) { return rnd() < p; }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function dateOffset(days, base) { var d = base ? new Date(base) : new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function day(offset) { return iso(dateOffset(offset)); }
  function ts(offset, h, m) { var d = dateOffset(offset); d.setHours(h == null ? int(7, 18) : h, m == null ? int(0, 59) : m, 0, 0); return d.toISOString(); }
  function money(a, b) { return Math.round((a + rnd() * (b - a)) * 100) / 100; }
  var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function plate() { return pick(['DMO', 'EXP', 'TST', 'FIC', 'DEM']) + int(0, 9) + L[int(0, 25)] + int(10, 99); }
  var firstNames = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Fábio', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Karina', 'Leonardo', 'Marina', 'Nicolas', 'Olívia', 'Paulo', 'Rafaela', 'Sérgio', 'Tatiane', 'Vinícius', 'Wagner', 'Yasmin', 'Rodrigo', 'Camila', 'Marcos', 'Juliana', 'André', 'Patrícia', 'Thiago', 'Renata'];
  var lastNames = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferraz', 'Gomes', 'Honorato', 'Lacerda', 'Macedo', 'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Sampaio', 'Teixeira', 'Valente', 'Xavier', 'Moura', 'Correia'];
  var used = {};
  function person() {
    for (var i = 0; i < 200; i++) {
      var n = pick(firstNames) + ' ' + pick(lastNames);
      if (!used[n]) { used[n] = 1; return n; }
    }
    return pick(firstNames) + ' ' + pick(lastNames) + ' ' + int(2, 9);
  }
  var bairros = ['Centro', 'Jardim Exemplo', 'Vila Demonstração', 'Parque Industrial', 'Bairro Novo', 'Alto da Serra', 'Porto Seco', 'Distrito Logístico', 'Vila Nova', 'São Bento'];
  var clientes = ['Mercado Bom Preço', 'Supermercado Família', 'Atacadão Central', 'Mercearia do Bairro', 'Rede Super Econômico', 'Empório Sabor', 'Mini Mercado Estrela', 'Hiper Compras', 'Padaria Pão Quente', 'Distribuidora Aurora', 'Mercado Sol Nascente', 'Conveniência 24h', 'Armazém Popular', 'Super Bom Dia', 'Mercado Vila Verde'];
  function phone() { return '(21) 9' + int(1000, 9999) + '-' + int(1000, 9999); }
  function cpfFake() { return '000.' + int(100, 999) + '.' + int(100, 999) + '-' + pad(int(0, 99)); }
  window.DemoData = {
    rnd: rnd, int: int, pick: pick, chance: chance, pad: pad, day: day, ts: ts, iso: iso, dateOffset: dateOffset,
    money: money, plate: plate, person: person, phone: phone, cpfFake: cpfFake,
    bairros: bairros, clientes: clientes, firstNames: firstNames, lastNames: lastNames,
    reseed: function (s) { seed = s; used = {}; }
  };
})();
