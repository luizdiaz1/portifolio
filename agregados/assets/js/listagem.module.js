import { supabase } from './supabase.js';
import { formatarMoeda } from './calculadora.module.js';

const dataSomente = (v) => {
    const t = String(v || '').slice(0,10);
    const [a,m,d] = t.split('-');
    return a && m && d ? `${d}/${m}/${a}` : t || '-';
};

export function renderizarListagem(containerId) {
    const container = document.getElementById(containerId);
    
    container.innerHTML = `
        <div class="modulo-header"><h2>Serviços</h2></div>
        
        <div class="filter-bar">
            <div class="form-group">
                <label>Código do Serviço</label>
                <input type="text" id="filtro_codigo" placeholder="Ex: SRV-2026...">
            </div>
            <div class="form-group">
                <label>Status</label>
                <select id="filtro_status">
                    <option value="">Todos</option>
                    <option value="Finalizado">Finalizado</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Cancelado">Cancelado</option>
                </select>
            </div>
            <button id="btn_filtrar" class="btn-primary">Filtrar Serviços</button>
        </div>

        <div class="content-panel table-container">
            <table id="tabela-servicos">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Data</th>
                        <th>Motorista</th>
                        <th>Valor Final</th>
                        <th>Bônus</th>
                        <th>Status</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody id="tbody_servicos"><tr><td colspan="7">Buscando dados...</td></tr></tbody>
            </table>
        </div>
    `;

    document.getElementById('btn_filtrar').addEventListener('click', carregarDadosTabela);
    carregarDadosTabela(); 
}

async function carregarDadosTabela() {
    const tbody = document.getElementById('tbody_servicos');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Carregando...</td></tr>';

    const codigo = document.getElementById('filtro_codigo').value.trim();
    const status = document.getElementById('filtro_status').value;

    let query = supabase.from('servicos').select('*, agregados(nome)').order('created_at', { ascending: false }).limit(100);
    
    if (codigo) query = query.ilike('codigo_servico', `%${codigo}%`);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) { window.mostrarToast(error.message, 'error'); return; }
    if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Nenhum serviço encontrado.</td></tr>`; return; }

    tbody.innerHTML = data.map(s => {
        let statusClass = 'badge-info';
        if(s.status === 'Cancelado') statusClass = 'badge-danger';
        else if(s.status === 'Finalizado') statusClass = 'badge-success';

        return `
        <tr>
            <td><span class="link-code" onclick="window.navegarPara('detalhe_servico', '${s.id}')">${s.codigo_servico || 'S/ COD'}</span></td>
            <td>${dataSomente(s.data_servico)}</td>
            <td>${s.agregados?.nome || 'Desconhecido'}</td>
            <td style="font-weight: bold; color: ${s.status === 'Cancelado' ? '#64748b' : s.status === 'Em andamento' ? 'var(--text-muted)' : 'var(--success)'}; ${s.status === 'Cancelado' ? 'text-decoration: line-through;' : ''}">${s.status === 'Em andamento' ? 'Pendente' : formatarMoeda(s.valor_final)}</td>
            <td>${s.status === 'Em andamento' ? '<span class="badge badge-info">Aguardando</span>' : `<span class="badge ${s.bonus_percentual == 0.6 ? 'badge-success' : 'badge-warning'}">${s.bonus_percentual}%</span>`}</td>
            <td><span class="badge ${statusClass}">${s.status}</span></td>
            <td><button class="btn-table" onclick="window.navegarPara('detalhe_servico', '${s.id}')">Abrir</button></td>
        </tr>
    `}).join('');
}