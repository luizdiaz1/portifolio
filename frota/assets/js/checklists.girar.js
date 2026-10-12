/* FROTA EXEMPLO — Checklists: player com botão GIRAR
   Complemento independente: NÃO altera o checklists.module.js. Quando o modal do checklist abre o vídeo
   (<video controls> dentro de #ckModal), este arquivo troca o player nativo por um player com:
   ⟳ Girar (+90° a cada clique, tecla R) • play/pausa • barra de posição • velocidade • tela cheia.
   Carregue DEPOIS do checklists.module.js. A última rotação usada fica lembrada neste navegador. */
(function(){
  'use strict';
  const ROT_KEY = 'ck_video_rot';
  const $ = (s, r=document) => r.querySelector(s);
  const p2 = n => String(n).padStart(2,'0');
  const dur = s => { s = Number(s)||0; return p2(Math.floor(s/60))+':'+p2(s%60); };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  let ROT = 0;                                   // graus: 0 / 90 / 180 / 270
  try{ ROT = Number(localStorage.getItem(ROT_KEY)) || 0; }catch(e){}
  ROT = ((ROT % 360) + 360) % 360; if(ROT % 90) ROT = 0;
  let rotateNow = null;                          // atalho de teclado (R) aponta para o player aberto

  function injectCss(){
    if($('#ckPlayerCss')) return;
    const s = document.createElement('style'); s.id = 'ckPlayerCss';
    s.textContent = `
      #ckModal .modal-body > *{grid-column:1/-1}
      .ck-stage{position:relative;width:100%;height:min(62vh,560px);background:#000;border-radius:10px;overflow:hidden;user-select:none;-webkit-user-select:none}
      .ck-stage:fullscreen{height:100%;border-radius:0}
      .ck-stage:-webkit-full-screen{height:100%;border-radius:0}
      .ck-stage video{position:absolute;left:50%;top:50%;background:#000;object-fit:contain;transform-origin:center center;cursor:pointer}
      .ck-bar{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;padding:26px 10px 10px;background:linear-gradient(#0000,#000d)}
      .ck-bar button{border:1px solid rgba(255,255,255,.25);background:rgba(20,20,18,.8);color:#fff;border-radius:8px;padding:7px 11px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap}
      .ck-bar button:hover{border-color:rgba(255,180,0,.75)}
      .ck-bar .ck-rot{background:#ffb400;border-color:#ffb400;color:#111}
      .ck-seek{flex:1;min-width:60px;accent-color:#ffb400;cursor:pointer}
      .ck-time{font-variant-numeric:tabular-nums;font-size:13px;color:#fff;white-space:nowrap}`;
    document.head.appendChild(s);
  }

  function playerHtml(url){
    return `<div class="ck-stage" id="ckStage">
      <video playsinline preload="metadata" src="${esc(url)}"></video>
      <div class="ck-bar">
        <button type="button" class="ck-play" title="Reproduzir / pausar">▶</button>
        <input class="ck-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Posição do vídeo">
        <span class="ck-time">00:00 / 00:00</span>
        <button type="button" class="ck-speed" title="Velocidade">1×</button>
        <button type="button" class="ck-rot" title="Girar o vídeo 90° (tecla R)">⟳ Girar</button>
        <button type="button" class="ck-fs" title="Tela cheia">⛶</button>
      </div></div>`;
  }

  /* duração registrada no checklist (card "Duração" do modal): vídeos WebM gravados no celular
     podem não trazer a duração dentro do arquivo */
  function durationFromModal(){
    for(const c of document.querySelectorAll('#ckModal .stat-card')){
      const sp = c.querySelector('span'), st = c.querySelector('strong');
      if(sp && st && /dura/i.test(sp.textContent)){
        const m = st.textContent.match(/(\d+):(\d+)/); if(m) return (+m[1]) * 60 + (+m[2]);
      }
    }
    return 0;
  }

  function setupPlayer(box, fallbackSecs){
    const stage = $('.ck-stage', box), v = $('video', stage);
    const bPlay = $('.ck-play', stage), seek = $('.ck-seek', stage), tm = $('.ck-time', stage);
    const bSpeed = $('.ck-speed', stage), bRot = $('.ck-rot', stage), bFs = $('.ck-fs', stage);
    let seeking = false;
    const total = () => (isFinite(v.duration) && v.duration > 0) ? v.duration : fallbackSecs;

    function layout(){                            // com 90°/270° a largura e a altura do vídeo se trocam para caber no quadro
      const w = stage.clientWidth, h = stage.clientHeight, swap = ROT % 180 !== 0;
      v.style.width  = (swap ? h : w) + 'px';
      v.style.height = (swap ? w : h) + 'px';
      v.style.transform = 'translate(-50%,-50%) rotate(' + ROT + 'deg)';
    }
    function paintTime(){
      const t = total(), c = v.currentTime || 0;
      tm.textContent = dur(Math.floor(c)) + ' / ' + dur(Math.floor(t));
      if(!seeking) seek.value = t ? Math.min(1000, Math.round(c / t * 1000)) : 0;
    }
    function rotate(){
      ROT = (ROT + 90) % 360; layout();
      try{ localStorage.setItem(ROT_KEY, String(ROT)); }catch(e){}
    }
    function toggle(){ v.paused ? v.play().catch(() => {}) : v.pause(); }

    bPlay.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    v.addEventListener('play',  () => { bPlay.textContent = '⏸'; });
    v.addEventListener('pause', () => { bPlay.textContent = '▶'; });
    v.addEventListener('ended', () => { bPlay.textContent = '▶'; });
    v.addEventListener('timeupdate', paintTime);
    v.addEventListener('loadedmetadata', () => { paintTime(); layout(); });
    seek.addEventListener('input', () => { seeking = true; const t = total(); if(t) v.currentTime = seek.value / 1000 * t; paintTime(); });
    seek.addEventListener('change', () => { seeking = false; });
    const speeds = [1, 0.5, 2]; let si = 0;
    bSpeed.addEventListener('click', () => { si = (si + 1) % speeds.length; v.playbackRate = speeds[si]; bSpeed.textContent = speeds[si] + '×'; });
    bRot.addEventListener('click', rotate);
    rotateNow = rotate;

    const reqFs = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if(!reqFs) bFs.style.display = 'none';        // ex.: iPhone não permite tela cheia de um elemento
    else bFs.addEventListener('click', () => {
      if(document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else reqFs.call(stage);
    });

    if(typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(stage);
    window.addEventListener('resize', layout);
    layout(); paintTime();
  }

  function upgrade(){
    const v = $('#ckModal video[controls]'); if(!v) return;
    const src = v.getAttribute('src') || v.currentSrc; if(!src) return;
    const box = v.parentElement; if(!box) return;
    injectCss();
    box.innerHTML = playerHtml(src);              // remove o player nativo (que não gira)
    setupPlayer(box, durationFromModal());
  }

  new MutationObserver(upgrade).observe(document.body, {childList:true, subtree:true});

  document.addEventListener('keydown', e => {
    const t = e.target || {};
    const typing = /^(TEXTAREA|SELECT)$/.test(t.tagName || '') || (t.tagName === 'INPUT' && t.type !== 'range');
    if((e.key === 'r' || e.key === 'R') && rotateNow && $('#ckModal') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) rotateNow();
  });
})();
