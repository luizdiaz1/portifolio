import { supabase } from './supabase.js';

export async function renderizarOcorrencias(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <h2>Ocorrências</h2>
                <span class="text-muted">Sinistros e ocorrências registradas nos serviços.</span>
            </div>
        </div>
        <div class="content-panel">Carregando ocorrências...</div>`;

    const { data, error } = await supabase
        .from('ocorrencias')
        .select('*, agregados(nome), servicos(codigo_servico, data_servico, descricao)')
        .order('created_at', { ascending: false });

    if (error) {
        container.innerHTML = `<div class="content-panel text-danger">Erro ao carregar ocorrências: ${error.message}</div>`;
        return;
    }

    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <h2>Ocorrências</h2>
                <span class="text-muted">${data.length} registro(s) encontrado(s).</span>
            </div>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>Data</th><th>Motorista</th><th>Serviço</th><th>Tipo</th><th>Descrição</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${data.length === 0 ? '<tr><td colspan="6" class="text-muted">Nenhuma ocorrência registrada.</td></tr>' : data.map(o => `
                        <tr>
                            <td>${o.servicos?.data_servico ? new Date(o.servicos.data_servico).toLocaleDateString('pt-BR') : '-'}</td>
                            <td style="font-weight:500;">${o.agregados?.nome || '-'}</td>
                            <td><span class="link-code">${o.servicos?.codigo_servico || 'SRV'}</span></td>
                            <td><span class="badge badge-danger">${o.tipo || 'Ocorrência'}</span></td>
                            <td style="max-width:420px; white-space:normal; line-height:1.45;">${o.descricao || '-'}</td>
                            <td><span class="badge ${o.status === 'Resolvida' ? 'badge-success' : 'badge-warning'}">${o.status || 'Aberta'}</span></td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}
