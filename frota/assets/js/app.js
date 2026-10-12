(function(){
  'use strict';

  const CFG = window.FROTA_CONFIG || {};
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clean = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const toNum = (v) => {
    if(v === null || v === undefined || v === '') return 0;
    if(typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v).trim();
    if(!s) return 0;
    s = s.replace(/R\$/gi,'').replace(/\s+/g,'');
    s = s.replace(/[^0-9,.-]/g,'');
    if(!s || s === '-' || s === '.' || s === ',') return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const hasComma = lastComma >= 0;
    const hasDot = lastDot >= 0;
    if(hasComma && hasDot){
      if(lastComma > lastDot) s = s.replace(/\./g,'').replace(',', '.');
      else s = s.replace(/,/g,'');
    }else if(hasComma){
      const parts = s.split(',');
      const last = parts[parts.length - 1] || '';
      if(parts.length > 2 || /^\d{3}$/.test(last)) s = parts.join('');
      else s = parts.slice(0,-1).join('') + '.' + last;
    }else if(hasDot){
      const parts = s.split('.');
      const last = parts[parts.length - 1] || '';
      if(parts.length > 2){
        if(/^\d{1,2}$/.test(last)) s = parts.slice(0,-1).join('') + '.' + last;
        else s = parts.join('');
      }else if(/^\d{3}$/.test(last) && /^-?\d{1,3}$/.test(parts[0] || '')){
        s = parts.join('');
      }
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const moneyValue = (v) => {
    const n = toNum(v);
    if(!Number.isFinite(n) || n < 0) return 0;
    return n > 1000000 ? 0 : n;
  };
  const brl = (v) => moneyValue(v).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
  const fmtDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) ? String(v).split('-').reverse().join('/') : '-';
  const fmtDateTime = (v) => {
    const d = new Date(v);
    if(!v || Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  };
  const ym = (v) => {
    const s = String(v ?? '').trim();
    if(/^\d{4}-\d{2}/.test(s)) return s.slice(0,7);
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if(br) return `${br[3]}-${br[2]}`;
    return '';
  };
  const nowIso = () => new Date().toISOString();
  const makeId = () => Date.now() + Math.floor(Math.random() * 1000);
  const monthLabel = (m) => {
    if(!/^\d{4}-\d{2}$/.test(String(m||''))) return 'Todos os meses';
    const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const [y,mm] = String(m).split('-');
    return `${nomes[Number(mm)-1] || mm} / ${y}`;
  };
  function normalizeCardText(text){
    let s = String(text ?? '').replace(/\r/g,'').trim();
    if(!s) return '';
    const dropPrefixes = [
      'tipo','tipo/peca','tipo/peça','origem','validade','validade da peca','validade da peça',
      'descricao','descrição','observacao','observação','pasta','data','responsavel','responsável','anexo'
    ];
    s = s.split('\n').map(line => line.trim()).filter(Boolean).filter(line => {
      const c = clean(line).replace(/\s+/g,' ');
      return !dropPrefixes.some(prefix => c.startsWith(prefix + ':'));
    }).join('\n').trim();
    return s;
  }


  const STATUS = {
    aguardando_aceite: 'Aguardando aceite',
    aguardando_assinatura: 'Aguardando assinatura',
    aceito: 'Aceito',
    pago: 'Pago',
    recorrendo: 'Recorrendo',
    recorrida: 'Recorrida',
    sem_necessidade: 'Sem necessidade',
    demitido: 'Motorista demitido',
    ativo: 'Ativo',
    inativo: 'Inativo',
    pendente: 'Pendente',
    concluido: 'Concluído',
    vencido: 'Vencido',
    em_analise: 'Em análise',
    aberto: 'Aberto',
    em_manutencao: 'Em manutenção',
    resolvido: 'Resolvido',
    aguardando_docs: 'Aguardando documentos',
    orcamento: 'Em orçamento',
    em_reparo: 'Em reparo',
    acionado_seguro: 'Seguro acionado',
    normal: 'Normal (sem desconto)',
    desconto20: 'Desconto de 20%',
    dobrado40: 'Valor Dobrado (-40%)',
    leve: 'Leve',
    medio: 'Médio',
    alta: 'Alta',
    urgente: 'Urgente'
  };

  const gravidadeClass = (v) => {
    const s = clean(v);
    if(s.includes('gravissima')) return 'red';
    if(s.includes('grave')) return 'red';
    if(s.includes('media') || s.includes('média')) return 'amber';
    if(s.includes('leve')) return 'green';
    return 'gray';
  };
  const statusClass = (v) => {
    const s = clean(v);
    if(s.includes('pago') || s.includes('concluido') || s.includes('aceito') || s === 'ativo' || s.includes('recorrida') || s.includes('resolvido')) return 'green';
    if(s === 'aberto') return 'red';
    if(s.includes('manutencao')) return 'amber';
    if(s.includes('venc') || s.includes('demit') || s.includes('inativo')) return 'red';
    if(s.includes('aguard') || s.includes('pend')) return 'amber';
    if(s.includes('recorrendo') || s.includes('analise') || s.includes('recurso')) return 'blue';
    return 'gray';
  };
  const CHAMADO_CATEGORIAS = {
    mecanica:'Mecânica', pneus:'Pneus', freios:'Freios', eletrica:'Elétrica',
    lataria:'Lataria / Avaria', documento:'Documento', outro:'Outro'
  };
  // 4 níveis de prioridade do chamado, definidos pelo motorista ao abrir
  // (ou ajustáveis aqui pela frota). Chave -> [rótulo, classe de cor do tag].
  const CHAMADO_PRIORIDADE = {
    leve: ['Leve', 'green'],
    medio: ['Médio', 'amber'],
    alta: ['Alta', 'orange'],
    urgente: ['Urgente', 'red']
  };
  const CHAMADO_PRIORIDADE_PIPELINE = [['leve','Leve'],['medio','Médio'],['alta','Alta'],['urgente','Urgente']];
  function chamadoPrioridadeTag(p){
    const info = CHAMADO_PRIORIDADE[clean(p)];
    return info ? tag(info[0], info[1]) : '';
  }
  function chamadosStats(rows){
    const abertos = rows.filter(r => clean(r.status||'aberto') === 'aberto').length;
    const analise = rows.filter(r => clean(r.status).includes('analise')).length;
    const manutencao = rows.filter(r => clean(r.status).includes('manutencao')).length;
    const resolvidos = rows.filter(r => clean(r.status).includes('resolvido')).length;
    return [
      ['Chamados', rows.length, 'recebidos ao todo'],
      ['Em aberto', abertos, 'aguardando análise'],
      ['Em andamento', analise + manutencao, 'em análise ou manutenção'],
      ['Resolvidos', resolvidos, 'concluídos']
    ];
  }
  function chamadosAbertosRows(){
    return (state.data.chamados || []).filter(r => clean(r.status||'aberto') !== 'resolvido');
  }
  const CHAMADO_PIPELINE = [['aberto','Aberto'],['em_analise','Em análise'],['em_manutencao','Em manutenção'],['resolvido','Resolvido']];
  function chamadosQuickFiltersHtml(){
    const q = state.filters.chamados.quick || '';
    const chips = [['','Todos'], ...CHAMADO_PIPELINE];
    return `<div class="quick-filters">${chips.map(([v,label]) => `<button type="button" class="quick-filter-chip ${q===v?'active':''}" data-quick="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
  }
  function renderChamados(){
    const key = 'chamados';
    const readOnly = isReadOnly();
    const rows = filterRows(key);
    const stats = chamadosStats(state.data.chamados || []);
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo registro</button>`}
    `);
    $('#pageRoot').innerHTML = `
      ${statsHtml(stats)}
      ${chamadosQuickFiltersHtml()}
      <div class="module-tools">
        <input class="search" id="moduleSearch" value="${esc(state.filters[key].search||'')}" placeholder="Buscar em chamados..." />
        <span class="results-counter">${rows.length} chamado${rows.length===1?'':'s'} exibido${rows.length===1?'':'s'}</span>
      </div>
      ${chamadoCardsHtml(rows)}
    `;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#moduleSearch')?.addEventListener('input', ev => {
      const pos = ev.target.selectionStart || ev.target.value.length;
      state.filters[key].search = ev.target.value;
      renderChamados();
      const input = $('#moduleSearch');
      if(input){ input.focus(); try{ input.setSelectionRange(pos,pos); }catch(e){} }
    });
    bindChamadoCardEvents();
  }
  function chamadoCardsHtml(rows){
    if(!rows.length) return `<div class="empty">Nenhum chamado encontrado com os filtros atuais.</div>`;
    return `<div class="multa-card-list">${rows.map(chamadoCardHtml).join('')}</div>`;
  }
  function chamadoCardHtml(r){
    const st = clean(r.status || 'aberto');
    const cls = statusClass(st || 'aberto');
    return `<article class="multa-card js-chamado-open" data-id="${esc(r.id)}" role="button" tabindex="0">
      <div class="multa-card-bar ${cls}" title="${esc(STATUS[st]||st)}"></div>
      <div class="multa-card-main">
        <div class="multa-card-row1">
          <span class="plate">${esc(r.placa || '-')}</span>
          <span class="multa-card-driver">${esc(r.motorista_nome || 'Motorista não informado')}</span>
          <span class="multa-card-auto">${esc(r.modelo || '')}</span>
          <div class="multa-card-badges">${tag(CHAMADO_CATEGORIAS[r.categoria]||r.categoria||'Outro','gray')}${chamadoPrioridadeTag(r.prioridade)}${r.foto_url?tag('📷 Com foto','blue'):''}</div>
        </div>
        <div class="multa-card-row2">${esc(normalizeCardText(r.descricao||'') || 'Sem descrição do problema.')}</div>
        <div class="multa-card-row3">
          <span class="tag ${cls}">${esc(STATUS[st]||st)}</span>
          <span class="tag gray">Recebido ${esc(fmtDateTime(r.created_at))}</span>
        </div>
      </div>
    </article>`;
  }
  // ===== Modal de detalhe do chamado (mesma experiência do módulo de Multas
  // deveria ter, agora com popup real em vez de acordeão inline) =====
  function chamadoModalHeadMetaHtml(r){
    const st = clean(r.status || 'aberto');
    return `<span class="tag ${statusClass(st)}">${esc(STATUS[st]||st)}</span>${chamadoPrioridadeTag(r.prioridade)}`;
  }
  function chamadoModalHeaderInfoHtml(r){
    const st = clean(r.status || 'aberto');
    const items = [
      ['Veículo', r.modelo || '-'],
      ['Placa', r.placa || '-'],
      ['Responsável', r.motorista_nome || 'Não informado'],
      ['Categoria', CHAMADO_CATEGORIAS[r.categoria] || r.categoria || 'Outro'],
      ['Aberto em', fmtDateTime(r.created_at)]
    ];
    if(st === 'resolvido' && r.updated_at) items.push(['Concluído em', fmtDateTime(r.updated_at)]);
    return `<div class="chamado-modal-header-grid">${items.map(([label,val]) => `<div class="clean-info"><span>${esc(label)}</span><b>${esc(val)}</b></div>`).join('')}</div>`;
  }
  function chamadoModalHistoricoHtml(r){
    const hist = Array.isArray(r.historico) ? r.historico : (typeof r.historico === 'string' ? (()=>{ try{ return JSON.parse(r.historico); }catch(e){ return []; } })() : []);
    if(!hist.length) return '';
    return `<details class="multa-detail-section multa-detail-wide">
      <summary>Histórico de alterações</summary>
      <div class="clean-info-grid">${hist.map(h => `<div class="clean-info"><span>${esc(fmtDateTime(h.criado_em || h.created_at))}</span><b>${esc(STATUS[h.status]||h.status||'')}${h.observacao?' — '+esc(h.observacao):''}</b></div>`).join('')}</div>
    </details>`;
  }
  function chamadoModalBodyHtml(r){
    const st = clean(r.status || 'aberto');
    return `${chamadoModalHeaderInfoHtml(r)}
    <div class="multa-detail-grid">
      <div class="multa-detail-section multa-detail-wide">
        <h4>Descrição completa</h4>
        <div class="clean-desc ${normalizeCardText(r.descricao||'') ? '' : 'empty-desc'}">${esc(normalizeCardText(r.descricao||'') || 'Sem descrição cadastrada.')}</div>
        ${r.foto_url ? `<div style="margin-top:10px"><a href="${esc(r.foto_url)}" target="_blank" rel="noopener"><img src="${esc(r.foto_url)}" alt="Foto do problema" style="max-width:100%;max-height:280px;border-radius:10px;border:1px solid var(--line2);display:block" /></a></div>` : ''}
      </div>
      <div class="multa-detail-section multa-detail-wide">
        <h4>Status e prioridade</h4>
        <div class="chamado-pipeline">${CHAMADO_PIPELINE.map(([id,label]) => `<button type="button" class="chamado-pipeline-btn ${statusClass(id)} ${st===id?'active':''}" data-id="${esc(r.id)}" data-status="${id}">${esc(label)}</button>`).join('')}</div>
        <div class="chamado-pipeline" style="margin-top:8px">${CHAMADO_PRIORIDADE_PIPELINE.map(([id,label]) => `<button type="button" class="chamado-pipeline-btn ${CHAMADO_PRIORIDADE[id][1]} ${clean(r.prioridade)===id?'active':''}" data-id="${esc(r.id)}" data-prioridade="${id}">${esc(label)}</button>`).join('')}</div>
      </div>
      <div class="multa-detail-section multa-detail-wide">
        <h4>Observação interna</h4>
        <div class="field wide" style="gap:8px"><textarea id="chamadoObs-${esc(r.id)}" placeholder="Observações da equipe de frota...">${esc(r.observacao_interna || '')}</textarea></div>
        <div class="report-actions"><button class="btn js-chamado-save-obs" data-id="${esc(r.id)}" type="button">Salvar observação</button></div>
      </div>
      <div class="multa-detail-section multa-detail-wide">
        <h4>Solução registrada</h4>
        <div class="field wide" style="gap:8px"><textarea id="chamadoSolucao-${esc(r.id)}" placeholder="O que foi feito para resolver...">${esc(r.solucao || '')}</textarea></div>
        <div id="chamadoSolFotoBox-${esc(r.id)}" style="margin-top:10px">${chamadoSolFotoPreviewHtml(r)}</div>
        <div class="report-actions">
          <label class="btn" style="cursor:pointer">📷 Anexar foto da solução<input type="file" accept="image/*" capture="environment" class="js-chamado-sol-foto-input" data-id="${esc(r.id)}" hidden /></label>
          <button class="btn js-chamado-save-solucao" data-id="${esc(r.id)}" type="button">Salvar solução</button>
        </div>
      </div>
      ${chamadoModalHistoricoHtml(r)}
    </div>`;
  }
  function chamadoModalFootHtml(r){
    const st = clean(r.status || 'aberto');
    const readOnly = isReadOnly();
    return `
      ${readOnly ? '' : `<button class="btn danger js-chamado-delete" data-id="${esc(r.id)}" type="button">Excluir</button>`}
      ${readOnly ? '' : `<button class="btn js-chamado-edit-full" data-id="${esc(r.id)}" type="button">Editar registro completo</button>`}
      ${!readOnly && st !== 'resolvido' ? `<button class="btn primary js-chamado-concluir" data-id="${esc(r.id)}" type="button">Concluir chamado</button>` : ''}
      <button class="btn" id="chamadoModalCloseBtn" type="button">Fechar</button>
    `;
  }
  function openChamadoModal(id){
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return;
    state.chamadoModalId = id;
    $('#chamadoModalTitle').textContent = `Chamado — ${row.placa || 'Sem placa'}`;
    $('#chamadoModalHeadMeta').innerHTML = chamadoModalHeadMetaHtml(row);
    $('#chamadoModalBody').innerHTML = chamadoModalBodyHtml(row);
    $('#chamadoModalFoot').innerHTML = chamadoModalFootHtml(row);
    bindChamadoModalEvents();
    const bg = $('#chamadoModalBg');
    bg.classList.add('open');
    bg.setAttribute('aria-hidden','false');
    requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add('is-visible')));
  }
  function closeChamadoModal(){
    const bg = $('#chamadoModalBg');
    if(!bg) return;
    bg.classList.remove('is-visible');
    bg.setAttribute('aria-hidden','true');
    state.chamadoModalId = null;
    setTimeout(() => { bg.classList.remove('open'); $('#chamadoModalBody').innerHTML=''; $('#chamadoModalFoot').innerHTML=''; }, 180);
  }
  function refreshChamadoModalIfOpen(id){
    if(String(state.chamadoModalId) !== String(id)) return;
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return closeChamadoModal();
    $('#chamadoModalHeadMeta').innerHTML = chamadoModalHeadMetaHtml(row);
    $('#chamadoModalBody').innerHTML = chamadoModalBodyHtml(row);
    $('#chamadoModalFoot').innerHTML = chamadoModalFootHtml(row);
    bindChamadoModalEvents();
  }
  function bindChamadoModalEvents(){
    $('#chamadoModalCloseBtn')?.addEventListener('click', closeChamadoModal);
    $$('#chamadoModalBody .chamado-pipeline-btn[data-status]').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); updateChamadoStatus(btn.dataset.id, btn.dataset.status); }));
    $$('#chamadoModalBody .chamado-pipeline-btn[data-prioridade]').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); updateChamadoPrioridade(btn.dataset.id, btn.dataset.prioridade); }));
    $('#chamadoModalBody .js-chamado-save-obs')?.addEventListener('click', (ev) => { ev.stopPropagation(); saveChamadoField(btn2id(ev), 'observacao_interna', $('#chamadoObs-'+btn2id(ev))?.value || ''); });
    $('#chamadoModalBody .js-chamado-save-solucao')?.addEventListener('click', (ev) => { ev.stopPropagation(); saveChamadoSolucao(btn2id(ev)); });
    $('#chamadoModalBody .js-chamado-sol-foto-input')?.addEventListener('change', (ev) => {
      const id = ev.target.dataset.id;
      const file = ev.target.files && ev.target.files[0];
      if(!file) return;
      chamadoPendingSolFotos[id] = file;
      const box = $('#chamadoSolFotoBox-'+id);
      if(box) box.innerHTML = chamadoSolFotoPreviewHtml({id, solucao_foto_url: (state.data.chamados||[]).find(r=>String(r.id)===String(id))?.solucao_foto_url});
      bindChamadoSolFotoRemove();
    });
    bindChamadoSolFotoRemove();
    $('#chamadoModalFoot .js-chamado-edit-full')?.addEventListener('click', (ev) => { const id = ev.target.dataset.id; closeChamadoModal(); openModal('chamados', id); });
    $('#chamadoModalFoot .js-chamado-delete')?.addEventListener('click', async (ev) => { const id = ev.target.dataset.id; await deleteRecord('chamados', id); closeChamadoModal(); });
    $('#chamadoModalFoot .js-chamado-concluir')?.addEventListener('click', (ev) => { updateChamadoStatus(ev.target.dataset.id, 'resolvido'); });
  }
  function btn2id(ev){ return ev.currentTarget.dataset.id || ev.target.dataset.id; }
  function chamadoSolFotoPreviewHtml(r){
    const pending = chamadoPendingSolFotos[r.id];
    if(pending) return `<div class="clean-info" style="display:inline-flex;gap:8px;align-items:center"><span>📎 ${esc(pending.name)}</span><button type="button" class="icon-btn js-chamado-sol-foto-remove" data-id="${esc(r.id)}" title="Remover">×</button></div>`;
    if(r.solucao_foto_url) return `<a href="${esc(r.solucao_foto_url)}" target="_blank" rel="noopener"><img src="${esc(r.solucao_foto_url)}" alt="Foto da solução" style="max-width:220px;max-height:180px;border-radius:10px;border:1px solid var(--line2);display:block" /></a>`;
    return '';
  }
  const CHAMADOS_BUCKET = 'chamados-fotos';
  /* caminho no bucket a partir da URL pública (…/object/public/chamados-fotos/<caminho>) */
  function chamadosPathFromUrl(url){
    const m = String(url || '').match(/\/object\/(?:public|sign)\/chamados-fotos\/([^?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  /* remoção física no Storage (best effort; nunca interrompe o fluxo de quem chamou) */
  async function removerArquivosStorage(bucket, paths){
    const lista = (paths || []).filter(Boolean);
    if(!lista.length) return {ok:true, removidos:[]};
    try{
      const db = connect(); if(!db) return {ok:false, removidos:[]};
      const rem = await db.storage.from(bucket).remove(lista);
      if(rem.error) throw rem.error;
      return {ok:true, removidos:(rem.data || []).map(o => o && o.name)};
    }catch(e){ console.warn('Storage: arquivo(s) não removido(s)', bucket, lista, e); return {ok:false, removidos:[]}; }
  }
  /* reduz fotos grandes antes do envio (máx. 1920px, JPEG 85%) — preserva detalhes para identificação de avarias.
     Mantém o original se não for imagem, se já for pequeno ou se a conversão falhar. */
  async function comprimirImagem(file, maxLado = 1920, qualidade = 0.85){
    try{
      if(!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || '') || file.size < 400 * 1024) return file;
      const bmp = await createImageBitmap(file);
      const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG transparente → fundo branco
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      if(bmp.close) bmp.close();
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', qualidade));
      if(!blob || blob.size >= file.size) return file;
      return new File([blob], String(file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', {type:'image/jpeg'});
    }catch(e){ console.warn('Compressão de imagem indisponível, enviando original', e); return file; }
  }
  const chamadoPendingSolFotos = {};
  function bindChamadoCardEvents(){
    $$('.quick-filter-chip').forEach(btn => btn.addEventListener('click', () => { state.filters.chamados.quick = btn.dataset.quick || ''; renderChamados(); }));
    $$('.js-chamado-open').forEach(card => {
      card.addEventListener('click', () => openChamadoModal(card.dataset.id));
      card.addEventListener('keydown', (ev) => { if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); openChamadoModal(card.dataset.id); } });
    });
  }
  function bindChamadoSolFotoRemove(){
    $$('.js-chamado-sol-foto-remove').forEach(btn => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.id;
      delete chamadoPendingSolFotos[id];
      const box = $('#chamadoSolFotoBox-'+id);
      const row = (state.data.chamados||[]).find(r=>String(r.id)===String(id));
      if(box) box.innerHTML = chamadoSolFotoPreviewHtml(row || {id});
    }));
  }
  async function saveChamadoSolucao(id){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return;
    const solucao = $('#chamadoSolucao-'+id)?.value || '';
    const btn = document.querySelector(`.js-chamado-save-solucao[data-id="${id}"]`);
    if(btn){ btn.disabled = true; btn.textContent = 'Salvando...'; }
    let novoPath = null;                                   // foto enviada nesta tentativa (desfeita se o salvamento falhar)
    const fotoAnterior = row.solucao_foto_url || null;
    try{
      let fotoUrl = fotoAnterior;
      const pendingFile = chamadoPendingSolFotos[id];
      if(pendingFile){
        const db = connect();
        if(!db) throw new Error('Sem conexão com o Supabase.');
        const arquivo = await comprimirImagem(pendingFile);
        const token = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const ext = arquivo !== pendingFile ? 'jpg' : ((pendingFile.name && pendingFile.name.split('.').pop()) || 'jpg');
        const path = `solucoes/${id}-${token}.${ext}`;
        const up = await db.storage.from(CHAMADOS_BUCKET).upload(path, arquivo, {upsert:false, contentType: arquivo.type || 'image/jpeg', cacheControl:'3600'});
        if(up.error) throw new Error('Falha ao enviar a foto para o Storage: ' + (up.error.message || up.error));
        novoPath = path;
        const pub = db.storage.from(CHAMADOS_BUCKET).getPublicUrl(path);
        fotoUrl = pub?.data?.publicUrl || fotoUrl;
      }
      const db2 = connect();
      if(!db2) throw new Error('Sem conexão com o Supabase.');
      const payload = {solucao, solucao_foto_url: fotoUrl, updated_at:new Date().toISOString()};
      let res = await db2.from('chamados').update(payload).eq('id', id).select().maybeSingle();
      if(res.error){
        const missing = missingColumn(res.error);
        if(missing === 'solucao_foto_url'){
          const res2 = await db2.from('chamados').update({solucao, updated_at:new Date().toISOString()}).eq('id', id).select().maybeSingle();
          if(res2.error) throw res2.error;
          upsertLocal('chamados', {...row, solucao});
          if(novoPath){ removerArquivosStorage(CHAMADOS_BUCKET, [novoPath]); novoPath = null; }
          renderChamados();
          refreshChamadoModalIfOpen(id);
          toast('⚠️ A observação foi salva, mas a FOTO não: falta rodar a migração SQL mais recente (coluna solucao_foto_url) no Supabase.');
          return;
        }
        throw res.error;
      }
      delete chamadoPendingSolFotos[id];
      // foto substituída: a anterior deixa de ser usada — remove do Storage para não acumular
      if(novoPath && fotoAnterior && fotoAnterior !== fotoUrl){
        const antigo = chamadosPathFromUrl(fotoAnterior);
        if(antigo) removerArquivosStorage(CHAMADOS_BUCKET, [antigo]);
      }
      novoPath = null;
      upsertLocal('chamados', {...row, solucao, solucao_foto_url: fotoUrl});
      toast(pendingFile ? 'Solução e foto salvas.' : 'Solução salva.');
      renderChamados();
      refreshChamadoModalIfOpen(id);
    }catch(e){
      console.error(e);
      if(novoPath) removerArquivosStorage(CHAMADOS_BUCKET, [novoPath]);   // não deixa foto órfã
      toast('Não foi possível salvar a solução agora: ' + (e?.message || e));
      if(btn){ btn.disabled = false; btn.textContent = 'Salvar solução'; }
    }
  }
  async function updateChamadoStatus(id, status){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return;
    upsertLocal('chamados', {...row, status});
    renderChamados();
    refreshChamadoModalIfOpen(id);
    try{
      await safeUpdate(byKey.chamados.table, {status, updated_at:new Date().toISOString()}, id);
      toast(`Status atualizado para "${STATUS[status]||status}".`);
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar o status agora.');
    }
  }
  async function updateChamadoPrioridade(id, prioridade){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return;
    upsertLocal('chamados', {...row, prioridade});
    renderChamados();
    refreshChamadoModalIfOpen(id);
    try{
      await safeUpdate(byKey.chamados.table, {prioridade, updated_at:new Date().toISOString()}, id);
      toast(`Prioridade atualizada para "${(CHAMADO_PRIORIDADE[prioridade]||[])[0] || prioridade}".`);
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar a prioridade agora.');
    }
  }
  async function saveChamadoField(id, field, value){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.chamados || []).find(r => String(r.id) === String(id));
    if(!row) return;
    upsertLocal('chamados', {...row, [field]: value});
    try{
      await safeUpdate(byKey.chamados.table, {[field]: value, updated_at:new Date().toISOString()}, id);
      toast(field === 'solucao' ? 'Solução salva.' : 'Observação salva.');
    }catch(e){
      console.error(e);
      toast('Não foi possível salvar agora.');
    }
  }

  // ===== QR Code por veículo (abre a página pública de chamados) =====
  function veiculoPlacaSlug(placa){ return String(placa || '').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function chamadoUrlForVeiculo(v){
    const base = (CFG.chamadosBaseUrl || window.location.origin).replace(/\/$/,'');
    return `${base}/chamado/${veiculoPlacaSlug(v?.placa)}`;
  }
  function qrFileName(v){ return `QR_Code_${veiculoPlacaSlug(v?.placa) || 'veiculo'}.png`; }
  async function drawVeiculoQr(canvas, v){
    if(!window.QRCode || !canvas) return false;
    try{
      await window.QRCode.toCanvas(canvas, chamadoUrlForVeiculo(v), {width:260, margin:1, color:{dark:'#10100f', light:'#ffffff'}});
      return true;
    }catch(e){ console.error('Falha ao gerar QR Code:', e); return false; }
  }
  function openVeiculoQrModal(id){
    const v = (state.data.veiculos || []).find(r => String(r.id) === String(id));
    if(!v){ toast('Veículo não encontrado.'); return; }
    if(!veiculoPlacaSlug(v.placa)){ toast('Cadastre a placa do veículo antes de gerar o QR Code.'); return; }
    state.modal = {key:'veiculos', custom:'qr', id, row:{...v}};
    $('#modalTitle').textContent = `QR Code — ${v.modelo || 'Veículo'}`;
    $('#modalForm').innerHTML = `
      <div class="qr-modal-box">
        <canvas id="veiculoQrCanvas" width="260" height="260"></canvas>
        ${plate(v.placa)}
        <small style="color:var(--muted);text-align:center;max-width:320px">Ao escanear, o motorista é direcionado direto para a abertura de um chamado deste veículo, sem login.</small>
        <div class="qr-modal-actions">
          <button class="btn" id="qrDownloadBtn" type="button">⬇️ Baixar QR Code (PNG)</button>
          <button class="btn primary" id="qrPrintBtn" type="button">🖨️ Imprimir etiqueta</button>
        </div>
      </div>`;
    const save = $('#modalSave'), cancel = $('#modalCancel');
    if(save) save.hidden = true;
    if(cancel) cancel.hidden = true;
    $('#modalBg').classList.add('open');
    $('#modalBg').setAttribute('aria-hidden','false');
    drawVeiculoQr($('#veiculoQrCanvas'), v);
    $('#qrDownloadBtn')?.addEventListener('click', () => downloadVeiculoQr(v));
    $('#qrPrintBtn')?.addEventListener('click', () => printVeiculoQrLabel(v));
  }
  function downloadVeiculoQr(v, canvasEl){
    const canvas = canvasEl || $('#veiculoQrCanvas');
    if(!canvas) return;
    const link = document.createElement('a');
    link.download = qrFileName(v);
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link); link.click(); link.remove();
  }
  async function printVeiculoQrLabel(v){
    let area = $('#qrPrintArea');
    if(!area){ area = document.createElement('div'); area.id = 'qrPrintArea'; document.body.appendChild(area); }
    area.innerHTML = `<div class="qr-label-print">
      <span class="qr-label-brand">FROTA EXEMPLO</span>
      <span class="qr-label-model">🚚 ${esc(v.modelo || 'Veículo')}</span>
      <span class="qr-label-plate">${plate(v.placa)}</span>
      <span class="qr-label-hint">Aponte a câmera e informe qualquer problema do veículo.</span>
      <canvas id="qrPrintCanvas" width="220" height="220"></canvas>
    </div>`;
    await drawVeiculoQr($('#qrPrintCanvas'), v);
    setTimeout(() => window.print(), 150);
  }
  const tag = (text, cls='gray') => `<span class="tag ${cls}">${esc(text || '-')}</span>`;
  const plate = (text) => text ? `<span class="plate">${esc(text)}</span>` : '-';
  function multaPrioridadeAtiva(r){
    const value = r?.prioridade ?? r?.prioritaria ?? r?.destaque;
    return value === true || value === 1 || String(value || '').toLowerCase() === 'true' || String(value || '').toLowerCase() === 'sim';
  }
  function multaPreviewHtml(r){
    const obs = normalizeCardText(r?.obs || r?.observacao || '');
    return obs ? `<div class="desc multa-observation-preview">${esc(obs)}</div>` : '-';
  }
  function normalizeAutoNumber(value){
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function normalizedPlateNumber(value){
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function pointsBySeverity(value){
    const severity = clean(value || '');
    if(severity.includes('gravissima')) return 7;
    if(severity.includes('grave')) return 5;
    if(severity.includes('media')) return 4;
    if(severity.includes('leve')) return 3;
    return 0;
  }
  function inferSeverityFromInfraction(value){
    const text = clean(value || '').replace(/\s+/g, ' ');
    if(!text) return '';
    if(text.includes('velocidade') && (text.includes('superior a 50') || text.includes('mais de 50'))) return 'Gravíssima';
    if(text.includes('velocidade') && (text.includes('20% a 50') || text.includes('entre 20') || text.includes('superior a 20'))) return 'Grave';
    if(text.includes('velocidade')) return 'Média';
    const gravissimas = ['alcool', 'álcool', 'bafometro', 'bafômetro', 'recusar teste', 'sinal vermelho', 'avancar o sinal', 'avançar o sinal', 'dirigir suspenso', 'sem habilitacao', 'sem habilitação', 'racha', 'disputar corrida', 'celular ao volante'];
    if(gravissimas.some(term => text.includes(clean(term)))) return 'Gravíssima';
    const graves = ['sem cinto', 'na contramao', 'na contramão', 'estacionar sobre faixa', 'nao dar preferencia', 'não dar preferência'];
    if(graves.some(term => text.includes(clean(term)))) return 'Grave';
    const medias = ['estacionar em desacordo', 'parar sobre faixa', 'falta de combustivel', 'falta de combustível'];
    if(medias.some(term => text.includes(clean(term)))) return 'Média';
    const leves = ['buzina', 'luz alta'];
    if(leves.some(term => text.includes(clean(term)))) return 'Leve';
    return '';
  }
  function multaPointDefaults(multa){
    const gravidade = multa?.gravidade || inferSeverityFromInfraction(multa?.infracao || multa?.descricao || multa?.obs || '');
    return {
      multa_id: multa?.id ?? null,
      motorista: multa?.motorista || multa?.real_infrator || multa?.condutor || '',
      data: String(multa?.data || multa?.data_multa || '').slice(0,10),
      placa: multa?.placa || multa?.carro || '',
      auto: multa?.auto || '',
      gravidade,
      pontos: pointsBySeverity(gravidade),
      motivo: multa?.infracao || multa?.descricao || multa?.obs || ''
    };
  }
  function dateOnlyValue(value){
    const raw = String(value || '').trim();
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if(match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return null;
  }
  function isDateWithinLastDays(value, days=45){
    const date = dateOnlyValue(value);
    if(!date || Number.isNaN(date.getTime())) return false;
    date.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.floor((today - date) / 86400000);
    return diff >= 0 && diff <= days;
  }
  function normalizedDriverName(value){
    return clean(value || '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function pointsInLastDays(days=45){
    return (state.data.pontos || []).filter(point => isDateWithinLastDays(point.data || point.created_at, days));
  }
  function pointsLastDaysForDriver(driver, days=45){
    const driverId = String(driver?.id || '');
    const driverName = normalizedDriverName(driver?.nome || '');
    return pointsInLastDays(days).reduce((total, point) => {
      const sameId = driverId && point?.motorista_id != null && String(point.motorista_id) === driverId;
      const sameName = driverName && normalizedDriverName(point?.motorista || point?.condutor || '') === driverName;
      return total + ((sameId || sameName) ? toNum(point.pontos) : 0);
    }, 0);
  }
  function totalPointsInLastDays(days=45){
    return pointsInLastDays(days).reduce((total, point) => total + toNum(point.pontos), 0);
  }

  function linkedPointForFine(multaId, exceptPointId=null){
    if(multaId === null || multaId === undefined || multaId === '') return null;
    return (state.data.pontos || []).find(p => String(p.multa_id || '') === String(multaId) && String(p.id || '') !== String(exceptPointId || '')) || null;
  }
  function availableFinesForPoints(currentPoint){
    const currentId = currentPoint?.id ?? null;
    const currentFineId = currentPoint?.multa_id ?? null;
    return (state.data.multas || []).filter(multa => {
      if(String(multa.id || '') === String(currentFineId || '')) return true;
      return !linkedPointForFine(multa.id, currentId);
    }).sort((a,b) => String(b.data || '').localeCompare(String(a.data || '')) || Number(b.id || 0) - Number(a.id || 0));
  }
  function oilPriority(r){
    const s = oilSituation(r);
    return {key:s.key, label:s.label};
  }
  // Situação da troca de óleo é sempre calculada automaticamente a partir da
  // data da última troca; nunca depende de um campo editado manualmente.
  function oilSituationValue(r){
    const cls = oilStatus(r).cls;
    if(cls === 'red') return 'vencido';
    if(cls === 'amber') return 'verificar';
    if(cls === 'green') return 'ativo';
    return 'ativo';
  }
  function oilSituation(r){
    const key = oilSituationValue(r);
    const labels = {ativo:'Ativo', verificar:'Verificar', vencido:'Vencido'};
    const classes = {ativo:'green', verificar:'amber', vencido:'red'};
    return {key, label:labels[key] || key, cls:classes[key] || 'gray'};
  }
  function prazoTag(label, date){
    const raw = String(date || '').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `<span class="deadline muted"><b>${esc(label)}</b><small>Sem prazo</small></span>`;
    const d = daysUntil(raw);
    let cls = 'ok', text = `Vence em ${d} dias`;
    if(d < 0){ cls = 'danger'; text = `Vencido há ${Math.abs(d)} dias`; }
    else if(d === 0){ cls = 'danger'; text = 'Vence hoje'; }
    else if(d <= 7){ cls = 'danger'; }
    else if(d <= 30){ cls = 'warn'; }
    return `<span class="deadline ${cls}"><b>${esc(label)}</b><small>${esc(fmtDate(raw))} • ${esc(text)}</small></span>`;
  }
  function dataInfoTag(label, date, emptyText='Sem data'){
    const value = String(date || '').trim();
    const raw = value.slice(0,10);
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `<span class="deadline info"><b>${esc(label)}</b><small>${esc(fmtDate(raw))}</small></span>`;
    if(value) return `<span class="deadline info"><b>${esc(label)}</b><small>${esc(value)}</small></span>`;
    return `<span class="deadline muted"><b>${esc(label)}</b><small>${esc(emptyText)}</small></span>`;
  }
  function multasDeadlineHtml(r){
    return `<div class="deadline-stack">${prazoTag('Real infrator', r.prazo_aceite || r.prazo || r.prazo_real_infrator)}${dataInfoTag('Envio RCA', r.envio_rca || r.data_envio_rca, 'Sem envio')}${prazoTag('Recorrer', r.prazo_recurso || r.prazo_recorrer || r.prazo_recurso_multa)}</div>`;
  }
  function prazoRecursoCriticoRows(rows){
    return (rows || []).filter(r => {
      if(String(r.status || '').toLowerCase() === 'recorrida') return false;
      const raw = String(r.prazo_recurso || r.prazo_recorrer || r.prazo_recurso_multa || '').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
      return daysUntil(raw) <= 30;
    });
  }

  /* ---------- Painel moderno de Multas: situação, prazo relevante e filtros rápidos ---------- */
  // Não altera nenhuma regra de negócio já existente (status, gravidade, valor, prioridade
  // continuam vindos exatamente dos mesmos campos) — apenas deriva como exibir isso.
  function multaPrazoRelevante(r){
    return String(r?.prazo_recurso || r?.prazo_aceite || '').slice(0,10);
  }
  function multaSituacao(r){
    const s = clean(r?.status || '');
    if(s === 'pago') return {cls:'green', label:'Paga'};
    if(s === 'recorrida' || s === 'sem_necessidade') return {cls:'green', label:'Resolvida'};
    if(s === 'demitido') return {cls:'gray', label:'Arquivada'};
    if(s === 'recorrendo') return {cls:'blue', label:'Em recurso'};
    const prazo = multaPrazoRelevante(r);
    if(/^\d{4}-\d{2}-\d{2}$/.test(prazo)){
      const d = daysUntil(prazo);
      if(d < 0) return {cls:'red', label:'Vencida'};
      if(d <= 7) return {cls:'amber', label:'Próxima do vencimento'};
    }
    return {cls:'gray', label:STATUS[r?.status] || r?.status || 'Pendente'};
  }
  function multaQuickFilterMatches(r, quick){
    if(!quick) return true;
    const s = clean(r?.status || '');
    const prazo = multaPrazoRelevante(r);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? daysUntil(prazo) : null;
    if(quick === 'vencidas') return d !== null && d < 0 && s !== 'pago' && s !== 'recorrida' && s !== 'sem_necessidade';
    if(quick === 'vence7') return d !== null && d >= 0 && d <= 7 && s !== 'pago' && s !== 'recorrida' && s !== 'sem_necessidade';
    if(quick === 'pagas') return s === 'pago';
    if(quick === 'recurso') return s === 'recorrendo';
    if(quick === 'favoritas') return multaPrioridadeAtiva(r);
    if(quick === 'grave') return clean(r?.gravidade) === 'grave';
    if(quick === 'media') return clean(r?.gravidade) === 'media';
    if(quick === 'leve') return clean(r?.gravidade) === 'leve';
    return true;
  }
  function multasResumoStats(rows){
    const pendentes = pendingRows('multas', rows);
    const vencidas = pendentes.filter(r => { const p = multaPrazoRelevante(r); return /^\d{4}-\d{2}-\d{2}$/.test(p) && daysUntil(p) < 0; });
    const aVencer = pendentes.filter(r => { const p = multaPrazoRelevante(r); return /^\d{4}-\d{2}-\d{2}$/.test(p) && daysUntil(p) >= 0; });
    return [
      ['Total de multas', rows.length, 'registradas'],
      ['Valor total', brl(sumMoney('multas', rows)), 'somado'],
      ['A vencer', aVencer.length, 'com prazo em aberto'],
      ['Vencidas', vencidas.length, 'atenção imediata'],
      ['Pagas', rows.filter(r=>clean(r.status)==='pago').length, 'quitadas'],
      ['Em recurso', rows.filter(r=>clean(r.status)==='recorrendo').length, 'processo em andamento']
    ];
  }
  function multaBadgesHtml(r){
    const badges = [];
    if(r.gravidade) badges.push(tag(String(r.gravidade).toUpperCase(), gravidadeClass(r.gravidade)));
    const tipo = tipoPagamentoValue(r);
    if(tipo === 'dobrado40') badges.push(tag('VALOR DOBRADO','amber'));
    if(tipo === 'desconto20') badges.push(tag('DESCONTO 20%','blue'));
    if(clean(r.status) === 'pago') badges.push(tag('PAGA','green'));
    if(clean(r.status) === 'recorrendo') badges.push(tag('RECURSO','blue'));
    if(r.envio_rca) badges.push(tag('RCA','gray'));
    if(multaPrioridadeAtiva(r)) badges.push(tag('★ FAVORITA','yellow'));
    return badges.join('');
  }
  function multaCardHtml(r){
    const situacao = multaSituacao(r);
    const prazo = multaPrazoRelevante(r);
    const prazoLabel = String(r?.prazo_recurso) === prazo && r?.prazo_recurso ? 'Recorrer' : 'Real infrator';
    const favAtivo = multaPrioridadeAtiva(r);
    return `<article class="multa-card" data-id="${esc(r.id)}">
      <div class="multa-card-bar ${situacao.cls}" title="${esc(situacao.label)}"></div>
      <button type="button" class="multa-card-main js-multa-toggle" data-id="${esc(r.id)}">
        <div class="multa-card-row1">
          <span class="plate">${esc(r.placa || r.carro || '-')}</span>
          <span class="multa-card-driver">${esc(r.motorista || 'Motorista não vinculado')}</span>
          <span class="multa-card-auto">${r.auto ? `Auto ${esc(r.auto)}` : ''}</span>
          <div class="multa-card-badges">${multaBadgesHtml(r)}</div>
        </div>
        <div class="multa-card-row2">${esc(normalizeCardText(r.infracao || r.obs || '') || 'Sem descrição da infração cadastrada.')}</div>
        <div class="multa-card-row3">
          <span class="money multa-card-value">${brlKey('multas', r)}</span>
          ${prazoTag(prazoLabel, prazo)}
          <span class="tag ${situacao.cls}">${esc(situacao.label)}</span>
        </div>
      </button>
      <div class="multa-card-actions">
        ${isReadOnly() ? '' : `<button class="icon-btn js-fav ${favAtivo?'active':''}" data-id="${esc(r.id)}" type="button" title="${favAtivo?'Remover prioridade':'Favoritar'}">${favAtivo?'★':'☆'}</button>`}
        <button class="icon-btn js-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>
        <button class="icon-btn js-gerar-doc" data-id="${esc(r.id)}" type="button" title="Gerar Documentos (Comunicação de Multa + E-mail)">📄</button>
        ${isReadOnly()?'':`<button class="icon-btn danger js-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}
      </div>
      <div class="multa-card-detail" id="multaDetail-${esc(r.id)}" hidden>
        ${multaCardDetailHtml(r)}
      </div>
    </article>`;
  }
  function multaCardDetailHtml(r){
    const linhas = multaValorLinhas(r);
    return `<div class="multa-detail-grid">
      <div class="multa-detail-section">
        <h4>Datas e prazos</h4>
        ${multasDeadlineHtml(r)}
      </div>
      <div class="multa-detail-section multa-detail-wide">
        <h4>Dados da infração</h4>
        <div class="clean-info-grid">
          <div class="clean-info"><span>Data</span><b>${esc(fmtDate(r.data) || '-')}</b></div>
          <div class="clean-info"><span>Hora</span><b>${esc(r.hora || '-')}</b></div>
          <div class="clean-info"><span>Órgão</span><b>${esc(r.orgao || '-')}</b></div>
          <div class="clean-info"><span>Município</span><b>${esc(r.municipio || '-')}</b></div>
          <div class="clean-info"><span>Local</span><b>${esc(r.local || '-')}</b></div>
          <div class="clean-info"><span>Código</span><b>${esc(r.codigo_infracao || '-')}</b></div>
        </div>
      </div>
      <div class="multa-detail-section">
        <h4>Valor</h4>
        <div class="multa-valor-breakdown">${linhas.map(l => `<div class="multa-valor-line"><span>${esc(l[0])}</span><b>${esc(l[1])}</b></div>`).join('')}</div>
      </div>
      <div class="multa-detail-section">
        <h4>Observação</h4>
        <div class="clean-desc ${normalizeCardText(r.obs||'') ? '' : 'empty-desc'}">${esc(normalizeCardText(r.obs||'') || 'Sem observação cadastrada.')}</div>
      </div>
      <div class="multa-detail-section">
        <h4>Anexos</h4>
        <div class="clean-empty" style="padding:14px;min-height:auto">Nenhum anexo vinculado a este registro.</div>
      </div>
    </div>`;
  }
  function multasQuickFiltersHtml(key){
    const q = state.filters[key].quick || '';
    const chips = [
      ['', 'Todas'], ['vencidas','Vencidas'], ['vence7','Vence em 7 dias'], ['pagas','Pagas'],
      ['recurso','Em Recurso'], ['favoritas','Favoritas'], ['grave','Grave'], ['media','Média'], ['leve','Leve']
    ];
    return `<div class="quick-filters">${chips.map(([v,label]) => `<button type="button" class="quick-filter-chip ${q===v?'active':''}" data-quick="${esc(v)}">${esc(label)}</button>`).join('')}</div>`;
  }
  function multasCardsHtml(rows){
    if(!rows.length) return `<div class="empty">Nenhuma multa encontrada com os filtros atuais.</div>`;
    return `<div class="multa-card-list">${rows.map(multaCardHtml).join('')}</div>`;
  }
  function bindMultasCardEvents(key, renderFn){
    $$('.quick-filter-chip').forEach(btn => btn.addEventListener('click', () => { state.filters[key].quick = btn.dataset.quick || ''; renderFn(); }));
    $$('.js-multa-toggle').forEach(btn => btn.addEventListener('click', (ev) => {
      const id = btn.dataset.id;
      const detail = $('#multaDetail-'+id);
      if(!detail) return;
      const card = btn.closest('.multa-card');
      const isOpen = !detail.hidden;
      $$('.multa-card-detail').forEach(d => { d.hidden = true; });
      $$('.multa-card').forEach(c => c.classList.remove('expanded'));
      if(!isOpen){ detail.hidden = false; card?.classList.add('expanded'); }
    }));
    $$('.js-fav').forEach(btn => btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleMultaPrioridade(btn.dataset.id);
    }));
  }
  async function toggleMultaPrioridade(id){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.multas || []).find(r => String(r.id) === String(id));
    if(!row) return;
    const novoValor = !multaPrioridadeAtiva(row);
    upsertLocal('multas', {...row, prioridade: novoValor});
    renderCurrentPage();
    try{
      await safeUpdate(byKey.multas.table, {prioridade: novoValor}, id);
      toast(novoValor ? 'Multa marcada como prioridade.' : 'Prioridade removida.');
    }catch(e){
      console.error(e);
      toast('Não foi possível atualizar a prioridade no Supabase.');
    }
  }

  const MODULES = [
    {key:'dashboard', icon:'📊', title:'Dashboard', subtitle:'Resumo geral da frota e dos controles operacionais'},
    {
      key:'multas', table:'multas', icon:'⚠️', title:'Multas', subtitle:'Controle de infrações e prazos', dateField:'data', monthFilter:true, monthFilterSelect:true, softDelete:true, order:'id', ascending:false,
      fields:[
        ['placa','Placa','text'], ['motorista','Motorista','text'], ['auto','Auto','text'], ['orgao','Órgão','text'],
        ['data','Data da multa','date'], ['hora','Hora','text'], ['municipio','Município','text'], ['local','Local','text'],
        ['infracao','Infração','textarea','wide'], ['gravidade','Gravidade','select:Leve,Média,Grave,Gravíssima'],
        ['valor','Valor','number'], ['tipo_pagamento','Tipo de Pagamento','select:normal,desconto20,dobrado40'],
        ['status','Status','select:pendente,aguardando_aceite,aguardando_assinatura,aceito,pago,recorrendo,recorrida,sem_necessidade,demitido'],
        ['prioridade','Destacar esta multa como prioridade','checkbox','wide'],
        ['prazo_aceite','Prazo real infrator','date','wide'],
        ['envio_rca','Data de envio para o RCA','date','wide'],
        ['prazo_recurso','Prazo para recorrer','date','wide'],
        ['obs','Observação','textarea','wide']
      ],
      columns:[
        ['data','Data', r=>fmtDate(r.data)], ['placa','Placa', r=>plate(r.placa || r.carro)], ['motorista','Motorista'], ['auto','Auto'],
        ['obs','Observação', r=>multaPreviewHtml(r)],
        ['gravidade','Gravidade', r=>tag(r.gravidade, gravidadeClass(r.gravidade))], ['valor','Valor', r=>`<span class="money">${brlKey('multas', r)}</span>${tipoPagamentoValue(r)==='dobrado40' ? ' ' + tag('dobrado -40%','amber') : tipoPagamentoValue(r)==='desconto20' ? ' ' + tag('desconto 20%','blue') : ''}`],
        ['status','Status', r=>tag(STATUS[r.status] || r.status || '-', statusClass(r.status))]
      ],
      stats: rows => multasResumoStats(rows)
    },
    {
      key:'pontos', table:'pontos', icon:'🪪', title:'Pontos', subtitle:'Pontuação consolidada por motorista', dateField:'data', softDelete:true, order:'data', ascending:false,
      fields:[
        ['multa_id','Selecionar multa','multa-select','wide'],
        ['motorista','Motorista','text'], ['data','Data','date'], ['placa','Placa','text'], ['auto','Auto','text'],
        ['gravidade','Gravidade','select:Leve,Média,Grave,Gravíssima'], ['pontos','Pontos','number'], ['aceitou','Aceitou','select:SIM,NÃO,Pendente'],
        ['motivo','Motivo da infração','textarea','wide']
      ],
      columns:[['data','Data',r=>fmtDate(r.data)], ['motorista','Motorista'], ['placa','Placa',r=>plate(r.placa)], ['auto','Auto',r=>`${esc(r.auto||'-')} ${r.multa_id ? tag('Vinculada','blue') : tag('Manual','gray')}`], ['gravidade','Gravidade',r=>tag(r.gravidade, gravidadeClass(r.gravidade))], ['pontos','Pontos',r=>`<b>${esc(r.pontos||0)}</b>`], ['aceitou','Aceitou'], ['motivo','Motivo',r=>`<div class="desc">${esc(r.motivo||r.origem||'')}</div>`]],
      stats: rows => {
        const map = new Map(); rows.forEach(r=>map.set(r.motorista, (map.get(r.motorista)||0)+toNum(r.pontos)));
        const max = Math.max(0, ...Array.from(map.values()));
        return [['Lançamentos', rows.length, 'registros'], ['Motoristas', map.size, 'com pontuação'], ['Total pontos', rows.reduce((s,r)=>s+toNum(r.pontos),0), 'somados'], ['Maior pontuação', max, 'motorista']];
      }
    },
    {
      key:'motoristas', table:'motoristas', icon:'👥', title:'Motoristas', subtitle:'Cadastro de condutores', softDelete:true, order:'nome', ascending:true,
      fields:[
        ['nome','Nome','text','wide'], ['cpf','CPF','text'], ['cnh','CNH','text'], ['categoria','Categoria','text'],
        ['validade','Validade CNH','date'], ['funcao','Função','text'], ['departamento','Departamento','text'],
        ['primeiro_dia','Primeiro dia','date'], ['status','Status','select:ativo,inativo'], ['obs','Observação','textarea','wide']
      ],
      columns:[['nome','Nome'], ['cpf','CPF'], ['cnh','CNH'], ['categoria','Categoria'], ['validade','Validade',r=>fmtDate(r.validade || r.venc_cnh)], ['funcao','Função'], ['departamento','Departamento'], ['status','Status',r=>tag(STATUS[r.status]||r.status, statusClass(r.status))]],
      stats: rows => [['Motoristas',rows.length,'cadastrados'], ['Ativos', rows.filter(r=>String(r.status||'ativo')==='ativo').length, 'em operação'], ['Inativos', rows.filter(r=>String(r.status)==='inativo').length, 'fora da operação'], ['CNH preenchida', rows.filter(r=>r.cnh).length, 'registros'], ['Pontos em 45 dias', rows.reduce((total, motorista) => total + pointsLastDaysForDriver(motorista, 45), 0), 'dos motoristas exibidos']]
    },
    {
      key:'veiculos', table:'veiculos', icon:'🚚', title:'Veículos', subtitle:'Lista da frota', softDelete:true, order:'placa', ascending:true,
      fields:[['placa','Placa','text'], ['modelo','Modelo','text'], ['ano','Ano','number'], ['renavam','RENAVAM','text'], ['motorista','Motorista','text'], ['status','Status','select:ativo,manutencao,inativo'], ['motivo','Motivo parado/manutenção','textarea','wide'], ['obs','Observação','textarea','wide']],
      columns:[['placa','Placa',r=>plate(r.placa)], ['modelo','Modelo'], ['ano','Ano'], ['renavam','RENAVAM'], ['motorista','Motorista'], ['status','Status',r=>tag(STATUS[r.status]||r.status, statusClass(r.status))], ['motivo','Motivo',r=>`<div class="desc">${esc(r.motivo||r.obs||'')}</div>`]],
      stats: rows => [['Veículos',rows.length,'cadastrados'], ['Ativos',rows.filter(r=>String(r.status||'ativo')==='ativo').length,'operando'], ['Manutenção',rows.filter(r=>clean(r.status).includes('manut')).length,'parados'], ['Com motorista',rows.filter(r=>r.motorista).length,'vinculados']]
    },
    {
      key:'chamados', table:'chamados', icon:'🔔', title:'Chamados', subtitle:'Problemas informados pelos motoristas via QR Code', dateField:'created_at', softDelete:false, order:'created_at', ascending:false,
      fields:[
        ['placa','Placa','text'], ['modelo','Modelo','text'], ['motorista_nome','Motorista','text'],
        ['categoria','Categoria','select:mecanica,pneus,freios,eletrica,lataria,documento,outro'],
        ['status','Status','select:aberto,em_analise,em_manutencao,resolvido'],
        ['prioridade','Prioridade','select:leve,medio,alta,urgente'],
        ['descricao','Descrição do problema','textarea','wide'],
        ['observacao_interna','Observação interna','textarea','wide'],
        ['solucao','Solução registrada','textarea','wide']
      ],
      columns:[
        ['created_at','Recebido', r=>fmtDateTime(r.created_at)], ['placa','Placa', r=>plate(r.placa)], ['modelo','Veículo'],
        ['categoria','Categoria', r=>tag(CHAMADO_CATEGORIAS[r.categoria]||r.categoria||'-', 'gray')],
        ['descricao','Problema', r=>`<div class="desc">${esc(r.descricao||'')}</div>`],
        ['motorista_nome','Motorista', r=>esc(r.motorista_nome||'Não informado')],
        ['foto_url','Foto', r=>r.foto_url ? `<a class="inline-link" href="${esc(r.foto_url)}" target="_blank" rel="noopener">Ver foto</a>` : '-'],
        ['status','Status', r=>tag(STATUS[r.status]||r.status||'Aberto', statusClass(r.status))]
      ],
      stats: rows => chamadosStats(rows)
    },
    {
      key:'checklists', table:'checklists', icon:'🎥', title:'Checklists', subtitle:'Vídeos de inspeção enviados pelo celular', dateField:'criado_em', softDelete:false, order:'criado_em', ascending:false,
      fields:[],
      columns:[
        ['hora_inicio','Data/Hora', r=>fmtDateTime(r.hora_inicio||r.criado_em)], ['placa','Placa', r=>plate(r.placa)],
        ['responsavel','Responsável'], ['duracao_segundos','Duração (s)'], ['nome_arquivo','Arquivo'], ['status_upload','Status']
      ],
      stats: rows => [['Checklists', rows.length, 'registrados']]
    },
    {key:'historico360', icon:'🧭', title:'Central 360°', subtitle:'Prontuário completo do veículo: situação atual, saúde, modelo 3D, indicadores, timeline e histórico de todos os módulos'},
    {
      key:'tacografos', table:'tacografos', icon:'⏱️', title:'Tacógrafos', subtitle:'Controle de aferição e validade', dateField:'data_validade', monthFilter:true, softDelete:true, order:'data_validade', ascending:true,
      fields:[['placa','Placa','text'], ['data_emissao','Data emissão/aferição','date'], ['data_validade','Validade','date'], ['status','Status','select:ativo,pendente,vencido,inativo'], ['obs','Observação','textarea','wide']],
      columns:[['placa','Placa',r=>plate(r.placa)], ['data_emissao','Emissão',r=>fmtDate(r.data_emissao||r.data)], ['data_validade','Validade',r=>fmtDate(r.data_validade||r.validade)], ['status','Status',r=>tag(STATUS[r.status||r.situacao]||r.status||r.situacao, statusClass(r.status||r.situacao))], ['obs','Obs',r=>`<div class="desc">${esc(r.obs||'')}</div>`]],
      stats: rows => [['Registros', rows.length,'cadastrados'], ['Ativos', rows.filter(r=>clean(r.status||r.situacao).includes('ativo')).length,'válidos'], ['Vencidos', rows.filter(r=>isExpired(r.data_validade||r.validade)).length,'atenção'], ['Sem validade', rows.filter(r=>!(r.data_validade||r.validade)).length,'conferir']]
    },
    {
      key:'oleo', table:'trocas_oleo', fallbackTables:['oleo'], icon:'🛢️', title:'Troca de Óleo', subtitle:'Controle de validade, quilometragem e próxima troca', dateField:'data_ultima_troca', monthFilter:true, softDelete:true, order:'data_ultima_troca', ascending:false,
      fields:[['tipo','Tipo','select:Motor,Câmbio,Diferencial,Completa,Outro'], ['placa','Placa','text'], ['modelo','Modelo','text'], ['data_ultima_troca','Data última troca','date'], ['km_ultima_vistoria','KM última vistoria','number'], ['km_proxima_troca','KM próxima troca','number'], ['km_faltando','KM faltando','number'], ['obs','Observação','textarea','wide']],
      columns:[['placa','Placa',r=>plate(r.placa)], ['tipo','Tipo',r=>tag(r.tipo||'Motor','blue')], ['modelo','Modelo'], ['data_ultima_troca','Última troca',r=>fmtDate(r.data_ultima_troca||r.data)], ['km_ultima_vistoria','KM atual',r=>esc(r.km_ultima_vistoria||r.km||'')], ['km_proxima_troca','Próxima KM',r=>esc(r.km_proxima_troca||r.proxkm||r.proxKm||'')], ['situacao','Situação',r=>{ const st=oilSituation(r); return tag(st.label, st.cls); }], ['obs','Obs',r=>`<div class="desc">${esc(r.obs||'')}</div>`]],
      stats: rows => [['Trocas',rows.length,'cadastradas'], ['Ativas', rows.filter(r=>oilSituationValue(r)==='ativo').length,'em dia'], ['Verificar', rows.filter(r=>oilSituationValue(r)==='verificar').length,'último mês antes do vencimento'], ['Vencidas', rows.filter(r=>oilSituationValue(r)==='vencido').length,'fora do prazo']]
    },
    {
      key:'manutencoes', table:'manutencoes', icon:'🔧', title:'Manutenções', subtitle:'Histórico de serviços e custos', dateField:'data', monthFilter:true, softDelete:true, order:'data', ascending:false,
      fields:[['data','Data','date'], ['placa','Placa','text'], ['servico','Serviço','text'], ['tipo','Tipo/peça','text'], ['origem','Origem','text'], ['valor','Valor','number'], ['validade','Validade peça','date'], ['status','Status','select:concluido,pendente,em andamento'], ['descricao','Descrição','textarea','wide']],
      columns:[['data','Data',r=>fmtDate(r.data)], ['placa','Placa',r=>plate(r.placa)], ['servico','Serviço',r=>esc(r.servico||r.tipo||'')], ['tipo','Tipo'], ['descricao','Descrição',r=>`<div class="desc">${esc(r.descricao||r.obs||'')}</div>`], ['origem','Origem'], ['valor','Valor',r=>`<span class="money">${brlKey('manutencoes', r)}</span>`], ['status','Status',r=>tag(STATUS[r.status]||r.status, statusClass(r.status))]],
      stats: rows => [['Manutenções',rows.length,'registros'], ['Pendentes',pendingRows('manutencoes', rows).length,'em aberto'], ['Valor pendente',brl(sumMoney('manutencoes', pendingRows('manutencoes', rows))),'em aberto'], ['Veículos',new Set(rows.map(r=>r.placa).filter(Boolean)).size,'com serviço']]
    },
    {
      key:'formularios', icon:'📝', title:'Formulários de Defeito', subtitle:'PDFs e registros importados do projeto antigo', staticCount:0, dateField:'data', monthFilter:true,
      columns:[['data','Data',r=>fmtDate(r.data)], ['placa','Placa',r=>plate(r.placa)], ['motorista','Motorista'], ['defeito','Defeito',r=>`<div class="desc">${esc(r.defeito||r.descricao||'')}</div>`], ['gravidade','Gravidade',r=>tag(r.gravidade||'média', gravidadeClass(r.gravidade||'média'))], ['status','Status',r=>tag(STATUS[r.status]||r.status||'pendente', statusClass(r.status||'pendente'))], ['anexo','PDF',r=>r.anexo ? `<a class="inline-link" href="${esc(r.anexo)}" target="_blank">Página ${esc(r.pagina||'')}</a>` : '-']],
      stats: rows => [['Registros OCR',rows.length,'importados'], ['Pendentes',rows.filter(r=>!finalStatus('formularios', r)).length,'em aberto'], ['PDFs',formulariosPdfs().length,'arquivos mensais'], ['Meses',new Set(rows.map(r=>r.mes||ym(r.data)).filter(Boolean)).size,'com registros']]
    },
    {
      key:'producao', table:'producao_dia', mergeTables:['producao_dia','producao'], fallbackTables:['producao'], icon:'📁', title:'Produção do Dia', subtitle:'Pastas mensais e serviços do dia', dateField:'data', monthFilter:true, softDelete:true, order:'data', ascending:false,
      fields:[['dia_semana','Dia da produção','weekday','wide'], ['data','Data','date'], ['mes','Pasta/Mês AAAA-MM','text'], ['placa','Placa','text'], ['servico','Serviço','textarea','wide'], ['responsaveis','Responsável','responsavel-picker','wide'], ['obs','Observação','textarea','wide']],
      columns:[['mes','Pasta',r=>esc(rowMonth('producao',r)||'')], ['data','Data',r=>fmtDate(r.data)], ['placa','Placa',r=>plate(r.placa)], ['servico','Serviço',r=>`<div class="desc">${esc(r.servico||'')}</div>`], ['responsaveis','Responsáveis',r=>esc(r.responsaveis||r.responsavel||'')], ['obs','Obs',r=>`<div class="desc">${esc(r.obs||'')}</div>`]],
      stats: rows => [['Lançamentos',rows.length,'registros'], ['Pastas',new Set(rows.map(r=>r.mes||ym(r.data)).filter(Boolean)).size,'meses/dias'], ['Veículos',new Set(rows.map(r=>r.placa).filter(Boolean)).size,'envolvidos'], ['Hoje',rows.filter(r=>String(r.data)===new Date().toISOString().slice(0,10)).length,'lançamentos']]
    },
    {
      key:'brat', table:'brats', icon:'🚨', title:'BRAT', subtitle:'Ocorrências com arquivos preservados no Supabase', dateField:'data', monthFilter:true, softDelete:true, order:'data', ascending:false,
      fields:[['titulo','Nome da ocorrência','text','wide'], ['data','Data','date'], ['placa','Placa','text'], ['motorista','Motorista','text'], ['numero_brat','Número BRAT','text'], ['tipo','Tipo','text'], ['status','Status','select:aberto,em_analise,pendente,aguardando_docs,concluido'], ['local','Local','text','wide'], ['descricao','Descrição do ocorrido','textarea','wide'], ['obs','Observações','textarea','wide']],
      columns:[['titulo','Ocorrência',r=>esc(bratRecordTitle(r))], ['data','Data',r=>fmtDate(r.data)], ['placa','Placa',r=>plate(r.placa)], ['motorista','Motorista'], ['status','Status',r=>tag(STATUS[r.status]||r.status,statusClass(r.status))], ['descricao','Descrição',r=>`<div class="desc">${esc(r.descricao||r.obs||'')}</div>`], ['anexos','Arquivos',r=>`${toNum(r.qtd_arquivos)} arquivo(s)`]],
      stats: rows => [['Ocorrências',rows.length,'registradas'], ['Em acompanhamento',rows.filter(r=>!finalStatus('brat',r)).length,'abertas'], ['Concluídas',rows.filter(r=>finalStatus('brat',r)).length,'finalizadas'], ['Arquivos',rows.reduce((n,r)=>n+toNum(r.qtd_arquivos),0),'salvos no Supabase']]
    },
    {
      key:'sinistros', table:'sinistros_avarias', icon:'🚧', title:'Sinistros e Avarias', subtitle:'Registro de ocorrências, danos, responsáveis, valores, fotos e vídeos', dateField:'data', monthFilter:true, monthFilterSelect:true, softDelete:true, order:'data', ascending:false,
      fields:[
        ['data','Data da ocorrência','date'], ['placa','Placa','text'], ['motorista','Motorista','text'],
        ['tipo','Tipo','select:Sinistro,Avaria'], ['status','Status','select:pendente,em_analise,orcamento,em_reparo,acionado_seguro,concluido'],
        ['avaria','Descrição da avaria/sinistro','textarea','wide'], ['local','Local da ocorrência','text'],
        ['responsabilidade','Responsabilidade','select:Em análise,Motorista,Terceiro,Compartilhada,Sem culpa'], ['valor','Valor estimado/real','number'],
        ['data_previsao','Previsão de conclusão','date'], ['numero_sinistro','Número do sinistro','text'], ['seguradora','Seguradora','text'],
        ['houve_terceiro','Houve terceiro envolvido','checkbox'], ['anexo','Link de anexo (opcional)','text','wide'], ['obs','Observações','textarea','wide']
      ],
      columns:[
        ['data','Data',r=>fmtDate(r.data)], ['placa','Placa',r=>plate(r.placa)], ['motorista','Motorista'],
        ['tipo','Tipo',r=>tag(r.tipo||'Avaria','blue')], ['avaria','Avaria/Sinistro',r=>`<div class="desc">${esc(r.avaria||r.descricao||r.obs||'')}</div>`],
        ['responsabilidade','Responsabilidade',r=>tag(r.responsabilidade||'Em análise', clean(r.responsabilidade).includes('motorista')?'amber':clean(r.responsabilidade).includes('terceiro')?'blue':'gray')],
        ['valor','Valor',r=>`<span class="money">${brlKey('sinistros',r)}</span>`], ['status','Status',r=>tag(STATUS[r.status]||r.status||'Pendente',statusClass(r.status||'pendente'))],
        ['arquivos','Fotos/Vídeos',r=>{ const c=sinistroCounts(r); return c.total ? `${c.fotos?`🖼️${c.fotos} `:''}${c.videos?`🎥${c.videos} `:''}${c.pdfs?`📄${c.pdfs} `:''}${c.outros?`📎${c.outros}`:''}`.trim() || `${c.total} arquivo(s)` : '-'; }]
      ],
      stats: rows => [
        ['Ocorrências',rows.length,'registros'],
        ['Em aberto',pendingRows('sinistros',rows).length,'em acompanhamento'],
        ['Valor total',brl(sumMoney('sinistros',rows)),'estimado/real'],
        ['Veículos',new Set(rows.map(r=>r.placa).filter(Boolean)).size,'envolvidos'],
        ['Com terceiro',rows.filter(r=>r.houve_terceiro===true||String(r.houve_terceiro)==='true').length,'ocorrências'],
        ['Arquivos',rows.reduce((n,r)=>n+sinistroCounts(r).total,0),'fotos, vídeos e anexos salvos']
      ]
    },
    {
      key:'eficiencia', icon:'⛽', title:'Eficiência Operacional', subtitle:'Consumo médio de combustível (KM/L) por competência mensal'
    },
    {key:'relatorios', icon:'📄', title:'Relatórios', subtitle:'Exportações mensais em CSV e PDF'},
    {key:'financeiro', icon:'💰', title:'Financeiro', subtitle:'Resumo financeiro consolidado'},
    {key:'lixeira', table:'lixeira_operacional', icon:'🗑️', title:'Lixeira', subtitle:'Registros excluídos e opção de restauração'},
    {key:'auditoria', icon:'🕵️', title:'Auditoria', subtitle:'Histórico automático de criação, edição e exclusão em todo o sistema'},
    {key:'usuarios', icon:'👥', title:'Usuários', subtitle:'Cadastro de pessoas e permissões de acesso (administrador ou visitante)'}
  ];

  const byKey = Object.fromEntries(MODULES.map(m => [m.key, m]));
  const operationalKeys = MODULES.filter(m => m.table && m.key !== 'lixeira').map(m => m.key);
  const state = {
    current:'dashboard',
    data:Object.fromEntries(MODULES.map(m => [m.key, []])),
    filters:{},
    loading:false,
    db:null,
    modal:null,
    user:null,
    errors:{},
    lastLoad:null,
    reportModule:'manutencoes',
    reportMonth:'',
    multasTab:'todos',
    historico360:{search:'', plate:'', tab:'visao'},
    bratFiles:[],
    bratFilesLoaded:false,
    bratPendingFiles:[],
    bratBusy:false,
    bratRealtime:null,
    bratRealtimeTimer:null,
    importAutuacaoBusy:false
  };
  MODULES.forEach(m => state.filters[m.key] = {search:'', month:'', status:'', gravidade:'', prioridade:''});
  state.filters.multas.motorista = '';
  state.filters.multas.quick = '';
  state.filters.producao.day = '';
  state.filters.manutencoes.day = '';
  state.data.manutencoesMeses = [];
  state.data.producaoMeses = [];

  function isExpired(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return false;
    const d = new Date(date + 'T00:00:00'); const t = new Date(); t.setHours(0,0,0,0);
    return d < t;
  }
  function addMonthsIso(date, months){
    const d = String(date || '').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    const base = new Date(d + 'T00:00:00');
    base.setMonth(base.getMonth() + months);
    return base.toISOString().slice(0,10);
  }
  // Data de vencimento = data da última troca + 3 meses. Sempre calculada,
  // nunca lida de um campo de validade preenchido manualmente.
  function oilValidityDate(r){
    return addMonthsIso(r?.data_ultima_troca || r?.data, 3);
  }
  function oilStatus(r){
    const validade = oilValidityDate(r);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(validade)) return {cls:'gray', text:'Sem validade', sub:'Sem data para calcular'};
    const diff = daysUntil(validade);
    const sub = `Vencimento: ${fmtDate(validade)}`;
    if(diff < 0) return {cls:'red', text:`Vencido há ${Math.abs(diff)} dias`, sub};
    // "Verificar" começa 1 mês antes do vencimento (inclusive do próprio dia do vencimento).
    const inicioVerificar = addMonthsIso(validade, -1);
    const foraDoMesFinal = daysUntil(inicioVerificar) >= 0; // hoje ainda está a mais de 1 mês do vencimento
    if(foraDoMesFinal) return {cls:'green', text:`Faltam ${diff} dias para o vencimento`, sub};
    return {cls:'amber', text: diff === 0 ? 'Vence hoje' : `Faltam ${diff} dias para o vencimento`, sub};
  }
  function oilTag(r){ const s = oilStatus(r); return tag(s.text, s.cls); }
  // Mantém apenas a troca mais recente de cada veículo: assim que uma nova
  // troca é cadastrada, o alerta da troca anterior deixa de aparecer.
  function latestOilPerPlate(rows){
    const map = new Map();
    (rows || []).forEach(r => {
      const placa = clean(r?.placa || '');
      if(!placa) return;
      const atual = String(r?.data_ultima_troca || r?.data || '');
      const existente = map.get(placa);
      if(!existente || atual > String(existente.data_ultima_troca || existente.data || '')) map.set(placa, r);
    });
    return Array.from(map.values());
  }

  function rowStatusText(r){ return clean(r?.status || r?.situacao || r?.aceitou || r?.pagamento || ''); }
  function finalStatus(key, r){
    const s = rowStatusText(r);
    if(key === 'multas') return s.includes('pago') || s.includes('recorrida') || s.includes('sem_necessidade') || s.includes('sem necessidade') || s.includes('demitido');
    if(key === 'manutencoes') return s.includes('concluido') || s.includes('concluído') || s.includes('finalizado') || s.includes('pago');
    if(key === 'brat') return s.includes('concluido') || s.includes('concluído') || s.includes('finalizado');
    if(key === 'sinistros') return s.includes('concluido') || s.includes('concluído') || s.includes('finalizado') || s.includes('baixado');
    return s.includes('concluido') || s.includes('concluído') || s.includes('pago') || s.includes('baixado') || s.includes('finalizado');
  }
  function isPendingRow(key, r){
    const s = rowStatusText(r);
    if(key === 'multas') return !finalStatus(key, r);
    if(key === 'manutencoes') return s.includes('pend') || s.includes('aguard') || s.includes('andamento') || s.includes('aberto') || s.includes('orcamento') || s.includes('orçamento');
    if(key === 'veiculos') return isVeiculoParado(r);
    if(key === 'tacografos') { const d = daysUntil(r?.data_validade || r?.validade); return s.includes('pend') || s.includes('venc') || d <= 30; }
    if(key === 'oleo') return oilSituationValue(r) === 'verificar' || oilSituationValue(r) === 'vencido';
    if(key === 'pontos') return s.includes('pend') || s.includes('nao') || s.includes('não') || s.includes('aguard');
    if(key === 'motoristas') return isExpired(r?.validade || r?.venc_cnh) || s.includes('pend') || s.includes('venc');
    if(key === 'brat') return !finalStatus(key, r);
    if(key === 'sinistros') return !finalStatus(key, r);
    if(key === 'producao') return false;
    return s.includes('pend') || s.includes('aguard') || s.includes('venc') || s.includes('aberto');
  }
  function pendingRows(key, rows){ return (rows || state.data[key] || []).filter(r => isPendingRow(key, r)); }
  function pendingCount(key){
    if(key === 'lixeira') return (state.data.lixeira || []).filter(r=>!r.restored_at).length;
    if(!byKey[key]?.table) return '';
    return pendingRows(key).length;
  }
  function keyMoney(key, rowOrValue){
    const raw = rowOrValue && typeof rowOrValue === 'object' ? rowOrValue.valor : rowOrValue;
    let n = moneyValue(raw);
    const cap = key === 'multas' ? 20000 : key === 'manutencoes' ? 50000 : key === 'sinistros' ? 500000 : 1000000;
    if(!Number.isFinite(n) || n < 0 || n > cap) return 0;
    if(key === 'multas' && rowOrValue && typeof rowOrValue === 'object' && (rowOrValue.valor_dobrado === true || String(rowOrValue.valor_dobrado).toLowerCase() === 'true' || String(rowOrValue.valor_dobrado) === '1')) n = n * 2;
    return Number.isFinite(n) && n <= cap ? n : 0;
  }
  function brlKey(key, rowOrValue){ return keyMoney(key, rowOrValue).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
  function sumMoney(key, rows){ return (rows || []).reduce((s,r)=>s+keyMoney(key,r),0); }

  function connect(){
    if(state.db) return state.db;
    if(!window.supabase || !CFG.supabaseUrl || !CFG.supabaseAnonKey) return null;
    state.db = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    return state.db;
  }

  function setStatus(text, cls='ok'){
    const dot = $('#connectionDot');
    const label = $('#statusText');
    if(dot) dot.className = `dot ${cls}`;
    if(label) label.textContent = text;
    const last = $('#lastLoad');
    if(last && state.lastLoad) last.textContent = `Última atualização: ${state.lastLoad.toLocaleString('pt-BR')}`;
  }

  function toast(text){
    const el = $('#toast'); if(!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(()=>el.classList.remove('show'), 2600);
  }
  // Aviso persistente para falhas reais de salvamento no Supabase — diferente do
  // toast comum, este NÃO some sozinho rápido: fica visível até o usuário fechar
  // (ou até 20s), porque um salvamento que falhou não pode passar despercebido.
  function showSaveError(text){
    const el = $('#saveErrorBanner'), textEl = $('#saveErrorText');
    if(!el || !textEl) return toast(text);
    textEl.textContent = text;
    el.hidden = false;
    clearTimeout(showSaveError._t);
    showSaveError._t = setTimeout(()=>{ el.hidden = true; }, 20000);
  }
  function bindSaveErrorBanner(){
    $('#saveErrorClose')?.addEventListener('click', () => {
      const el = $('#saveErrorBanner'); if(el) el.hidden = true;
      clearTimeout(showSaveError._t);
    });
  }

  function currentUser(){
    return state.user || null;
  }
  function isReadOnly(){
    const u = currentUser(); return !u || u.perfil !== 'admin';
  }

  const NAV_GROUPS = [
    {title:'Geral', keys:['dashboard','veiculos','historico360']},
    {title:'Pessoas', keys:['motoristas','pontos']},
    {title:'Operação', keys:['chamados','checklists','producao','sinistros','brat','formularios']},
    {title:'Manutenção', keys:['manutencoes','oleo','tacografos']},
    {title:'Administrativo', keys:['multas','financeiro']},
    {title:'Desempenho', keys:['eficiencia']},
    {title:'Relatórios', keys:['relatorios']},
    {title:'Sistema', keys:['lixeira','auditoria','usuarios']},
  ];
  function renderNav(){
    const nav = $('#nav'); if(!nav) return;
    const byKeyModule = new Map(MODULES.map(m => [m.key, m]));
    const placed = new Set();
    const navBtnHtml = (m) => {
      const count = m.table ? pendingCount(m.key) : (m.staticCount ?? '');
      return `<button class="nav-btn ${state.current===m.key?'active':''}" data-page="${m.key}" type="button"><span class="emoji">${m.icon}</span><span class="label">${esc(m.title)}</span>${count!==''?`<span class="count">${count}</span>`:''}</button>`;
    };
    let html = NAV_GROUPS.map(g => {
      const hiddenForRole = k => (k.key==='auditoria' || k.key==='usuarios') && (!state.user || state.user.perfil!=='admin');
      const allItems = g.keys.map(k => byKeyModule.get(k)).filter(Boolean);
      allItems.forEach(m => placed.add(m.key));
      const items = allItems.filter(m => !hiddenForRole(m));
      if(!items.length) return '';
      return `<div class="nav-group"><div class="nav-group-title">${esc(g.title)}</div>${items.map(navBtnHtml).join('')}</div>`;
    }).join('');
    const leftover = MODULES.filter(m => !placed.has(m.key));
    if(leftover.length) html += `<div class="nav-group"><div class="nav-group-title">Outros</div>${leftover.map(navBtnHtml).join('')}</div>`;
    nav.innerHTML = html;
    $$('.nav-btn', nav).forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  }

  function setActions(html){
    const box = $('#topbarActions'); if(box) box.innerHTML = html || '';
  }

  function showPage(key){
    if(!byKey[key]) key = 'dashboard';
    state.current = key;
    const m = byKey[key];
    $('#pageTitle').textContent = m.title;
    $('#pageSubtitle').textContent = m.subtitle || '';
    renderNav();
    renderCurrentPage();
  }

  function renderCurrentPage(){
    const key = state.current;
    if(key === 'dashboard') return renderDashboard();
    if(key === 'financeiro') return renderFinanceiro();
    if(key === 'eficiencia') return (window.EficienciaFrota && typeof window.EficienciaFrota.render === 'function') ? window.EficienciaFrota.render() : renderModule(key);
    if(key === 'relatorios') return renderRelatorios();
    if(key === 'lixeira') return renderLixeira();
    if(key === 'auditoria') return renderAuditoria();
    if(key === 'usuarios') return renderUsuarios();
    if(key === 'formularios') return renderFormularios();
    if(key === 'manutencoes') return renderManutencoesPastas();
    if(key === 'producao') return renderProducaoPastas();
    if(key === 'tacografos') return renderTacografosPastas();
    if(key === 'oleo') return renderOleoPastas();
    if(key === 'motoristas') return renderMotoristasDetalhado();
    if(key === 'veiculos') return renderVeiculosDetalhado();
    if(key === 'chamados') return renderChamados();
    if(key === 'checklists') return (window.ChecklistsFrota && typeof window.ChecklistsFrota.render === 'function') ? window.ChecklistsFrota.render() : renderModule(key);
    if(key === 'sinistros') return renderSinistros();
    if(key === 'multas') return renderMultas();
    if(key === 'historico360') return renderHistorico360();
    if(key === 'brat') return renderBrat();
    return renderModule(key);
  }

  function statsHtml(items){
    return `<div class="grid stats-grid">${items.map(([label,value,sub])=>`<article class="stat-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub||'')}</small></article>`).join('')}</div>`;
  }

  function getMonths(key){
    const cfg = byKey[key];
    const rows = state.data[key] || [];
    const months = new Set();
    rows.forEach(r => {
      const m = r.mes || ym(r[cfg.dateField || 'data']) || ym(r.data) || ym(r.data_multa) || ym(r.dataMulta) || ym(r.data_validade) || ym(r.validade) || ym(r.created_at);
      if(m) months.add(m);
    });
    return Array.from(months).sort().reverse();
  }

  function foldersHtml(key){
    const months = getMonths(key);
    const selected = state.filters[key].month || '';
    if(!months.length) return '';
    return `<div class="folders"><button class="folder ${!selected?'active':''}" data-month=""><strong>Todos</strong><small>${(state.data[key]||[]).length} registros</small></button>${months.map(m=>`<button class="folder ${selected===m?'active':''}" data-month="${esc(m)}"><strong>${esc(monthLabel(m))}</strong><small>${countByMonth(key,m)} registros</small></button>`).join('')}</div>`;
  }
  function countByMonth(key, month){ return filterRows(key, {month, search:'', status:'', gravidade:''}).length; }

  function filterRows(key, customFilter){
    const cfg = byKey[key];
    const f = customFilter || state.filters[key] || {};
    const q = clean(f.search || '');
    const rows = (state.data[key] || []).filter(r => {
      const rowMonth = r.mes || ym(r[cfg.dateField || 'data']) || ym(r.data) || ym(r.data_multa) || ym(r.dataMulta) || ym(r.data_validade) || ym(r.validade) || ym(r.created_at);
      if(f.month && rowMonth !== f.month) return false;
      if(f.status && String(r.status||r.situacao||'') !== f.status) return false;
      if(f.gravidade && String(r.gravidade||'') !== f.gravidade) return false;
      if(key === 'multas' && f.prioridade === 'sim' && !multaPrioridadeAtiva(r)) return false;
      if(key === 'multas' && f.prioridade === 'nao' && multaPrioridadeAtiva(r)) return false;
      if(key === 'multas' && f.quick && !multaQuickFilterMatches(r, f.quick)) return false;
    if(key === 'chamados' && f.quick && clean(r.status||'aberto') !== f.quick) return false;
      if(q && !clean(Object.values(r).join(' ')).includes(q)) return false;
      return true;
    });
    if(key === 'multas') rows.sort((a,b) => Number(multaPrioridadeAtiva(b)) - Number(multaPrioridadeAtiva(a)) || Number(b.id || 0) - Number(a.id || 0));
    return rows;
  }


  function auxMonthsKey(key){ return key === 'manutencoes' ? 'manutencoesMeses' : key === 'producao' ? 'producaoMeses' : `${key}Meses`; }
  function monthTableFor(key){ return key === 'manutencoes' ? 'manutencoes_meses' : key === 'producao' ? 'producao_meses' : ''; }
  function rowMonth(key, r){
    const cfg = byKey[key] || {};
    return r?.mes || ym(r?.[cfg.dateField || 'data']) || ym(r?.data) || ym(r?.data_multa) || ym(r?.dataMulta) || ym(r?.data_validade) || ym(r?.validade) || ym(r?.created_at) || '';
  }
  function allFolderMonths(key){
    const rows = state.data[key] || [];
    const aux = state.data[auxMonthsKey(key)] || [];
    const values = [];
    aux.forEach(x => values.push(typeof x === 'string' ? x : x?.mes));
    rows.forEach(r => values.push(rowMonth(key, r)));
    return Array.from(new Set(values.filter(m => /^\d{4}-\d{2}$/.test(String(m||''))))).sort().reverse();
  }
  function folderRows(key, month){
    const rows = state.data[key] || [];
    const q = clean(state.filters[key]?.search || '');
    return rows.filter(r => {
      if(month && rowMonth(key, r) !== month) return false;
      if((key === 'producao' || key === 'manutencoes') && state.filters[key]?.day && String(r.data || '').slice(0,10) !== state.filters[key].day) return false;
      if(q && !clean(Object.values(r).join(' ')).includes(q)) return false;
      return true;
    });
  }
  function folderCardsHtml(key){
    const selected = state.filters[key].month || '';
    const months = allFolderMonths(key);
    const items = ['', ...months];
    const cls = key === 'manutencoes' ? 'man' : 'prod';
    return `<div class="classic-folders ${cls}-folders">${items.map(m => {
      const rows = (state.data[key] || []).filter(r => !m || rowMonth(key, r) === m);
      const veiculos = new Set(rows.map(r => r.placa || r.carro).filter(Boolean)).size;
      const total = key === 'manutencoes' ? sumMoney('manutencoes', rows) : 0;
      const last = rows.map(r=>String(r.data||'').slice(0,10)).filter(Boolean).sort().reverse()[0] || '';
      return `<article class="classic-folder ${selected===m?'active':''}" data-month="${esc(m)}">
        <button type="button" class="classic-folder-main js-folder-select" data-month="${esc(m)}">
          <span class="classic-folder-icon">📁</span>
          <strong>${esc(m ? monthLabel(m) : 'Todos os meses')} <span class="folder-count">${rows.length}</span></strong>
          <small>${rows.length} registro${rows.length===1?'':'s'} • ${veiculos} veículo${veiculos===1?'':'s'}</small>
          <small class="folder-highlight">${key === 'manutencoes' ? `Total: ${esc(brl(total))}` : `Último: ${esc(last ? fmtDate(last) : '-')}`}</small>
        </button>
        ${m && monthTableFor(key) ? `<div class="classic-folder-tools"><button class="icon-btn js-folder-edit" data-month="${esc(m)}" type="button" title="Editar pasta">✎</button><button class="icon-btn danger js-folder-delete" data-month="${esc(m)}" type="button" title="Ocultar pasta">×</button></div>` : ''}
      </article>`;
    }).join('')}</div>`;
  }
  function validadeInfo(date){
    const d = String(date || '').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return {cls:'gray', text:'Sem validade', sub:'Sem data de validade'};
    const n = daysUntil(d);
    if(n < 0) return {cls:'red', text:`Vencida há ${Math.abs(n)} dias`, sub:`Validade: ${fmtDate(d)}`};
    if(n === 0) return {cls:'red', text:'Vence hoje', sub:`Validade: ${fmtDate(d)}`};
    if(n <= 30) return {cls:'red', text:`Vence em ${n} dias`, sub:`Validade: ${fmtDate(d)}`};
    if(n <= 60) return {cls:'amber', text:`Vence em ${n} dias`, sub:`Validade: ${fmtDate(d)}`};
    return {cls:'green', text:`Vence em ${n} dias`, sub:`Validade: ${fmtDate(d)}`};
  }
  function bindFolderEvents(key, renderFn){
    $$('.js-folder-select').forEach(btn => btn.addEventListener('click', () => {
      const m = btn.dataset.month || '';
      state.filters[key].month = m;
      if(key === 'producao' || key === 'manutencoes') state.filters[key].day = '';
      renderFn();
    }));
    $$('.js-folder-edit').forEach(btn => btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      const old = btn.dataset.month || '';
      const novo = prompt('Editar pasta no formato AAAA-MM:', old);
      if(novo === null) return;
      const m = String(novo || '').trim();
      if(!/^\d{4}-\d{2}$/.test(m)){ alert('Use o formato AAAA-MM.'); return; }
      await addMonthFolder(key, m);
      state.filters[key].month = m;
      if(key === 'producao' || key === 'manutencoes') state.filters[key].day = '';
      renderFn();
      toast('Pasta selecionada. Os registros antigos permanecem no mês original.');
    }));
    $$('.js-folder-delete').forEach(btn => btn.addEventListener('click', async ev => {
      ev.stopPropagation();
      const m = btn.dataset.month || '';
      if(!confirm('Ocultar esta pasta manual? Os registros do mês não serão apagados.')) return;
      const auxKey = auxMonthsKey(key);
      state.data[auxKey] = (state.data[auxKey] || []).filter(x => (typeof x === 'string' ? x : x?.mes) !== m);
      const db = connect(); const table = monthTableFor(key);
      if(db && table){ try{ await db.from(table).delete().eq('mes', m); }catch(e){ console.warn(e); } }
      if(state.filters[key].month === m) state.filters[key].month = '';
      if(key === 'producao' || key === 'manutencoes') state.filters[key].day = '';
      renderFn();
    }));
  }
  async function addMonthFolder(key, month){
    const m = String(month || '').trim();
    if(!/^\d{4}-\d{2}$/.test(m)) return false;
    const auxKey = auxMonthsKey(key);
    if(!Array.isArray(state.data[auxKey])) state.data[auxKey] = [];
    if(!state.data[auxKey].some(x => (typeof x === 'string' ? x : x?.mes) === m)) state.data[auxKey].push({mes:m});
    const db = connect(); const table = monthTableFor(key);
    if(db && table){ try{ await db.from(table).upsert({mes:m}, {onConflict:'mes'}); }catch(e){ console.warn('Não foi possível salvar pasta:', e); } }
    return true;
  }
  function openAddFolder(key, renderFn){
    const base = state.filters[key].month || new Date().toISOString().slice(0,7);
    const m = prompt('Digite a pasta no formato AAAA-MM:', base);
    if(m === null) return;
    const month = String(m || '').trim();
    if(!/^\d{4}-\d{2}$/.test(month)){ alert('Use o formato AAAA-MM.'); return; }
    addMonthFolder(key, month).then(() => { state.filters[key].month = month; if(key === 'producao' || key === 'manutencoes') state.filters[key].day = ''; renderFn(); });
  }
  function bindDoubleClickEdit(){
    if(isReadOnly()) return;
    const selectors = [
      '.clean-record-card[data-id]',
      '.vehicle-card[data-id]',
      '.person-card[data-id]',
      '.brat-card[data-id]',
      '.multa-card[data-id]'
    ].join(',');

    $$(selectors).forEach(card => {
      if(card.dataset.dblEditBound) return;
      card.dataset.dblEditBound = '1';
      card.addEventListener('dblclick', ev => {
        // Botões, links e campos continuam com seu comportamento normal.
        if(ev.target.closest('button, a, input, select, textarea, label')) return;
        const id = card.dataset.id;
        const key = state.current;
        if(!id || !key) return;
        openModal(key, id);
      });
    });
  }

  function bindCleanCardActions(key){
    $$('.js-clean-edit').forEach(btn => btn.addEventListener('click', () => openModal(key, btn.dataset.id)));
    $$('.js-clean-delete').forEach(btn => btn.addEventListener('click', () => deleteRecord(key, btn.dataset.id)));
  }

  function renderManutencoesPastas(){
    const key = 'manutencoes';
    const selected = state.filters[key].month || '';
    const day = state.filters[key].day || '';
    const rows = folderRows(key, selected);
    const pendentes = pendingRows(key, rows);
    const total = sumMoney(key, rows);
    const totalPendente = sumMoney(key, pendentes);
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="addFolderBtn" type="button">+ Pasta/mês</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Nova manutenção</button>`}
    `);
    $('#pageRoot').innerHTML = `
      <div class="clean-board man-board">
        ${statsHtml([
          ['Registros', rows.length, selected ? 'no mês selecionado' : 'total de serviços'],
          ['Pendentes', pendentes.length, 'em aberto'],
          ['Valor pendente', brl(totalPendente), 'somente pendências'],
          ['Valor total', brl(total), day ? 'pasta do dia' : 'corrigido/conferido']
        ])}
        ${folderCardsHtml(key)}
        ${dayFoldersHtml(selected, key)}
        <div class="module-tools clean-tools"><input class="search" id="manSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por placa, tipo, origem, validade ou descrição..." /></div>
        <section class="clean-panel">
          <div class="clean-head"><h3>${esc(manutencaoTitle(selected, day))}</h3><small>${rows.length} registro${rows.length===1?'':'s'}</small></div>
          <div class="clean-card-list">${rows.length ? rows.map(r => manutencaoCardHtml(r, readOnly)).join('') : '<div class="clean-empty">Nenhuma manutenção encontrada com esse filtro.</div>'}</div>
        </section>
      </div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#addFolderBtn')?.addEventListener('click', () => openAddFolder(key, renderManutencoesPastas));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#exportPdfBtn')?.addEventListener('click', () => exportPdf(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#manSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderManutencoesPastas(); const input=$('#manSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    bindFolderEvents(key, renderManutencoesPastas);
    $$('.js-day-folder').forEach(btn => btn.addEventListener('click', () => { const d=btn.dataset.day||''; state.filters.manutencoes.day = state.filters.manutencoes.day === d ? '' : d; renderManutencoesPastas(); }));
    bindCleanCardActions(key);
  }
  function manutencaoTitle(month, day){
    if(day) return `Manutenções — ${fmtDate(day)}`;
    if(month) return `Manutenções — ${monthLabel(month)}`;
    return 'Manutenções — Todos os meses';
  }
  function manutencaoDefeitosHtml(selectedMonth){
    const rowsAll = formulariosRows();
    const pdfsAll = formulariosPdfs();
    const rows = rowsAll.filter(r => !selectedMonth || (r.mes || ym(r.data)) === selectedMonth);
    const pdfs = pdfsAll.filter(p => !selectedMonth || p.mes === selectedMonth);
    if(!rows.length && !pdfs.length) return '';
    const preview = rows.slice(0, 8);
    return `<section class="clean-panel man-defects-panel">
      <div class="clean-head"><h3>Formulários de Defeito — dentro de Manutenções</h3><small>${rows.length} registro${rows.length===1?'':'s'} OCR • ${pdfs.length} PDF${pdfs.length===1?'':'s'}</small></div>
      <div class="defect-archive-grid man-defect-pdfs">
        ${pdfs.map(a=>`<a class="defect-file-card" href="${esc(a.arquivo)}" target="_blank"><b>📄 ${esc(a.nome)}</b><small>${esc(monthLabel(a.mes))} • ${esc(a.paginas)} página(s)</small><span>Abrir PDF</span></a>`).join('')}
      </div>
      <div class="clean-card-list man-defect-list">
        ${preview.length ? preview.map(r=>`<article class="clean-record-card man-record-card man-defect-card">
          <div class="clean-record-main">
            <div class="clean-title-row"><span class="plate">${esc(r.placa || '-')}</span>${tag(r.status || 'pendente', statusClass(r.status || 'pendente'))}<span class="tag blue">Formulário</span></div>
            <div class="clean-service">${esc(r.defeito || 'Descrição do defeito importada do PDF')}</div>
            <div class="clean-info-grid">
              <div class="clean-info"><span>Data</span><b>${esc(fmtDate(r.data))}</b></div>
              <div class="clean-info"><span>Motorista</span><b>${esc(r.motorista || '-')}</b></div>
              <div class="clean-info"><span>Origem</span><b>${esc(r.localizacao || 'PDF importado')}</b></div>
              <div class="clean-info"><span>Página</span><b>${esc(r.pagina || '-')}</b></div>
            </div>
            <div class="clean-desc ${r.obs ? '' : 'empty-desc'}">${r.obs ? esc(r.obs) : 'Registro importado do formulário de defeito.'}</div>
          </div>
          <aside class="clean-card-side"><div class="clean-note-box"><span class="tag amber">Revisar OCR</span><small>${esc(r.anexo || 'PDF antigo')}</small></div></aside>
        </article>`).join('') : '<div class="clean-empty">Nenhum formulário nessa pasta.</div>'}
        ${rows.length > preview.length ? `<div class="clean-empty">Mostrando ${preview.length} de ${rows.length}. Use Relatórios para exportar todos os formulários.</div>` : ''}
      </div>
    </section>`;
  }

  function manutencaoCardHtml(r, readOnly){
    const valid = validadeInfo(r.validade || r.validade_peca || r.validadePeca);
    const serv = r.tipo || r.tipo_peca || r.servico || 'Serviço de manutenção';
    const desc = normalizeCardText(r.descricao || r.obs || '');
    const origem = r.origem || r.origem_aba || '-';
    return `<article class="clean-record-card man-record-card" data-id="${esc(r.id)}">
      <div class="clean-record-main">
        <div class="clean-title-row"><span class="plate">${esc(r.placa || r.carro || '-')}</span>${tag(STATUS[r.status] || r.status || 'Concluído', statusClass(r.status || 'concluido'))}</div>
        <div class="clean-service">${esc(serv)}</div>
        <div class="clean-info-grid">
          <div class="clean-info"><span>Data</span><b>${esc(fmtDate(r.data))}</b></div>
          <div class="clean-info"><span>Origem</span><b title="${esc(origem)}">${esc(origem)}</b></div>
          <div class="clean-info"><span>Valor</span><b>${esc(brlKey('manutencoes', r))}</b></div>
          <div class="clean-info"><span>Validade</span><b>${esc((r.validade || r.validade_peca || r.validadePeca) ? fmtDate(r.validade || r.validade_peca || r.validadePeca) : 'Não informada')}</b></div>
        </div>
        <div class="clean-desc ${desc ? '' : 'empty-desc'}">${desc ? esc(desc) : 'Sem descrição cadastrada.'}</div>
      </div>
      <aside class="clean-card-side">
        <div class="row-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
        <div class="clean-note-box"><span class="tag ${valid.cls}">${esc(valid.text)}</span><small>${esc(valid.sub)}</small></div>
      </aside>
    </article>`;
  }

  function renderProducaoPastas(){
    const key = 'producao';
    const selected = state.filters[key].month || '';
    const day = state.filters.producao.day || '';
    const rows = folderRows(key, selected);
    const veiculos = new Set(rows.map(r=>r.placa||r.carro).filter(Boolean)).size;
    const responsaveis = new Set(rows.map(r=>r.responsavel||r.responsaveis).filter(Boolean)).size;
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="addFolderBtn" type="button">+ Pasta/mês</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo lançamento</button>`}
    `);
    $('#pageRoot').innerHTML = `
      <div class="clean-board prod-board">
        ${statsHtml([
          ['Lançamentos', rows.length, selected ? 'na pasta selecionada' : 'total filtrado'],
          ['Veículos', veiculos, 'envolvidos'],
          ['Responsáveis', responsaveis, 'com lançamento'],
          ['Selecionado', day ? fmtDate(day) : (selected ? monthLabel(selected) : 'Todos'), day ? 'pasta do dia' : 'pasta atual']
        ])}
        ${folderCardsHtml(key)}
        ${dayFoldersHtml(selected)}
        <div class="module-tools clean-tools"><input class="search" id="prodSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por placa, serviço, responsável, observação ou anexo..." /></div>
        <section class="clean-panel">
          <div class="clean-head"><h3>${esc(producaoTitle(selected, day))}</h3><small>${rows.length} registro${rows.length===1?'':'s'}</small></div>
          <div class="clean-card-list">${rows.length ? rows.map(r => producaoCardHtml(r, readOnly)).join('') : '<div class="clean-empty">Nenhuma produção encontrada com esse filtro.</div>'}</div>
        </section>
      </div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#addFolderBtn')?.addEventListener('click', () => openAddFolder(key, renderProducaoPastas));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#prodSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderProducaoPastas(); const input=$('#prodSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    bindFolderEvents(key, renderProducaoPastas);
    $$('.js-day-folder').forEach(btn => btn.addEventListener('click', () => { const d=btn.dataset.day||''; state.filters.producao.day = state.filters.producao.day === d ? '' : d; renderProducaoPastas(); }));
    bindCleanCardActions(key);
  }
  function producaoTitle(month, day){
    if(day) return `Produção do Dia — ${fmtDate(day)}`;
    if(month) return `Produção do Dia — ${monthLabel(month)}`;
    return 'Produção do Dia — Todos os meses';
  }
  function dayFoldersHtml(month, key='producao'){
    if(!month) return '<div class="day-hint">Selecione uma pasta/mês acima para ver as pastas por dia.</div>';
    const rows = (state.data[key] || []).filter(r => rowMonth(key, r) === month);
    const days = Array.from(new Set(rows.map(r=>String(r.data||'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)))).sort().reverse();
    if(!days.length) return '<div class="day-hint">Essa pasta ainda não tem dias lançados.</div>';
    const label = key === 'manutencoes' ? 'serviço' : 'lançamento';
    return `<section class="day-folders ${key === 'manutencoes' ? 'man-day-folders' : ''}"><div class="day-folders-head"><b>Pastas do dia — ${esc(monthLabel(month))}</b><small>Clique em uma data para filtrar os cards abaixo.</small></div><div class="day-grid">${days.map(d => {
      const dayRows = rows.filter(r=>String(r.data||'').slice(0,10)===d);
      const veic = new Set(dayRows.map(r=>r.placa||r.carro).filter(Boolean)).size;
      const total = key === 'manutencoes' ? sumMoney('manutencoes', dayRows) : 0;
      return `<button type="button" class="day-folder js-day-folder ${state.filters[key]?.day===d?'active':''}" data-day="${esc(d)}"><span>📅</span><strong>${esc(fmtDate(d))}<em>${dayRows.length}</em></strong><small>${dayRows.length} ${label}${dayRows.length===1?'':'s'} • ${veic} veículo${veic===1?'':'s'}${key === 'manutencoes' ? ' • ' + esc(brl(total)) : ''}</small></button>`;
    }).join('')}</div></section>`;
  }
  function producaoCardHtml(r, readOnly){
    const serv = r.servico || r.descricao || 'Serviço não informado';
    const obs = normalizeCardText(r.obs || r.observacao || '');
    const resp = r.responsavel || r.responsaveis || r.motorista || '-';
    const anexo = r.anexo || r.arquivo || r.comprovante || '';
    const mes = rowMonth('producao', r);
    return `<article class="clean-record-card prod-record-card" data-id="${esc(r.id)}">
      <div class="clean-record-main">
        <div class="clean-title-row"><span class="plate">${esc(r.placa || r.carro || '-')}</span><span class="tag gray">${esc(mes ? monthLabel(mes) : 'Sem pasta')}</span></div>
        <div class="clean-service">${esc(serv)}</div>
        <div class="clean-info-grid">
          <div class="clean-info"><span>Data</span><b>${esc(fmtDate(r.data))}</b></div>
          <div class="clean-info"><span>Pasta</span><b>${esc(mes ? monthLabel(mes) : '-')}</b></div>
          <div class="clean-info"><span>Responsável</span><b title="${esc(resp)}">${esc(resp)}</b></div>
          <div class="clean-info"><span>Anexo</span><b>${esc(anexo ? 'Com anexo' : 'Sem anexo')}</b></div>
        </div>
        <div class="clean-desc ${obs ? '' : 'empty-desc'}">${obs ? esc(obs) : 'Sem observação cadastrada.'}</div>
      </div>
      <aside class="clean-card-side">
        <div class="row-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
        <div class="clean-note-box"><span class="tag ${anexo?'green':'gray'}">${esc(anexo ? 'Com anexo' : 'Sem anexo')}</span><small>${esc(r.data ? 'Lançado em ' + fmtDate(r.data) : 'Sem data informada')}</small></div>
      </aside>
    </article>`;
  }


  function renderTacografosPastas(){
    const key = 'tacografos';
    const selected = state.filters[key].month || '';
    const rows = folderRows(key, selected);
    const vencidos = rows.filter(r=>daysUntil(r.data_validade||r.validade) < 0).length;
    const criticos = rows.filter(r=>{ const d=daysUntil(r.data_validade||r.validade); return d >= 0 && d <= 30; }).length;
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo tacógrafo</button>`}
    `);
    $('#pageRoot').innerHTML = `
      <div class="clean-board tac-board">
        ${statsHtml([
          ['Registros', rows.length, selected ? 'na pasta selecionada' : 'total filtrado'],
          ['Vencidos', vencidos, 'fora do prazo'],
          ['Atenção', criticos, 'até 30 dias'],
          ['Selecionado', selected ? monthLabel(selected) : 'Todos', 'pasta atual']
        ])}
        ${folderCardsHtml(key)}
        <div class="module-tools clean-tools"><input class="search" id="tacSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por placa, situação, validade ou observação..." /></div>
        <section class="clean-panel">
          <div class="clean-head"><h3>${esc(selected ? `Tacógrafos — ${monthLabel(selected)}` : 'Tacógrafos — Todos os meses')}</h3><small>${rows.length} registro${rows.length===1?'':'s'}</small></div>
          <div class="clean-card-list">${rows.length ? rows.map(r => tacografoCardHtml(r, readOnly)).join('') : '<div class="clean-empty">Nenhum tacógrafo encontrado com esse filtro.</div>'}</div>
        </section>
      </div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#tacSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderTacografosPastas(); const input=$('#tacSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    bindFolderEvents(key, renderTacografosPastas);
    bindCleanCardActions(key);
  }
  function tacografoCardHtml(r, readOnly){
    const valid = validadeInfo(r.data_validade || r.validade);
    const status = r.status || r.situacao || (valid.cls === 'red' ? 'vencido' : 'ativo');
    return `<article class="clean-record-card tac-record-card" data-id="${esc(r.id)}">
      <div class="clean-record-main">
        <div class="clean-title-row"><span class="plate">${esc(r.placa || '-')}</span>${tag(STATUS[status] || status || 'Ativo', statusClass(status))}</div>
        <div class="clean-service">Aferição / validade do tacógrafo</div>
        <div class="clean-info-grid">
          <div class="clean-info"><span>Emissão</span><b>${esc(fmtDate(r.data_emissao || r.data))}</b></div>
          <div class="clean-info"><span>Validade</span><b>${esc(fmtDate(r.data_validade || r.validade))}</b></div>
          <div class="clean-info"><span>Pasta</span><b>${esc(rowMonth('tacografos', r) ? monthLabel(rowMonth('tacografos', r)) : '-')}</b></div>
          <div class="clean-info"><span>Situação</span><b>${esc(STATUS[status] || status || '-')}</b></div>
        </div>
        <div class="clean-desc ${(normalizeCardText(r.obs||'') ? '' : 'empty-desc')}">${normalizeCardText(r.obs||'') ? esc(normalizeCardText(r.obs||'')) : 'Sem observação cadastrada.'}</div>
      </div>
      <aside class="clean-card-side">
        <div class="row-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
        <div class="clean-note-box"><span class="tag ${valid.cls}">${esc(valid.text)}</span><small>${esc(valid.sub)}</small></div>
      </aside>
    </article>`;
  }

  function renderOleoPastas(){
    const key = 'oleo';
    const selected = state.filters[key].month || '';
    const baseRows = folderRows(key, selected);
    const statusFilter = state.filters[key].prioridade || '';
    const rows = baseRows.filter(r => !statusFilter || oilSituationValue(r) === statusFilter);
    const ativas = baseRows.filter(r=>oilSituationValue(r)==='ativo').length;
    const verificar = baseRows.filter(r=>oilSituationValue(r)==='verificar').length;
    const vencidas = baseRows.filter(r=>oilSituationValue(r)==='vencido').length;
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Nova troca</button>`}
    `);
    $('#pageRoot').innerHTML = `
      <div class="clean-board oil-board">
        ${statsHtml([
          ['Trocas', rows.length, statusFilter ? 'no filtro selecionado' : (selected ? 'na pasta selecionada' : 'total filtrado')],
          ['Ativas', ativas, 'em dia'],
          ['Verificar', verificar, 'último mês antes do vencimento'],
          ['Vencidas', vencidas, 'fora do prazo']
        ])}
        ${folderCardsHtml(key)}
        <div class="module-tools clean-tools"><input class="search" id="oleoSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por placa, modelo, tipo, KM ou observação..." /><select class="select" id="oleoPriorityFilter"><option value="">Todos</option><option value="ativo" ${statusFilter==='ativo'?'selected':''}>Ativo (${ativas})</option><option value="verificar" ${statusFilter==='verificar'?'selected':''}>Verificar (${verificar})</option><option value="vencido" ${statusFilter==='vencido'?'selected':''}>Vencido (${vencidas})</option></select></div>
        <section class="clean-panel">
          <div class="clean-head"><h3>${esc(selected ? `Troca de Óleo — ${monthLabel(selected)}` : 'Troca de Óleo — Todos os meses')}</h3><small>${rows.length} registro${rows.length===1?'':'s'}</small></div>
          <div class="clean-card-list">${rows.length ? rows.map(r => oleoCardHtml(r, readOnly)).join('') : '<div class="clean-empty">Nenhuma troca de óleo encontrada com esse filtro.</div>'}</div>
        </section>
      </div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#oleoSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderOleoPastas(); const input=$('#oleoSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    $('#oleoPriorityFilter')?.addEventListener('change', ev => { state.filters[key].prioridade = ev.target.value; renderOleoPastas(); });
    bindFolderEvents(key, renderOleoPastas);
    bindCleanCardActions(key);
  }
  function oleoCardHtml(r, readOnly){
    const deadline = oilStatus(r);
    const situation = oilSituation(r);
    const tipo = r.tipo || 'Motor';
    const dataTroca = r.data_ultima_troca || r.data;
    const validade = oilValidityDate(r);
    const kmAtual = r.km_ultima_vistoria || r.km || '';
    const kmProx = r.km_proxima_troca || r.proxkm || r.proxKm || '';
    const kmFaltando = r.km_faltando || (toNum(kmProx) && toNum(kmAtual) ? toNum(kmProx)-toNum(kmAtual) : '');
    return `<article class="clean-record-card oil-record-card status-${situation.cls}" data-id="${esc(r.id)}">
      <div class="clean-record-main">
        <div class="clean-title-row"><span class="plate">${esc(r.placa || '-')}</span>${tag(tipo, 'blue')}${tag(situation.label, situation.cls)}</div>
        <div class="clean-service">${esc(r.modelo || 'Controle de troca de óleo')}</div>
        <div class="clean-info-grid">
          <div class="clean-info"><span>Tipo</span><b>${esc(tipo)}</b></div>
          <div class="clean-info"><span>Situação</span><b>${esc(situation.label)}</b></div>
          <div class="clean-info"><span>Validade</span><b>${esc(validade ? fmtDate(validade) : 'Não informada')}</b></div>
          <div class="clean-info"><span>Prazo</span><b>${esc(deadline.text)}</b></div>
          <div class="clean-info"><span>Última troca</span><b>${esc(fmtDate(dataTroca))}</b></div>
          <div class="clean-info"><span>KM atual</span><b>${esc(kmAtual || '-')}</b></div>
          <div class="clean-info"><span>Próxima KM</span><b>${esc(kmProx || '-')}</b></div>
          <div class="clean-info"><span>KM faltando</span><b>${esc(kmFaltando || '-')}</b></div>
        </div>
        <div class="clean-desc ${(normalizeCardText(r.obs||'') ? '' : 'empty-desc')}">${normalizeCardText(r.obs||'') ? esc(normalizeCardText(r.obs||'')) : 'Sem observação cadastrada.'}</div>
      </div>
      <aside class="clean-card-side">
        <div class="row-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
        <div class="clean-note-box"><span class="tag ${situation.cls}">${esc(situation.label)}</span><small>${esc(deadline.sub || (dataTroca ? 'Base: ' + fmtDate(dataTroca) : 'Sem data informada'))}</small></div>
      </aside>
    </article>`;
  }


  function renderMotoristasDetalhado(){
    const key = 'motoristas';
    const rows = filterRows(key);
    const readOnly = isReadOnly();
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button><button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo motorista</button>`}`);
    $('#pageRoot').innerHTML = `
      ${statsHtml(byKey[key].stats(rows))}
      <div class="module-tools clean-tools">
        <input class="search" id="motSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por nome, CPF, CNH, função ou departamento..." />
        <span class="seed-note">Dados antigos usados como apoio quando o Supabase está incompleto</span>
      </div>
      <div class="driver-card-grid">${rows.length ? rows.map(r=>motoristaCardHtml(r, readOnly)).join('') : '<div class="clean-empty">Nenhum motorista encontrado.</div>'}</div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#motSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderMotoristasDetalhado(); const input=$('#motSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    bindCleanCardActions(key);
  }
  function motoristaCardHtml(r, readOnly){
    const initials = String(r.nome||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'M';
    const points45 = pointsLastDaysForDriver(r, 45);
    return `<article class="person-card" data-id="${esc(r.id)}">
      <div class="person-avatar">${esc(initials)}</div>
      <div><h3>${esc(r.nome || '-')}</h3><span class="person-role">${esc(r.funcao || 'Motorista')}</span><span class="person-dept">${esc(r.departamento || 'Sem departamento')}</span></div>
      ${window.EficienciaFrota?.driverBadgeHtml?.(r.nome) || ''}
      <div class="person-points-45 ${points45 > 0 ? 'has-points' : 'no-points'}"><span>Pontos nos últimos 45 dias</span><strong>${esc(points45)}</strong><small>${points45 === 1 ? 'ponto' : 'pontos'}</small></div>
      <div class="person-details">
        <div class="person-detail"><span>CPF</span><b>${esc(r.cpf || '-')}</b></div>
        <div class="person-detail"><span>CNH</span><b>${esc(r.cnh || '-')}</b></div>
        <div class="person-detail"><span>Categoria</span><b>${esc(r.categoria || '-')}</b></div>
        <div class="person-detail"><span>Validade</span><b>${esc(fmtDate(r.validade || r.venc_cnh))}</b></div>
        <div class="person-detail"><span>Primeiro dia</span><b>${esc(fmtDate(r.primeiro_dia))}</b></div>
        <div class="person-detail"><span>Status</span><b>${esc(STATUS[r.status] || r.status || 'Ativo')}</b></div>
      </div>
      <div class="person-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
    </article>`;
  }

  function renderVeiculosDetalhado(){
    const key = 'veiculos';
    const rows = filterRows(key);
    const readOnly = isReadOnly();
    const parados = rows.filter(isVeiculoParado);
    const ativos = rows.filter(r => !isVeiculoParado(r));
    const stats = [
      ['Veículos', rows.length, 'cadastrados'],
      ['Ativos', ativos.length, 'em operação'],
      ['Parados', parados.length, 'manutenção/inativos'],
      ['Com motorista', rows.filter(r=>r.motorista).length, 'vinculados']
    ];
    const statusValues = uniqueValues(key, 'status');
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button><button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo veículo</button>`}`);
    $('#pageRoot').innerHTML = `
      ${statsHtml(stats)}
      <div class="module-tools clean-tools">
        <input class="search" id="veiSearch" value="${esc(state.filters[key].search||'')}" autocomplete="off" placeholder="Buscar por placa, RENAVAM, modelo, motorista, status ou motivo..." />
        ${statusValues.length ? `<select class="select" id="veiStatusFilter"><option value="">Todos os status</option>${statusValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].status===v?'selected':''}>${esc(STATUS[v]||v)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="vehicle-table-board">
        ${vehicleTableSection('Veículos parados / em manutenção', parados, 'parados', readOnly)}
        ${vehicleTableSection('Veículos ativos', ativos, 'ativos', readOnly)}
      </div>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#veiSearch')?.addEventListener('input', ev => { const pos=ev.target.selectionStart||ev.target.value.length; state.filters[key].search = ev.target.value; renderVeiculosDetalhado(); const input=$('#veiSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    $('#veiStatusFilter')?.addEventListener('change', ev => { state.filters[key].status = ev.target.value; renderVeiculosDetalhado(); });
    $$('.js-h360').forEach(btn => btn.addEventListener('click', ev => { ev.stopPropagation(); openHistorico360(btn.dataset.plate); }));
    $$('.js-vehicle-row-open').forEach(row => row.addEventListener('click', ev => {
      if(ev.target.closest('.row-actions')) return;
      openHistorico360(row.dataset.plate);
    }));
    $$('.js-edit').forEach(btn => btn.addEventListener('click', () => openModal(key, btn.dataset.id)));
    $$('.js-delete').forEach(btn => btn.addEventListener('click', () => deleteRecord(key, btn.dataset.id)));
    $$('.js-qr-veiculo').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openVeiculoQrModal(btn.dataset.id); }));
  }

  function isVeiculoParado(r){
    const st = clean(r.status || r.situacao || r.estado || '');
    const mot = clean(r.motivo || r.obs || r.observacao || '');
    if(st.includes('inativ') || st.includes('manut') || st.includes('parad') || st.includes('oficina') || st.includes('sinistro') || st.includes('baix')) return true;
    if(!st && (mot.includes('manut') || mot.includes('parad') || mot.includes('oficina') || mot.includes('sinistro') || mot.includes('baix'))) return true;
    return false;
  }

  function vehicleTableSection(title, rows, kind, readOnly){
    const empty = kind === 'parados' ? 'Nenhum veículo parado ou em manutenção.' : 'Nenhum veículo ativo encontrado.';
    return `<section class="vehicle-table-section ${kind}">
      <div class="vehicle-section-head"><div><h3>${esc(title)}</h3><small>${rows.length} veículo${rows.length===1?'':'s'}</small></div></div>
      ${rows.length ? `<div class="table-card vehicle-table-card"><div class="table-wrap"><table class="data-table vehicle-data-table"><thead><tr><th>Placa</th><th>Modelo</th><th>Ano</th><th>RENAVAM</th><th>Motorista</th><th>Status</th><th>Motivo/Observação</th><th>Ações</th></tr></thead><tbody>${rows.map(r=>vehicleTableRow(r, readOnly)).join('')}</tbody></table></div></div>` : `<div class="clean-empty">${esc(empty)}</div>`}
    </section>`;
  }

  function vehicleTableRow(r, readOnly){
    const st = r.status || r.situacao || 'ativo';
    const motivo = r.motivo || r.obs || r.observacao || '';
    const placaVal = r.placa || r.carro || '';
    return `<tr class="js-vehicle-row-open ${isVeiculoParado(r)?'vehicle-row-stopped':'vehicle-row-active'}" data-plate="${esc(placaVal)}" title="Abrir Central 360°">
      <td>${plate(placaVal)}</td>
      <td><b>${esc(r.modelo || '-')}</b></td>
      <td>${esc(r.ano || '-')}</td>
      <td><span class="renavam-value">${esc(r.renavam || '-')}</span></td>
      <td>${esc(r.motorista || '-')}</td>
      <td>${tag(STATUS[st] || st || 'Ativo', isVeiculoParado(r) ? 'red' : 'green')}${window.EficienciaFrota?.vehicleBadgeHtml?.(placaVal) || ''}</td>
      <td><div class="desc vehicle-desc">${esc(motivo || '-')}</div></td>
      <td><div class="row-actions"><button class="icon-btn js-h360" data-plate="${esc(placaVal)}" type="button" title="Abrir Central 360°">360°</button><button class="icon-btn js-qr-veiculo" data-id="${esc(r.id)}" type="button" title="QR Code de Chamados">🔳</button><button class="icon-btn js-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div></td>
    </tr>`;
  }

  function veiculoCardHtml(r, readOnly){
    const st = r.status || 'ativo';
    const mot = r.motivo || r.obs || '';
    return `<article class="vehicle-card" data-id="${esc(r.id)}">
      <div class="vehicle-avatar">🚚</div>
      <div><h3>${plate(r.placa || r.carro || '')} ${esc(r.modelo || '')}</h3><span class="vehicle-role">${esc(STATUS[st] || st || 'Ativo')}</span><span class="vehicle-dept">${esc(r.motorista || 'Sem vínculo')}</span></div>
      <div class="vehicle-details">
        <div class="vehicle-detail"><span>Placa</span><b>${esc(r.placa || r.carro || '-')}</b></div>
        <div class="vehicle-detail"><span>Modelo</span><b>${esc(r.modelo || '-')}</b></div>
        <div class="vehicle-detail"><span>Ano</span><b>${esc(r.ano || '-')}</b></div>
        <div class="vehicle-detail"><span>RENAVAM</span><b>${esc(r.renavam || '-')}</b></div>
        <div class="vehicle-detail"><span>Motorista</span><b>${esc(r.motorista || '-')}</b></div>
        <div class="vehicle-detail"><span>Motivo</span><b title="${esc(mot)}">${esc(mot || '-')}</b></div>
      </div>
      <div class="vehicle-actions"><button class="icon-btn js-clean-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-clean-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div>
    </article>`;
  }

  const BRAT_BUCKET = 'brat-arquivos';

  function splitBratLines(value){
    return String(value || '').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  }
  function parseBratJson(value){
    if(Array.isArray(value)) return value;
    if(!value) return [];
    try{ const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }catch(e){ return []; }
  }
  function bratFileKind(name='', mime=''){
    const n = clean(name);
    const m = clean(mime);
    if(m.startsWith('image') || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i.test(n)) return 'foto';
    if(m.startsWith('video') || /\.(mp4|mov|avi|mkv|webm|3gp|mpeg|mpg)$/i.test(n)) return 'video';
    if(m.includes('pdf') || /\.pdf$/i.test(n)) return 'pdf';
    if(m.startsWith('audio') || /\.(mp3|wav|m4a|ogg|aac)$/i.test(n)) return 'audio';
    return 'documento';
  }
  function bratFileIcon(kind){
    return {foto:'🖼️',video:'🎥',pdf:'📄',audio:'🎧',documento:'📎'}[kind] || '📎';
  }
  function safeBratFileName(value){
    const raw = String(value || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const cleanName = raw.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
    return (cleanName || 'arquivo').slice(-180);
  }
  function formatBratBytes(value){
    const n = Number(value || 0);
    if(!Number.isFinite(n) || n <= 0) return 'Tamanho não informado';
    const units=['B','KB','MB','GB']; let size=n, i=0;
    while(size>=1024 && i<units.length-1){ size/=1024; i++; }
    return `${size >= 10 || i === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[i]}`;
  }
  function bratRecordTitle(row){
    const r = row || {};
    const explicit = String(r.titulo || r.nome || '').trim();
    if(explicit) return explicit;
    const who = String(r.motorista || '').trim();
    const number = String(r.numero_brat || '').trim();
    if(who) return `BRAT - ${who}`;
    if(number) return `BRAT - ${number}`;
    if(r.placa) return `BRAT - ${r.placa}`;
    return 'BRAT - Ocorrência';
  }
  function normalizeBratFile(file){
    const f = file || {};
    const name = String(f.nome_original || f.nome || f.name || f.filename || f.storage_path || f.caminho_storage || f.path || 'arquivo').trim();
    const mime = String(f.mime_type || f.type || f.mime || '').trim();
    return {
      id:f.id ?? null,
      brat_id:Number(f.brat_id || f.bratId || 0),
      nome_original:name,
      storage_path:String(f.storage_path || f.caminho_storage || f.path || f.url || '').trim(),
      url:String(f.url || f.public_url || f.publicUrl || f.caminho_storage || f.storage_path || '').trim(),
      mime_type:mime,
      tamanho:Number(f.tamanho || f.size_bytes || f.size || 0),
      categoria:String(f.categoria || f.kind || f.tipo || bratFileKind(name,mime)),
      pasta_relativa:String(f.pasta_relativa || f.relative_path || '').trim(),
      created_at:f.created_at || null,
      legacy:!!f.legacy
    };
  }
  function legacyBratFilesFromRows(rows){
    const out=[];
    (rows || []).forEach(row=>{
      const meta=parseBratJson(row.arquivos_json);
      const names=splitBratLines(row.arquivos);
      const known=new Set();
      meta.forEach((item,index)=>{
        const f=normalizeBratFile({...item,brat_id:row.id,id:item.id || `legacy-${row.id}-${index}`,legacy:true});
        if(f.nome_original){ known.add(f.nome_original); out.push(f); }
      });
      names.forEach((name,index)=>{
        if(known.has(name)) return;
        out.push(normalizeBratFile({id:`listed-${row.id}-${index}`,brat_id:row.id,nome_original:name,categoria:bratFileKind(name,''),legacy:true}));
      });
    });
    return out;
  }
  function bratFileNameKey(value){
    return String(value || '').trim().toLocaleLowerCase('pt-BR');
  }
  function bratFileReferenceKey(file){
    const f=normalizeBratFile(file);
    const folder=String(f.pasta_relativa || '').trim().replace(/^\/+|\/+$/g,'').toLocaleLowerCase('pt-BR');
    const name=bratFileNameKey(f.nome_original);
    const path=String(f.storage_path || '').trim().toLocaleLowerCase('pt-BR');
    return {folder,name,path,full:folder?`${folder}/${name}`:name};
  }
  function sameBratFileReference(a,b){
    const left=bratFileReferenceKey(a), right=bratFileReferenceKey(b);
    if(left.path && right.path && left.path===right.path) return true;
    if(left.full && right.full && left.full===right.full) return true;
    return !!(left.name && right.name && left.name===right.name && (!left.folder || !right.folder));
  }
  function removeBratFileFromLegacyRow(row,file){
    const current=row || {};
    const names=splitBratLines(current.arquivos).filter(value=>{
      const clean=String(value || '').trim();
      const parts=clean.split('/').filter(Boolean);
      const name=parts.pop() || clean;
      const folder=parts.join('/');
      return !sameBratFileReference({nome_original:name,pasta_relativa:folder},file);
    });
    const meta=parseBratJson(current.arquivos_json).filter(item=>!sameBratFileReference(item,file));
    // Bancos antigos possuem `arquivos_json` com NOT NULL. Use valores vazios
    // válidos em vez de null para que a exclusão não gere um falso erro depois
    // de o arquivo já ter sido removido da tabela/Storage.
    const payload={arquivos:names.join('\n') || ''};
    if(Object.prototype.hasOwnProperty.call(current,'arquivos_json')) payload.arquivos_json=JSON.stringify(meta);
    return payload;
  }
  function dedupeBratFiles(files){
    const list=(files || []).map(normalizeBratFile);
    const byExact=new Map();
    list.forEach(file=>{
      const exact=file.storage_path
        ? `path:${file.brat_id}|${file.storage_path}`
        : `name:${file.brat_id}|${bratFileNameKey(file.nome_original)}|${Number(file.tamanho || 0)}`;
      const current=byExact.get(exact);
      if(!current || (current.legacy && !file.legacy)) byExact.set(exact,file);
    });
    const result=[];
    const remoteNames=new Set(
      Array.from(byExact.values())
        .filter(file=>!file.legacy)
        .map(file=>`${file.brat_id}|${bratFileNameKey(file.nome_original)}`)
    );
    Array.from(byExact.values()).forEach(file=>{
      const nameKey=`${file.brat_id}|${bratFileNameKey(file.nome_original)}`;
      if(file.legacy && remoteNames.has(nameKey)) return;
      result.push(file);
    });
    return result;
  }
  function bratFilesFor(bratId){
    const id=String(bratId || '');
    return dedupeBratFiles(state.bratFiles || []).filter(f=>String(f.brat_id)===id);
  }
  function bratCounts(row){
    const files=bratFilesFor(row.id);
    // Depois que a listagem de anexos foi carregada, ela é a fonte de verdade,
    // inclusive quando o resultado é zero. Assim os contadores antigos da linha
    // do BRAT não continuam exibindo arquivos que já foram excluídos.
    if(state.bratFilesLoaded || files.length){
      return {
        total:files.length,
        fotos:files.filter(f=>f.categoria==='foto').length,
        videos:files.filter(f=>f.categoria==='video').length,
        pdfs:files.filter(f=>f.categoria==='pdf').length,
        outros:files.filter(f=>!['foto','video','pdf'].includes(f.categoria)).length
      };
    }
    return {
      total:toNum(row.qtd_arquivos) || toNum(row.qtd_fotos)+toNum(row.qtd_videos)+toNum(row.qtd_pdfs),
      fotos:toNum(row.qtd_fotos), videos:toNum(row.qtd_videos), pdfs:toNum(row.qtd_pdfs), outros:0
    };
  }
  async function loadBratFiles(opts={}){
    const db=connect();
    const legacy=legacyBratFilesFromRows(state.data.brat || []);
    if(!db){ state.bratFiles=legacy; state.bratFilesLoaded=true; return state.bratFiles; }
    try{
      let res=await db.from('brat_arquivos').select('*').is('deleted_at',null).order('created_at',{ascending:true}).limit(CFG.pageSize || 5000);
      if(res.error && missingColumn(res.error)==='deleted_at') res=await db.from('brat_arquivos').select('*').order('created_at',{ascending:true}).limit(CFG.pageSize || 5000);
      if(res.error) throw res.error;
      const remote=(res.data || []).map(normalizeBratFile);
      // O campo textual `brats.arquivos` existe por compatibilidade. Quando o mesmo
      // anexo já está na tabela brat_arquivos, a entrada legada não pode virar um
      // segundo arquivo na interface ou nos contadores.
      state.bratFiles=dedupeBratFiles(remote.concat(legacy));
      state.bratFilesLoaded=true;
      if(!opts.silent && state.current==='brat') renderBrat();
      return state.bratFiles;
    }catch(e){
      console.warn('Arquivos BRAT indisponíveis:',e);
      state.bratFiles=legacy;
      state.bratFilesLoaded=true;
      return state.bratFiles;
    }
  }
  function bratStatusLabel(value){
    const s=String(value || 'em_analise');
    return STATUS[s] || {aberto:'Aberto',aguardando_docs:'Aguardando documentos'}[s] || s;
  }
  function bratCardHtml(row,readOnly){
    const counts=bratCounts(row);
    const description=normalizeCardText(row.descricao || row.obs || '') || 'Descrição não informada.';
    return `<article class="brat-card" data-id="${esc(row.id)}">
      <div class="brat-card-head">
        <div class="brat-card-title"><span class="brat-card-icon">🚨</span><div><h3>${esc(bratRecordTitle(row))}</h3><small>${esc(fmtDate(row.data))}${row.local ? ` • ${esc(row.local)}` : ''}</small></div></div>
        ${tag(bratStatusLabel(row.status),statusClass(row.status))}
      </div>
      <div class="brat-card-identification">
        ${row.placa ? plate(row.placa) : '<span class="tag gray">Sem placa</span>'}
        <span><b>${esc(row.motorista || 'Motorista não informado')}</b><small>${esc(row.numero_brat || row.tipo || 'Número do BRAT não informado')}</small></span>
      </div>
      <p class="brat-card-description">${esc(description)}</p>
      <div class="brat-file-summary" aria-label="Resumo dos arquivos">
        <span><b>${counts.total}</b> arquivos</span><span>🖼️ ${counts.fotos}</span><span>🎥 ${counts.videos}</span><span>📄 ${counts.pdfs}</span>${counts.outros?`<span>📎 ${counts.outros}</span>`:''}
      </div>
      <div class="brat-card-actions">
        <button class="btn compact js-brat-files" data-id="${esc(row.id)}" type="button">Ver arquivos</button>
        <button class="btn compact js-brat-download" data-id="${esc(row.id)}" type="button" ${counts.total?'':'disabled'}>Baixar pasta</button>
        ${readOnly?'':`<button class="icon-btn js-brat-edit" data-id="${esc(row.id)}" type="button" title="Editar ocorrência">✎</button><button class="icon-btn danger js-brat-delete admin-only" data-id="${esc(row.id)}" type="button" title="Excluir ocorrência">×</button>`}
      </div>
    </article>`;
  }
  function renderBrat(){
    const cfg=byKey.brat;
    const readOnly=isReadOnly();
    const f=state.filters.brat || {};
    const q=clean(f.search || '');
    const rows=(state.data.brat || []).filter(r=>{
      if(f.month && (r.mes || ym(r.data))!==f.month) return false;
      if(f.status && String(r.status || '')!==String(f.status)) return false;
      if(q){
        const fileText=bratFilesFor(r.id).map(x=>x.nome_original).join(' ');
        if(!clean(Object.values(r).join(' ')+' '+fileText).includes(q)) return false;
      }
      return true;
    }).sort((a,b)=>String(b.data || '').localeCompare(String(a.data || '')) || Number(b.id || 0)-Number(a.id || 0));
    const all=state.data.brat || [];
    const totalFiles=all.reduce((sum,r)=>sum+bratCounts(r).total,0);
    const months=getMonths('brat');
    const statuses=uniqueValues('brat','status');
    setActions(`<button class="btn" id="refreshBratBtn" type="button">Atualizar</button><button class="btn" id="exportBratCsv" type="button">Exportar CSV</button><button class="btn" id="exportBratPdf" type="button">Exportar PDF</button>${readOnly?'':`<button class="btn primary admin-only" id="newBratBtn" type="button">+ Registrar ocorrência</button>`}`);
    $('#pageRoot').innerHTML=`
      ${statsHtml([['Ocorrências',all.length,'registradas'],['Em acompanhamento',all.filter(r=>!finalStatus('brat',r)).length,'abertas'],['Arquivos salvos',totalFiles,'disponíveis em outros PCs'],['Com anexos',all.filter(r=>bratCounts(r).total>0).length,'pastas digitais']])}
      <section class="brat-intro"><div><span class="report-eyebrow">Arquivo digital de ocorrências</span><h3>BRAT, fotos, vídeos e documentos no mesmo lugar</h3><p>Registre manualmente o ocorrido e envie os arquivos para o Supabase. Depois, qualquer computador autorizado pode consultar ou baixar a pasta completa.</p></div><div class="brat-cloud-badge"><b>Supabase</b><span>salvamento centralizado</span></div></section>
      <div class="module-tools brat-tools"><input class="search" id="bratSearch" value="${esc(f.search || '')}" placeholder="Buscar por nome, motorista, placa, número ou arquivo..."/><select class="select" id="bratMonth"><option value="">Todos os meses</option>${months.map(m=>`<option value="${esc(m)}" ${f.month===m?'selected':''}>${esc(monthLabel(m))}</option>`).join('')}</select><select class="select" id="bratStatus"><option value="">Todos os status</option>${statuses.map(v=>`<option value="${esc(v)}" ${f.status===v?'selected':''}>${esc(bratStatusLabel(v))}</option>`).join('')}</select></div>
      ${rows.length?`<div class="brat-grid">${rows.map(r=>bratCardHtml(r,readOnly)).join('')}</div>`:`<div class="empty brat-empty"><strong>Nenhuma ocorrência encontrada.</strong><span>Use “Registrar ocorrência” para criar uma pasta digital de BRAT.</span></div>`}
    `;
    $('#refreshBratBtn')?.addEventListener('click',async()=>{ await loadModule('brat',{silent:true}); await loadBratFiles(); renderNav(); toast('BRAT atualizado.'); });
    $('#exportBratCsv')?.addEventListener('click',()=>exportCsv('brat',rows));
    $('#exportBratPdf')?.addEventListener('click',()=>exportPdf('brat',rows));
    $('#newBratBtn')?.addEventListener('click',()=>openBratModal());
    $('#bratSearch')?.addEventListener('input',ev=>{ const pos=ev.target.selectionStart || ev.target.value.length; state.filters.brat.search=ev.target.value; renderBrat(); const input=$('#bratSearch'); if(input){input.focus(); try{input.setSelectionRange(pos,pos);}catch(e){}} });
    $('#bratMonth')?.addEventListener('change',ev=>{state.filters.brat.month=ev.target.value;renderBrat();});
    $('#bratStatus')?.addEventListener('change',ev=>{state.filters.brat.status=ev.target.value;renderBrat();});
    $$('.js-brat-files').forEach(btn=>btn.addEventListener('click',()=>openBratFilesModal(btn.dataset.id)));
    $$('.js-brat-download').forEach(btn=>btn.addEventListener('click',()=>downloadBratFolder(btn.dataset.id,btn)));
    $$('.js-brat-edit').forEach(btn=>btn.addEventListener('click',()=>openBratModal(btn.dataset.id)));
    $$('.js-brat-delete').forEach(btn=>btn.addEventListener('click',()=>deleteRecord('brat',btn.dataset.id)));
  }
  function setBratModalButtons(saveLabel='Salvar ocorrência',cancelLabel='Cancelar'){
    const save=$('#modalSave'), cancel=$('#modalCancel');
    if(save){ save.textContent=saveLabel; save.disabled=false; save.hidden=false; }
    if(cancel){ cancel.textContent=cancelLabel; cancel.disabled=false; cancel.hidden=false; }
  }
  function bratExistingFilesHtml(row){
    const files=bratFilesFor(row.id);
    if(!files.length) return '<div class="brat-existing-empty">Nenhum arquivo salvo nesta ocorrência.</div>';
    return `<div class="brat-existing-files">${files.slice(0,8).map(f=>`<span title="${esc(f.nome_original)}">${bratFileIcon(f.categoria)} ${esc(f.nome_original)}</span>`).join('')}${files.length>8?`<span>+ ${files.length-8} arquivo(s)</span>`:''}</div>`;
  }
  function openBratModal(id){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    state.bratPendingFiles=[];
    const found=id?(state.data.brat || []).find(r=>String(r.id)===String(id)):null;
    const row={id:found?.id || makeId(),data:found?.data || new Date().toISOString().slice(0,10),titulo:found?.titulo || '',placa:found?.placa || '',motorista:found?.motorista || '',numero_brat:found?.numero_brat || '',tipo:found?.tipo || 'BRAT / Ocorrência',status:found?.status || 'em_analise',local:found?.local || '',descricao:found?.descricao || '',obs:found?.obs || ''};
    state.modal={key:'brat',custom:'brat',id:id || null,row:{...row}};
    $('#modalTitle').textContent=id?'Editar ocorrência / BRAT':'Registrar ocorrência / BRAT';
    $('#modalForm').innerHTML=`<div class="brat-modal-grid">
      <label class="field wide"><span>Nome da pasta/ocorrência</span><input name="titulo" id="bratTitleInput" value="${esc(row.titulo)}" placeholder="Exemplo: BRAT (nome)" required/><small>Este será o nome usado na listagem e no arquivo ZIP.</small></label>
      <label class="field"><span>Data da ocorrência</span><input name="data" type="date" value="${esc(row.data)}" required/></label>
      <label class="field"><span>Status</span><select name="status"><option value="aberto" ${row.status==='aberto'?'selected':''}>Aberto</option><option value="em_analise" ${row.status==='em_analise'?'selected':''}>Em análise</option><option value="pendente" ${row.status==='pendente'?'selected':''}>Pendente</option><option value="aguardando_docs" ${row.status==='aguardando_docs'?'selected':''}>Aguardando documentos</option><option value="concluido" ${row.status==='concluido'?'selected':''}>Concluído</option></select></label>
      <label class="field"><span>Placa</span><input name="placa" value="${esc(row.placa)}" placeholder="ABC1D23"/></label>
      <label class="field"><span>Motorista</span><input name="motorista" id="bratDriverInput" value="${esc(row.motorista)}" placeholder="Nome do motorista"/></label>
      <label class="field"><span>Número do BRAT</span><input name="numero_brat" value="${esc(row.numero_brat)}"/></label>
      <label class="field"><span>Tipo</span><input name="tipo" value="${esc(row.tipo)}" placeholder="BRAT, acidente, colisão..."/></label>
      <label class="field wide"><span>Local</span><input name="local" value="${esc(row.local)}" placeholder="Local da ocorrência"/></label>
      <label class="field wide"><span>Descrição do ocorrido</span><textarea name="descricao" rows="5" placeholder="Descreva a ocorrência, danos, envolvidos e providências tomadas...">${esc(row.descricao)}</textarea></label>
      <label class="field wide"><span>Observações complementares</span><textarea name="obs" rows="3">${esc(row.obs)}</textarea></label>
      <div class="field wide brat-upload-field"><span>Adicionar arquivos</span><div class="brat-upload-options"><label class="brat-upload-button"><b>Selecionar arquivos</b><small>Fotos, vídeos, PDFs, áudios e documentos</small><input id="bratFilesInput" type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"/></label><label class="brat-upload-button"><b>Selecionar uma pasta</b><small>Envia todos os arquivos contidos nela</small><input id="bratFolderInput" type="file" multiple/></label></div><div id="bratPendingFiles" class="brat-pending-files"><span>Nenhum arquivo novo selecionado.</span></div><div id="bratUploadFeedback" class="brat-upload-feedback" hidden></div><small class="brat-storage-note">Os arquivos serão enviados ao Supabase e continuarão disponíveis mesmo que sejam apagados deste computador.</small></div>
      <div class="field wide" id="bratExistingFilesSection" ${id?'':'hidden'}><span>Arquivos já salvos</span><div id="bratExistingFilesContent">${id?bratExistingFilesHtml(row):''}</div></div>
    </div>`;
    const folder=$('#bratFolderInput'); if(folder){ folder.setAttribute('webkitdirectory',''); folder.setAttribute('directory',''); }
    const title=$('#bratTitleInput'), driver=$('#bratDriverInput');
    driver?.addEventListener('input',()=>{ if(title && (!title.value.trim() || title.dataset.auto==='1')){ title.value=driver.value.trim()?`BRAT - ${driver.value.trim()}`:''; title.dataset.auto='1'; } });
    title?.addEventListener('input',()=>{ title.dataset.auto='0'; });
    const queueFiles=input=>{
      clearBratUploadFeedback();
      appendBratPendingFiles(input?.files || []);
      if(input) input.value='';
      renderBratPendingFiles();
    };
    $('#bratFilesInput')?.addEventListener('change',ev=>queueFiles(ev.currentTarget));
    folder?.addEventListener('change',ev=>queueFiles(ev.currentTarget));
    setBratModalButtons(id?'Salvar alterações':'Salvar ocorrência');
    $('#modalBg .modal')?.classList.add('brat-modal-shell');
    $('#modalBg').classList.add('open'); $('#modalBg').setAttribute('aria-hidden','false');
  }
  function bratPendingRelativePath(file){
    const raw=String(file?.webkitRelativePath || file?.relativePath || '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
    if(!raw) return String(file?.name || '').trim();
    const parts=raw.split('/').filter(Boolean);
    // O nome da pasta raiz muda conforme o computador/navegador. Para a
    // deduplicação, preservamos as subpastas e ignoramos apenas essa raiz.
    if(parts.length>1) parts.shift();
    return parts.join('/') || String(file?.name || '').trim();
  }
  function bratPendingFileKey(file){
    const f=file || {};
    const path=bratPendingRelativePath(f).toLowerCase();
    return `${path}|${Number(f.size || 0)}|${Number(f.lastModified || 0)}|${String(f.type || '').toLowerCase()}`;
  }
  function dedupeBratPendingFiles(fileList){
    const unique=new Map();
    Array.from(fileList || []).forEach(file=>{
      const key=bratPendingFileKey(file);
      if(!unique.has(key)) unique.set(key,file);
    });
    return Array.from(unique.values());
  }
  function appendBratPendingFiles(fileList){
    state.bratPendingFiles=dedupeBratPendingFiles([...(state.bratPendingFiles || []),...Array.from(fileList || [])]);
    return state.bratPendingFiles;
  }
  function selectedBratFiles(){
    state.bratPendingFiles=dedupeBratPendingFiles(state.bratPendingFiles || []);
    return Array.from(state.bratPendingFiles);
  }
  function removeBratPendingFile(key){
    state.bratPendingFiles=(state.bratPendingFiles || []).filter(file=>bratPendingFileKey(file)!==key);
    renderBratPendingFiles();
  }
  function renderBratPendingFiles(){
    const box=$('#bratPendingFiles'); if(!box) return;
    const files=selectedBratFiles();
    if(!files.length){ box.innerHTML='<span>Nenhum arquivo novo selecionado.</span>'; return; }
    const total=files.reduce((n,f)=>n+Number(f.size || 0),0);
    box.innerHTML=`<div class="brat-pending-head"><strong>${files.length} arquivo(s) na fila • ${formatBratBytes(total)}</strong><small>Você pode selecionar arquivos várias vezes; os novos serão adicionados à lista.</small></div><div class="brat-pending-list">${files.map(f=>{const key=bratPendingFileKey(f);return `<div class="brat-pending-item"><span title="${esc(f.webkitRelativePath || f.name)}">${bratFileIcon(bratFileKind(f.name,f.type))} ${esc(f.webkitRelativePath || f.name)}</span><button type="button" class="icon-btn danger js-brat-pending-remove" data-key="${esc(key)}" title="Remover da fila">×</button></div>`;}).join('')}</div>`;
    $$('.js-brat-pending-remove',box).forEach(btn=>btn.addEventListener('click',()=>removeBratPendingFile(btn.dataset.key)));
  }
  function bratErrorText(error){
    const raw=String(error?.message || error?.error_description || error?.details || error?.hint || error || 'Falha desconhecida').trim();
    const code=String(error?.statusCode || error?.status || error?.code || '').trim();
    const text=clean(raw);
    let friendly=raw;
    if(text.includes('row-level security') || text.includes('violates row level security')) friendly='O Supabase bloqueou o envio pelas políticas de acesso. Execute novamente o SQL de correção do BRAT.';
    else if(text.includes('bucket not found') || text.includes('not found') && text.includes('bucket')) friendly='O armazenamento brat-arquivos não foi encontrado. Execute o SQL de correção do BRAT.';
    else if(text.includes('brat_arquivos') && (text.includes('does not exist') || text.includes('schema cache') || text.includes('could not find'))) friendly='A tabela brat_arquivos não está disponível no Supabase. Execute o SQL de correção do BRAT.';
    else if(text.includes('foreign key') || String(error?.code || '')==='23503') friendly='O arquivo não conseguiu ser vinculado à ocorrência salva. Atualize o projeto e execute o SQL de correção do BRAT.';
    else if(String(error?.code || '')==='23502' && text.includes('column "nome"')) friendly='A tabela de arquivos ainda usa a coluna antiga nome como obrigatória. Execute o SQL de compatibilidade do BRAT e publique os arquivos atualizados.';
    else if(text.includes('payload too large') || text.includes('maximum allowed size') || String(error?.statusCode || '')==='413') friendly='O arquivo ultrapassa o limite permitido pelo armazenamento.';
    else if(text.includes('failed to fetch') || text.includes('network') || text.includes('load failed')) friendly='A conexão com o Supabase foi interrompida durante o envio.';
    return code && !friendly.includes(code) ? `${friendly} (código ${code})` : friendly;
  }
  function showBratUploadFeedback(type,title,details=[]){
    const box=$('#bratUploadFeedback'); if(!box) return;
    const list=(details || []).filter(Boolean);
    box.hidden=false;
    box.className=`brat-upload-feedback ${type || 'info'}`;
    box.innerHTML=`<strong>${esc(title || '')}</strong>${list.length?`<ul>${list.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:''}`;
  }
  function clearBratUploadFeedback(){
    const box=$('#bratUploadFeedback'); if(!box) return;
    box.hidden=true; box.className='brat-upload-feedback'; box.innerHTML='';
  }
  function refreshBratExistingFilesPanel(bratId){
    const section=$('#bratExistingFilesSection'), content=$('#bratExistingFilesContent');
    if(!section || !content) return;
    const row=(state.data.brat || []).find(r=>String(r.id)===String(bratId)) || {id:bratId};
    section.hidden=false;
    content.innerHTML=bratExistingFilesHtml(row);
  }

  function setBratBusy(busy,label='Salvando...'){
    state.bratBusy=!!busy;
    const save=$('#modalSave'),cancel=$('#modalCancel'),close=$('#modalClose');
    if(save){ if(!save.dataset.original) save.dataset.original=save.textContent; save.disabled=busy; save.textContent=busy?label:(save.dataset.original || 'Salvar ocorrência'); }
    if(cancel) cancel.disabled=busy;
    if(close) close.disabled=busy;
  }
  async function ensureBratFileBackend(){
    const db=connect(); if(!db) throw new Error('Supabase indisponível.');
    const table=await db.from('brat_arquivos').select('id').limit(1);
    if(table.error) throw new Error('A tabela brat_arquivos ainda não foi criada. Execute o SQL do módulo BRAT no Supabase.');
    const bucket=await db.storage.from(BRAT_BUCKET).list('',{limit:1});
    if(bucket.error) throw new Error('O bucket brat-arquivos ainda não está disponível. Execute o SQL do módulo BRAT no Supabase.');
  }
  function bratNotNullColumn(error){
    const text=String(error?.message || error?.details || error?.hint || error || '');
    const match=text.match(/null value in column "([^"]+)" violates not-null constraint/i);
    return match ? match[1] : '';
  }
  async function insertBratFileMetadata(db,meta){
    let payload={
      ...meta,
      // Compatibilidade com estruturas antigas da tabela brat_arquivos.
      nome:meta.nome_original,
      tipo:meta.categoria,
      url:meta.storage_path,
      caminho_storage:meta.storage_path
    };
    for(let attempt=0;attempt<12;attempt++){
      Object.keys(payload).forEach(key=>{ if(payload[key]===undefined) delete payload[key]; });
      const res=await db.from('brat_arquivos').insert(payload).select().single();
      if(!res.error) return res.data || payload;
      const missing=missingColumn(res.error);
      if(missing && Object.prototype.hasOwnProperty.call(payload,missing)){
        delete payload[missing];
        continue;
      }
      const required=bratNotNullColumn(res.error);
      if(required){
        const fallback={
          nome:meta.nome_original || 'arquivo',
          nome_original:meta.nome_original || meta.nome || 'arquivo',
          tipo:meta.categoria || 'documento',
          categoria:meta.categoria || meta.tipo || 'documento',
          url:meta.storage_path || '',
          storage_path:meta.storage_path || meta.caminho_storage || meta.url || '',
          caminho_storage:meta.storage_path || meta.caminho_storage || meta.url || '',
          mime_type:meta.mime_type || 'application/octet-stream',
          tamanho:Number(meta.tamanho || 0),
          pasta_relativa:meta.pasta_relativa || null,
          created_at:meta.created_at || nowIso(),
          deleted_at:null,
          brat_id:Number(meta.brat_id)
        };
        if(Object.prototype.hasOwnProperty.call(fallback,required)){
          payload[required]=fallback[required];
          continue;
        }
      }
      throw res.error;
    }
    throw new Error('Não foi possível compatibilizar os metadados do arquivo com a tabela brat_arquivos.');
  }
  async function uploadBratFiles(bratId,files,onProgress){
    const db=connect();
    const queue=dedupeBratPendingFiles(files || []);
    const result={saved:[],failed:[],skipped:[]};
    const existingKeys=new Set(bratFilesFor(bratId).map(item=>{
      const f=normalizeBratFile(item);
      const logicalPath=[f.pasta_relativa,f.nome_original].filter(Boolean).join('/').replace(/\\/g,'/').toLowerCase();
      return `${logicalPath}|${Number(f.tamanho || 0)}`;
    }));
    const processed=new Set();
    for(let i=0;i<queue.length;i++){
      const file=queue[i];
      if(onProgress) onProgress(i+1,queue.length,file);
      const relative=String(file.webkitRelativePath || '').replace(/\\/g,'/');
      const pieces=relative.split('/').filter(Boolean);
      if(pieces.length>1) pieces.shift();
      const logicalRelative=pieces.join('/');
      const folder=logicalRelative.includes('/')?logicalRelative.split('/').slice(0,-1).join('/') : '';
      const logicalPath=[folder,file.name].filter(Boolean).join('/').toLowerCase();
      const logicalKey=`${logicalPath}|${Number(file.size || 0)}`;
      const pendingKey=bratPendingFileKey(file);
      if(processed.has(pendingKey) || existingKeys.has(logicalKey)){
        result.skipped.push(file);
        continue;
      }
      processed.add(pendingKey);
      const token=(window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const path=`${bratId}/${token}-${safeBratFileName(file.name)}`;
      try{
        const up=await db.storage.from(BRAT_BUCKET).upload(path,file,{upsert:false,contentType:file.type || 'application/octet-stream',cacheControl:'3600'});
        if(up.error) throw up.error;
        const meta={brat_id:Number(bratId),nome_original:file.name,storage_path:path,mime_type:file.type || 'application/octet-stream',tamanho:Number(file.size || 0),categoria:bratFileKind(file.name,file.type),pasta_relativa:folder || null,created_at:nowIso(),deleted_at:null};
        let savedMeta;
        try{
          savedMeta=await insertBratFileMetadata(db,meta);
        }catch(error){
          await db.storage.from(BRAT_BUCKET).remove([path]);
          throw error;
        }
        result.saved.push(normalizeBratFile(savedMeta || meta));
        existingKeys.add(logicalKey);
      }catch(e){ console.error('Falha no upload BRAT:',file.name,e); result.failed.push({file,error:e}); }
    }
    return result;
  }
  async function syncBratCounts(bratId){
    const files=bratFilesFor(bratId);
    const row=(state.data.brat || []).find(r=>String(r.id)===String(bratId));
    const counts={qtd_fotos:files.filter(f=>f.categoria==='foto').length,qtd_pdfs:files.filter(f=>f.categoria==='pdf').length,qtd_videos:files.filter(f=>f.categoria==='video').length,qtd_arquivos:files.length};
    const legacyMeta=files.map(f=>({
      id:f.id || null,
      nome:f.nome_original,
      nome_original:f.nome_original,
      storage_path:f.storage_path || '',
      caminho_storage:f.storage_path || '',
      url:f.url || '',
      mime_type:f.mime_type || '',
      tamanho:Number(f.tamanho || 0),
      categoria:f.categoria || bratFileKind(f.nome_original,f.mime_type),
      pasta_relativa:f.pasta_relativa || ''
    }));
    const payload={
      ...counts,
      arquivos:files.map(f=>f.pasta_relativa?`${f.pasta_relativa}/${f.nome_original}`:f.nome_original).join('\n') || '',
      arquivos_json:JSON.stringify(legacyMeta),
      updated_at:nowIso()
    };
    if(connect()){
      try{ await safeUpdate('brats',payload,Number(bratId)); }catch(e){ console.warn('Não foi possível atualizar contadores BRAT:',e); }
    }
    if(row) Object.assign(row,payload);
    return payload;
  }
  async function saveBratModal(){
    if(state.bratBusy) return;
    const form=$('#modalForm'); const ctx=state.modal;
    if(!form || !ctx) return;
    const db=connect();
    if(!db) return toast('Supabase indisponível. O BRAT não foi salvo para evitar perda entre computadores.');
    const files=selectedBratFiles();
    const titulo=String(form.elements.titulo?.value || '').trim();
    const data=String(form.elements.data?.value || '').trim();
    const descricao=String(form.elements.descricao?.value || '').trim();
    if(!titulo) return toast('Informe o nome da ocorrência. Exemplo: BRAT (nome).');
    if(!data) return toast('Informe a data da ocorrência.');
    if(!descricao) return toast('Descreva o que aconteceu.');
    clearBratUploadFeedback();
    try{
      if(files.length) await ensureBratFileBackend();
      setBratBusy(true,'Salvando ocorrência...');
      const existing=(state.data.brat || []).find(r=>String(r.id)===String(ctx.row.id)) || {};
      const payload=normalizePayload('brat',{id:Number(ctx.row.id),titulo,data,mes:ym(data),placa:String(form.elements.placa?.value || '').trim().toUpperCase(),motorista:String(form.elements.motorista?.value || '').trim(),numero_brat:String(form.elements.numero_brat?.value || '').trim(),tipo:String(form.elements.tipo?.value || '').trim() || 'BRAT / Ocorrência',status:String(form.elements.status?.value || 'em_analise'),local:String(form.elements.local?.value || '').trim(),descricao,obs:String(form.elements.obs?.value || '').trim(),qtd_fotos:toNum(existing.qtd_fotos),qtd_pdfs:toNum(existing.qtd_pdfs),qtd_videos:toNum(existing.qtd_videos),qtd_arquivos:toNum(existing.qtd_arquivos),created_at:existing.created_at || nowIso()});
      const saved=await safeUpsert('brats',payload);
      const savedRecord={...payload,...(saved || {})};
      const savedId=savedRecord.id ?? payload.id;
      savedRecord.id=savedId;
      ctx.id=String(savedId);
      ctx.row={...savedRecord};
      state.modal=ctx;
      upsertLocal('brat',savedRecord);
      let upload={saved:[],failed:[]};
      if(files.length){
        upload=await uploadBratFiles(savedId,files,(current,total,file)=>setBratBusy(true,`Enviando ${current}/${total}: ${file.name.slice(0,24)}`));
        if(upload.saved.length){
          const keys=new Set((state.bratFiles || []).map(f=>`${f.brat_id}|${f.storage_path}`));
          upload.saved.forEach(f=>{ const n=normalizeBratFile(f); const key=`${n.brat_id}|${n.storage_path}`; if(!keys.has(key)){ state.bratFiles.push(n); keys.add(key); } });
        }
      }
      await loadBratFiles({silent:true});
      await syncBratCounts(savedId);
      await loadModule('brat',{silent:true});
      await loadBratFiles({silent:true});

      if(upload.failed.length){
        state.bratPendingFiles=upload.failed.map(item=>item.file);
        renderBratPendingFiles();
        refreshBratExistingFilesPanel(savedId);
        $('#modalTitle').textContent='Editar ocorrência / BRAT';
        const details=upload.failed.slice(0,6).map(item=>`${item.file?.name || 'Arquivo'}: ${bratErrorText(item.error)}`);
        if(upload.failed.length>6) details.push(`Mais ${upload.failed.length-6} arquivo(s) falharam.`);
        showBratUploadFeedback('error',upload.saved.length?`${upload.saved.length} arquivo(s) salvos; ${upload.failed.length} não foram enviados.`:`Nenhum dos ${upload.failed.length} arquivo(s) foi salvo.`,details);
        setBratBusy(false);
        const save=$('#modalSave'); if(save){ save.textContent='Tentar enviar novamente'; save.dataset.original='Tentar enviar novamente'; }
        renderNav();
        toast('A ocorrência foi salva, mas há arquivos pendentes. Veja o erro no formulário.');
        return;
      }

      state.bratPendingFiles=[];
      state.bratBusy=false;
      closeModal(); renderBrat(); renderNav();
      const skippedCount=Number(upload.skipped?.length || 0);
      const uploadMessage=upload.saved.length
        ? `Ocorrência e ${upload.saved.length} arquivo(s) salvos no Supabase.${skippedCount?` ${skippedCount} repetido(s) foram ignorados.`:''}`
        : (skippedCount?`Ocorrência salva. ${skippedCount} arquivo(s) repetido(s) já estavam registrados e foram ignorados.`:'Ocorrência salva no Supabase.');
      toast(files.length?uploadMessage:'Ocorrência salva no Supabase.');
    }catch(e){
      console.error(e);
      setBratBusy(false);
      showBratUploadFeedback('error','Não foi possível enviar os arquivos.',[bratErrorText(e)]);
      toast('Não foi possível concluir o salvamento. Confira a mensagem no formulário.');
    }
  }
  function bratFileRowHtml(file,readOnly){
    const folder=file.pasta_relativa?`<small>${esc(file.pasta_relativa)}</small>`:'';
    const downloadable=!!(file.storage_path || file.url);
    return `<div class="brat-file-row" data-file-id="${esc(file.id)}"><span class="brat-file-icon">${bratFileIcon(file.categoria)}</span><div class="brat-file-copy"><b title="${esc(file.nome_original)}">${esc(file.nome_original)}</b>${folder}<small>${esc(formatBratBytes(file.tamanho))} • ${esc(file.categoria)}</small></div><div class="brat-file-actions"><button class="btn compact js-brat-preview" data-file-id="${esc(file.id)}" type="button" ${downloadable?'':'disabled'}>Abrir</button><button class="btn compact js-brat-file-download" data-file-id="${esc(file.id)}" type="button" ${downloadable?'':'disabled'}>Baixar</button>${readOnly || !file.id? '':`<button class="icon-btn danger js-brat-file-delete admin-only" data-file-id="${esc(file.id)}" type="button" title="Excluir arquivo">×</button>`}</div></div>`;
  }
  function findBratFile(fileId){ return (state.bratFiles || []).map(normalizeBratFile).find(f=>String(f.id)===String(fileId)); }
  function openBratFilesModal(id){
    const row=(state.data.brat || []).find(r=>String(r.id)===String(id)); if(!row) return;
    const files=bratFilesFor(id);
    state.modal={key:'brat',custom:'brat-files',id:String(id),row:{...row}};
    $('#modalTitle').textContent=`Arquivos — ${bratRecordTitle(row)}`;
    $('#modalForm').innerHTML=`<div class="brat-files-modal"><div class="brat-files-modal-head"><div><b>${files.length} arquivo(s)</b><span>Todos os anexos salvos para esta ocorrência.</span></div><button class="btn js-brat-modal-zip" type="button" ${files.length?'':'disabled'}>Baixar pasta completa</button></div>${files.length?`<div class="brat-file-list">${files.map(f=>bratFileRowHtml(f,isReadOnly())).join('')}</div>`:'<div class="empty">Nenhum arquivo foi enviado para esta ocorrência.</div>'}</div>`;
    setBratModalButtons(isReadOnly()?'Fechar':'Adicionar arquivos','Fechar');
    if(isReadOnly()){ const save=$('#modalSave'); if(save) save.textContent='Fechar'; }
    $('#modalBg .modal')?.classList.add('brat-modal-shell');
    $('#modalBg').classList.add('open'); $('#modalBg').setAttribute('aria-hidden','false');
    $('.js-brat-modal-zip')?.addEventListener('click',ev=>downloadBratFolder(id,ev.currentTarget));
    $$('.js-brat-preview').forEach(btn=>btn.addEventListener('click',()=>previewBratFile(findBratFile(btn.dataset.fileId))));
    $$('.js-brat-file-download').forEach(btn=>btn.addEventListener('click',()=>downloadBratFile(findBratFile(btn.dataset.fileId),btn)));
    $$('.js-brat-file-delete').forEach(btn=>btn.addEventListener('click',()=>deleteBratFile(findBratFile(btn.dataset.fileId),row)));
  }
  async function getBratFileBlob(file){
    const f=normalizeBratFile(file);
    const db=connect();
    if(f.storage_path && db){ const res=await db.storage.from(BRAT_BUCKET).download(f.storage_path); if(res.error) throw res.error; return res.data; }
    if(f.url){ const res=await fetch(f.url); if(!res.ok) throw new Error('Não foi possível acessar o arquivo.'); return await res.blob(); }
    throw new Error('Este arquivo antigo possui apenas o nome, sem conteúdo salvo no Supabase.');
  }
  function triggerBlobDownload(blob,name){
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name || 'arquivo'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function previewBratFile(file){
    if(!file) return;
    const f=normalizeBratFile(file); const db=connect();
    try{
      if(f.storage_path && db){ const res=await db.storage.from(BRAT_BUCKET).createSignedUrl(f.storage_path,900); if(res.error) throw res.error; window.open(res.data.signedUrl,'_blank','noopener'); return; }
      if(f.url){ window.open(f.url,'_blank','noopener'); return; }
      toast('O arquivo antigo não possui conteúdo salvo no Supabase.');
    }catch(e){ console.error(e); toast('Não foi possível abrir o arquivo.'); }
  }
  async function downloadBratFile(file,button){
    if(!file) return;
    const old=button?.textContent; if(button){button.disabled=true;button.textContent='Baixando...';}
    try{ const blob=await getBratFileBlob(file); triggerBlobDownload(blob,normalizeBratFile(file).nome_original); }
    catch(e){console.error(e);toast(e.message || 'Não foi possível baixar o arquivo.');}
    finally{if(button){button.disabled=false;button.textContent=old || 'Baixar';}}
  }
  async function deleteBratFile(file,row){
    if(isReadOnly() || !file || !file.id) return;
    if(!confirm(`Excluir o arquivo “${file.nome_original}”?`)) return;
    const db=connect(); if(!db) return toast('Supabase indisponível.');
    const bratId=Number(row?.id || file.brat_id || 0);
    try{
      // Arquivos atuais possuem uma linha em brat_arquivos. Entradas legadas são
      // referências antigas no próprio BRAT e precisam apenas da limpeza abaixo.
      if(!file.legacy){
        // Primeiro remove o registro visível. Se o banco antigo bloquear DELETE,
        // usa deleted_at para que o arquivo deixe de aparecer em todos os computadores.
        let del=await db.from('brat_arquivos').delete().eq('id',file.id).select('id');
        if(del.error){
          const soft=await db.from('brat_arquivos').update({deleted_at:nowIso()}).eq('id',file.id).select('id');
          if(soft.error) throw del.error;
        }else if(Array.isArray(del.data) && !del.data.length){
          const check=await db.from('brat_arquivos').select('id').eq('id',file.id).maybeSingle();
          if(check.data){
            const soft=await db.from('brat_arquivos').update({deleted_at:nowIso()}).eq('id',file.id).select('id');
            if(soft.error) throw soft.error;
          }
        }
      }

      // Remove também as referências antigas gravadas no próprio BRAT. Sem isso,
      // o nome do arquivo era recriado como anexo legado logo após a exclusão.
      const liveRow=(state.data.brat || []).find(item=>String(item.id)===String(bratId)) || row || {};
      state.bratFiles=(state.bratFiles || []).filter(item=>{
        const normalized=normalizeBratFile(item);
        if(String(normalized.brat_id)!==String(bratId)) return true;
        if(String(normalized.id)===String(file.id)) return false;
        return !normalized.legacy || !sameBratFileReference(normalized,file);
      });
      const legacyCleanup=removeBratFileFromLegacyRow(liveRow,file);
      Object.assign(liveRow,legacyCleanup);
      let cleanupWarning=false;
      if(bratId){
        try{
          await safeUpdate('brats',{...legacyCleanup,updated_at:nowIso()},bratId);
        }catch(cleanupError){
          cleanupWarning=true;
          console.warn('O arquivo foi excluído, mas uma referência antiga do BRAT não pôde ser limpa:',cleanupError);
        }
      }
      await syncBratCounts(bratId);

      // O arquivo físico é removido depois que a listagem foi limpa. Se houver uma
      // falha isolada no Storage, ele não volta a aparecer na interface.
      let storageWarning=false;
      if(file.storage_path){
        const rem=await db.storage.from(BRAT_BUCKET).remove([file.storage_path]);
        if(rem.error){ storageWarning=true; console.warn('Falha ao remover arquivo do Storage:',rem.error); }
      }

      await loadModule('brat',{silent:true});
      await loadBratFiles({silent:true});
      openBratFilesModal(bratId);
      renderNav();
      toast(storageWarning
        ? 'Arquivo removido da ocorrência. O Storage não confirmou a limpeza física.'
        : cleanupWarning
          ? 'Arquivo excluído. Uma referência antiga será reconciliada na próxima atualização.'
          : 'Arquivo excluído.');
    }catch(e){
      console.error(e);
      toast(`Não foi possível excluir o arquivo${e?.message?`: ${e.message}`:'.'}`);
    }
  }
  function uniqueZipPath(file,used){
    const f=normalizeBratFile(file); const folder=String(f.pasta_relativa || '').split('/').map(part=>safeBratFileName(part)).filter(Boolean).join('/');
    let base=(folder?folder+'/':'')+safeBratFileName(f.nome_original); let out=base,idx=2;
    while(used.has(out)){ const dot=base.lastIndexOf('.'); out=dot>0?`${base.slice(0,dot)}-${idx}${base.slice(dot)}`:`${base}-${idx}`; idx++; }
    used.add(out); return out;
  }
  async function downloadBratFolder(id,button){
    if(state.bratBusy) return;
    const row=(state.data.brat || []).find(r=>String(r.id)===String(id)); const files=bratFilesFor(id).filter(f=>f.storage_path || f.url);
    if(!row || !files.length) return toast('Esta ocorrência ainda não possui arquivos baixáveis.');
    if(!window.JSZip) return toast('Biblioteca de compactação não carregada.');
    const old=button?.textContent; state.bratBusy=true; if(button){button.disabled=true;button.textContent='Preparando 0/'+files.length;}
    try{
      const zip=new window.JSZip(); const used=new Set(); let added=0;
      for(let i=0;i<files.length;i++){
        if(button) button.textContent=`Preparando ${i+1}/${files.length}`;
        try{ const blob=await getBratFileBlob(files[i]); zip.file(uniqueZipPath(files[i],used),blob,{binary:true,compression:'STORE'}); added++; }
        catch(e){console.warn('Arquivo ignorado no ZIP:',files[i].nome_original,e);}
      }
      if(!added) throw new Error('Nenhum arquivo pôde ser baixado.');
      if(button) button.textContent='Compactando...';
      const blob=await zip.generateAsync({type:'blob',compression:'STORE'});
      triggerBlobDownload(blob,`${safeBratFileName(bratRecordTitle(row)) || 'BRAT'}.zip`);
      toast(`${added} arquivo(s) reunidos na pasta ZIP.`);
    }catch(e){console.error(e);toast(e.message || 'Não foi possível baixar a pasta.');}
    finally{state.bratBusy=false;if(button){button.disabled=false;button.textContent=old || 'Baixar pasta';}}
  }
  function setupBratRealtime(){
    const db=connect(); if(!db?.channel) return;
    try{ if(state.bratRealtime) db.removeChannel(state.bratRealtime); }catch(e){}
    const refresh=()=>{
      clearTimeout(state.bratRealtimeTimer);
      state.bratRealtimeTimer=setTimeout(async()=>{
        try{ await loadModule('brat',{silent:true}); await loadBratFiles({silent:true}); if(state.current==='brat') renderBrat(); renderNav(); }
        catch(e){console.warn('Falha na atualização em tempo real do BRAT:',e);}
      },500);
    };
    state.bratRealtime=db.channel('frota-brat-v2').on('postgres_changes',{event:'*',schema:'public',table:'brats'},refresh).on('postgres_changes',{event:'*',schema:'public',table:'brat_arquivos'},refresh).subscribe();
  }

  // ============================================================
  // Sinistros e Avarias — arquivos (fotos, vídeos e outros anexos)
  // Mesmo padrão comprovado do BRAT (bucket próprio + tabela de
  // metadados + upload/preview/download/excluir/baixar pasta ZIP),
  // porém sem a camada de compatibilidade legada — a tabela é nova.
  // ============================================================
  const SINISTROS_BUCKET = 'sinistros-arquivos';
  function normalizeSinistroFile(file){
    const f = file || {};
    const name = String(f.nome_original || 'arquivo').trim();
    const mime = String(f.mime_type || '').trim();
    return {
      id: f.id ?? null,
      sinistro_id: Number(f.sinistro_id || 0),
      nome_original: name,
      storage_path: String(f.storage_path || '').trim(),
      mime_type: mime,
      tamanho: Number(f.tamanho || 0),
      categoria: String(f.categoria || bratFileKind(name, mime)),
      created_at: f.created_at || null
    };
  }
  function sinistroFilesFor(id){
    const sid = String(id || '');
    return (state.sinistroFiles || []).filter(f => String(f.sinistro_id) === sid);
  }
  function sinistroCounts(row){
    const files = sinistroFilesFor(row.id);
    if(state.sinistroFilesLoaded || files.length){
      return {
        total: files.length,
        fotos: files.filter(f=>f.categoria==='foto').length,
        videos: files.filter(f=>f.categoria==='video').length,
        pdfs: files.filter(f=>f.categoria==='pdf').length,
        outros: files.filter(f=>!['foto','video','pdf'].includes(f.categoria)).length
      };
    }
    return {
      total: toNum(row.qtd_arquivos) || toNum(row.qtd_fotos)+toNum(row.qtd_videos)+toNum(row.qtd_pdfs),
      fotos: toNum(row.qtd_fotos), videos: toNum(row.qtd_videos), pdfs: toNum(row.qtd_pdfs), outros:0
    };
  }
  async function loadSinistroFiles(opts={}){
    const db = connect();
    if(!db){ state.sinistroFiles=[]; state.sinistroFilesLoaded=true; return state.sinistroFiles; }
    try{
      const res = await db.from('sinistros_arquivos').select('*').is('deleted_at',null).order('created_at',{ascending:true}).limit(CFG.pageSize || 5000);
      if(res.error) throw res.error;
      state.sinistroFiles = (res.data || []).map(normalizeSinistroFile);
      state.sinistroFilesLoaded = true;
      if(!opts.silent && state.current==='sinistros') renderCurrentPage();
      return state.sinistroFiles;
    }catch(e){
      console.warn('Arquivos de Sinistros/Avarias indisponíveis (rode o SQL do módulo):', e);
      state.sinistroFiles = [];
      state.sinistroFilesLoaded = true;
      return state.sinistroFiles;
    }
  }
  async function uploadSinistroFiles(sinistroId, files, onProgress){
    const db = connect();
    if(!db) throw new Error('Supabase indisponível.');
    const result = {saved:[], failed:[]};
    const list = Array.from(files || []);
    for(let i=0;i<list.length;i++){
      const file = list[i];
      if(onProgress) onProgress(i+1, list.length, file);
      try{
        const token = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const path = `${sinistroId}/${token}-${safeBratFileName(file.name)}`;
        const up = await db.storage.from(SINISTROS_BUCKET).upload(path, file, {upsert:false, contentType:file.type || 'application/octet-stream', cacheControl:'3600'});
        if(up.error) throw up.error;
        const meta = {
          sinistro_id: Number(sinistroId),
          nome_original: file.name,
          storage_path: path,
          mime_type: file.type || '',
          tamanho: file.size || 0,
          categoria: bratFileKind(file.name, file.type)
        };
        const res = await db.from('sinistros_arquivos').insert(meta).select().single();
        if(res.error){
          await removerArquivosStorage(SINISTROS_BUCKET, [path]);   // sem registro, o arquivo ficaria órfão
          throw res.error;
        }
        result.saved.push(normalizeSinistroFile(res.data));
      }catch(e){
        console.error(e);
        result.failed.push({name:file.name, error:e});
      }
    }
    return result;
  }
  function sinistroFileRowHtml(file, readOnly){
    const downloadable = !!file.storage_path;
    return `<div class="brat-file-row" data-file-id="${esc(file.id)}"><span class="brat-file-icon">${bratFileIcon(file.categoria)}</span><div class="brat-file-copy"><b title="${esc(file.nome_original)}">${esc(file.nome_original)}</b><small>${esc(formatBratBytes(file.tamanho))} • ${esc(file.categoria)}</small></div><div class="brat-file-actions"><button class="btn compact js-sinistro-preview" data-file-id="${esc(file.id)}" type="button" ${downloadable?'':'disabled'}>Abrir</button><button class="btn compact js-sinistro-file-download" data-file-id="${esc(file.id)}" type="button" ${downloadable?'':'disabled'}>Baixar</button>${readOnly?'':`<button class="icon-btn danger js-sinistro-file-delete admin-only" data-file-id="${esc(file.id)}" type="button" title="Excluir arquivo">×</button>`}</div></div>`;
  }
  function findSinistroFile(fileId){ return (state.sinistroFiles || []).find(f => String(f.id) === String(fileId)); }
  async function previewSinistroFile(file){
    if(!file) return;
    const db = connect(); if(!db) return toast('Supabase indisponível.');
    try{
      const res = await db.storage.from(SINISTROS_BUCKET).createSignedUrl(file.storage_path, 900);
      if(res.error) throw res.error;
      window.open(res.data.signedUrl, '_blank', 'noopener');
    }catch(e){ console.error(e); toast('Não foi possível abrir o arquivo.'); }
  }
  async function downloadSinistroFile(file, button){
    if(!file) return;
    const old = button?.textContent; if(button){ button.disabled=true; button.textContent='Baixando...'; }
    try{
      const db = connect(); if(!db) throw new Error('Supabase indisponível.');
      const res = await db.storage.from(SINISTROS_BUCKET).download(file.storage_path);
      if(res.error) throw res.error;
      triggerBlobDownload(res.data, file.nome_original);
    }catch(e){ console.error(e); toast(e.message || 'Não foi possível baixar o arquivo.'); }
    finally{ if(button){ button.disabled=false; button.textContent = old || 'Baixar'; } }
  }
  async function deleteSinistroFile(file, row){
    if(isReadOnly() || !file || !file.id) return;
    if(!confirm(`Excluir o arquivo "${file.nome_original}"?`)) return;
    const db = connect(); if(!db) return toast('Supabase indisponível.');
    try{
      if(file.storage_path){
        const rem = await db.storage.from(SINISTROS_BUCKET).remove([file.storage_path]);
        if(rem.error) console.warn('Falha ao remover arquivo do Storage:', rem.error);
      }
      let del = await db.from('sinistros_arquivos').delete().eq('id', file.id).select('id');
      if(del.error){
        const soft = await db.from('sinistros_arquivos').update({deleted_at:nowIso()}).eq('id', file.id);
        if(soft.error) throw del.error;
      }
      state.sinistroFiles = (state.sinistroFiles || []).filter(f => String(f.id) !== String(file.id));
      toast('Arquivo excluído.');
      if(row) refreshSinistroModalIfOpen(row.id);
      renderCurrentPage();
    }catch(e){ console.error(e); toast('Não foi possível excluir o arquivo agora.'); }
  }
  async function downloadSinistroFolder(id, button){
    const row = (state.data.sinistros || []).find(r => String(r.id) === String(id));
    const files = sinistroFilesFor(id).filter(f => f.storage_path);
    if(!row || !files.length) return toast('Esta ocorrência ainda não possui arquivos baixáveis.');
    if(!window.JSZip) return toast('Biblioteca de compactação não carregada.');
    const db = connect(); if(!db) return toast('Supabase indisponível.');
    const old = button?.textContent; if(button){ button.disabled=true; button.textContent=`Preparando 0/${files.length}`; }
    try{
      const zip = new window.JSZip(); const used=new Set(); let added=0;
      for(let i=0;i<files.length;i++){
        if(button) button.textContent = `Preparando ${i+1}/${files.length}`;
        try{
          const res = await db.storage.from(SINISTROS_BUCKET).download(files[i].storage_path);
          if(res.error) throw res.error;
          let name = safeBratFileName(files[i].nome_original); let out=name, idx=2;
          while(used.has(out)){ const dot=name.lastIndexOf('.'); out = dot>0 ? `${name.slice(0,dot)}-${idx}${name.slice(dot)}` : `${name}-${idx}`; idx++; }
          used.add(out);
          zip.file(out, res.data, {binary:true, compression:'STORE'});
          added++;
        }catch(e){ console.warn('Arquivo ignorado no ZIP:', files[i].nome_original, e); }
      }
      if(!added) throw new Error('Nenhum arquivo pôde ser baixado.');
      if(button) button.textContent='Compactando...';
      const blob = await zip.generateAsync({type:'blob', compression:'STORE'});
      triggerBlobDownload(blob, `${safeBratFileName(row.tipo||'Sinistro')}-${safeBratFileName(row.placa||row.id)}.zip`);
      toast(`${added} arquivo(s) reunidos na pasta ZIP.`);
    }catch(e){ console.error(e); toast(e.message || 'Não foi possível baixar a pasta.'); }
    finally{ if(button){ button.disabled=false; button.textContent = old || 'Baixar pasta'; } }
  }
  function setupSinistrosRealtime(){
    const db = connect(); if(!db?.channel) return;
    try{ if(state.sinistrosRealtime) db.removeChannel(state.sinistrosRealtime); }catch(e){}
    const refresh = () => {
      clearTimeout(state.sinistrosRealtimeTimer);
      state.sinistrosRealtimeTimer = setTimeout(async () => {
        try{ await loadModule('sinistros',{silent:true}); await loadSinistroFiles({silent:true}); if(state.current==='sinistros') renderCurrentPage(); renderNav(); }
        catch(e){ console.warn('Falha na atualização em tempo real de Sinistros:', e); }
      }, 500);
    };
    state.sinistrosRealtime = db.channel('frota-sinistros-v1')
      .on('postgres_changes',{event:'*',schema:'public',table:'sinistros_avarias'}, refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'sinistros_arquivos'}, refresh)
      .subscribe();
  }

  // ============================================================
  // Sinistros e Avarias — layout de cards + modal (mesma experiência
  // do Chamados) e a mesma lógica de título do BRAT: nome explícito >
  // motorista > número do registro > placa > genérico.
  // ============================================================
  const SINISTRO_STATUS_PIPELINE = [['pendente','Pendente'],['em_analise','Em análise'],['orcamento','Em orçamento'],['em_reparo','Em reparo'],['acionado_seguro','Seguro acionado'],['concluido','Concluído']];
  const SINISTRO_RESP_PIPELINE = ['Em análise','Motorista','Terceiro','Compartilhada','Sem culpa'];
  function sinistroRespClass(v){
    const c = clean(v);
    if(c.includes('motorista')) return 'amber';
    if(c.includes('terceiro')) return 'blue';
    if(c.includes('compartilhada')) return 'orange';
    if(c.includes('sem culpa')) return 'green';
    return 'gray';
  }
  function sinistroRecordTitle(row){
    const r = row || {};
    const tipo = String(r.tipo || 'Ocorrência').trim();
    const who = String(r.motorista || '').trim();
    const numero = String(r.numero_sinistro || '').trim();
    if(who) return `${tipo} - ${who}`;
    if(numero) return `${tipo} - ${numero}`;
    if(r.placa) return `${tipo} - ${r.placa}`;
    return `${tipo} - Ocorrência`;
  }
  function sinistroCardHtml(r){
    const st = clean(r.status || 'pendente');
    const cls = statusClass(st);
    const counts = sinistroCounts(r);
    return `<article class="multa-card js-sinistro-open" data-id="${esc(r.id)}" role="button" tabindex="0">
      <div class="multa-card-bar ${cls}" title="${esc(STATUS[st]||st)}"></div>
      <div class="multa-card-main">
        <div class="multa-card-row1">
          <span class="plate">${esc(r.placa || '-')}</span>
          <span class="multa-card-driver">${esc(r.motorista || 'Motorista não vinculado')}</span>
          <span class="multa-card-auto">${esc(sinistroRecordTitle(r))}</span>
          <div class="multa-card-badges">${tag(r.tipo||'Avaria','blue')}${tag(r.responsabilidade||'Em análise', sinistroRespClass(r.responsabilidade))}${counts.total?tag(`📎 ${counts.total}`,'gray'):''}</div>
        </div>
        <div class="multa-card-row2">${esc(normalizeCardText(r.avaria||r.descricao||r.obs||'') || 'Sem descrição cadastrada.')}</div>
        <div class="multa-card-row3">
          <span class="money">${brlKey('sinistros',r)}</span>
          <span class="tag ${cls}">${esc(STATUS[st]||st)}</span>
          <span class="tag gray">${esc(fmtDate(r.data))}</span>
        </div>
      </div>
    </article>`;
  }
  function sinistrosCardsHtml(rows){
    if(!rows.length) return `<div class="empty">Nenhum sinistro/avaria encontrado com os filtros atuais.</div>`;
    return `<div class="multa-card-list">${rows.map(sinistroCardHtml).join('')}</div>`;
  }
  function renderSinistros(){
    const key = 'sinistros';
    const cfg = byKey[key];
    const readOnly = isReadOnly();
    const rows = filterRows(key);
    const stats = cfg.stats ? cfg.stats(rows) : [[cfg.title, rows.length, 'registros']];
    const statusValues = uniqueValues(key, 'status');
    const monthValues = cfg.monthFilter ? getMonths(key) : [];
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      <button class="btn" id="exportPdfBtn" type="button">Exportar PDF</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo registro</button>`}
    `);
    $('#pageRoot').innerHTML = `
      ${statsHtml(stats)}
      <div class="module-tools">
        <input class="search" id="moduleSearch" value="${esc(state.filters[key].search||'')}" placeholder="Buscar em sinistros e avarias..." />
        <span class="results-counter">${rows.length} ocorrência${rows.length===1?'':'s'} exibida${rows.length===1?'':'s'}</span>
        ${cfg.monthFilterSelect ? `<select class="select" id="monthFilter"><option value="">Todos os meses</option>${monthValues.map(m=>`<option value="${esc(m)}" ${state.filters[key].month===m?'selected':''}>${esc(monthLabel(m))} (${countByMonth(key,m)})</option>`).join('')}</select>` : ''}
        ${statusValues.length ? `<select class="select" id="statusFilter"><option value="">Todos os status</option>${statusValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].status===v?'selected':''}>${esc(STATUS[v]||v)}</option>`).join('')}</select>` : ''}
      </div>
      ${sinistrosCardsHtml(rows)}
    `;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#exportPdfBtn')?.addEventListener('click', () => exportPdf(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#moduleSearch')?.addEventListener('input', ev => {
      const pos = ev.target.selectionStart || ev.target.value.length;
      state.filters[key].search = ev.target.value;
      renderSinistros();
      const input = $('#moduleSearch');
      if(input){ input.focus(); try{ input.setSelectionRange(pos,pos); }catch(e){} }
    });
    $('#monthFilter')?.addEventListener('change', ev => { state.filters[key].month = ev.target.value; renderSinistros(); });
    $('#statusFilter')?.addEventListener('change', ev => { state.filters[key].status = ev.target.value; renderSinistros(); });
    $$('.js-sinistro-open').forEach(card => {
      card.addEventListener('click', () => openSinistroModal(card.dataset.id));
      card.addEventListener('keydown', ev => { if(ev.key==='Enter' || ev.key===' '){ ev.preventDefault(); openSinistroModal(card.dataset.id); } });
    });
  }
  function sinistroModalHeadMetaHtml(r){
    const st = clean(r.status || 'pendente');
    return `<span class="tag ${statusClass(st)}">${esc(STATUS[st]||st)}</span><span class="tag ${sinistroRespClass(r.responsabilidade)}">${esc(r.responsabilidade||'Em análise')}</span>`;
  }
  function sinistroModalHeaderInfoHtml(r){
    const items = [
      ['Placa', r.placa || '-'],
      ['Motorista', r.motorista || 'Não informado'],
      ['Data da ocorrência', fmtDate(r.data)],
      ['Tipo', r.tipo || 'Avaria'],
      ['Valor', brlKey('sinistros', r)]
    ];
    return `<div class="chamado-modal-header-grid">${items.map(([label,val]) => `<div class="clean-info"><span>${esc(label)}</span><b>${esc(val)}</b></div>`).join('')}</div>`;
  }
  function sinistroModalDetalhesHtml(r){
    const st = clean(r.status || 'pendente');
    const concluidoEm = st === 'concluido' && r.updated_at ? fmtDateTime(r.updated_at) : (r.data_previsao ? fmtDate(r.data_previsao) : '-');
    const items = [
      ['Previsão/Conclusão', concluidoEm],
      ['Número do sinistro', r.numero_sinistro || '-'],
      ['Seguradora', r.seguradora || '-'],
      ['Houve terceiro', (r.houve_terceiro===true||String(r.houve_terceiro)==='true') ? 'Sim' : 'Não']
    ];
    return `<details class="multa-detail-section multa-detail-wide">
      <summary>Mais detalhes</summary>
      <div class="clean-info-grid">${items.map(([label,val]) => `<div class="clean-info"><span>${esc(label)}</span><b>${esc(val)}</b></div>`).join('')}</div>
    </details>`;
  }
  function sinistroModalArquivosHtml(r){
    const files = sinistroFilesFor(r.id);
    const readOnly = isReadOnly();
    return `<div class="multa-detail-section multa-detail-wide">
      <h4>Fotos, vídeos e anexos</h4>
      <div class="brat-files-modal" style="gap:10px">
        <div class="brat-files-modal-head">
          <div><b>${files.length} arquivo(s)</b><span>Tudo o que foi enviado para esta ocorrência.</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn compact js-sinistro-modal-zip" type="button" ${files.length?'':'disabled'}>Baixar pasta completa</button>
            ${readOnly?'':`<label class="btn primary compact" style="cursor:pointer">📎 Adicionar<input type="file" id="sinistroFileInput" accept="image/*,video/*,application/pdf" multiple hidden /></label>`}
          </div>
        </div>
        ${files.length ? `<div class="brat-file-list">${files.map(f=>sinistroFileRowHtml(f,readOnly)).join('')}</div>` : '<div class="empty">Nenhum arquivo foi enviado para esta ocorrência.</div>'}
        <div id="sinistroUploadFeedback" class="brat-upload-feedback" hidden></div>
      </div>
    </div>`;
  }
  function sinistroModalBodyHtml(r){
    const st = clean(r.status || 'pendente');
    return `${sinistroModalHeaderInfoHtml(r)}
    <div class="multa-detail-grid">
      <div class="multa-detail-section multa-detail-wide">
        <h4>Descrição completa</h4>
        <div class="clean-desc ${normalizeCardText(r.avaria||'') ? '' : 'empty-desc'}">${esc(normalizeCardText(r.avaria||r.descricao||'') || 'Sem descrição cadastrada.')}</div>
      </div>
      ${r.obs ? `<div class="multa-detail-section multa-detail-wide"><h4>Observações</h4><div class="clean-desc">${esc(normalizeCardText(r.obs))}</div></div>` : ''}
      ${sinistroModalDetalhesHtml(r)}
      <div class="multa-detail-section multa-detail-wide">
        <h4>Status e responsabilidade</h4>
        <div class="chamado-pipeline">${SINISTRO_STATUS_PIPELINE.map(([id,label]) => `<button type="button" class="chamado-pipeline-btn ${statusClass(id)} ${st===id?'active':''}" data-id="${esc(r.id)}" data-status="${id}">${esc(label)}</button>`).join('')}</div>
        <div class="chamado-pipeline" style="margin-top:8px">${SINISTRO_RESP_PIPELINE.map(v => `<button type="button" class="chamado-pipeline-btn ${sinistroRespClass(v)} ${clean(r.responsabilidade)===clean(v)?'active':''}" data-id="${esc(r.id)}" data-resp="${esc(v)}">${esc(v)}</button>`).join('')}</div>
      </div>
      ${sinistroModalArquivosHtml(r)}
    </div>`;
  }
  function sinistroModalFootHtml(r){
    const st = clean(r.status || 'pendente');
    const readOnly = isReadOnly();
    return `
      ${readOnly ? '' : `<button class="btn danger js-sinistro-delete" data-id="${esc(r.id)}" type="button">Excluir</button>`}
      ${readOnly ? '' : `<button class="btn js-sinistro-edit-full" data-id="${esc(r.id)}" type="button">Editar registro completo</button>`}
      ${!readOnly && st !== 'concluido' ? `<button class="btn primary js-sinistro-concluir" data-id="${esc(r.id)}" type="button">Concluir ocorrência</button>` : ''}
      <button class="btn" id="sinistroModalCloseBtn" type="button">Fechar</button>
    `;
  }
  function openSinistroModal(id){
    const row = (state.data.sinistros || []).find(r => String(r.id) === String(id));
    if(!row) return;
    state.sinistroModalId = id;
    $('#sinistroModalTitle').textContent = sinistroRecordTitle(row);
    $('#sinistroModalHeadMeta').innerHTML = sinistroModalHeadMetaHtml(row);
    $('#sinistroModalBody').innerHTML = sinistroModalBodyHtml(row);
    $('#sinistroModalFoot').innerHTML = sinistroModalFootHtml(row);
    bindSinistroModalEvents();
    const bg = $('#sinistroModalBg');
    bg.classList.add('open');
    bg.setAttribute('aria-hidden','false');
    requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add('is-visible')));
  }
  function closeSinistroModal(){
    const bg = $('#sinistroModalBg');
    if(!bg) return;
    bg.classList.remove('is-visible');
    bg.setAttribute('aria-hidden','true');
    state.sinistroModalId = null;
    setTimeout(() => { bg.classList.remove('open'); $('#sinistroModalBody').innerHTML=''; $('#sinistroModalFoot').innerHTML=''; }, 180);
  }
  function refreshSinistroModalIfOpen(id){
    if(String(state.sinistroModalId) !== String(id)) return;
    const row = (state.data.sinistros || []).find(r => String(r.id) === String(id));
    if(!row) return closeSinistroModal();
    $('#sinistroModalTitle').textContent = sinistroRecordTitle(row);
    $('#sinistroModalHeadMeta').innerHTML = sinistroModalHeadMetaHtml(row);
    $('#sinistroModalBody').innerHTML = sinistroModalBodyHtml(row);
    $('#sinistroModalFoot').innerHTML = sinistroModalFootHtml(row);
    bindSinistroModalEvents();
  }
  async function updateSinistroStatus(id, status){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.sinistros || []).find(r => String(r.id) === String(id));
    if(!row) return;
    upsertLocal('sinistros', {...row, status});
    renderCurrentPage();
    refreshSinistroModalIfOpen(id);
    try{
      await safeUpdate(byKey.sinistros.table, {status, updated_at:new Date().toISOString()}, id);
      toast(`Status atualizado para "${STATUS[status]||status}".`);
    }catch(e){ console.error(e); toast('Não foi possível atualizar o status agora.'); }
  }
  async function updateSinistroResponsabilidade(id, responsabilidade){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const row = (state.data.sinistros || []).find(r => String(r.id) === String(id));
    if(!row) return;
    upsertLocal('sinistros', {...row, responsabilidade});
    renderCurrentPage();
    refreshSinistroModalIfOpen(id);
    try{
      await safeUpdate(byKey.sinistros.table, {responsabilidade, updated_at:new Date().toISOString()}, id);
      toast(`Responsabilidade atualizada para "${responsabilidade}".`);
    }catch(e){ console.error(e); toast('Não foi possível atualizar a responsabilidade agora.'); }
  }
  function bindSinistroModalEvents(){
    $('#sinistroModalCloseBtn')?.addEventListener('click', closeSinistroModal);
    $$('#sinistroModalBody .chamado-pipeline-btn[data-status]').forEach(btn => btn.addEventListener('click', ev => { ev.stopPropagation(); updateSinistroStatus(btn.dataset.id, btn.dataset.status); }));
    $$('#sinistroModalBody .chamado-pipeline-btn[data-resp]').forEach(btn => btn.addEventListener('click', ev => { ev.stopPropagation(); updateSinistroResponsabilidade(btn.dataset.id, btn.dataset.resp); }));
    $('.js-sinistro-modal-zip')?.addEventListener('click', ev => downloadSinistroFolder(state.sinistroModalId, ev.currentTarget));
    $$('.js-sinistro-preview').forEach(btn => btn.addEventListener('click', () => previewSinistroFile(findSinistroFile(btn.dataset.fileId))));
    $$('.js-sinistro-file-download').forEach(btn => btn.addEventListener('click', () => downloadSinistroFile(findSinistroFile(btn.dataset.fileId), btn)));
    $$('.js-sinistro-file-delete').forEach(btn => btn.addEventListener('click', () => { const row=(state.data.sinistros||[]).find(x=>String(x.id)===String(state.sinistroModalId)); deleteSinistroFile(findSinistroFile(btn.dataset.fileId), row); }));
    const input = $('#sinistroFileInput');
    if(input){
      input.addEventListener('change', async ev => {
        const chosen = ev.target.files;
        const id = state.sinistroModalId;
        if(!chosen || !chosen.length || !id) return;
        const feedback = $('#sinistroUploadFeedback');
        if(feedback){ feedback.hidden=false; feedback.className='brat-upload-feedback info'; feedback.innerHTML = `<strong>Enviando 0/${chosen.length}...</strong>`; }
        const res = await uploadSinistroFiles(id, chosen, (cur,total,file) => {
          if(feedback) feedback.innerHTML = `<strong>Enviando ${cur}/${total}: ${esc(file.name.slice(0,30))}</strong>`;
        });
        state.sinistroFiles = (state.sinistroFiles || []).concat(res.saved);
        renderCurrentPage();
        refreshSinistroModalIfOpen(id);
        toast(res.failed.length ? `${res.saved.length} arquivo(s) enviados. ${res.failed.length} falharam.` : `${res.saved.length} arquivo(s) enviados com sucesso.`);
      });
    }
    $('#sinistroModalFoot .js-sinistro-edit-full')?.addEventListener('click', ev => { const id=ev.target.dataset.id; closeSinistroModal(); openModal('sinistros', id); });
    $('#sinistroModalFoot .js-sinistro-delete')?.addEventListener('click', async ev => { const id=ev.target.dataset.id; await deleteRecord('sinistros', id); closeSinistroModal(); });
    $('#sinistroModalFoot .js-sinistro-concluir')?.addEventListener('click', ev => updateSinistroStatus(ev.target.dataset.id, 'concluido'));
  }

  // Toca um bipe curto de alerta sem precisar de nenhum arquivo de áudio externo.
  function playChamadoAlertSound(){
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext; if(!Ctx) return;
      const ctx = new Ctx();
      [0, 180].forEach(delay => {
        setTimeout(() => {
          const osc = ctx.createOscillator(), gain = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = 880;
          gain.gain.setValueAtTime(0.001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
          osc.connect(gain); gain.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.35);
        }, delay);
      });
    }catch(e){ /* áudio indisponível neste navegador */ }
  }
  function blinkChamadosNav(){
    const btn = document.querySelector('.nav-btn[data-page="chamados"]');
    if(!btn) return;
    btn.classList.add('nav-btn-blink');
    clearTimeout(blinkChamadosNav._t);
    blinkChamadosNav._t = setTimeout(() => btn.classList.remove('nav-btn-blink'), 12000);
  }
  function setupChamadosRealtime(){
    const db=connect(); if(!db?.channel) return;
    try{ if(state.chamadosRealtime) db.removeChannel(state.chamadosRealtime); }catch(e){}
    const refresh=(payload)=>{
      clearTimeout(state.chamadosRealtimeTimer);
      state.chamadosRealtimeTimer=setTimeout(async()=>{
        try{
          await loadModule('chamados',{silent:true});
          if(state.current==='chamados') renderChamados ? renderChamados() : renderCurrentPage();
          if(state.current==='dashboard') renderDashboard();
          renderNav();
          if(payload && payload.eventType === 'INSERT'){
            const novo = payload.new || {};
            playChamadoAlertSound();
            blinkChamadosNav();
            toast(`🚨 Novo chamado — ${novo.placa || 'veículo'}: ${novo.categoria ? (CHAMADO_CATEGORIAS[novo.categoria]||novo.categoria) : 'problema informado'}`);
          }
        }catch(e){console.warn('Falha na atualização em tempo real de Chamados:',e);}
      },400);
    };
    state.chamadosRealtime=db.channel('frota-chamados-v1').on('postgres_changes',{event:'*',schema:'public',table:'chamados'},refresh).subscribe();
  }

  function multasDriverList(){
    const rows = state.data.multas || [];
    const map = new Map();
    rows.forEach(r => {
      const raw = String(r.motorista || '').trim();
      const n = clean(raw);
      if(!n || n === 's/n' || n.startsWith('resp')) return;
      if(!map.has(n)) map.set(n, {key:n, name: titleCaseName(raw), total:0});
      map.get(n).total++;
    });
    return Array.from(map.values()).sort((a,b) => b.total - a.total || a.name.localeCompare(b.name));
  }
  /* ---------- Importação automática da Notificação de Autuação (PDF) ---------- */
  /*
    Leitura 100% local, no navegador: o texto do PDF é extraído com a biblioteca
    pdf.js (carregada no index.html) e interpretado por regras/regex. Não há chamada
    a nenhum servidor ou serviço de IA — o PDF nunca sai do computador do usuário e
    não é salvo em lugar nenhum, é só lido e descartado.
  */
  function normalizePlate(p){ return String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function findVeiculoByPlaca(placa){
    const p = normalizePlate(placa);
    if(!p) return null;
    return (state.data.veiculos || []).find(v => normalizePlate(v.placa) === p) || null;
  }
  function normalizeAuto(a){ return String(a||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }
  function findMultaByAuto(auto){
    const a = normalizeAuto(auto);
    if(!a) return null;
    return (state.data.multas || []).find(r => normalizeAuto(r.auto) === a) || null;
  }

  async function extractTextFromPdf(file){
    if(!window.pdfjsLib) throw new Error('Leitor de PDF não carregado. Recarregue a página e tente novamente.');
    if(window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({data: buffer}).promise;
    let text = '';
    for(let i=1; i<=pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }

  function brDateToIso(d){
    const m = String(d||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if(!m) return '';
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  function findFirst(text, patterns){
    for(const re of patterns){
      const m = text.match(re);
      if(m && m[1] && m[1].trim()) return m[1].trim();
    }
    return '';
  }
  function cleanLabelValue(v){
    return String(v||'').replace(/\s{2,}/g,' ').replace(/[\-:•\.]+$/,'').trim();
  }

  /* Interpreta o texto extraído do PDF e devolve os campos da Notificação de
     Autuação. Não inventa nada: campo não encontrado fica vazio, para
     preenchimento manual (padrões de rótulo cobrem os principais órgãos, mas
     podem não bater 100% com todos os layouts). */
  function parseNotificacaoAutuacaoText(rawText){
    const text = String(rawText || '').replace(/\r/g,'');
    const flat = text.replace(/\s+/g,' ');

    const placaBruta = findFirst(flat, [
      /PLACA[:\s]*([A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2})/i
    ]);

    const auto = cleanLabelValue(findFirst(flat, [
      /AUTO\s*DE\s*INFRA[ÇC][ÃA]O\s*(?:N[°ºo\.]*\s*)?[:\-]?\s*([A-Z0-9\.\-\/]{5,20})/i,
      /N[°ºo\.]*\s*DO\s*AUTO(?:\s*DE\s*INFRA[ÇC][ÃA]O)?[:\-]?\s*([A-Z0-9\.\-\/]{5,20})/i,
      /A\.?\s*I\.?\s*T\.?\s*(?:N[°ºo\.]*\s*)?[:\-]?\s*([A-Z0-9\.\-\/]{5,20})/i,
      /AUTO[:\-]\s*([A-Z0-9\.\-\/]{5,20})/i,
      /AUTO\s+([A-Z]{1,3}[0-9]{5,15})/i
    ]));

    const orgao = cleanLabelValue(findFirst(flat, [
      /[OÓ]RG[AÃ]O\s*AUTUADOR[:\-]?\s*([A-Z0-9ÀÁÂÃÉÊÍÓÔÕÚÇ\s\.\/\-]{3,60}?)(?=\s+(?:PLACA|MUNIC[IÍ]PIO|LOCAL|DATA|AUTO|C[OÓ]DIGO|VALOR|$))/i
    ]));

    const dataInfracaoBr = findFirst(flat, [
      /DATA\s*(?:DA\s*)?INFRA[ÇC][AÃ]O[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /DATA\s*(?:DA\s*)?AUTUA[ÇC][AÃ]O[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /DATA\s*(?:DA\s*)?OCORR[ÊE]NCIA[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /DATA\s*(?:DO\s*)?COMETIMENTO[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /DATA\/HORA\s*(?:DA\s*)?INFRA[ÇC][AÃ]O[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i,
      /DATA[:\-]\s*(\d{2}\/\d{2}\/\d{4})/i
    ]);

    const hora = findFirst(flat, [
      /HORA(?:\s*DA\s*INFRA[ÇC][AÃ]O)?[:\-]?\s*(\d{1,2}[:h]\d{2})/i
    ]).replace('h',':');

    const codigoInfracao = cleanLabelValue(findFirst(flat, [
      /C[OÓ]DIGO\s*(?:DA\s*)?INFRA[ÇC][AÃ]O[:\-]?\s*([0-9]{3,4}\-?[0-9]?)/i,
      /ENQUADRAMENTO[:\-]?\s*([0-9]{3,4}\-?[0-9]?)/i
    ]));

    const infracao = cleanLabelValue(findFirst(flat, [
      /DESCRI[ÇC][AÃ]O\s*(?:DA\s*)?INFRA[ÇC][AÃ]O[:\-]?\s*(.{5,180}?)(?=\s+(?:LOCAL|VALOR|C[OÓ]DIGO|MUNIC[IÍ]PIO|PONTOS)\b|$)/i
    ]));

    const local = cleanLabelValue(findFirst(flat, [
      /LOCAL\s*(?:DA\s*)?INFRA[ÇC][AÃ]O[:\-]?\s*(.{3,140}?)(?=\s+(?:MUNIC[IÍ]PIO|DATA|VALOR|C[OÓ]DIGO)\b|$)/i
    ]));

    const municipio = cleanLabelValue(findFirst(flat, [
      /MUNIC[IÍ]PIO[:\-]?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]{2,50}?)(?=\s+\/|\s+(?:UF|ESTADO|DATA|LOCAL|VALOR)\b|$)/i
    ]));

    const valorBruto = findFirst(flat, [
      /VALOR\s*(?:A\s*PAGAR|DA\s*MULTA|DA\s*PENALIDADE)?[:\-]?\s*R?\$?\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/i
    ]);
    const valor = valorBruto ? Number(valorBruto.replace(/\./g,'').replace(',', '.')) : null;

    const pontosBruto = findFirst(flat, [
      /PONTOS?(?:\s*NA\s*CNH)?[:\-]?\s*(\d{1,2})\s*PONTOS?/i,
      /QUANTIDADE\s*DE\s*PONTOS[:\-]?\s*(\d{1,2})/i
    ]);
    const pontos = pontosBruto ? Number(pontosBruto) : null;

    const prazoIndicacaoBr = findFirst(flat, [
      /PRAZO[^\.]{0,60}INDICA[ÇC][AÃ]O[^\.]{0,60}CONDUTOR[^\d]{0,25}(\d{2}\/\d{2}\/\d{4})/i,
      /PRAZO[^\.]{0,60}(?:DEFESA|APRESENTA[ÇC][AÃ]O\s*DE\s*DEFESA)[^\d]{0,25}(\d{2}\/\d{2}\/\d{4})/i
    ]);

    const prazoRecursoBr = findFirst(flat, [
      /PRAZO[^\.]{0,60}RECURSO[^\d]{0,25}(\d{2}\/\d{2}\/\d{4})/i
    ]);

    const numeroProcesso = cleanLabelValue(findFirst(flat, [
      /(?:N[°ºo\.]*\s*DO\s*)?PROCESSO[:\-]?\s*([A-Z0-9\.\-\/]{5,30})/i
    ]));

    return {
      placa: placaBruta ? placaBruta.replace(/[\s\-]/g,'').toUpperCase() : null,
      data: dataInfracaoBr ? brDateToIso(dataInfracaoBr) : null,
      hora: hora || null,
      auto: auto || null,
      orgao: orgao || null,
      codigo_infracao: codigoInfracao || null,
      infracao: infracao || null,
      local: local || null,
      municipio: municipio || null,
      valor: (valor !== null && Number.isFinite(valor)) ? valor : null,
      pontos: (pontos !== null && Number.isFinite(pontos)) ? pontos : null,
      prazo_indicacao_condutor: prazoIndicacaoBr ? brDateToIso(prazoIndicacaoBr) : null,
      prazo_recurso: prazoRecursoBr ? brDateToIso(prazoRecursoBr) : null,
      numero_processo: numeroProcesso || null
    };
  }

  async function extractAutuacaoFromPdf(file){
    const text = await extractTextFromPdf(file);
    return parseNotificacaoAutuacaoText(text);
  }

  function buildMultaPrefillFromExtracted(campos){
    const notas = [];
    if(campos.codigo_infracao) notas.push(`Código da infração: ${campos.codigo_infracao}`);
    if(campos.numero_processo) notas.push(`Nº do processo: ${campos.numero_processo}`);
    if(campos.pontos !== null && campos.pontos !== undefined && campos.pontos !== '') notas.push(`Pontos na CNH: ${campos.pontos}`);

    const prefill = {
      placa: campos.placa || '',
      data: campos.data || '',
      hora: campos.hora || '',
      auto: campos.auto || '',
      orgao: campos.orgao || '',
      municipio: campos.municipio || '',
      local: campos.local || '',
      infracao: campos.infracao || '',
      valor: (campos.valor !== null && campos.valor !== undefined) ? campos.valor : '',
      prazo_aceite: campos.prazo_indicacao_condutor || '',
      prazo_recurso: campos.prazo_recurso || '',
      status: 'pendente',
      prioridade: false
    };
    if(notas.length) prefill.obs = notas.join(' • ');

    const veiculo = findVeiculoByPlaca(prefill.placa);
    if(veiculo){
      if(veiculo.motorista) prefill.motorista = veiculo.motorista;
      const nota = `Veículo localizado no cadastro${veiculo.modelo ? ` (${veiculo.modelo})` : ''}.`;
      prefill.obs = prefill.obs ? `${prefill.obs} • ${nota}` : nota;
    }
    return prefill;
  }
  async function handleImportAutuacaoFile(file){
    if(!file) return;
    if(file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')){ toast('Selecione um arquivo PDF.'); return; }
    if(state.importAutuacaoBusy) return;
    state.importAutuacaoBusy = true;
    const btn = $('#importAutuacaoBtn');
    const originalText = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.textContent = 'Lendo PDF...'; }
    try{
      const campos = await extractAutuacaoFromPdf(file);
      const prefill = buildMultaPrefillFromExtracted(campos);
      const existente = findMultaByAuto(campos.auto);
      if(existente){
        openModal('multas', existente.id, prefill);
        toast(`Já existe uma multa cadastrada com este Auto (${existente.auto || '-'}). Abrindo o registro existente para atualizar com os dados da Notificação de Autuação importada.`);
      } else {
        openModal('multas', null, prefill);
        toast('Notificação de Autuação importada. Confira os dados antes de salvar.');
      }
    }catch(e){
      console.error(e);
      toast(e.message || 'Não foi possível importar a Notificação de Autuação.');
    }finally{
      state.importAutuacaoBusy = false;
      if(btn){ btn.disabled = false; btn.textContent = originalText || '📄 Importar Notificação de Autuação'; }
    }
  }

  function renderMultas(){
    const key = 'multas';
    const tab = state.multasTab || 'todos';
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      <button class="btn" id="exportPdfBtn" type="button">Exportar PDF</button>
      ${readOnly?'':`<button class="btn" id="importAutuacaoBtn" type="button">📄 Importar Notificação de Autuação</button>
      <input type="file" id="importAutuacaoFile" accept="application/pdf,.pdf" hidden />`}
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo registro</button>`}
    `);
    $('#pageRoot').innerHTML = `
      <div class="view-tabs">
        <button class="view-tab ${tab==='todos'?'active':''}" data-tab="todos" type="button">Todos os registros</button>
        <button class="view-tab ${tab==='motorista'?'active':''}" data-tab="motorista" type="button">Por motorista</button>
      </div>
      <div id="multasTabBody"></div>
    `;
    $$('.view-tab').forEach(btn => btn.addEventListener('click', () => { state.multasTab = btn.dataset.tab; renderMultas(); }));
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#importAutuacaoBtn')?.addEventListener('click', () => $('#importAutuacaoFile')?.click());
    $('#importAutuacaoFile')?.addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      handleImportAutuacaoFile(file);
      ev.target.value = '';
    });
    if(tab === 'motorista') renderMultasPorMotorista(); else renderMultasTodos();
  }
  function renderMultasTodos(){
    const key = 'multas';
    const cfg = byKey[key];
    const rows = filterRows(key);
    const stats = cfg.stats ? cfg.stats(rows) : [[cfg.title, rows.length, 'registros']];
    const readOnly = isReadOnly();
    const statusValues = uniqueValues(key, 'status');
    const gravValues = uniqueValues(key, 'gravidade');
    const monthValues = cfg.monthFilter ? getMonths(key) : [];
    $('#multasTabBody').innerHTML = `
      ${statsHtml(stats)}
      ${multasQuickFiltersHtml(key)}
      <div class="module-tools">
        <input class="search" id="moduleSearch" value="${esc(state.filters[key].search||'')}" placeholder="Buscar em multas..." />
        <span class="results-counter">${rows.length} multa${rows.length===1?'':'s'} exibida${rows.length===1?'':'s'}</span>
        ${cfg.monthFilterSelect ? `<select class="select" id="multasMonth"><option value="">Todos os meses</option>${monthValues.map(m=>`<option value="${esc(m)}" ${state.filters[key].month===m?'selected':''}>${esc(monthLabel(m))} (${countByMonth(key,m)})</option>`).join('')}</select>` : ''}
        ${statusValues.length ? `<select class="select" id="statusFilter"><option value="">Todos os status</option>${statusValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].status===v?'selected':''}>${esc(STATUS[v]||v)}</option>`).join('')}</select>` : ''}
        ${gravValues.length ? `<select class="select" id="gravFilter"><option value="">Todas as gravidades</option>${gravValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].gravidade===v?'selected':''}>${esc(v)}</option>`).join('')}</select>` : ''}
        <select class="select" id="multaPriorityFilter"><option value="">Todas as multas</option><option value="sim" ${state.filters[key].prioridade==='sim'?'selected':''}>Somente prioridades</option><option value="nao" ${state.filters[key].prioridade==='nao'?'selected':''}>Sem prioridade</option></select>
      </div>
      ${multasCardsHtml(rows)}
    `;
    $('#moduleSearch')?.addEventListener('input', ev => {
      const pos = ev.target.selectionStart || ev.target.value.length;
      state.filters[key].search = ev.target.value;
      renderMultasTodos();
      const input = $('#moduleSearch');
      if(input){ input.focus(); try{ input.setSelectionRange(pos,pos); }catch(e){} }
    });
    $('#multasMonth')?.addEventListener('change', ev => { state.filters[key].month = ev.target.value; renderMultasTodos(); });
    $('#statusFilter')?.addEventListener('change', ev => { state.filters[key].status = ev.target.value; renderMultasTodos(); });
    $('#gravFilter')?.addEventListener('change', ev => { state.filters[key].gravidade = ev.target.value; renderMultasTodos(); });
    $('#multaPriorityFilter')?.addEventListener('change', ev => { state.filters[key].prioridade = ev.target.value; renderMultasTodos(); });
    $$('.js-edit').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openModal(key, btn.dataset.id); }));
    $$('.js-delete').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); deleteRecord(key, btn.dataset.id); }));
    $$('.js-gerar-doc').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openGerarDocumentosModal(btn.dataset.id); }));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#exportPdfBtn')?.addEventListener('click', () => exportPdf(key, rows));
    bindMultasCardEvents(key, renderMultasTodos);
  }
  function renderMultasPorMotorista(){
    const key = 'multas';
    const drivers = multasDriverList();
    const selected = state.filters[key].motorista || '';
    const rows = selected ? (state.data[key]||[]).filter(r => clean(r.motorista||'') === selected).sort((a,b) => String(b.data||'').localeCompare(String(a.data||''))) : [];
    const stats = selected ? [
      ['Multas', rows.length, 'ao todo'],
      ['Pendentes', pendingRows(key, rows).length, 'em aberto'],
      ['Valor total', brl(sumMoney(key, rows)), 'somado'],
      ['Prioridades', rows.filter(multaPrioridadeAtiva).length, 'destacadas']
    ] : [];
    $('#multasTabBody').innerHTML = `
      <div class="module-tools">
        <select class="select" id="motoristaFilterSelect">
          <option value="">Selecione um motorista...</option>
          ${drivers.map(d => `<option value="${esc(d.key)}" ${selected===d.key?'selected':''}>${esc(d.name)} (${d.total})</option>`).join('')}
        </select>
        ${selected ? `<span class="results-counter">${rows.length} multa${rows.length===1?'':'s'} exibida${rows.length===1?'':'s'}</span>` : ''}
      </div>
      ${selected ? `${statsHtml(stats)}${multasCardsHtml(rows)}` : `
        <div class="clean-empty">
          <p>Selecione um motorista acima para ver somente as multas dele.</p>
          ${drivers.length ? `<div class="driver-shortcut-list">${drivers.slice(0,10).map(d=>`<button class="btn driver-shortcut" data-driver="${esc(d.key)}" type="button">${esc(d.name)} <span>${d.total}</span></button>`).join('')}</div>` : ''}
        </div>
      `}
    `;
    $('#motoristaFilterSelect')?.addEventListener('change', ev => { state.filters[key].motorista = ev.target.value; renderMultasPorMotorista(); });
    $$('.driver-shortcut').forEach(btn => btn.addEventListener('click', () => { state.filters[key].motorista = btn.dataset.driver; renderMultasPorMotorista(); }));
    $$('.js-edit').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openModal(key, btn.dataset.id); }));
    $$('.js-delete').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); deleteRecord(key, btn.dataset.id); }));
    $$('.js-gerar-doc').forEach(btn => btn.addEventListener('click', (ev) => { ev.stopPropagation(); openGerarDocumentosModal(btn.dataset.id); }));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#exportPdfBtn')?.addEventListener('click', () => exportPdf(key, rows));
    bindMultasCardEvents(key, renderMultasPorMotorista);
  }
  function renderModule(key){
    const cfg = byKey[key];
    const rows = filterRows(key);
    const stats = cfg.stats ? cfg.stats(rows) : [[cfg.title, rows.length, 'registros']];
    const readOnly = isReadOnly();
    setActions(`
      <button class="btn" id="refreshBtn" type="button">Atualizar dados</button>
      <button class="btn" id="exportCsvBtn" type="button">Exportar CSV</button>
      <button class="btn" id="exportPdfBtn" type="button">Exportar PDF</button>
      ${readOnly?'':`<button class="btn primary admin-only" id="newRecordBtn" type="button">+ Novo registro</button>`}
    `);
    const statusValues = uniqueValues(key, 'status');
    const gravValues = uniqueValues(key, 'gravidade');
    const monthValues = cfg.monthFilter ? getMonths(key) : [];
    const monthFilterId = key === 'multas' ? 'multasMonth' : 'monthFilter';
    $('#pageRoot').innerHTML = `
      ${statsHtml(stats)}
      <div class="module-tools">
        <input class="search" id="moduleSearch" value="${esc(state.filters[key].search||'')}" placeholder="Buscar em ${esc(cfg.title.toLowerCase())}..." />
        ${cfg.monthFilterSelect ? `<select class="select" id="${monthFilterId}"><option value="">Todos os meses</option>${monthValues.map(m=>`<option value="${esc(m)}" ${state.filters[key].month===m?'selected':''}>${esc(monthLabel(m))} (${countByMonth(key,m)})</option>`).join('')}</select>` : ''}
        ${statusValues.length ? `<select class="select" id="statusFilter"><option value="">Todos os status</option>${statusValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].status===v?'selected':''}>${esc(STATUS[v]||v)}</option>`).join('')}</select>` : ''}
        ${gravValues.length ? `<select class="select" id="gravFilter"><option value="">Todas as gravidades</option>${gravValues.map(v=>`<option value="${esc(v)}" ${state.filters[key].gravidade===v?'selected':''}>${esc(v)}</option>`).join('')}</select>` : ''}
        ${key === 'multas' ? `<select class="select" id="multaPriorityFilter"><option value="">Todas as multas</option><option value="sim" ${state.filters[key].prioridade==='sim'?'selected':''}>Somente prioridades</option><option value="nao" ${state.filters[key].prioridade==='nao'?'selected':''}>Sem prioridade</option></select>` : ''}
      </div>
      ${cfg.monthFilter && !cfg.monthFilterSelect ? foldersHtml(key) : ''}
      ${tableHtml(key, rows)}
    `;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#exportCsvBtn')?.addEventListener('click', () => exportCsv(key, rows));
    $('#newRecordBtn')?.addEventListener('click', () => openModal(key));
    $('#moduleSearch')?.addEventListener('input', ev => {
      const pos = ev.target.selectionStart || ev.target.value.length;
      state.filters[key].search = ev.target.value;
      renderModule(key);
      const input = $('#moduleSearch');
      if(input){ input.focus(); try{ input.setSelectionRange(pos,pos); }catch(e){} }
    });
    $('#monthFilter')?.addEventListener('change', ev => { state.filters[key].month = ev.target.value; renderModule(key); });
    $('#multasMonth')?.addEventListener('change', ev => { state.filters[key].month = ev.target.value; renderModule(key); });
    $('#statusFilter')?.addEventListener('change', ev => { state.filters[key].status = ev.target.value; renderModule(key); });
    $('#gravFilter')?.addEventListener('change', ev => { state.filters[key].gravidade = ev.target.value; renderModule(key); });
    $('#multaPriorityFilter')?.addEventListener('change', ev => { state.filters[key].prioridade = ev.target.value; renderModule(key); });
    $$('.folder').forEach(btn => btn.addEventListener('click', () => { state.filters[key].month = btn.dataset.month || ''; renderModule(key); }));
    $$('.js-edit').forEach(btn => btn.addEventListener('click', () => openModal(key, btn.dataset.id)));
    $$('.js-delete').forEach(btn => btn.addEventListener('click', () => deleteRecord(key, btn.dataset.id)));
    $$('.js-qr-veiculo').forEach(btn => btn.addEventListener('click', () => openVeiculoQrModal(btn.dataset.id)));
  }

  function uniqueValues(key, prop){
    const values = (state.data[key]||[]).map(r=>r[prop]).filter(Boolean);
    if(key === 'multas' && prop === 'status') values.push('pendente','aguardando_aceite','aguardando_assinatura','aceito','pago','recorrendo','recorrida','sem_necessidade','demitido');
    if(key === 'sinistros' && prop === 'status') values.push('pendente','em_analise','orcamento','em_reparo','acionado_seguro','concluido');
    if(key === 'brat' && prop === 'status') values.push('aberto','em_analise','pendente','aguardando_docs','concluido');
    if(key === 'chamados' && prop === 'status') values.push('aberto','em_analise','em_manutencao','resolvido');
    return Array.from(new Set(values)).sort((a,b)=>String(STATUS[a]||a).localeCompare(String(STATUS[b]||b)));
  }

  function tableHtml(key, rows){
    const cfg = byKey[key];
    if(!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
    const readOnly = isReadOnly();
    const docBtn = r => key === 'multas' ? `<button class="icon-btn js-gerar-doc" data-id="${esc(r.id)}" type="button" title="Gerar Documentos (Comunicação de Multa + E-mail)">📄</button>` : '';
    const qrBtn = r => key === 'veiculos' ? `<button class="icon-btn js-qr-veiculo" data-id="${esc(r.id)}" type="button" title="QR Code de Chamados">🔳</button>` : '';
    return `<div class="table-card module-table-card ${esc(key)}-table-card"><div class="table-wrap"><table class="data-table module-data-table ${esc(key)}-data-table"><thead><tr>${cfg.columns.map(c=>`<th>${esc(c[1])}</th>`).join('')}<th class="actions-col">Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${cfg.columns.map(c=>`<td>${cell(r,c)}</td>`).join('')}<td class="actions-col"><div class="row-actions">${docBtn(r)}${qrBtn(r)}<button class="icon-btn js-edit" data-id="${esc(r.id)}" type="button" title="Editar">✎</button>${readOnly?'':`<button class="icon-btn danger js-delete admin-only" data-id="${esc(r.id)}" type="button" title="Excluir">×</button>`}</div></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function cell(row, col){
    if(typeof col[2] === 'function') return col[2](row);
    const v = row[col[0]];
    return esc(v ?? '-');
  }


  function fullPlate(v){ return String(v || '').replace(/[^a-zA-Z0-9]/g,'').toUpperCase(); }
  function h360IsFullPlateRaw(raw){ return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(String(raw || '')); }
  function h360KnownVehiclePlates(){
    const set = new Set();
    (state.data.veiculos || []).forEach(v => { const p = fullPlate(v.placa || v.carro); if(p) set.add(p); });
    ['multas','pontos','manutencoes','sinistros','oleo','tacografos','producao','brat'].forEach(key => (state.data[key] || []).forEach(r => { const p = fullPlate(rowPlateValue(r)); if(h360IsFullPlateRaw(p)) set.add(p); }));
    formulariosRows().forEach(r => { const p = fullPlate(rowPlateValue(r)); if(h360IsFullPlateRaw(p)) set.add(p); });
    return Array.from(set);
  }
  function h360ResolvePlate(v){
    const raw = fullPlate(v);
    if(!raw || raw.length > 10) return '';
    const known = h360KnownVehiclePlates();
    const exact = known.find(p => p === raw);
    if(exact) return exact;
    const suffix = canonicalPlate(raw);
    if(suffix && suffix.length >= 4){
      const matches = known.filter(p => canonicalPlate(p) === suffix || p.endsWith(raw));
      if(matches.length === 1) return matches[0];
    }
    if(h360IsFullPlateRaw(raw)) return raw;
    return '';
  }
  function sameVehiclePlate(a, b){
    const pa = h360ResolvePlate(a), pb = h360ResolvePlate(b);
    if(!pa || !pb) return false;
    return pa === pb || canonicalPlate(pa) === canonicalPlate(pb);
  }
  function rowPlateValue(r){ return r?.placa || r?.carro || r?.veiculo || r?.placa_veiculo || ''; }
  function h360DisplayPlate(v){ return h360ResolvePlate(v) || fullPlate(v); }
  const H360_MECHANIC_TOKENS = new Set(['bruno','marcos','rafael']);
  function h360DriverParts(value){
    return String(value || '').split(/[,;\/|]+|\s+e\s+/i).map(v => v.trim()).filter(Boolean);
  }
  function h360IsMechanicName(value){
    const c = clean(value).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    if(!c) return false;
    const tokens = c.split(' ').filter(Boolean);
    if(c === 'bruno') return true;
    if(tokens.includes('mecanico') && tokens.includes('bruno')) return true;
    return tokens.some(t => H360_MECHANIC_TOKENS.has(t));
  }
  function h360CleanDriverText(value){
    return h360DriverParts(value).filter(v => !h360IsMechanicName(v)).join(' • ');
  }
  function h360DriverLabel(value){ return h360CleanDriverText(value) || 'Não informado'; }
  function h360VehicleMetaText(v){ return [v?.renavam ? `RENAVAM ${v.renavam}` : '', v?.ano].filter(Boolean).join(' • ') || 'Ficha consolidada por placa'; }
  function h360VehicleOptions(){
    const map = new Map();
    const add = (placa, meta={}) => {
      const resolved = h360ResolvePlate(placa);
      if(!resolved) return;
      const key = resolved;
      const current = map.get(key) || {placa:resolved, modelo:'', motorista:'', status:'', registros:0};
      const cleanedMeta = Object.fromEntries(Object.entries(meta).filter(([,v])=>v));
      if(cleanedMeta.motorista) cleanedMeta.motorista = h360CleanDriverText(cleanedMeta.motorista);
      map.set(key, {...current, ...cleanedMeta, placa:resolved, registros:(current.registros || 0) + (meta.registros || 0)});
    };
    (state.data.veiculos || []).forEach(v => add(v.placa || v.carro, {modelo:v.modelo, motorista:v.motorista, status:v.status || v.situacao, registros:1}));
    ['multas','pontos','manutencoes','oleo','tacografos','producao','brat'].forEach(key => (state.data[key] || []).forEach(r => add(rowPlateValue(r), {registros:1})));
    formulariosRows().forEach(r => add(rowPlateValue(r), {registros:1}));
    return Array.from(map.values()).sort((a,b)=>String(a.placa).localeCompare(String(b.placa)));
  }
  function h360FindVehicle(plateValue){
    const p = h360ResolvePlate(plateValue) || fullPlate(plateValue);
    return (state.data.veiculos || []).find(v => sameVehiclePlate(v.placa || v.carro, p)) || null;
  }
  function h360Rows(key, plateValue){
    const p = h360ResolvePlate(plateValue) || fullPlate(plateValue);
    const source = key === 'formularios' ? formulariosRows() : (state.data[key] || []);
    return source.filter(r => sameVehiclePlate(rowPlateValue(r), p)).map(r => ({...r, placa:h360DisplayPlate(rowPlateValue(r)) || rowPlateValue(r)}));
  }
  function h360LastDate(rows, fields=['data','data_ultima_troca','data_validade','validade','created_at']){
    return rows.map(r => fields.map(f=>String(r?.[f] || '').slice(0,10)).find(v=>/^\d{4}-\d{2}-\d{2}$/.test(v)) || '').filter(Boolean).sort().pop() || '';
  }
  function h360FirstPlateFromSearch(){
    const q = fullPlate(state.historico360.search || '');
    const options = h360VehicleOptions();
    if(!q && options[0]) return options[0].placa;
    const resolved = h360ResolvePlate(q);
    if(resolved) return resolved;
    const exact = options.find(o => fullPlate(o.placa) === q || canonicalPlate(o.placa) === canonicalPlate(q));
    if(exact) return exact.placa;
    const partial = options.find(o => fullPlate(o.placa).includes(q) || clean([o.placa,o.modelo,o.motorista,o.status].join(' ')).includes(clean(state.historico360.search || '')));
    return partial?.placa || '';
  }
  function openHistorico360(plateValue){
    const p = h360ResolvePlate(plateValue) || fullPlate(plateValue);
    state.historico360.plate = p;
    state.historico360.search = p;
    state.historico360.tab = 'visao';
    showPage('historico360');
  }
  function h360Dataset(plateValue){
    const plateClean = h360ResolvePlate(plateValue) || fullPlate(plateValue);
    const veiculo = h360FindVehicle(plateClean);
    const multas = h360Rows('multas', plateClean);
    const pontos = h360Rows('pontos', plateClean);
    const manutencoes = h360Rows('manutencoes', plateClean);
    const sinistros = h360Rows('sinistros', plateClean);
    const oleo = h360Rows('oleo', plateClean);
    const tacografos = h360Rows('tacografos', plateClean);
    const producao = h360Rows('producao', plateClean);
    const brat = h360Rows('brat', plateClean);
    const formularios = h360Rows('formularios', plateClean);
    const chamados = h360Rows('chamados', plateClean);
    const allRows = {multas,pontos,manutencoes,sinistros,oleo,tacografos,producao,brat,formularios,chamados};
    const totalMan = sumMoney('manutencoes', manutencoes);
    const totalMultas = sumMoney('multas', multas);
    const totalSinistros = sumMoney('sinistros', sinistros);
    const pendencias = [];
    pendingRows('multas', multas).forEach(r => pendencias.push({key:'multas', titulo:`Multa ${r.auto || r.id || ''}`.trim(), detalhe:r.infracao || r.descricao || 'Multa pendente', cls:'amber'}));
    pendingRows('manutencoes', manutencoes).forEach(r => pendencias.push({key:'manutencoes', titulo:r.servico || r.tipo || 'Manutenção pendente', detalhe:[fmtDate(r.data), brlKey('manutencoes', r)].filter(Boolean).join(' • '), cls:'amber'}));
    pendingRows('sinistros', sinistros).forEach(r => pendencias.push({key:'sinistros', titulo:`${r.tipo || 'Avaria'} · ${r.motorista || 'motorista não informado'}`, detalhe:r.avaria || r.descricao || r.obs || 'Ocorrência em acompanhamento', cls:'red'}));
    pendingRows('oleo', oleo).forEach(r => pendencias.push({key:'oleo', titulo:'Óleo / preventiva', detalhe:oilStatus(r).text, cls:oilStatus(r).cls}));
    pendingRows('tacografos', tacografos).forEach(r => pendencias.push({key:'tacografos', titulo:'Tacógrafo', detalhe:dateAlertText(r.data_validade || r.validade), cls:daysUntil(r.data_validade || r.validade) <= 0 ? 'red' : 'amber'}));
    pendingRows('brat', brat).forEach(r => pendencias.push({key:'brat', titulo:r.numero_brat ? `BRAT ${r.numero_brat}` : 'Ocorrência/BRAT', detalhe:r.descricao || r.status || 'Em acompanhamento', cls:'blue'}));
    const dates = [h360LastDate(multas), h360LastDate(manutencoes), h360LastDate(sinistros), h360LastDate(oleo), h360LastDate(tacografos), h360LastDate(producao), h360LastDate(brat), h360LastDate(formularios)].filter(Boolean).sort();
    return {plate:plateClean, veiculo, multas, pontos, manutencoes, sinistros, oleo, tacografos, producao, brat, formularios, chamados, allRows, totalMan, totalMultas, totalSinistros, pendencias, lastDate:dates.pop() || ''};
  }
  function h360Events(ds){
    const rows = [];
    ds.multas.forEach(r => rows.push({date:r.data || r.created_at, modulo:'Multa', key:'multas', cls:gravidadeClass(r.gravidade), title:r.auto ? `Multa ${r.auto}` : 'Multa registrada', detail:r.infracao || r.descricao || r.obs || '-', value:brlKey('multas', r), status:STATUS[r.status] || r.status || 'Pendente'}));
    ds.pontos.forEach(r => rows.push({date:r.data || r.created_at, modulo:'Pontos', key:'pontos', cls:gravidadeClass(r.gravidade), title:`${toNum(r.pontos)} ponto(s)`, detail:r.motivo || r.auto || h360CleanDriverText(r.motorista) || '-', value:r.aceitou || '', status:r.gravidade || ''}));
    ds.manutencoes.forEach(r => rows.push({date:r.data || r.created_at, modulo:'Manutenção', key:'manutencoes', cls:statusClass(r.status || 'concluido'), title:r.servico || r.tipo || 'Serviço de manutenção', detail:r.descricao || r.obs || r.origem || '-', value:brlKey('manutencoes', r), status:STATUS[r.status] || r.status || 'Concluído'}));
    (ds.sinistros||[]).forEach(r => rows.push({date:r.data || r.created_at, modulo:'Sinistro/Avaria', key:'sinistros', cls:statusClass(r.status || 'pendente'), title:r.tipo || 'Avaria registrada', detail:r.avaria || r.descricao || r.obs || '-', value:brlKey('sinistros', r), status:STATUS[r.status] || r.status || 'Pendente'}));
    ds.oleo.forEach(r => rows.push({date:r.data_ultima_troca || r.data || r.created_at, modulo:'Óleo', key:'oleo', cls:oilStatus(r).cls, title:`Troca de óleo ${r.tipo || ''}`.trim(), detail:`KM atual: ${r.km_ultima_vistoria || r.km || '-'} • Próxima: ${r.km_proxima_troca || r.proxkm || '-'}`, value:'', status:oilStatus(r).text}));
    ds.tacografos.forEach(r => rows.push({date:r.data_emissao || r.data || r.data_validade || r.validade, modulo:'Tacógrafo', key:'tacografos', cls:daysUntil(r.data_validade || r.validade)<=30?'amber':'green', title:'Tacógrafo / aferição', detail:`Validade: ${fmtDate(r.data_validade || r.validade)}`, value:'', status:STATUS[r.status] || r.status || dateAlertText(r.data_validade || r.validade)}));
    ds.producao.forEach(r => rows.push({date:r.data || r.created_at, modulo:'Produção', key:'producao', cls:'blue', title:r.servico || 'Produção do dia', detail:h360CleanDriverText(r.responsaveis || r.responsavel) || r.obs || '-', value:'', status:r.mes ? monthLabel(r.mes) : ''}));
    ds.brat.forEach(r => rows.push({date:r.data || r.created_at, modulo:'BRAT', key:'brat', cls:statusClass(r.status), title:r.numero_brat ? `BRAT ${r.numero_brat}` : (r.tipo || 'Ocorrência'), detail:r.descricao || r.obs || '-', value:`${toNum(r.qtd_fotos)} fotos • ${toNum(r.qtd_pdfs)} PDFs • ${toNum(r.qtd_videos)} vídeos`, status:STATUS[r.status] || r.status || 'Em análise'}));
    ds.formularios.forEach(r => rows.push({date:r.data || r.created_at, modulo:'Formulário', key:'formularios', cls:'blue', title:r.defeito || 'Formulário de defeito', detail:h360CleanDriverText(r.motorista) || r.obs || r.anexo || '-', value:r.pagina ? `Página ${r.pagina}` : '', status:r.status || 'Pendente'}));
    return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  }
  function h360Table(key, rows, empty='Nenhum registro para esta placa.'){
    if(!rows.length) return `<div class="clean-empty">${esc(empty)}</div>`;
    if(key === 'formularios'){
      const cols = [['data','Data',r=>fmtDate(r.data)], ['motorista','Motorista'], ['defeito','Defeito',r=>`<div class="desc">${esc(r.defeito || r.descricao || '')}</div>`], ['status','Status',r=>tag(r.status || 'pendente', statusClass(r.status || 'pendente'))], ['anexo','Origem',r=>esc(r.anexo || '-')]];
      return `<div class="table-card h360-table"><div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${typeof c[2]==='function'?c[2](r):esc(r[c[0]] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }
    return tableHtmlForRows(key, rows);
  }
  function h360TimelineHtml(ds){
    const events = h360Events(ds);
    if(!events.length) return '<div class="clean-empty">Nenhum evento encontrado para esta placa.</div>';
    return `<div class="h360-timeline">${events.map(ev=>`<article class="h360-event"><div class="h360-event-date"><b>${esc(fmtDate(String(ev.date || '').slice(0,10)))}</b><span>${esc(ev.modulo)}</span></div><div class="h360-event-body"><div class="h360-event-title"><strong>${esc(ev.title)}</strong>${tag(ev.status || ev.modulo, ev.cls || 'gray')}</div><p>${esc(ev.detail || '-')}</p>${ev.value ? `<small>${esc(ev.value)}</small>` : ''}</div><button class="btn compact js-h360-module" data-page="${esc(ev.key)}" type="button">Abrir módulo</button></article>`).join('')}</div>`;
  }
  /* ----------------------------------------------------------------------
   * VehicleHealthCard — Índice de Saúde do Veículo
   * Pesos fáceis de ajustar no futuro: mude os números abaixo, nada mais
   * precisa mudar. "Consumo" fica fora do cálculo hoje porque não existe
   * fonte de dado por veículo no sistema — some quando existir.
   * -------------------------------------------------------------------- */
  const H360_HEALTH_WEIGHTS = { manutencao:20, tacografo:15, disponibilidade:15, oleo:15, multas:15, ocorrencias:10, pendencias:10 };
  function h360HealthFactors(ds){
    const v = ds.veiculo || {};
    const lastManDate = h360LastDate(ds.manutencoes);
    const diasSemManutencao = lastManDate ? Math.abs(daysUntil(lastManDate)) : null;
    const scoreManutencao = diasSemManutencao==null ? 50 : diasSemManutencao<=30?100 : diasSemManutencao<=60?90 : diasSemManutencao<=90?75 : diasSemManutencao<=180?55 : 30;

    // Tacógrafo é um módulo independente de "Documentação" (CRLV/seguro) — não misturar.
    const nextTac = ds.tacografos.slice().sort((a,b)=>daysUntil(a.data_validade||a.validade)-daysUntil(b.data_validade||b.validade))[0];
    const tacDias = nextTac ? daysUntil(nextTac.data_validade || nextTac.validade) : null;
    const scoreTacografo = tacDias==null ? 50 : tacDias<0 ? 0 : tacDias<30 ? 45 : tacDias<90 ? 75 : 100;

    const parado = isVeiculoParado(v);
    const scoreDisponibilidade = parado ? 40 : 100;

    const lastOleo = ds.oleo.slice().sort((a,b)=>String(b.data_ultima_troca||b.data||'').localeCompare(String(a.data_ultima_troca||a.data||'')))[0];
    const oleoSit = lastOleo ? oilSituationValue(lastOleo) : null;
    const scoreOleo = oleoSit==='vencido'?15 : oleoSit==='verificar'?65 : oleoSit==='ativo'?100 : 50;

    const multasPend = pendingRows('multas', ds.multas).length;
    const scoreMultas = ds.multas.length===0 ? 100 : Math.max(15, 100 - ds.multas.length*12 - multasPend*10);

    const totalOcorrencias = (ds.sinistros||[]).length + ds.brat.length;
    const ocorrenciasPend = pendingRows('sinistros', ds.sinistros||[]).length + pendingRows('brat', ds.brat).length;
    const scoreOcorrencias = totalOcorrencias===0 ? 100 : Math.max(15, 100 - ocorrenciasPend*20 - (totalOcorrencias-ocorrenciasPend)*5);

    const scorePendencias = ds.pendencias.length===0 ? 100 : Math.max(10, 100 - ds.pendencias.length*12);

    return [
      {key:'manutencao', label:'Manutenção em dia', score:scoreManutencao, weight:H360_HEALTH_WEIGHTS.manutencao, detail: diasSemManutencao==null ? 'sem registro' : `${diasSemManutencao} dia${diasSemManutencao===1?'':'s'} desde a última`},
      {key:'tacografo', label:'Tacógrafo', score:scoreTacografo, weight:H360_HEALTH_WEIGHTS.tacografo, detail: tacDias==null ? 'sem registro' : tacDias<0 ? 'vencido' : `vence em ${tacDias}d`},
      {key:'disponibilidade', label:'Disponibilidade', score:scoreDisponibilidade, weight:H360_HEALTH_WEIGHTS.disponibilidade, detail: parado ? 'parado/manutenção' : 'ativo no cadastro'},
      {key:'oleo', label:'Troca de óleo', score:scoreOleo, weight:H360_HEALTH_WEIGHTS.oleo, detail: lastOleo ? oilStatus(lastOleo).text : 'sem registro'},
      {key:'multas', label:'Multas', score:scoreMultas, weight:H360_HEALTH_WEIGHTS.multas, detail:`${ds.multas.length} registrada${ds.multas.length===1?'':'s'}`},
      {key:'ocorrencias', label:'Ocorrências', score:scoreOcorrencias, weight:H360_HEALTH_WEIGHTS.ocorrencias, detail:`${totalOcorrencias} registrada${totalOcorrencias===1?'':'s'}`},
      {key:'pendencias', label:'Pendências', score:scorePendencias, weight:H360_HEALTH_WEIGHTS.pendencias, detail:`${ds.pendencias.length} em aberto`},
    ];
  }
  function h360HealthScore(ds){
    const factors = h360HealthFactors(ds);
    const totalWeight = factors.reduce((s,f)=>s+f.weight, 0);
    const score = Math.round(factors.reduce((s,f)=>s+f.score*f.weight, 0) / totalWeight);
    const band = score>=90 ? {key:'excelente', label:'Excelente'}
      : score>=75 ? {key:'bom', label:'Bom'}
      : score>=60 ? {key:'atencao', label:'Atenção'}
      : {key:'critico', label:'Crítico'};
    return {score, band, factors};
  }
  function h360HealthCardHtml(ds){
    const h = h360HealthScore(ds);
    const totalSegs = 20;
    const filled = Math.round(totalSegs * h.score / 100);
    const segs = Array.from({length:totalSegs}, (_,i)=>`<i class="${i<filled ? 'fill-'+h.band.key : ''}"></i>`).join('');
    return `<section class="clean-panel h360-panel h360-wide h360-health">
      <div class="clean-head"><h3>Índice de Saúde do Veículo</h3><small>calculado a partir dos registros desta placa</small></div>
      <div class="h360-health-body">
        <div class="h360-health-score"><b>${h.score}<small>%</small></b><span class="h360-health-badge ${h.band.key}">${esc(h.band.label)}</span></div>
        <div class="h360-health-mid"><div class="h360-health-bar">${segs}</div></div>
        <div class="h360-health-factors">${h.factors.map(f=>`<div class="h360-hf"><span>${esc(f.label)}</span><b>${Math.round(f.score)}</b><small>${esc(f.detail)}</small></div>`).join('')}<div class="h360-hf h360-hf-nt"><span>Documentação</span><b>—</b><small>CRLV/seguro sem dado ainda</small></div><div class="h360-hf h360-hf-nt"><span>Consumo</span><b>—</b><small>sem dado por veículo ainda</small></div></div>
      </div>
      <div class="h360-health-meta">${esc(h.factors.length)} de ${esc(h.factors.length+2)} critérios medidos — Documentação e Consumo ainda não têm fonte de dado no sistema.
      </div>
    </section>`;
  }

  function h360OverviewHtml(ds){
    const v = ds.veiculo || {};
    const lastOleo = ds.oleo.slice().sort((a,b)=>String(b.data_ultima_troca||b.data||'').localeCompare(String(a.data_ultima_troca||a.data||'')))[0];
    const nextTac = ds.tacografos.slice().sort((a,b)=>daysUntil(a.data_validade||a.validade)-daysUntil(b.data_validade||b.validade))[0];
    const events = h360Events(ds).slice(0,6);
    return `<div class="h360-overview-grid">
      ${h360HealthCardHtml(ds)}
      <section class="clean-panel h360-panel"><div class="clean-head"><h3>Pendências críticas</h3><small>${ds.pendencias.length} item${ds.pendencias.length===1?'':'s'}</small></div><div class="h360-alert-list">${ds.pendencias.length ? ds.pendencias.slice(0,8).map(p=>`<button class="h360-alert js-h360-module" data-page="${esc(p.key)}" type="button"><span>${tag(p.titulo, p.cls || 'amber')}</span><small>${esc(p.detalhe || '')}</small></button>`).join('') : '<div class="clean-empty small">Nenhuma pendência crítica encontrada.</div>'}</div></section>
      <section class="clean-panel h360-panel"><div class="clean-head"><h3>Resumo operacional</h3><small>situação atual da placa</small></div><div class="h360-facts">
        <div><span>Status</span><b>${esc(STATUS[v.status] || v.status || 'Não informado')}</b></div>
        <div><span>Motorista</span><b>${esc(h360DriverLabel(v.motorista))}</b></div>
        <div><span>RENAVAM</span><b>${esc(v.renavam || 'Não informado')}</b></div>
        <div><span>Última movimentação</span><b>${esc(ds.lastDate ? fmtDate(ds.lastDate) : '-')}</b></div>
        <div><span>Óleo</span><b>${esc(lastOleo ? oilStatus(lastOleo).text : 'Sem registro')}</b></div>
        <div><span>Tacógrafo</span><b>${esc(nextTac ? dateAlertText(nextTac.data_validade || nextTac.validade) : 'Sem registro')}</b></div>
        <div><span>Custo total</span><b>${esc(brl(ds.totalMan + ds.totalMultas + (ds.totalSinistros||0)))}</b></div>
      </div></section>
      <section class="clean-panel h360-panel h360-wide"><div class="clean-head"><h3>Últimos eventos</h3><small>${events.length} mais recentes</small></div>${events.length ? `<div class="h360-mini-events">${events.map(ev=>`<button class="h360-mini-event js-h360-module" data-page="${esc(ev.key)}" type="button"><b>${esc(fmtDate(String(ev.date || '').slice(0,10)))} • ${esc(ev.modulo)}</b><span>${esc(ev.title)}</span><small>${esc(ev.detail || '')}</small></button>`).join('')}</div>` : '<div class="clean-empty small">Nenhum evento encontrado.</div>'}</section>
    </div>`;
  }
  function h360CostsHtml(ds){

    const items = [
      ['Manutenções', ds.totalMan],
      ['Multas', ds.totalMultas],
      ['Sinistros/Avarias', ds.totalSinistros || 0],
      ['Total geral', ds.totalMan + ds.totalMultas + (ds.totalSinistros || 0)]
    ];
    const byMonth = new Map();
    ds.manutencoes.forEach(r=>{ const m=ym(r.data); if(m) byMonth.set(m, (byMonth.get(m)||0)+keyMoney('manutencoes', r)); });
    ds.multas.forEach(r=>{ const m=ym(r.data); if(m) byMonth.set(m, (byMonth.get(m)||0)+keyMoney('multas', r)); });
    (ds.sinistros||[]).forEach(r=>{ const m=ym(r.data); if(m) byMonth.set(m, (byMonth.get(m)||0)+keyMoney('sinistros', r)); });
    const rows = Array.from(byMonth.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,v])=>({mes:m,total:v}));
    return `<div class="h360-costs"><section class="clean-panel h360-panel"><div class="clean-head"><h3>Custos consolidados</h3><small>manutenções + multas + sinistros</small></div>${barsHtml(items.map(([label,value])=>[label,value]))}</section><section class="clean-panel h360-panel"><div class="clean-head"><h3>Custos por mês</h3><small>${rows.length} mês${rows.length===1?'':'es'}</small></div>${rows.length ? `<div class="table-card h360-table"><div class="table-wrap"><table class="data-table"><thead><tr><th>Mês</th><th>Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(monthLabel(r.mes))}</td><td><b>${esc(brl(r.total))}</b></td></tr>`).join('')}</tbody></table></div></div>` : '<div class="clean-empty small">Sem custos com data para consolidar.</div>'}</section></div>`;
  }
  function h360DriversHtml(ds){
    const map = new Map();
    const add = (nome, type) => {
      h360DriverParts(nome).filter(n => !h360IsMechanicName(n)).forEach(n => {
        const item = map.get(n) || {motorista:n, multas:0, pontos:0, brat:0, producao:0, formularios:0, ultimo:''};
        item[type] = (item[type] || 0) + 1;
        map.set(n, item);
      });
    };
    ds.multas.forEach(r=>add(r.motorista, 'multas'));
    ds.pontos.forEach(r=>add(r.motorista, 'pontos'));
    ds.brat.forEach(r=>add(r.motorista, 'brat'));
    ds.producao.forEach(r=>add(r.responsaveis || r.responsavel, 'producao'));
    ds.formularios.forEach(r=>add(r.motorista, 'formularios'));
    if(ds.veiculo?.motorista) add(ds.veiculo.motorista, 'atual');
    const rows = Array.from(map.values()).sort((a,b)=>String(a.motorista).localeCompare(String(b.motorista)));
    if(!rows.length) return '<div class="clean-empty">Nenhum motorista vinculado a esta placa nos registros carregados.</div>';
    return `<div class="table-card h360-table"><div class="table-wrap"><table class="data-table"><thead><tr><th>Motorista</th><th>Multas</th><th>Pontos</th><th>BRAT</th><th>Produção/Formulários</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.motorista)}</b></td><td>${esc(r.multas || 0)}</td><td>${esc(r.pontos || 0)}</td><td>${esc(r.brat || 0)}</td><td>${esc((r.producao || 0) + (r.formularios || 0))}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function h360CardPanel(title, rows, empty, renderer){
    return `<section class="clean-panel h360-blue-panel"><div class="clean-head"><h3>${esc(title)}</h3><small>${rows.length} registro${rows.length===1?'':'s'}</small></div><div class="clean-card-list h360-card-list">${rows.length ? rows.map(r => renderer(r, true)).join('') : `<div class="clean-empty">${esc(empty)}</div>`}</div></section>`;
  }
  function h360ManutencoesHtml(ds){
    return `<div class="h360-module-blue">${h360CardPanel('Manutenções da placa', ds.manutencoes, 'Nenhuma manutenção encontrada para esta placa.', manutencaoCardHtml)}</div>`;
  }
  function h360OleoHtml(ds){
    return `<div class="h360-module-blue">${h360CardPanel('Troca de Óleo da placa', ds.oleo, 'Nenhuma troca de óleo para esta placa.', oleoCardHtml)}</div>`;
  }
  function h360TacografosHtml(ds){
    return `<div class="h360-module-blue">${h360CardPanel('Tacógrafos da placa', ds.tacografos, 'Nenhum tacógrafo para esta placa.', tacografoCardHtml)}</div>`;
  }
  function h360DocumentacaoHtml(ds){
    return `<section class="clean-panel h360-panel h360-wide"><div class="clean-head"><h3>Documentação</h3><small>CRLV, licenciamento, seguro</small></div><div class="clean-empty">Este módulo ainda não está digitalizado no sistema — nenhum CRLV, licenciamento ou apólice de seguro é cadastrado por veículo hoje.<br>O Tacógrafo tem seu próprio controle de aferições e validade, numa aba independente — não faz parte da Documentação.</div></section>`;
  }
  function h360TabHtml(ds){
    const tab = state.historico360.tab || 'visao';
    if(tab === 'timeline') return h360TimelineHtml(ds);
    if(tab === 'multas') return h360Table('multas', ds.multas);
    if(tab === 'manutencoes') return h360ManutencoesHtml(ds);
    if(tab === 'oleo') return h360OleoHtml(ds);
    if(tab === 'tacografos') return h360TacografosHtml(ds);
    if(tab === 'documentacao') return h360DocumentacaoHtml(ds);
    if(tab === 'ocorrencias') return `<div class="h360-split">${h360Table('sinistros', ds.sinistros||[], 'Nenhum sinistro/avaria para esta placa.')}${h360Table('brat', ds.brat, 'Nenhum BRAT/ocorrência para esta placa.')}${h360Table('producao', ds.producao, 'Nenhuma produção do dia para esta placa.')}${h360Table('formularios', ds.formularios, 'Nenhum formulário para esta placa.')}${h360Table('chamados', ds.chamados||[], 'Nenhum chamado registrado para esta placa.')}</div>`;
    if(tab === 'custos') return h360CostsHtml(ds);
    if(tab === 'motoristas') return h360DriversHtml(ds);
    if(tab === 'qrcode') return h360QrCodeHtml(ds);
    return h360OverviewHtml(ds);
  }
  function h360QrCodeHtml(ds){
    const v = ds.veiculo;
    if(!v) return `<div class="clean-empty">Selecione um veículo para gerar o QR Code de chamados.</div>`;
    if(!veiculoPlacaSlug(v.placa)) return `<div class="clean-empty">Cadastre a placa deste veículo antes de gerar o QR Code.</div>`;
    return `<div class="qr-modal-box" style="padding:8px 0 4px">
      <canvas id="h360QrCanvas" width="240" height="240"></canvas>
      ${plate(v.placa)}
      <small style="color:var(--muted);text-align:center;max-width:340px">Cole este QR Code no veículo. Ao escanear, o motorista é direcionado direto para a abertura de um chamado, sem login.</small>
      <div class="qr-modal-actions">
        <button class="btn" id="h360QrDownloadBtn" type="button">⬇️ Baixar QR Code (PNG)</button>
        <button class="btn primary" id="h360QrPrintBtn" type="button">🖨️ Imprimir etiqueta</button>
      </div>
    </div>`;
  }
  function h360QrCodeInit(ds){
    const v = ds.veiculo;
    if(!v || !veiculoPlacaSlug(v.placa)) return;
    drawVeiculoQr($('#h360QrCanvas'), v);
    $('#h360QrDownloadBtn')?.addEventListener('click', () => downloadVeiculoQr(v));
    $('#h360QrPrintBtn')?.addEventListener('click', () => printVeiculoQrLabel(v));
  }
  /* ----------------------------------------------------------------------
   * Vehicle3DViewer — modelo demonstrativo (genérico, até existir um modelo
   * real por veículo). Carregado sob demanda (import dinâmico) só quando a
   * Central 360° é aberta, para não pesar o carregamento do resto do
   * sistema. Cada região é um atalho real para uma aba existente — não é
   * decoração, é navegação.
   * -------------------------------------------------------------------- */
  const H360_3D_HOTSPOTS = [
    {key:'cabine', label:'Cabine', tab:'motoristas', anchor:[1.85,2.05,0.75]},
    {key:'motor', label:'Motor', tab:'manutencoes', anchor:[1.32,1.22,0.5]},
    {key:'tanque', label:'Tanque', tab:'oleo', anchor:[0.55,0.98,1.05]},
    {key:'rodas', label:'Rodas', tab:'manutencoes', anchor:[-0.35,0.46,1.05]},
    {key:'implemento', label:'Implemento', tab:'ocorrencias', anchor:[-1.6,1.9,0.85]},
  ];
  const STATUS_3D_MAP = {
    ativo:{label:'Disponível', color:0x22c55e},
    manutencao:{label:'Em manutenção', color:0xffb400},
    inativo:{label:'Parado', color:0xef4444},
  };
  let H360_THREE = null;
  async function ensureThreeJs(){
    if(H360_THREE) return H360_THREE;
    const [THREE, controls] = await Promise.all([
      import('https://unpkg.com/three@0.160.0/build/three.module.js'),
      import('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js'),
    ]);
    H360_THREE = {THREE, OrbitControls: controls.OrbitControls};
    return H360_THREE;
  }
  function h360Vehicle3DHtml(ds){
    const st = STATUS_3D_MAP[String((ds.veiculo||{}).status || 'ativo')] || STATUS_3D_MAP.ativo;
    return `<section class="h360-3d-wrap" id="h3603d" data-plate="${esc(ds.plate)}">
      <div class="h360-3d-eyebrow">Modelo 3D · demonstrativo · <b>${esc(st.label)}</b></div>
      <canvas id="h3603dCanvas"></canvas>
      <div class="h360-3d-loading" id="h3603dLoading"><span class="h360-3d-ring"></span>Carregando modelo 3D</div>
      ${H360_3D_HOTSPOTS.map(h=>`<button class="h360-3d-hotspot" id="h3603d-${h.key}" data-tab="${h.tab}" type="button"><span class="dot"></span><span class="chip">${esc(h.label)}</span></button>`).join('')}
      <div class="h360-3d-controls">
        <button id="h3603dRotate" class="on" type="button" title="Girar automaticamente">↻</button>
        <button id="h3603dReset" type="button" title="Redefinir enquadramento">⤢</button>
      </div>
    </section>`;
  }
  async function initH3603DViewer(ds){
    const wrap = $('#h3603d');
    if(!wrap) return;
    const canvas = $('#h3603dCanvas', wrap);
    const loading = $('#h3603dLoading', wrap);
    let lib;
    try{ lib = await ensureThreeJs(); }
    catch(e){ if(loading) loading.textContent = 'Não foi possível carregar o modelo 3D agora.'; return; }
    if(!$('#h3603d') || $('#h3603d').dataset.plate !== ds.plate) return; // usuário já navegou para outra placa
    const {THREE, OrbitControls} = lib;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0b0a, 14, 30);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(6.2, 3.6, 7.2);
    const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;

    function fit(){
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if(!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w/h;
      camera.updateProjectionMatrix();
    }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 4.5;
    controls.maxDistance = 13;
    controls.maxPolarAngle = Math.PI*0.52;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight(0x8a8a86, 0x0a0a09, 0.55));
    const key = new THREE.DirectionalLight(0xfff3d6, 1.15);
    key.position.set(5,8,4); key.castShadow = true;
    scene.add(key);
    scene.add(new THREE.DirectionalLight(0x3b6ea5, 0.35));

    const ground = new THREE.Mesh(new THREE.CircleGeometry(9,64), new THREE.MeshStandardMaterial({color:0x101110, roughness:1}));
    ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
    scene.add(ground);

    const st = STATUS_3D_MAP[String((ds.veiculo||{}).status || 'ativo')] || STATUS_3D_MAP.ativo;
    const glowMat = new THREE.MeshBasicMaterial({color:st.color, transparent:true, opacity:0.16});
    const glow = new THREE.Mesh(new THREE.CircleGeometry(3.1,64), glowMat);
    glow.rotation.x = -Math.PI/2; glow.position.y = 0.015;
    scene.add(glow);

    const truck = new THREE.Group(); scene.add(truck);
    const graphite = new THREE.MeshStandardMaterial({color:0x2b2b28, roughness:.55, metalness:.35});
    const graphiteDk = new THREE.MeshStandardMaterial({color:0x1c1c1a, roughness:.6, metalness:.3});
    const metal = new THREE.MeshStandardMaterial({color:0x8b8b86, roughness:.35, metalness:.75});
    const glass = new THREE.MeshStandardMaterial({color:0x11151a, roughness:.15, metalness:.2});
    const rubber = new THREE.MeshStandardMaterial({color:0x0d0d0d, roughness:.9});
    const rim = new THREE.MeshStandardMaterial({color:0xcfcac0, roughness:.4, metalness:.7});
    const accent = new THREE.MeshStandardMaterial({color:0xffb400, roughness:.4, metalness:.4, emissive:0xffb400, emissiveIntensity:.12});

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(5.6,.22,1.55), graphiteDk);
    chassis.position.set(.1,.62,0); truck.add(chassis);

    const cab = new THREE.Group(); cab.name='cabine';
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.5,1.35,1.5), graphite); cabBody.position.set(1.85,1.42,0); cabBody.castShadow=true; cab.add(cabBody);
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.42,.22,1.42), graphiteDk); cabRoof.position.set(1.85,2.2,0); cab.add(cabRoof);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(.08,.55,1.3), glass); windshield.position.set(2.58,1.55,0); cab.add(windshield);
    truck.add(cab);

    const motor = new THREE.Group(); motor.name='motor';
    const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(.72,.62,1.05), graphite); engineBlock.position.set(1.32,.82,0); engineBlock.castShadow=true; motor.add(engineBlock);
    const valveCover = new THREE.Mesh(new THREE.BoxGeometry(.5,.12,.9), accent); valveCover.position.set(1.32,1.16,0); motor.add(valveCover);
    truck.add(motor);

    const tank = new THREE.Group(); tank.name='tanque';
    const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,1.7,24), metal); tankBody.rotation.z=Math.PI/2; tankBody.position.set(.55,.62,.78); tankBody.castShadow=true; tank.add(tankBody);
    truck.add(tank);

    const implemento = new THREE.Group(); implemento.name='implemento';
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.7,1.65,1.62), graphite); box.position.set(-1.6,1.48,0); box.castShadow=true; implemento.add(box);
    const boxStripe = new THREE.Mesh(new THREE.BoxGeometry(2.74,.14,1.66), accent); boxStripe.position.set(-1.6,.72,0); implemento.add(boxStripe);
    truck.add(implemento);

    const wheels = new THREE.Group(); wheels.name='rodas';
    function makeWheel(x,z){
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(.46,.46,.34,24), rubber); tire.rotation.x=Math.PI/2; tire.castShadow=true; g.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.36,16), rim); hub.rotation.x=Math.PI/2; g.add(hub);
      g.position.set(x,.46,z); return g;
    }
    [[2.05,.82],[2.05,-.82],[-.35,.82],[-.35,-.82],[-1.75,.82],[-1.75,-.82]].forEach(([x,z])=>wheels.add(makeWheel(x,z)));
    truck.add(wheels);

    function updateHotspots(){
      const rect = wrap.getBoundingClientRect();
      H360_3D_HOTSPOTS.forEach(h=>{
        const el = $('#h3603d-'+h.key);
        if(!el) return;
        const p = new THREE.Vector3(...h.anchor).applyMatrix4(truck.matrixWorld).project(camera);
        const visible = p.z < 1;
        el.style.opacity = visible ? '1' : '0';
        el.style.pointerEvents = visible ? 'auto' : 'none';
        el.style.left = ((p.x*.5+.5)*rect.width) + 'px';
        el.style.top = ((-p.y*.5+.5)*rect.height) + 'px';
      });
    }
    let raf;
    function animate(){
      raf = requestAnimationFrame(animate);
      controls.update();
      updateHotspots();
      renderer.render(scene, camera);
    }
    fit(); animate();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ if(loading) loading.classList.add('hidden'); }));

    const onResize = () => fit();
    window.addEventListener('resize', onResize);

    $('#h3603dRotate')?.addEventListener('click', ev=>{
      controls.autoRotate = !controls.autoRotate;
      ev.currentTarget.classList.toggle('on', controls.autoRotate);
    });
    $('#h3603dReset')?.addEventListener('click', ()=>{ camera.position.set(6.2,3.6,7.2); controls.target.set(0,1.1,0); });
    H360_3D_HOTSPOTS.forEach(h=>{
      $('#h3603d-'+h.key)?.addEventListener('click', ()=> h360SwitchTab(h.tab));
    });

    // limpa o loop/listener quando a Central 360° troca de placa ou fecha
    const stopWatcher = setInterval(()=>{
      const stillHere = $('#h3603d') && $('#h3603d').dataset.plate === ds.plate;
      if(!stillHere){
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        clearInterval(stopWatcher);
      }
    }, 1000);
  }

  /* Troca de aba sem recriar cabeçalho/3D/indicadores — só a área de
     conteúdo é substituída, o que evita recarregar o visualizador 3D e
     mantém a navegação instantânea (uma consulta só, já feita em ds). */
  function h360SwitchTab(tabId){
    const h = state.historico360;
    h.tab = tabId || 'visao';
    const ds = h360Dataset(fullPlate(h.plate || ''));
    $$('.js-h360-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === h.tab));
    const content = $('#h360Content');
    if(content) content.innerHTML = h360TabHtml(ds);
    if(h.tab === 'qrcode') h360QrCodeInit(ds);
    $$('.js-h360-module').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  }

  function renderHistorico360(){
    const h = state.historico360;
    const options = h360VehicleOptions();
    const query = clean(h.search || '');
    const filteredOptions = options.filter(o => !query || clean([o.placa,o.modelo,o.motorista,o.status].join(' ')).includes(query) || fullPlate(o.placa).includes(fullPlate(h.search))).slice(0,30);
    const selected = fullPlate(h.plate || '');
    const ds = selected ? h360Dataset(selected) : null;
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button>${selected ? `<button class="btn primary" id="h360PdfBtn" type="button">Baixar PDF 360°</button>` : ''}`);
    const tabs = [['visao','Visão geral'], ['timeline','Linha do tempo'], ['multas','Multas'], ['manutencoes','Manutenções'], ['oleo','Troca de Óleo'], ['tacografos','Tacógrafo'], ['documentacao','Documentação'], ['ocorrencias','Ocorrências'], ['custos','Custos'], ['motoristas','Motoristas'], ['qrcode','QR Code']];
    $('#pageRoot').innerHTML = `<section class="h360-shell">
      <div class="h360-hero"><div><span class="report-eyebrow">Prontuário do veículo</span><h3>Central 360°</h3><p>Busque uma placa para reunir automaticamente tudo que já existe no sistema: multas, manutenções, sinistros/avarias, óleo, tacógrafo, BRAT, produção, motoristas e custos — num só lugar.</p></div><div class="h360-hero-badge"><b>${esc(options.length)}</b><span>placas encontradas</span></div></div>
      <div class="h360-search"><input class="search" id="h360Search" value="${esc(h.search || '')}" placeholder="Digite a placa, modelo ou motorista..." autocomplete="off" list="h360PlateList"/><datalist id="h360PlateList">${options.map(o=>`<option value="${esc(o.placa)}">${esc([o.modelo,o.motorista].filter(Boolean).join(' • '))}</option>`).join('')}</datalist><button class="btn primary" id="h360OpenBtn" type="button">Abrir Central 360°</button>${selected ? `<button class="btn" id="h360ClearBtn" type="button">Limpar</button>` : ''}</div>
      ${ds ? h360SelectedHtml(ds, tabs) : h360StartHtml(filteredOptions)}
    </section>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#h360Search')?.addEventListener('input', ev => { const pos = ev.target.selectionStart || ev.target.value.length; h.search = ev.target.value; h.plate = ''; renderHistorico360(); const input=$('#h360Search'); if(input){ input.focus(); try{ input.setSelectionRange(pos,pos); }catch(e){} } });
    $('#h360Search')?.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ ev.preventDefault(); h.plate = h360FirstPlateFromSearch(); h.search = h.plate; h.tab = 'visao'; renderHistorico360(); } });
    $('#h360OpenBtn')?.addEventListener('click', () => { h.plate = h360FirstPlateFromSearch(); h.search = h.plate; h.tab = 'visao'; renderHistorico360(); });
    $('#h360ClearBtn')?.addEventListener('click', () => { h.plate=''; h.search=''; h.tab='visao'; renderHistorico360(); });
    $('#h360PdfBtn')?.addEventListener('click', () => exportHistorico360Pdf(ds));
    $$('.js-h360-pick').forEach(btn => btn.addEventListener('click', () => openHistorico360(btn.dataset.plate)));
    $$('.js-h360-tab').forEach(btn => btn.addEventListener('click', () => h360SwitchTab(btn.dataset.tab || 'visao')));
    $$('.js-h360-module').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
    if(ds) initH3603DViewer(ds);
    if(ds && state.historico360.tab === 'qrcode') h360QrCodeInit(ds);
  }
  function h360StartHtml(options){
    if(!options.length) return '<div class="clean-empty">Nenhuma placa encontrada com esse filtro.</div>';
    return `<div class="h360-option-grid">${options.map(o=>`<button class="h360-option js-h360-pick" data-plate="${esc(o.placa)}" type="button"><span class="plate">${esc(o.placa)}</span><b>${esc(o.modelo || 'Veículo sem modelo')}</b><small>${esc([o.motorista, STATUS[o.status] || o.status].filter(Boolean).join(' • ') || 'Abrir ficha completa')}</small></button>`).join('')}</div>`;
  }
  function h360SelectedHtml(ds, tabs){
    const v = ds.veiculo || {};
    const plateLabel = v.placa || ds.plate;
    const totalEventos = Object.values(ds.allRows).reduce((s,arr)=>s+(arr?.length || 0),0);
    const stats = [
      ['Multas', ds.multas.length, brl(ds.totalMultas)],
      ['Manutenções', ds.manutencoes.length, brl(ds.totalMan)],
      ['Sinistros/Avarias', (ds.sinistros||[]).length, brl(ds.totalSinistros||0)],
      ['Óleo', ds.oleo.length, ds.oleo[0] ? oilStatus(ds.oleo[0]).text : 'sem registro'],
      ['Tacógrafos', ds.tacografos.length, ds.tacografos[0] ? dateAlertText(ds.tacografos[0].data_validade || ds.tacografos[0].validade) : 'sem registro'],
      ['Ocorrências', ds.brat.length + ds.formularios.length + (ds.sinistros||[]).length, 'sinistros/BRAT/formulários'],
      ['Pendências', ds.pendencias.length, 'pontos de atenção']
    ];
    return `<div class="h360-selected"><section class="h360-main-card"><div><span class="plate h360-big-plate">${esc(plateLabel)}</span><h3>${esc(v.modelo || 'Veículo sem modelo informado')}</h3><p>${esc(h360VehicleMetaText(v))}</p></div><div class="h360-main-meta"><div><span>Status</span><b>${esc(STATUS[v.status] || v.status || 'Não informado')}</b></div><div><span>Motorista</span><b>${esc(h360DriverLabel(v.motorista))}</b></div><div><span>Último evento</span><b>${esc(ds.lastDate ? fmtDate(ds.lastDate) : '-')}</b></div><div><span>Total de eventos</span><b>${esc(totalEventos)}</b></div></div></section>${h360Vehicle3DHtml(ds)}${statsHtml(stats)}<div class="h360-tabs" id="h360Tabs">${tabs.map(([id,label])=>`<button class="h360-tab js-h360-tab ${state.historico360.tab===id?'active':''}" data-tab="${esc(id)}" type="button">${esc(label)}</button>`).join('')}</div><section class="h360-content" id="h360Content">${h360TabHtml(ds)}</section></div>`;
  }
  function exportHistorico360Pdf(ds){
    if(!ds) return toast('Selecione uma placa para gerar o PDF.');
    const Ctor = window.jspdf && window.jspdf.jsPDF;
    if(!Ctor){ toast('Biblioteca PDF não carregada.'); return; }
    const doc = new Ctor({orientation:'portrait', unit:'mm', format:'a4'});
    const pageW = 210, pageH = 297;
    const GOLD = [245,190,0];
    const INK = [26,26,26];
    const GREEN = [34,153,84];
    const events = h360Events(ds);
    const generated = new Date().toLocaleString('pt-BR');
    const v = ds.veiculo || {};
    const placaTxt = v.placa || ds.plate || '-';

    function header(subtitle){
      doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(0,0,pageW,32,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(0,30,pageW,1.4,'F');
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(0,31.4,pageW,0.6,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(255,255,255); doc.text('FROTA EXEMPLO',14,13);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(GOLD[0],GOLD[1],GOLD[2]); doc.text(subtitle || ('Central 360° — ' + placaTxt),14,21);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(210,210,210);
      doc.text('Placa: ' + placaTxt, pageW-14, 12, {align:'right'});
      doc.text(generated, pageW-14, 19, {align:'right'});
    }
    function section(title, y, small, x){
      x = x || 14;
      doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(x,y,3,6.4,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+6.4,3,1.3,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(small?9:10.5); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(title,x+6,y+5.2);
      return y + (small?10.5:12);
    }
    function kpi(x,y,w,title,value,sub){
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y,w,1.4,'F');
      doc.setDrawColor(226,226,222); doc.setFillColor(255,255,255); doc.roundedRect(x,y+1.4,w,25,1.5,1.5,'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(130,130,126); doc.text(String(title).toUpperCase().slice(0,22),x+3,y+7.6);
      doc.setFontSize(13); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(String(value).slice(0,20),x+3,y+16.2);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.4); doc.setTextColor(150,150,146); doc.text(String(sub||'').slice(0,28),x+3,y+22.6);
    }
    function table(headers, dataRows, x, y, widths, limit=36){
      const h=6.6;
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setFillColor(INK[0],INK[1],INK[2]); doc.setTextColor(255,255,255);
      let cx=x;
      headers.forEach((head,i)=>{ doc.rect(cx,y,widths[i],h,'F'); doc.text(String(head),cx+2,y+4.5); cx+=widths[i]; });
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+h,widths.reduce((a,b)=>a+b,0),0.6,'F');
      y+=h+0.6;
      doc.setFont('helvetica','normal'); doc.setTextColor(40,40,38);
      dataRows.slice(0,limit).forEach((row,idx)=>{
        if(y > pageH-16){ doc.addPage(); header('Central 360° — continuação'); y=40; }
        doc.setFillColor(idx%2?255:247, idx%2?255:246, idx%2?255:239);
        doc.rect(x,y,widths.reduce((a,b)=>a+b,0),h,'F'); cx=x;
        row.forEach((cell,i)=>{ const val=String(cell==null?'':cell).replace(/\s+/g,' '); const lines=doc.splitTextToSize(val,widths[i]-3).slice(0,2); doc.text(lines,cx+2,y+4.5); cx+=widths[i]; });
        y+=h;
      });
      return y+3;
    }
    function barChart(items, x, y, w, color, fmt){
      fmt = fmt || (v => String(v));
      const labelW = 40, valueW = 28, gap = 3, barH = 7;
      const trackW = w - labelW - valueW;
      const max = Math.max(...items.map(it=>it[1]), 1);
      items.forEach(([label, value]) => {
        if(y > pageH - 18){ doc.addPage(); header('Central 360° — continuação'); y = 40; }
        doc.setFont('helvetica','normal'); doc.setFontSize(7.4); doc.setTextColor(80,80,76);
        doc.text(String(label).slice(0,24), x, y+4.6);
        doc.setFillColor(240,240,235); doc.roundedRect(x+labelW, y, trackW, barH, 1,1,'F');
        const segW = Math.max(2, (value/max) * trackW);
        doc.setFillColor(color[0],color[1],color[2]); doc.rect(x+labelW, y, segW, barH, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.4); doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(fmt(value), x+w, y+4.6, {align:'right'});
        y += barH + gap;
      });
      return y + 1;
    }

    header();
    kpi(14,40,43,'Multas', ds.multas.length, brl(ds.totalMultas));
    kpi(61,40,43,'Manutenções', ds.manutencoes.length, brl(ds.totalMan));
    kpi(108,40,43,'Pendências', ds.pendencias.length, 'itens de atenção');
    kpi(155,40,41,'Eventos', events.length, 'linha do tempo');
    let y = 74;

    y = section('Resumo do veículo', y);
    y = table(['Campo','Informação'], [
      ['Placa', placaTxt], ['RENAVAM', v.renavam || '-'], ['Modelo', v.modelo || '-'],
      ['Status', STATUS[v.status] || v.status || '-'], ['Motorista', h360DriverLabel(v.motorista)],
      ['Último evento', ds.lastDate ? fmtDate(ds.lastDate) : '-'], ['Custo total', brl(ds.totalMan + ds.totalMultas)]
    ], 14, y, [52,130], 10);

    y = section('Custos por categoria', y+4);
    y = barChart([['Multas', ds.totalMultas],['Manutenções', ds.totalMan]], 14, y+1, 182, GOLD, brl) + 3;

    if(y > pageH-50){ doc.addPage(); header(); y = 40; }
    y = section('Pendências críticas', y);
    y = table(['Área','Descrição','Detalhe'], ds.pendencias.length ? ds.pendencias.slice(0,18).map(p=>[byKey[p.key]?.title || p.key, p.titulo, p.detalhe]) : [['Geral','Sem pendências críticas','Nenhum alerta encontrado']], 14, y, [35,67,80], 20);

    doc.addPage(); header('Linha do tempo'); y = 40;
    y = section(events.length + ' evento(s), mais recentes primeiro', y, true);
    y = table(['Data','Módulo','Registro','Detalhe','Valor/Status'], events.map(ev=>[fmtDate(String(ev.date || '').slice(0,10)), ev.modulo, ev.title, ev.detail, ev.value || ev.status]), 14, y, [24,28,44,58,28], 80);

    const totalPages = doc.internal.getNumberOfPages();
    for(let p=1; p<=totalPages; p++){
      doc.setPage(p);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(160,160,156);
      doc.text('FROTA EXEMPLO', 14, 291);
      doc.text(String(p) + '/' + totalPages, pageW-14, 291, {align:'right'});
    }
    const slug = String(placaTxt || 'veiculo').toLowerCase().replace(/[^a-z0-9]+/g,'-');
    doc.save('central-360-' + slug + '-' + new Date().toISOString().slice(0,10) + '.pdf');
  }

  function goPageFiltered(key, patch){
    if(patch) state.filters[key] = Object.assign({}, state.filters[key], patch);
    showPage(key);
  }
  function greetingWord(){
    const h = new Date().getHours();
    if(h < 5) return 'Boa madrugada';
    if(h < 12) return 'Bom dia';
    if(h < 18) return 'Boa tarde';
    return 'Boa noite';
  }
  function countBarsHtml(items, unit){
    if(!items.length) return '<p class="muted">Sem dados suficientes.</p>';
    const max = Math.max(...items.map(x=>x[1]), 1);
    return `<div class="chart-bars">${items.map(([label,val])=>`<div class="bar-row"><span>${esc(label)}</span><div class="bar"><span style="width:${Math.max(2, val/max*100)}%"></span></div><b>${esc(val)}${unit?(' '+esc(unit)):''}</b></div>`).join('')}</div>`;
  }
  let DASH_CLOCK_TIMER = null;
  function renderDashboard(){
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button><button class="btn" id="exportAllBtn" type="button">Exportar CSV</button><button class="btn" id="exportMultasBtn" type="button">Exportar multas CSV</button>`);

    const man = state.data.manutencoes || [];
    const multas = state.data.multas || [];
    const veic = state.data.veiculos || [];
    const oleo = state.data.oleo || [];
    const tac = state.data.tacografos || [];
    const sinistros = state.data.sinistros || [];
    const brat = state.data.brat || [];
    const producao = state.data.producao || [];
    const q = state.dashboardSearch || '';

    const emManutencao = veic.filter(r => clean(r.status||'').includes('manut'));
    const inativos = veic.filter(r => clean(r.status||'').includes('inativ'));
    const veiculosParados = [...emManutencao, ...inativos];
    const disponiveis = Math.max(0, veic.length - emManutencao.length - inativos.length);
    const disponibilidadePct = veic.length ? Math.round(disponiveis/veic.length*100) : null;

    const multasPend = pendingRows('multas', multas).sort((a,b)=>Number(multaPrioridadeAtiva(b))-Number(multaPrioridadeAtiva(a)) || Number(b.id||0)-Number(a.id||0));
    const oleoLatest = latestOilPerPlate(oleo);
    const oleoAlert = oleoLatest.filter(r => oilStatus(r).cls !== 'green').sort((a,b)=>oilValidityDate(a).localeCompare(oilValidityDate(b)));
    const tacAlert = tac.filter(r => daysUntil(r.data_validade||r.validade) <= 30).sort((a,b)=>daysUntil(a.data_validade||a.validade)-daysUntil(b.data_validade||b.validade));
    const sinistrosAbertos = pendingRows('sinistros', sinistros);
    const bratAbertos = pendingRows('brat', brat);
    const ocorrenciasAbertas = sinistrosAbertos.length + bratAbertos.length;

    const hoje = new Date().toISOString().slice(0,10);
    const thisMonth = ym(hoje);
    const producaoHoje = producao.filter(r => String(r.data||'').slice(0,10) === hoje).length;
    const custosMes = sumMoney('manutencoes', man.filter(r=>ym(r.data)===thisMonth)) + sumMoney('multas', multas.filter(r=>ym(r.data)===thisMonth)) + sumMoney('sinistros', sinistros.filter(r=>ym(r.data)===thisMonth));
    const totalPendencias = multasPend.length + oleoAlert.length + tacAlert.length + ocorrenciasAbertas;

    const u = currentUser();

    /* ---------------- Central de Atenção ---------------- */
    const chamadosAbertos = chamadosAbertosRows();
    const attention = [
      {icon:'🚨', title:'Chamados em aberto', count:chamadosAbertos.length, sub: chamadosAbertos.length ? `${chamadosAbertos.slice(0,3).map(c=>c.placa||'-').join(', ')}` : 'nenhum chamado pendente', cls:'red', onClick:()=>showPage('chamados')},
      {icon:'🔴', title:'Multas pendentes', count:multasPend.length, sub: multasPend.length ? `${brl(sumMoney('multas', multasPend))} em aberto` : 'nenhuma pendente', cls:'red', onClick:()=>goPageFiltered('multas', {status:'pendente'})},
      {icon:'⏱️', title:'Tacógrafos vencendo', count:tacAlert.length, sub:'aferições nos próximos 30 dias', cls:'amber', onClick:()=>showPage('tacografos')},
      {icon:'🔧', title:'Veículos em manutenção', count:emManutencao.length, sub: emManutencao.length ? emManutencao.slice(0,3).map(v=>v.placa||'-').join(', ') : 'nenhum parado', cls:'blue', onClick:()=>goPageFiltered('veiculos', {status:'manutencao'})},
      {icon:'🛢', title:'Trocas de óleo pendentes', count:oleoAlert.length, sub:'verificar ou vencidas', cls:'amber', onClick:()=>showPage('oleo')},
      {icon:'🚨', title:'Ocorrências abertas', count:ocorrenciasAbertas, sub:`${sinistrosAbertos.length} sinistro/avaria • ${bratAbertos.length} BRAT`, cls:'red', onClick:()=>showPage('sinistros')},
    ];

    /* ---------------- Indicadores principais ---------------- */
    const indicadores = [
      {icon:'🚛', label:'Total de veículos', value:veic.length, sub:'cadastrados'},
      {icon:'🟢', label:'Disponíveis', value:disponiveis, sub: disponibilidadePct!=null ? `${disponibilidadePct}% da frota` : ''},
      {icon:'🔧', label:'Em manutenção', value:emManutencao.length, sub:'parados na oficina'},
      {icon:'🚫', label:'Indisponíveis', value:inativos.length, sub:'fora de operação'},
      {icon:'⚠️', label:'Pendências', value:totalPendencias, sub:'itens de atenção'},
      {icon:'💰', label:'Custos do mês', value:brl(custosMes), sub:monthLabel(thisMonth)},
      {icon:'⛽', label:'Consumo médio', value:'—', sub:'não rastreado por veículo ainda', nt:true},
      {icon:'📊', label:'Produção do dia', value:producaoHoje, sub:'apontamentos hoje'},
    ];

    /* ---------------- Resumo executivo ---------------- */
    const resumo = [
      ['Veículos disponíveis', disponiveis],
      ['Veículos parados', emManutencao.length + inativos.length],
      ['Custos do mês', brl(custosMes)],
      ['Consumo médio', 'Não rastreado ainda'],
      ['Multas pendentes', multasPend.length],
      ['Documentos vencendo', tacAlert.length],
      ['Trocas de óleo pendentes', oleoAlert.length],
      ['Produções registradas hoje', producaoHoje],
    ];

    /* ---------------- Ações rápidas ---------------- */
    const quickActions = [
      {icon:'＋', label:'Nova Multa', key:'multas'},
      {icon:'🔧', label:'Nova Manutenção', key:'manutencoes'},
      {icon:'🚛', label:'Novo Veículo', key:'veiculos'},
      {icon:'📋', label:'Nova Produção', key:'producao'},
      {icon:'🛢', label:'Nova Troca de Óleo', key:'oleo'},
      {icon:'📄', label:'Novo Tacógrafo', key:'tacografos'},
    ];

    /* ---------------- Veículos que exigem atenção ---------------- */
    const attMap = new Map();
    const addAtt = (placaRaw, note, severity) => {
      const p = String(placaRaw||'').trim(); if(!p) return;
      const item = attMap.get(p) || {placa:p, notes:[], severity:0};
      item.notes.push(note);
      item.severity = Math.max(item.severity, severity);
      attMap.set(p, item);
    };
    emManutencao.forEach(v => addAtt(v.placa, 'Em manutenção', 3));
    oleoAlert.forEach(r => addAtt(r.placa, oilStatus(r).text, oilStatus(r).cls==='red' ? 3 : 2));
    tacAlert.forEach(r => addAtt(r.placa, `${dateAlertText(r.data_validade||r.validade)} (tacógrafo)`, daysUntil(r.data_validade||r.validade)<=0 ? 3 : 2));
    multasPend.forEach(r => addAtt(r.placa, `Multa pendente${r.auto?` (${r.auto})`:''}`, 2));
    sinistrosAbertos.forEach(r => addAtt(r.placa, `${r.tipo||'Avaria'} em acompanhamento`, 3));
    const vehiclesAttention = Array.from(attMap.values()).sort((a,b)=>b.severity-a.severity || b.notes.length-a.notes.length).slice(0,8);

    /* ---------------- Atividade recente ---------------- */
    const activity = [];
    man.forEach(r => activity.push({date:r.data||r.created_at, icon:'🔧', title:'Manutenção', detail:`${r.placa?r.placa+' • ':''}${r.servico||r.tipo||'Serviço registrado'}`, who:r.responsavel||''}));
    multas.forEach(r => activity.push({date:r.data||r.created_at, icon:'⚠️', title:'Multa cadastrada', detail:`${r.placa?r.placa+' • ':''}${r.auto||'sem número de auto'}`, who:r.motorista||''}));
    oleo.forEach(r => activity.push({date:r.data_ultima_troca||r.data, icon:'🛢', title:'Troca de óleo', detail:r.placa||'-', who:''}));
    producao.forEach(r => activity.push({date:r.data, icon:'📋', title:'Produção registrada', detail:`${r.placa?r.placa+' • ':''}${r.servico||'apontamento do dia'}`, who:r.responsaveis||r.responsavel||''}));
    tac.forEach(r => activity.push({date:r.data_emissao||r.data, icon:'📄', title:'Documento atualizado', detail:`${r.placa||'tacógrafo'} — aferição`, who:''}));
    const recentActivity = activity.filter(r=>/^\d{4}-\d{2}-\d{2}/.test(String(r.date||''))).sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,10);

    /* ---------------- Gráficos ---------------- */
    const productionWeek = Array.from({length:7}, (_,i)=>{
      const d = new Date(); d.setDate(d.getDate() - (6-i));
      const iso = d.toISOString().slice(0,10);
      const label = d.toLocaleDateString('pt-BR', {weekday:'short'}).replace('.','');
      return [label.charAt(0).toUpperCase()+label.slice(1), producao.filter(r=>String(r.data||'').slice(0,10)===iso).length];
    });

    const globalRows = dashboardSearchRows(q);

    $('#pageRoot').innerHTML = `
      <div class="dash-shell">
        <section class="dash-header">
          <div class="dash-header-greet">
            <span class="dash-header-eyebrow">${esc(greetingWord())}${u && u.nome ? ', ' + esc(u.nome) : ''}</span>
            <h2>O que está acontecendo com a frota hoje?</h2>
            <p>${totalPendencias ? `${totalPendencias} item${totalPendencias===1?'':'s'} pedem sua atenção agora.` : 'Nenhuma pendência crítica no momento — frota em dia.'}</p>
          </div>
          <div class="dash-header-right">
            <div class="dash-header-clock">
              <span id="dashDate">${esc(new Date().toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'}))}</span>
              <b id="dashClock">${esc(new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'}))}</b>
            </div>
            <div class="dash-header-actions">
              <div class="dash-notif-wrap">
                <button class="dash-icon-btn" id="dashNotifBtn" type="button" title="Notificações">
                  🔔${totalPendencias ? `<span class="dash-icon-badge">${totalPendencias>99?'99+':totalPendencias}</span>` : ''}
                </button>
                <div class="dash-dropdown" id="dashNotifMenu">
                  <div class="dash-dropdown-head">Central de Atenção</div>
                  ${attention.filter(it=>it.count>0).length ? attention.filter(it=>it.count>0).sort((a,b)=>b.count-a.count).map((it,i)=>`<button class="dash-dropdown-row js-dash-notif" data-idx="${attention.indexOf(it)}" type="button"><span class="dash-dropdown-icon">${it.icon}</span><span class="dash-dropdown-body"><b>${esc(it.count)} · ${esc(it.title)}</b><small>${esc(it.sub)}</small></span></button>`).join('') : `<div class="dash-dropdown-empty">Nenhuma pendência crítica agora.</div>`}
                </div>
              </div>
            </div>
          </div>
        </section>

        ${veiculosParados.length ? `<section class="priority-box">
          <div class="priority-head">
            <div><h3>Prioridade: veículos parados / em manutenção</h3><p>${veiculosParados.length} veículo${veiculosParados.length===1?'':'s'} indisponíve${veiculosParados.length===1?'l':'is'} separado${veiculosParados.length===1?'':'s'} dos demais alertas para acompanhamento imediato.</p></div>
            <span class="tag red">${veiculosParados.length}</span>
          </div>
          <div class="priority-list">
            ${veiculosParados.map(v=>`<div class="priority-item">
              <span class="priority-icon">🔧</span>
              <div><b>${esc(v.placa || '-')}</b>${esc(v.modelo || v.motorista || '-')}<small>${esc((v.motivo || v.obs || v.observacao || 'sem motivo informado').toUpperCase())}</small></div>
              <button class="btn compact js-dash-vehicle" data-plate="${esc(v.placa)}" type="button">Ver veículo</button>
            </div>`).join('')}
          </div>
        </section>` : ''}

        <section class="dash-attention" id="dashAttention">
          <div class="dash-section-head"><h3>🔎 Central de Atenção</h3><p>O que exige ação imediata — clique para abrir o módulo já filtrado.</p></div>
          <div class="dash-attention-grid">
            ${attention.map((it,i)=>`<button class="dash-attn-card ${it.cls}${it.count===0?' zero':''}" data-idx="${i}" type="button">
              <span class="dash-attn-icon">${it.icon}</span>
              <div class="dash-attn-body"><b class="dash-attn-count">${esc(it.count)}</b><span class="dash-attn-title">${esc(it.title)}</span><small class="dash-attn-sub">${esc(it.sub)}</small></div>
            </button>`).join('')}
            <div class="dash-attn-card nt" title="Ainda não digitalizado no sistema">
              <span class="dash-attn-icon">📄</span>
              <div class="dash-attn-body"><b class="dash-attn-count">—</b><span class="dash-attn-title">Documentação (CRLV/seguro)</span><small class="dash-attn-sub">ainda não rastreada — módulo independente do Tacógrafo</small></div>
            </div>
            <div class="dash-attn-card nt" title="Ainda não digitalizado no sistema">
              <span class="dash-attn-icon">📋</span>
              <div class="dash-attn-body"><b class="dash-attn-count">—</b><span class="dash-attn-title">Checklists pendentes</span><small class="dash-attn-sub">sem checklist digital ainda</small></div>
            </div>
          </div>
        </section>

        <section class="dash-indicators">
          <div class="dash-section-head"><h3>Indicadores principais</h3></div>
          <div class="dash-indicators-grid">
            ${indicadores.map(it=>`<article class="dash-indicator${it.nt?' nt':''}"><span class="dash-ind-icon">${it.icon}</span><b>${esc(it.value)}</b><span>${esc(it.label)}</span><small>${esc(it.sub||'')}</small></article>`).join('')}
          </div>
        </section>

        <div class="dash-mid-grid">
          <section class="clean-panel dash-summary">
            <div class="clean-head"><h3>Resumo de Hoje</h3><small>${esc(new Date().toLocaleDateString('pt-BR'))}</small></div>
            <div class="dash-summary-list">${resumo.map(([k,v])=>`<div class="dash-summary-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
          </section>

          <section class="clean-panel dash-quick">
            <div class="clean-head"><h3>Ações rápidas</h3><small>criar registro</small></div>
            <div class="dash-quick-grid">${quickActions.map((a,i)=>`<button class="dash-quick-btn" data-key="${esc(a.key)}" type="button"><span>${a.icon}</span>${esc(a.label)}</button>`).join('')}</div>
          </section>
        </div>

        <div class="dash-mid-grid">
          <section class="clean-panel dash-vehicles">
            <div class="clean-head"><h3>Veículos que exigem atenção</h3><small>${vehiclesAttention.length} veículo${vehiclesAttention.length===1?'':'s'}</small></div>
            <div class="dash-vehicles-list">${vehiclesAttention.length ? vehiclesAttention.map(v=>`<button class="dash-vehicle-row js-dash-vehicle" data-plate="${esc(v.placa)}" type="button"><span class="plate">${esc(v.placa)}</span><span class="dash-vehicle-notes">${v.notes.map(n=>esc(n)).join(' • ')}</span></button>`).join('') : `<div class="clean-empty small">Nenhum veículo com pendência no momento.</div>`}</div>
          </section>

          <section class="clean-panel dash-activity-panel">
            <div class="clean-head"><h3>Atividade recente</h3><small>últimos ${recentActivity.length} registros</small></div>
            <div class="h360-timeline dash-activity">${recentActivity.length ? recentActivity.map(ev=>`<article class="h360-event"><div class="h360-event-date"><b>${esc(fmtDate(String(ev.date||'').slice(0,10)))}</b><span>${ev.icon} ${esc(ev.title)}</span></div><div class="h360-event-body"><div class="h360-event-title"><strong>${esc(ev.detail)}</strong></div>${ev.who ? `<small>${esc(ev.who)}</small>` : ''}</div></article>`).join('') : '<div class="clean-empty small">Nenhuma atividade registrada ainda.</div>'}</div>
          </section>
        </div>

        <section class="dash-charts">
          <div class="dash-section-head"><h3>Gráficos</h3></div>
          <div class="dash-charts-grid">
            <article class="clean-panel"><div class="clean-head"><h3>Custos por categoria</h3><small>histórico completo</small></div>${barsHtml([['Manutenções', sumMoney('manutencoes', man)], ['Multas', sumMoney('multas', multas)], ['Sinistros/Avarias', sumMoney('sinistros', sinistros)]])}</article>
            <article class="clean-panel"><div class="clean-head"><h3>Produção da semana</h3><small>últimos 7 dias</small></div>${countBarsHtml(productionWeek, 'registro(s)')}</article>
            <article class="clean-panel"><div class="clean-head"><h3>Disponibilidade da frota</h3><small>${veic.length} veículo${veic.length===1?'':'s'} cadastrados</small></div>
              <div class="dash-avail-bar"><i class="ok" style="width:${veic.length?disponiveis/veic.length*100:0}%"></i><i class="warn" style="width:${veic.length?emManutencao.length/veic.length*100:0}%"></i><i class="bad" style="width:${veic.length?inativos.length/veic.length*100:0}%"></i></div>
              <div class="dash-avail-legend"><span class="ok">● Disponíveis (${disponiveis})</span><span class="warn">● Manutenção (${emManutencao.length})</span><span class="bad">● Indisponíveis (${inativos.length})</span></div>
            </article>
            ${monthlyEvolutionHtml('manutencoes', man)}
          </div>
        </section>

        <section class="search-panel">
          <input class="search" id="dashboardSearch" value="${esc(q)}" placeholder="Pesquisa global: placa, motorista, CPF, CNH ou auto..." />
        </section>
        ${q ? dashboardSearchHtml(globalRows) : ''}
      </div>
    `;

    $('#refreshBtn')?.addEventListener('click', () => {
      $$('.dash-indicator b, .dash-attn-count').forEach(el => { el.dataset.realText = el.textContent; el.classList.add('skeleton'); el.textContent = '••'; });
      loadAll({keepPage:true, manual:true});
    });
    $('#exportAllBtn')?.addEventListener('click', () => downloadCsv('frota-resumo.csv', dashboardFlatRows()));
    $('#exportMultasBtn')?.addEventListener('click', () => exportCsv('multas', state.data.multas || []));
    $('#dashboardSearch')?.addEventListener('input', ev => { state.dashboardSearch = ev.target.value; const pos=ev.target.selectionStart||ev.target.value.length; renderDashboard(); const input=$('#dashboardSearch'); if(input){ input.focus(); try{input.setSelectionRange(pos,pos)}catch(e){} } });
    $$('.js-go-page').forEach(btn=>btn.addEventListener('click',()=>showPage(btn.dataset.page)));
    $$('.dash-attn-card[data-idx]').forEach(btn => btn.addEventListener('click', () => attention[Number(btn.dataset.idx)].onClick()));
    $$('.dash-quick-btn').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.key)));
    $$('.js-dash-vehicle').forEach(btn => btn.addEventListener('click', () => openHistorico360(btn.dataset.plate)));

    /* ---------------- Sino de notificações ---------------- */
    const notifBtn = $('#dashNotifBtn'), notifMenu = $('#dashNotifMenu');
    const closeDashMenus = () => { notifMenu?.classList.remove('open'); };
    notifBtn?.addEventListener('click', ev => { ev.stopPropagation(); notifMenu?.classList.toggle('open'); });
    if(!window.__dashMenuOutsideClickBound){
      window.__dashMenuOutsideClickBound = true;
      document.addEventListener('click', () => { $('#dashNotifMenu')?.classList.remove('open'); });
    }
    $$('.js-dash-notif').forEach(btn => btn.addEventListener('click', () => { attention[Number(btn.dataset.idx)].onClick(); closeDashMenus(); }));

    clearInterval(DASH_CLOCK_TIMER);
    DASH_CLOCK_TIMER = setInterval(() => {
      const clockEl = $('#dashClock');
      if(!clockEl){ clearInterval(DASH_CLOCK_TIMER); return; }
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
      const dateEl = $('#dashDate');
      if(dateEl) dateEl.textContent = now.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'});
    }, 1000);
  }

  function daysUntil(date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))) return 9999;
    const d = new Date(date+'T00:00:00'); const t = new Date(); t.setHours(0,0,0,0);
    return Math.ceil((d-t)/86400000);
  }
  function dateAlertText(date){
    const d = daysUntil(date);
    if(d === 9999) return 'Sem validade';
    if(d < 0) return `Vencido há ${Math.abs(d)} dias`;
    if(d === 0) return 'Vence hoje';
    return `Vence em ${d} dias`;
  }
  function alertColumn(title, rows, page, titleFn, subFn, cls){
    return `<div class="alert-col"><h4>${esc(title)} <span class="pill">${rows.length}</span></h4>${rows.length ? rows.map(r=>`<div class="alert-card ${cls||''}"><button class="go js-go-page" data-page="${page}" type="button">→</button><strong>${titleFn(r)}</strong><small>${subFn(r)}</small></div>`).join('') : `<div class="empty-alert">Sem alertas.</div>`}</div>`;
  }
  function dashboardSearchRows(q){
    const query = clean(q || ''); if(!query) return [];
    const rows = [];
    operationalKeys.forEach(key => (state.data[key]||[]).forEach(r => { if(clean(Object.values(r).join(' ')).includes(query)) rows.push({modulo:byKey[key].title, key, ...r}); }));
    return rows.slice(0,50);
  }
  function dashboardSearchHtml(rows){
    if(!rows.length) return `<div class="empty">Nenhum resultado encontrado na pesquisa global.</div>`;
    return `<div class="table-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Módulo</th><th>Placa/Nome</th><th>Descrição</th><th>Ação</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.modulo)}</td><td>${plate(r.placa||r.carro||'') || esc(r.nome||r.motorista||'-')}</td><td><div class="desc">${esc(r.descricao||r.infracao||r.servico||r.motivo||r.obs||r.auto||'')}</div></td><td><button class="btn compact js-go-page" data-page="${esc(r.key)}" type="button">Abrir</button></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function dashboardFlatRows(){
    return [
      {indicador:'veiculos', valor:(state.data.veiculos||[]).length},
      {indicador:'multas_total', valor:sumMoney('multas', state.data.multas||[])},
      {indicador:'manutencoes_total', valor:sumMoney('manutencoes', state.data.manutencoes||[])},
      {indicador:'sinistros_total', valor:sumMoney('sinistros', state.data.sinistros||[])},
      {indicador:'pontos_total', valor:(state.data.pontos||[]).reduce((s,r)=>s+toNum(r.pontos),0)}
    ];
  }

  function renderFormularios(){
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button>`);
    $('#pageRoot').innerHTML = `
      <section class="module-maintenance">
        <div class="maintenance-icon">🛠️</div>
        <div>
          <span class="maintenance-eyebrow">Módulo em manutenção</span>
          <h3>Formulários de Defeito</h3>
          <p>Este módulo foi deixado vazio propositalmente para ser refeito futuramente em uma versão mais estável e organizada.</p>
          <p class="maintenance-note">Nenhum dado antigo foi exibido aqui nesta versão para não misturar formulários importados com manutenções ou com os demais controles.</p>
        </div>
      </section>`;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
  }

  function topBy(rows, labelField, valueField, limit){
    const map = new Map();
    rows.forEach(r => { const k = r[labelField] || '-'; map.set(k, (map.get(k)||0) + toNum(r[valueField])); });
    return Array.from(map.entries()).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value).slice(0,limit);
  }
  function groupMoneyByMonth(rows, dateField, valueField){
    const map = new Map();
    rows.forEach(r => { const m = ym(r[dateField]); if(m) map.set(m, (map.get(m)||0)+toNum(r[valueField])); });
    return Array.from(map.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,v])=>[monthLabel(m),v]);
  }
  function barsHtml(items){
    if(!items.length) return '<p class="muted">Sem dados suficientes.</p>';
    const max = Math.max(...items.map(x=>toNum(x[1] ?? x.value)), 1);
    return `<div class="chart-bars">${items.map(x=>{ const label=x[0] ?? x.label; const val=toNum(x[1] ?? x.value); return `<div class="bar-row"><span>${esc(label)}</span><div class="bar"><span style="width:${Math.max(2, val/max*100)}%"></span></div><b>${brl(val)}</b></div>`; }).join('')}</div>`;
  }

  function renderFinanceiro(){
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button><button class="btn" id="financeCsvBtn" type="button">Exportar resumo CSV</button><button class="btn" id="financePdfBtn" type="button">Exportar PDF</button>`);
    const man = state.data.manutencoes || [];
    const multas = state.data.multas || [];
    const sinistros = state.data.sinistros || [];
    const oleo = state.data.oleo || [];
    const manTotal = sumMoney('manutencoes', man);
    const multaTotal = sumMoney('multas', multas);
    const sinistroTotal = sumMoney('sinistros', sinistros);
    const months = Array.from(new Set([...man.map(r=>ym(r.data)), ...multas.map(r=>ym(r.data)), ...sinistros.map(r=>ym(r.data))].filter(Boolean))).sort().reverse();
    const rows = months.map(m => ({
      mes:m,
      manutencoes: sumMoney('manutencoes', man.filter(r=>ym(r.data)===m)),
      multas: sumMoney('multas', multas.filter(r=>ym(r.data)===m)),
      sinistros: sumMoney('sinistros', sinistros.filter(r=>ym(r.data)===m)),
      oleo: oleo.filter(r=>ym(r.data)===m).length
    }));
    $('#pageRoot').innerHTML = `
      ${statsHtml([
        ['Total manutenções', brl(manTotal), 'histórico'],
        ['Total multas', brl(multaTotal), 'histórico'],
        ['Sinistros/Avarias', brl(sinistroTotal), 'histórico'],
        ['Total geral', brl(manTotal + multaTotal + sinistroTotal), 'custos consolidados']
      ])}
      <div class="grid cards-2">
        <article class="card"><h3>Manutenções por mês</h3>${barsHtml(rows.slice(0,8).map(r=>[monthLabel(r.mes), r.manutencoes]))}</article>
        <article class="card"><h3>Sinistros e avarias por mês</h3>${barsHtml(rows.slice(0,8).map(r=>[monthLabel(r.mes), r.sinistros]))}</article>
      </div>
      <div style="height:14px"></div>
      <div class="table-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Mês</th><th>Manutenções</th><th>Multas</th><th>Sinistros/Avarias</th><th>Total</th><th>Trocas de óleo</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${monthLabel(r.mes)}</td><td>${brl(r.manutencoes)}</td><td>${brl(r.multas)}</td><td>${brl(r.sinistros)}</td><td><b>${brl(r.manutencoes+r.multas+r.sinistros)}</b></td><td>${r.oleo}</td></tr>`).join('')}</tbody></table></div></div>
    `;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#financeCsvBtn')?.addEventListener('click', () => downloadCsv('financeiro-resumo.csv', rows));
    $('#financePdfBtn')?.addEventListener('click', () => exportFinancialPdf(rows, {manTotal,multaTotal,sinistroTotal}));
  }

  function last12Cutoff(){
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function reportPeriodLabel(){
    if(state.reportMonth === 'last12') return 'Últimos 12 meses';
    return state.reportMonth ? monthLabel(state.reportMonth) : 'Todos os meses';
  }
  function monthlyEvolutionHtml(key, rows){
    const map = new Map();
    rows.forEach(r => { const m = reportDateMonth(key, r); if(m) map.set(m, (map.get(m)||0)+1); });
    const items = Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
    if(!items.length) return '';
    const max = Math.max(...items.map(x=>x[1]), 1);
    return `<section class="clean-panel report-evolution">
      <div class="clean-head"><h3>Evolução mensal</h3><small>últimos meses</small></div>
      <div class="evolution-bars">${items.map(([m,v])=>`<div class="evolution-row"><span class="evolution-label">${esc(monthLabel(m))}</span><div class="evolution-track"><i style="width:${Math.max(4, Math.round(v/max*100))}%"></i></div><b class="evolution-value">${v} ${v===1?'registro':'registros'}</b></div>`).join('')}</div>
    </section>`;
  }
  function severityBucket(g){
    const s = clean(g || '');
    if(s.includes('gravissima')) return 'gravissima';
    if(s.includes('grave')) return 'grave';
    if(s.includes('media') || s.includes('média')) return 'media';
    if(s.includes('leve')) return 'leve';
    return 'outra';
  }
  function titleCaseName(v){
    return String(v || '').toLowerCase().replace(/(^|\s)([a-zà-ÿ])/g, (m,sep,c) => sep + c.toUpperCase()).trim();
  }
  function driverRankingRows(rows, limit=5){
    const map = new Map();
    rows.forEach(r => {
      const raw = String(r.motorista || r.condutor || r.real_infrator || '').trim();
      const n = clean(raw);
      if(!n || n === 's/n' || n.startsWith('resp')) return;
      if(!map.has(n)) map.set(n, {name: titleCaseName(raw), total:0, leve:0, media:0, grave:0, gravissima:0, outra:0});
      const e = map.get(n);
      e.total++;
      e[severityBucket(r.gravidade)]++;
    });
    return Array.from(map.values()).sort((a,b) => b.total - a.total).slice(0, limit);
  }
  function driverRankingHtml(rows){
    const ranking = driverRankingRows(rows, 5);
    if(!ranking.length) return '';
    const max = Math.max(...ranking.map(d=>d.total), 1);
    return `<section class="clean-panel driver-ranking">
      <div class="clean-head"><h3>Ranking de motoristas</h3><small>top 5 por número de multas</small></div>
      <div class="driver-rank-list">${ranking.map((d,i) => `<div class="driver-rank-row">
          <span class="driver-rank-pos">${i+1}</span>
          <span class="driver-rank-name">${esc(d.name)}</span>
          <div class="driver-rank-track">
            ${d.gravissima ? `<i class="seg-gravissima" style="width:${d.gravissima/max*100}%"></i>` : ''}
            ${d.grave ? `<i class="seg-grave" style="width:${d.grave/max*100}%"></i>` : ''}
            ${d.media ? `<i class="seg-media" style="width:${d.media/max*100}%"></i>` : ''}
            ${d.leve ? `<i class="seg-leve" style="width:${d.leve/max*100}%"></i>` : ''}
            ${d.outra ? `<i class="seg-outra" style="width:${d.outra/max*100}%"></i>` : ''}
          </div>
          <b class="driver-rank-total">${d.total} ${d.total===1?'multa':'multas'}</b>
        </div>`).join('')}</div>
      <div class="driver-rank-legend">
        <span><i class="seg-leve"></i>Leve</span>
        <span><i class="seg-media"></i>Média</span>
        <span><i class="seg-grave"></i>Grave</span>
        <span><i class="seg-gravissima"></i>Gravíssima</span>
      </div>
    </section>`;
  }
  function renderRelatorios(){
    setActions(`<button class="btn" id="refreshBtn" type="button">Atualizar dados</button>`);
    const selectable = MODULES.filter(m => m.table && m.key !== 'lixeira');
    const months = state.reportModule === 'formularios' ? Array.from(new Set([...formulariosRows().map(r=>r.mes||ym(r.data)), ...formulariosPdfs().map(p=>p.mes)].filter(Boolean))).sort().reverse() : getMonths(state.reportModule);
    const rows = reportRows();
    const cfg = byKey[state.reportModule] || {};
    $('#pageRoot').innerHTML = `
      <section class="report-shell">
        <div class="report-hero">
          <div>
            <span class="report-eyebrow">Relatório executivo</span>
            <h3>${esc(cfg.title || 'Relatório')}</h3>
            <p>Selecione módulo e mês para gerar uma visão limpa, com prévia, totais corrigidos e exportação.</p>
          </div>
          <div class="report-badge"><span>${esc(reportPeriodLabel())}</span><b>${rows.length}</b><small>registros</small></div>
        </div>
        <div class="report-controls">
          <label><span>Módulo</span><select class="select" id="reportModule">${selectable.map(m=>`<option value="${m.key}" ${state.reportModule===m.key?'selected':''}>${esc(m.title)}</option>`).join('')}</select></label>
          <label><span>Período</span><select class="select" id="reportMonth">
            <option value="">Todos os meses</option>
            <option value="last12" ${state.reportMonth==='last12'?'selected':''}>Últimos 12 meses</option>
            ${months.map(m=>`<option value="${m}" ${state.reportMonth===m?'selected':''}>${monthLabel(m)}</option>`).join('')}
          </select></label>
          <div class="report-actions enhanced">
            <button class="btn primary" id="reportPdf" type="button">Baixar PDF executivo</button>
            <button class="btn" id="reportCsv" type="button">Baixar CSV</button>
          </div>
        </div>
        ${statsHtml(reportStats(state.reportModule, rows))}
        ${reportInsightHtml(state.reportModule, rows)}
      </section>
      <div style="height:14px"></div>
      ${monthlyEvolutionHtml(state.reportModule, rows)}
      ${state.reportModule === 'multas' ? `<div style="height:14px"></div>${driverRankingHtml(rows)}` : ''}
      <div style="height:14px"></div>
      <section class="clean-panel report-preview">
        <div class="clean-head"><h3>Prévia do relatório</h3><small>mostrando até 150 registros</small></div>
        ${tableHtmlForRows(state.reportModule, rows.slice(0,150))}
      </section>
    `;
    $('#refreshBtn')?.addEventListener('click', () => loadAll({keepPage:true, manual:true}));
    $('#reportModule')?.addEventListener('change', ev => { state.reportModule = ev.target.value; state.reportMonth=''; renderRelatorios(); });
    $('#reportMonth')?.addEventListener('change', ev => { state.reportMonth = ev.target.value; renderRelatorios(); });
    $('#reportCsv')?.addEventListener('click', () => exportCsv(state.reportModule, rows));
    $('#reportPdf')?.addEventListener('click', () => exportPdf(state.reportModule, rows));
  }
  function reportDateMonth(key, r){
    const cfg = byKey[key] || {};
    return r?.mes || ym(r?.[cfg.dateField || 'data']) || ym(r?.data) || ym(r?.data_validade) || ym(r?.validade) || (key === 'oleo' ? ym(oilValidityDate(r)) : '');
  }
  function reportRows(){
    const key = state.reportModule;
    const source = key === 'formularios' ? formulariosRows() : (state.data[key] || []);
    if(state.reportMonth === 'last12'){
      const cutoff = last12Cutoff();
      return source.filter(r => { const m = reportDateMonth(key, r); return m && m >= cutoff; });
    }
    return source.filter(r => !state.reportMonth || reportDateMonth(key, r) === state.reportMonth);
  }
  function reportStats(key, rows){
    const pend = pendingRows(key, rows).length;
    const placas = new Set(rows.map(r=>canonicalPlate(r.placa || r.carro || '')).filter(Boolean)).size;
    if(key === 'multas') return [['Registros', rows.length, 'no período'], ['Pendentes', pend, 'em aberto'], ['Valor pendente', brl(sumMoney(key, pendingRows(key, rows))), 'corrigido'], ['Valor total', brl(sumMoney(key, rows)), 'no período']];
    if(key === 'manutencoes') return [['Registros', rows.length, 'no período'], ['Pendentes', pend, 'em aberto'], ['Valor pendente', brl(sumMoney(key, pendingRows(key, rows))), 'corrigido'], ['Veículos', placas, 'envolvidos']];
    if(key === 'oleo') return [['Registros', rows.length, 'no período'], ['Vencidas', rows.filter(r=>oilSituationValue(r)==='vencido').length, 'fora do prazo'], ['Verificar', rows.filter(r=>oilSituationValue(r)==='verificar').length, 'último mês antes do vencimento'], ['Ativas', rows.filter(r=>oilSituationValue(r)==='ativo').length, 'mais de 1 mês restante']];
    if(key === 'tacografos') return [['Registros', rows.length, 'no período'], ['Vencidos', rows.filter(r=>daysUntil(r.data_validade||r.validade)<0).length, 'fora do prazo'], ['Até 30 dias', rows.filter(r=>{ const d=daysUntil(r.data_validade||r.validade); return d>=0 && d<=30; }).length, 'atenção'], ['Veículos', placas, 'envolvidos']];
    if(key === 'pontos') return [['Registros', rows.length, 'no período'], ['Pontuação', rows.reduce((s,r)=>s+toNum(r.pontos),0), 'pontos totais'], ['Pendentes', pend, 'em aberto'], ['Motoristas', new Set(rows.map(r=>r.motorista).filter(Boolean)).size, 'envolvidos']];
    if(key === 'formularios') return [['Registros OCR', rows.length, 'no período'], ['Pendentes', rows.filter(r=>!finalStatus('formularios', r)).length, 'para revisar'], ['PDFs', formulariosPdfs().filter(p=>!state.reportMonth || p.mes===state.reportMonth).length, 'arquivos'], ['Meses', new Set(rows.map(r=>r.mes||ym(r.data)).filter(Boolean)).size, 'com registros']];
    return [['Registros', rows.length, 'no período'], ['Pendências', pend, 'em aberto'], ['Veículos', placas, 'envolvidos'], ['Total', reportTotal(rows), 'resumo']];
  }
  function reportInsightHtml(key, rows){
    const cfg = byKey[key] || {};
    const periodo = reportPeriodLabel();
    const pend = pendingRows(key, rows);
    const last = rows.map(r=>r.data || r.data_ultima_troca || r.data_validade || r.validade || r.created_at || '').filter(Boolean).sort().pop();
    const topPlacas = Array.from(rows.reduce((map,r)=>{ const p=canonicalPlate(r.placa||r.carro||''); if(p) map.set(p,(map.get(p)||0)+1); return map; }, new Map()).entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const criticalText = key === 'oleo'
      ? `${rows.filter(r=>oilSituationValue(r)==='vencido').length} troca(s) vencida(s).`
      : key === 'tacografos'
        ? `${rows.filter(r=>daysUntil(r.data_validade||r.validade)<=30).length} tacógrafo(s) vencidos ou próximos do vencimento.`
        : `${pend.length} pendência(s) em aberto.`;
    return `<div class="report-insights">
      <article class="report-card"><span>Período analisado</span><b>${esc(periodo)}</b><small>${esc(cfg.title || '-')} • ${rows.length} registro${rows.length===1?'':'s'}</small></article>
      <article class="report-card"><span>Ponto de atenção</span><b>${esc(criticalText)}</b><small>Usa os mesmos critérios de pendência do menu lateral.</small></article>
      <article class="report-card"><span>Último lançamento</span><b>${esc(last ? fmtDate(String(last).slice(0,10)) : '-')}</b><small>Baseado nas datas disponíveis do módulo.</small></article>
      <article class="report-card"><span>Placas mais citadas</span><b>${topPlacas.length ? esc(topPlacas.map(x=>`${x[0]} (${x[1]})`).join(', ')) : '-'}</b><small>Até 5 placas com mais registros no filtro.</small></article>
    </div>`;
  }
  function reportTotal(rows){
    const key = state.reportModule;
    if(key === 'manutencoes' || key === 'multas' || key === 'sinistros') return brl(sumMoney(key, rows));
    if(key === 'pontos') return rows.reduce((s,r)=>s+toNum(r.pontos),0) + ' pontos';
    return rows.length + ' registros';
  }
  function tableHtmlForRows(key, rows){
    const cfg = byKey[key];
    if(!rows.length) return `<div class="empty">Nenhum registro encontrado.</div>`;
    return `<div class="table-card"><div class="table-wrap"><table class="data-table"><thead><tr>${cfg.columns.map(c=>`<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cfg.columns.map(c=>`<td>${cell(r,c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderLixeira(){
    const rows = (state.data.lixeira || []).filter(r => !r.restored_at);
    const limite = new Date(Date.now() - TRASH_PURGE_DIAS*86400000).toISOString();
    const antigos = rows.filter(r => String(r.deleted_at || r.created_at || '') < limite);
    setActions(`<button class="btn" id="refreshTrashBtn" type="button">Atualizar lixeira</button>` +
      (!isReadOnly() && antigos.length ? `<button class="btn danger" id="purgeOldTrashBtn" type="button" title="Apaga de forma permanente os itens e seus arquivos, liberando espaço">Excluir definitivamente +${TRASH_PURGE_DIAS} dias (${antigos.length})</button>` : '') +
      (!isReadOnly() && rows.length ? `<button class="btn danger" id="purgeAllTrashBtn" type="button" title="Apaga de forma permanente todos os itens da lixeira e seus arquivos">Excluir tudo (${rows.length})</button>` : ''));
    $('#pageRoot').innerHTML = `
      ${statsHtml([['Na lixeira', rows.length, 'registros'], ['Módulos', new Set(rows.map(r=>r.modulo)).size, 'com exclusões'], ['Hoje', rows.filter(r=>String(r.deleted_at||r.created_at||'').slice(0,10)===new Date().toISOString().slice(0,10)).length, 'exclusões'], ['Restauráveis', rows.filter(r=>r.dados).length, 'com payload']])}
      ${rows.length ? `<div class="table-card"><div class="table-wrap"><table class="data-table"><thead><tr><th>Data</th><th>Módulo</th><th>Título</th><th>Tabela</th><th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmtDate(String(r.deleted_at||r.created_at||'').slice(0,10))}</td><td>${esc(byKey[r.modulo]?.title || r.modulo)}</td><td>${esc(r.titulo || titleFromTrash(r))}</td><td>${esc(r.tabela_origem||'')}</td><td><div class="row-actions"><button class="icon-btn js-restore" data-id="${esc(r.id)}" type="button">Restaurar</button>${isReadOnly() ? '' : `<button class="icon-btn danger js-purge" data-id="${esc(r.id)}" type="button" title="Excluir definitivamente (apaga também os arquivos)">🗑</button>`}</div></td></tr>`).join('')}</tbody></table></div></div>` : `<div class="empty">A lixeira está vazia.</div>`}
    `;
    $('#refreshTrashBtn')?.addEventListener('click', loadTrash);
    $('#purgeOldTrashBtn')?.addEventListener('click', () => purgeTrash(antigos.map(r => String(r.id))));
    $('#purgeAllTrashBtn')?.addEventListener('click', () => purgeTrash(rows.map(r => String(r.id))));
    $$('.js-restore').forEach(btn => btn.addEventListener('click', () => restoreTrash(btn.dataset.id)));
    $$('.js-purge').forEach(btn => btn.addEventListener('click', () => purgeTrash([String(btn.dataset.id)])));
  }
  function titleFromTrash(r){
    const d = parsePayload(r.dados) || {};
    return [d.placa, d.nome || d.motorista, d.servico || d.infracao, d.data].filter(Boolean).join(' • ') || `Registro ${r.registro_id}`;
  }

  /* ------------------------------------------------------------------------
   * Auditoria — histórico automático (via trigger no banco) de criar/editar/
   * excluir em todas as tabelas operacionais. Carregada sob demanda (só
   * quando a página é aberta), não faz parte do loadAll() geral.
   *
   * Layout: filtros compactos + tabela ordenável com separador por dia e
   * paginação. Clique na linha abre o detalhe (antes/depois campo a campo).
   * ---------------------------------------------------------------------- */
  const AUDIT_LIMIT = 1000;
  const AUDIT_PAGE_SIZE = 50;
  const AUDIT_HIDDEN_FIELDS = new Set(['id','created_at','updated_at']);
  const AUDIT_EXTRA_MODULES = {usuarios:'Usuários', profiles:'Usuários'};
  const ACAO_LABEL = {criar:'Criação', editar:'Edição', excluir:'Exclusão'};
  const ACAO_VERB = {criar:'criou', editar:'editou', excluir:'excluiu'};
  const ACAO_CLS = {criar:'green', editar:'amber', excluir:'red'};

  async function fetchAuditoria(){
    const db = connect();
    if(!db) return {rows:[], error:'Sem conexão com o Supabase.'};
    const {data, error} = await db.from('auditoria').select('*').order('criado_em', {ascending:false}).limit(AUDIT_LIMIT);
    if(error){ console.warn('Falha ao carregar auditoria:', error); return {rows:[], error: error.message || 'Erro desconhecido.'}; }
    return {rows: data || [], error:null};
  }
  function humanizeKey(k){
    const s = String(k||'').replace(/_/g,' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function auditoriaModuleTitle(tableName){
    if(AUDIT_EXTRA_MODULES[tableName]) return AUDIT_EXTRA_MODULES[tableName];
    const m = MODULES.find(x => x.table === tableName);
    return m ? m.title : humanizeKey(tableName);
  }
  function auditoriaFieldLabel(campo){
    const cfg = MODULES.map(m=>m.fields||[]).flat().find(f=>f[0]===campo);
    return cfg ? cfg[1] : humanizeKey(campo);
  }
  function auditoriaValueText(v){
    if(v === null || v === undefined || v === '') return '<span class="aud-null">vazio</span>';
    if(v === true) return 'Sim';
    if(v === false) return 'Não';
    if(typeof v === 'object'){ const j = JSON.stringify(v); return esc(j.length > 160 ? j.slice(0,157)+'…' : j); }
    const s = String(v);
    if(/^\d{4}-\d{2}-\d{2}T/.test(s)){ const d = new Date(s); if(!isNaN(d)) return esc(d.toLocaleString('pt-BR')); }
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return esc(s.split('-').reverse().join('/'));
    return esc(s.length > 160 ? s.slice(0,157)+'…' : s);
  }
  function auditoriaPayload(r){
    let a = r.alteracoes;
    if(typeof a === 'string'){ try{ a = JSON.parse(a); }catch(_){ a = null; } }
    return (a && typeof a === 'object') ? a : {};
  }
  /* Normaliza as alterações de uma linha em [{campo, antes, depois}] (edição)
     ou [{campo, valor}] (criação/exclusão). */
  function auditoriaChanges(r){
    const a = auditoriaPayload(r);
    if(r.acao === 'editar'){
      return Object.entries(a)
        .filter(([k,v]) => !AUDIT_HIDDEN_FIELDS.has(k) && !k.startsWith('_') && v && typeof v === 'object' && ('antes' in v || 'depois' in v))
        .map(([k,v]) => ({campo:k, antes:v.antes, depois:v.depois}));
    }
    const rec = (r.acao === 'criar' ? a.novo : a.removido) || {};
    return Object.entries(rec)
      .filter(([k,v]) => !AUDIT_HIDDEN_FIELDS.has(k) && v !== null && v !== '' && v !== undefined)
      .map(([k,v]) => ({campo:k, valor:v}));
  }
  /* Para o módulo Usuários: nome da pessoa afetada pela ação. */
  function auditoriaTarget(r){
    if(r.modulo !== 'usuarios' && r.modulo !== 'profiles') return '';
    const a = auditoriaPayload(r);
    const t = a._alvo || a.novo || a.removido || {};
    return t.nome ? (t.usuario ? `${t.nome} (${t.usuario})` : t.nome) : '';
  }
  function auditoriaSummary(r){
    const ch = auditoriaChanges(r);
    if(r.acao === 'editar'){
      if(!ch.length) return '—';
      const labels = ch.slice(0,2).map(c => auditoriaFieldLabel(c.campo));
      return labels.join(', ') + (ch.length > 2 ? ` +${ch.length-2}` : '');
    }
    const rec = Object.fromEntries(ch.map(c => [c.campo, c.valor]));
    const main = ['nome','motorista','servico','infracao','tipo','descricao','titulo'].map(k => rec[k]).find(Boolean);
    if(main) return String(main).length > 48 ? String(main).slice(0,45)+'…' : String(main);
    return r.acao === 'criar' ? 'Novo registro' : 'Registro removido';
  }
  function auditoriaInitial(name){
    const s = String(name||'').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }
  function auditoriaDayLabel(iso){
    const d = new Date(iso); if(isNaN(d)) return '—';
    const today = new Date(), yest = new Date(Date.now() - 86400000);
    const localKey = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
    if(localKey(d) === localKey(today)) return 'Hoje';
    if(localKey(d) === localKey(yest)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'2-digit', year:'numeric'});
  }
  function auditoriaLocalDay(iso){
    const d = new Date(iso); if(isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function renderAuditoria(){
    if(!state.user || state.user.perfil !== 'admin'){
      $('#pageRoot').innerHTML = `<div class="empty">Este módulo é restrito a administradores. Seu perfil tem acesso somente leitura ao restante do sistema.</div>`;
      setActions('');
      return;
    }
    setActions(`<button class="btn" id="refreshAuditBtn" type="button">Atualizar</button>`);
    state.auditoriaFilter = state.auditoriaFilter || {q:'', modulo:'', acao:'', de:'', ate:''};
    state.auditoriaSort = state.auditoriaSort || {key:'data', dir:'desc'};
    state.auditoriaPage = 0;
    const f = state.auditoriaFilter;
    $('#pageRoot').innerHTML = `
      <div class="table-card pres-card" id="presencaPanel"></div>
      <div class="aud-toolbar">
        <input class="search aud-q" id="auditQ" type="search" placeholder="Buscar por usuário, placa, registro ou campo..." value="${esc(f.q||'')}" />
        <select class="select" id="auditModulo"><option value="">Todos os módulos</option></select>
        <label class="aud-date"><span>De</span><input class="search" id="auditDe" type="date" value="${esc(f.de||'')}" /></label>
        <label class="aud-date"><span>Até</span><input class="search" id="auditAte" type="date" value="${esc(f.ate||'')}" /></label>
        <button class="btn ghost" id="auditClear" type="button">Limpar filtros</button>
      </div>
      <div class="aud-seg" id="auditSeg" role="tablist" aria-label="Filtrar por ação"></div>
      <div class="table-card aud-card"><div id="auditoriaList"><div class="aud-state">Carregando auditoria...</div></div></div>`;
    $('#refreshAuditBtn')?.addEventListener('click', () => { loadAndRenderAuditoria(); loadPresencaUsuarios(); });
    state.presencaFiltro = state.presencaFiltro || '';
    renderPresenca();
    loadPresencaUsuarios();
    const onFilter = () => {
      state.auditoriaFilter = {
        q: $('#auditQ')?.value || '',
        modulo: $('#auditModulo')?.value || '',
        acao: state.auditoriaFilter.acao || '',
        de: $('#auditDe')?.value || '',
        ate: $('#auditAte')?.value || '',
      };
      state.auditoriaPage = 0;
      renderAuditoriaList();
    };
    ['auditQ','auditModulo','auditDe','auditAte'].forEach(id => {
      $('#'+id)?.addEventListener('input', onFilter);
      $('#'+id)?.addEventListener('change', onFilter);
    });
    $('#auditClear')?.addEventListener('click', () => {
      state.auditoriaFilter = {q:'', modulo:'', acao:'', de:'', ate:''};
      ['auditQ','auditDe','auditAte'].forEach(id => { const el = $('#'+id); if(el) el.value = ''; });
      const m = $('#auditModulo'); if(m) m.value = '';
      state.auditoriaPage = 0;
      renderAuditoriaList();
    });
    loadAndRenderAuditoria();
  }
  /* Painel "Quem está online": todos os usuários cadastrados + quem está com o
     sistema aberto agora (presença em tempo real). */
  async function loadPresencaUsuarios(){
    const db = connect(); if(!db) return;
    const {data, error} = await db.rpc('fn_admin_listar_usuarios');
    if(!error){ state.usuariosRows = data || []; renderPresenca(); }
  }
  function renderPresenca(){
    const box = $('#presencaPanel'); if(!box) return;
    const online = state.presenceOnline || {};
    const porId = new Map((state.usuariosRows || []).filter(u => u.status !== 'inativo').map(u => [u.id, {...u}]));
    Object.values(online).forEach(o => { if(!porId.has(o.id)) porId.set(o.id, {id:o.id, nome:o.nome, perfil:o.perfil}); });
    const todos = [...porId.values()].map(u => ({...u, on: online[u.id] || null}))
      .sort((a,b) => (b.on?1:0) - (a.on?1:0) || String(a.nome||'').localeCompare(String(b.nome||''), 'pt-BR'));
    const nOn = todos.filter(u => u.on).length;
    const filtro = state.presencaFiltro || '';
    const lista = todos.filter(u => filtro === 'online' ? u.on : filtro === 'offline' ? !u.on : true);
    const hora = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}); };
    const conectado = !!state.presenceReady;
    box.innerHTML = `
      <div class="pres-head">
        <b>Quem está online</b>
        <span class="pres-count"><i></i>${nOn} online agora</span>
        <span class="pres-seg" role="tablist" aria-label="Filtrar usuários">
          ${[['','Todos'],['online','Online'],['offline','Offline']].map(([k,l]) => `<button type="button" class="${filtro===k?'active':''}" data-pres="${k}" aria-selected="${filtro===k}">${l}</button>`).join('')}
        </span>
      </div>
      ${!conectado ? '<div class="aud-state">Conectando ao status em tempo real...</div>' : !lista.length ? `<div class="aud-state">${filtro==='online' ? 'Ninguém online no momento.' : filtro==='offline' ? 'Todos os usuários estão online.' : 'Nenhum usuário encontrado.'}</div>` : `
      <ul class="pres-list">${lista.map(u => `
        <li class="${u.on ? 'is-on' : ''}">
          <span class="aud-user"><i>${esc(auditoriaInitial(u.nome))}<em class="pres-dot" title="${u.on ? 'Online' : 'Offline'}"></em></i>${esc(u.nome || 'Usuário')}${state.user && u.id === state.user.id ? ' <small class="usr-you">você</small>' : ''}</span>
          <small>${u.on ? `Online desde ${esc(hora(u.on.desde))}${u.on.sessoes > 1 ? ` · ${u.on.sessoes} abas/aparelhos` : ''}` : (u.ultimo_acesso ? `Offline · último acesso ${esc(fmtDateTimeBR(u.ultimo_acesso))}` : 'Offline · nunca acessou')}</small>
        </li>`).join('')}</ul>`}`;
    $$('[data-pres]', box).forEach(b => b.addEventListener('click', () => { state.presencaFiltro = b.dataset.pres; renderPresenca(); }));
  }
  async function loadAndRenderAuditoria(){
    const list = $('#auditoriaList');
    if(list) list.innerHTML = '<div class="aud-state">Carregando auditoria...</div>';
    const {rows, error} = await fetchAuditoria();
    state.auditoriaRows = rows;
    state.auditoriaError = error;
    // opções do filtro de módulo: só os que realmente aparecem na auditoria
    const sel = $('#auditModulo');
    if(sel){
      const cur = state.auditoriaFilter.modulo || '';
      const mods = [...new Set(rows.map(r => r.modulo).filter(Boolean))].sort((a,b) => auditoriaModuleTitle(a).localeCompare(auditoriaModuleTitle(b), 'pt-BR'));
      sel.innerHTML = `<option value="">Todos os módulos</option>` + mods.map(m => `<option value="${esc(m)}" ${m===cur?'selected':''}>${esc(auditoriaModuleTitle(m))}</option>`).join('');
    }
    renderAuditoriaList();
  }
  function auditoriaFiltered(ignoreAcao){
    const f = state.auditoriaFilter || {};
    const q = clean(f.q || '');
    return (state.auditoriaRows || []).filter(r => {
      if(f.modulo && r.modulo !== f.modulo) return false;
      if(!ignoreAcao && f.acao && r.acao !== f.acao) return false;
      const day = auditoriaLocalDay(r.criado_em);
      if(f.de && day < f.de) return false;
      if(f.ate && day > f.ate) return false;
      if(q){
        const hay = clean([r.usuario_nome, r.placa, r.registro_id, auditoriaTarget(r), auditoriaModuleTitle(r.modulo), auditoriaSummary(r)].join(' '));
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function auditoriaSorted(rows){
    const {key, dir} = state.auditoriaSort || {key:'data', dir:'desc'};
    const val = r => key === 'usuario' ? clean(r.usuario_nome||'') : key === 'modulo' ? clean(auditoriaModuleTitle(r.modulo)) : key === 'acao' ? r.acao : new Date(r.criado_em).getTime();
    const mul = dir === 'asc' ? 1 : -1;
    return rows.slice().sort((a,b) => {
      const x = val(a), y = val(b);
      if(x < y) return -1*mul; if(x > y) return 1*mul;
      return (new Date(b.criado_em) - new Date(a.criado_em));
    });
  }
  function renderAuditoriaList(){
    const list = $('#auditoriaList');
    if(!list) return;
    const seg = $('#auditSeg');
    const f = state.auditoriaFilter || {};

    // segmented control com contagem (respeita os outros filtros, exceto a própria ação)
    const base = auditoriaFiltered(true);
    const cnt = {'':base.length, criar:0, editar:0, excluir:0};
    base.forEach(r => { if(cnt[r.acao] !== undefined) cnt[r.acao]++; });
    if(seg){
      seg.innerHTML = [['', 'Todas'], ['criar','Criações'], ['editar','Edições'], ['excluir','Exclusões']]
        .map(([k,label]) => `<button type="button" role="tab" class="${(f.acao||'')===k?'active':''} ${k?'is-'+k:''}" data-acao="${k}" aria-selected="${(f.acao||'')===k}"><i></i>${label}<em>${cnt[k]}</em></button>`).join('');
      $$('button', seg).forEach(b => b.addEventListener('click', () => {
        state.auditoriaFilter = {...state.auditoriaFilter, acao: b.dataset.acao};
        state.auditoriaPage = 0;
        renderAuditoriaList();
      }));
    }

    if(state.auditoriaError){
      const missing = /relation|does not exist|schema cache|permission|denied/i.test(state.auditoriaError);
      list.innerHTML = `<div class="aud-state is-error"><b>Não foi possível carregar a auditoria.</b><span>${esc(state.auditoriaError)}</span>${missing ? '<span>Confira se o script <code>docs/sql/001_auth_profiles_auditoria.sql</code> foi executado no Supabase e se o seu usuário é administrador.</span>' : ''}</div>`;
      return;
    }
    const rows = auditoriaSorted(auditoriaFiltered(false));
    if(!rows.length){
      list.innerHTML = `<div class="aud-state">${(state.auditoriaRows||[]).length ? 'Nenhum registro encontrado com esses filtros.' : 'Ainda não há registros na auditoria.'}</div>`;
      return;
    }
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
    state.auditoriaPage = Math.min(Math.max(0, state.auditoriaPage||0), pages-1);
    const start = state.auditoriaPage * AUDIT_PAGE_SIZE;
    const pageRows = rows.slice(start, start + AUDIT_PAGE_SIZE);
    const sort = state.auditoriaSort || {key:'data', dir:'desc'};
    const th = (key, label) => `<th class="aud-sortable ${sort.key===key?'is-sorted':''}" data-sort="${key}" aria-sort="${sort.key===key?(sort.dir==='asc'?'ascending':'descending'):'none'}"><button type="button">${label}<span class="aud-arrow">${sort.key===key?(sort.dir==='asc'?'▲':'▼'):''}</span></button></th>`;
    const groupByDay = sort.key === 'data';
    let lastDay = null;
    const body = pageRows.map(r => {
      let sep = '';
      if(groupByDay){
        const day = auditoriaLocalDay(r.criado_em);
        if(day !== lastDay){ lastDay = day; sep = `<tr class="aud-daysep"><td colspan="7">${esc(auditoriaDayLabel(r.criado_em))}</td></tr>`; }
      }
      const d = new Date(r.criado_em);
      const hora = isNaN(d) ? '—' : d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
      const data = isNaN(d) ? '—' : d.toLocaleDateString('pt-BR');
      const alvo = auditoriaTarget(r);
      const reg = r.placa ? `<span class="plate">${esc(r.placa)}</span>` : alvo ? `<span>${esc(alvo)}</span>` : (r.registro_id ? `<span class="aud-id">#${esc(String(r.registro_id).slice(0,8))}</span>` : '<span class="aud-null">—</span>');
      return `${sep}<tr class="aud-row" tabindex="0" data-id="${esc(r.id)}">
        <td class="aud-when"><b>${esc(data)}</b><small>${esc(hora)}</small></td>
        <td><span class="aud-user ${isUserOnline(r.usuario_id) ? 'is-on' : ''}"><i>${esc(auditoriaInitial(r.usuario_nome))}${isUserOnline(r.usuario_id) ? '<em class="pres-dot" title="Online agora"></em>' : ''}</i>${esc(r.usuario_nome || 'Usuário removido')}</span></td>
        <td><span class="aud-act is-${esc(r.acao)}"><i></i>${esc(ACAO_LABEL[r.acao]||r.acao)}</span></td>
        <td>${esc(auditoriaModuleTitle(r.modulo))}</td>
        <td>${reg}</td>
        <td class="aud-sum">${esc(auditoriaSummary(r))}</td>
        <td class="aud-go" aria-hidden="true">›</td>
      </tr>`;
    }).join('');
    const capped = (state.auditoriaRows||[]).length >= AUDIT_LIMIT;
    list.innerHTML = `
      <div class="table-wrap"><table class="data-table aud-table"><thead><tr>
        ${th('data','Data / hora')}${th('usuario','Usuário')}${th('acao','Ação')}${th('modulo','Módulo')}<th>Registro</th><th>Alterações</th><th></th>
      </tr></thead><tbody>${body}</tbody></table></div>
      <div class="aud-pager">
        <span>${start+1}–${Math.min(start+AUDIT_PAGE_SIZE, total)} de ${total} registros${capped ? ` <small>(exibindo os ${AUDIT_LIMIT} mais recentes)</small>` : ''}</span>
        <span class="aud-pager-btns">
          <button class="btn" type="button" id="audPrev" ${state.auditoriaPage<=0?'disabled':''}>Anterior</button>
          <small>Página ${state.auditoriaPage+1} de ${pages}</small>
          <button class="btn" type="button" id="audNext" ${state.auditoriaPage>=pages-1?'disabled':''}>Próxima</button>
        </span>
      </div>`;
    $$('th.aud-sortable', list).forEach(h => h.addEventListener('click', () => {
      const k = h.dataset.sort, cur = state.auditoriaSort || {key:'data', dir:'desc'};
      state.auditoriaSort = {key:k, dir: cur.key === k ? (cur.dir === 'asc' ? 'desc' : 'asc') : (k === 'data' ? 'desc' : 'asc')};
      state.auditoriaPage = 0;
      renderAuditoriaList();
    }));
    $$('tr.aud-row', list).forEach(tr => {
      const open = () => openAuditoriaDetail(tr.dataset.id);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', ev => { if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); open(); } });
    });
    $('#audPrev')?.addEventListener('click', () => { state.auditoriaPage--; renderAuditoriaList(); list.scrollIntoView({block:'nearest'}); });
    $('#audNext')?.addEventListener('click', () => { state.auditoriaPage++; renderAuditoriaList(); list.scrollIntoView({block:'nearest'}); });
  }
  function openAuditoriaDetail(id){
    const r = (state.auditoriaRows||[]).find(x => String(x.id) === String(id));
    if(!r) return;
    const ch = auditoriaChanges(r);
    const d = new Date(r.criado_em);
    const quando = isNaN(d) ? '—' : d.toLocaleString('pt-BR');
    const info = [
      ['Usuário', esc(r.usuario_nome || 'Usuário removido')],
      ['Data e hora', esc(quando)],
      ['Módulo', esc(auditoriaModuleTitle(r.modulo))],
      [auditoriaTarget(r) ? 'Usuário afetado' : 'Veículo / placa', r.placa ? `<span class="plate">${esc(r.placa)}</span>` : (auditoriaTarget(r) ? esc(auditoriaTarget(r)) : '—')],
      ['ID do registro', r.registro_id ? `<code>${esc(r.registro_id)}</code>` : '—'],
    ];
    let table;
    if(!ch.length){
      table = `<div class="aud-state">Nenhum campo detalhado neste registro.</div>`;
    } else if(r.acao === 'editar'){
      table = `<table class="aud-diff-table"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${ch.map(c => `<tr><td>${esc(auditoriaFieldLabel(c.campo))}</td><td class="aud-old">${auditoriaValueText(c.antes)}</td><td class="aud-new">${auditoriaValueText(c.depois)}</td></tr>`).join('')}</tbody></table>`;
    } else {
      table = `<table class="aud-diff-table"><thead><tr><th>Campo</th><th>${r.acao === 'criar' ? 'Valor cadastrado' : 'Valor removido'}</th></tr></thead><tbody>${ch.map(c => `<tr><td>${esc(auditoriaFieldLabel(c.campo))}</td><td class="${r.acao === 'criar' ? 'aud-new' : 'aud-old'}">${auditoriaValueText(c.valor)}</td></tr>`).join('')}</tbody></table>`;
    }
    const heading = r.acao === 'editar' ? `Campos alterados (${ch.length})` : (r.acao === 'criar' ? 'Dados do registro criado' : 'Dados do registro excluído');
    openSysModal({
      title: `${ACAO_LABEL[r.acao] || r.acao} — ${auditoriaModuleTitle(r.modulo)}`,
      meta: `<span class="aud-act is-${esc(r.acao)}"><i></i>${esc((r.usuario_nome||'Usuário removido') + ' ' + (ACAO_VERB[r.acao]||r.acao))}</span>`,
      body: `<dl class="sys-info">${info.map(([k,v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
             <h4 class="sys-h">${esc(heading)}</h4><div class="aud-diff-wrap">${table}</div>`,
      foot: `<button class="btn" type="button" data-sys-close>Fechar</button>`,
    });
  }

  /* ------------------------------------------------------------------------
   * Modal genérico do sistema (usado por Auditoria e Usuários). Fica separado
   * do #modalBg de propósito: aquele é ligado ao saveModal() dos módulos.
   * ---------------------------------------------------------------------- */
  function openSysModal({title, meta, body, foot, wide}){
    const bg = $('#sysModalBg'); if(!bg) return;
    $('#sysModalTitle').textContent = title || '';
    $('#sysModalMeta').innerHTML = meta || '';
    $('#sysModalBody').innerHTML = body || '';
    $('#sysModalFoot').innerHTML = foot || '';
    bg.querySelector('.modal').classList.toggle('is-wide', !!wide);
    bg.classList.add('open'); bg.setAttribute('aria-hidden','false');
    $$('[data-sys-close]', bg).forEach(b => b.addEventListener('click', closeSysModal));
    const first = bg.querySelector('input:not([disabled]), select, textarea');
    if(first) setTimeout(() => first.focus(), 30);
  }
  function closeSysModal(){
    const bg = $('#sysModalBg'); if(!bg) return;
    bg.classList.remove('open'); bg.setAttribute('aria-hidden','true');
  }
  function setupSysModal(){
    $('#sysModalClose')?.addEventListener('click', closeSysModal);
    $('#sysModalBg')?.addEventListener('click', ev => { if(ev.target.id === 'sysModalBg') closeSysModal(); });
    document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && $('#sysModalBg')?.classList.contains('open')) closeSysModal(); });
  }

  /* ------------------------------------------------------------------------
   * Usuários — cadastro e permissões (administrador / visitante), feito por
   * funções SQL "security definer" (docs/sql/003_gestao_usuarios.sql). O
   * banco confere se quem chama é admin; o front só esconde o que não cabe.
   * ---------------------------------------------------------------------- */
  const PERFIL_INFO = {
    admin: {label:'Administrador', desc:'Cadastra, edita e exclui em todos os módulos, vê a auditoria e gerencia usuários.', cls:'blue'},
    visitante: {label:'Visitante', desc:'Somente leitura: consulta os módulos, sem criar, editar ou excluir.', cls:'gray'},
  };
  function usuarioLogin(email){ return String(email||'').replace(/@frota\.demo$/i, ''); }
  function fmtDateTimeBR(v){ if(!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toLocaleString('pt-BR'); }
  function friendlyRpcError(err){
    const m = String((err && err.message) || err || '');
    if(/function .* does not exist|schema cache|Could not find the function/i.test(m)) return 'As funções de usuários ainda não existem no banco. Execute o script docs/sql/003_gestao_usuarios.sql no Supabase.';
    return m || 'Erro inesperado.';
  }
  function gerarSenha(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const buf = new Uint32Array(10); (window.crypto || window.msCrypto).getRandomValues(buf);
    return Array.from(buf, n => chars[n % chars.length]).join('');
  }

  function renderUsuarios(){
    if(!state.user || state.user.perfil !== 'admin'){
      $('#pageRoot').innerHTML = `<div class="empty">Este módulo é restrito a administradores.</div>`;
      setActions('');
      return;
    }
    setActions(`<button class="btn" id="refreshUsersBtn" type="button">Atualizar</button><button class="btn primary" id="newUserBtn" type="button">Novo usuário</button>`);
    state.usuariosFilter = state.usuariosFilter || {q:'', perfil:'', status:''};
    const f = state.usuariosFilter;
    $('#pageRoot').innerHTML = `
      <div class="aud-toolbar">
        <input class="search aud-q" id="usrQ" type="search" placeholder="Buscar por nome ou usuário..." value="${esc(f.q||'')}" />
        <select class="select" id="usrPerfil"><option value="">Todos os perfis</option><option value="admin" ${f.perfil==='admin'?'selected':''}>Administradores</option><option value="visitante" ${f.perfil==='visitante'?'selected':''}>Visitantes</option></select>
        <select class="select" id="usrStatus"><option value="">Todos os status</option><option value="ativo" ${f.status==='ativo'?'selected':''}>Ativos</option><option value="inativo" ${f.status==='inativo'?'selected':''}>Inativos</option></select>
      </div>
      <div class="table-card aud-card"><div id="usuariosList"><div class="aud-state">Carregando usuários...</div></div></div>`;
    $('#newUserBtn')?.addEventListener('click', () => openUserModal());
    $('#refreshUsersBtn')?.addEventListener('click', () => loadAndRenderUsuarios());
    const onFilter = () => {
      state.usuariosFilter = {q: $('#usrQ')?.value || '', perfil: $('#usrPerfil')?.value || '', status: $('#usrStatus')?.value || ''};
      renderUsuariosList();
    };
    ['usrQ','usrPerfil','usrStatus'].forEach(id => { $('#'+id)?.addEventListener('input', onFilter); $('#'+id)?.addEventListener('change', onFilter); });
    loadAndRenderUsuarios();
  }
  async function loadAndRenderUsuarios(){
    const list = $('#usuariosList');
    if(list) list.innerHTML = '<div class="aud-state">Carregando usuários...</div>';
    const db = connect();
    if(!db){ state.usuariosError = 'Sem conexão com o Supabase.'; state.usuariosRows = []; renderUsuariosList(); return; }
    const {data, error} = await db.rpc('fn_admin_listar_usuarios');
    state.usuariosError = error ? friendlyRpcError(error) : null;
    state.usuariosRows = data || [];
    renderUsuariosList();
  }
  function renderUsuariosList(){
    const list = $('#usuariosList'); if(!list) return;
    if(state.usuariosError){
      list.innerHTML = `<div class="aud-state is-error"><b>Não foi possível carregar os usuários.</b><span>${esc(state.usuariosError)}</span></div>`;
      return;
    }
    const f = state.usuariosFilter || {};
    const q = clean(f.q || '');
    const rows = (state.usuariosRows || []).filter(u => {
      if(f.perfil && u.perfil !== f.perfil) return false;
      if(f.status && u.status !== f.status) return false;
      if(q && !clean(`${u.nome} ${usuarioLogin(u.usuario)}`).includes(q)) return false;
      return true;
    });
    if(!rows.length){ list.innerHTML = `<div class="aud-state">${(state.usuariosRows||[]).length ? 'Nenhum usuário encontrado com esses filtros.' : 'Nenhum usuário cadastrado.'}</div>`; return; }
    const me = state.user && state.user.id;
    list.innerHTML = `
      <div class="table-wrap"><table class="data-table aud-table usr-table"><thead><tr>
        <th>Usuário</th><th>Login</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Criado em</th><th></th>
      </tr></thead><tbody>${rows.map(u => {
        const p = PERFIL_INFO[u.perfil] || {label:u.perfil, cls:'gray'};
        const ativo = u.status !== 'inativo';
        return `<tr data-id="${esc(u.id)}">
          <td><span class="aud-user"><i>${esc(auditoriaInitial(u.nome))}</i>${esc(u.nome)}${u.id === me ? ' <small class="usr-you">você</small>' : ''}</span></td>
          <td><code>${esc(usuarioLogin(u.usuario))}</code></td>
          <td><span class="tag ${p.cls}">${esc(p.label)}</span></td>
          <td><span class="aud-act ${ativo ? 'is-criar' : 'is-excluir'}"><i></i>${ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td>${esc(fmtDateTimeBR(u.ultimo_acesso) || 'Nunca acessou')}</td>
          <td>${esc(fmtDateTimeBR(u.created_at) || '—')}</td>
          <td class="row-actions"><button class="btn" type="button" data-edit="${esc(u.id)}">Editar</button><button class="btn ghost" type="button" data-pass="${esc(u.id)}">Redefinir senha</button></td>
        </tr>`;
      }).join('')}</tbody></table></div>
      <div class="aud-pager"><span>${rows.length} de ${(state.usuariosRows||[]).length} usuários · ${(state.usuariosRows||[]).filter(u=>u.perfil==='admin' && u.status!=='inativo').length} administradores ativos</span></div>`;
    $$('[data-edit]', list).forEach(b => b.addEventListener('click', () => openUserModal((state.usuariosRows||[]).find(u => u.id === b.dataset.edit))));
    $$('[data-pass]', list).forEach(b => b.addEventListener('click', () => openUserPassModal((state.usuariosRows||[]).find(u => u.id === b.dataset.pass))));
  }
  function roleRadio(name, value, checked, title, desc, disabled){
    return `<label class="usr-opt ${checked?'is-on':''} ${disabled?'is-disabled':''}"><input type="radio" name="${name}" value="${value}" ${checked?'checked':''} ${disabled?'disabled':''}><span><b>${esc(title)}</b><small>${esc(desc)}</small></span></label>`;
  }
  function openUserModal(u){
    const edit = !!u;
    const self = edit && state.user && u.id === state.user.id;
    const perfil = edit ? u.perfil : 'visitante';
    const status = edit ? (u.status || 'ativo') : 'ativo';
    openSysModal({
      title: edit ? 'Editar usuário' : 'Novo usuário',
      body: `<div class="usr-form">
        <label class="field"><span>Nome</span><input id="usrNome" maxlength="80" placeholder="Ex.: João Silva" value="${esc(edit ? u.nome : '')}" autocomplete="off"></label>
        <label class="field"><span>Usuário (login)</span><input id="usrLogin" maxlength="40" placeholder="Ex.: joao" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(edit ? usuarioLogin(u.usuario) : '')}" ${edit ? 'disabled' : ''}>
          <small>${edit ? 'O login não pode ser alterado.' : 'Letras minúsculas, números, ponto, hífen ou sublinhado. É o que a pessoa digita na tela de entrada.'}</small></label>
        ${edit ? '' : `<label class="field"><span>Senha inicial</span>
          <div class="usr-pass"><input id="usrSenha" type="password" minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres"><button class="btn ghost" type="button" id="usrSenhaShow">Mostrar</button><button class="btn ghost" type="button" id="usrSenhaGen">Gerar</button></div>
          <small>Repasse a senha para a pessoa. Ela pode trocá-la depois pelo menu do usuário.</small></label>`}
        <fieldset class="usr-fieldset"><legend>Perfil de acesso</legend>
          ${roleRadio('usrPerfil','visitante',perfil==='visitante','Visitante',PERFIL_INFO.visitante.desc,self)}
          ${roleRadio('usrPerfil','admin',perfil==='admin','Administrador',PERFIL_INFO.admin.desc,self)}
          ${self ? '<small>Você não pode alterar o seu próprio perfil.</small>' : ''}
        </fieldset>
        ${edit ? `<fieldset class="usr-fieldset"><legend>Situação</legend>
          ${roleRadio('usrStatus','ativo',status==='ativo','Ativo','Pode entrar no sistema.',self)}
          ${roleRadio('usrStatus','inativo',status==='inativo','Inativo','Acesso bloqueado. O histórico na auditoria é mantido.',self)}
          ${self ? '<small>Você não pode desativar o seu próprio usuário.</small>' : ''}
        </fieldset>` : ''}
        <div class="usr-err" id="usrErr" role="alert" hidden></div>
      </div>`,
      foot: `<button class="btn" type="button" data-sys-close>Cancelar</button><button class="btn primary" type="button" id="usrSave">${edit ? 'Salvar alterações' : 'Criar usuário'}</button>`,
    });
    $$('.usr-opt input').forEach(inp => inp.addEventListener('change', () => {
      $$(`.usr-opt input[name="${inp.name}"]`).forEach(o => o.closest('.usr-opt').classList.toggle('is-on', o.checked));
    }));
    $('#usrSenhaShow')?.addEventListener('click', ev => { const i = $('#usrSenha'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; ev.target.textContent = show ? 'Ocultar' : 'Mostrar'; });
    $('#usrSenhaGen')?.addEventListener('click', () => { const i = $('#usrSenha'); i.value = gerarSenha(); i.type = 'text'; const b = $('#usrSenhaShow'); if(b) b.textContent = 'Ocultar'; });
    $('#usrSave')?.addEventListener('click', () => saveUser(u));
  }
  async function saveUser(u){
    const edit = !!u;
    const err = $('#usrErr'), btn = $('#usrSave');
    const showErr = t => { if(err){ err.textContent = t; err.hidden = false; } };
    if(err) err.hidden = true;
    const nome = ($('#usrNome')?.value || '').trim();
    const perfil = document.querySelector('input[name="usrPerfil"]:checked')?.value || 'visitante';
    if(nome.length < 2) return showErr('Informe o nome (mínimo 2 caracteres).');
    const db = connect(); if(!db) return showErr('Sem conexão com o Supabase.');
    let call;
    if(edit){
      const status = document.querySelector('input[name="usrStatus"]:checked')?.value || u.status || 'ativo';
      call = db.rpc('fn_admin_atualizar_usuario', {p_id: u.id, p_nome: nome, p_perfil: perfil, p_status: status});
    } else {
      const login = ($('#usrLogin')?.value || '').trim().toLowerCase();
      const senha = $('#usrSenha')?.value || '';
      if(!/^[a-z0-9._-]{3,40}$/.test(login)) return showErr('Login inválido: use 3 a 40 caracteres entre letras minúsculas, números, ponto, hífen ou sublinhado.');
      if(senha.length < 6) return showErr('A senha precisa ter pelo menos 6 caracteres.');
      call = db.rpc('fn_admin_criar_usuario', {p_nome: nome, p_usuario: login, p_senha: senha, p_perfil: perfil});
    }
    if(btn){ btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = 'Salvando...'; }
    const {error} = await call;
    if(btn){ btn.disabled = false; btn.textContent = btn.dataset.t; }
    if(error) return showErr(friendlyRpcError(error));
    closeSysModal();
    toast(edit ? 'Usuário atualizado.' : 'Usuário criado.');
    loadAndRenderUsuarios();
  }
  function openUserPassModal(u){
    if(!u) return;
    openSysModal({
      title: 'Redefinir senha',
      meta: `<span class="aud-user"><i>${esc(auditoriaInitial(u.nome))}</i>${esc(u.nome)} · <code>${esc(usuarioLogin(u.usuario))}</code></span>`,
      body: `<div class="usr-form">
        <label class="field"><span>Nova senha</span>
          <div class="usr-pass"><input id="usrNovaSenha" type="password" minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres"><button class="btn ghost" type="button" id="usrNSShow">Mostrar</button><button class="btn ghost" type="button" id="usrNSGen">Gerar</button></div>
          <small>A senha atual deixa de funcionar imediatamente. Repasse a nova senha para a pessoa.</small></label>
        <div class="usr-err" id="usrErr" role="alert" hidden></div>
      </div>`,
      foot: `<button class="btn" type="button" data-sys-close>Cancelar</button><button class="btn primary" type="button" id="usrPassSave">Redefinir senha</button>`,
    });
    $('#usrNSShow')?.addEventListener('click', ev => { const i = $('#usrNovaSenha'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; ev.target.textContent = show ? 'Ocultar' : 'Mostrar'; });
    $('#usrNSGen')?.addEventListener('click', () => { const i = $('#usrNovaSenha'); i.value = gerarSenha(); i.type = 'text'; const b = $('#usrNSShow'); if(b) b.textContent = 'Ocultar'; });
    $('#usrPassSave')?.addEventListener('click', async () => {
      const err = $('#usrErr'), btn = $('#usrPassSave');
      const senha = $('#usrNovaSenha')?.value || '';
      if(senha.length < 6){ err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; err.hidden = false; return; }
      const db = connect(); if(!db){ err.textContent = 'Sem conexão com o Supabase.'; err.hidden = false; return; }
      btn.disabled = true; const t = btn.textContent; btn.textContent = 'Salvando...';
      const {error} = await db.rpc('fn_admin_redefinir_senha', {p_id: u.id, p_senha: senha});
      btn.disabled = false; btn.textContent = t;
      if(error){ err.textContent = friendlyRpcError(error); err.hidden = false; return; }
      closeSysModal(); toast('Senha redefinida.');
    });
  }

  function openModal(key, id, prefill){
    if(isReadOnly()) { toast('Perfil somente leitura.'); return; }
    if(key === 'brat') return openBratModal(id);
    const cfg = byKey[key]; if(!cfg || !cfg.fields) return;
    const defaults = key === 'multas' ? {status:'pendente', prioridade:false} : key === 'sinistros' ? {data:new Date().toISOString().slice(0,10), tipo:'Avaria', status:'pendente', responsabilidade:'Em análise', houve_terceiro:false, valor:0} : {};
    let row, mergedFromPdf = false;
    if(id){
      const existing = (state.data[key] || []).find(r => String(r.id) === String(id));
      if(prefill && existing){
        row = {...existing};
        Object.entries(prefill).forEach(([name, value]) => {
          if(value === undefined || value === null || value === '') return;
          const current = row[name];
          if(current === undefined || current === null || current === ''){ row[name] = value; mergedFromPdf = true; }
        });
      } else {
        row = existing;
      }
    } else {
      row = {id:makeId(), ...defaults, ...(prefill || {})};
    }
    state.modal = {key, id: id || null, row: {...(row || {})}};
    const title = id
      ? `Editar — ${cfg.title}${mergedFromPdf ? ' (campos vazios preenchidos a partir da Notificação de Autuação importada — confira antes de salvar)' : ''}`
      : `Novo — ${cfg.title}${prefill ? ' (importado da Notificação de Autuação — confira antes de salvar)' : ''}`;
    $('#modalTitle').textContent = title;
    $('#modalForm').innerHTML = cfg.fields.map(f => fieldHtml(f, row || {})).join('');
    if(key === 'pontos') bindPointsFineSelector(row || {});
    if(key === 'producao'){ bindWeekdayPicker(row || {}, !id); bindResponsavelPicker(); }
    $('#modalBg').classList.add('open');
    $('#modalBg').setAttribute('aria-hidden','false');
  }
  function fieldHtml(f, row){
    const [name,label,typeRaw,wide] = f;
    const value = row[name] ?? altValue(name,row) ?? '';
    const checked = value===true || value==='true' || value===1 || value==='1' || String(value).toLowerCase()==='sim';
    if(name === 'prioridade' && typeRaw === 'checkbox') return `<label class="field wide priority-modal-field"><span>Prioridade da multa</span><input class="priority-modal-check" type="checkbox" name="${esc(name)}" ${checked ? 'checked':''}/><span class="priority-modal-button"><span class="priority-off">☆ Marcar como prioridade</span><span class="priority-on">★ Multa marcada como prioridade</span></span><small>Multas prioritárias aparecem primeiro na coluna de multas da tela inicial.</small></label>`;
    if(typeRaw === 'multa-select'){
      const currentValue = String(value || '');
      return `<div class="field wide points-fine-field">
        <div class="points-fine-heading"><span>${esc(label)}</span><small>Busque e escolha uma multa para preencher este lançamento automaticamente.</small></div>
        <input type="hidden" name="${esc(name)}" id="pointsFineSelect" value="${esc(currentValue)}" />
        <div class="points-fine-summary" id="pointsFineSummary"></div>
        <div class="points-fine-actions">
          <button class="btn points-fine-open" id="pointsFineOpen" type="button">Selecionar multa</button>
          <button class="btn ghost points-fine-manual" id="pointsFineManual" type="button">Lançamento manual</button>
        </div>
        <div class="points-fine-browser" id="pointsFineBrowser" hidden>
          <div class="points-fine-searchbar">
            <input id="pointsFineSearch" type="search" placeholder="Buscar por auto, placa, motorista ou motivo..." autocomplete="off" />
            <span id="pointsFineCount"></span>
          </div>
          <div class="points-fine-cards" id="pointsFineCards"></div>
        </div>
      </div>`;
    }
    if(typeRaw === 'weekday') return weekdayFieldHtml(name, label, value);
    if(typeRaw === 'responsavel-picker') return responsavelFieldHtml(name, label, value);
    const cls = `field ${wide==='wide'?'wide':''} ${typeRaw==='checkbox'?'check-field':''}`;
    if(typeRaw === 'textarea') return `<label class="${cls}"><span>${esc(label)}</span><textarea name="${esc(name)}">${esc(value)}</textarea></label>`;
    if(typeRaw === 'checkbox') return `<label class="${cls}"><input type="checkbox" name="${esc(name)}" ${checked ? 'checked':''}/><span>${esc(label)}</span></label>`;
    if(String(typeRaw).startsWith('select:')){
      const opts = String(typeRaw).slice(7).split(',');
      return `<label class="${cls}"><span>${esc(label)}</span><select name="${esc(name)}"><option value=""></option>${opts.map(o=>`<option value="${esc(o)}" ${String(value)===o?'selected':''}>${esc(STATUS[o]||o)}</option>`).join('')}</select></label>`;
    }
    return `<label class="${cls}"><span>${esc(label)}</span><input type="${esc(typeRaw||'text')}" name="${esc(name)}" value="${esc(value)}" /></label>`;
  }
  /* ------------------------------------------------------------------
   * Produção do Dia — seleção rápida do dia da semana (SEG a SÁB).
   * O botão escolhido define a data automaticamente (semana atual por
   * padrão). "Outra data" libera o campo de data para lançamentos
   * retroativos ou futuros. Domingo não é dia de produção.
   * ------------------------------------------------------------------ */
  const WEEKDAYS = [
    {dow:1, short:'SEG', name:'SEGUNDA', long:'Segunda-feira'},
    {dow:2, short:'TER', name:'TERÇA',   long:'Terça-feira'},
    {dow:3, short:'QUA', name:'QUARTA',  long:'Quarta-feira'},
    {dow:4, short:'QUI', name:'QUINTA',  long:'Quinta-feira'},
    {dow:5, short:'SEX', name:'SEXTA',   long:'Sexta-feira'},
    {dow:6, short:'SÁB', name:'SÁBADO',  long:'Sábado'}
  ];
  const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const isoToLocalDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')) ? new Date(`${String(iso).slice(0,10)}T12:00:00`) : null;
  function mondayOf(d){ const m = new Date(d); m.setHours(12,0,0,0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }
  function weekdayFieldHtml(name, label, value){
    return `<div class="field wide weekday-field" id="weekdayField">
      <span>${esc(label)}</span>
      <input type="hidden" name="${esc(name)}" id="weekdayValue" value="${esc(value || '')}" />
      <div class="wd-picker">
        <button type="button" class="wd-nav" id="wdPrevWeek" title="Semana anterior" aria-label="Semana anterior">‹</button>
        <div class="wd-days" role="radiogroup" aria-label="Dia da semana">
          ${WEEKDAYS.map(w => `<button type="button" class="wd-day" role="radio" aria-checked="false" data-dow="${w.dow}" title="${esc(w.long)}"><b>${w.short}</b><small></small></button>`).join('')}
        </div>
        <button type="button" class="wd-nav" id="wdNextWeek" title="Próxima semana" aria-label="Próxima semana">›</button>
      </div>
      <div class="wd-foot">
        <span class="wd-summary" id="wdSummary">Selecione o dia da produção</span>
        <span class="wd-links">
          <button type="button" class="wd-link" id="wdThisWeek" hidden>Voltar para esta semana</button>
          <button type="button" class="wd-link" id="wdOtherDate">Outra data</button>
        </span>
      </div>
      <div class="wd-date-slot" id="wdDateSlot" hidden></div>
      <small class="wd-warn" id="wdWarn" hidden>Domingo não é dia de produção. Confira a data.</small>
    </div>`;
  }
  function bindWeekdayPicker(row, isNew){
    const field = $('#weekdayField'); if(!field) return;
    const form = $('#modalForm');
    const dateInput = form?.elements?.data;
    const mesInput = form?.elements?.mes;
    const hidden = $('#weekdayValue');
    const slot = $('#wdDateSlot');
    // O campo de data continua existindo (mesmo name="data"); só fica recolhido em "Outra data".
    const dateLabel = dateInput?.closest('label');
    if(dateLabel && slot){ dateLabel.classList.add('wd-date-label'); slot.appendChild(dateLabel); }
    const today = new Date(); today.setHours(12,0,0,0);
    const todayIso = localIso(today);
    let week = mondayOf(isoToLocalDate(row.data) || today);
    let lastIso = dateInput?.value || '';

    function setDate(iso, opts={}){
      if(!dateInput) return;
      const prevIso = lastIso;
      dateInput.value = iso || '';
      lastIso = dateInput.value;
      // Pasta/mês acompanha a data quando estava vazia ou seguia a data anterior.
      if(mesInput && iso){ const cur = String(mesInput.value || '').trim(); if(!cur || cur === ym(prevIso)) mesInput.value = ym(iso); }
      if(opts.syncWeek !== false){ const d = isoToLocalDate(iso); if(d) week = mondayOf(d); }
      paint();
    }
    function paint(){
      const sel = isoToLocalDate(dateInput?.value);
      const selDow = sel ? sel.getDay() : -1;
      const selIso = sel ? localIso(sel) : '';
      $$('.wd-day', field).forEach(btn => {
        const dow = Number(btn.dataset.dow);
        const d = new Date(week); d.setDate(week.getDate() + dow - 1);
        const iso = localIso(d);
        btn.dataset.date = iso;
        btn.querySelector('small').textContent = fmtDate(iso).slice(0,5);
        const on = iso === selIso;
        btn.classList.toggle('active', on);
        btn.classList.toggle('is-today', iso === todayIso);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      const wd = WEEKDAYS.find(w => w.dow === selDow);
      if(hidden) hidden.value = wd ? wd.name : '';
      const warn = $('#wdWarn'); if(warn) warn.hidden = !(sel && selDow === 0);
      const summary = $('#wdSummary');
      if(summary){
        if(!sel) summary.textContent = 'Selecione o dia da produção';
        else {
          const rel = selIso === todayIso ? ' · hoje' : (selIso < todayIso ? ' · retroativo' : ' · futuro');
          summary.innerHTML = `<b>${esc(wd ? wd.long : 'Domingo')}, ${esc(fmtDate(selIso))}</b><em>${esc(rel)}</em>`;
        }
      }
      const thisWeek = $('#wdThisWeek'); if(thisWeek) thisWeek.hidden = localIso(week) === localIso(mondayOf(today));
    }
    $$('.wd-day', field).forEach(btn => btn.addEventListener('click', () => setDate(btn.dataset.date, {syncWeek:false})));
    const shiftWeek = (n) => {
      week = new Date(week); week.setDate(week.getDate() + 7*n);
      const sel = isoToLocalDate(dateInput?.value);
      // Mantém o mesmo dia da semana selecionado ao trocar de semana.
      if(sel && sel.getDay() !== 0){ const d = new Date(week); d.setDate(week.getDate() + sel.getDay() - 1); setDate(localIso(d), {syncWeek:false}); }
      else paint();
    };
    $('#wdPrevWeek')?.addEventListener('click', () => shiftWeek(-1));
    $('#wdNextWeek')?.addEventListener('click', () => shiftWeek(1));
    $('#wdThisWeek')?.addEventListener('click', () => {
      week = mondayOf(today);
      const sel = isoToLocalDate(dateInput?.value);
      if(sel && sel.getDay() !== 0){ const d = new Date(week); d.setDate(week.getDate() + sel.getDay() - 1); setDate(localIso(d), {syncWeek:false}); } else paint();
    });
    $('#wdOtherDate')?.addEventListener('click', () => {
      if(!slot) return;
      slot.hidden = !slot.hidden;
      $('#wdOtherDate').textContent = slot.hidden ? 'Outra data' : 'Ocultar calendário';
      if(!slot.hidden){ dateInput?.focus(); try{ dateInput?.showPicker?.(); }catch(e){} }
    });
    dateInput?.addEventListener('change', () => setDate(dateInput.value));
    dateInput?.addEventListener('input', () => { const d = isoToLocalDate(dateInput.value); if(d){ week = mondayOf(d); paint(); } });

    // Lançamento novo: já vem com hoje (seg–sáb). Edição: mostra a data gravada.
    if(isNew && !row.data && today.getDay() !== 0) setDate(todayIso);
    else paint();
  }

  /* Produção do Dia — responsável por clique. Pode marcar mais de uma pessoa;
     "Equipe" é exclusivo. Nomes antigos fora da lista são preservados como chip. */
  const PRODUCAO_RESPONSAVEIS = ['Carlos','Marcos','Rafael','Bruno','Luiz','Equipe'];
  function splitResponsaveis(value){
    return String(value || '').split(/\s*(?:,|;|\/|\+|\||\be\b)\s*/i).map(x => x.trim()).filter(Boolean);
  }
  function responsavelFieldHtml(name, label, value){
    const chosen = splitResponsaveis(value);
    const known = new Map(PRODUCAO_RESPONSAVEIS.map(n => [clean(n), n]));
    const selected = new Set(); const extras = [];
    chosen.forEach(t => { const k = known.get(clean(t)); if(k) selected.add(k); else if(!extras.some(e => clean(e) === clean(t))) extras.push(t); });
    const chip = (n, on, extra) => `<button type="button" class="resp-chip${on?' active':''}${extra?' is-legacy':''}${n==='Equipe'?' is-team':''}" data-name="${esc(n)}" aria-pressed="${on}">${esc(n)}</button>`;
    return `<div class="field wide resp-field" id="respField">
      <span>${esc(label)}</span>
      <input type="hidden" name="${esc(name)}" id="respValue" value="${esc([...PRODUCAO_RESPONSAVEIS.filter(n => selected.has(n)), ...extras].join(', '))}" />
      <div class="resp-chips" role="group" aria-label="${esc(label)}">
        ${PRODUCAO_RESPONSAVEIS.map(n => chip(n, selected.has(n), false)).join('')}${extras.map(n => chip(n, true, true)).join('')}
      </div>
    </div>`;
  }
  function bindResponsavelPicker(){
    const field = $('#respField'); if(!field) return;
    const hidden = $('#respValue');
    const sync = () => {
      const names = $$('.resp-chip.active', field).map(b => b.dataset.name);
      if(hidden) hidden.value = names.join(', ');
      $$('.resp-chip', field).forEach(b => b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
    };
    $$('.resp-chip', field).forEach(btn => btn.addEventListener('click', () => {
      const turningOn = !btn.classList.contains('active');
      if(turningOn){
        if(btn.dataset.name === 'Equipe') $$('.resp-chip', field).forEach(b => b.classList.remove('active'));
        else field.querySelector('.resp-chip[data-name="Equipe"]')?.classList.remove('active');
      }
      btn.classList.toggle('active', turningOn);
      sync();
    }));
  }

  function setModalFieldValue(name, value){
    const form = $('#modalForm');
    const el = form?.elements?.[name];
    if(!el) return;
    if(el.type === 'checkbox') el.checked = !!value;
    else el.value = value ?? '';
  }
  function pointsFineReason(multa){
    return normalizeCardText(multa?.infracao || multa?.descricao || multa?.obs || multa?.observacao || '') || 'Motivo não informado';
  }
  function pointsFineDriver(multa){
    return multa?.motorista || multa?.real_infrator || multa?.condutor || 'Condutor não informado';
  }
  function pointsFineSearchText(multa){
    return clean([
      multa?.auto, multa?.placa, multa?.carro, pointsFineDriver(multa), pointsFineReason(multa),
      multa?.gravidade, multa?.data, multa?.data_multa
    ].filter(Boolean).join(' '));
  }
  function pointsFineCardHtml(multa, selectedId){
    const defaults = multaPointDefaults(multa);
    const isSelected = String(multa.id || '') === String(selectedId || '');
    const priority = multaPrioridadeAtiva(multa);
    return `<button class="points-fine-card ${isSelected ? 'selected' : ''}" type="button" data-fine-id="${esc(multa.id)}">
      <span class="points-fine-card-top">
        <strong>${priority ? '★ ' : ''}Auto ${esc(defaults.auto || `ID ${multa.id}`)}</strong>
        <time>${esc(fmtDate(defaults.data) || '-')}</time>
      </span>
      <span class="points-fine-card-meta"><b>${esc(defaults.placa || 'Sem placa')}</b><span>${esc(pointsFineDriver(multa))}</span></span>
      <span class="points-fine-card-reason">${esc(pointsFineReason(multa))}</span>
      <span class="points-fine-card-tags">${defaults.gravidade ? tag(defaults.gravidade, gravidadeClass(defaults.gravidade)) : '<span class="tag gray">Gravidade não informada</span>'}${defaults.pontos ? `<span class="tag amber">${esc(defaults.pontos)} pontos</span>` : '<span class="tag gray">Conferir pontos</span>'}${isSelected ? '<span class="tag blue">Selecionada</span>' : ''}</span>
    </button>`;
  }
  function setPointsFineBrowserOpen(open){
    const browser = $('#pointsFineBrowser');
    const button = $('#pointsFineOpen');
    if(!browser) return;
    browser.hidden = !open;
    browser.classList.toggle('open', !!open);
    if(button) button.textContent = open ? 'Fechar seleção' : ($('#pointsFineSelect')?.value ? 'Trocar multa' : 'Selecionar multa');
    if(open){
      renderPointsFineCards($('#pointsFineSearch')?.value || '');
      setTimeout(() => $('#pointsFineSearch')?.focus(), 0);
    }
  }
  function renderPointsFineCards(query=''){
    const list = $('#pointsFineCards');
    const count = $('#pointsFineCount');
    const select = $('#pointsFineSelect');
    if(!list || !select) return;
    const currentPoint = {...(state.modal?.row || {}), multa_id:select.value || state.modal?.row?.multa_id || null};
    const term = clean(query || '');
    const fines = availableFinesForPoints(currentPoint).filter(multa => !term || pointsFineSearchText(multa).includes(term));
    if(count) count.textContent = `${fines.length} ${fines.length === 1 ? 'multa disponível' : 'multas disponíveis'}`;
    list.innerHTML = fines.length
      ? fines.map(multa => pointsFineCardHtml(multa, select.value)).join('')
      : `<div class="points-fine-empty"><strong>Nenhuma multa encontrada</strong><span>Tente outro auto, placa, motorista ou motivo.</span></div>`;
    $$('.points-fine-card', list).forEach(card => card.addEventListener('click', () => {
      const multa = (state.data.multas || []).find(item => String(item.id) === String(card.dataset.fineId || '')) || null;
      if(!multa) return;
      fillPointsFromFine(multa);
      setPointsFineBrowserOpen(false);
    }));
  }
  function updatePointsFineSummary(multa){
    const box = $('#pointsFineSummary');
    const openButton = $('#pointsFineOpen');
    if(!box) return;
    if(!multa){
      box.classList.remove('linked');
      box.innerHTML = `<div class="points-fine-summary-main"><span class="points-fine-summary-icon">✎</span><span><strong>Lançamento manual</strong><small>Nenhuma multa vinculada. Os campos podem ser preenchidos normalmente.</small></span></div>`;
      if(openButton) openButton.textContent = 'Selecionar multa';
      return;
    }
    const defaults = multaPointDefaults(multa);
    box.classList.add('linked');
    box.innerHTML = `<div class="points-fine-summary-main">
      <span class="points-fine-summary-icon">✓</span>
      <span class="points-fine-summary-copy"><strong>Auto ${esc(defaults.auto || `ID ${multa.id}`)} · ${esc(defaults.placa || 'Sem placa')}</strong><small>${esc(pointsFineReason(multa))}</small><em>${esc(pointsFineDriver(multa))}${defaults.data ? ` · ${esc(fmtDate(defaults.data))}` : ''}</em></span>
    </div><div class="points-fine-summary-tags">${defaults.gravidade ? tag(defaults.gravidade, gravidadeClass(defaults.gravidade)) : ''}${defaults.pontos ? `<span class="tag amber">${esc(defaults.pontos)} pontos</span>` : ''}</div>`;
    if(openButton) openButton.textContent = 'Trocar multa';
  }
  function fillPointsFromFine(multa){
    if(!multa) return;
    const defaults = multaPointDefaults(multa);
    Object.entries(defaults).forEach(([name,value]) => setModalFieldValue(name, value));
    if(state.modal?.row) state.modal.row.multa_id = multa.id;
    updatePointsFineSummary(multa);
  }
  function bindPointsFineSelector(row){
    const select = $('#pointsFineSelect');
    const openButton = $('#pointsFineOpen');
    const manualButton = $('#pointsFineManual');
    const search = $('#pointsFineSearch');
    if(!select) return;
    const current = (state.data.multas || []).find(m => String(m.id) === String(select.value || row?.multa_id || '')) || null;
    updatePointsFineSummary(current);
    renderPointsFineCards('');
    openButton?.addEventListener('click', () => setPointsFineBrowserOpen($('#pointsFineBrowser')?.hidden !== false));
    manualButton?.addEventListener('click', () => {
      select.value = '';
      if(state.modal?.row) state.modal.row.multa_id = null;
      updatePointsFineSummary(null);
      setPointsFineBrowserOpen(false);
    });
    search?.addEventListener('input', () => renderPointsFineCards(search.value));
  }

  function altValue(name,row){
    if(name === 'placa') return row.placa || row.carro;
    if(name === 'validade') return row.validade || row.venc_cnh || row.data_validade;
    if(name === 'data_emissao') return row.data_emissao || row.data;
    if(name === 'data_validade') return row.data_validade || row.validade;
    if(name === 'prazo_aceite') return row.prazo_aceite || row.prazo || row.prazo_real_infrator;
    if(name === 'envio_rca') return row.envio_rca || row.data_envio_rca;
    if(name === 'prazo_recurso') return row.prazo_recurso || row.prazo_recorrer || row.prazo_recurso_multa;
    return '';
  }
  function closeModal(){
    state.modal = null;
    state.bratBusy = false;
    state.bratPendingFiles = [];
    $('#modalBg').classList.remove('open');
    $('#modalBg .modal')?.classList.remove('brat-modal-shell');
    $('#modalBg .modal')?.classList.remove('gerar-doc-modal-shell');
    $('#modalBg').setAttribute('aria-hidden','true');
    $('#modalForm').innerHTML = '';
    const save=$('#modalSave'), cancel=$('#modalCancel'), close=$('#modalClose');
    if(save){ save.textContent='Salvar'; save.disabled=false; save.hidden=false; delete save.dataset.original; }
    if(cancel){ cancel.textContent='Cancelar'; cancel.disabled=false; cancel.hidden=false; }
    if(close) close.disabled=false;
  }

  function readModalPayload(){
    const ctx = state.modal; if(!ctx) return null;
    const cfg = byKey[ctx.key];
    const form = $('#modalForm');
    const stableId = (ctx.row.id !== null && ctx.row.id !== undefined && ctx.row.id !== '') ? ctx.row.id : makeId();
    const obj = {...ctx.row, id: stableId};
    cfg.fields.forEach(([name,,type]) => {
      const el = form.elements[name]; if(!el) return;
      let val;
      if(type === 'checkbox') val = !!el.checked;
      else if(type === 'number') val = toNum(el.value);
      else if(type === 'date') val = String(el.value || '').trim() || null;
      else val = String(el.value || '').trim();
      obj[name] = val;
    });
    return normalizePayload(ctx.key, obj);
  }

  function normalizePayload(key, obj){
    const p = {...obj, updated_at: nowIso(), deleted_at: null};
    if(p.placa) p.placa = String(p.placa).toUpperCase().trim();
    if(key === 'multas'){
      p.carro = p.placa || p.carro || '';
      p.placa = p.placa || p.carro || '';
      p.status = p.status || 'pendente';
      p.prioridade = multaPrioridadeAtiva(p);
      p.prazo = p.prazo_aceite || null;
      p.prazo_recorrer = p.prazo_recurso || null;
      if(p.status === 'recorrida' && !p.data_fim_recurso) p.data_fim_recurso = nowIso().slice(0,10);
      p.tipo_pagamento = ['normal','desconto20','dobrado40'].includes(p.tipo_pagamento) ? p.tipo_pagamento : (p.valor_dobrado ? 'dobrado40' : 'normal');
      p.valor_dobrado = p.tipo_pagamento === 'dobrado40';
    }
    if(key === 'pontos'){
      p.multa_id = toNum(p.multa_id) || null;
      if(p.multa_id){
        const multa = (state.data.multas || []).find(m => String(m.id) === String(p.multa_id));
        if(multa){
          const defaults = multaPointDefaults(multa);
          p.auto = defaults.auto || p.auto || null;
          p.placa = defaults.placa || p.placa || null;
          p.motorista = defaults.motorista || p.motorista || null;
          p.data = defaults.data || p.data || null;
          p.gravidade = defaults.gravidade || p.gravidade || null;
          p.pontos = defaults.pontos || toNum(p.pontos);
          p.motivo = defaults.motivo || p.motivo || null;
        }
      }
      if(!p.gravidade) p.gravidade = inferSeverityFromInfraction(p.motivo || '');
      if(!toNum(p.pontos)) p.pontos = pointsBySeverity(p.gravidade);
      p.pontos = toNum(p.pontos);
      p.aceitou = p.aceitou || 'Pendente';
    }
    if(key === 'motoristas'){
      if(p.validade && !p.venc_cnh) p.venc_cnh = p.validade;
    }
    if(key === 'veiculos'){
      p.renavam = String(p.renavam || '').replace(/\D/g,'').slice(0,11) || null;
      delete p.cor;
    }
    if(key === 'tacografos'){
      p.data = p.data_emissao || p.data || null;
      p.validade = p.data_validade || p.validade || null;
      p.situacao = p.status || p.situacao || 'ativo';
    }
    if(key === 'oleo'){
      p.data_ultima_troca = p.data_ultima_troca || p.data || null;
      p.km_ultima_vistoria = toNum(p.km_ultima_vistoria || p.km || 0);
      p.km_proxima_troca = toNum(p.km_proxima_troca || p.proxkm || p.proxKm || 0);
      p.km_faltando = toNum(p.km_faltando || (p.km_proxima_troca && p.km_ultima_vistoria ? p.km_proxima_troca - p.km_ultima_vistoria : 0));
      p.situacao = oilSituationValue(p);
      p.status = p.situacao;
    }
    if(key === 'manutencoes'){
      p.mes = ym(p.data);
      p.obs = p.descricao || p.obs || '';
      p.origem_aba = p.origem || p.origem_aba || '';
      p.status = p.status || 'concluido';
    }
    if(key === 'producao'){
      // "Origem arquivo" e "Origem aba" saíram do formulário: não são mais enviados.
      // (Registros antigos não são apagados; o upsert simplesmente não toca nessas colunas.)
      delete p.origem_arquivo; delete p.origem_aba;
      p.mes = p.mes || ym(p.data);
      p.responsavel = p.responsavel || p.responsaveis || '';
      p.responsaveis = p.responsaveis || p.responsavel || '';
    }
    if(key === 'sinistros'){
      p.mes = p.mes || ym(p.data);
      p.avaria = p.avaria || p.descricao || p.obs || '';
      p.status = p.status || 'pendente';
      p.tipo = p.tipo || 'Avaria';
      p.responsabilidade = p.responsabilidade || 'Em análise';
      p.valor = keyMoney('sinistros', p);
    }
    if(key === 'brat'){
      p.mes = p.mes || ym(p.data);
      p.titulo = p.titulo || bratRecordTitle(p);
      p.status = p.status || 'em_analise';
      p.tipo = p.tipo || 'BRAT / Ocorrência';
      p.qtd_fotos = toNum(p.qtd_fotos);
      p.qtd_pdfs = toNum(p.qtd_pdfs);
      p.qtd_videos = toNum(p.qtd_videos);
      p.qtd_arquivos = toNum(p.qtd_arquivos);
    }
    Object.keys(p).forEach(k => { if(p[k] === '') p[k] = null; });
    return p;
  }

  // ===== Gerar Documentos da Multa (Comunicação de Multa + E-mail) =====
  function tipoPagamentoValue(r){
    const t = String(r?.tipo_pagamento || '').toLowerCase();
    if(t === 'desconto20' || t === 'dobrado40' || t === 'normal') return t;
    return (r && (r.valor_dobrado === true || String(r.valor_dobrado).toLowerCase() === 'true' || String(r.valor_dobrado) === '1')) ? 'dobrado40' : 'normal';
  }
  function roundMoney(v){ return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
  function multaValorLinhas(r){
    const original = roundMoney(moneyValue(r?.valor));
    const tipo = tipoPagamentoValue(r);
    if(tipo === 'desconto20'){
      const comDesconto = roundMoney(original * 0.8);
      return [['Valor da multa', brl(original)], ['Porcentagem de desconto', '20%'], ['Valor com desconto', brl(comDesconto)]];
    }
    if(tipo === 'dobrado40'){
      const dobrado = roundMoney(original * 2);
      const comDesconto = roundMoney(dobrado * 0.6);
      return [['Valor original da multa', brl(original)], ['Valor dobrado', brl(dobrado)], ['Porcentagem de desconto', '40%'], ['Valor com desconto', brl(comDesconto)]];
    }
    return [['Valor da multa', brl(original)]];
  }
  // Formato de linha única com a expressão matemática, exatamente como no documento
  // oficial da empresa (usado apenas na Comunicação de Multa em PDF; o e-mail usa multaValorLinhas).
  function multaValorLinhaDocumento(r){
    const original = roundMoney(moneyValue(r?.valor));
    const tipo = tipoPagamentoValue(r);
    if(tipo === 'desconto20'){
      const comDesconto = roundMoney(original * 0.8);
      return `${brl(original)} - 20% = ${brl(comDesconto)}`;
    }
    if(tipo === 'dobrado40'){
      const dobrado = roundMoney(original * 2);
      const comDesconto = roundMoney(dobrado * 0.6);
      return `(${brl(original)} × 2) - 40% = ${brl(comDesconto)}`;
    }
    return brl(original);
  }
  function findMotoristaByNome(nome){
    const alvo = clean(nome || '');
    if(!alvo) return null;
    const lista = state.data.motoristas || [];
    return lista.find(m => clean(m.nome || '') === alvo) || lista.find(m => clean(m.nome || '').includes(alvo) || alvo.includes(clean(m.nome || ''))) || null;
  }
  function multaDocDados(multa){
    const veiculo = h360FindVehicle(multa.placa || multa.carro || '') || {};
    const motorista = findMotoristaByNome(multa.motorista) || {};
    const local = [multa.local, multa.municipio].filter(Boolean).join(' - ');
    return {
      placa: String(multa.placa || multa.carro || veiculo.placa || '').toUpperCase(),
      renavam: veiculo.renavam || multa.renavam || '',
      modelo: veiculo.modelo || '',
      auto: multa.auto || '',
      infracao: multa.infracao || multa.descricao || '',
      local: local || multa.local || '',
      data: fmtDate(multa.data),
      hora: multa.hora || '',
      nomeMotorista: motorista.nome || multa.motorista || '',
      cpfMotorista: motorista.cpf || ''
    };
  }
  function validateMultaDocData(multa, dados){
    const faltando = [];
    if(!dados.nomeMotorista) faltando.push('Motorista não identificado/vinculado');
    if(!dados.cpfMotorista) faltando.push('CPF do motorista (cadastre no módulo Motoristas)');
    if(!dados.placa) faltando.push('Placa do veículo');
    if(!dados.renavam) faltando.push('RENAVAM do veículo (cadastre no módulo Veículos)');
    if(!dados.auto) faltando.push('Número do Auto de Infração');
    if(!dados.infracao) faltando.push('Descrição da infração');
    if(!moneyValue(multa.valor)) faltando.push('Valor da multa');
    return faltando;
  }
  // Logo da empresa (demo) embutida diretamente em base64 (não depende de nenhum arquivo
  // externo ser servido corretamente pelo host/deploy).
  const EMPRESA_LOGO_BASE64 = "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";
  function loadEmpresaLogoDataUrl(){
    return Promise.resolve('data:image/png;base64,' + EMPRESA_LOGO_BASE64);
  }
  // Coordenadas (em pt, página A4 595.28x841.89) calibradas por medição pixel a pixel
  // do documento oficial "Comunicação de Multa" da empresa, para reprodução fiel do layout,
  // logo e posicionamento. Fonte Helvetica (Calibri não é embutida no gerador de PDF).
  async function buildComunicacaoMultaPdf(multa){
    const Ctor = window.jspdf && window.jspdf.jsPDF;
    if(!Ctor) throw new Error('Biblioteca PDF não carregada.');
    const dados = multaDocDados(multa);
    const doc = new Ctor({orientation:'portrait', unit:'pt', format:[595.28, 841.89]});
    const marginX = 36.5, rightX = 558.8, usableW = rightX - marginX, centerX = 297.64;
    const logo = await loadEmpresaLogoDataUrl();
    if(logo){ try{ doc.addImage(logo, 'PNG', 180, 26, 234.5, 89.5); }catch(e){ console.error('Gerar Documentos: falha ao inserir a logo no PDF.', e); toast('Aviso: não foi possível inserir a logo no PDF (veja o console).'); } }
    else{ toast('Aviso: logo não encontrada em logo embutida — PDF gerado sem a logo.'); }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(11);
    doc.text('CNPJ: 00.000.000/0001-00 (fictício)', centerX, 155, {align:'center'});
    doc.setFont('helvetica', 'bolditalic'); doc.setFontSize(15);
    doc.text('COMUNICAÇÃO DE MULTA DE VEÍCULO CONDUZIDO POR FUNCIONÁRIO', centerX, 193, {align:'center', maxWidth: usableW});
    function segmentada(segments, y){
      let x = marginX;
      segments.forEach(seg => {
        doc.setFont('helvetica', seg.bold ? 'bold' : 'normal');
        doc.text(seg.text, x, y);
        x += doc.getTextWidth(seg.text);
      });
    }
    function paragrafo(text, y, opts={}){
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(11);
      const lines = doc.splitTextToSize(text, usableW);
      doc.text(lines, marginX, y, {align:'justify', maxWidth: usableW});
      return lines.length;
    }
    let y = 232;
    doc.setFontSize(11);
    segmentada([
      {text:'Considerando que, conforme documento em anexo, no dia ', bold:false},
      {text: dados.data || '____/____/______', bold:true},
      {text:' às ', bold:false},
      {text: dados.hora || '_____', bold:true},
      {text:' V. Sr. conduzia o veículo', bold:false}
    ], y);
    y += 13.5;
    segmentada([
      {text:'Placa: ', bold:false},
      {text: dados.placa || '-', bold:true},
      {text:' – RENAVAM: ', bold:false},
      {text: dados.renavam || '-', bold:true}
    ], y);
    y += 28;
    paragrafo('Considerando que V. Sr. cometeu a infração descrita no auto de infração, a saber:', y);
    y += 29.5;
    function bulletLinha(label, valor){
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('➤', marginX + 3, y);
      const texto = `${label}: ${valor || '-'}`;
      const lines = doc.splitTextToSize(texto, usableW - 20);
      doc.text(lines, marginX + 20, y);
      lines.forEach((line, i) => {
        const w = Math.max(doc.getTextWidth(line), 40);
        doc.setLineWidth(0.6);
        doc.line(marginX + 20, y + i * 15.5 + 2.5, marginX + 20 + w, y + i * 15.5 + 2.5);
      });
      y += lines.length * 15.5 + 6.5;
    }
    bulletLinha('INFRAÇÃO', dados.infracao);
    bulletLinha('LOCAL', dados.local);
    bulletLinha('Nº DO AUTO', dados.auto);
    bulletLinha('VALOR', multaValorLinhaDocumento(multa));
    y += 30;
    let n = paragrafo('Considerando que esta empresa nesta oportunidade lhe oferece o direito de justificativa para cometimento de tal infração de trânsito, que deve ser feita abaixo:', y);
    y += n * 14.5 + 14.75;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text('Justificativa:', marginX, y);
    doc.setLineWidth(0.6);
    doc.line(marginX + doc.getTextWidth('Justificativa:') + 4, y + 1.5, rightX, y + 1.5);
    y += 14.5;
    doc.line(marginX, y, rightX, y);
    y += 29.5;
    n = paragrafo('Comunicamos que após análise de vossa justificativa, o valor da multa será descontado após seu pagamento, em seus vencimentos.', y);
    y += n * 14.5 + 14.75;
    n = paragrafo('Comunicamos ainda que serão fornecidos vossos dados para o Detran, como condutor do veículo na data infração, conforme determina a legislação em vigor, devendo V. Sra. preencher o formulário encaminhado pelo órgão competente.', y);
    y += n * 14.5 + 29.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    let xr = marginX;
    doc.text('Rio de Janeiro,', xr, y); xr += doc.getTextWidth('Rio de Janeiro,') + 4;
    doc.line(xr, y + 1.5, xr + 48, y + 1.5); xr += 52;
    doc.text('de', xr, y); xr += doc.getTextWidth('de') + 4;
    doc.line(xr, y + 1.5, xr + 90, y + 1.5); xr += 94;
    doc.text('de', xr, y); xr += doc.getTextWidth('de') + 4;
    doc.line(xr, y + 1.5, xr + 50, y + 1.5);
    y += 29.5;
    function linhaAssinatura(label){
      const prefix = `${label}: `;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
      doc.text(prefix, marginX, y);
      doc.line(marginX + doc.getTextWidth(prefix), y + 1.5, rightX, y + 1.5);
    }
    linhaAssinatura('Assinatura Motorista');
    y += 12.5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(dados.nomeMotorista || '-', centerX, y, {align:'center'});
    y += 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
    doc.text(`CPF: ${dados.cpfMotorista || '-'}`, centerX, y, {align:'center'});
    y += 99.25;
    linhaAssinatura('Assinatura Supervisor de Frota');
    y += 29.25;
    function linhaTestemunha(label){
      const prefix = `${label}: `;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
      doc.text(prefix, marginX, y);
      doc.line(marginX + doc.getTextWidth(prefix), y + 1.5, rightX, y + 1.5);
      y += 14.5;
    }
    linhaTestemunha('1 ª Testemunha');
    linhaTestemunha('2 ª Testemunha');
    return doc;
  }

  function buildEmailSolicitacaoPagamento(multa){
    const dados = multaDocDados(multa);
    const subject = `Solicitação de pagamento de multa - ${dados.auto || multa.id}`;
    const valorLinhas = multaValorLinhas(multa).map(([label, val]) => `${label}: ${val}`).join('\n\n');
    const body = `Prezados,\n\nEncaminho as informações abaixo para providências quanto ao pagamento da multa junto ao RCA.\n\nDados da infração:\n\nAuto de Infração: ${dados.auto || '-'}\n\n${valorLinhas}\n\nDados do motorista e do veículo:\n\nMotorista: ${dados.nomeMotorista || '-'}\n\nVeículo: ${dados.modelo || '-'}\n\nPlaca: ${dados.placa || '-'}\n\nRENAVAM: ${dados.renavam || '-'}\n\nA ordem de pagamento encontra-se disponível para conferência.\n\nApós a quitação, peço a gentileza de nos encaminhar o comprovante de pagamento para fins de controle interno e registros.\n\nFico à disposição para quaisquer esclarecimentos adicionais.\n\nAtenciosamente,\n\nDepartamento de Frota`;
    return {subject, body};
  }
  function openGerarDocumentosModal(id){
    const multa = (state.data.multas || []).find(m => String(m.id) === String(id));
    if(!multa) return toast('Multa não encontrada.');
    const dados = multaDocDados(multa);
    const faltando = validateMultaDocData(multa, dados);
    state.modal = {key:'multas', custom:'gerar-documentos', id, row:{...multa}};
    $('#modalTitle').textContent = `Gerar Documentos — Multa ${esc(dados.auto || multa.id)}`;
    if(faltando.length){
      $('#modalForm').innerHTML = `<div class="gerar-doc-wrap">
        <p><b>Não é possível gerar os documentos ainda.</b> Complete as informações abaixo antes de continuar:</p>
        <ul class="gerar-doc-missing">${faltando.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      </div>`;
    }else{
      $('#modalForm').innerHTML = `<div class="gerar-doc-wrap">
        <p>Selecione os documentos que deseja gerar para <b>${esc(dados.placa)}</b> — motorista <b>${esc(dados.nomeMotorista)}</b>:</p>
        <label class="field check-field"><input type="checkbox" id="gdComunicacao" checked/><span>Comunicação de Multa (PDF)</span></label>
        <label class="field check-field"><input type="checkbox" id="gdEmail" checked/><span>E-mail para Solicitação de Pagamento</span></label>
        <div id="gerarDocResult"></div>
      </div>`;
    }
    const save = $('#modalSave'), cancel = $('#modalCancel');
    if(save){ save.hidden = !!faltando.length; save.disabled = false; save.textContent = 'Gerar'; }
    if(cancel){ cancel.hidden = false; cancel.disabled = false; cancel.textContent = faltando.length ? 'Fechar' : 'Cancelar'; }
    $('#modalBg .modal')?.classList.add('gerar-doc-modal-shell');
    $('#modalBg').classList.add('open');
    $('#modalBg').setAttribute('aria-hidden', 'false');
  }
  async function handleGerarDocumentosGerar(){
    const ctx = state.modal; if(!ctx) return;
    const multa = (state.data.multas || []).find(m => String(m.id) === String(ctx.id));
    if(!multa) return closeModal();
    const wantComunicacao = $('#gdComunicacao')?.checked;
    const wantEmail = $('#gdEmail')?.checked;
    if(!wantComunicacao && !wantEmail) return toast('Selecione ao menos um documento para gerar.');
    const save = $('#modalSave');
    if(save){ save.disabled = true; save.textContent = 'Gerando...'; }
    let pdfDoc = null;
    try{
      if(wantComunicacao) pdfDoc = await buildComunicacaoMultaPdf(multa);
    }catch(e){
      console.error(e);
      toast('Não foi possível gerar o PDF da Comunicação de Multa.');
      if(save){ save.disabled = false; save.textContent = 'Gerar'; }
      return;
    }
    const email = wantEmail ? buildEmailSolicitacaoPagamento(multa) : null;
    renderGerarDocumentosResult(multa, pdfDoc, email);
  }
  function renderGerarDocumentosResult(multa, pdfDoc, email){
    const emailText = email ? `Assunto: ${email.subject}\n\n${email.body}` : '';
    $('#modalForm').innerHTML = `<div class="gerar-doc-wrap gerar-doc-result">
      <p><b>Documentos prontos.</b></p>
      ${email ? `<label class="field wide"><span>E-mail de solicitação de pagamento</span><textarea id="gdEmailText" rows="14" readonly>${esc(emailText)}</textarea></label>` : ''}
      <div class="gerar-doc-actions">
        ${email ? `<button class="btn" id="gdCopyEmail" type="button">Copiar texto do e-mail</button>` : ''}
        ${pdfDoc ? `<button class="btn primary" id="gdDownloadPdf" type="button">Baixar PDF da Comunicação de Multa</button>` : ''}
      </div>
    </div>`;
    const save = $('#modalSave'), cancel = $('#modalCancel');
    if(save) save.hidden = true;
    if(cancel){ cancel.hidden = false; cancel.disabled = false; cancel.textContent = 'Fechar'; }
    $('#gdCopyEmail')?.addEventListener('click', async () => {
      try{ await navigator.clipboard.writeText(emailText); toast('Texto do e-mail copiado.'); }
      catch(e){ toast('Não foi possível copiar automaticamente. Selecione o texto manualmente.'); }
    });
    $('#gdDownloadPdf')?.addEventListener('click', () => {
      const auto = multa.auto || multa.id || 'multa';
      pdfDoc.save(`Comunicacao-Multa-${String(auto).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    });
  }

  async function saveModal(){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const ctx = state.modal; if(!ctx) return;
    if(ctx.key === 'brat' && ctx.custom === 'brat') return saveBratModal();
    if(ctx.key === 'brat' && ctx.custom === 'brat-files') { if(isReadOnly()) return closeModal(); return openBratModal(ctx.id); }
    if(ctx.key === 'multas' && ctx.custom === 'gerar-documentos') return handleGerarDocumentosGerar();
    const key = ctx.key;
    const cfg = byKey[key];
    const payload = readModalPayload();
    if(key === 'pontos' && payload?.multa_id){
      const duplicate = linkedPointForFine(payload.multa_id, payload.id);
      if(duplicate){
        toast(`Esta multa já está vinculada ao registro de pontos ${duplicate.auto || duplicate.id}.`);
        return;
      }
    }
    const isNew = !ctx.id;
    const original = ctx.id ? (state.data[key] || []).find(r => String(r.id) === String(ctx.id)) : null;
    closeModal();
    upsertLocal(key, payload);
    renderCurrentPage();
    try{
      const saved = key === 'oleo' && ctx.id ? await safeUpdate(cfg.table, payload, ctx.id) : await safeUpsert(cfg.table, payload);
      upsertLocal(key, saved || payload);
      renderCurrentPage();
      toast(ctx.id ? 'Registro atualizado.' : 'Registro salvo.');
    }catch(e){
      console.error(e);
      // O Supabase recusou o salvamento: desfaz a atualização otimista para a tela
      // não mostrar um registro "fantasma" que na verdade nunca foi gravado (isso
      // é o que fazia parecer que só quem criou via a multa — na real, ninguém
      // além dela tinha visto, porque nunca chegou a salvar de fato).
      if(isNew){
        state.data[key] = (state.data[key] || []).filter(r => String(r.id) !== String(payload.id));
      } else if(original){
        upsertLocal(key, original);
      }
      renderCurrentPage();
      if(key === 'pontos' && (String(e?.code || '') === '23505' || clean(e?.message || '').includes('pontos_multa_id'))){
        showSaveError('Esta multa já possui um registro de pontos vinculado. O registro não foi salvo.');
      }else{
        const detalhe = e?.message ? ` (${e.message})` : '';
        showSaveError(`Não foi possível salvar no Supabase — o registro NÃO foi gravado e foi removido da tela${detalhe}.`);
      }
    }
  }

  function upsertLocal(key, row){
    const arr = state.data[key] || (state.data[key]=[]);
    const i = arr.findIndex(r => String(r.id) === String(row.id));
    if(i >= 0) arr[i] = {...arr[i], ...row}; else arr.unshift(row);
  }

  async function safeUpdate(table, payload, id){
    const db = connect(); if(!db) throw new Error('Supabase indisponível.');
    let p = {...payload};
    for(let i=0;i<18;i++){
      Object.keys(p).forEach(k => { if(p[k] === undefined) delete p[k]; });
      const res = await db.from(table).update(p).eq('id', id).select().maybeSingle();
      if(!res.error) return res.data || p;
      const missing = missingColumn(res.error);
      if(missing && Object.prototype.hasOwnProperty.call(p, missing)){ delete p[missing]; continue; }
      const res2 = await db.from(table).update(p).eq('id', id);
      if(!res2.error) return p;
      const missing2 = missingColumn(res2.error);
      if(missing2 && Object.prototype.hasOwnProperty.call(p, missing2)){ delete p[missing2]; continue; }
      throw res2.error || res.error;
    }
    return p;
  }

  async function safeUpsert(table, payload){
    const db = connect(); if(!db) throw new Error('Supabase indisponível.');
    let p = {...payload};
    for(let i=0;i<18;i++){
      Object.keys(p).forEach(k => { if(p[k] === undefined) delete p[k]; });
      const res = await db.from(table).upsert(p, {onConflict:'id'}).select().single();
      if(!res.error) return res.data;
      const missing = missingColumn(res.error);
      if(missing && Object.prototype.hasOwnProperty.call(p, missing)){ delete p[missing]; continue; }
      const res2 = await db.from(table).upsert(p, {onConflict:'id'});
      if(!res2.error) return p;
      const missing2 = missingColumn(res2.error);
      if(missing2 && Object.prototype.hasOwnProperty.call(p, missing2)){ delete p[missing2]; continue; }
      throw res2.error || res.error;
    }
    return p;
  }
  function missingColumn(err){
    const txt = String(err?.message || err?.details || err?.hint || err || '');
    const m = txt.match(/Could not find the '([^']+)' column|column "([^"]+)" does not exist|Could not find the ([a-zA-Z0-9_]+) column/i);
    return m ? (m[1] || m[2] || m[3]) : '';
  }

  async function deleteRecord(key, id){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const cfg = byKey[key]; if(!cfg) return;
    const arr = state.data[key] || [];
    const row = arr.find(r => String(r.id) === String(id));
    if(!row) return;
    if(!confirm('Excluir este registro? Ele irá para a lixeira quando possível.')) return;
    state.data[key] = arr.filter(r => String(r.id) !== String(id));
    renderCurrentPage();
    try{
      await createTrash(key, row);
      await softDeleteOrHardDelete(cfg.table, row.id, row, cfg.softDelete);
      await loadTrash({silent:true});
      renderNav();
      toast('Registro excluído.');
    }catch(e){
      console.error(e);
      toast('O item saiu da tela, mas a exclusão no banco precisa ser conferida.');
    }
  }
  async function createTrash(key, row){
    const db = connect(); if(!db) return;
    const cfg = byKey[key];
    const payload = {
      modulo:key,
      registro_id:Number(row.id),
      tabela_origem:cfg.table,
      titulo:titleFromRow(key,row),
      dados:row,
      deleted_at:nowIso(),
      restored_at:null
    };
    try{ await safeUpsert('lixeira_operacional', payload); }catch(e){ console.warn('Lixeira indisponível:', e); }
  }
  function titleFromRow(key,row){
    if(key === 'motoristas') return row.nome || `Motorista ${row.id}`;
    if(key === 'veiculos') return row.placa || `Veículo ${row.id}`;
    if(key === 'multas') return [row.placa||row.carro,row.auto,row.data].filter(Boolean).join(' • ');
    if(key === 'manutencoes') return [row.placa,row.servico||row.tipo,row.data].filter(Boolean).join(' • ');
    if(key === 'producao') return [row.placa,row.servico,row.data].filter(Boolean).join(' • ');
    return [row.placa,row.motorista,row.data].filter(Boolean).join(' • ') || `Registro ${row.id}`;
  }
  async function softDeleteOrHardDelete(table, id, row, softDeleteEnabled=true){
    const db = connect(); if(!db) return;
    if(softDeleteEnabled !== false){
      const payload = {deleted_at: nowIso(), deleted_payload: row, updated_at: nowIso()};
      let p = {...payload};
      for(let i=0;i<5;i++){
        if(!('deleted_at' in p)) break;   // sem coluna deleted_at não há exclusão lógica: exclui de fato
        const res = await db.from(table).update(p).eq('id', Number(id));
        if(!res.error) return;
        const missing = missingColumn(res.error);
        if(missing && Object.prototype.hasOwnProperty.call(p, missing)){ delete p[missing]; continue; }
        break;
      }
    }
    const del = await db.from(table).delete().eq('id', Number(id));
    if(del.error) throw del.error;
  }

  async function restoreTrash(trashId){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const trash = (state.data.lixeira || []).find(r => String(r.id) === String(trashId));
    if(!trash) return;
    const key = trash.modulo;
    const cfg = byKey[key];
    const payload = normalizePayload(key, parsePayload(trash.dados) || {});
    if(!cfg || !payload.id) return toast('Não foi possível restaurar este item.');
    try{
      await safeUpsert(cfg.table, payload);
      const db = connect();
      if(db) await db.from('lixeira_operacional').update({restored_at:nowIso()}).eq('id', Number(trashId));
      upsertLocal(key, payload);
      state.data.lixeira = state.data.lixeira.filter(r => String(r.id) !== String(trashId));
      renderLixeira(); renderNav();
      toast('Registro restaurado.');
    }catch(e){ console.error(e); toast('Não foi possível restaurar.'); }
  }
  /* ------------------------------------------------------------------
   * Exclusão definitiva (Lixeira): a exclusão comum mantém os anexos para
   * permitir restaurar. Aqui o item sai de vez — primeiro os arquivos físicos
   * do Storage, depois os metadados de anexos e por último a linha da lixeira.
   * Se algum arquivo não puder ser removido, o item continua na lixeira.
   * ------------------------------------------------------------------ */
  const TRASH_PURGE_DIAS = 30;
  /* lista todos os arquivos de uma pasta do bucket (com paginação) */
  async function listarPastaStorage(db, bucket, pasta){
    const out = [];
    for(let offset = 0; offset < 20000; offset += 1000){
      const res = await db.storage.from(bucket).list(pasta, {limit:1000, offset});
      if(res.error) break;
      const itens = (res.data || []).filter(o => o && o.name && o.id);   // id nulo = subpasta
      itens.forEach(o => out.push(`${pasta}/${o.name}`));
      if((res.data || []).length < 1000) break;
    }
    return out;
  }
  async function anexosDoItemLixeira(db, trash){
    const d = parsePayload(trash.dados) || {};
    const id = Number(d.id || trash.registro_id);
    const porBucket = new Map();   // bucket -> Set(paths)
    const add = (bucket, p) => {
      p = String(p || '').trim().replace(/^\/+/, '');
      if(!bucket || !p || /^https?:/i.test(p)) return;
      if(!porBucket.has(bucket)) porBucket.set(bucket, new Set());
      porBucket.get(bucket).add(p);
    };
    const metas = [];   // {tabelaMeta, ids}
    const mod = trash.modulo;
    if(mod === 'checklists' && d.storage_path) add('checklists', d.storage_path);
    if(mod === 'motoristas') add('motoristas-cnh', d.cnh_path || d.cnh_storage_path || d.cnhPath || '');
    // qualquer URL do Storage gravada no registro (fotos de chamados, links de anexos etc.)
    const txt = JSON.stringify(d);
    (txt.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/[^"?#\\\s]+/g) || []).forEach(u => {
      const m = u.match(/\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if(m){ try{ add(m[1], decodeURIComponent(m[2])); }catch(e){ add(m[1], m[2]); } }
    });
    if(mod === 'brat' || mod === 'sinistros'){
      const tabelaMeta = mod === 'brat' ? 'brat_arquivos' : 'sinistros_arquivos';
      const col = mod === 'brat' ? 'brat_id' : 'sinistro_id';
      const bucket = mod === 'brat' ? BRAT_BUCKET : SINISTROS_BUCKET;
      const res = await db.from(tabelaMeta).select('*').eq(col, id);
      if(!res.error){
        const linhas = res.data || [];
        linhas.forEach(f => add(bucket, f.storage_path || f.caminho_storage));
        if(linhas.length) metas.push({tabelaMeta, ids: linhas.map(f => f.id)});
      }else console.warn('Lixeira: metadados de anexos indisponíveis', tabelaMeta, res.error);
      // os uploads ficam em "<id>/…": pega também arquivos cujo metadado já sumiu (cascade)
      if(id) (await listarPastaStorage(db, bucket, String(id))).forEach(p => add(bucket, p));
    }
    // anexos genéricos (ex.: notas de serviço) — tabela opcional
    if(id){
      const ax = await db.from('anexos_frota').select('id,bucket,storage_path').eq('modulo', mod).eq('registro_id', id);
      if(!ax.error && (ax.data || []).length){
        const meus = new Set(ax.data.map(a => a.id));
        for(const a of ax.data){
          if(!a.storage_path) continue;
          // a mesma nota pode estar ligada a outras manutenções: só apaga o arquivo se ninguém mais usa
          const outros = await db.from('anexos_frota').select('id').eq('storage_path', a.storage_path).limit(50);
          if(!outros.error && (outros.data || []).every(o => meus.has(o.id))) add(a.bucket || 'notas-servico', a.storage_path);
        }
        metas.push({tabelaMeta:'anexos_frota', ids:[...meus]});
      }
    }
    const grupos = [...porBucket].map(([bucket, set]) => ({bucket, paths:[...set]}));
    metas.forEach(m => grupos.push({bucket:null, paths:[], ...m}));
    return grupos;
  }
  async function purgeTrashItem(trash){
    const db = connect(); if(!db) throw new Error('Sem conexão.');
    const cfg = byKey[trash.modulo];
    const tabela = trash.tabela_origem || cfg?.table;
    // segurança: se o registro voltou a existir (restaurado/recriado), os anexos estão em uso
    if(tabela){
      const vivo = await db.from(tabela).select('id').eq('id', Number(trash.registro_id)).is('deleted_at', null).maybeSingle();
      const vivo2 = vivo.error ? await db.from(tabela).select('id').eq('id', Number(trash.registro_id)).maybeSingle() : vivo;
      if(!vivo2.error && vivo2.data) return {ok:false, motivo:'o registro está ativo no sistema'};
    }
    const grupos = await anexosDoItemLixeira(db, trash);
    let arquivos = 0;
    for(const g of grupos){
      if(g.bucket && g.paths.length){
        const removidos = new Set();
        for(let i = 0; i < g.paths.length; i += 500){
          const rem = await db.storage.from(g.bucket).remove(g.paths.slice(i, i + 500));
          if(rem.error){
            console.warn('Lixeira: falha ao remover do Storage', g.bucket, rem.error);
            return {ok:false, motivo:`não foi possível excluir os arquivos do bucket "${g.bucket}" (${rem.error.message || 'erro'})`};
          }
          (rem.data || []).forEach(o => o && o.name && removidos.add(o.name));
        }
        // não reportado como removido: confere se ainda existe (pode já ter sido apagado antes)
        for(const p of g.paths.filter(p => !removidos.has(p))){
          const chk = await db.storage.from(g.bucket).createSignedUrl(p, 10);
          if(chk.data && chk.data.signedUrl) return {ok:false, motivo:`sem permissão para apagar arquivos do bucket "${g.bucket}" — rode supabase/sql/lixeira_exclusao_definitiva.sql`};
        }
        arquivos += removidos.size;
      }
      if(g.tabelaMeta && g.ids && g.ids.length){
        const del = await db.from(g.tabelaMeta).delete().in('id', g.ids);
        if(del.error) console.warn('Lixeira: metadados de anexos não removidos', g.tabelaMeta, del.error);
      }
    }
    // registros que ficaram marcados como excluídos (soft delete) saem junto
    if(tabela){ try{ await db.from(tabela).delete().eq('id', Number(trash.registro_id)).not('deleted_at', 'is', null); }catch(e){} }
    const del = await db.from('lixeira_operacional').delete().eq('id', Number(trash.id)).select('id');
    if(del.error || !(del.data || []).length) return {ok:false, motivo:'arquivos excluídos, mas o banco não permitiu remover o item da lixeira (permissão de DELETE em lixeira_operacional)', arquivos};
    return {ok:true, arquivos};
  }
  async function purgeTrash(ids){
    if(isReadOnly()) return toast('Perfil somente leitura.');
    const itens = (state.data.lixeira || []).filter(r => ids.includes(String(r.id)));
    if(!itens.length) return;
    const msg = itens.length === 1
      ? `Excluir definitivamente "${itens[0].titulo || titleFromTrash(itens[0])}"?\n\nO registro e os arquivos anexados (fotos, vídeos, PDFs) serão apagados de forma PERMANENTE e não poderão ser restaurados.`
      : `Excluir definitivamente ${itens.length} item(ns) da lixeira?\n\nOs registros e todos os arquivos anexados (fotos, vídeos, PDFs) serão apagados de forma PERMANENTE e não poderão ser restaurados.`;
    if(!confirm(msg)) return;
    let ok = 0, arquivos = 0; const falhas = [];
    toast('Excluindo definitivamente…');
    for(const t of itens){
      try{
        const r = await purgeTrashItem(t);
        if(r.ok){ ok++; arquivos += r.arquivos || 0; }
        else falhas.push(`${t.titulo || titleFromTrash(t)}: ${r.motivo}`);
      }catch(e){ console.error('Lixeira: exclusão definitiva', t, e); falhas.push(`${t.titulo || titleFromTrash(t)}: erro inesperado`); }
    }
    await loadTrash({silent:true});
    renderLixeira(); renderNav();
    if(falhas.length){
      console.warn('Lixeira: itens não excluídos', falhas);
      alert(`${ok} item(ns) excluído(s) definitivamente (${arquivos} arquivo(s) liberado(s)).\n\n${falhas.length} não foram excluídos:\n` + falhas.slice(0,15).join('\n') + (falhas.length > 15 ? `\n… e mais ${falhas.length-15}.` : ''));
    }else toast(`${ok} item(ns) excluído(s) definitivamente • ${arquivos} arquivo(s) liberado(s).`);
  }

  function parsePayload(v){
    if(!v) return null;
    if(typeof v === 'object') return v;
    try{return JSON.parse(v);}catch(e){return null;}
  }

  function reconcilePointLinksInMemory(){
    const multas = state.data.multas || [];
    const pontos = state.data.pontos || [];
    const usedFineIds = new Set(pontos.map(p => String(p.multa_id || '')).filter(Boolean));
    const fineByPair = new Map();
    const finePairCount = new Map();
    const fineByAuto = new Map();
    const fineAutoCount = new Map();
    multas.forEach(multa => {
      const auto = normalizeAutoNumber(multa.auto);
      if(!auto) return;
      const plateKey = normalizedPlateNumber(multa.placa || multa.carro);
      const pair = `${auto}|${plateKey}`;
      finePairCount.set(pair, (finePairCount.get(pair) || 0) + 1);
      fineByPair.set(pair, multa);
      fineAutoCount.set(auto, (fineAutoCount.get(auto) || 0) + 1);
      fineByAuto.set(auto, multa);
    });
    const pointPairCount = new Map();
    const pointAutoCount = new Map();
    pontos.filter(p => !p.multa_id).forEach(point => {
      const auto = normalizeAutoNumber(point.auto);
      if(!auto) return;
      const pair = `${auto}|${normalizedPlateNumber(point.placa)}`;
      pointPairCount.set(pair, (pointPairCount.get(pair) || 0) + 1);
      pointAutoCount.set(auto, (pointAutoCount.get(auto) || 0) + 1);
    });
    pontos.forEach(point => {
      if(point.multa_id) return;
      const auto = normalizeAutoNumber(point.auto);
      if(!auto) return;
      const pair = `${auto}|${normalizedPlateNumber(point.placa)}`;
      let multa = null;
      if(finePairCount.get(pair) === 1 && pointPairCount.get(pair) === 1) multa = fineByPair.get(pair);
      else if(fineAutoCount.get(auto) === 1 && pointAutoCount.get(auto) === 1) multa = fineByAuto.get(auto);
      if(!multa || usedFineIds.has(String(multa.id))) return;
      point.multa_id = multa.id;
      if(!point.gravidade) point.gravidade = multa.gravidade || inferSeverityFromInfraction(point.motivo || multa.infracao || '');
      if(!toNum(point.pontos)) point.pontos = pointsBySeverity(point.gravidade);
      usedFineIds.add(String(multa.id));
    });
  }

  async function loadAll(opts={}){
    const db = connect();
    if(!db){ setStatus('Supabase não configurado.', 'error'); return; }
    state.loading = true;
    setStatus(opts.manual ? 'Atualizando dados...' : 'Carregando dados...', 'loading');
    const tasks = operationalKeys.map(k => loadModule(k, {silent:true}));
    tasks.push(loadAuxMonths('manutencoesMeses', 'manutencoes_meses'));
    tasks.push(loadAuxMonths('producaoMeses', 'producao_meses'));
    tasks.push(loadTrash({silent:true}));
    const results = await Promise.allSettled(tasks);
    results.forEach((r,i)=>{ if(r.status==='rejected') console.warn('Falha ao carregar:', r.reason); });
    await loadBratFiles({silent:true});
    await loadSinistroFiles({silent:true});
    reconcilePointLinksInMemory();
    state.loading = false;
    state.lastLoad = new Date();
    setStatus('Dados carregados.', 'ok');
    renderNav();
    renderCurrentPage();
    setupBratRealtime();
    setupChamadosRealtime();
    setupSinistrosRealtime();
  }

  async function loadAuxMonths(stateKey, table){
    const db = connect(); if(!db) return [];
    try{
      const res = await db.from(table).select('*').order('mes', {ascending:false}).limit(500);
      if(res.error){ console.warn(`Tabela ${table} indisponível:`, res.error); state.data[stateKey] = []; return []; }
      const remote = (res.data || []).filter(r => /^\d{4}-\d{2}$/.test(String(r.mes || '')));
      const seedRoot = window.FROTA_LEGACY_SEED || {};
      const seedKey = stateKey;
      const seedMonths = Array.isArray(seedRoot[seedKey]) ? seedRoot[seedKey] : [];
      const map = new Map();
      seedMonths.forEach(x => { const mes = typeof x === 'string' ? x : x?.mes; if(/^\d{4}-\d{2}$/.test(String(mes||''))) map.set(mes, {mes}); });
      remote.forEach(x => { const mes = x?.mes; if(/^\d{4}-\d{2}$/.test(String(mes||''))) map.set(mes, {...(map.get(mes)||{}), ...x}); });
      state.data[stateKey] = Array.from(map.values()).sort((a,b)=>String(b.mes||'').localeCompare(String(a.mes||'')));
      return state.data[stateKey];
    }catch(e){ console.warn(`Falha ao carregar ${table}:`, e); state.data[stateKey] = []; return []; }
  }


  function hasLegacySeed(key){
    const seed = window.FROTA_LEGACY_SEED || {};
    return Array.isArray(seed[key]) && seed[key].length > 0;
  }
  function legacyRows(key){
    const seed = window.FROTA_LEGACY_SEED || {};
    return Array.isArray(seed[key]) ? seed[key].map(r=>normalizeLoaded(key, {...r, _origem_seed:true})) : [];
  }
  function formulariosRows(){ return legacyRows('formularios_defeito').map(r=>({...r, mes:r.mes || ym(r.data), status:r.status || 'pendente'})); }
  function formulariosPdfs(){ const seed = window.FROTA_LEGACY_SEED || {}; return Array.isArray(seed.formulariosDefeitoArquivos) ? seed.formulariosDefeitoArquivos : []; }
  function formulariosPendingCount(){ return formulariosRows().filter(r=>!finalStatus('formularios', r)).length; }
  function canonicalPlate(v){
    const raw = String(v || '').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
    return raw.length >= 4 ? raw.slice(-4) : raw;
  }
  function seedIdentity(key, row){
    if(!row) return '';
    if(key === 'veiculos') return canonicalPlate(row.placa || row.carro || row.id || '');
    if(key === 'motoristas') return clean(row.cpf || row.cnh || row.nome || row.id || '');
    if(key === 'tacografos') return clean(canonicalPlate(row.placa || '') + '|' + (row.data_emissao || row.data || '') + '|' + (row.data_validade || row.validade || ''));
    if(key === 'oleo') return clean(canonicalPlate(row.placa || '') + '|' + (row.data_ultima_troca || row.data || '') + '|' + (row.tipo || '') + '|' + (row.km_proxima_troca || row.proxkm || row.proxKm || ''));
    // Identidade usada só para não duplicar registros antigos (base local x Supabase).
    // As colunas de origem continuam sendo lidas aqui apenas para essa comparação; não aparecem nem são gravadas.
    if(key === 'producao') return clean((row.data || '') + '|' + canonicalPlate(row.placa || '') + '|' + (row.servico || '') + '|' + (row.responsavel || row.responsaveis || '') + '|' + (row.obs || [row.dia_semana, row.origem_arquivo, row.origem_aba].filter(Boolean).join(' • ')));
    if(key === 'manutencoes') return clean((row.data || '') + '|' + canonicalPlate(row.placa || '') + '|' + (row.servico || row.tipo || '') + '|' + (row.valor || '') + '|' + (row.descricao || row.obs || '') + '|' + (row.origem || row.origem_aba || ''));
    if(key === 'formularios_defeito' || key === 'formularios') return clean((row.data || '') + '|' + canonicalPlate(row.placa || '') + '|' + (row.anexo || '') + '|' + (row.pagina || '') + '|' + (row.defeito || ''));
    return String(row.id || '');
  }
  function applyLegacySeed(key, remoteRows, loadedTable){
    const seedRoot = window.FROTA_LEGACY_SEED || {};
    const seed = Array.isArray(seedRoot[key]) ? seedRoot[key].map(r=>normalizeLoaded(key, {...r, _origem_seed:true})) : [];
    const rows = Array.isArray(remoteRows) ? remoteRows.map(r=>normalizeLoaded(key,r)) : [];
    if(!seed.length) return dedupeRows(key, rows);

    const remoteIds = new Set(rows.map(r => String(r.id ?? '')).filter(Boolean));
    const map = new Map();
    seed.filter(r => !remoteIds.has(String(r.id ?? ''))).forEach(r => map.set(seedIdentity(key,r) || `seed:${r.id}`, r));
    rows.forEach(r => map.set(seedIdentity(key,r) || `remote:${r.id}`, {...(map.get(seedIdentity(key,r) || `remote:${r.id}`) || {}), ...r, _origem_seed:false}));
    const merged = dedupeRows(key, Array.from(map.values()).filter(r=>!r.deleted_at).map(r=>normalizeLoaded(key,r)));
    if(key === 'producao') merged.sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')) || Number(b.id||0)-Number(a.id||0));
    if(key === 'oleo') merged.sort((a,b)=>String(b.data_ultima_troca||b.data||'').localeCompare(String(a.data_ultima_troca||a.data||'')) || String(a.placa||'').localeCompare(String(b.placa||'')));
    if(key === 'veiculos') merged.sort((a,b)=>String(a.placa||'').localeCompare(String(b.placa||'')));
    if(key === 'motoristas') merged.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||'')));
    return merged;
  }
  function dedupeRows(key, rows){
    const byId = new Map();
    (rows || []).forEach(r => {
      const idKey = String(r?.id ?? '').trim();
      if(idKey) byId.set(idKey, {...(byId.get(idKey) || {}), ...r});
      else byId.set(`sem-id:${seedIdentity(key,r) || Math.random()}`, r);
    });
    const logical = new Map();
    Array.from(byId.values()).forEach(r => {
      const logicalKey = seedIdentity(key,r) || `id:${r.id}`;
      const current = logical.get(logicalKey);
      if(!current){ logical.set(logicalKey, r); return; }
      const currentTime = String(current.updated_at || current.created_at || '');
      const nextTime = String(r.updated_at || r.created_at || '');
      logical.set(logicalKey, nextTime >= currentTime ? {...current, ...r} : {...r, ...current});
    });
    return Array.from(logical.values());
  }


  async function loadModule(key, opts={}){
    const cfg = byKey[key]; const db = connect();
    if(!cfg || !cfg.table){ state.data[key] = applyLegacySeed(key, []); return state.data[key]; }
    if(!db){ state.data[key] = applyLegacySeed(key, []); return state.data[key]; }
    if(Array.isArray(cfg.mergeTables) && cfg.mergeTables.length){
      let all = [];
      let anyOk = false;
      let lastError = null;
      for(const table of cfg.mergeTables){
        let query = db.from(table).select('*');
        if(cfg.softDelete) query = query.is('deleted_at', null);
        if(cfg.order) query = query.order(cfg.order, {ascending: cfg.ascending !== false, nullsFirst:false});
        query = query.limit(CFG.pageSize || 5000);
        let res = await query;
        if(res.error && cfg.softDelete && missingColumn(res.error) === 'deleted_at'){
          let q2 = db.from(table).select('*');
          if(cfg.order) q2 = q2.order(cfg.order, {ascending: cfg.ascending !== false, nullsFirst:false});
          res = await q2.limit(CFG.pageSize || 5000);
        }
        if(res.error && cfg.order && missingColumn(res.error) === cfg.order){
          let q3 = db.from(table).select('*');
          if(cfg.softDelete) q3 = q3.is('deleted_at', null);
          res = await q3.limit(CFG.pageSize || 5000);
        }
        if(res.error){ lastError = res.error; console.warn(`Falha ao carregar ${table}:`, res.error); continue; }
        anyOk = true;
        all = all.concat((res.data || []).map(r => ({...r, _origem_tabela: table})));
      }
      if(!anyOk && lastError && !hasLegacySeed(key)){ state.errors[key] = lastError.message || String(lastError); throw lastError; }
      const map = new Map();
      all.filter(r => !r.deleted_at).map(r => normalizeLoaded(key,r)).forEach(r => {
        const id = seedIdentity(key,r) || `${r._origem_tabela || ''}:${r.id || Math.random()}`;
        map.set(id, {...(map.get(id) || {}), ...r});
      });
      let mergedRows = Array.from(map.values());
      if(cfg.order){
        const dir = cfg.ascending === false ? -1 : 1;
        mergedRows.sort((a,b) => dir * String(a[cfg.order] || '').localeCompare(String(b[cfg.order] || '')) || Number(b.id||0)-Number(a.id||0));
      }
      state.errors[key] = null;
      state.data[key] = applyLegacySeed(key, mergedRows, cfg.mergeTables.join(','));
      if(!opts.silent) { renderNav(); if(state.current === key) renderCurrentPage(); }
      return state.data[key];
    }
    const tables = [cfg.table].concat(cfg.fallbackTables || []);
    let lastError = null;
    let loaded = [];
    let loadedTable = cfg.table;
    for(const table of tables){
      let query = db.from(table).select('*');
      if(cfg.softDelete) query = query.is('deleted_at', null);
      if(cfg.order) query = query.order(cfg.order, {ascending: cfg.ascending !== false, nullsFirst:false});
      query = query.limit(CFG.pageSize || 5000);
      let res = await query;
      if(res.error && cfg.softDelete && missingColumn(res.error) === 'deleted_at'){
        let q2 = db.from(table).select('*');
        if(cfg.order) q2 = q2.order(cfg.order, {ascending: cfg.ascending !== false, nullsFirst:false});
        res = await q2.limit(CFG.pageSize || 5000);
      }
      if(res.error && cfg.order && missingColumn(res.error) === cfg.order){
        let q3 = db.from(table).select('*');
        if(cfg.softDelete) q3 = q3.is('deleted_at', null);
        res = await q3.limit(CFG.pageSize || 5000);
      }
      if(res.error && cfg.softDelete && missingColumn(res.error) === 'deleted_at'){
        res = await db.from(table).select('*').limit(CFG.pageSize || 5000);
      }
      if(!res.error){ loaded = (res.data || []); loadedTable = table; break; }
      lastError = res.error;
    }
    if(lastError && !loaded.length && !hasLegacySeed(key)){ state.errors[key] = lastError.message || String(lastError); throw lastError; }
    state.errors[key] = null;
    state.data[key] = applyLegacySeed(key, loaded.filter(r => !r.deleted_at).map(r => normalizeLoaded(key,r)), loadedTable);
    if(!opts.silent) { renderNav(); if(state.current === key) renderCurrentPage(); }
    return state.data[key];
  }
  function normalizeLoaded(key,row){
    const r = {...row};
    if(key === 'multas') { r.placa = r.placa || r.carro || ''; r.prazo_recurso = r.prazo_recurso || r.prazo_recorrer || r.prazo_recurso_multa || ''; r.prazo_aceite = r.prazo_aceite || r.prazo || r.prazo_real_infrator || ''; r.envio_rca = r.envio_rca || r.data_envio_rca || ''; r.status = r.status || 'pendente'; r.prioridade = multaPrioridadeAtiva(r); r.valor_calculado = keyMoney('multas', r); }
    if(key === 'pontos') { r.multa_id = toNum(r.multa_id) || null; r.motivo = r.motivo || r.origem || ''; if(!r.gravidade) r.gravidade = inferSeverityFromInfraction(r.motivo); if(!toNum(r.pontos)) r.pontos = pointsBySeverity(r.gravidade); }
    if(key === 'motoristas') r.validade = r.validade || r.venc_cnh || '';
    if(key === 'veiculos') r.renavam = String(r.renavam || '').replace(/\D/g,'').slice(0,11);
    if(key === 'tacografos') { r.data_emissao = r.data_emissao || r.data || ''; r.data_validade = r.data_validade || r.validade || ''; r.status = r.status || r.situacao || 'ativo'; }
    if(key === 'oleo') { r.data_ultima_troca = r.data_ultima_troca || r.data || ''; r.data = r.data || r.data_ultima_troca || ''; r.km_ultima_vistoria = r.km_ultima_vistoria || r.km || ''; r.km_proxima_troca = r.km_proxima_troca || r.proxkm || r.proxKm || r.prox_km || ''; r.proxkm = r.km_proxima_troca || r.proxkm || ''; r.situacao = oilSituationValue(r); r.status = r.situacao; }
    if(key === 'manutencoes') { r.servico = r.servico || r.tipo || ''; r.descricao = r.descricao || r.obs || ''; r.mes = r.mes || ym(r.data); r.valor = keyMoney('manutencoes', r); }
    if(key === 'producao') { r.mes = r.mes || ym(r.data); r.responsavel = r.responsavel || r.responsaveis || ''; r.responsaveis = r.responsaveis || r.responsavel || ''; r.obs = r.obs || ''; }
    if(key === 'sinistros') { r.avaria = r.avaria || r.descricao || r.obs || ''; r.status = r.status || 'pendente'; r.tipo = r.tipo || 'Avaria'; r.responsabilidade = r.responsabilidade || 'Em análise'; r.valor = keyMoney('sinistros', r); }
    if(key === 'brat') r.mes = r.mes || ym(r.data);
    return r;
  }

  async function loadTrash(opts={}){
    const db = connect(); if(!db) return [];
    const res = await db.from('lixeira_operacional').select('*').is('restored_at', null).order('deleted_at', {ascending:false}).limit(1000);
    if(res.error){ console.warn('Lixeira indisponível:', res.error); state.data.lixeira=[]; return []; }
    state.data.lixeira = res.data || [];
    if(!opts.silent && state.current === 'lixeira') renderLixeira();
    return state.data.lixeira;
  }

  function exportCsv(key, rows){
    const cfg = byKey[key];
    const list = (rows || filterRows(key)).map(r => (key === 'multas' || key === 'manutencoes' || key === 'sinistros') ? {...r, valor: brlKey(key, r)} : r);
    downloadCsv(`${key}-${new Date().toISOString().slice(0,10)}.csv`, list, cfg?.columns);
  }
  function downloadCsv(filename, rows, columns){
    if(!rows || !rows.length) return toast('Nenhum dado para exportar.');
    const keys = columns ? columns.map(c=>c[0]) : Object.keys(rows[0]);
    const csv = [keys.join(';')].concat(rows.map(r => keys.map(k => csvCell(r[k])).join(';'))).join('\n');
    const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function csvCell(v){ return `"${String(v ?? '').replace(/"/g,'""').replace(/\n/g,' ')}"`; }

  function attentionRows(key, rows, limit=24){
    const pend = pendingRows(key, rows);
    return pend.map(r => {
      const prazoRaw = r.prazo_aceite || r.prazo_recurso || '';
      const prazo = String(prazoRaw || '').slice(0,10);
      const dias = /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? daysUntil(prazo) : 9999;
      return {r, dias};
    }).sort((a,b) => a.dias - b.dias).slice(0, limit).map(x => x.r);
  }
  function multaAttentionItem(r){
    const placa = String(r.placa || r.carro || '-').toUpperCase();
    const motorista = r.motorista || 'Motorista não informado';
    const valor = brlKey('multas', r);
    const infracao = stripHtml(r.infracao || r.obs || r.observacao || '') || 'Infração não detalhada';
    const prazoRaw = r.prazo_aceite || r.prazo_recurso || '';
    const prazo = String(prazoRaw || '').slice(0,10);
    const dias = /^\d{4}-\d{2}-\d{2}$/.test(prazo) ? daysUntil(prazo) : 9999;
    const prazoTxt = dias === 9999 ? 'Sem prazo definido' : dateAlertText(prazo);
    const statusTxt = STATUS[r.status] || r.status || 'Pendente';
    const accent = dias < 0 ? [216,57,51] : dias <= 7 ? [255,159,10] : [56,189,248];
    return {
      line1: `${placa} • ${motorista} • ${valor}`,
      line2: `${infracao.slice(0,90)} — ${statusTxt} • ${prazoTxt}`,
      accent,
      tag: dias === 9999 ? '' : (dias < 0 ? 'Vencido' : dias + 'd'),
      tagColor: accent
    };
  }
  function veiculoStatusInfo(raw){
    const s = clean(raw || 'ativo');
    if(s.includes('manut')) return {label: 'Manutenção', color:[216,57,51]};
    if(s.includes('inativ')) return {label: 'Inativo', color:[148,163,184]};
    return {label: 'Ativo', color:[34,153,84]};
  }
  function exportVeiculosMotoristaPdf(doc, rows, pageW, pageH, GOLD, INK, periodLabel, generated){
    const GREEN = [34,153,84];
    const list = rows.slice().sort((a,b) => String(a.placa||a.carro||'').localeCompare(String(b.placa||b.carro||'')));
    const total = list.length;
    const ativos = list.filter(r => !clean(r.status||'ativo').includes('manut') && !clean(r.status||'ativo').includes('inativ')).length;
    const manutencao = list.filter(r => clean(r.status||'').includes('manut')).length;
    const comMotorista = list.filter(r => String(r.motorista||'').trim()).length;

    function header(){
      doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(0,0,pageW,32,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(0,30,pageW,1.4,'F');
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(0,31.4,pageW,0.6,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(255,255,255); doc.text('FROTA EXEMPLO',14,13);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(GOLD[0],GOLD[1],GOLD[2]); doc.text('Veículos e motoristas vinculados',14,21);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(210,210,210);
      doc.text(periodLabel, pageW-14, 12, {align:'right'});
      doc.text(generated, pageW-14, 19, {align:'right'});
    }
    function kpiSmall(x,w,y,label,value){
      doc.setDrawColor(226,226,222); doc.setFillColor(255,255,255); doc.roundedRect(x,y,w,20,1.5,1.5,'FD');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y,w,1.4,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.6); doc.setTextColor(130,130,126); doc.text(String(label).toUpperCase(), x+3, y+7);
      doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(String(value), x+3, y+16);
    }

    header();
    let y = 40;
    kpiSmall(14,43,y,'Veículos', total);
    kpiSmall(61,43,y,'Ativos', ativos);
    kpiSmall(108,43,y,'Em manutenção', manutencao);
    kpiSmall(155,41,y,'Com motorista', comMotorista);
    y += 28;

    doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(INK[0],INK[1],INK[2]);
    doc.text('Placa e motorista vinculado', 14, y);
    doc.setDrawColor(GOLD[0],GOLD[1],GOLD[2]); doc.setLineWidth(0.8); doc.line(14,y+2,196,y+2);
    y += 9;

    const rowH = 15, gap = 3;
    list.forEach(r => {
      if(y > pageH - rowH - 14){ doc.addPage(); header(); y = 40; }
      const placaTxt = String(r.placa || r.carro || '-').toUpperCase().trim() || '-';
      const motoristaTxt = String(r.motorista || '').trim();
      const st = veiculoStatusInfo(r.status);

      doc.setDrawColor(230,230,226); doc.setFillColor(252,252,250); doc.roundedRect(14, y, 182, rowH, 2, 2, 'FD');
      doc.setFillColor(st.color[0],st.color[1],st.color[2]); doc.rect(14, y, 2.4, rowH, 'F');

      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.roundedRect(20, y+3, 34, 9, 1.5, 1.5, 'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(INK[0],INK[1],INK[2]);
      doc.text(placaTxt, 37, y+9, {align:'center'});

      doc.setFont('helvetica','bold'); doc.setFontSize(10.5);
      if(motoristaTxt){
        doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(motoristaTxt, 60, y+8);
      } else {
        doc.setFont('helvetica','italic'); doc.setFontSize(9.5); doc.setTextColor(160,160,156);
        doc.text('Sem motorista vinculado', 60, y+8);
      }

      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(140,140,136);
      doc.text(String(r.modelo || '').slice(0,64), 60, y+12.5);

      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(st.color[0],st.color[1],st.color[2]);
      doc.text(st.label, 194, y+8, {align:'right'});

      y += rowH + gap;
    });

    const totalPages = doc.internal.getNumberOfPages();
    for(let p=1; p<=totalPages; p++){
      doc.setPage(p);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(160,160,156);
      doc.text('FROTA EXEMPLO', 14, 291);
      doc.text(String(p) + '/' + totalPages, pageW-14, 291, {align:'right'});
    }
    const slug = (v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'relatorio';
    doc.save('veiculos-motoristas-' + slug(periodLabel) + '-' + new Date().toISOString().slice(0,10) + '.pdf');
  }
  function exportFinancialPdf(rows, totals){
    if(!rows || !rows.length) return toast('Nenhum dado para gerar PDF.');
    const Ctor = window.jspdf && window.jspdf.jsPDF;
    if(!Ctor){ toast('Biblioteca PDF não carregada.'); return; }
    const doc = new Ctor({orientation:'portrait', unit:'mm', format:'a4'});
    const pageW = 210, pageH = 297;
    const GOLD = [245,190,0];
    const INK = [26,26,26];
    const GREEN = [34,153,84];
    const generated = new Date().toLocaleString('pt-BR');
    const sorted = rows.slice().sort((a,b) => String(a.mes||'').localeCompare(String(b.mes||'')));
    const periodLabel = sorted.length ? monthLabel(sorted[0].mes) + ' a ' + monthLabel(sorted[sorted.length-1].mes) : 'Sem dados';
    const manTotal = totals?.manTotal || 0, multaTotal = totals?.multaTotal || 0, sinistroTotal = totals?.sinistroTotal || 0;
    const totalGeral = manTotal + multaTotal + sinistroTotal;

    function header(subtitle){
      doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(0,0,pageW,32,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(0,30,pageW,1.4,'F');
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(0,31.4,pageW,0.6,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(255,255,255); doc.text('FROTA EXEMPLO',14,13);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(GOLD[0],GOLD[1],GOLD[2]); doc.text(subtitle || 'Relatório Financeiro Consolidado',14,21);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(210,210,210);
      doc.text(periodLabel, pageW-14, 12, {align:'right'});
      doc.text(generated, pageW-14, 19, {align:'right'});
    }
    function section(title, y, small, x){
      x = x || 14;
      doc.setFillColor(INK[0],INK[1],INK[2]); doc.rect(x,y,3,6.4,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+6.4,3,1.3,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(small?9:10.5); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(title,x+6,y+5.2);
      return y + (small?10.5:12);
    }
    function kpi(x,y,w,title,value,sub){
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y,w,1.4,'F');
      doc.setDrawColor(226,226,222); doc.setFillColor(255,255,255); doc.roundedRect(x,y+1.4,w,25,1.5,1.5,'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(130,130,126); doc.text(String(title).toUpperCase().slice(0,22),x+3,y+7.6);
      doc.setFontSize(13); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(String(value).slice(0,20),x+3,y+16.2);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.4); doc.setTextColor(150,150,146); doc.text(String(sub||'').slice(0,28),x+3,y+22.6);
    }
    function table(headers, dataRows, x, y, widths, limit=36){
      const h=6.6;
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setFillColor(INK[0],INK[1],INK[2]); doc.setTextColor(255,255,255);
      let cx=x;
      headers.forEach((head,i)=>{ doc.rect(cx,y,widths[i],h,'F'); doc.text(String(head),cx+2,y+4.5); cx+=widths[i]; });
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+h,widths.reduce((a,b)=>a+b,0),0.6,'F');
      y+=h+0.6;
      doc.setFont('helvetica','normal'); doc.setTextColor(40,40,38);
      dataRows.slice(0,limit).forEach((row,idx)=>{
        if(y > pageH-16){ doc.addPage(); header('Financeiro — continuação'); y=40; }
        doc.setFillColor(idx%2?255:247, idx%2?255:246, idx%2?255:239);
        doc.rect(x,y,widths.reduce((a,b)=>a+b,0),h,'F'); cx=x;
        row.forEach((cell,i)=>{ const val=String(cell==null?'':cell).replace(/\s+/g,' '); const lines=doc.splitTextToSize(val,widths[i]-3).slice(0,2); doc.text(lines,cx+2,y+4.5); cx+=widths[i]; });
        y+=h;
      });
      return y+3;
    }
    function barChart(items, x, y, w, color, fmt){
      fmt = fmt || (v => String(v));
      const labelW = 34, valueW = 30, gap = 3, barH = 6.4;
      const trackW = w - labelW - valueW;
      const max = Math.max(...items.map(it=>it[1]), 1);
      items.forEach(([label, value]) => {
        if(y > pageH - 18){ doc.addPage(); header('Financeiro — continuação'); y = 40; }
        doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.setTextColor(80,80,76);
        doc.text(String(label).slice(0,20), x, y+4.4);
        doc.setFillColor(240,240,235); doc.roundedRect(x+labelW, y, trackW, barH, 1,1,'F');
        const segW = Math.max(2, (value/max) * trackW);
        doc.setFillColor(color[0],color[1],color[2]); doc.rect(x+labelW, y, segW, barH, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.2); doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(fmt(value), x+w, y+4.4, {align:'right'});
        y += barH + gap;
      });
      return y + 1;
    }

    header('Relatório executivo');
    kpi(14,40,43,'Manutenções', brl(manTotal), 'histórico');
    kpi(61,40,43,'Multas', brl(multaTotal), 'histórico');
    kpi(108,40,43,'Sinistros/Avarias', brl(sinistroTotal), 'histórico');
    kpi(155,40,41,'Total geral', brl(totalGeral), 'custos consolidados');
    let y = 74;

    const last12 = sorted.slice(-12);
    y = section('Evolução mensal — custo total', y);
    y = barChart(last12.length ? last12.map(r => [monthLabel(r.mes), r.manutencoes + r.multas + r.sinistros]) : [['Sem dados',0]], 14, y+1, 182, GOLD, brl) + 3;

    if(y > pageH-60){ doc.addPage(); header('Evolução por categoria'); y = 40; }
    const last8 = sorted.slice(-8);
    y = section('Manutenções por mês', y, true);
    y = barChart(last8.length ? last8.map(r => [monthLabel(r.mes), r.manutencoes]) : [['Sem dados',0]], 14, y+1, 182, [56,132,216], brl) + 3;

    if(y > pageH-60){ doc.addPage(); header('Evolução por categoria'); y = 40; }
    y = section('Sinistros/avarias por mês', y, true);
    y = barChart(last8.length ? last8.map(r => [monthLabel(r.mes), r.sinistros]) : [['Sem dados',0]], 14, y+1, 182, [216,57,51], brl) + 3;

    doc.addPage(); header('Detalhamento mensal'); y = 40;
    y = section(sorted.length + ' mês(es) no histórico', y, true);
    const detailRows = sorted.slice().reverse().map(r => [
      monthLabel(r.mes), brl(r.manutencoes), brl(r.multas), brl(r.sinistros),
      brl(r.manutencoes + r.multas + r.sinistros), String(r.oleo || 0)
    ]);
    y = table(['Mês','Manutenções','Multas','Sinistros/Avarias','Total','Óleo'], detailRows, 14, y, [28,34,30,40,34,16], detailRows.length);

    const totalPages = doc.internal.getNumberOfPages();
    for(let p=1; p<=totalPages; p++){
      doc.setPage(p);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(160,160,156);
      doc.text('FROTA EXEMPLO', 14, 291);
      doc.text(String(p) + '/' + totalPages, pageW-14, 291, {align:'right'});
    }
    doc.save('financeiro-consolidado-' + new Date().toISOString().slice(0,10) + '.pdf');
  }
  function moduleBreakdownConfigs(key){
    if(key === 'manutencoes') return [
      {title:'Por tipo/peça', fn:r => String(r.tipo || r.servico || '').trim() || 'Não informado'},
      {title:'Por status', fn:r => STATUS[r.status] || r.status || 'Não informado'}
    ];
    if(key === 'sinistros') return [
      {title:'Por tipo', fn:r => r.tipo || 'Avaria'},
      {title:'Por responsabilidade', fn:r => r.responsabilidade || 'Em análise'}
    ];
    if(key === 'oleo') return [
      {title:'Por situação', fn:r => oilSituation(r).label},
      {title:'Por tipo', fn:r => r.tipo || 'Motor'}
    ];
    if(key === 'tacografos') return [
      {title:'Por status', fn:r => STATUS[r.status || r.situacao] || r.status || r.situacao || 'Não informado'}
    ];
    if(key === 'brat') return [
      {title:'Por tipo', fn:r => r.tipo || 'Não informado'},
      {title:'Por status', fn:r => STATUS[r.status] || r.status || 'Não informado'}
    ];
    if(key === 'motoristas') return [
      {title:'Por status', fn:r => STATUS[r.status] || r.status || 'Ativo'},
      {title:'Por categoria CNH', fn:r => r.categoria || 'Não informada'}
    ];
    return [];
  }
  function exportPdf(key, rows){
    if(!rows || !rows.length) return toast('Nenhum dado para gerar PDF.');
    const cfg = byKey[key];
    const Ctor = window.jspdf && window.jspdf.jsPDF;
    if(!Ctor){ toast('Biblioteca PDF não carregada.'); return; }
    const doc = new Ctor({orientation:'portrait', unit:'mm', format:'a4'});
    const pageW = 210, pageH = 297;
    const GOLD = [245,190,0];
    const INK = [26,26,26];
    const GREEN = [34,153,84];
    const NAVY = [21,42,74];
    const RED = [216,57,51];
    const AMBER = [214,158,26];
    const PALETTE = [GOLD, NAVY, GREEN, RED, [124,58,237], [176,176,170]];
    const periodLabel = reportPeriodLabel();
    const moduleLabel = cfg?.title || key;
    const generated = new Date().toLocaleString('pt-BR');

    if(key === 'veiculos'){
      exportVeiculosMotoristaPdf(doc, rows, pageW, pageH, GOLD, INK, periodLabel, generated);
      return;
    }

    // ============================================================
    // 1) DADOS — tudo calculado uma única vez a partir dos registros reais
    // ============================================================
    const stats = reportStats(key, rows).slice(0,4);
    const topPlacas = Array.from(rows.reduce((map,r)=>{ const p=canonicalPlate(r.placa||r.carro||''); if(p) map.set(p,(map.get(p)||0)+1); return map; }, new Map()).entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const monthMap = rows.reduce((map,r)=>{ const m=reportDateMonth(key,r); if(m) map.set(m,(map.get(m)||0)+1); return map; }, new Map());
    const monthRows = Array.from(monthMap.entries()).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12);
    const driverRanking = key === 'multas' ? driverRankingRows(rows, 8) : [];
    const pend = pendingRows(key, rows);
    const breakdowns = moduleBreakdownConfigs(key);

    const veiculosAll = state.data.veiculos || [];
    const veiculosAtivos = veiculosAll.filter(r => !clean(r.status||'ativo').includes('manut') && !clean(r.status||'ativo').includes('inativ')).length;
    const disponibilidadePct = veiculosAll.length ? Math.round(veiculosAtivos/veiculosAll.length*100) : null;

    function trendInfo(){
      if(monthRows.length < 2) return null;
      const [prevM, prevV] = monthRows[monthRows.length-2];
      const [curM, curV] = monthRows[monthRows.length-1];
      const delta = curV - prevV;
      const pct = prevV ? Math.round(Math.abs(delta)/prevV*100) : (curV>0 ? 100 : 0);
      return {prevM, prevV, curM, curV, delta, pct};
    }
    function reincidenciaInfo(){
      const ranking = driverRankingRows(rows, 999);
      return {count: ranking.filter(d=>d.total>=2).length, total: ranking.length};
    }
    function topVehicleByCost(){
      const map = new Map();
      rows.forEach(r => { const p = canonicalPlate(r.placa||r.carro||''); if(!p) return; const cur = map.get(p) || {cost:0,count:0}; cur.cost += toNum(r.valor); cur.count++; map.set(p,cur); });
      const arr = Array.from(map.entries()).sort((a,b)=>b[1].cost-a[1].cost);
      return arr[0] ? {placa:arr[0][0], cost:arr[0][1].cost, count:arr[0][1].count} : null;
    }

    const summaryLines = [];
    summaryLines.push(`${rows.length} registro(s) no período (${periodLabel}).`);
    summaryLines.push(pend.length ? `${pend.length} pendência(s) em aberto que necessitam atenção da gestão.` : 'Nenhuma pendência em aberto neste período.');
    if(key === 'multas' || key === 'manutencoes' || key === 'sinistros'){
      summaryLines.push(`Valor total envolvido no período: ${brl(sumMoney(key, rows))}.`);
    }
    if(key === 'multas'){
      const rc = reincidenciaInfo();
      if(rc.total) summaryLines.push(`${rc.count} de ${rc.total} motorista(s) com reincidência (2 ou mais multas no período).`);
      const tr = trendInfo();
      if(tr) summaryLines.push(tr.delta<=0 ? `Redução de ${tr.pct}% no número de multas em ${monthLabel(tr.curM)} frente a ${monthLabel(tr.prevM)}.` : `Aumento de ${tr.pct}% no número de multas em ${monthLabel(tr.curM)} frente a ${monthLabel(tr.prevM)}.`);
    }
    if(key === 'manutencoes'){
      const tv = topVehicleByCost();
      if(tv) summaryLines.push(`Veículo mais crítico do período: ${tv.placa}, com ${brl(tv.cost)} em ${tv.count} serviço(s).`);
      if(disponibilidadePct != null) summaryLines.push(`Disponibilidade atual da frota: ${disponibilidadePct}% dos veículos em operação.`);
      summaryLines.push(`Custo médio por serviço no período: ${brl(rows.length ? sumMoney(key, rows)/rows.length : 0)}.`);
    }

    // ============================================================
    // 2) PRIMITIVAS DE DESENHO — usadas por todas as páginas
    // ============================================================
    function alertColor(label){
      const s = clean(label);
      if(s.includes('gravissima') || s.includes('grave') || s.includes('vencid') || s.includes('atrasad') || s.includes('critic')) return RED;
      if(s.includes('media') || s.includes('verificar') || s.includes('atencao') || s.includes('pendente') || s.includes('andamento') || s.includes('analise')) return AMBER;
      if(s.includes('leve') || s.includes('ativo') || s.includes('concluido') || s.includes('pago') || s.includes('aceito') || s.includes('recorrida') || s.includes('sem necessidade')) return GREEN;
      return null;
    }
    function textColorFor(bg){
      const lum = 0.299*bg[0] + 0.587*bg[1] + 0.114*bg[2];
      return lum > 170 ? [26,26,26] : [255,255,255];
    }
    function header(subtitle){
      doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.rect(0,0,pageW,32,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(0,30,pageW,1.4,'F');
      doc.setFillColor(GREEN[0],GREEN[1],GREEN[2]); doc.rect(0,31.4,pageW,0.6,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(255,255,255); doc.text('FROTA EXEMPLO',14,13);
      doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(GOLD[0],GOLD[1],GOLD[2]); doc.text(subtitle || moduleLabel,14,21);
      doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(210,210,210);
      doc.text(periodLabel, pageW-14, 12, {align:'right'});
      doc.text(generated, pageW-14, 19, {align:'right'});
    }
    function section(title, y, small, x){
      x = x || 14;
      doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.rect(x,y,3,6.4,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+6.4,3,1.3,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(small?9:10.5); doc.setTextColor(INK[0],INK[1],INK[2]); doc.text(title,x+6,y+5.2);
      return y + (small?10.5:12);
    }
    function kpi(x,y,w,title,value,sub,valueColor){
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y,w,1.4,'F');
      doc.setDrawColor(226,226,222); doc.setFillColor(255,255,255); doc.roundedRect(x,y+1.4,w,25,1.5,1.5,'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(130,130,126); doc.text(String(title).toUpperCase().slice(0,22),x+3,y+7.6);
      const vc = valueColor || INK;
      doc.setFontSize(13); doc.setTextColor(vc[0],vc[1],vc[2]); doc.text(String(value).slice(0,20),x+3,y+16.2);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.4); doc.setTextColor(150,150,146); doc.text(String(sub||'').slice(0,28),x+3,y+22.6);
    }
    function table(headers, dataRows, x, y, widths, limit=36, colorCol=-1){
      const h=6.6;
      doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.setTextColor(255,255,255);
      let cx=x;
      headers.forEach((head,i)=>{ doc.rect(cx,y,widths[i],h,'F'); doc.text(String(head),cx+2,y+4.5); cx+=widths[i]; });
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+h,widths.reduce((a,b)=>a+b,0),0.6,'F');
      y+=h+0.6;
      dataRows.slice(0,limit).forEach((row,idx)=>{
        if(y > pageH-16){ doc.addPage(); header(moduleLabel); y=40; }
        doc.setFillColor(idx%2?255:247, idx%2?255:246, idx%2?255:239);
        doc.rect(x,y,widths.reduce((a,b)=>a+b,0),h,'F'); cx=x;
        row.forEach((cell,i)=>{
          const val=String(cell==null?'':cell).replace(/\s+/g,' ');
          const ac = i===colorCol ? alertColor(val) : null;
          doc.setFont('helvetica', ac ? 'bold' : 'normal');
          const c = ac || [40,40,38];
          doc.setTextColor(c[0],c[1],c[2]);
          const lines=doc.splitTextToSize(val,widths[i]-3).slice(0,2);
          doc.text(lines,cx+2,y+4.5); cx+=widths[i];
        });
        y+=h;
      });
      return y+3;
    }
    function groupSummary(labelFn){
      const map = new Map();
      rows.forEach(r => {
        const label = labelFn(r) || 'Não informado';
        if(!map.has(label)) map.set(label, {label, count:0});
        map.get(label).count++;
      });
      const total = rows.length || 1;
      return Array.from(map.values()).sort((a,b) => b.count - a.count)
        .map(e => [e.label, e.count, Math.round(e.count/total*100) + '%']);
    }
    function attentionCard(item, x, y, w){
      const h = 16;
      if(y > pageH - 22){ doc.addPage(); header(moduleLabel); y = 40; }
      const ac = item.accent || [200,200,196];
      doc.setDrawColor(230,230,226); doc.setFillColor(255,255,255); doc.roundedRect(x,y,w,h,2,2,'FD');
      doc.setFillColor(ac[0],ac[1],ac[2]); doc.rect(x,y,2.4,h,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(INK[0],INK[1],INK[2]);
      doc.text(String(item.line1 || '-').slice(0,72), x+6, y+6.2);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.8); doc.setTextColor(130,130,126);
      doc.text(String(item.line2 || '').slice(0,100), x+6, y+11.6);
      if(item.tag){
        const tc = item.tagColor || [130,130,126];
        doc.setFont('helvetica','bold'); doc.setFontSize(6.8); doc.setTextColor(tc[0],tc[1],tc[2]);
        doc.text(String(item.tag), x+w-4, y+6.2, {align:'right'});
      }
      return y + h + 2.4;
    }
    function cardsSection(items, y){
      items.forEach(item => { y = attentionCard(item, 14, y, 182); });
      return y;
    }
    const SEV_COLOR = {leve:GREEN, media:GOLD, grave:RED, gravissima:[124,58,237], outra:[176,176,170]};
    function legend(items, x, y){
      let cx = x;
      doc.setFont('helvetica','bold'); doc.setFontSize(6.8);
      items.forEach(it => {
        doc.setFillColor(it.color[0],it.color[1],it.color[2]); doc.rect(cx,y-2.8,3,3,'F');
        doc.setTextColor(110,110,106); doc.text(it.label, cx+4.5, y);
        cx += 4.5 + doc.getTextWidth(it.label) + 9;
      });
      return y + 5;
    }
    function driverBarChart(ranking, x, y, w){
      const nameW = 44, valueW = 26, gap = 3, barH = 7.4;
      const trackW = w - nameW - valueW;
      const max = Math.max(...ranking.map(d=>d.total), 1);
      ranking.forEach((d,i) => {
        if(y > pageH - 20){ doc.addPage(); header(moduleLabel); y = 40; }
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(String(i+1) + '. ' + String(d.name).slice(0,26), x, y+5.2);
        doc.setFillColor(240,240,235); doc.roundedRect(x+nameW, y, trackW, barH, 1.2, 1.2, 'F');
        let bx = x + nameW;
        [['gravissima',d.gravissima],['grave',d.grave],['media',d.media],['leve',d.leve],['outra',d.outra]].forEach(([k,v]) => {
          if(!v) return;
          const segW = Math.max(0, (v/max) * trackW);
          const c = SEV_COLOR[k];
          doc.setFillColor(c[0],c[1],c[2]); doc.rect(bx, y, segW, barH, 'F');
          bx += segW;
        });
        doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(String(d.total), x+w, y+5.2, {align:'right'});
        y += barH + gap;
      });
      return y + 1;
    }
    function countBarChart(items, x, y, w, color){
      const labelW = 34, valueW = 24, gap = 3, barH = 6;
      const trackW = w - labelW - valueW;
      const max = Math.max(...items.map(it=>it[1]), 1);
      items.forEach(([label, value]) => {
        if(y > pageH - 18){ doc.addPage(); header(moduleLabel); y = 40; }
        doc.setFont('helvetica','normal'); doc.setFontSize(7.4); doc.setTextColor(80,80,76);
        doc.text(String(label).slice(0,20), x, y+4.3);
        doc.setFillColor(240,240,235); doc.roundedRect(x+labelW, y, trackW, barH, 1,1,'F');
        const segW = Math.max(2, (value/max) * trackW);
        doc.setFillColor(color[0],color[1],color[2]); doc.rect(x+labelW, y, segW, barH, 'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.4); doc.setTextColor(INK[0],INK[1],INK[2]);
        doc.text(String(value), x+w, y+4.3, {align:'right'});
        y += barH + gap;
      });
      return y + 1;
    }
    function pieSlice(cx, cy, r, startAngle, endAngle, color){
      const steps = Math.max(1, Math.ceil((endAngle-startAngle)/(Math.PI/40)));
      doc.setFillColor(color[0],color[1],color[2]); doc.setDrawColor(color[0],color[1],color[2]);
      for(let i=0;i<steps;i++){
        const a1 = startAngle + (endAngle-startAngle)*(i/steps);
        const a2 = startAngle + (endAngle-startAngle)*((i+1)/steps);
        doc.triangle(cx,cy, cx+r*Math.cos(a1),cy+r*Math.sin(a1), cx+r*Math.cos(a2),cy+r*Math.sin(a2), 'FD');
      }
    }
    function iconTarget(cx, cy, color){
      doc.setDrawColor(color[0],color[1],color[2]); doc.setLineWidth(1.3); doc.circle(cx,cy,8,'S');
      doc.setLineWidth(0.9); doc.circle(cx,cy,5,'S');
      doc.setFillColor(color[0],color[1],color[2]); doc.circle(cx,cy,2,'F');
    }
    function iconAlert(cx, cy, color){
      doc.setFillColor(color[0],color[1],color[2]); doc.circle(cx,cy,8,'F');
      doc.setFillColor(255,255,255); doc.rect(cx-0.9,cy-5,1.8,5.6,'F'); doc.circle(cx,cy+3.6,1,'F');
    }
    function calloutCard(x, y, w, h, iconFn, iconColor, title, value, sub){
      doc.setDrawColor(230,230,226); doc.setFillColor(255,255,255); doc.roundedRect(x,y,w,h,2.5,2.5,'FD');
      iconFn(x+16, y+h/2, iconColor);
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(130,130,126);
      doc.text(String(title).toUpperCase(), x+30, y+11);
      doc.setFont('helvetica','bold'); doc.setFontSize(11.5); doc.setTextColor(INK[0],INK[1],INK[2]);
      doc.text(doc.splitTextToSize(String(value), w-38).slice(0,1), x+30, y+19);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.6); doc.setTextColor(150,150,146);
      doc.text(doc.splitTextToSize(String(sub||''), w-38).slice(0,1), x+30, y+26);
    }
    function boxFrame(x, y, w, h, title){
      doc.setDrawColor(230,230,226); doc.setFillColor(252,252,250); doc.roundedRect(x,y,w,h,2.5,2.5,'FD');
      doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.rect(x,y,3,6.4,'F');
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x,y+6.4,3,1.3,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(INK[0],INK[1],INK[2]);
      doc.text(title, x+8, y+8.5);
    }
    function evolutionBox(x, y, w, h){
      boxFrame(x, y, w, h, 'Evolução mensal');
      const items = monthRows.slice(-6);
      const plotX = x+8, plotW = w-16, plotY = y+18, plotH = h-38;
      if(!items.length){
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(150,150,146);
        doc.text('Sem dados suficientes no período.', x+8, y+h/2);
        return;
      }
      const counts = items.map(([,c])=>c);
      const maxCount = Math.max(...counts,1);
      const hasMoney = key === 'multas' || key === 'manutencoes' || key === 'sinistros';
      let values = null, maxValue = 1;
      if(hasMoney){
        const valMap = new Map();
        rows.forEach(r => { const m = reportDateMonth(key,r); if(m) valMap.set(m,(valMap.get(m)||0)+toNum(r.valor)); });
        values = items.map(([m]) => valMap.get(m) || 0);
        maxValue = Math.max(...values, 1);
      }
      const n = items.length, slotW = plotW/n, barW = Math.min(9, slotW*0.5);
      doc.setDrawColor(224,224,219); doc.line(plotX, plotY+plotH, plotX+plotW, plotY+plotH);
      let prevX, prevY;
      items.forEach(([m,c], i) => {
        const cx = plotX + slotW*i + slotW/2;
        const bh = (c/maxCount) * (plotH-4);
        doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]);
        doc.rect(cx-barW/2, plotY+plotH-bh, barW, bh, 'F');
        doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.setTextColor(120,120,116);
        doc.text(monthLabel(m).split(' / ')[0].slice(0,3), cx, plotY+plotH+5.5, {align:'center'});
        if(values){
          const lh = (values[i]/maxValue) * (plotH-4);
          const ly = plotY+plotH-lh;
          doc.setDrawColor(NAVY[0],NAVY[1],NAVY[2]); doc.setLineWidth(0.7);
          if(i>0) doc.line(prevX, prevY, cx, ly);
          doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.circle(cx, ly, 1.2, 'F');
          prevX = cx; prevY = ly;
        }
      });
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(x+8, y+h-9, 3, 3, 'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(6.4); doc.setTextColor(110,110,106);
      doc.text('Registros', x+13, y+h-6.3);
      if(values){
        doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.circle(x+46, y+h-7.5, 1.2, 'F');
        doc.text('Valor (R$)', x+50, y+h-6.3);
      }
    }
    function compositionBox(x, y, w, h){
      const title = key === 'multas' ? 'Composição por gravidade' : ((breakdowns[0]?.title || '').replace('Por ', 'Composição por ') || 'Composição do período');
      boxFrame(x, y, w, h, title);
      function severityLabelForDonut(r){
        const s = clean(r.gravidade || '');
        if(s.includes('gravissima')) return 'Gravíssima';
        if(s.includes('grave')) return 'Grave';
        if(s.includes('media') || s.includes('média')) return 'Média';
        if(s.includes('leve')) return 'Leve';
        return 'Não informada';
      }
      const donutFn = key === 'multas' ? severityLabelForDonut : (breakdowns[0]?.fn || (() => 'Registros'));
      const raw = groupSummary(donutFn);
      let data = raw.slice(0,4);
      if(raw.length > 4){
        const restCount = raw.slice(4).reduce((s,g)=>s+g[1],0);
        data.push(['Outros', restCount, Math.round(restCount/(rows.length||1)*100) + '%']);
      }
      if(!data.length || !rows.length){
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(150,150,146);
        doc.text('Sem dados suficientes no período.', x+8, y+h/2);
        return;
      }
      const cx = x+30, cy = y+18+(h-30)/2, r = Math.min(24, (h-30)/2);
      const total = rows.length || 1;
      let angle = -Math.PI/2;
      data.forEach((d,i) => {
        const frac = d[1]/total;
        const sweep = frac * Math.PI * 2;
        const color = PALETTE[i % PALETTE.length];
        pieSlice(cx, cy, r, angle, angle+sweep, color);
        if(frac > 0.06){
          const mid = angle + sweep/2;
          const mx = cx + r*0.7*Math.cos(mid), my = cy + r*0.7*Math.sin(mid);
          const tc = textColorFor(color);
          doc.setFont('helvetica','bold'); doc.setFontSize(6.6); doc.setTextColor(tc[0],tc[1],tc[2]);
          doc.text(Math.round(frac*100) + '%', mx, my, {align:'center'});
        }
        angle += sweep;
      });
      doc.setFillColor(255,255,255); doc.circle(cx, cy, r*0.52, 'F');
      let ly = y+20;
      data.forEach((d,i) => {
        const color = PALETTE[i % PALETTE.length];
        doc.setFillColor(color[0],color[1],color[2]); doc.rect(x+62, ly-3, 3, 3, 'F');
        doc.setFont('helvetica','normal'); doc.setFontSize(6.6); doc.setTextColor(70,70,66);
        doc.text(doc.splitTextToSize(String(d[0]).slice(0,20) + ' (' + d[1] + ')', w-70), x+67, ly);
        ly += 8;
      });
    }

    // ============================================================
    // PÁGINA 1 — CAPA (título, resumo executivo, indicadores-chave)
    // ============================================================
    doc.setFillColor(255,255,255); doc.rect(0,0,pageW,pageH,'F');
    doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.rect(0,0,134,52,'F');
    doc.setFillColor(NAVY[0],NAVY[1],NAVY[2]); doc.rect(134,0,pageW-134,52,'F');
    doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.triangle(pageW,52, pageW-14,52, pageW,38, 'F');

    doc.setFont('helvetica','bold'); doc.setFontSize(21); doc.setTextColor(INK[0],INK[1],INK[2]);
    doc.text(doc.splitTextToSize('Relatório Executivo', 118), 14, 20);
    doc.setFontSize(15);
    doc.text(String(moduleLabel), 14, 38);

    doc.setFont('helvetica','normal'); doc.setFontSize(7.6); doc.setTextColor(230,230,230);
    const boxText = doc.splitTextToSize(String(cfg?.subtitle || 'Painel de indicadores de gestão de frota') + '. Período analisado: ' + periodLabel + '. Emitido em ' + generated + '.', pageW-134-14);
    doc.text(boxText, 140, 12);

    let y = 62;
    y = section('Resumo executivo', y);
    summaryLines.slice(0,5).forEach(line => {
      doc.setFillColor(GOLD[0],GOLD[1],GOLD[2]); doc.circle(16.5, y-1.6, 1, 'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(8.6); doc.setTextColor(50,50,46);
      const wrapped = doc.splitTextToSize(line, pageW-34);
      doc.text(wrapped, 21, y);
      y += wrapped.length*4.6 + 3.6;
    });

    y += 4;
    const coverTrend = key === 'multas' ? trendInfo() : null;
    calloutCard(14, y, 90, 34, iconTarget, GOLD, 'Indicador principal', String(stats[0]?.[1] ?? rows.length), stats[0]?.[0] || 'no período');
    calloutCard(108, y, 88, 34,
      pend.length ? iconAlert : iconTarget, pend.length ? RED : GREEN,
      'Ponto de atenção',
      pend.length ? (pend.length + ' pendência(s)') : 'Sem pendências',
      key === 'multas' && coverTrend ? (coverTrend.delta<=0 ? 'Multas em queda no mês' : 'Multas em alta no mês') : 'em aberto no período'
    );
    y += 42;

    evolutionBox(14, y, 90, 92);
    compositionBox(108, y, 88, 92);

    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(150,150,150);
    doc.text('Documento gerado automaticamente pelo sistema FROTA EXEMPLO • Uso interno', 14, pageH-14);

    // ============================================================
    // PÁGINA 2 — INDICADORES E TENDÊNCIAS (KPIs + destaques por área)
    // ============================================================
    doc.addPage(); header('Indicadores e tendências'); y = 40;
    kpi(14,y,43,stats[0]?.[0] || 'Registros',stats[0]?.[1] ?? rows.length,stats[0]?.[2] || periodLabel);
    kpi(61,y,43,stats[1]?.[0] || 'Pendências',stats[1]?.[1] || '-',stats[1]?.[2] || '');
    kpi(108,y,43,stats[2]?.[0] || 'Indicador',stats[2]?.[1] || '-',stats[2]?.[2] || '');
    kpi(155,y,41,stats[3]?.[0] || 'Total',stats[3]?.[1] || '-',stats[3]?.[2] || '');
    y += 34;

    if(key === 'multas'){
      const tr = trendInfo();
      const rc = reincidenciaInfo();
      const criticos = prazoRecursoCriticoRows(rows).length;
      const trendColor = tr ? (tr.delta<=0 ? GREEN : RED) : INK;
      const trendValue = tr ? (tr.delta<=0 ? '-' : '+') + tr.pct + '%' : '—';
      kpi(14,y,59,'Tendência mensal', trendValue, tr ? monthLabel(tr.curM)+' vs '+monthLabel(tr.prevM) : 'sem dados suficientes', trendColor);
      kpi(76,y,59,'Reincidência', rc.count + ' motorista(s)', 'com 2+ multas no período', rc.count ? RED : GREEN);
      kpi(138,y,58,'Prazo crítico', criticos + ' registro(s)', 'até 30 dias ou vencido', criticos ? RED : GREEN);
      y += 34;
    }
    if(key === 'manutencoes'){
      const tv = topVehicleByCost();
      const dispColor = disponibilidadePct==null ? INK : disponibilidadePct>=90 ? GREEN : disponibilidadePct>=75 ? AMBER : RED;
      kpi(14,y,59,'Disponibilidade', disponibilidadePct!=null ? disponibilidadePct+'%' : '—', 'da frota em operação', dispColor);
      kpi(76,y,59,'Veículo crítico', tv ? tv.placa : '—', tv ? brl(tv.cost)+' • '+tv.count+' serv.' : 'sem dados', tv ? RED : INK);
      kpi(138,y,58,'Custo médio', brl(rows.length ? sumMoney(key, rows)/rows.length : 0), 'por serviço no período');
      y += 34;
    }

    if(key === 'multas' && driverRanking.length){
      y = section('Ranking de motoristas (reincidência)', y);
      y = driverBarChart(driverRanking, 14, y+1, 182);
      y = legend([
        {label:'Leve', color:SEV_COLOR.leve}, {label:'Média', color:SEV_COLOR.media},
        {label:'Grave', color:SEV_COLOR.grave}, {label:'Gravíssima', color:SEV_COLOR.gravissima}
      ], 14, y+1) + 3;
    }
    if(key === 'pontos'){
      const rankMap = new Map();
      rows.forEach(r => { const n = String(r.motorista||'').trim(); if(!n) return; rankMap.set(n, (rankMap.get(n)||0) + toNum(r.pontos)); });
      const ranking = Array.from(rankMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,8);
      if(ranking.length){
        y = section('Ranking de motoristas por pontuação', y);
        y = countBarChart(ranking, 14, y+1, 182, GOLD) + 3;
      }
    }
    if(key === 'motoristas'){
      const ranking = rows.map(r => [titleCaseName(r.nome || '-'), pointsLastDaysForDriver(r,45)]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
      if(ranking.length){
        y = section('Ranking de pontuação (últimos 45 dias)', y);
        y = countBarChart(ranking, 14, y+1, 182, GOLD) + 3;
      }
    }

    // ============================================================
    // PÁGINA 3 — COMPOSIÇÃO E PONTOS DE ATENÇÃO (tabelas corporativas)
    // ============================================================
    doc.addPage(); header('Composição e pontos de atenção'); y = 40;
    if(key === 'multas'){
      const severityRows = groupSummary(r => {
        const s = clean(r.gravidade || '');
        if(s.includes('gravissima')) return 'Gravíssima';
        if(s.includes('grave')) return 'Grave';
        if(s.includes('media') || s.includes('média')) return 'Média';
        if(s.includes('leve')) return 'Leve';
        return 'Não informada';
      });
      const statusRows = groupSummary(r => STATUS[r.status] || r.status || 'Não informado');
      const y1 = section('Por gravidade', y, true);
      const y2 = section('Por status', y, true, 106);
      const ya = table(['Gravidade','Reg.','%'], severityRows, 14, y1, [42,22,24], 8, 0);
      const yb = table(['Status','Reg.','%'], statusRows, 106, y2, [44,22,24], 8, 0);
      y = Math.max(ya, yb) + 1;
    } else if(breakdowns.length === 1){
      const y1 = section(breakdowns[0].title, y, true);
      y = table(['Categoria','Reg.','%'], groupSummary(breakdowns[0].fn), 14, y1, [90,42,36], 12, 0) + 1;
    } else if(breakdowns.length >= 2){
      const y1 = section(breakdowns[0].title, y, true);
      const y2 = section(breakdowns[1].title, y, true, 106);
      const ya = table(['Categoria','Reg.','%'], groupSummary(breakdowns[0].fn), 14, y1, [42,22,24], 8, 0);
      const yb = table(['Categoria','Reg.','%'], groupSummary(breakdowns[1].fn), 106, y2, [44,22,24], 8, 0);
      y = Math.max(ya, yb) + 1;
    }

    const risks = [];
    if(pend.length) risks.push(['Pendências', pend.length + ' registros', 'itens em aberto']);
    if(key === 'oleo') risks.push(['Óleo', rows.filter(r=>oilSituationValue(r)==='vencido').length + ' vencida(s)', 'troca fora do prazo']);
    if(key === 'tacografos') risks.push(['Tacógrafo', rows.filter(r=>daysUntil(r.data_validade||r.validade)<=30).length + ' críticos', 'vencido ou próximo']);
    if(key === 'manutencoes') risks.push(['Peças', rows.filter(r=>r.validade && isExpired(r.validade)).length + ' vencida(s)', 'validade de peça expirada']);
    if(risks.length){
      if(y > pageH-40){ doc.addPage(); header(moduleLabel); y=40; }
      y = section('Pontos de atenção', y, true);
      y = table(['Área','Quantidade','Detalhe'], risks, 14, y, [48,45,89], 8, 1);
    }

    // ============================================================
    // PÁGINA 4 — EVOLUÇÃO E RANKING (visão de tendência)
    // ============================================================
    doc.addPage(); header('Evolução e destaques'); y = 40;
    y = section('Evolução mensal', y);
    y = countBarChart(monthRows.length ? monthRows.map(([m,v])=>[monthLabel(m),v]) : [['Sem dados',0]], 14, y+1, 182, GOLD) + 3;
    if(y > pageH-40){ doc.addPage(); header(moduleLabel); y=40; }
    y = section('Placas mais citadas', y);
    y = countBarChart(topPlacas.length ? topPlacas : [['Sem dados',0]], 14, y+1, 182, NAVY);

    // ============================================================
    // PÁGINA 5 (somente multas) — PENDÊNCIAS CRÍTICAS ORDENADAS POR PRAZO
    // ============================================================
    if(key === 'multas' && pend.length){
      doc.addPage(); header('Pendências'); y = 40;
      const urgent = attentionRows(key, rows, 24);
      y = section('Ordenadas por prazo', y, true);
      y = cardsSection(urgent.map(multaAttentionItem), y);
    }

    // ============================================================
    // RODAPÉ — aplicado a todas as páginas geradas
    // ============================================================
    const totalPages = doc.internal.getNumberOfPages();
    for(let p=1; p<=totalPages; p++){
      doc.setPage(p);
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(160,160,156);
      doc.text('FROTA EXEMPLO', 14, 291);
      doc.text(String(p) + '/' + totalPages, pageW-14, 291, {align:'right'});
    }
    const slug = (v)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'relatorio';
    doc.save('relatorio-' + slug(moduleLabel) + '-' + slug(periodLabel) + '-' + new Date().toISOString().slice(0,10) + '.pdf');
  }

  function stripHtml(value){
    return String(value ?? '').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#039;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  }
  function plainCellValue(r,c,key){
    const k = c[0];
    if(k.includes('data') || k === 'validade') return fmtDate(r[k] || r.data || r.data_validade || r.validade || (key === 'oleo' ? oilValidityDate(r) : ''));
    if(k === 'valor') return brlKey(key || state.reportModule, r);
    if(key === 'oleo' && k === 'situacao') return oilSituation(r).label;
    if(typeof c[2] === 'function') return stripHtml(c[2](r));
    return stripHtml(r[k] ?? '');
  }

  function setupLogin(){
    const form = $('#loginForm');
    form?.addEventListener('submit', ev => {
      ev.preventDefault();
      const rawUser = String($('#loginUser').value || '').trim();
      const pass = String($('#loginPass').value || '');
      const email = rawUser.includes('@') ? rawUser.toLowerCase() : `${rawUser.toLowerCase()}@frota.demo`;
      const errEl = $('#loginError');
      const submitBtn = form.querySelector('button[type="submit"]');
      if(errEl) errEl.textContent = '';
      if(submitBtn){ submitBtn.disabled = true; submitBtn.dataset.originalText = submitBtn.textContent; submitBtn.textContent = 'Entrando...'; }
      const db = connect();
      if(!db){ if(errEl) errEl.textContent = 'Não foi possível conectar ao Supabase.'; if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText; } return; }
      db.auth.signInWithPassword({email, password: pass}).then(({data, error}) => {
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = submitBtn.dataset.originalText; }
        if(error || !data.session){ if(errEl) errEl.textContent = 'Usuário ou senha incorretos.'; return; }
        // login bem-sucedido: onAuthStateChange (ver setupAuthListener) cuida do resto
      });
    });
    $('#logoutBtn')?.addEventListener('click', () => doLogout());
  }
  function doLogout(){
    const db = connect();
    stopPresence();
    if(db) db.auth.signOut();
    state.user = null;
    applyAuth();
  }
  /* Busca o perfil (nome/perfil/status/último acesso) da tabela public.profiles
     para o usuário autenticado, e registra o acesso via RPC. */
  async function loadUserProfile(authUser){
    const db = connect();
    if(!db || !authUser) return null;
    const {data, error} = await db.from('profiles').select('*').eq('id', authUser.id).single();
    if(error || !data) return null;
    if(data.status === 'inativo'){
      db.auth.signOut();
      const errEl = $('#loginError'); if(errEl) errEl.textContent = 'Este usuário está inativo. Fale com um administrador.';
      return null;
    }
    db.rpc('fn_touch_last_login').then(()=>{});
    return {
      id: authUser.id,
      usuario: authUser.email,
      nome: data.nome || authUser.email,
      perfil: data.perfil || 'visitante',
      status: data.status || 'ativo',
      ultimoAcesso: data.ultimo_acesso || null,
    };
  }
  /* Ouve mudanças de sessão do Supabase Auth (login, logout, token renovado,
     sessão restaurada ao recarregar a página) e mantém state.user em dia. */
  function setupAuthListener(){
    const db = connect();
    if(!db) return;
    db.auth.onAuthStateChange(async (event, session) => {
      if(session && session.user){
        if(state.user && state.user.id === session.user.id) return;
        const profile = await loadUserProfile(session.user);
        state.user = profile;
      } else {
        if(!state.user) return;
        state.user = null;
      }
      applyAuth();
    });
  }
  function applyAuth(){
    document.body.classList.toggle('auth-locked', !state.user);
    document.body.classList.toggle('role-visitante', !!state.user && state.user.perfil !== 'admin');
    document.body.classList.toggle('role-admin', !!state.user && state.user.perfil === 'admin');
    if(state.user){ startPresence(); renderNav(); showPage(state.current); loadAll(); initAssistant(); renderUserChip(); }
    else stopPresence();
  }

  /* Presença online (Supabase Realtime Presence): cada sessão logada anuncia
     que está com o sistema aberto, e a Auditoria mostra quem está online agora.
     Não grava nada no banco — a pessoa sai da lista sozinha ao fechar a aba,
     sair do sistema ou perder a conexão. */
  function startPresence(){
    const db = connect(), u = state.user;
    if(!db || !u) return;
    if(state.presenceChannel && state.presenceUserId === u.id) return;
    stopPresence();
    state.presenceUserId = u.id;
    const ch = db.channel('frota-presenca', {config:{presence:{key:u.id}}});
    ch.on('presence', {event:'sync'}, () => {
      // uma pessoa pode ter várias abas/aparelhos: vale a conexão mais antiga
      const online = {};
      Object.entries(ch.presenceState()).forEach(([id, metas]) => {
        const first = (metas || []).reduce((a, m) => (!a || String(m.desde || '') < String(a.desde || '')) ? m : a, null);
        if(first) online[id] = {...first, sessoes: metas.length};
      });
      state.presenceOnline = online;
      state.presenceReady = true;
      if(state.current === 'auditoria'){ renderPresenca(); if(state.auditoriaRows) renderAuditoriaList(); }
    }).subscribe(status => {
      if(status === 'SUBSCRIBED') ch.track({id:u.id, nome:u.nome, perfil:u.perfil, desde:nowIso()});
    });
    state.presenceChannel = ch;
  }
  function stopPresence(){
    const ch = state.presenceChannel, db = connect();
    state.presenceChannel = null; state.presenceUserId = null; state.presenceOnline = {}; state.presenceReady = false;
    if(ch){ try{ ch.untrack(); }catch(e){} try{ if(db) db.removeChannel(ch); }catch(e){} }
  }
  function isUserOnline(id){ return !!(id && state.presenceOnline && state.presenceOnline[id]); }

  function renderUserChip(){
    const u = state.user;
    const nameEl = $('#userChipName');
    if(nameEl) nameEl.textContent = u ? u.nome : '—';
    const perfilEl = $('#userChipPerfil');
    if(perfilEl) perfilEl.textContent = u ? (u.perfil === 'admin' ? 'Administrador' : 'Visitante (somente leitura)') : '—';
    const ultimoEl = $('#userChipUltimo');
    if(ultimoEl) ultimoEl.textContent = u && u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : 'Primeiro acesso';
  }
  function setupUserChip(){
    const btn = $('#userChipBtn'), menu = $('#userChipMenu');
    if(!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', ev => { ev.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', () => menu.classList.remove('open'));
    $('#userChipLogoutBtn')?.addEventListener('click', () => doLogout());
    $('#userChipPassBtn')?.addEventListener('click', () => {
      const nova = prompt('Digite a nova senha (mínimo 6 caracteres):');
      if(!nova) return;
      if(nova.length < 6){ toast('A senha precisa ter pelo menos 6 caracteres.'); return; }
      const confirma = prompt('Confirme a nova senha:');
      if(nova !== confirma){ toast('As senhas não coincidem.'); return; }
      const db = connect();
      db.auth.updateUser({password: nova}).then(({error}) => {
        toast(error ? 'Não foi possível alterar a senha.' : 'Senha alterada com sucesso.');
      });
    });
  }
  function setupUi(){
    setupSysModal();
    $('#modalClose')?.addEventListener('click', closeModal);
    $('#modalCancel')?.addEventListener('click', closeModal);
    $('#modalSave')?.addEventListener('click', saveModal);
    $('#modalBg')?.addEventListener('click', ev => { if(ev.target.id === 'modalBg') closeModal(); });
    $('#chamadoModalClose')?.addEventListener('click', closeChamadoModal);
    $('#chamadoModalBg')?.addEventListener('click', ev => { if(ev.target.id === 'chamadoModalBg') closeChamadoModal(); });
    $('#sinistroModalClose')?.addEventListener('click', closeSinistroModal);
    $('#sinistroModalBg')?.addEventListener('click', ev => { if(ev.target.id === 'sinistroModalBg') closeSinistroModal(); });
    $('#collapseBtn')?.addEventListener('click', () => {
      document.body.classList.toggle('is-collapsed');
      const btn = $('#collapseBtn');
      if(btn) btn.textContent = document.body.classList.contains('is-collapsed') ? '☰' : '☰ Recolher menu';
    });
    document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && $('#modalBg')?.classList.contains('open')) closeModal(); });
    document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && $('#chamadoModalBg')?.classList.contains('open')) closeChamadoModal(); });
    document.addEventListener('keydown', ev => { if(ev.key === 'Escape' && $('#sinistroModalBg')?.classList.contains('open')) closeSinistroModal(); });
  }

  /* ========================================================================
   * Assistente Virtual — Gestão de Frota
   * Responde com dados computados na hora a partir de state.data. Nunca
   * inventa números: quando o sistema não rastreia aquele dado hoje
   * (consumo por veículo, abastecimento, custo por km, checklist digital,
   * desempenho de motorista), o assistente diz isso claramente em vez de
   * supor um valor.
   * ==================================================================== */
  /* ========================================================================
   * Camada de Ferramentas de IA (AI_TOOLS)
   * ------------------------------------------------------------------------
   * Esta é a camada que, no futuro, um LLM real (via function calling) iria
   * chamar em vez do roteador de padrões abaixo. Cada ferramenta:
   *   - recebe parâmetros simples (string/número), nunca HTML;
   *   - devolve dados estruturados (objetos/arrays), nunca texto pronto;
   *   - respeita permissão (perfil do usuário) antes de devolver dado sensível.
   * A formatação em português (o que o usuário lê) fica só no "responder"
   * mais abaixo — exatamente a separação que um backend real teria entre
   * "tool result" (JSON) e "resposta do modelo" (texto).
   *
   * Hoje essas ferramentas rodam no navegador, sobre os dados já carregados
   * em state.data — não existe backend nem LLM real conectado. A troca para
   * um provedor de LLM de verdade (OpenAI, Claude, Gemini, Llama, Mistral)
   * significaria: mover esta camada para um servidor, o servidor expor essas
   * mesmas funções como "tools" no formato do provedor, e o roteador de
   * padrões abaixo virar, no lugar, uma chamada de API para o modelo com
   * essas tools disponíveis. A assinatura de cada função já foi pensada
   * para isso — não deveria exigir refatoração grande. Ver docs/ARQUITETURA-IA.md.
   * ==================================================================== */
  const AI_TOOLS = {
    buscarVeiculo({placa}){
      const p = fullPlate(placa);
      return (state.data.veiculos||[]).find(v => fullPlate(v.placa) === p) || null;
    },
    buscarMotorista({placa}){
      const v = AI_TOOLS.buscarVeiculo({placa});
      return v ? {placa: fullPlate(placa), motorista: v.motorista || null} : null;
    },
    buscarMultas({placa, pendentesApenas}={}){
      let rows = state.data.multas || [];
      if(placa) rows = rows.filter(r => fullPlate(r.placa) === fullPlate(placa));
      if(pendentesApenas) rows = pendingRows('multas', rows);
      return rows;
    },
    buscarManutencoes({placa, mes}={}){
      let rows = state.data.manutencoes || [];
      if(placa) rows = rows.filter(r => fullPlate(r.placa) === fullPlate(placa));
      if(mes) rows = rows.filter(r => ym(r.data) === mes);
      return rows;
    },
    buscarAbastecimentos(){
      // O sistema não rastreia abastecimento por veículo hoje — retorno
      // explícito e vazio, nunca um número inventado.
      return {rastreado: false, rows: []};
    },
    buscarDocumentos({placa}={}){
      // Documentação (CRLV/licenciamento/seguro) é um módulo independente do
      // Tacógrafo e ainda não tem fonte de dado no sistema.
      return {rastreado: false, rows: []};
    },
    buscarTacografos({placa, diasLimite=30}={}){
      let rows = state.data.tacografos || [];
      if(placa) rows = rows.filter(r => fullPlate(r.placa) === fullPlate(placa));
      return rows.filter(r => { const d = daysUntil(r.data_validade||r.validade); return d <= diasLimite; });
    },
    buscarProducoes({placa}={}){
      let rows = state.data.producao || [];
      if(placa) rows = rows.filter(r => fullPlate(r.placa) === fullPlate(placa));
      return rows;
    },
    buscarHistorico360({placa}){
      return h360Dataset(placa);
    },
    buscarCustos({placa, mes, contexto}={}){
      // Hoje o app não restringe visualização de custos por perfil (só
      // ações de edição/exclusão são admin-only) — a ferramenta reflete
      // esse mesmo limite real. O parâmetro "contexto" já existe pronto
      // para o dia em que uma regra de permissão por categoria for criada.
      let man = state.data.manutencoes||[], multas = state.data.multas||[], sinistros = state.data.sinistros||[];
      if(placa){ man = man.filter(r=>fullPlate(r.placa)===fullPlate(placa)); multas = multas.filter(r=>fullPlate(r.placa)===fullPlate(placa)); sinistros = sinistros.filter(r=>fullPlate(r.placa)===fullPlate(placa)); }
      if(mes){ man = man.filter(r=>ym(r.data)===mes); multas = multas.filter(r=>ym(r.data)===mes); sinistros = sinistros.filter(r=>ym(r.data)===mes); }
      return {manutencoes: sumMoney('manutencoes', man), multas: sumMoney('multas', multas), sinistros: sumMoney('sinistros', sinistros)};
    },
    buscarIndicadores({contexto}={}){
      const veic = state.data.veiculos||[];
      return {
        totalVeiculos: veic.length,
        parados: veic.filter(isVeiculoParado).length,
        multasPendentes: pendingRows('multas', state.data.multas||[]).length,
        tacografosVencendo30d: (state.data.tacografos||[]).filter(r=>daysUntil(r.data_validade||r.validade)<=30).length,
      };
    },
    buscarRelatorios({contexto}={}){
      // Idem: sem restrição de leitura por perfil no app real hoje.
      // Nesta versão, relatórios são gerados sob demanda nas telas de
      // Relatórios/Financeiro — a ferramenta aponta para lá em vez de
      // reconstruir a lógica de exportação aqui.
      return {modulo:'relatorios'};
    },
  };

  /* ------------------------------------------------------------------------
   * Contexto enviado "ao modelo" a cada pergunta — nome, cargo, permissões,
   * data/hora, módulo atual, veículo em foco e filtros ativos. Hoje isso só
   * é usado por este roteador local, mas é exatamente o payload que um
   * backend real enviaria ao LLM junto da pergunta do usuário.
   * ---------------------------------------------------------------------- */
  function buildAssistantContext(){
    const u = currentUser();
    return {
      usuario: u ? u.nome : null,
      cargo: u ? u.perfil : null,
      permissoes: u ? (u.perfil === 'admin' ? ['leitura','escrita','financeiro'] : ['leitura']) : [],
      empresa: 'Gestão de Frota — FROTA EXEMPLO',
      data: new Date().toISOString().slice(0,10),
      hora: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
      moduloAtual: state.current || null,
      veiculoEmFoco: state.assistantFocusPlate || null,
      filtrosAtivos: state.filters && state.filters[state.current] || null,
    };
  }
  /* Memória de sessão: guarda a última placa mencionada para resolver
     pronomes ("ele", "esse veículo", "dele") nas perguntas seguintes. */
  function assistantResolvePronoun(qClean){
    if(/\b(ele|ela|dele|dela|esse veiculo|esse carro|esse caminhao|desse veiculo)\b/.test(qClean) && state.assistantFocusPlate){
      return state.assistantFocusPlate;
    }
    return null;
  }

  const ASSISTANT_SUGGESTIONS = [
    'Resumo de hoje',
    'Quais veículos estão parados?',
    'Quais documentos vencem esta semana?',
    'Qual veículo tem mais multas?',
    'Quanto gastamos com manutenção este mês?',
  ];
  const MONTH_NAMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

  function assistantCostRank(){
    const map = new Map();
    const add = (key, rows) => (rows||[]).forEach(r=>{
      const p = fullPlate(r.placa); if(!p) return;
      map.set(p, (map.get(p)||0) + keyMoney(key, r));
    });
    add('manutencoes', state.data.manutencoes);
    add('multas', state.data.multas);
    add('sinistros', state.data.sinistros);
    return Array.from(map.entries()).map(([placa,total])=>({placa,total})).filter(x=>x.total>0).sort((a,b)=>b.total-a.total);
  }
  function assistantFineRank(){
    const map = new Map();
    (state.data.multas||[]).forEach(r=>{ const p = fullPlate(r.placa); if(!p) return; map.set(p,(map.get(p)||0)+1); });
    return Array.from(map.entries()).map(([placa,count])=>({placa,count})).sort((a,b)=>b.count-a.count);
  }
  function assistantVehicleLabel(placa){
    const v = (state.data.veiculos||[]).find(x=>fullPlate(x.placa)===fullPlate(placa));
    return v ? `${placa}${v.modelo ? ' ('+v.modelo+')' : ''}` : placa;
  }
  function assistantGreetingText(){
    const multasPend = pendingRows('multas', state.data.multas);
    const tac = state.data.tacografos || [];
    const tacSemana = tac.filter(r=>{ const d=daysUntil(r.data_validade||r.validade); return d>=0 && d<=7; });
    const emAndamento = (state.data.manutencoes||[]).filter(r=>!finalStatus('manutencoes', r));
    const oleoAtrasado = latestOilPerPlate(state.data.oleo||[]).filter(r=>oilStatus(r).cls==='red');
    const criticos = multasPend.length + tacSemana.length + oleoAtrasado.length;
    const linhas = [];
    linhas.push(`${greetingWord()}${state.user && state.user.nome ? ', '+state.user.nome : ''}. Aqui está o resumo de hoje:`);
    if(criticos>0) linhas.push(`⚠️ ${criticos} ponto${criticos===1?'':'s'} pede${criticos===1?'':'m'} atenção primeiro.`);
    linhas.push(`🔴 ${multasPend.length} multa${multasPend.length===1?'':'s'} pendente${multasPend.length===1?'':'s'}${multasPend.length?` — ${brl(sumMoney('multas', multasPend))} em aberto`:''}.`);
    linhas.push(`⏱️ ${tacSemana.length} tacógrafo${tacSemana.length===1?'':'s'} vencendo nos próximos 7 dias.`);
    linhas.push(`🔧 ${emAndamento.length} manutenç${emAndamento.length===1?'ão':'ões'} em andamento.`);
    linhas.push(oleoAtrasado.length ? `🛢 ${oleoAtrasado.length} troca${oleoAtrasado.length===1?'':'s'} de óleo vencida${oleoAtrasado.length===1?'':'s'}.` : '🛢 Nenhuma troca de óleo atrasada.');
    linhas.push('⛽ Consumo médio da frota: não rastreado por veículo no sistema ainda.');
    return {text: linhas.join('\n')};
  }
  function assistantPlateSummary(plateValue){
    const ds = AI_TOOLS.buscarHistorico360({placa: plateValue});
    if(!ds.veiculo && !ds.manutencoes.length && !ds.multas.length && !ds.oleo.length) return null;
    const v = ds.veiculo || {};
    const lastOleo = ds.oleo.slice().sort((a,b)=>String(b.data_ultima_troca||b.data||'').localeCompare(String(a.data_ultima_troca||a.data||'')))[0];
    const nextTac = ds.tacografos.slice().sort((a,b)=>daysUntil(a.data_validade||a.validade)-daysUntil(b.data_validade||b.validade))[0];
    const linhas = [];
    linhas.push(`Central 360° — ${ds.plate}${v.modelo ? ' · '+v.modelo : ''}`);
    linhas.push(`• Status: ${STATUS[v.status] || v.status || 'não informado'}.`);
    linhas.push(`• Motorista atual: ${v.motorista || 'sem motorista fixo vinculado'}.`);
    linhas.push(`• Manutenções: ${ds.manutencoes.length} registrada${ds.manutencoes.length===1?'':'s'}, total de ${brl(ds.totalMan)}.`);
    linhas.push(`• Multas: ${ds.multas.length} registrada${ds.multas.length===1?'':'s'}${ds.multas.length?`, ${brl(ds.totalMultas)} em valores`:''}.`);
    linhas.push(`• Óleo: ${lastOleo ? oilStatus(lastOleo).text : 'sem registro de troca'}.`);
    linhas.push(`• Tacógrafo: ${nextTac ? dateAlertText(nextTac.data_validade||nextTac.validade) : 'sem registro'}.`);
    linhas.push('• Documentação (CRLV/seguro): não digitalizada no sistema ainda — módulo independente do Tacógrafo.');
    linhas.push(`• Produção: ${ds.producao.length} apontamento${ds.producao.length===1?'':'s'} registrados.`);
    linhas.push(`• Consumo: não rastreado por veículo no sistema ainda.`);
    if(ds.pendencias.length) linhas.push(`• Pendências em aberto: ${ds.pendencias.length}.`);
    return {text: linhas.join('\n'), plate: ds.plate};
  }
  function assistantParsePlate(qClean){
    const m = qClean.match(/[a-z]{3}[-\s]?\d[a-z0-9][-\s]?\d{2}/i);
    return m ? fullPlate(m[0]) : null;
  }
  function assistantParseMonth(qClean){
    const idx = MONTH_NAMES.findIndex(m => qClean.includes(m) || qClean.includes(m.slice(0,3)));
    if(idx === -1) return null;
    const yearMatch = qClean.match(/\b(20\d{2})\b/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
    return `${year}-${String(idx+1).padStart(2,'0')}`;
  }

  function assistantAnswer(qRaw){
    const q = clean(qRaw);

    if(!q || /^(oi|ola|bom dia|boa tarde|boa noite|resumo|resumo de hoje|o que esta acontecendo)/.test(q)){
      return assistantGreetingText();
    }

    // pergunta sobre uma placa específica -> Central 360° (com memória de
    // sessão: "ele"/"esse veículo" resolve para a última placa mencionada)
    const plateGuess = assistantParsePlate(q) || assistantResolvePronoun(q);
    if(plateGuess && (q.includes('motorista') || q.includes('central 360') || q.includes('placa') || q.includes('veiculo') || q.includes('caminhao') || q.includes('ele') || q.includes('ela') || !/gasto|multa|parad|manutencao|documento|custo/.test(q))){
      const res = assistantPlateSummary(plateGuess);
      if(res){ state.assistantFocusPlate = res.plate; return res; }
      return {text:`Não encontrei a placa ${plateGuess} no cadastro. Confira se digitou corretamente.`};
    }

    // combustível / consumo — não rastreado
    if(q.includes('combustivel') || q.includes('consumo') || (q.includes('abasteci'))){
      return {text:'O sistema ainda não rastreia consumo ou abastecimento por veículo hoje, então não posso calcular esse número com segurança. Quando esse módulo existir, respondo com dados reais.'};
    }

    // custo por km — não rastreado (sem hodômetro contínuo)
    if(q.includes('custo por km') || q.includes('custo por quilometro') || q.includes('custo/km')){
      return {text:'Não tenho quilometragem contínua por veículo (só registros pontuais de troca de óleo), então não consigo calcular custo por km de forma confiável ainda.'};
    }

    // maior custo / mais gastou
    if(q.includes('mais gastou') || q.includes('maior custo') || (q.includes('custo') && q.includes('veiculo'))){
      const rank = assistantCostRank();
      if(!rank.length) return {text:'Não há custos lançados em manutenções, multas ou sinistros ainda.'};
      const top = rank[0];
      return {text:`O veículo com maior custo lançado (manutenções + multas + sinistros) é ${assistantVehicleLabel(top.placa)}, com ${brl(top.total)}.`, plate: top.placa};
    }

    // mais multas
    if(q.includes('mais multa') || (q.includes('multa') && (q.includes('mais') || q.includes('quem') || q.includes('qual veiculo')))){
      const rank = assistantFineRank();
      if(!rank.length) return {text:'Não há multas registradas no sistema.'};
      const top = rank[0];
      const totalMultas = state.data.multas.length;
      const pct = totalMultas ? Math.round(top.count/totalMultas*100) : 0;
      return {text:`${assistantVehicleLabel(top.placa)} concentra o maior número de multas: ${top.count} de ${totalMultas} (${pct}% do total).`, plate: top.placa};
    }

    // veículos parados
    if(q.includes('parado') || q.includes('indisponivel') || q.includes('sem circular')){
      const parados = (state.data.veiculos||[]).filter(isVeiculoParado);
      if(!parados.length) return {text:'Nenhum veículo está parado ou em manutenção no momento — frota 100% disponível.'};
      const lista = parados.slice(0,10).map(v=>`${v.placa}${v.status?` (${STATUS[v.status]||v.status})`:''}`).join(', ');
      return {text:`${parados.length} veículo${parados.length===1?'':'s'} parado${parados.length===1?'':'s'} ou em manutenção: ${lista}${parados.length>10?'...':''}.`};
    }

    // tacógrafo vencendo — módulo próprio, nunca tratado como "documentação"
    if(q.includes('tacografo') && (q.includes('vence') || q.includes('vencendo') || q.includes('validade') || q.includes('afericao'))){
      const dias = q.includes('semana') ? 7 : q.includes('mes') ? 30 : 30;
      const lista = (state.data.tacografos||[]).filter(r=>{ const d=daysUntil(r.data_validade||r.validade); return d>=0 && d<=dias; }).sort((a,b)=>daysUntil(a.data_validade||a.validade)-daysUntil(b.data_validade||b.validade));
      if(!lista.length) return {text:`Nenhum tacógrafo vence nos próximos ${dias} dias.`};
      const linhas = lista.slice(0,8).map(r=>`${r.placa || '-'}: ${dateAlertText(r.data_validade||r.validade)}`);
      return {text:`${lista.length} tacógrafo${lista.length===1?'':'s'} vencendo nos próximos ${dias} dias:\n${linhas.join('\n')}`};
    }

    // documentação (CRLV/licenciamento/seguro) — módulo independente do tacógrafo, ainda sem dado
    if(q.includes('documento') && (q.includes('vence') || q.includes('vencendo') || q.includes('validade'))){
      return {text:'A Documentação (CRLV, licenciamento, seguro) ainda não está digitalizada no sistema, então não tenho vencimentos reais para mostrar. Se a pergunta era sobre o Tacógrafo, pergunte especificamente por "tacógrafo" — esse eu já rastreio.'};
    }

    // motorista de uma placa (sem regex de placa reconhecida acima)
    if(q.includes('motorista')){
      return {text:'Me diga a placa do veículo (ex.: "motorista da LQE8437") que eu busco o motorista vinculado e o histórico recente na Central 360°.'};
    }

    // gasto com manutenção em um mês
    if((q.includes('gastamos') || q.includes('gasto') || q.includes('custo')) && q.includes('manutencao')){
      const mes = assistantParseMonth(q);
      const rows = mes ? (state.data.manutencoes||[]).filter(r=>ym(r.data)===mes) : (state.data.manutencoes||[]);
      const total = sumMoney('manutencoes', rows);
      const label = mes ? monthLabel(mes) : 'em todo o histórico';
      if(!rows.length) return {text:`Não há manutenções lançadas ${mes?('em '+monthLabel(mes)):'com esse filtro'}.`};
      return {text:`Gasto em manutenções ${label}: ${brl(total)}, em ${rows.length} registro${rows.length===1?'':'s'}.`};
    }

    // checklist — não existe digital
    if(q.includes('checklist')){
      return {text:'Ainda não existe checklist digital estruturado no sistema — hoje os defeitos são registrados por formulário em PDF. Posso te mostrar os formulários pendentes, se quiser.'};
    }

    // desempenho de motorista / substituição de veículo — sem dado suficiente
    if(q.includes('desempenho') && q.includes('motorista')){
      return {text:'Não há um indicador de desempenho por motorista hoje (não existe vínculo motorista-veículo histórico nem pontuação). Não posso comparar com segurança.'};
    }
    if(q.includes('substitui')){
      const rank = assistantCostRank();
      if(!rank.length) return {text:'Não tenho critério suficiente (custo, disponibilidade, km) para sugerir substituição hoje.'};
      const top3 = rank.slice(0,3).map(x=>`${assistantVehicleLabel(x.placa)} (${brl(x.total)})`).join(', ');
      return {text:`Não tenho dado de idade/depreciação do veículo, então não posso recomendar substituição com segurança. O que posso dizer é que os veículos com maior custo acumulado são: ${top3}.`};
    }

    // fallback
    return {text:'Não encontrei uma resposta direta para isso com os dados que tenho hoje. Posso ajudar com: veículos parados, tacógrafos vencendo, ranking de custos ou de multas, gasto em manutenção por mês, ou um resumo completo de uma placa (Central 360°). Documentação (CRLV/seguro) ainda não é digitalizada no sistema.'};
  }

  function assistantPushMessage(role, payload){
    const list = $('#assistantMessages'); if(!list) return;
    const el = document.createElement('div');
    el.className = `assistant-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    bubble.innerHTML = esc(payload.text).replace(/\n/g,'<br>');
    el.appendChild(bubble);
    if(payload.plate){
      const btn = document.createElement('button');
      btn.className = 'btn compact assistant-cta';
      btn.type = 'button';
      btn.textContent = 'Abrir Central 360°';
      btn.addEventListener('click', () => { openHistorico360(payload.plate); $('#assistantPanel')?.classList.remove('open'); });
      el.appendChild(btn);
    }
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
  }
  function assistantAsk(text){
    if(!text.trim()) return;
    assistantPushMessage('user', {text});
    const answer = assistantAnswer(text);
    if(answer.plate) state.assistantFocusPlate = answer.plate;
    setTimeout(() => assistantPushMessage('bot', answer), 220);
  }
  function initAssistant(){
    const fab = $('#assistantFab'), panel = $('#assistantPanel'), form = $('#assistantForm'), input = $('#assistantInput');
    const widget = $('#assistantWidget');
    if(!fab || fab.dataset.bound) return;
    fab.dataset.bound = '1';

    // Permite reposicionar o botão do assistente com arrastar e soltar.
    // A posição fica salva no navegador para continuar no mesmo lugar depois.
    if(widget){
      const saved = localStorage.getItem('frota_assistant_position');
      if(saved){
        try{
          const pos = JSON.parse(saved);
          if(Number.isFinite(pos.left) && Number.isFinite(pos.top)){
            widget.style.left = `${pos.left}px`;
            widget.style.top = `${pos.top}px`;
            widget.style.right = 'auto';
            widget.style.bottom = 'auto';
          }
        }catch(e){ /* posição inválida: mantém a posição padrão */ }
      }

      let dragging = false;
      let moved = false;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;

      fab.addEventListener('pointerdown', ev => {
        if(ev.button !== 0) return;
        const rect = widget.getBoundingClientRect();
        dragging = true;
        moved = false;
        startX = ev.clientX;
        startY = ev.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        fab.setPointerCapture?.(ev.pointerId);
        widget.classList.add('assistant-dragging');
      });

      fab.addEventListener('pointermove', ev => {
        if(!dragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if(Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;

        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - widget.offsetWidth - margin);
        const maxTop = Math.max(margin, window.innerHeight - fab.offsetHeight - margin);
        const left = Math.min(Math.max(margin, startLeft + dx), maxLeft);
        const top = Math.min(Math.max(margin, startTop + dy), maxTop);

        widget.style.left = `${left}px`;
        widget.style.top = `${top}px`;
        widget.style.right = 'auto';
        widget.style.bottom = 'auto';
      });

      const stopDrag = ev => {
        if(!dragging) return;
        dragging = false;
        widget.classList.remove('assistant-dragging');
        if(moved){
          const rect = widget.getBoundingClientRect();
          localStorage.setItem('frota_assistant_position', JSON.stringify({
            left: Math.round(rect.left),
            top: Math.round(rect.top)
          }));
          // Impede que o arraste também seja interpretado como clique.
          fab.dataset.dragged = '1';
          setTimeout(() => { delete fab.dataset.dragged; }, 0);
        }
      };
      fab.addEventListener('pointerup', stopDrag);
      fab.addEventListener('pointercancel', stopDrag);
    }
    const chips = $('#assistantSuggestions');
    if(chips) chips.innerHTML = ASSISTANT_SUGGESTIONS.map(s=>`<button class="assistant-chip" type="button">${esc(s)}</button>`).join('');
    $$('.assistant-chip', chips).forEach(btn => btn.addEventListener('click', () => assistantAsk(btn.textContent)));
    fab.addEventListener('click', () => {
      if(fab.dataset.dragged === '1') return;
      panel.classList.toggle('open');
      if(panel.classList.contains('open') && !state.assistantGreeted){
        state.assistantGreeted = true;
        assistantPushMessage('bot', assistantGreetingText());
      }
    });
    $('#assistantClose')?.addEventListener('click', () => panel.classList.remove('open'));
    form?.addEventListener('submit', ev => { ev.preventDefault(); const v = input.value; input.value=''; assistantAsk(v); });
  }

  /* ========================================================================
   * Autocomplete de entidades cadastradas (placas, motoristas, modelos)
   * ------------------------------------------------------------------------
   * Usa os dados que o sistema JÁ carregou em state.data (veiculos e
   * motoristas) — não faz consulta nova ao Supabase. Só atua nos campos dos
   * formulários que fazem referência a um cadastro existente; o campo
   * continua aceitando texto livre normalmente.
   * ==================================================================== */
  const AC_FIELD_KIND = {placa:'placa', motorista:'motorista', motorista_nome:'motorista', modelo:'modelo'};
  // Campos que são o próprio cadastro (não referência) ficam de fora.
  const AC_EXCLUDE = {veiculos:['placa','modelo'], motoristas:['nome','motorista']};
  const AC_LIMIT = 8;
  const acPlateKey = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const acIndexCache = new WeakMap();

  function acKindFor(input){
    const form = input.closest('#modalForm');
    if(!form || !state.modal || (state.modal.custom && state.modal.custom !== 'brat')) return null;
    if(input.type && !['text','search',''].includes(input.type)) return null;
    const kind = AC_FIELD_KIND[input.name];
    if(!kind) return null;
    if((AC_EXCLUDE[state.modal.key] || []).includes(input.name)) return null;
    return kind;
  }
  function acIndex(kind){
    const src = kind === 'motorista' ? (state.data.motoristas || []) : (state.data.veiculos || []);
    const cache = acIndexCache.get(src);
    if(cache && cache[kind]) return cache[kind];
    let items = [];
    if(kind === 'placa'){
      const seen = new Set();
      src.forEach(v => {
        const value = String(v.placa || v.carro || '').trim(); const key = acPlateKey(value);
        if(!key || seen.has(key)) return; seen.add(key);
        const st = clean(v.status || '');
        items.push({value, key, search:key, label:value, plate:true,
          desc:[v.modelo, v.motorista].filter(Boolean).join(' · ') || 'Veículo cadastrado',
          flag: st.includes('inativ') ? 'Inativo' : st.includes('manut') ? 'Em manutenção' : ''});
      });
    } else if(kind === 'motorista'){
      const seen = new Set();
      src.forEach(m => {
        const value = String(m.nome || '').trim(); const key = clean(value).replace(/\s+/g,' ');
        if(!key || seen.has(key)) return; seen.add(key);
        const st = clean(m.status || 'ativo');
        items.push({value, key, search:key, label:value,
          desc:[m.funcao, m.departamento, m.categoria ? `CNH ${m.categoria}` : ''].filter(Boolean).join(' · ') || 'Motorista cadastrado',
          flag: st.includes('inativ') ? 'Inativo' : ''});
      });
    } else if(kind === 'modelo'){
      const map = new Map();
      src.forEach(v => {
        const value = String(v.modelo || '').trim(); if(!value) return;
        const key = clean(value); const it = map.get(key) || {value, key, search:key, label:value, count:0, plates:[]};
        it.count++; if(v.placa && it.plates.length < 3) it.plates.push(v.placa);
        map.set(key, it);
      });
      items = Array.from(map.values()).map(it => ({...it, desc:`${it.count} veículo${it.count===1?'':'s'}${it.plates.length ? ' · ' + it.plates.join(', ') + (it.count > it.plates.length ? '…' : '') : ''}`}));
    }
    const next = cache || {}; next[kind] = items; acIndexCache.set(src, next);
    return items;
  }
  function acQueryKey(kind, raw){
    return kind === 'placa' ? acPlateKey(raw) : clean(raw).trim().replace(/\s+/g,' ');
  }
  function acSearch(kind, raw){
    const q = acQueryKey(kind, raw);
    if(q.length < (kind === 'placa' ? 2 : 2)) return [];
    const scored = [];
    acIndex(kind).forEach(it => {
      const pos = it.search.indexOf(q);
      let score = -1;
      if(it.search === q) score = 0;
      else if(pos === 0) score = 1;
      else if(kind !== 'placa' && it.search.includes(' ' + q)) score = 2;   // início de outro nome
      else if(pos > 0) score = 3;
      else if(kind === 'motorista'){                                         // todas as palavras digitadas
        const parts = q.split(' ').filter(Boolean);
        if(parts.length > 1 && parts.every(p => it.search.includes(p))) score = 4;
      }
      if(score >= 0) scored.push({it, score, pos});
    });
    scored.sort((a,b) => a.score - b.score || a.pos - b.pos || a.it.label.localeCompare(b.it.label));
    return scored.map(x => x.it);
  }
  // Destaca o trecho digitado. Para placas, compara sem hífen/espaço.
  function acHighlight(kind, label, raw){
    const q = acQueryKey(kind, raw); if(!q) return esc(label);
    let start = -1, end = -1;
    if(kind === 'placa'){
      const map = []; let norm = '';
      String(label).split('').forEach((ch,i) => { const c = acPlateKey(ch); if(c){ norm += c; map.push(i); } });
      const p = norm.indexOf(q); if(p >= 0){ start = map[p]; end = map[p + q.length - 1] + 1; }
    } else {
      const folded = String(label).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
      const p = folded.indexOf(q);
      if(p >= 0 && folded.length === String(label).length){ start = p; end = p + q.length; }
    }
    if(start < 0) return esc(label);
    return `${esc(label.slice(0,start))}<mark>${esc(label.slice(start,end))}</mark>${esc(label.slice(end))}`;
  }

  const AC = {input:null, kind:null, items:[], active:-1, box:null, timer:null};
  function acClose(){
    clearTimeout(AC.timer);
    if(AC.box) AC.box.remove();
    if(AC.input){ AC.input.setAttribute('aria-expanded','false'); AC.input.removeAttribute('aria-activedescendant'); }
    AC.box = null; AC.items = []; AC.active = -1;
  }
  function acRender(){
    const input = AC.input; if(!input) return;
    const raw = input.value;
    const all = acSearch(AC.kind, raw);
    // Já está preenchido exatamente com um cadastro: não precisa sugerir.
    if(!all.length || (all.length === 1 && all[0].value === raw.trim())){ acClose(); return; }
    AC.items = all.slice(0, AC_LIMIT);
    if(AC.active >= AC.items.length) AC.active = -1;
    const host = input.closest('.field') || input.parentElement;
    if(!AC.box || AC.box.parentElement !== host){
      if(AC.box) AC.box.remove();
      AC.box = document.createElement('div');
      AC.box.className = 'ac-list';
      AC.box.id = 'acList';
      AC.box.setAttribute('role','listbox');
      host.classList.add('ac-host');
      host.appendChild(AC.box);
      // seleção por clique/toque sem tirar o foco do campo
      AC.box.addEventListener('pointerdown', ev => {
        const opt = ev.target.closest('.ac-option'); if(!opt) return;
        ev.preventDefault();
        acSelect(Number(opt.dataset.idx));
      });
    }
    const more = all.length - AC.items.length;
    const single = all.length === 1;
    AC.box.innerHTML = AC.items.map((it,i) => `<div class="ac-option${i===AC.active?' active':''}" id="acOpt${i}" role="option" aria-selected="${i===AC.active}" data-idx="${i}">
        <span class="ac-main">${it.plate ? `<span class="ac-plate">${acHighlight(AC.kind, it.label, raw)}</span>` : `<b>${acHighlight(AC.kind, it.label, raw)}</b>`}${it.flag ? `<em class="ac-flag">${esc(it.flag)}</em>` : ''}</span>
        <small class="ac-desc">${esc(it.desc || '')}</small>
      </div>`).join('') +
      `<div class="ac-foot">${single ? 'Enter para preencher' : `${all.length} encontrados${more > 0 ? ` · mostrando ${AC.items.length}` : ''} · ↑↓ para escolher`}</div>`;
    input.setAttribute('aria-expanded','true');
    if(AC.active >= 0) input.setAttribute('aria-activedescendant', `acOpt${AC.active}`); else input.removeAttribute('aria-activedescendant');
    // Abre para cima se não houver espaço visível abaixo (ex.: campo no fim do modal).
    AC.box.classList.remove('ac-up');
    AC.box.style.top = `${input.offsetTop + input.offsetHeight + 4}px`; AC.box.style.bottom = 'auto';
    const scroller = input.closest('.modal-body, .modal') || document.documentElement;
    const limit = Math.min(scroller.getBoundingClientRect().bottom, window.innerHeight);
    const r = input.getBoundingClientRect();
    if(r.bottom + AC.box.offsetHeight + 8 > limit && r.top - AC.box.offsetHeight - 8 > scroller.getBoundingClientRect().top){ AC.box.classList.add('ac-up'); AC.box.style.top = 'auto'; AC.box.style.bottom = `${host.offsetHeight - input.offsetTop + 4}px`; }
  }
  function acSelect(idx){
    const it = AC.items[idx]; const input = AC.input;
    if(!it || !input) return;
    input.value = it.value;
    acClose();
    input.dataset.acSilent = '1';
    input.dispatchEvent(new Event('input', {bubbles:true}));   // mantém comportamentos existentes (ex.: título automático do BRAT)
    input.dispatchEvent(new Event('change', {bubbles:true}));
    delete input.dataset.acSilent;
  }
  function setupEntityAutocomplete(){
    if(window.__frotaAcBound) return; window.__frotaAcBound = true;
    document.addEventListener('focusin', ev => {
      const input = ev.target;
      if(!(input instanceof HTMLInputElement)) return;
      const kind = acKindFor(input); if(!kind) return;
      if(AC.input !== input) acClose();
      AC.input = input; AC.kind = kind;
      input.setAttribute('autocomplete','off');
      input.setAttribute('autocapitalize', kind === 'placa' ? 'characters' : 'words');
      input.setAttribute('spellcheck','false');
      input.setAttribute('role','combobox');
      input.setAttribute('aria-autocomplete','list');
      input.setAttribute('aria-controls','acList');
      input.setAttribute('aria-expanded','false');
    });
    document.addEventListener('input', ev => {
      const input = ev.target;
      if(input !== AC.input || input.dataset.acSilent) return;
      clearTimeout(AC.timer);
      AC.active = -1;
      AC.timer = setTimeout(acRender, 80);
    });
    document.addEventListener('keydown', ev => {
      const input = ev.target;
      if(input !== AC.input) return;
      const open = !!AC.box;
      if(ev.key === 'ArrowDown' || ev.key === 'ArrowUp'){
        if(!open){ clearTimeout(AC.timer); acRender(); if(!AC.box) return; }
        ev.preventDefault();
        const n = AC.items.length; if(!n) return;
        AC.active = ev.key === 'ArrowDown' ? (AC.active + 1) % n : (AC.active <= 0 ? n - 1 : AC.active - 1);
        acRender();
        AC.box?.querySelector('.ac-option.active')?.scrollIntoView({block:'nearest'});
        return;
      }
      if(ev.key === 'Enter'){
        if(AC.timer && !open){ clearTimeout(AC.timer); acRender(); }
        if(!AC.box) return;
        // Uma opção destacada, ou uma única correspondência: preenche. Várias sem escolha: não decide pelo usuário.
        const total = acSearch(AC.kind, input.value).length;
        if(AC.active >= 0){ ev.preventDefault(); acSelect(AC.active); }
        else if(total === 1){ ev.preventDefault(); acSelect(0); }
        else ev.preventDefault();
        return;
      }
      if(ev.key === 'Escape' && open){ ev.preventDefault(); ev.stopPropagation(); acClose(); return; }
      if(ev.key === 'Tab') acClose();
    }, true);
    document.addEventListener('focusout', ev => {
      if(ev.target !== AC.input) return;
      setTimeout(() => { if(document.activeElement !== AC.input) acClose(); }, 120);
    });
    // Fechar o modal remove o formulário: limpa a lista junto.
    document.addEventListener('click', ev => { if(AC.box && !ev.target.closest('.ac-host')) acClose(); });
  }

  function boot(){
    setupUi(); setupLogin(); setupUserChip(); bindSaveErrorBanner(); setupEntityAutocomplete();
    const editObserver = new MutationObserver(() => bindDoubleClickEdit());
    editObserver.observe(document.body, {childList:true, subtree:true});
    bindDoubleClickEdit();
    renderNav();
    setStatus('Verificando sessão...', 'loading');
    initAuth();
  }
  async function initAuth(){
    const db = connect();
    if(!db){ setStatus('Supabase não configurado.', 'error'); document.body.classList.add('auth-locked'); return; }
    setupAuthListener();
    const {data} = await db.auth.getSession();
    if(data && data.session && data.session.user){
      state.user = await loadUserProfile(data.session.user);
    } else {
      state.user = null;
    }
    applyAuth();
    if(!state.user) setStatus('Aguardando login.', 'ok');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.FrotaStable = {loadAll, showPage, state};
})();
