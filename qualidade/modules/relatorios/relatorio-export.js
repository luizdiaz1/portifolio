/**
 * modules/relatorios/relatorio-export.js
 * ---------------------------------------------------------
 * Exporta os relatórios de Vistoria e de Auditoria 10S para:
 *   - PDF  (A4, vetorial, cabeçalho/rodapé e "Página X de Y" em todas as páginas)
 *   - DOCX (Word editável, já formatado: margens, fontes, tabelas, fotos, cabeçalho e rodapé)
 *
 * Usa o MESMO modelo de dados da tela (RelatoriosModule.modelo), então o
 * conteúdo é sempre idêntico ao relatório visualizado.
 *
 * Bibliotecas: carregadas sob demanda (só quando o usuário clica em baixar),
 * pelo mesmo CDN já usado pelo supabase-js. Nada é instalado no projeto.
 *   - jsPDF 2.5.2  -> PDF
 *   - docx 8.5.0   -> DOCX
 *
 * Fotos: baixadas do Storage, com a orientação corrigida pelo navegador,
 * reduzidas a no máximo 2000 px no maior lado (mantém nitidez para A4 sem
 * gerar arquivos gigantes) e SEMPRE encaixadas por inteiro (sem cortes,
 * sem distorção).
 * ---------------------------------------------------------
 */
