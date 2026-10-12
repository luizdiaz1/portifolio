/* FROTA EXEMPLO — Operação → Checklists
   Consulta os vídeos enviados pelo app Checklist (celular). Usa o estado/cliente do app
   (window.FrotaStable) e as classes visuais já existentes. Vídeos em bucket privado:
   reprodução por URL assinada (somente usuário logado). */
(function(){
  'use strict';
  const BUCKET = 'checklists';
  const RESP = ['Carlos','Luiz','Rafael','Marcos','Bruno'];
  const F = {q:'', resp:'', de:'', ate:'', status:''};

  const app = () => window.FrotaStable;
  const st = () => app() && app().state;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const $ = (s, r=document) => r.querySelector(s);
  const p2 = n => String(n).padStart(2,'0');
  const dur = s => { s = Number(s)||0; return p2(Math.floor(s/60))+':'+p2(s%60); };
  const dt = r => new Date(r.hora_inicio || r.criado_em);
  const fData = r => { const d = dt(r); return p2(d.getDate())+'/'+p2(d.getMonth()+1)+'/'+d.getFullYear(); };
  const fHora = r => { const d = dt(r); return p2(d.getHours())+':'+p2(d.getMinutes()); };
  const norm = v => String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const rows = () => (st() && st().data && st().data.checklists) || [];

  function toastMsg(text){
    try{
      if(typeof window.toast === 'function') return window.toast(text);
      const el = $('#toast');
      if(el){ el.textContent = text; el.classList.add('show'); clearTimeout(toastMsg._t); toastMsg._t = setTimeout(()=>el.classList.remove('show'),2600); return; }
    }catch(e){}
    console.log('[Checklists]', text);
  }

  function filtered(){
    const q = norm(F.q);
    return rows().filter(r => {
      if(q && !norm(r.placa).includes(q)) return false;
      if(F.resp && r.responsavel !== F.resp) return false;
      if(F.status && (r.status_upload||'concluido') !== F.status) return false;
      const d = r.data || String(r.hora_inicio||'').slice(0,10);
      if(F.de && d < F.de) return false;
      if(F.ate && d > F.ate) return false;
      return true;
    });
  }

  function statsHtml(list){
    const hoje = new Date().toISOString().slice(0,10);
    const items = [['Checklists', list.length, 'no filtro atual'],
      ['Hoje', rows().filter(r => (r.data||'') === hoje).length, 'enviados hoje'],
      ['Placas', new Set(list.map(r => norm(r.placa))).size, 'com vídeo']];
    return `<div class="grid stats-grid">${items.map(([a,b,c]) => `<article class="stat-card"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></article>`).join('')}</div>`;
  }

  function tableHtml(list){
    if(!list.length) return `<div class="empty">Nenhum checklist encontrado.</div>`;
    return `<div class="table-card"><div class="table-wrap"><table class="data-table"><thead><tr>
      <th>Data</th><th>Horário</th><th>Placa</th><th>Responsável</th><th>Duração</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr>
        <td>${fData(r)}</td><td>${fHora(r)}</td><td><span class="plate">${esc(r.placa)}</span></td>
        <td>${esc(r.responsavel||'-')}</td><td>${dur(r.duracao_segundos)}</td>
        <td><span class="tag green">Concluído</span></td>
        <td><div class="row-actions">
          <button class="icon-btn js-ck-open" data-id="${esc(r.id)}" type="button" title="Assistir vídeo">▶</button>
          <button class="icon-btn js-ck-dl" data-id="${esc(r.id)}" type="button" title="Baixar vídeo" aria-label="Baixar vídeo">${ICON_DL}</button>
          <button class="icon-btn js-ck-edit" data-id="${esc(r.id)}" type="button" title="Editar data/responsável">✎</button>
          <button class="icon-btn danger js-ck-del" data-id="${esc(r.id)}" type="button" title="Excluir checklist">🗑</button>
        </div></td></tr>`).join('')}
      </tbody></table></div></div>`;
  }

  function refreshTable(){
    const list = filtered();
    const s = $('#ckStats'), t = $('#ckTable');
    if(s) s.innerHTML = statsHtml(list);
    if(t){ t.innerHTML = tableHtml(list);
      t.querySelectorAll('.js-ck-open').forEach(b => b.addEventListener('click', () => openModal(b.dataset.id)));
      t.querySelectorAll('.js-ck-dl').forEach(b => b.addEventListener('click', () => baixarIndividual(b.dataset.id, b)));
      t.querySelectorAll('.js-ck-edit').forEach(b => b.addEventListener('click', () => openEditModal(b.dataset.id)));
      t.querySelectorAll('.js-ck-del').forEach(b => b.addEventListener('click', () => excluirChecklist(b.dataset.id))); }
  }

  function render(){
    const s = st(); const root = $('#pageRoot'); if(!s || !root) return;
    const actions = $('#topbarActions');
    if(actions){ actions.innerHTML = '<button class="btn" id="ckRefresh" type="button">Atualizar dados</button>' +
        '<button class="btn" id="ckZipPer" type="button" title="Baixa em um ZIP, separado por placa, os vídeos do período escolhido">Baixar vídeos do período</button>' +
        '<button class="btn danger" id="ckDelPer" type="button" title="Exclui em lote os vídeos do período escolhido">Excluir vídeos do período</button>';
      $('#ckRefresh').addEventListener('click', () => app().loadAll({keepPage:true, manual:true}));
      $('#ckZipPer').addEventListener('click', baixarPeriodo);
      $('#ckDelPer').addEventListener('click', excluirPeriodo); }
    if(s.errors && s.errors.checklists){
      root.innerHTML = `<div class="empty">Não foi possível carregar os checklists. Atualize a página e tente novamente.</div>`;
      return;
    }
    root.innerHTML = `<div id="ckStats"></div>
      <div class="module-tools">
        <input class="search" id="ckQ" placeholder="Buscar placa..." value="${esc(F.q)}" />
        <select class="select" id="ckResp"><option value="">Todos os responsáveis</option>${RESP.map(n => `<option ${F.resp===n?'selected':''}>${n}</option>`).join('')}</select>
        <select class="select" id="ckStatus"><option value="">Todos os status</option><option value="concluido" ${F.status==='concluido'?'selected':''}>Concluído</option></select>
        <input class="select" type="date" id="ckDe" value="${esc(F.de)}" title="De" />
        <input class="select" type="date" id="ckAte" value="${esc(F.ate)}" title="Até" />
      </div><div id="ckTable"></div>`;
    $('#ckQ').addEventListener('input', e => { F.q = e.target.value; refreshTable(); });
    $('#ckResp').addEventListener('change', e => { F.resp = e.target.value; refreshTable(); });
    $('#ckStatus').addEventListener('change', e => { F.status = e.target.value; refreshTable(); });
    $('#ckDe').addEventListener('change', e => { F.de = e.target.value; refreshTable(); });
    $('#ckAte').addEventListener('change', e => { F.ate = e.target.value; refreshTable(); });
    refreshTable();
  }

  /* ---- detalhes + player (modal) ---- */
  function closeModal(){ const m = $('#ckModal'); if(m){ const v = m.querySelector('video'); if(v) v.pause(); m.remove(); } }

  async function openModal(id){
    const r = rows().find(x => String(x.id) === String(id)); if(!r) return;
    closeModal();
    const outros = rows().filter(x => norm(x.placa) === norm(r.placa) && x.id !== r.id).slice(0, 8);
    const m = document.createElement('div');
    m.id = 'ckModal'; m.className = 'modal-bg open';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="width:min(820px,100%)">
      <div class="modal-head"><div class="modal-head-title"><h3>Checklist — ${esc(r.placa)}</h3>
        <div class="modal-head-meta">${fData(r)} • ${fHora(r)}</div></div>
        <button class="icon-btn" id="ckClose" type="button" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div id="ckVideo" class="empty" style="min-height:220px;display:grid;place-items:center">Carregando vídeo…</div>
        <div class="grid stats-grid" style="margin-top:14px">
          ${[['Placa', r.placa],['Responsável', r.responsavel||'-'],['Data', fData(r)],['Horário', fHora(r)],['Duração', dur(r.duracao_segundos)],['Status','Concluído']]
            .map(([a,b]) => `<article class="stat-card"><span>${a}</span><strong style="font-size:18px">${esc(b)}</strong></article>`).join('')}
        </div>
        <div style="margin-top:14px"><button class="btn js-ck-dl-modal" data-id="${esc(r.id)}" type="button" style="display:inline-flex;align-items:center;gap:8px">${ICON_DL}<span>Baixar este vídeo</span></button></div>
        ${outros.length ? `<h4 style="margin:18px 0 8px">Outros checklists desta placa</h4>
          ${outros.map(o => `<button class="btn js-ck-hist" data-id="${esc(o.id)}" type="button" style="margin:0 6px 6px 0">${fData(o)} — ${fHora(o)}</button>`).join('')}` : ''}
      </div></div>`;
    document.body.appendChild(m);
    $('#ckClose').addEventListener('click', closeModal);
    m.addEventListener('click', e => { if(e.target === m) closeModal(); });
    m.querySelectorAll('.js-ck-hist').forEach(b => b.addEventListener('click', () => openModal(b.dataset.id)));
    m.querySelectorAll('.js-ck-dl-modal').forEach(b => b.addEventListener('click', () => baixarIndividual(b.dataset.id, b)));

    const box = $('#ckVideo');
    try{
      const res = await st().db.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600);
      if(res.error || !res.data) throw res.error || new Error('sem url');
      box.className = ''; box.style.cssText = '';
      box.innerHTML = `<video controls playsinline preload="metadata" style="width:100%;max-height:60vh;background:#000;border-radius:10px" src="${esc(res.data.signedUrl)}"></video>`;
    }catch(e){
      console.error('Checklists: URL assinada', e);
      box.textContent = 'Não foi possível carregar o vídeo. Verifique se você está logado e tente novamente.';
    }
  }

  /* ---- editar data / responsável ---- */
  function closeEditModal(){ const m = $('#ckEditModal'); if(m) m.remove(); }

  function combineDate(newDateStr, oldIso){
    const d = oldIso ? new Date(oldIso) : new Date();
    const [y,mo,da] = newDateStr.split('-').map(Number);
    if(y && mo && da) d.setFullYear(y, mo-1, da);
    return d.toISOString();
  }

  function openEditModal(id){
    const r = rows().find(x => String(x.id) === String(id)); if(!r) return;
    closeEditModal();
    const dataAtual = r.data || String(r.hora_inicio||r.criado_em||'').slice(0,10);
    const m = document.createElement('div');
    m.id = 'ckEditModal'; m.className = 'modal-bg open';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="width:min(420px,100%)">
      <div class="modal-head"><div class="modal-head-title"><h3>Editar checklist</h3>
        <div class="modal-head-meta">${esc(r.placa)}</div></div>
        <button class="icon-btn" id="ckEditClose" type="button" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div style="grid-column:1/-1;display:flex;flex-direction:column;gap:12px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field"><label>Data</label><input class="select" type="date" id="ckEditData" value="${esc(dataAtual)}"></div>
            <div class="field"><label>Responsável</label><select class="select" id="ckEditResp">
              ${RESP.map(n => `<option ${r.responsavel===n?'selected':''}>${esc(n)}</option>`).join('')}
            </select></div>
          </div>
          <button class="btn primary full" id="ckEditSave" type="button">Salvar</button>
          <button class="btn ghost full" id="ckEditCancel" type="button">Cancelar</button>
        </div>
      </div></div>`;
    document.body.appendChild(m);
    $('#ckEditClose').addEventListener('click', closeEditModal);
    $('#ckEditCancel').addEventListener('click', closeEditModal);
    m.addEventListener('click', e => { if(e.target === m) closeEditModal(); });
    $('#ckEditSave').addEventListener('click', () => salvarEdicao(r.id));
  }

  async function salvarEdicao(id){
    const r = rows().find(x => String(x.id) === String(id)); if(!r) return;
    const novaData = $('#ckEditData')?.value;
    const novoResp = $('#ckEditResp')?.value;
    if(!novaData) return toastMsg('Informe uma data válida.');
    const btn = $('#ckEditSave'); if(btn){ btn.disabled = true; btn.textContent = 'Salvando…'; }
    const payload = {
      data: novaData,
      responsavel: novoResp || r.responsavel,
      hora_inicio: combineDate(novaData, r.hora_inicio || r.criado_em)
    };
    try{
      const db = st().db;
      const { error } = await db.from('checklists').update(payload).eq('id', Number(id));
      if(error) throw error;
      Object.assign(r, payload);
      closeEditModal(); refreshTable();
      toastMsg('Checklist atualizado.');
    }catch(e){
      console.error('Checklists: editar', e);
      toastMsg('Não foi possível salvar as alterações.');
      if(btn){ btn.disabled = false; btn.textContent = 'Salvar'; }
    }
  }

  /* ---- excluir ---- */
  function tituloChecklist(r){ return [r.placa, r.responsavel, fData(r)].filter(Boolean).join(' • '); }

  async function registrarNaLixeira(r){
    try{
      const db = st().db;
      await db.from('lixeira_operacional').insert({
        modulo:'checklists', registro_id:Number(r.id), tabela_origem:'checklists',
        titulo:tituloChecklist(r), dados:r, deleted_at:new Date().toISOString(), restored_at:null
      });
    }catch(e){ console.warn('Checklists: lixeira indisponível', e); }
  }

  async function excluirChecklist(id){
    const r = rows().find(x => String(x.id) === String(id)); if(!r) return;
    if(!confirm(`Excluir o checklist de ${r.placa} (${fData(r)})? O vídeo enviado também será removido.`)) return;
    try{
      await registrarNaLixeira(r);
      const db = st().db;
      if(r.storage_path){
        try{ await db.storage.from(BUCKET).remove([r.storage_path]); }
        catch(e){ console.warn('Checklists: remoção do vídeo', e); }
      }
      const { error } = await db.from('checklists').delete().eq('id', Number(id));
      if(error) throw error;
      st().data.checklists = rows().filter(x => String(x.id) !== String(id));
      refreshTable();
      toastMsg('Checklist excluído.');
    }catch(e){
      console.error('Checklists: excluir', e);
      toastMsg('Não foi possível excluir o checklist.');
    }
  }

  /* ====================================================================
     LOTE — PERÍODO PERSONALIZADO (download em ZIP + exclusão em lote)
     Os dois recursos usam a MESMA janela {inicio, fim} (escolhida pelo
     usuário, validada por periodo()) e a MESMA busca (buscarJanela).
     ==================================================================== */
  const RETENCAO_DIAS = 7;                              // política recomendada: manter ~7 dias no Supabase
  const ZIP_LIMITE_BYTES = 700 * 1024 * 1024;           // acima disso o ZIP é dividido em partes (memória do navegador)
  const EXT_MIME = {'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-matroska':'mkv','video/3gpp':'3gp','video/x-msvideo':'avi'};
  const LOTE = {busy:false, cancel:false};
  const PER = {inicio:'', fim:''};                      // último período usado (mantido entre aberturas)
  const TZ_BR = 'America/Sao_Paulo';

  /* ---- período (data do Brasil) ---- */
  function dataBR(valor){
    const d = new Date(valor); if(isNaN(d)) return '';
    try{ return new Intl.DateTimeFormat('en-CA', {timeZone:TZ_BR, year:'numeric', month:'2-digit', day:'2-digit'}).format(d); }
    catch(e){ return new Date(d.getTime() - 3*3600*1000).toISOString().slice(0,10); }
  }
  function addDias(iso, n){
    const [y,m,d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m-1, d+n));
    return t.getUTCFullYear()+'-'+p2(t.getUTCMonth()+1)+'-'+p2(t.getUTCDate());
  }
  const hojeBR = () => dataBR(new Date());
  /* valida o período informado (datas inclusivas, AAAA-MM-DD) → {inicio, fim} ou {erro} */
  function periodo(de, ate){
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if(!re.test(de || '') || !re.test(ate || '')) return {erro:'Informe a data inicial e a data final.'};
    if(de > ate) return {erro:'A data inicial não pode ser posterior à data final.'};
    return {inicio:de, fim:ate};
  }
  const nomeZip = j => `Checklist_${fmtIso(j.inicio).replace(/\//g,'-')}_a_${fmtIso(j.fim).replace(/\//g,'-')}`;
  /* data do registro: mesma regra do módulo (r.data; senão hora_inicio/criado_em), convertida para a data do Brasil */
  const dataReg = r => r.data ? String(r.data).slice(0,10) : dataBR(r.hora_inicio || r.criado_em);
  const dentroJanela = (r, j) => { const d = dataReg(r); return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= j.inicio && d <= j.fim; };
  const fmtIso = iso => { const [y,m,d] = String(iso).split('-'); return d+'/'+m+'/'+y; };

  /* ---- busca única (fonte dos dois recursos): consulta própria e paginada, sem depender do limite do loadAll ---- */
  async function buscarJanela(j, dbParam){
    const db = dbParam || st().db, PAGE = 1000;
    // pré-filtro folgado (±1 dia, por causa do fuso) no servidor; o corte exato é feito abaixo por dentroJanela
    const a = addDias(j.inicio, -1), b = addDias(j.fim, 2);
    const orFilter = `and(data.gte.${a},data.lt.${b}),and(hora_inicio.gte.${a}T00:00:00Z,hora_inicio.lt.${b}T00:00:00Z),and(criado_em.gte.${a}T00:00:00Z,criado_em.lt.${b}T00:00:00Z)`;
    async function tudo(comFiltro){
      const out = [];
      for(let from = 0; ; from += PAGE){
        let q = db.from('checklists').select('*');
        if(comFiltro) q = q.or(orFilter);
        const res = await q.order('id', {ascending:true}).range(from, from + PAGE - 1);
        if(res.error) throw res.error;
        const part = res.data || [];
        out.push(...part);
        if(part.length < PAGE) break;
      }
      return out;
    }
    let todos;
    try{ todos = await tudo(true); }
    catch(e){ console.warn('Checklists: pré-filtro indisponível, buscando sem filtro', e); todos = await tudo(false); }
    return todos.filter(r => dentroJanela(r, j)).sort((a,b) =>
      dataReg(a).localeCompare(dataReg(b)) ||
      String(a.hora_inicio || a.criado_em || '').localeCompare(String(b.hora_inicio || b.criado_em || '')) ||
      Number(a.id) - Number(b.id));
  }

  /* ---- plano do ZIP: PLACA/DD-MM-AAAA[_NN].ext ---- */
  function extDe(r){
    for(const s of [r.storage_path, r.nome_arquivo]){
      const m = String(s || '').match(/\.([A-Za-z0-9]{2,5})$/);
      if(m) return m[1].toLowerCase();
    }
    return '';
  }
  function planoZip(lista){
    const cont = new Map();
    return lista.map(r => {
      const placa = norm(r.placa) || 'SEM_PLACA';
      const [y,m,d] = dataReg(r).split('-');
      const base = `${d}-${m}-${y}`;
      const k = placa + '|' + base, n = cont.get(k) || 0; cont.set(k, n + 1);
      return {r, placa, base: n ? `${base}_${p2(n)}` : base, ext: extDe(r)};
    });
  }

  /* ---- util ---- */
  async function pool(itens, n, fn){
    const res = new Array(itens.length); let i = 0;
    await Promise.all(Array.from({length: Math.min(n, itens.length)}, async () => {
      while(i < itens.length){ const k = i++; res[k] = await fn(itens[k], k); }
    }));
    return res;
  }
  const msgErro = e => (e && (e.message || e.error_description)) || String(e || 'erro desconhecido');
  const ehAdmin = () => { const u = st() && st().user; return !!u && u.perfil === 'admin'; };

  /* ---- motor do download (sem DOM; recebe dependências) ---- */
  async function baixarUm(db, it){
    let ultimo = '';
    for(let t = 0; t < 2; t++){                       // 1 nova tentativa
      try{
        const r = await db.storage.from(BUCKET).download(it.r.storage_path);
        if(r.error || !r.data) throw r.error || new Error('arquivo vazio');
        return {blob: r.data};
      }catch(e){ ultimo = 'não foi possível baixar este vídeo'; console.warn('Checklists: download', it.r.storage_path, e); }
    }
    return {erro: ultimo};
  }

  async function executarDownload(itens, deps){
    const {db, JSZipCtor, salvar} = deps;
    const onProgress = deps.onProgress || (() => {}), cancelado = deps.cancelado || (() => false);
    const conc = deps.concorrencia || 3, limite = deps.limiteBytes || ZIP_LIMITE_BYTES, ZIP_NOME = deps.nome || 'Checklist';
    const res = {partes:[], baixados:0, falhas:[], bytes:0, cancelado:false};
    let zip = new JSZipCtor(), nArq = 0, bytesParte = 0, nParte = 1, feitos = 0;

    async function fechar(ultima){
      if(!nArq) return;
      if(ultima && res.falhas.length){
        zip.file('LEIAME_falhas.txt', 'Vídeos que NÃO puderam ser baixados:\r\n\r\n' +
          res.falhas.map(f => `${f.r.placa} • ${fmtIso(dataReg(f.r))} • ${f.motivo}`).join('\r\n') + '\r\n');
      }
      const nome = (ultima && nParte === 1) ? `${ZIP_NOME}.zip` : `${ZIP_NOME}_parte_${p2(nParte)}.zip`;
      const blob = await zip.generateAsync({type:'blob', compression:'STORE', streamFiles:true},
        m => onProgress({fase:'zip', pct:m.percent, parte:nParte}));
      await salvar(blob, nome);
      res.partes.push(nome);
      zip = new JSZipCtor(); nArq = 0; bytesParte = 0; nParte++;
    }

    for(let i = 0; i < itens.length; i += conc){
      if(cancelado()){ res.cancelado = true; return res; }
      const lote = itens.slice(i, i + conc);
      const rs = await Promise.all(lote.map(it => baixarUm(db, it)));
      rs.forEach((x, k) => {
        const it = lote[k];
        if(x.erro){ res.falhas.push({r:it.r, motivo:x.erro}); }
        else{
          const ext = it.ext || EXT_MIME[String(x.blob.type || '').split(';')[0]] || 'mp4';
          zip.file(`${it.placa}/${it.base}.${ext}`, x.blob, {binary:true, compression:'STORE'});
          nArq++; bytesParte += x.blob.size || 0; res.bytes += x.blob.size || 0; res.baixados++;
        }
        feitos++;
      });
      onProgress({fase:'baixando', feitos, total:itens.length, falhas:res.falhas.length});
      if(bytesParte >= limite && i + conc < itens.length) await fechar(false);
    }
    await fechar(true);
    return res;
  }

  /* ---- motor da exclusão em lote (sem DOM) ----
     Ordem por bloco (consistência):
       1) copia na lixeira (se falhar, o bloco NÃO é tocado);
       2) remove os ARQUIVOS do Storage e CONFIRMA um a um (retorno de remove + checagem de existência);
       3) só apaga do banco os registros cujo arquivo foi confirmado como removido (e confere o que o banco devolveu);
       4) desfaz (best effort) as cópias da lixeira dos registros que NÃO foram excluídos do banco.
     Registros com falha continuam no sistema e podem ser tentados de novo. */
  async function arquivoAusente(db, path){
    const r = await db.storage.from(BUCKET).createSignedUrl(path, 10);
    if(r.data && r.data.signedUrl) return false;                  // ainda existe
    return /not.?found|does not exist|no such|404/i.test(msgErro(r.error));
  }

  async function executarExclusao(itens, deps){
    const {db, janela} = deps;
    const onProgress = deps.onProgress || (() => {});
    const CH = deps.bloco || 50;
    const rel = {excluidos:[], falhas:[], avisos:[]};
    const falha = (r, etapa, motivo) => rel.falhas.push({r, etapa, motivo});
    let feitos = 0;

    for(let i = 0; i < itens.length; i += CH){
      const bloco = itens.slice(i, i + CH).filter(r => {
        if(dentroJanela(r, janela)) return true;
        falha(r, 'ignorado', 'fora do período selecionado (ignorado por segurança)'); return false;
      });
      const inseridos = new Set();
      const desfazerLixeira = async ids => {
        const alvo = ids.filter(id => inseridos.has(id)); if(!alvo.length) return;
        try{
          const d = await db.from('lixeira_operacional').delete().eq('modulo','checklists').is('restored_at', null).in('registro_id', alvo);
          if(d.error) throw d.error;
        }catch(e){ rel.avisos.push('lixeira: ' + msgErro(e)); console.warn('Checklists: desfazer lixeira', e); }
      };

      if(bloco.length){
        /* 1) lixeira */
        let seguir = true;
        try{
          const ids = bloco.map(r => Number(r.id));
          const ex = await db.from('lixeira_operacional').select('registro_id').eq('modulo','checklists').is('restored_at', null).in('registro_id', ids);
          if(ex.error) throw ex.error;
          const jaTem = new Set((ex.data || []).map(x => Number(x.registro_id)));
          const novos = bloco.filter(r => !jaTem.has(Number(r.id)));
          if(novos.length){
            const agora = new Date().toISOString();
            const ins = await db.from('lixeira_operacional').insert(novos.map(r => ({
              modulo:'checklists', registro_id:Number(r.id), tabela_origem:'checklists',
              titulo:tituloChecklist(r), dados:r, deleted_at:agora, restored_at:null
            })));
            if(ins.error) throw ins.error;
            novos.forEach(r => inseridos.add(Number(r.id)));
          }
        }catch(e){
          seguir = false;
          bloco.forEach(r => falha(r, 'lixeira', 'não foi possível excluir agora (nada foi alterado)'));
        }

        if(seguir){
          /* 2) Storage */
          const comArq = bloco.filter(r => r.storage_path);
          const confirmados = new Set(), naoRemovidos = new Map();
          if(comArq.length){
            let removidos = new Set();
            try{
              const rm = await db.storage.from(BUCKET).remove(comArq.map(r => r.storage_path));
              if(rm.error) throw rm.error;
              removidos = new Set((rm.data || []).map(o => o && o.name));
            }catch(e){ rel.avisos.push('remove: ' + msgErro(e)); console.warn('Checklists: remover vídeos', e); }
            const duvida = comArq.filter(r => !removidos.has(r.storage_path));
            comArq.filter(r => removidos.has(r.storage_path)).forEach(r => confirmados.add(String(r.id)));
            await pool(duvida, 5, async r => {
              try{
                if(await arquivoAusente(db, r.storage_path)) confirmados.add(String(r.id));
                else naoRemovidos.set(String(r.id), 'não foi possível excluir o vídeo');
              }catch(e){ naoRemovidos.set(String(r.id), 'não foi possível excluir o vídeo'); console.warn('Checklists: conferir remoção', e); }
            });
          }
          const prontos = bloco.filter(r => !r.storage_path || confirmados.has(String(r.id)));
          bloco.filter(r => naoRemovidos.has(String(r.id)))
               .forEach(r => falha(r, 'storage', naoRemovidos.get(String(r.id)) + ' (nada foi alterado)'));

          /* 3) banco */
          const apagados = new Set();
          if(prontos.length){
            try{
              const del = await db.from('checklists').delete().in('id', prontos.map(r => Number(r.id))).select('id');
              if(del.error) throw del.error;
              (del.data || []).forEach(x => apagados.add(String(x.id)));
              prontos.forEach(r => {
                if(apagados.has(String(r.id))) rel.excluidos.push(r);
                else falha(r, 'banco', 'exclusão incompleta — repita a exclusão para concluir');
              });
            }catch(e){
              console.warn('Checklists: excluir registros', e);
              prontos.forEach(r => falha(r, 'banco', 'exclusão incompleta — repita a exclusão para concluir'));
            }
          }
          /* 4) lixeira só deve conter o que foi realmente excluído */
          await desfazerLixeira(bloco.filter(r => !apagados.has(String(r.id))).map(r => Number(r.id)));
        }
      }
      feitos += (itens.slice(i, i + CH)).length;
      onProgress({feitos, total:itens.length, excluidos:rel.excluidos.length, falhas:rel.falhas.length});
    }
    return rel;
  }

  /* ---- UI: painel (usa as classes de modal já existentes) ---- */
  function painel(titulo){
    const antigo = $('#ckLoteModal'); if(antigo) antigo.remove();
    const m = document.createElement('div');
    m.id = 'ckLoteModal'; m.className = 'modal-bg open';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="width:min(560px,100%)">
      <div class="modal-head"><div class="modal-head-title"><h3>${esc(titulo)}</h3></div>
        <button class="icon-btn" id="ckLoteX" type="button" aria-label="Fechar" style="display:none">×</button></div>
      <div class="modal-body"><div style="grid-column:1/-1;display:flex;flex-direction:column;gap:12px">
        <div id="ckLoteStatus"></div><div id="ckLoteFoot" style="display:flex;gap:10px;flex-wrap:wrap"></div>
      </div></div></div>`;
    document.body.appendChild(m);
    const api = {
      set(html){ const el = m.querySelector('#ckLoteStatus'); if(el) el.innerHTML = html; },
      rodape(html){ const el = m.querySelector('#ckLoteFoot'); if(el) el.innerHTML = html; },
      q(sel){ return m.querySelector(sel); },
      fechar(){ m.remove(); },
      concluir(){
        api.rodape('<button class="btn primary" id="ckLoteOk" type="button">Fechar</button>');
        api.q('#ckLoteOk').addEventListener('click', api.fechar);
        const x = api.q('#ckLoteX'); if(x){ x.style.display = ''; x.addEventListener('click', api.fechar); }
      }
    };
    return api;
  }
  const barraHtml = (pct, txt) => `<div style="height:10px;background:#121211;border:1px solid var(--line2);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Math.max(0, Math.min(100, pct))}%;background:var(--yellow)"></div></div><small style="display:block;margin-top:6px">${esc(txt)}</small>`;
  const mb = b => (b / 1048576).toFixed(b > 1073741824 ? 0 : 1) + ' MB';
  function listaFalhasHtml(falhas, max = 30){
    if(!falhas.length) return '';
    return `<div style="max-height:200px;overflow:auto;border:1px solid var(--line2);border-radius:8px;padding:10px;font-size:13px;line-height:1.5">` +
      falhas.slice(0, max).map(f => `<div>• <b>${esc(f.r.placa)}</b> ${esc(fmtIso(dataReg(f.r)))} — ${esc(f.motivo)}</div>`).join('') +
      (falhas.length > max ? `<div>… e mais ${falhas.length - max}.</div>` : '') + `</div>`;
  }
  function salvarBlob(blob, nome){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);     // arquivos grandes: não revogar logo
  }
  const resumoPlacas = lista => new Set(lista.map(r => norm(r.placa) || 'SEM_PLACA')).size;

  /* ícone de download (seta para a bandeja); usa a cor do botão */
  const ICON_DL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M12 3.5v11"/><path d="M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M4.5 15v4.5h15V15"/></svg>';
  /* ---- baixar um vídeo (individual): PLACA_DD-MM-AAAA_HHMM.ext ---- */
  function nomeIndividual(r){
    const [y,m,d] = (dataReg(r) || '').split('-');
    const dia = y ? `${d}-${m}-${y}` : 'sem-data';
    return `${norm(r.placa) || 'SEM_PLACA'}_${dia}_${fHora(r).replace(':','')}`;
  }
  async function baixarIndividual(id, btn){
    const r = rows().find(x => String(x.id) === String(id)); if(!r) return;
    if(!r.storage_path) return toastMsg('Este checklist não tem arquivo de vídeo vinculado.');
    if(!st() || !st().db) return toastMsg('Sistema ainda não carregou. Tente novamente.');
    if(btn){ if(btn.dataset.busy) return; btn.dataset.busy = '1'; btn.disabled = true; }
    const rotulo = btn ? btn.innerHTML : '';
    const txt = btn && btn.querySelector && btn.querySelector('span');
    if(txt) txt.textContent = 'Baixando…';
    toastMsg('Baixando vídeo…');
    try{
      const res = await st().db.storage.from(BUCKET).download(r.storage_path);
      if(res.error || !res.data) throw res.error || new Error('arquivo vazio');
      const ext = extDe(r) || EXT_MIME[String(res.data.type || '').split(';')[0]] || 'mp4';
      salvarBlob(res.data, `${nomeIndividual(r)}.${ext}`);
      toastMsg('Download iniciado.');
    }catch(e){
      console.error('Checklists: baixar vídeo', e);
      toastMsg('Não foi possível baixar o vídeo. Tente novamente.');
    }finally{
      if(btn){ delete btn.dataset.busy; btn.disabled = false; if(rotulo) btn.innerHTML = rotulo; }
    }
  }

  /* ---- UI: escolha do período (comum ao download e à exclusão) ----
     Mostra De/Até, conta os vídeos do período antes de liberar a ação e devolve
     {j, lista} com a lista CONGELADA (é exatamente ela que será baixada/excluída), ou null. */
  function escolherPeriodo(p, acao){
    const excluir = acao === 'excluir';
    const hoje = hojeBR();
    const ate0 = PER.fim || addDias(hoje, -RETENCAO_DIAS);
    const de0 = PER.inicio || addDias(ate0, -6);
    return new Promise(resolve => {
      p.set(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field"><label>Data inicial</label><input class="select" type="date" id="ckPerDe" value="${esc(de0)}" max="${esc(hoje)}" style="width:100%"></div>
          <div class="field"><label>Data final</label><input class="select" type="date" id="ckPerAte" value="${esc(ate0)}" max="${esc(hoje)}" style="width:100%"></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost" type="button" id="ckPerAntigos" title="Do vídeo mais antigo carregado até ${RETENCAO_DIAS} dias atrás">Anteriores a ${RETENCAO_DIAS} dias</button>
          <button class="btn ghost" type="button" id="ckPerUlt7">Últimos 7 dias</button>
        </div>
        <small>Recomendado: manter no sistema apenas os vídeos dos últimos ${RETENCAO_DIAS} dias — baixe os anteriores como backup e depois exclua-os.</small>
        <div id="ckPerInfo"></div>`);
      p.rodape(`<button class="btn ${excluir ? 'danger' : 'primary'}" id="ckPerGo" type="button" disabled>${excluir ? 'Continuar para exclusão' : 'Baixar vídeos do período'}</button><button class="btn ghost" id="ckPerNo" type="button">Cancelar</button>`);
      const de = p.q('#ckPerDe'), ate = p.q('#ckPerAte'), go = p.q('#ckPerGo'), info = p.q('#ckPerInfo');
      let seq = 0, atual = null, tmr = 0;

      async function verificar(){
        const n = ++seq; atual = null; go.disabled = true;
        const j = periodo(de.value, ate.value);
        if(j.erro){ info.innerHTML = `<div class="empty">${esc(j.erro)}</div>`; return; }
        info.innerHTML = barraHtml(0, 'Contando vídeos de ' + fmtIso(j.inicio) + ' a ' + fmtIso(j.fim) + '…');
        try{
          const lista = await buscarJanela(j);
          if(n !== seq) return;                                     // datas mudaram durante a busca
          const comArq = lista.filter(r => r.storage_path).length, semArq = lista.length - comArq;
          if(!lista.length || (!excluir && !comArq)){
            info.innerHTML = `<div class="empty">Nenhum vídeo encontrado de ${esc(fmtIso(j.inicio))} a ${esc(fmtIso(j.fim))}.</div>`; return;
          }
          info.innerHTML = `<div><b>${comArq} vídeo(s)</b> em ${resumoPlacas(lista)} placa(s) encontrado(s) de ${esc(fmtIso(j.inicio))} a ${esc(fmtIso(j.fim))}.` +
            (semArq ? `<br><small>${semArq} checklist(s) do período sem arquivo de vídeo vinculado${excluir ? ' (também serão excluídos)' : ''}.</small>` : '') + `</div>`;
          atual = {j, lista}; go.disabled = false;
        }catch(e){
          if(n !== seq) return;
          console.error('Checklists: contar período', e);
          info.innerHTML = `<div class="empty">Não foi possível consultar o período. Tente novamente.</div>`;
        }
      }
      const agendar = () => { clearTimeout(tmr); go.disabled = true; atual = null; tmr = setTimeout(verificar, 350); };
      de.addEventListener('change', agendar); ate.addEventListener('change', agendar);
      de.addEventListener('input', agendar); ate.addEventListener('input', agendar);
      p.q('#ckPerUlt7').addEventListener('click', () => { ate.value = hoje; de.value = addDias(hoje, -6); agendar(); });
      p.q('#ckPerAntigos').addEventListener('click', () => {
        const fim = addDias(hoje, -RETENCAO_DIAS);
        const datas = rows().map(dataReg).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= fim).sort();
        ate.value = fim; de.value = datas[0] || addDias(fim, -29); agendar();
      });
      go.addEventListener('click', () => {
        if(!atual || atual.j.inicio !== de.value || atual.j.fim !== ate.value) return;
        PER.inicio = atual.j.inicio; PER.fim = atual.j.fim; clearTimeout(tmr); resolve(atual);
      });
      p.q('#ckPerNo').addEventListener('click', () => { seq++; clearTimeout(tmr); resolve(null); });
      verificar();
    });
  }

  /* ---- UI: baixar vídeos do período ---- */
  async function baixarPeriodo(){
    if(LOTE.busy) return toastMsg('Já existe uma operação em lote em andamento.');
    if(!st() || !st().db) return toastMsg('Sistema ainda não carregou. Tente novamente.');
    if(typeof window.JSZip === 'undefined') return toastMsg('Não foi possível preparar o download. Atualize a página e tente novamente.');
    LOTE.busy = true; LOTE.cancel = false;
    const p = painel('Baixar vídeos do período');
    try{
      const sel = await escolherPeriodo(p, 'baixar');
      if(!sel){ p.fechar(); return; }
      const {j, lista} = sel;
      const itens = planoZip(lista.filter(r => r.storage_path));
      const semArq = lista.length - itens.length;
      p.rodape('<button class="btn danger" id="ckLoteCancel" type="button">Cancelar</button>');
      p.q('#ckLoteCancel').addEventListener('click', () => { LOTE.cancel = true; p.q('#ckLoteCancel').disabled = true; });
      p.set(barraHtml(0, itens.length + ' vídeo(s) em ' + resumoPlacas(lista) + ' placa(s) • ' + fmtIso(j.inicio) + ' a ' + fmtIso(j.fim) + '. Iniciando…'));

      const res = await executarDownload(itens, {
        db: st().db, JSZipCtor: window.JSZip, salvar: salvarBlob, cancelado: () => LOTE.cancel, nome: nomeZip(j),
        onProgress: o => {
          if(o.fase === 'baixando') p.set(barraHtml(o.feitos / o.total * 100, `Baixando ${o.feitos} de ${o.total}` + (o.falhas ? ` • ${o.falhas} falha(s)` : '')));
          else p.set(barraHtml(o.pct, 'Montando o ZIP' + (o.parte > 1 ? ' (parte ' + o.parte + ')' : '') + '… ' + Math.round(o.pct) + '%'));
        }
      });
      if(res.cancelado){
        p.set('<div class="empty">Operação cancelada. ' + (res.partes.length ? 'Partes já baixadas: ' + esc(res.partes.join(', ')) + '.' : 'Nenhum arquivo foi gerado.') + '</div>');
      }else if(!res.baixados){
        p.set('<div class="empty">Nenhum vídeo pôde ser baixado.</div>' + listaFalhasHtml(res.falhas));
      }else{
        p.set(`<div><b>${res.baixados} vídeo(s)</b> em ${resumoPlacas(lista)} placa(s) • ${esc(mb(res.bytes))}<br>` +
          `Período: ${esc(fmtIso(j.inicio))} a ${esc(fmtIso(j.fim))}<br>` +
          `Arquivo(s): ${esc(res.partes.join(', '))}` +
          (res.partes.length > 1 ? `<br><small>O ZIP foi dividido em partes para não sobrecarregar a memória do navegador. Se o navegador pedir, permita múltiplos downloads.</small>` : '') +
          (semArq ? `<br><small>${semArq} checklist(s) do período não têm arquivo vinculado.</small>` : '') + `</div>` +
          (res.falhas.length ? `<div><b>${res.falhas.length} vídeo(s) falharam</b> (a lista também vai dentro do ZIP):</div>` + listaFalhasHtml(res.falhas) : ''));
        toastMsg(res.falhas.length ? 'ZIP gerado com falhas. Veja os detalhes.' : 'ZIP gerado.');
      }
    }catch(e){
      console.error('Checklists: ZIP período', e);
      p.set('<div class="empty">Não foi possível gerar o ZIP. Tente novamente.</div>');
    }finally{
      LOTE.busy = false; p.concluir();
    }
  }

  /* ---- UI: excluir vídeos do período ---- */
  async function excluirPeriodo(){
    if(LOTE.busy) return toastMsg('Já existe uma operação em lote em andamento.');
    if(!ehAdmin()) return toastMsg('Perfil somente leitura.');
    if(!st() || !st().db) return toastMsg('Sistema ainda não carregou. Tente novamente.');
    LOTE.busy = true; LOTE.cancel = false;
    const p = painel('Excluir vídeos do período');
    try{
      const sel = await escolherPeriodo(p, 'excluir');
      if(!sel){ p.fechar(); return; }
      const {j, lista} = sel;                                  // lista CONGELADA: é exatamente isto que será excluído
      const comArq = lista.filter(r => r.storage_path).length;

      const decisao = await new Promise(resolve => {
        p.set(`<div style="line-height:1.55"><b>Excluir ${comArq} vídeo(s) do período?</b><br>
          Período selecionado: <b>${esc(fmtIso(j.inicio))} a ${esc(fmtIso(j.fim))}</b><br>
          Quantidade: <b>${comArq} vídeo(s)</b> em ${resumoPlacas(lista)} placa(s)` + (lista.length > comArq ? ` + ${lista.length - comArq} checklist(s) sem arquivo` : '') + `.<br><br>
          Os vídeos e os checklists deste período serão removidos do sistema. Os dados do checklist (sem o vídeo) ficam na Lixeira.<br>
          Vídeos fora deste período não serão afetados.<br><br>
          <b style="color:#ffd2cf">A exclusão é PERMANENTE: os vídeos excluídos não podem ser recuperados.</b><br>
          <small>Recomendado: baixe o ZIP do mesmo período antes.</small></div>
          <div class="field"><label>Para continuar, digite EXCLUIR</label><input class="select" id="ckLoteTxt" autocomplete="off" style="width:100%"></div>`);
        p.rodape('<button class="btn danger" id="ckLoteGo" type="button" disabled>Excluir definitivamente</button><button class="btn ghost" id="ckLoteNo" type="button">Cancelar</button>');
        const txt = p.q('#ckLoteTxt'), go = p.q('#ckLoteGo');
        txt.addEventListener('input', () => { go.disabled = txt.value.trim().toUpperCase() !== 'EXCLUIR'; });
        go.addEventListener('click', () => resolve(true));
        p.q('#ckLoteNo').addEventListener('click', () => resolve(false));
      });
      if(!decisao){ p.set('<div class="empty">Exclusão cancelada. Nada foi alterado.</div>'); return; }

      p.rodape('');
      p.set(barraHtml(0, 'Excluindo… não feche esta janela.'));
      const rel = await executarExclusao(lista, {
        db: st().db, janela: j,
        onProgress: o => p.set(barraHtml(o.feitos / o.total * 100, `Processando ${o.feitos} de ${o.total} • ${o.excluidos} excluído(s)` + (o.falhas ? ` • ${o.falhas} falha(s)` : '') + ' — não feche esta janela.'))
      });

      const ids = new Set(rel.excluidos.map(r => String(r.id)));
      if(ids.size){ st().data.checklists = rows().filter(x => !ids.has(String(x.id))); refreshTable(); }
      p.set(`<div><b>${rel.excluidos.length} de ${lista.length}</b> checklist(s) excluído(s) • ${esc(fmtIso(j.inicio))} a ${esc(fmtIso(j.fim))}.</div>` +
        (rel.falhas.length ? `<div style="color:#ffd2cf"><b>${rel.falhas.length} não foram excluídos</b>:</div>` + listaFalhasHtml(rel.falhas) +
          `<small>Os itens que falharam continuam no sistema. Tente excluir novamente.</small>` : ''));
      toastMsg(rel.falhas.length ? 'Exclusão concluída com falhas. Veja os detalhes.' : 'Checklists excluídos.');
    }catch(e){
      console.error('Checklists: excluir período', e);
      p.set('<div class="empty">Ocorreu um erro durante a operação.<br><small>Clique em “Atualizar dados” para conferir o estado atual.</small></div>');
    }finally{
      LOTE.busy = false; p.concluir();
    }
  }

  document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeModal(); closeEditModal(); } });
  window.ChecklistsFrota = {render, _lote:{periodo, nomeZip, dentroJanela, dataReg, buscarJanela, planoZip, extDe, nomeIndividual, baixarIndividual, executarDownload, executarExclusao}};
})();
