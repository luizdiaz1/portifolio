import { supabase } from './supabase.js';
import { formatarMoeda } from './calculadora.module.js';

const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
const dataSomente = (v) => {
    const t = String(v || '').slice(0,10);
    const [a,m,d] = t.split('-');
    return a && m && d ? `${d}/${m}/${a}` : t || '-';
};

export async function renderizarDashboard(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="modulo-header"><div><span class="eyebrow">VISÃO GERAL</span><h2>Dashboard</h2><p class="header-description">Acompanhe operação, performance e financeiro dos agregados.</p></div></div><div class="content-panel">Carregando dados...</div>`;

    const [{ data: srvs, error: errSrv }, { data: agregados }] = await Promise.all([
        supabase.from('servicos').select('*, agregados(nome)').neq('status','Cancelado').order('data_servico',{ascending:false}),
        supabase.from('agregados').select('id,nome,status').order('nome')
    ]);
    if (errSrv) {
        container.innerHTML = `<div class="content-panel text-danger">Erro ao carregar dashboard: ${esc(errSrv.message)}</div>`;
        return;
    }

    const servicos = srvs || [];
    const finalizados = servicos.filter(s => s.status === 'Finalizado');
    const andamento = servicos.filter(s => s.status === 'Em andamento');
    const concluidas = finalizados.filter(s => s.entregas_realizadas === true);
    const pendentes = finalizados.filter(s => s.entregas_realizadas !== true);
    const reclamacoes = finalizados.filter(s => s.houve_reclamacao === true);
    const semReclamacoes = finalizados.filter(s => s.houve_reclamacao === false);
    const totalBase = finalizados.reduce((n,s)=>n+Number(s.valor_base||0),0);
    const totalComissao = finalizados.reduce((n,s)=>n+Number(s.valor_comissao||0),0);
    const totalBonus = finalizados.reduce((n,s)=>n+Number(s.valor_bonus||0),0);
    const totalReceber = totalComissao + totalBonus;

    const porAgregado = (agregados || []).map(a => {
        const itens = servicos.filter(s => s.agregado_id === a.id);
        const fins = itens.filter(s => s.status === 'Finalizado');
        const base = fins.reduce((n,s)=>n+Number(s.valor_base||0),0);
        const comissao = fins.reduce((n,s)=>n+Number(s.valor_comissao||0),0);
        const bonus = fins.reduce((n,s)=>n+Number(s.valor_bonus||0),0);
        return { ...a, itens, fins, andamento: itens.filter(s=>s.status==='Em andamento').length, concluidas:fins.filter(s=>s.entregas_realizadas===true).length, pendentes:fins.filter(s=>s.entregas_realizadas!==true).length, base, receber:comissao+bonus };
    }).filter(a => a.itens.length);

    window.abrirTimelineDashboard = function(tipo) {
        const mapas = {
            concluidas: { titulo:'Entregas concluídas', subtitulo:'Serviços finalizados com todas as entregas concluídas.', itens: concluidas, classe:'is-success' },
            pendentes: { titulo:'Entregas pendentes', subtitulo:'Serviços finalizados que possuem entrega pendente ou falha.', itens: pendentes, classe:'is-warning' },
            andamento: { titulo:'Serviços em andamento', subtitulo:'Serviços ainda abertos para finalização.', itens: andamento, classe:'is-info' },
            reclamacoes: { titulo:'Reclamações', subtitulo:'Serviços finalizados com reclamação registrada.', itens: reclamacoes, classe:'is-danger' }
        };
        const cfg = mapas[tipo];
        if (!cfg) return;
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-card dashboard-timeline-modal">
            <div class="modal-header"><div><span class="eyebrow">LINHA DO TEMPO</span><h3>${cfg.titulo}</h3><p class="header-description">${cfg.subtitulo}</p></div><button class="modal-close">×</button></div>
            <div class="dashboard-timeline">${cfg.itens.length ? cfg.itens.map(s=>`
                <button class="timeline-item ${cfg.classe}" onclick="window.navegarPara('detalhe_servico','${s.id}'); this.closest('.modal-overlay').remove()">
                    <span class="timeline-dot"></span><span class="timeline-content"><strong>${esc(s.codigo_servico || 'Serviço')}</strong><small>${dataSomente(s.data_servico)} · ${esc(s.agregados?.nome || 'Motorista não identificado')}</small><em>${esc(s.descricao || 'Sem descrição')}</em></span><span class="timeline-value">${s.status === 'Finalizado' ? formatarMoeda(s.valor_final) : 'Em andamento'} ›</span>
                </button>`).join('') : `<div class="report-empty-state"><strong>Nenhum registro.</strong><span>Não há serviços para este indicador.</span></div>`}</div>
        </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.modal-close').onclick=()=>modal.remove();
        modal.onclick=e=>{if(e.target===modal)modal.remove()};
    };

    window.abrirDetalheAgregadoDashboard = function(id) {
        window.navegarPara('perfil_agregado', id);
    };

    container.innerHTML = `
        <div class="modulo-header">
            <div><span class="eyebrow">VISÃO GERAL</span><h2>Dashboard</h2><p class="header-description">Acompanhe operação, performance e financeiro dos agregados.</p></div>
        </div>

        <div class="dashboard-filter-strip">
            <div><strong>Período atual</strong><span>Visão consolidada de todos os serviços cadastrados</span></div>
            <span class="badge badge-info">${servicos.length} serviços</span>
        </div>

        <div class="panel-header">Resumo financeiro</div>
        <div class="dashboard-kpi-grid">
            <div class="kpi-card"><span class="kpi-title">Serviços</span><span class="kpi-value">${servicos.length}</span><span class="kpi-subtitle">${andamento.length} em andamento · ${finalizados.length} finalizados</span></div>
            <div class="kpi-card"><span class="kpi-title">Valor base</span><span class="kpi-value">${formatarMoeda(totalBase)}</span><span class="kpi-subtitle">Serviços finalizados</span></div>
            <div class="kpi-card"><span class="kpi-title">Comissão fixa (2,5%)</span><span class="kpi-value">${formatarMoeda(totalComissao)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Bônus operacional</span><span class="kpi-value txt-warning">${formatarMoeda(totalBonus)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Comissão + bonificação (3,1%)</span><span class="kpi-value txt-success">${formatarMoeda(totalReceber)}</span></div>
        </div>

        <div class="panel-header mt-4">Indicadores operacionais</div>
        <div class="dashboard-kpi-grid dashboard-kpi-clickable">
            <button class="kpi-card kpi-action" onclick="window.abrirTimelineDashboard('concluidas')"><span class="kpi-title">Entregas concluídas</span><span class="kpi-value txt-success">${concluidas.length}</span><span class="kpi-subtitle">Clique para ver a linha do tempo</span></button>
            <button class="kpi-card kpi-action" onclick="window.abrirTimelineDashboard('pendentes')"><span class="kpi-title">Entregas pendentes</span><span class="kpi-value txt-warning">${pendentes.length}</span><span class="kpi-subtitle">Clique para ver detalhes</span></button>
            <button class="kpi-card kpi-action" onclick="window.abrirTimelineDashboard('andamento')"><span class="kpi-title">Em andamento</span><span class="kpi-value">${andamento.length}</span><span class="kpi-subtitle">Serviços aguardando finalização</span></button>
            <button class="kpi-card kpi-action" onclick="window.abrirTimelineDashboard('reclamacoes')"><span class="kpi-title">Reclamações</span><span class="kpi-value ${reclamacoes.length ? 'txt-danger':'txt-success'}">${reclamacoes.length}</span><span class="kpi-subtitle">${semReclamacoes.length} sem reclamações</span></button>
        </div>

        <div class="panel-header mt-4">Visão por agregado</div>
        <div class="dashboard-aggregates-grid">
            ${porAgregado.length ? porAgregado.map(a=>`
                <button class="aggregate-dashboard-card" onclick="window.abrirDetalheAgregadoDashboard('${a.id}')">
                    <div class="aggregate-card-top"><div><span class="eyebrow">MOTORISTA</span><strong>${esc(a.nome)}</strong></div><span class="badge ${a.status ? 'badge-success':'badge-warning'}">${a.status ? 'Ativo':'Inativo'}</span></div>
                    <div class="aggregate-card-stats"><div><small>Serviços</small><strong>${a.itens.length}</strong></div><div><small>Concluídas</small><strong>${a.concluidas}</strong></div><div><small>Em andamento</small><strong>${a.andamento}</strong></div><div><small>Pendentes</small><strong>${a.pendentes}</strong></div><div><small>A receber</small><strong>${formatarMoeda(a.receber)}</strong></div></div>
                </button>`).join('') : `<div class="content-panel report-empty-state"><strong>Nenhum agregado com serviço.</strong><span>Quando houver serviços vinculados, o desempenho aparecerá aqui.</span></div>`}
        </div>
    `;
}