const RelatorioExport = (() => {
  const LIBS = {
    jspdf: {
      url: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
      pronto: () => !!(window.jspdf && window.jspdf.jsPDF),
    },
    docx: {
      url: 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',
      pronto: () => !!(window.docx && window.docx.Document),
    },
  };
  const _carregando = {};

  function carregarLib(nome) {
    const lib = LIBS[nome];
    if (lib.pronto()) return Promise.resolve();
    if (_carregando[nome]) return _carregando[nome];
    _carregando[nome] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = lib.url;
      s.async = true;
      const timer = setTimeout(() => reject(new Error('tempo esgotado ao carregar a biblioteca')), 25000);
      s.onload = () => { clearTimeout(timer); lib.pronto() ? resolve() : reject(new Error('biblioteca inválida')); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('sem conexão com o CDN')); };
      document.head.appendChild(s);
    }).catch((e) => { delete _carregando[nome]; throw e; });
    return _carregando[nome];
  }

  /* ---------------- Imagens ---------------- */

  const MAX_LADO = 2000;

  async function prepararImagem(url, maxLado = MAX_LADO, qualidade = 0.86) {
    // fetch (sem cache) evita o problema de imagem já em cache sem cabeçalho CORS,
    // que "contaminaria" o canvas.
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('imagem inválida')); img.src = objUrl; });
      const w0 = img.naturalWidth, h0 = img.naturalHeight;
      if (!w0 || !h0) throw new Error('imagem vazia');
      const k = Math.min(1, maxLado / Math.max(w0, h0));
      const w = Math.max(1, Math.round(w0 * k));
      const h = Math.max(1, Math.round(h0 * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL('image/jpeg', qualidade);
      c.width = c.height = 0; // libera memória (importante no celular)
      return { dataUrl, w, h };
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  /** Baixa todas as fotos do relatório com até 4 downloads simultâneos. */
  async function prepararFotos(m, progresso) {
    const todas = m.ncs.flatMap((nc) => nc.fotos);
    const mapa = new Map();
    let feitas = 0;
    let i = 0;
    const total = todas.length;
    if (progresso && total) progresso(0, total);
    async function trabalhador() {
      while (i < todas.length) {
        const f = todas[i++];
        try { mapa.set(f.url, await prepararImagem(f.url)); }
        catch (e) { console.warn('[Qualidade10S] Foto indisponível para exportação:', f.url, e); mapa.set(f.url, null); }
        feitas += 1;
        if (progresso) progresso(feitas, total);
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, total) }, trabalhador));
    return mapa;
  }

  /** Mascote (abelha) em PNG, preservando a transparência. */
  async function prepararAbelha() {
    try {
      const resp = await fetch('assets/images/selo-qualidade.png', { cache: 'force-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
      return { dataUrl, w: img.naturalWidth, h: img.naturalHeight };
    } catch (e) { return null; }
  }

  async function prepararLogo() {
    try { return await prepararImagem('assets/images/logo-exemplo.jpeg', 700, 0.92); }
    catch (e) { return null; } // ex.: index.html aberto via file:// — segue sem logo
  }

  function encaixar(imgW, imgH, boxW, boxH) {
    const k = Math.min(boxW / imgW, boxH / imgH);
    return { w: imgW * k, h: imgH * k };
  }

  function baixar(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  const nomeArquivo = (m, ext) => `Relatorio-Vistoria-${m.codigo}.${ext}`;

  /** Layout das fotos — compartilhado por PDF e DOCX (medidas em mm). */
  function gradeFotos(qtd, densidade, larguraUtil) {
    if (qtd === 1) return { cols: 1, gap: 0, cellW: larguraUtil, boxH: 118 };
    const cols = densidade === 9 ? 3 : 2;
    const gap = densidade === 9 ? 3 : 4;
    const cellW = (larguraUtil - gap * (cols - 1)) / cols;
    // 6/página: 2 colunas × 3 linhas  ·  9/página: 3 colunas × 3 linhas
    const boxH = densidade === 9 ? 60 : 66;
    return { cols, gap, cellW, boxH };
  }

  const chaveCrit = (c) => String(c || '').toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  const CRIT_COR = {
    alta: [180, 35, 24], critica: [180, 35, 24], 'crítica': [180, 35, 24],
    media: [154, 106, 0], 'média': [154, 106, 0], baixa: [10, 90, 55],
  };

  /* =========================================================
     Cabeçalho e rodapé (PDF) — compartilhado por vistoria e auditoria.
     info = { titulo, codigo, data, status, geradoEm }
     ========================================================= */
  const COR = {
    AZUL: [16, 58, 94], VERDE: [0, 107, 63], TEXTO: [29, 42, 51], CINZA: [88, 105, 113],
    BORDA: [203, 214, 220], FUNDO: [246, 248, 249], FUNDO_VERDE: [238, 246, 241], AMARELO: [245, 216, 59],
  };

  function cabecalhoRodapePdf(doc, info, logo, abelha) {
    const PW = 210, PH = 297, ML = 15, MR = 15, W = PW - ML - MR;
    const fonte = (estilo, tam, cor = COR.TEXTO) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor); };
    const total = doc.getNumberOfPages();
    const titulo = info.titulo.toUpperCase();
    const beeD = abelha ? encaixar(abelha.w, abelha.h, 24, 19) : { w: 0, h: 0 };
    const logoD = logo ? encaixar(logo.w, logo.h, 30, 13) : { w: 28, h: 0 };
    const docVals = [['DOCUMENTO', info.codigo], ['DATA', info.data], ['STATUS', info.status || '—']];
    fonte('bold', 7.5); const valW = Math.max(...docVals.map(([, v]) => doc.getTextWidth(String(v))));
    const docDir = PW - MR - (beeD.w ? beeD.w + 4 : 0);
    const docX = docDir - valW - 17;
    const xt = ML + logoD.w + 5;
    const larguraTitulo = docX - 6 - xt;
    let tamTitulo = 14;
    fonte('bold', tamTitulo); while (tamTitulo > 9 && doc.getTextWidth(titulo) > larguraTitulo) { tamTitulo -= 0.5; fonte('bold', tamTitulo); }
    let tamSup = 6.5;
    fonte('bold', tamSup); while (tamSup > 5 && doc.getTextWidth('GESTÃO DA QUALIDADE · 10S') + 0.25 * 25 > larguraTitulo) { tamSup -= 0.25; fonte('bold', tamSup); }

    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      if (logo) doc.addImage(logo.dataUrl, 'JPEG', ML, 9 + (13 - logoD.h) / 2, logoD.w, logoD.h, 'logo-exemplo', 'NONE');
      else { fonte('bold', 11, COR.AZUL); doc.text('DISTRIBUIDORA EXEMPLO', ML, 17); }
      fonte('bold', tamSup, COR.VERDE); doc.text('GESTÃO DA QUALIDADE · 10S', xt, 13.2, { charSpace: 0.25 });
      fonte('bold', tamTitulo, COR.AZUL); doc.text(titulo, xt, 19.6);
      doc.setFillColor(...COR.AMARELO); doc.rect(docX - 3, 10.2, 0.8, 13.2, 'F');
      docVals.forEach(([r, v], i) => {
        fonte('normal', 6.3, COR.CINZA); doc.text(r, docX, 13 + i * 4.4, { charSpace: 0.1 });
        fonte('bold', 7.5, COR.AZUL); doc.text(String(v), docDir, 13 + i * 4.4, { align: 'right' });
      });
      if (abelha) doc.addImage(abelha.dataUrl, 'PNG', PW - MR - beeD.w, 26.2 - beeD.h, beeD.w, beeD.h, 'selo-qualidade', 'NONE');
      doc.setFillColor(...COR.VERDE); doc.rect(ML, 27, W * 0.78, 1, 'F');
      doc.setFillColor(...COR.AMARELO); doc.rect(ML + W * 0.78, 27, W * 0.22, 1, 'F');

      doc.setDrawColor(...COR.BORDA); doc.setLineWidth(0.3); doc.line(ML, PH - 12.5, PW - MR, PH - 12.5);
      fonte('normal', 7, COR.CINZA);
      doc.text(`Distribuidora Exemplo · Gestão da Qualidade · ${info.codigo} · Gerado em ${info.geradoEm}`, ML, PH - 8.5);
      fonte('bold', 7, COR.AZUL); doc.text(`Página ${p} de ${total}`, PW - MR, PH - 8.5, { align: 'right' });
    }
  }

  /* =========================================================
     PDF
     ========================================================= */
  async function pdf(m, opcoes = {}) {
    const densidade = opcoes.densidade === 9 ? 9 : 6;
    await carregarLib('jspdf');
    const [fotos, logo, abelha] = await Promise.all([prepararFotos(m, opcoes.progresso), prepararLogo(), prepararAbelha()]);

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: `Relatório de Vistoria ${m.codigo}`, subject: 'Qualidade 10S', author: 'Distribuidora Exemplo · Qualidade', creator: 'Qualidade 10S · Demo' });

    const AZUL = [16, 58, 94], VERDE = [0, 107, 63], TEXTO = [29, 42, 51], CINZA = [88, 105, 113];
    const BORDA = [203, 214, 220], FUNDO = [246, 248, 249], FUNDO_VERDE = [238, 246, 241], CINZA_FOTO = [238, 242, 244], AMARELO = [245, 216, 59];
    const PW = 210, PH = 297, ML = 15, MR = 15, MT = 33, MB = 18, W = PW - ML - MR;
    const PT = 0.3528; // mm por ponto
    let y = MT;

    const fonte = (estilo, tam, cor = TEXTO) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor); };
    const alt = (tam, fator = 1.3) => tam * PT * fator;
    const quebrar = (t, larg) => doc.splitTextToSize(String(t ?? '').replace(/\r/g, ''), larg);
    const limite = () => PH - MB;
    const cabe = (h) => y + h <= limite();
    const novaPagina = () => { doc.addPage(); y = MT; };
    const garantir = (h) => { if (!cabe(h)) novaPagina(); };
    const fill = (cor) => doc.setFillColor(...cor);
    const draw = (cor) => doc.setDrawColor(...cor);

    function secao(num, titulo, reservar = 20) {
      garantir(9 + reservar);
      y += 1.5;
      fill(AZUL); doc.roundedRect(ML, y, W, 7.2, 0.8, 0.8, 'F');
      fill(AMARELO); doc.circle(ML + 4.6, y + 3.6, 2.5, 'F');
      fonte('bold', 8.5, AZUL); doc.text(String(num), ML + 4.6, y + 4.65, { align: 'center' });
      fonte('bold', 9.5, [255, 255, 255]); doc.text(titulo.toUpperCase(), ML + 9.5, y + 4.9, { charSpace: 0.2 });
      y += 10;
    }

    function grade(campos, cols) {
      const cw = W / cols;
      for (let r = 0; r < campos.length; r += cols) {
        const linha = campos.slice(r, r + cols);
        const conteudos = linha.map(([rot, val]) => {
          fonte('bold', 9.5); const lv = quebrar(val || '—', cw - 5);
          return { rot, lv };
        });
        const h = 3.2 + alt(6.5) + 1 + Math.max(...conteudos.map((c) => c.lv.length)) * alt(9.5) + 2;
        garantir(h);
        conteudos.forEach((c, i) => {
          const x = ML + i * cw;
          fill(FUNDO); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, cw, h, 'FD');
          fonte('bold', 6.5, CINZA); doc.text(c.rot.toUpperCase(), x + 2.5, y + 4, { charSpace: 0.15 });
          fonte('bold', 9.5, [17, 17, 17]); doc.text(c.lv, x + 2.5, y + 4 + alt(6.5) + 2.6);
        });
        y += h;
      }
      y += 1;
    }

    /** Texto corrido com faixa lateral; quebra entre páginas sem cortar linhas. */
    function paragrafo(rotulo, texto, cor = AZUL, fundo = FUNDO) {
      const vazio = !String(texto || '').trim();
      fonte(vazio ? 'italic' : 'normal', 9);
      const ls = quebrar(vazio ? 'Não informado.' : texto, W - 7);
      const lh = alt(9, 1.35);
      const pad = 2;
      garantir(alt(6.5) + 3 + lh * Math.min(2, ls.length) + pad * 2);
      fonte('bold', 6.5, CINZA); doc.text(rotulo.toUpperCase(), ML, y + 2.5, { charSpace: 0.15 });
      y += alt(6.5) + 2;
      let i = 0;
      while (i < ls.length) {
        if (!cabe(lh + pad * 2)) novaPagina();
        const n = Math.max(1, Math.min(ls.length - i, Math.floor((limite() - y - pad * 2) / lh)));
        const h = n * lh + pad * 2;
        fill(fundo); doc.rect(ML, y, W, h, 'F');
        fill(cor); doc.rect(ML, y, 0.9, h, 'F');
        fonte(vazio ? 'italic' : 'normal', 9, vazio ? [123, 135, 144] : TEXTO);
        doc.text(ls.slice(i, i + n), ML + 4, y + pad + lh * 0.72, { lineHeightFactor: 1.35 });
        y += h; i += n;
      }
      y += 2.5;
    }

    function sensos(lista) {
      const cols = 5, cw = W / cols, lh = 5;
      const linhas = Math.ceil(lista.length / cols);
      garantir(alt(6.5) + 3 + linhas * lh);
      fonte('bold', 6.5, CINZA); doc.text('SENSO(S) 10S INFRINGIDO(S)', ML, y + 2.5, { charSpace: 0.15 });
      y += alt(6.5) + 2.5;
      lista.forEach((s, i) => {
        const x = ML + (i % cols) * cw, yy = y + Math.floor(i / cols) * lh;
        doc.setLineWidth(0.3);
        if (s.marcado) { fill(VERDE); draw(VERDE); doc.rect(x, yy, 3, 3, 'FD'); doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.45); doc.line(x + 0.6, yy + 1.5, x + 1.3, yy + 2.3); doc.line(x + 1.3, yy + 2.3, x + 2.5, yy + 0.7); }
        else { draw([154, 168, 175]); doc.rect(x, yy, 3, 3, 'S'); }
        fonte(s.marcado ? 'bold' : 'normal', 8, s.marcado ? [17, 17, 17] : [123, 135, 144]);
        doc.text(quebrar(s.nome, cw - 6)[0], x + 4.3, yy + 2.6);
      });
      y += linhas * lh + 2;
    }

    function fotosNC(nc) {
      const lista = nc.fotos;
      const g = gradeFotos(lista.length, densidade, W);
      const capH = 5.5;
      const rowH = g.boxH + capH;
      const cabH = 8;
      garantir(cabH + (lista.length ? rowH : 12));
      fonte('bold', 7.5, VERDE); doc.text(`EVIDÊNCIAS FOTOGRÁFICAS · NC ${nc.numero}`, ML, y + 3.5, { charSpace: 0.15 });
      fonte('normal', 7.5, CINZA); doc.text(lista.length ? `${lista.length} foto${lista.length > 1 ? 's' : ''}` : 'sem registro', ML + W, y + 3.5, { align: 'right' });
      fill(VERDE); doc.rect(ML, y + 5, W, 0.6, 'F');
      y += cabH;
      if (!lista.length) {
        draw(BORDA); doc.setLineDashPattern([1, 1], 0); doc.rect(ML, y, W, 10, 'S'); doc.setLineDashPattern([], 0);
        fonte('italic', 8.5, [123, 135, 144]); doc.text('Nenhuma evidência fotográfica registrada para esta não conformidade.', ML + W / 2, y + 6, { align: 'center' });
        y += 13;
        return;
      }
      for (let r = 0; r < lista.length; r += g.cols) {
        garantir(rowH);
        lista.slice(r, r + g.cols).forEach((f, c) => {
          const x = ML + c * (g.cellW + g.gap);
          fill(CINZA_FOTO); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, g.cellW, g.boxH, 'FD');
          const img = fotos.get(f.url);
          if (img) {
            const d = encaixar(img.w, img.h, g.cellW - 1, g.boxH - 1);
            doc.addImage(img.dataUrl, 'JPEG', x + (g.cellW - d.w) / 2, y + (g.boxH - d.h) / 2, d.w, d.h, undefined, 'NONE');
          } else {
            fonte('italic', 8, [123, 135, 144]); doc.text('Foto indisponível', x + g.cellW / 2, y + g.boxH / 2, { align: 'center' });
          }
          fill(FUNDO); doc.rect(x, y + g.boxH, g.cellW, capH, 'FD');
          fonte('bold', 7, AZUL); doc.text(f.legenda, x + 2, y + g.boxH + 3.7);
          if (f.registro) {
            fonte('bold', 7); const lw = doc.getTextWidth(f.legenda);
            fonte('normal', 6.3, CINZA);
            if (lw + doc.getTextWidth(f.registro) + 6 <= g.cellW) doc.text(f.registro, x + g.cellW - 2, y + g.boxH + 3.7, { align: 'right' });
          }
        });
        y += rowH + (g.cols === 3 ? 3 : 4);
      }
      y += 1;
    }

    /** Tabela com cabeçalho repetido a cada página; linhas não são cortadas. */
    function tabela(num, titulo, cabecalhos, larguras, linhas, vazio) {
      const tam = 8.2, lh = alt(tam, 1.3), pad = 1.8, hCab = 6.5;
      let h1 = 8;
      if (linhas.length) {
        h1 = Math.max(...linhas[0].map((t, i) => { fonte(i === 0 ? 'bold' : 'normal', tam); return quebrar(t || '—', larguras[i] - 4).length; })) * lh + pad * 2;
      }
      secao(num, titulo, hCab + Math.min(h1, 60));
      const desenharCab = () => {
        let x = ML;
        cabecalhos.forEach((t, i) => {
          fill([233, 239, 241]); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, larguras[i], hCab, 'FD');
          fonte('bold', 6.8, AZUL); doc.text(t.toUpperCase(), x + 2, y + 4.3, { charSpace: 0.1 });
          x += larguras[i];
        });
        y += hCab;
      };
      garantir(hCab + 8);
      desenharCab();
      if (!linhas.length) {
        draw(BORDA); doc.rect(ML, y, W, 8, 'S');
        fonte('italic', 8.5, [123, 135, 144]); doc.text(vazio, ML + 2, y + 5.2);
        y += 11; return;
      }
      linhas.forEach((cel, idx) => {
        let partes = cel.map((t, i) => { fonte(i === 0 ? 'bold' : 'normal', tam); return quebrar(t || '—', larguras[i] - 4); });
        while (partes.some((p) => p.length)) {
          const max = Math.max(...partes.map((p) => p.length));
          let n = max;
          if (!cabe(max * lh + pad * 2)) {
            const disp = Math.floor((limite() - y - pad * 2) / lh);
            if (disp >= 3 && max > 6) n = disp; // linha muito longa: divide entre páginas
            else { novaPagina(); desenharCab(); n = Math.min(max, Math.floor((limite() - y - pad * 2) / lh)); }
          }
          const h = Math.min(n, max) * lh + pad * 2;
          let x = ML;
          partes.forEach((p, i) => {
            fill(idx % 2 ? [250, 251, 252] : [255, 255, 255]); draw(BORDA); doc.rect(x, y, larguras[i], h, 'FD');
            fonte(i === 0 ? 'bold' : 'normal', tam, i === 0 ? AZUL : TEXTO);
            if (p.length) doc.text(p.slice(0, n), x + 2, y + pad + lh * 0.75, { lineHeightFactor: 1.3 });
            x += larguras[i];
          });
          partes = partes.map((p) => p.slice(n));
          y += h;
          if (partes.some((p) => p.length)) { novaPagina(); desenharCab(); }
        }
      });
      y += 3;
    }

    /* ---------- Conteúdo ---------- */
    secao(1, 'Identificação da vistoria');
    grade([['Data da vistoria', m.data], ['Área / Local', m.area_local], ['Setor / Processo', m.setor_processo], ['Realizada por', m.realizada_por]], 4);

    secao(2, 'Resumo', 32);
    const kpis = [[m.resumo.total, 'Não conformidades'], [m.resumo.criticas, 'NC críticas'], [m.resumo.prazos, 'Prazos definidos'], [m.totalFotos, 'Evidências fotográficas'], [m.resumo.status, 'Status geral']];
    const kgap = 2.5, kw = (W - kgap * (kpis.length - 1)) / kpis.length;
    kpis.forEach(([v, r], i) => {
      const x = ML + i * (kw + kgap);
      draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, kw, 16, 'S');
      fill(i === 1 && m.resumo.criticas ? [180, 35, 24] : VERDE); doc.rect(x, y, kw, 0.9, 'F');
      const texto = String(v);
      const numerico = /^\d+$/.test(texto);
      fonte('bold', numerico ? 15 : 10, AZUL); doc.text(quebrar(texto, kw - 4)[0], x + 2.5, y + (numerico ? 8.4 : 7.6));
      fonte('bold', 6, CINZA); doc.text(quebrar(r.toUpperCase(), kw - 4), x + 2.5, y + 12, { charSpace: 0.05, lineHeightFactor: 1.15 });
    });
    y += 19;
    paragrafo('Observação geral / principais pontos de atenção', m.observacao || '');

    secao(3, 'Não conformidades e evidências', 34);
    if (!m.ncs.length) { fonte('italic', 9, [123, 135, 144]); doc.text('Nenhuma não conformidade registrada nesta vistoria.', ML, y + 4); y += 9; }
    m.ncs.forEach((nc, idx) => {
      garantir(40);
      if (idx > 0) { draw(BORDA); doc.setLineWidth(0.3); doc.setLineDashPattern([1, 0.8], 0); doc.line(ML, y + 1, ML + W, y + 1); doc.setLineDashPattern([], 0); y += 4.5; }
      fonte('bold', 7.5); const pill = `NC ${nc.numero}`; const pw = doc.getTextWidth(pill) + 5;
      fill(AMARELO); doc.roundedRect(ML, y, pw, 5.6, 0.8, 0.8, 'F');
      fonte('bold', 7.5, AZUL); doc.text(pill, ML + pw / 2, y + 3.9, { align: 'center' });
      fonte('bold', 11.5, AZUL); doc.text(`NÃO CONFORMIDADE ${nc.numero}`, ML + pw + 3, y + 4.3, { charSpace: 0.2 });
      if (nc.criticidade) {
        const t = `CRITICIDADE ${nc.criticidade.toUpperCase()}`;
        fonte('bold', 7); const tw = doc.getTextWidth(t) + 5;
        const cor = CRIT_COR[chaveCrit(nc.criticidade)] || CINZA;
        draw(cor); doc.setLineWidth(0.35); doc.rect(ML + W - tw, y + 0.1, tw, 5.4, 'S');
        fonte('bold', 7, cor); doc.text(t, ML + W - tw / 2, y + 3.8, { align: 'center' });
      }
      y += 8.5;
      grade([['Área / Local', nc.area_local], ['Responsável', nc.responsavel], ['Prazo', nc.prazo || 'A definir']], 3);
      paragrafo('Descrição do desvio', nc.descricao);
      sensos(nc.sensos);
      paragrafo('Impacto / risco', nc.impacto_risco);
      paragrafo('Ação corretiva recomendada', nc.acao_corretiva, VERDE, FUNDO_VERDE);
      fotosNC(nc);
    });

    tabela(4, 'Acompanhamento das ações', ['NC', 'Ação / tratativa', 'Responsável', 'Prazo', 'Status'], [16, 76, 38, 22, 28],
      m.acoes.map((a) => [`NC ${a.nc}`, a.acao, a.responsavel, a.prazo, a.status]), 'Nenhuma ação registrada.');

    tabela(5, 'Retorno e eficácia', ['NC', 'Resultado da correção', 'Eficácia da ação'], [16, 82, 82],
      m.ncs.map((nc) => [`NC ${nc.numero}`,
        nc.retorno ? (nc.retorno.resultado_correcao || '—') : 'Pendente de registro.',
        nc.retorno ? (nc.retorno.eficacia || 'Pendente de verificação') : 'Pendente de verificação.']), 'Nenhum registro.');

    /* ---------- Cabeçalho e rodapé em todas as páginas ---------- */
    cabecalhoRodapePdf(doc, { titulo: 'Relatório de Vistoria', codigo: m.codigo, data: m.data, status: m.status, geradoEm: m.geradoEm }, logo, abelha);

    const blob = doc.output('blob');
    baixar(blob, nomeArquivo(m, 'pdf'));
    return blob;
  }

  /* =========================================================
     PDF — RELATÓRIO DE AUDITORIA 10S
     m = Auditorias10SModule.modeloRelatorio(id)
     ========================================================= */
  const RES_COR = {
    ok: { fundo: [225, 240, 232], cor: [10, 90, 55], t: 'CONFORME' },
    parcial: { fundo: [251, 242, 207], cor: [111, 84, 0], t: 'EM PARTE' },
    nok: { fundo: [253, 236, 234], cor: [145, 32, 24], t: 'NÃO CONFORME' },
    na: { fundo: [238, 242, 244], cor: [88, 105, 113], t: 'NÃO AVALIADO' },
  };
  const resultadoItem = (p) => (p === null ? RES_COR.na : p >= 1 ? RES_COR.ok : p > 0 ? RES_COR.parcial : RES_COR.nok);
  const ST_COR = {
    concluida: { fundo: [225, 240, 232], cor: [10, 90, 55] },
    emandamento: { fundo: [226, 237, 246], cor: [29, 79, 122] },
    pendente: { fundo: [251, 242, 207], cor: [111, 84, 0] },
    atrasada: { fundo: [253, 236, 234], cor: [145, 32, 24] },
    cancelado: { fundo: [238, 242, 244], cor: [88, 105, 113] },
  };
  const statusAcao = (a) => (a.atrasada ? ST_COR.atrasada : ST_COR[chaveCrit(a.status)] || ST_COR.cancelado);

  async function pdfAuditoria(m) {
    await carregarLib('jspdf');
    const [logo, abelha] = await Promise.all([prepararLogo(), prepararAbelha()]);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: `Relatório de Auditoria 10S ${m.codigo}`, subject: 'Qualidade 10S', author: 'Distribuidora Exemplo · Qualidade', creator: 'Qualidade 10S · Demo' });

    const { AZUL, VERDE, TEXTO, CINZA, BORDA, FUNDO, AMARELO } = COR;
    const PW = 210, PH = 297, ML = 15, MR = 15, MT = 33, MB = 18, W = PW - ML - MR;
    const PT = 0.3528;
    let y = MT;
    const fonte = (estilo, tam, cor = TEXTO) => { doc.setFont('helvetica', estilo); doc.setFontSize(tam); doc.setTextColor(...cor); };
    const alt = (tam, fator = 1.3) => tam * PT * fator;
    const quebrar = (t, larg) => doc.splitTextToSize(String(t ?? '').replace(/\r/g, ''), larg);
    const limite = () => PH - MB;
    const cabe = (h) => y + h <= limite();
    const novaPagina = () => { doc.addPage(); y = MT; };
    const garantir = (h) => { if (!cabe(h)) novaPagina(); };
    const fill = (cor) => doc.setFillColor(...cor);
    const draw = (cor) => doc.setDrawColor(...cor);
    const barra = (x, yy, w, frac, fundo = [227, 233, 236], cor = VERDE) => {
      fill(fundo); doc.roundedRect(x, yy, w, 1.8, 0.9, 0.9, 'F');
      const f = Math.max(0, Math.min(1, frac || 0));
      if (f > 0) { fill(cor); doc.roundedRect(x, yy, Math.max(1.8, w * f), 1.8, 0.9, 0.9, 'F'); }
    };

    function secao(num, titulo, reservar = 20) {
      garantir(9 + reservar);
      y += 1.5;
      fill(AZUL); doc.roundedRect(ML, y, W, 7.2, 0.8, 0.8, 'F');
      fill(AMARELO); doc.circle(ML + 4.6, y + 3.6, 2.5, 'F');
      fonte('bold', 8.5, AZUL); doc.text(String(num), ML + 4.6, y + 4.65, { align: 'center' });
      fonte('bold', 9.5, [255, 255, 255]); doc.text(titulo.toUpperCase(), ML + 9.5, y + 4.9, { charSpace: 0.2 });
      y += 10;
    }

    function grade(campos, cols) {
      const cw = W / cols;
      const conteudos = campos.map(([rot, val]) => { fonte('bold', 9.5); return { rot, lv: quebrar(val || '—', cw - 5) }; });
      const h = 3.2 + alt(6.5) + 1 + Math.max(...conteudos.map((c) => c.lv.length)) * alt(9.5) + 2;
      garantir(h);
      conteudos.forEach((c, i) => {
        const x = ML + i * cw;
        fill(FUNDO); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, cw, h, 'FD');
        fonte('bold', 6.5, CINZA); doc.text(c.rot.toUpperCase(), x + 2.5, y + 4, { charSpace: 0.15 });
        fonte('bold', 9.5, [17, 17, 17]); doc.text(c.lv, x + 2.5, y + 4 + alt(6.5) + 2.6);
      });
      y += h;
    }

    function paragrafo(rotulo, texto, vazioTxt = 'Não informado.') {
      const vazio = !String(texto || '').trim();
      fonte(vazio ? 'italic' : 'normal', 9);
      const ls = quebrar(vazio ? vazioTxt : texto, W - 7);
      const lh = alt(9, 1.35), pad = 2;
      garantir(alt(6.5) + 3 + lh * Math.min(2, ls.length) + pad * 2);
      fonte('bold', 6.5, CINZA); doc.text(rotulo.toUpperCase(), ML, y + 2.5, { charSpace: 0.15 });
      y += alt(6.5) + 2;
      let i = 0;
      while (i < ls.length) {
        if (!cabe(lh + pad * 2)) novaPagina();
        const n = Math.max(1, Math.min(ls.length - i, Math.floor((limite() - y - pad * 2) / lh)));
        const h = n * lh + pad * 2;
        fill(FUNDO); doc.rect(ML, y, W, h, 'F');
        fill(AZUL); doc.rect(ML, y, 0.9, h, 'F');
        fonte(vazio ? 'italic' : 'normal', 9, vazio ? [123, 135, 144] : TEXTO);
        doc.text(ls.slice(i, i + n), ML + 4, y + pad + lh * 0.72, { lineHeightFactor: 1.35 });
        y += h; i += n;
      }
      y += 2.5;
    }

    /**
     * Tabela genérica: cabeçalho repetido em cada página, linhas não são cortadas
     * (exceto quando uma única linha é maior que a página).
     * cols  = [{ t: 'Título', w: mm, al: 'left'|'center'|'right' }]
     * linhas = [{ cels: [texto | { t, selo: {fundo,cor}, barra: 0..1, negrito, cor }], total: bool }]
     */
    function tabela(cols, linhas, vazio, antes) {
      const tam = 8, lh = alt(tam, 1.3), pad = 1.8, hCab = 6.5;
      const desenharCab = () => {
        let x = ML;
        cols.forEach((c) => {
          fill([233, 239, 241]); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, c.w, hCab, 'FD');
          fonte('bold', 6.6, AZUL);
          const tx = c.al === 'center' ? x + c.w / 2 : x + 2;
          doc.text(c.t.toUpperCase(), tx, y + 4.2, { charSpace: 0.08, align: c.al === 'center' ? 'center' : 'left' });
          x += c.w;
        });
        y += hCab;
      };
      const norm = (cel) => (cel !== null && typeof cel === 'object' ? cel : { t: cel });
      const linhasProntas = linhas.map((l) => ({
        ...l,
        partes: l.cels.map((c, i) => {
          const cc = norm(c);
          if (cc.barra !== undefined || cc.selo) return [];
          fonte(cc.negrito || l.total ? 'bold' : 'normal', tam);
          const larg = l.total && i === 0 ? cols.slice(0, cols.length - 1).reduce((s, k) => s + k.w, 0) - 4 : cols[i].w - 4;
          return quebrar(cc.t === '' || cc.t === null || cc.t === undefined ? '—' : cc.t, larg);
        }),
      }));
      const altLinha = (l) => Math.max(1, ...l.partes.map((p) => p.length)) * lh + pad * 2 + (l.cels.some((c) => norm(c).selo) ? 0.6 : 0);
      if (antes) antes(hCab + (linhasProntas.length ? Math.min(altLinha(linhasProntas[0]), 50) : 8));
      garantir(hCab + 8);
      desenharCab();
      if (!linhasProntas.length) {
        draw(BORDA); doc.rect(ML, y, W, 8, 'S');
        fonte('italic', 8.5, [123, 135, 144]); doc.text(vazio, ML + 2, y + 5.2);
        y += 11; return;
      }
      linhasProntas.forEach((l, idx) => {
        let partes = l.partes;
        let primeira = true;
        while (primeira || partes.some((p) => p.length)) {
          const max = Math.max(1, ...partes.map((p) => p.length));
          let n = max;
          const hNecessaria = max * lh + pad * 2;
          if (!cabe(hNecessaria)) {
            const disp = Math.floor((limite() - y - pad * 2) / lh);
            if (disp >= 3 && max > 8) n = disp;
            else { novaPagina(); desenharCab(); n = Math.min(max, Math.floor((limite() - y - pad * 2) / lh)); }
          }
          const h = n * lh + pad * 2;
          const fundoLinha = l.total ? [251, 242, 207] : idx % 2 ? [250, 251, 252] : [255, 255, 255];
          let x = ML;
          if (l.total) {
            const wEsq = cols.slice(0, cols.length - 1).reduce((s, k) => s + k.w, 0);
            const wDir = cols[cols.length - 1].w;
            fill(fundoLinha); draw(BORDA); doc.rect(ML, y, wEsq, h, 'FD'); doc.rect(ML + wEsq, y, wDir, h, 'FD');
            fonte('bold', tam, AZUL);
            doc.text(partes[0].slice(0, n), ML + wEsq - 2, y + pad + lh * 0.75, { align: 'right' });
            doc.text(partes[cols.length - 1].slice(0, n), ML + wEsq + wDir / 2, y + pad + lh * 0.75, { align: 'center' });
          } else {
            l.cels.forEach((c, i) => {
              const cc = norm(c), col = cols[i];
              fill(fundoLinha); draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, col.w, h, 'FD');
              if (primeira && cc.selo) {
                fonte('bold', 6.2); const tw = Math.min(col.w - 3, doc.getTextWidth(cc.t) + 3.2);
                const sx = col.al === 'center' ? x + (col.w - tw) / 2 : x + 1.8;
                fill(cc.selo.fundo); doc.roundedRect(sx, y + pad - 0.2, tw, 4, 0.6, 0.6, 'F');
                fonte('bold', 6.2, cc.selo.cor); doc.text(cc.t, sx + tw / 2, y + pad + 2.6, { align: 'center' });
              } else if (primeira && cc.barra !== undefined) {
                if (cc.barra === null) { fonte('italic', 7.5, [123, 135, 144]); doc.text('Não avaliado', x + 2, y + pad + lh * 0.75); }
                else {
                  barra(x + 2, y + pad + 0.9, col.w - 15, cc.barra);
                  fonte('bold', 7.5, AZUL); doc.text(`${Math.round(cc.barra * 100)}%`, x + col.w - 2, y + pad + 2.4, { align: 'right' });
                }
              } else if (partes[i] && partes[i].length) {
                fonte(cc.negrito ? 'bold' : 'normal', tam, cc.cor || TEXTO);
                const tx = col.al === 'center' ? x + col.w / 2 : x + 2;
                doc.text(partes[i].slice(0, n), tx, y + pad + lh * 0.75, { lineHeightFactor: 1.3, align: col.al === 'center' ? 'center' : 'left' });
              }
              x += col.w;
            });
          }
          partes = partes.map((p) => p.slice(n));
          y += h;
          primeira = false;
          if (partes.some((p) => p.length)) { novaPagina(); desenharCab(); }
        }
      });
      y += 2;
    }

    /* ---------- 1. Identificação ---------- */
    secao(1, 'Identificação da auditoria');
    grade([['Data da auditoria', m.data], ['Área', m.area], ['Auditoria nº', m.rodada], ['Status', m.status]], 4);
    grade([['Auditores', m.auditores], ['Prefeito e subprefeito', m.prefeito]], 2);
    grade([['Locais da área', m.locais]], 1);
    y += 1;

    /* ---------- 2. Resultado ---------- */
    secao(2, 'Resultado da auditoria', 50);
    const hRes = 27, wGeral = 46, gap = 2.5;
    const wComp = (W - wGeral - gap * 3) / 3;
    fill(AZUL); doc.roundedRect(ML, y, wGeral, hRes, 0.8, 0.8, 'F');
    fill(AMARELO); doc.rect(ML, y + hRes - 1.2, wGeral, 1.2, 'F');
    fonte('bold', 6.5, AMARELO); doc.text('NOTA GERAL', ML + 3.5, y + 5, { charSpace: 0.15 });
    fonte('bold', 22, [255, 255, 255]); doc.text(m.geralTxt, ML + 3.5, y + 14.5);
    const gw = doc.getTextWidth(m.geralTxt);
    fonte('normal', 8, [190, 205, 218]); doc.text('/ 10', ML + 4.5 + gw, y + 14.5);
    barra(ML + 3.5, y + 17.2, wGeral - 7, m.completa ? m.geral / 10 : 0, [58, 92, 122], AMARELO);
    fonte('normal', 5.8, [190, 205, 218]); doc.text(m.completa ? 'NCs 40% · Checklist 30% · Comport. 30%' : 'Cálculo incompleto', ML + 3.5, y + 23.3);
    m.componentes.forEach((c, i) => {
      const x = ML + wGeral + gap + i * (wComp + gap);
      draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, wComp, hRes, 'S');
      fill(VERDE); doc.rect(x, y, wComp, 0.9, 'F');
      fonte('bold', 6.3, CINZA); doc.text(quebrar(c.nome.toUpperCase(), wComp - 5)[0], x + 2.5, y + 5.2, { charSpace: 0.05 });
      fonte('bold', 15, AZUL); doc.text(c.notaTxt, x + 2.5, y + 13.5);
      const pt = `PESO ${c.peso}%`; fonte('bold', 5.8); const ptw = doc.getTextWidth(pt) + 2.6;
      fill([251, 242, 207]); doc.rect(x + wComp - 2.5 - ptw, y + 9.6, ptw, 3.8, 'F');
      fonte('bold', 5.8, [111, 84, 0]); doc.text(pt, x + wComp - 2.5 - ptw / 2, y + 12.3, { align: 'center' });
      barra(x + 2.5, y + 16.2, wComp - 5, c.nota === null ? 0 : c.nota / 10);
      fonte('normal', 7, CINZA); doc.text(quebrar(c.detalhe, wComp - 5)[0], x + 2.5, y + 22.5);
    });
    y += hRes + 3;
    if (!m.completa && m.aviso) {
      fonte('bold', 8); const la = quebrar(m.aviso, W - 7); const ha = la.length * alt(8, 1.3) + 4;
      garantir(ha);
      fill([253, 240, 220]); doc.rect(ML, y, W, ha, 'F'); fill([217, 138, 31]); doc.rect(ML, y, 0.9, ha, 'F');
      fonte('bold', 8, [138, 75, 8]); doc.text(la, ML + 4, y + 2 + alt(8) * 0.75, { lineHeightFactor: 1.3 });
      y += ha + 3;
    }
    const kpis = [[m.acoes.length, 'Ações no plano'], [m.acoesAbertas, 'Ações em aberto'], [m.acoesAtrasadas, 'Ações atrasadas'], [m.semPontuacao, 'Itens sem pontuação']];
    const kw = (W - gap * 3) / 4;
    garantir(14);
    kpis.forEach(([v, r], i) => {
      const x = ML + i * (kw + gap);
      draw(BORDA); doc.setLineWidth(0.25); doc.rect(x, y, kw, 12.5, 'S');
      fill(i === 2 && m.acoesAtrasadas ? [180, 35, 24] : VERDE); doc.rect(x, y, kw, 0.9, 'F');
      fonte('bold', 13, AZUL); doc.text(String(v), x + 2.5, y + 7.3);
      fonte('bold', 6, CINZA); doc.text(r.toUpperCase(), x + 2.5, y + 10.6, { charSpace: 0.05 });
    });
    y += 15.5;
    paragrafo('Observações gerais', m.observacao, 'Nenhuma observação registrada.');

    /* ---------- 3. Desempenho por senso ---------- */
    tabela(
      [{ t: 'Senso', w: 16, al: 'center' }, { t: 'Descrição', w: 82 }, { t: 'Pontos', w: 24, al: 'center' }, { t: 'Aproveitamento', w: 58 }],
      m.sensos.map((s) => ({ cels: [
        { t: String(s.num).padStart(2, '0'), negrito: true, cor: AZUL },
        { t: `${s.nome}${s.japones ? ` (${s.japones})` : ''}`, negrito: true },
        s.possiveis ? `${String(s.pontos).replace('.', ',')} / ${s.possiveis}` : '—',
        { barra: s.pct === null ? null : s.pct / 100 },
      ] })),
      'Sem dados.',
      (h) => secao(3, 'Desempenho por senso', h),
    );

    /* ---------- 4. Checklist ---------- */
    secao(4, 'Checklist dos 10 sensos', 30);
    fonte('normal', 7.5, CINZA); doc.text('Pontuação: 1 = conforme · 0,5 = em parte · 0 = não conforme · — = não avaliado', ML, y + 2.5); y += 5.5;
    const colsChk = [{ t: 'Nº', w: 12, al: 'center' }, { t: 'Item auditado', w: 76 }, { t: 'Resposta', w: 17, al: 'center' }, { t: 'Pontos', w: 14, al: 'center' }, { t: 'Resultado', w: 24, al: 'center' }, { t: 'Observação', w: 37 }];
    m.sensos.forEach((s, idx) => {
      const cabSenso = (reservar) => {
        garantir(9 + reservar);
        if (idx > 0) y += 2.5;
        const pill = String(s.num).padStart(2, '0');
        fonte('bold', 7.5); const pw = doc.getTextWidth(pill) + 4.5;
        fill(AMARELO); doc.roundedRect(ML, y, pw, 5.2, 0.7, 0.7, 'F');
        fonte('bold', 7.5, AZUL); doc.text(pill, ML + pw / 2, y + 3.65, { align: 'center' });
        const tit = `SENSO DE ${s.nome.toUpperCase()}`;
        fonte('bold', 9.5, AZUL); doc.text(tit, ML + pw + 2.5, y + 3.9, { charSpace: 0.1 });
        const tw = doc.getTextWidth(tit) + tit.length * 0.1;
        if (s.japones) { fonte('italic', 8, CINZA); doc.text(s.japones, ML + pw + 4.5 + tw, y + 3.9); }
        fonte('bold', 7.5, VERDE); doc.text(s.pontosTxt, ML + W, y + 3.9, { align: 'right' });
        fill(VERDE); doc.rect(ML, y + 6.3, W, 0.6, 'F');
        y += 8.5;
      };
      if (!s.itens.length) {
        cabSenso(10);
        draw(BORDA); doc.setLineDashPattern([1, 1], 0); doc.rect(ML, y, W, 8, 'S'); doc.setLineDashPattern([], 0);
        fonte('italic', 8, [123, 135, 144]); doc.text(quebrar(s.aviso || 'Sem itens neste senso.', W - 6)[0], ML + W / 2, y + 5, { align: 'center' });
        y += 10;
        return;
      }
      tabela(colsChk, s.itens.map((i) => {
        const r = resultadoItem(i.pontos);
        return { cels: [
          { t: i.codigo, negrito: true, cor: AZUL }, i.pergunta, i.resposta || '—', { t: i.pontosTxt, negrito: true }, { t: r.t, selo: r }, i.obs || '—',
        ] };
      }), 'Sem itens.', (h) => cabSenso(h));
    });

    /* ---------- 5. Plano de ação ---------- */
    tabela(
      [{ t: 'Nº', w: 9, al: 'center' }, { t: 'Não conformidade', w: 36 }, { t: 'Ação', w: 46 }, { t: 'Responsável', w: 28 }, { t: 'Previsto', w: 19, al: 'center' }, { t: 'Realizado', w: 19, al: 'center' }, { t: 'Status', w: 23, al: 'center' }],
      m.acoes.map((a) => ({ cels: [
        { t: a.numero, negrito: true, cor: AZUL }, a.nc, a.obs ? `${a.acao || '—'}\nObs.: ${a.obs}` : a.acao,
        a.onde ? `${a.responsavel || '—'}\n${a.onde}` : a.responsavel, a.prazoPrevisto, a.prazoRealizado,
        { t: (a.atrasada ? 'ATRASADA' : a.status.toUpperCase()), selo: statusAcao(a) },
      ] })),
      'Nenhuma ação registrada.',
      (h) => secao(5, 'Plano de ação', h),
    );

    /* ---------- 6. Nota do prefeito ---------- */
    const colsNota = (t) => [{ t, w: 108 }, { t: 'Peso', w: 24, al: 'center' }, { t: 'Nota', w: 24, al: 'center' }, { t: 'Ponderada', w: 24, al: 'center' }];
    tabela(colsNota('Nota comportamental / técnica'),
      [...m.comportamental.map((l) => ({ cels: [l.nome, `${l.peso}%`, l.notaTxt, l.ponderada] })),
        { total: true, cels: ['TOTAL COMPORTAMENTAL', '', '', m.compTotal] }],
      '', (h) => secao(6, 'Nota do prefeito', h + 50));
    y += 1;
    tabela(colsNota('Avaliação integrada'),
      [...m.componentes.map((c) => ({ cels: [`${c.nome} (${c.detalhe})`, `${c.peso}%`, c.notaTxt, c.ponderado] })),
        { total: true, cels: [`NOTA GERAL${m.completa ? '' : ' (INCOMPLETA)'}`, '', '', m.geralParcialTxt] }],
      '', (h) => garantir(h + 20));

    cabecalhoRodapePdf(doc, { titulo: 'Relatório de Auditoria 10S', codigo: m.codigo, data: m.data, status: m.status, geradoEm: m.geradoEm }, logo, abelha);
    const blob = doc.output('blob');
    baixar(blob, `Relatorio-Auditoria-10S-${m.codigo}.pdf`);
    return blob;
  }

  /* =========================================================
     DOCX (Word editável)
     ========================================================= */
  function base64ParaBytes(dataUrl) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* =========================================================
     DOCX — base compartilhada (cabeçalho, rodapé, estilos, página)
     info = { titulo, codigo, data, status, geradoEm, descricao }
     ========================================================= */
  const DX = { AZUL: '103A5E', VERDE: '006B3F', AMARELO: 'F5D83B', CINZA: '586971', TEXTO: '1D2A33', BORDA: 'CBD6DC', FUNDO: 'F6F8F9' };
  const MM_TW = 56.6929; // twips por mm
  const PAGE_W_TW = 11906;
  const MARG_LR_TW = Math.round(15 * MM_TW);
  const CW_TW = PAGE_W_TW - 2 * MARG_LR_TW; // largura útil (180 mm)
  const pxDeMm = (mm) => Math.round((mm / 25.4) * 96);

  function montarDocx(D, info, corpo, logo, abelha) {
    const {
      Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
      ShadingType, AlignmentType, ImageRun, Header, Footer, PageNumber, TabStopType, VerticalAlign, TableLayoutType,
    } = D;
    const CW = CW_TW, MM = MM_TW;
    const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const bordasNenhuma = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda };
    const sombra = (cor) => ({ type: ShadingType.CLEAR, color: 'auto', fill: cor });

    const hw = [Math.round(30 * MM) + 120, 0, Math.round(44 * MM), Math.round(26 * MM)];
    hw[1] = CW - hw[0] - hw[2] - hw[3];
    const imgRun = (img, wMm, hMm) => { const d = encaixar(img.w, img.h, wMm, hMm); return new ImageRun({ data: base64ParaBytes(img.dataUrl), transformation: { width: pxDeMm(d.w), height: pxDeMm(d.h) } }); };
    const celCab = (w, paragrafos, extra = {}) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders: bordasNenhuma, verticalAlign: VerticalAlign.CENTER, margins: { left: 0, right: 80 }, ...extra, children: paragrafos });
    const linhaDoc = (rot, val) => new Paragraph({
      spacing: { after: 10 },
      tabStops: [{ type: TabStopType.RIGHT, position: hw[2] - 200 }],
      children: [new TextRun({ text: rot, size: 12, color: DX.CINZA, characterSpacing: 4 }), new TextRun({ text: `\t${val}`, bold: true, size: 15, color: DX.AZUL })],
    });
    const titulo = info.titulo.toUpperCase();
    const cabecalho = new Header({
      children: [
        new Table({
          width: { size: CW, type: WidthType.DXA }, columnWidths: hw, layout: TableLayoutType.FIXED, borders: bordasNenhuma,
          rows: [new TableRow({ children: [
            celCab(hw[0], [new Paragraph({ children: [logo ? imgRun(logo, 30, 13) : new TextRun({ text: 'DISTRIBUIDORA EXEMPLO', bold: true, size: 22, color: DX.AZUL })] })]),
            celCab(hw[1], [
              new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: 'GESTÃO DA QUALIDADE · 10S', bold: true, size: 12, color: DX.VERDE, characterSpacing: 10 })] }),
              new Paragraph({ children: [new TextRun({ text: titulo, bold: true, size: titulo.length > 22 ? 23 : 26, color: DX.AZUL })] }),
            ]),
            celCab(hw[2], [linhaDoc('DOCUMENTO', info.codigo), linhaDoc('DATA', info.data), linhaDoc('STATUS', info.status || '—')],
              { borders: { ...bordasNenhuma, left: { style: BorderStyle.SINGLE, size: 18, color: DX.AMARELO } }, margins: { left: 140, right: 60 } }),
            celCab(hw[3], [new Paragraph({ alignment: AlignmentType.RIGHT, children: abelha ? [imgRun(abelha, 24, 19)] : [] })], { margins: { left: 0, right: 0 } }),
          ] })],
        }),
        new Table({
          width: { size: CW, type: WidthType.DXA }, columnWidths: [Math.round(CW * 0.78), CW - Math.round(CW * 0.78)], layout: TableLayoutType.FIXED, borders: bordasNenhuma,
          rows: [new TableRow({ height: { value: 60, rule: D.HeightRule.EXACT }, children: [DX.VERDE, DX.AMARELO].map((cor, i) => new TableCell({
            width: { size: i ? CW - Math.round(CW * 0.78) : Math.round(CW * 0.78), type: WidthType.DXA }, borders: bordasNenhuma, shading: sombra(cor),
            children: [new Paragraph({ spacing: { before: 0, after: 0, line: 60, lineRule: D.LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] })],
          })) })],
        }),
      ],
    });
    const rodape = new Footer({
      children: [new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: DX.BORDA, space: 4 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        children: [
          new TextRun({ text: `Distribuidora Exemplo · Gestão da Qualidade · ${info.codigo} · Gerado em ${info.geradoEm}`, size: 14, color: DX.CINZA }),
          new TextRun({ children: ['\tPágina ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 14, bold: true, color: DX.AZUL }),
        ],
      })],
    });

    return new Document({
      creator: 'Qualidade 10S · Demo',
      title: `${info.titulo} ${info.codigo}`,
      description: info.descricao || 'Relatório gerado pelo Sistema de Qualidade 10S',
      styles: {
        default: { document: { run: { font: 'Arial', size: 18, color: DX.TEXTO }, paragraph: { spacing: { line: 264, lineRule: D.LineRuleType.AUTO } } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', bold: true, size: 19, color: 'FFFFFF' }, paragraph: { keepNext: true, outlineLevel: 0 } },
          { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', bold: true, size: 23, color: DX.AZUL }, paragraph: { keepNext: true, outlineLevel: 1 } },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: { width: PAGE_W_TW, height: 16838 },
            margin: { top: Math.round(32 * MM), bottom: Math.round(20 * MM), left: MARG_LR_TW, right: MARG_LR_TW, header: Math.round(9 * MM), footer: Math.round(8 * MM) },
          },
        },
        headers: { default: cabecalho },
        footers: { default: rodape },
        children: corpo,
      }],
    });
  }

  async function docx(m, opcoes = {}) {
    const densidade = opcoes.densidade === 9 ? 9 : 6;
    await carregarLib('docx');
    const [fotos, logo, abelha] = await Promise.all([prepararFotos(m, opcoes.progresso), prepararLogo(), prepararAbelha()]);
    const D = window.docx;
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
      ShadingType, AlignmentType, ImageRun, Header, Footer, PageNumber, TabStopType, VerticalAlign,
      HeadingLevel, TableLayoutType,
    } = D;

    const AZUL = '103A5E', VERDE = '006B3F', AMARELO = 'F5D83B', CINZA = '586971', TEXTO = '1D2A33', BORDA = 'CBD6DC', FUNDO = 'F6F8F9';
    const MM = 56.6929; // twips por mm
    const PAGE_W = 11906, MARG_LR = Math.round(15 * MM);
    const CW = PAGE_W - 2 * MARG_LR; // largura útil em twips (180 mm)

    const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const borda = { style: BorderStyle.SINGLE, size: 4, color: BORDA };
    const bordas = { top: borda, bottom: borda, left: borda, right: borda };
    const bordasNenhuma = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda };
    const sombra = (cor) => ({ type: ShadingType.CLEAR, color: 'auto', fill: cor });

    const runs = (texto, o = {}) => String(texto ?? '').split(/\r?\n/).map((linha, i) => new TextRun({ text: linha, break: i ? 1 : 0, ...o }));
    const rotulo = (t, o = {}) => new Paragraph({ spacing: { before: 120, after: 40 }, keepNext: true, ...o, children: [new TextRun({ text: t.toUpperCase(), bold: true, size: 14, color: CINZA, characterSpacing: 10 })] });

    const secao = (num, titulo) => new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      shading: sombra(AZUL),
      spacing: { before: 280, after: 140 },
      indent: { left: 60, right: 60 },
      children: [
        new TextRun({ text: ` ${num} `, bold: true, size: 18, color: AZUL, shading: { type: ShadingType.CLEAR, color: 'auto', fill: AMARELO } }),
        new TextRun({ text: `   ${titulo.toUpperCase()}`, bold: true, size: 19, color: 'FFFFFF', characterSpacing: 12 }),
      ],
    });

    function grade(campos, cols) {
      const w = Math.floor(CW / cols);
      const linhas = [];
      for (let r = 0; r < campos.length; r += cols) {
        linhas.push(new TableRow({
          cantSplit: true,
          children: campos.slice(r, r + cols).map(([rot, val]) => new TableCell({
            width: { size: w, type: WidthType.DXA },
            shading: sombra(FUNDO),
            borders: bordas,
            margins: { top: 70, bottom: 70, left: 110, right: 110 },
            children: [
              new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: rot.toUpperCase(), bold: true, size: 13, color: CINZA, characterSpacing: 8 })] }),
              new Paragraph({ children: runs(val || '—', { bold: true, size: 19, color: '111111' }) }),
            ],
          })),
        }));
      }
      return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: Array(cols).fill(w), layout: TableLayoutType.FIXED, rows: linhas });
    }

    function paragrafo(titulo, texto, cor = AZUL, fundo = FUNDO) {
      const vazio = !String(texto || '').trim();
      return [
        rotulo(titulo),
        ...String(vazio ? 'Não informado.' : texto).split(/\r?\n/).map((l) => new Paragraph({
          shading: sombra(fundo),
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: cor, space: 6 } },
          indent: { left: 140, right: 60 },
          spacing: { after: 0, line: 290, lineRule: D.LineRuleType ? D.LineRuleType.AUTO : 'auto' },
          children: [new TextRun({ text: l, size: 18, italics: vazio, color: vazio ? '7B8790' : TEXTO })],
        })),
        new Paragraph({ spacing: { after: 60 }, children: [] }),
      ];
    }

    function sensos(lista) {
      const cols = 5, w = Math.floor(CW / cols);
      const linhas = [];
      for (let r = 0; r < lista.length; r += cols) {
        const fatia = lista.slice(r, r + cols);
        while (fatia.length < cols) fatia.push(null);
        linhas.push(new TableRow({
          children: fatia.map((s) => new TableCell({
            width: { size: w, type: WidthType.DXA }, borders: bordasNenhuma,
            margins: { top: 20, bottom: 20, left: 0, right: 60 },
            children: [new Paragraph({ children: s ? [
              new TextRun({ text: s.marcado ? '☒ ' : '☐ ', font: 'Segoe UI Symbol', size: 18, color: s.marcado ? VERDE : '9AA8AF' }),
              new TextRun({ text: s.nome, size: 16, bold: s.marcado, color: s.marcado ? '111111' : '7B8790' }),
            ] : [] })],
          })),
        }));
      }
      return [rotulo('Senso(s) 10S infringido(s)'), new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: Array(cols).fill(w), layout: TableLayoutType.FIXED, borders: bordasNenhuma, rows: linhas })];
    }

    function fotosNC(nc) {
      const lista = nc.fotos;
      const cab = new Paragraph({
        keepNext: true,
        spacing: { before: 200, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: VERDE, space: 2 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        children: [
          new TextRun({ text: `EVIDÊNCIAS FOTOGRÁFICAS · NC ${nc.numero}`, bold: true, size: 16, color: VERDE, characterSpacing: 10 }),
          new TextRun({ text: `\t${lista.length ? `${lista.length} foto${lista.length > 1 ? 's' : ''}` : 'sem registro'}`, size: 16, color: CINZA }),
        ],
      });
      if (!lista.length) {
        return [cab, new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: 'Nenhuma evidência fotográfica registrada para esta não conformidade.', italics: true, size: 17, color: '7B8790' })] })];
      }
      const g = gradeFotos(lista.length, densidade, 180);
      const cellTw = Math.floor(CW / g.cols);
      // Word: margens internas de célula ocupam espaço; caixa da foto um pouco menor que a do PDF
      const boxW = g.cellW - (g.cols === 1 ? 4 : 5);
      const boxH = g.cols === 1 ? 112 : (densidade === 9 ? 55 : 62);
      const linhas = [];
      for (let r = 0; r < lista.length; r += g.cols) {
        const fatia = lista.slice(r, r + g.cols);
        while (fatia.length < g.cols) fatia.push(null);
        linhas.push(new TableRow({
          cantSplit: true,
          children: fatia.map((f) => {
            if (!f) return new TableCell({ width: { size: cellTw, type: WidthType.DXA }, borders: bordasNenhuma, children: [new Paragraph({ children: [] })] });
            const img = fotos.get(f.url);
            const filhos = [];
            if (img) {
              const d = encaixar(img.w, img.h, boxW, boxH);
              filhos.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [new ImageRun({ data: base64ParaBytes(img.dataUrl), transformation: { width: pxDeMm(d.w), height: pxDeMm(d.h) } })],
              }));
            } else {
              filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400, after: 400 }, children: [new TextRun({ text: 'Foto indisponível', italics: true, size: 16, color: '7B8790' })] }));
            }
            filhos.push(new Paragraph({
              shading: sombra(FUNDO),
              spacing: { before: 0, after: 0 },
              tabStops: [{ type: TabStopType.RIGHT, position: cellTw - 140 }],
              children: [
                new TextRun({ text: f.legenda, bold: true, size: 14, color: AZUL }),
                ...(f.registro && g.cols < 3 ? [new TextRun({ text: `\t${f.registro}`, size: 13, color: CINZA })] : []),
              ],
            }));
            return new TableCell({
              width: { size: cellTw, type: WidthType.DXA },
              borders: bordas,
              verticalAlign: VerticalAlign.BOTTOM,
              margins: { top: 40, bottom: 40, left: 60, right: 60 },
              children: filhos,
            });
          }),
        }));
      }
      return [cab, new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: Array(g.cols).fill(cellTw), layout: TableLayoutType.FIXED, rows: linhas }), new Paragraph({ spacing: { after: 120 }, children: [] })];
    }

    function tabela(cabecalhos, largurasMm, linhas, vazio) {
      const total = largurasMm.reduce((a, b) => a + b, 0);
      const larg = largurasMm.map((mm) => Math.floor((mm / total) * CW));
      const cel = (texto, i, cab, par) => new TableCell({
        width: { size: larg[i], type: WidthType.DXA },
        borders: bordas,
        shading: sombra(cab ? 'E9EFF1' : par ? 'FAFBFC' : 'FFFFFF'),
        margins: { top: 60, bottom: 60, left: 90, right: 90 },
        columnSpan: texto && texto.span ? texto.span : undefined,
        children: [new Paragraph({ children: runs(texto && texto.span ? texto.t : texto || '—', cab
          ? { bold: true, size: 14, color: AZUL, characterSpacing: 8 }
          : { size: 16, bold: i === 0, color: i === 0 ? AZUL : TEXTO, italics: !!(texto && texto.span) }) })],
      });
      const rows = [new TableRow({ tableHeader: true, cantSplit: true, children: cabecalhos.map((t, i) => cel(t.toUpperCase(), i, true)) })];
      if (!linhas.length) rows.push(new TableRow({ children: [cel({ t: vazio, span: cabecalhos.length }, 1, false)] }));
      linhas.forEach((l, r) => rows.push(new TableRow({ cantSplit: true, children: l.map((t, i) => cel(t, i, false, r % 2)) })));
      return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: larg, layout: TableLayoutType.FIXED, rows });
    }

    /* ---------- Conteúdo ---------- */
    const corpo = [];
    corpo.push(secao(1, 'Identificação da vistoria'));
    corpo.push(grade([['Data da vistoria', m.data], ['Área / Local', m.area_local], ['Setor / Processo', m.setor_processo], ['Realizada por', m.realizada_por]], 4));

    corpo.push(secao(2, 'Resumo'));
    const kpis = [[m.resumo.total, 'Não conformidades'], [m.resumo.criticas, 'NC críticas'], [m.resumo.prazos, 'Prazos definidos'], [m.totalFotos, 'Evidências fotográficas'], [m.resumo.status, 'Status geral']];
    const kw = Math.floor(CW / kpis.length);
    corpo.push(new Table({
      width: { size: kw * kpis.length, type: WidthType.DXA }, columnWidths: Array(kpis.length).fill(kw), layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, children: kpis.map(([v, r], i) => new TableCell({
        width: { size: kw, type: WidthType.DXA },
        borders: { ...bordas, top: { style: BorderStyle.SINGLE, size: 18, color: i === 1 && m.resumo.criticas ? 'B42318' : VERDE } },
        margins: { top: 80, bottom: 80, left: 110, right: 90 },
        children: [
          new Paragraph({ children: [new TextRun({ text: String(v), bold: true, size: /^\d+$/.test(String(v)) ? 30 : 20, color: AZUL })] }),
          new Paragraph({ children: [new TextRun({ text: r.toUpperCase(), bold: true, size: 12, color: CINZA, characterSpacing: 4 })] }),
        ],
      })) })],
    }));
    corpo.push(...paragrafo('Observação geral / principais pontos de atenção', m.observacao));

    corpo.push(secao(3, 'Não conformidades e evidências'));
    if (!m.ncs.length) corpo.push(new Paragraph({ children: [new TextRun({ text: 'Nenhuma não conformidade registrada nesta vistoria.', italics: true, size: 18, color: '7B8790' })] }));
    m.ncs.forEach((nc, idx) => {
      const corCrit = (CRIT_COR[chaveCrit(nc.criticidade)] || [88, 105, 113]).map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
      corpo.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        spacing: { before: idx ? 320 : 120, after: 100 },
        border: idx ? { top: { style: BorderStyle.DASHED, size: 4, color: BORDA, space: 10 } } : undefined,
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        children: [
          new TextRun({ text: ` NC ${nc.numero} `, bold: true, size: 16, color: AZUL, shading: { type: ShadingType.CLEAR, color: 'auto', fill: AMARELO } }),
          new TextRun({ text: `  NÃO CONFORMIDADE ${nc.numero}`, bold: true, size: 23, color: AZUL, characterSpacing: 10 }),
          ...(nc.criticidade ? [new TextRun({ text: `\tCRITICIDADE ${nc.criticidade.toUpperCase()}`, bold: true, size: 15, color: corCrit, characterSpacing: 6 })] : []),
        ],
      }));
      corpo.push(grade([['Área / Local', nc.area_local], ['Responsável', nc.responsavel], ['Prazo', nc.prazo || 'A definir']], 3));
      corpo.push(...paragrafo('Descrição do desvio', nc.descricao));
      corpo.push(...sensos(nc.sensos));
      corpo.push(...paragrafo('Impacto / risco', nc.impacto_risco));
      corpo.push(...paragrafo('Ação corretiva recomendada', nc.acao_corretiva, VERDE, 'EEF6F1'));
      corpo.push(...fotosNC(nc));
    });

    corpo.push(secao(4, 'Acompanhamento das ações'));
    corpo.push(tabela(['NC', 'Ação / tratativa', 'Responsável', 'Prazo', 'Status'], [16, 76, 38, 22, 28],
      m.acoes.map((a) => [`NC ${a.nc}`, a.acao, a.responsavel, a.prazo, a.status]), 'Nenhuma ação registrada.'));

    corpo.push(secao(5, 'Retorno e eficácia'));
    corpo.push(tabela(['NC', 'Resultado da correção', 'Eficácia da ação'], [16, 82, 82],
      m.ncs.map((nc) => [`NC ${nc.numero}`,
        nc.retorno ? (nc.retorno.resultado_correcao || '—') : 'Pendente de registro.',
        nc.retorno ? (nc.retorno.eficacia || 'Pendente de verificação') : 'Pendente de verificação.']), 'Nenhum registro.'));

    const documento = montarDocx(D, { titulo: 'Relatório de Vistoria', codigo: m.codigo, data: m.data, status: m.status, geradoEm: m.geradoEm,
      descricao: 'Relatório de vistoria gerado pelo Sistema de Qualidade 10S' }, corpo, logo, abelha);

    const blob = await Packer.toBlob(documento);
    baixar(blob, nomeArquivo(m, 'docx'));
    return blob;
  }

  /* =========================================================
     DOCX — RELATÓRIO DE AUDITORIA 10S
     ========================================================= */
  async function docxAuditoria(m) {
    await carregarLib('docx');
    const [logo, abelha] = await Promise.all([prepararLogo(), prepararAbelha()]);
    const D = window.docx;
    const {
      Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle,
      ShadingType, AlignmentType, TabStopType, VerticalAlign, HeadingLevel, TableLayoutType,
    } = D;
    const { AZUL, VERDE, AMARELO, CINZA, TEXTO, BORDA, FUNDO } = DX;
    const CW = CW_TW;
    const hex = (rgb) => rgb.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase();
    const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const borda = { style: BorderStyle.SINGLE, size: 4, color: BORDA };
    const bordas = { top: borda, bottom: borda, left: borda, right: borda };
    const bordasNenhuma = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda, insideHorizontal: semBorda, insideVertical: semBorda };
    const sombra = (cor) => ({ type: ShadingType.CLEAR, color: 'auto', fill: cor });
    const runs = (texto, o = {}) => String(texto ?? '').split(/\r?\n/).map((linha, i) => new TextRun({ text: linha, break: i ? 1 : 0, ...o }));
    const rotulo = (t) => new Paragraph({ spacing: { before: 120, after: 40 }, keepNext: true, children: [new TextRun({ text: t.toUpperCase(), bold: true, size: 14, color: CINZA, characterSpacing: 10 })] });
    const vazio = (h = 60) => new Paragraph({ spacing: { after: h }, children: [] });
    const largs = (mm) => { const t = mm.reduce((a, b) => a + b, 0); const l = mm.map((v) => Math.floor((v / t) * CW)); l[l.length - 1] += CW - l.reduce((a, b) => a + b, 0); return l; };

    const secao = (num, titulo) => new Paragraph({
      heading: HeadingLevel.HEADING_1, keepNext: true, shading: sombra(AZUL),
      spacing: { before: 280, after: 140 }, indent: { left: 60, right: 60 },
      children: [
        new TextRun({ text: ` ${num} `, bold: true, size: 18, color: AZUL, shading: { type: ShadingType.CLEAR, color: 'auto', fill: AMARELO } }),
        new TextRun({ text: `   ${titulo.toUpperCase()}`, bold: true, size: 19, color: 'FFFFFF', characterSpacing: 12 }),
      ],
    });

    function grade(campos) {
      const l = largs(campos.map(() => 1));
      return new Table({
        width: { size: CW, type: WidthType.DXA }, columnWidths: l, layout: TableLayoutType.FIXED,
        rows: [new TableRow({ cantSplit: true, children: campos.map(([rot, val], i) => new TableCell({
          width: { size: l[i], type: WidthType.DXA }, shading: sombra(FUNDO), borders: bordas,
          margins: { top: 70, bottom: 70, left: 110, right: 110 },
          children: [
            new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: rot.toUpperCase(), bold: true, size: 13, color: CINZA, characterSpacing: 8 })] }),
            new Paragraph({ children: runs(val || '—', { bold: true, size: 19, color: '111111' }) }),
          ],
        })) })],
      });
    }

    function paragrafo(titulo, texto, vazioTxt = 'Não informado.') {
      const v = !String(texto || '').trim();
      return [rotulo(titulo), ...String(v ? vazioTxt : texto).split(/\r?\n/).map((l) => new Paragraph({
        shading: sombra(FUNDO), border: { left: { style: BorderStyle.SINGLE, size: 18, color: AZUL, space: 6 } },
        indent: { left: 140, right: 60 }, spacing: { after: 0, line: 290, lineRule: D.LineRuleType.AUTO },
        children: [new TextRun({ text: l, size: 18, italics: v, color: v ? '7B8790' : TEXTO })],
      })), vazio()];
    }

    /** Tabela: cols = [{t, w(mm), al}], linhas = [{ cels: [texto | {t, selo:{fundo,cor}, negrito, cor}], total }] */
    function tabela(cols, linhas, vazioTxt) {
      const l = largs(cols.map((c) => c.w));
      const al = (c) => (c.al === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT);
      const norm = (c) => (c !== null && typeof c === 'object' ? c : { t: c });
      const cab = new TableRow({ tableHeader: true, cantSplit: true, children: cols.map((c, i) => new TableCell({
        width: { size: l[i], type: WidthType.DXA }, borders: bordas, shading: sombra('E9EFF1'), margins: { top: 60, bottom: 60, left: 90, right: 90 },
        children: [new Paragraph({ alignment: al(c), children: [new TextRun({ text: c.t.toUpperCase(), bold: true, size: 13, color: AZUL, characterSpacing: 6 })] })],
      })) });
      const rows = [cab];
      if (!linhas.length) {
        rows.push(new TableRow({ children: [new TableCell({ columnSpan: cols.length, width: { size: CW, type: WidthType.DXA }, borders: bordas, margins: { top: 60, bottom: 60, left: 90, right: 90 },
          children: [new Paragraph({ children: [new TextRun({ text: vazioTxt, italics: true, size: 16, color: '7B8790' })] })] })] }));
      }
      linhas.forEach((ln, r) => {
        if (ln.total) {
          const wEsq = l.slice(0, -1).reduce((a, b) => a + b, 0);
          rows.push(new TableRow({ cantSplit: true, children: [
            new TableCell({ columnSpan: cols.length - 1, width: { size: wEsq, type: WidthType.DXA }, borders: bordas, shading: sombra('FBF2CF'), margins: { top: 60, bottom: 60, left: 90, right: 90 },
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(norm(ln.cels[0]).t), bold: true, size: 16, color: AZUL })] })] }),
            new TableCell({ width: { size: l[l.length - 1], type: WidthType.DXA }, borders: bordas, shading: sombra('FBF2CF'), margins: { top: 60, bottom: 60, left: 90, right: 90 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(norm(ln.cels[ln.cels.length - 1]).t), bold: true, size: 18, color: AZUL })] })] }),
          ] }));
          return;
        }
        rows.push(new TableRow({ cantSplit: true, children: ln.cels.map((c, i) => {
          const cc = norm(c);
          const texto = cc.t === '' || cc.t === null || cc.t === undefined ? '—' : String(cc.t);
          const conteudo = cc.selo
            ? [new TextRun({ text: ` ${texto} `, bold: true, size: 13, color: hex(cc.selo.cor), shading: { type: ShadingType.CLEAR, color: 'auto', fill: hex(cc.selo.fundo) } })]
            : runs(texto, { size: 16, bold: !!cc.negrito, color: cc.cor ? hex(cc.cor) : TEXTO });
          return new TableCell({
            width: { size: l[i], type: WidthType.DXA }, borders: bordas, shading: sombra(r % 2 ? 'FAFBFC' : 'FFFFFF'),
            margins: { top: 50, bottom: 50, left: 90, right: 90 }, verticalAlign: VerticalAlign.TOP,
            children: [new Paragraph({ alignment: al(cols[i]), children: conteudo })],
          });
        }) }));
      });
      return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: l, layout: TableLayoutType.FIXED, rows });
    }

    const corpo = [];

    /* 1. Identificação */
    corpo.push(secao(1, 'Identificação da auditoria'));
    corpo.push(grade([['Data da auditoria', m.data], ['Área', m.area], ['Auditoria nº', m.rodada], ['Status', m.status]]));
    corpo.push(grade([['Auditores', m.auditores], ['Prefeito e subprefeito', m.prefeito]]));
    corpo.push(grade([['Locais da área', m.locais]]));

    /* 2. Resultado */
    corpo.push(secao(2, 'Resultado da auditoria'));
    const lr = largs([46, 44.5, 44.5, 45]);
    const card = (i, filhos, extra = {}) => new TableCell({ width: { size: lr[i], type: WidthType.DXA }, margins: { top: 90, bottom: 90, left: 120, right: 100 }, verticalAlign: VerticalAlign.TOP, ...extra, children: filhos });
    corpo.push(new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: lr, layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, children: [
        card(0, [
          new Paragraph({ children: [new TextRun({ text: 'NOTA GERAL', bold: true, size: 13, color: AMARELO, characterSpacing: 10 })] }),
          new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: m.geralTxt, bold: true, size: 44, color: 'FFFFFF' }), new TextRun({ text: ' / 10', size: 16, color: 'BECDDA' })] }),
          new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: m.completa ? 'NCs 40% · Checklist 30% · Comport. 30%' : 'Cálculo incompleto', size: 12, color: 'BECDDA' })] }),
        ], { shading: sombra(AZUL), borders: { ...bordasNenhuma, bottom: { style: BorderStyle.SINGLE, size: 24, color: AMARELO } } }),
        ...m.componentes.map((c, i) => card(i + 1, [
          new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: lr[i + 1] - 240 }], children: [
            new TextRun({ text: c.nome.toUpperCase(), bold: true, size: 12, color: CINZA, characterSpacing: 4 }),
          ] }),
          new Paragraph({ children: [new TextRun({ text: ` PESO ${c.peso}% `, bold: true, size: 11, color: '6F5400', shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FBF2CF' } })] }),
          new Paragraph({ spacing: { before: 40 }, children: [new TextRun({ text: c.notaTxt, bold: true, size: 30, color: AZUL })] }),
          new Paragraph({ children: [new TextRun({ text: c.detalhe, size: 13, color: CINZA })] }),
        ], { borders: { ...bordas, top: { style: BorderStyle.SINGLE, size: 18, color: VERDE } } })),
      ] })],
    }));
    if (!m.completa && m.aviso) {
      corpo.push(new Paragraph({ spacing: { before: 120 }, shading: sombra('FDF0DC'), border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'D98A1F', space: 6 } }, indent: { left: 140 },
        children: [new TextRun({ text: m.aviso, bold: true, size: 16, color: '8A4B08' })] }));
    }
    corpo.push(vazio(80));
    const kl = largs([1, 1, 1, 1]);
    corpo.push(new Table({
      width: { size: CW, type: WidthType.DXA }, columnWidths: kl, layout: TableLayoutType.FIXED,
      rows: [new TableRow({ cantSplit: true, children: [[m.acoes.length, 'Ações no plano'], [m.acoesAbertas, 'Ações em aberto'], [m.acoesAtrasadas, 'Ações atrasadas'], [m.semPontuacao, 'Itens sem pontuação']].map(([v, r], i) => new TableCell({
        width: { size: kl[i], type: WidthType.DXA }, borders: { ...bordas, top: { style: BorderStyle.SINGLE, size: 18, color: i === 2 && m.acoesAtrasadas ? 'B42318' : VERDE } },
        margins: { top: 60, bottom: 60, left: 110, right: 90 },
        children: [
          new Paragraph({ children: [new TextRun({ text: String(v), bold: true, size: 26, color: AZUL })] }),
          new Paragraph({ children: [new TextRun({ text: r.toUpperCase(), bold: true, size: 12, color: CINZA, characterSpacing: 4 })] }),
        ],
      })) })],
    }));
    corpo.push(...paragrafo('Observações gerais', m.observacao, 'Nenhuma observação registrada.'));

    /* 3. Desempenho por senso */
    corpo.push(secao(3, 'Desempenho por senso'));
    corpo.push(tabela(
      [{ t: 'Senso', w: 16, al: 'center' }, { t: 'Descrição', w: 96 }, { t: 'Pontos', w: 30, al: 'center' }, { t: 'Aproveitamento', w: 38, al: 'center' }],
      m.sensos.map((s) => ({ cels: [
        { t: String(s.num).padStart(2, '0'), negrito: true, cor: COR.AZUL },
        { t: `${s.nome}${s.japones ? ` (${s.japones})` : ''}`, negrito: true },
        s.possiveis ? `${String(s.pontos).replace('.', ',')} / ${s.possiveis}` : '—',
        s.pct === null ? { t: 'Não avaliado', cor: [123, 135, 144] } : { t: `${Math.round(s.pct)}%`, negrito: true, cor: COR.AZUL },
      ] })), 'Sem dados.'));

    /* 4. Checklist */
    corpo.push(secao(4, 'Checklist dos 10 sensos'));
    corpo.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Pontuação: 1 = conforme · 0,5 = em parte · 0 = não conforme · — = não avaliado', size: 14, color: CINZA })] }));
    const colsChk = [{ t: 'Nº', w: 12, al: 'center' }, { t: 'Item auditado', w: 74 }, { t: 'Resposta', w: 18, al: 'center' }, { t: 'Pontos', w: 15, al: 'center' }, { t: 'Resultado', w: 25, al: 'center' }, { t: 'Observação', w: 36 }];
    m.sensos.forEach((s, idx) => {
      corpo.push(new Paragraph({
        heading: HeadingLevel.HEADING_2, keepNext: true,
        spacing: { before: idx ? 240 : 80, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: VERDE, space: 2 } },
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        children: [
          new TextRun({ text: ` ${String(s.num).padStart(2, '0')} `, bold: true, size: 15, color: AZUL, shading: { type: ShadingType.CLEAR, color: 'auto', fill: AMARELO } }),
          new TextRun({ text: `  SENSO DE ${s.nome.toUpperCase()}`, bold: true, size: 19, color: AZUL, characterSpacing: 6 }),
          ...(s.japones ? [new TextRun({ text: `  ${s.japones}`, italics: true, bold: false, size: 16, color: CINZA })] : []),
          new TextRun({ text: `\t${s.pontosTxt}`, bold: true, size: 15, color: VERDE }),
        ],
      }));
      if (!s.itens.length) {
        corpo.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: s.aviso || 'Sem itens neste senso.', italics: true, size: 16, color: '7B8790' })] }));
        return;
      }
      corpo.push(tabela(colsChk, s.itens.map((i) => {
        const r = resultadoItem(i.pontos);
        return { cels: [{ t: i.codigo, negrito: true, cor: COR.AZUL }, i.pergunta, i.resposta || '—', { t: i.pontosTxt, negrito: true }, { t: r.t, selo: r }, i.obs || '—'] };
      }), 'Sem itens.'));
    });

    /* 5. Plano de ação */
    corpo.push(secao(5, 'Plano de ação'));
    corpo.push(tabela(
      [{ t: 'Nº', w: 9, al: 'center' }, { t: 'Não conformidade', w: 36 }, { t: 'Ação', w: 46 }, { t: 'Responsável', w: 28 }, { t: 'Previsto', w: 19, al: 'center' }, { t: 'Realizado', w: 19, al: 'center' }, { t: 'Status', w: 23, al: 'center' }],
      m.acoes.map((a) => ({ cels: [
        { t: a.numero, negrito: true, cor: COR.AZUL }, a.nc, a.obs ? `${a.acao || '—'}\nObs.: ${a.obs}` : a.acao,
        a.onde ? `${a.responsavel || '—'}\n${a.onde}` : a.responsavel, a.prazoPrevisto, a.prazoRealizado,
        { t: a.atrasada ? 'ATRASADA' : a.status.toUpperCase(), selo: statusAcao(a) },
      ] })), 'Nenhuma ação registrada.'));

    /* 6. Nota do prefeito */
    corpo.push(secao(6, 'Nota do prefeito'));
    const colsNota = (t) => [{ t, w: 108 }, { t: 'Peso', w: 24, al: 'center' }, { t: 'Nota', w: 24, al: 'center' }, { t: 'Ponderada', w: 24, al: 'center' }];
    corpo.push(tabela(colsNota('Nota comportamental / técnica'),
      [...m.comportamental.map((l) => ({ cels: [l.nome, `${l.peso}%`, l.notaTxt, l.ponderada] })), { total: true, cels: ['TOTAL COMPORTAMENTAL', '', '', m.compTotal] }], ''));
    corpo.push(vazio(120));
    corpo.push(tabela(colsNota('Avaliação integrada'),
      [...m.componentes.map((c) => ({ cels: [`${c.nome} (${c.detalhe})`, `${c.peso}%`, c.notaTxt, c.ponderado] })),
        { total: true, cels: [`NOTA GERAL${m.completa ? '' : ' (INCOMPLETA)'}`, '', '', m.geralParcialTxt] }], ''));

    const documento = montarDocx(D, { titulo: 'Relatório de Auditoria 10S', codigo: m.codigo, data: m.data, status: m.status, geradoEm: m.geradoEm,
      descricao: 'Relatório de auditoria 10S gerado pelo Sistema de Qualidade 10S' }, corpo, logo, abelha);
    const blob = await Packer.toBlob(documento);
    baixar(blob, `Relatorio-Auditoria-10S-${m.codigo}.docx`);
    return blob;
  }

  return { pdf, docx, pdfAuditoria, docxAuditoria, _carregarLib: carregarLib };
})();

window.RelatorioExport = RelatorioExport;
