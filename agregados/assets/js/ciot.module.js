import { supabase } from './supabase.js';

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const formatDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

export async function renderizarCiots(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="modulo-header">
            <h2>CIOTs</h2>
            <button class="btn-primary" data-role="gestor" onclick="window.novoCiot()">Novo CIOT</button>
        </div>
        <div class="content-panel">Carregando CIOTs...</div>
    `;

    const { data, error } = await supabase
        .from('ciots')
        .select('*, agregados(nome)')
        .order('data_emissao', { ascending: false });

    if (error) {
        container.innerHTML = `<div class="content-panel text-danger">Erro ao carregar CIOTs: ${esc(error.message)}</div>`;
        return;
    }

    container.innerHTML = `
        <div class="modulo-header">
            <h2>CIOTs</h2>
            <button class="btn-primary" data-role="gestor" onclick="window.novoCiot()">Novo CIOT</button>
        </div>
        <div class="table-container">
            <table>
                <thead><tr><th>CIOT</th><th>Motorista</th><th>Emissão</th><th>Origem</th><th>Destino</th><th>Status</th><th>Ação</th></tr></thead>
                <tbody>
                    ${!data?.length ? '<tr><td colspan="7">Nenhum CIOT cadastrado.</td></tr>' : data.map(c => `
                        <tr>
                            <td style="font-weight:600;">${esc(c.numero_ciot)}</td>
                            <td>${esc(c.agregados?.nome || '-')}</td>
                            <td>${formatDate(c.data_emissao)}</td>
                            <td>${esc(c.origem || '-')}</td>
                            <td>${esc(c.destino || '-')}</td>
                            <td><span class="badge ${c.status === 'Cancelado' ? 'badge-danger' : c.status === 'Finalizado' ? 'badge-info' : 'badge-success'}">${esc(c.status)}</span></td>
                            <td><span class="link-code" data-role="gestor" onclick="window.editarCiot('${c.id}')">Abrir</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export async function renderizarCadastroCiot(containerId, editId = null, agregadoId = null) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="content-panel">Carregando formulário...</div>`;

    const { data: motoristas, error: motoristasError } = await supabase
        .from('agregados').select('id, nome').order('nome');

    if (motoristasError) {
        container.innerHTML = `<div class="content-panel text-danger">Erro: ${esc(motoristasError.message)}</div>`;
        return;
    }

    let ciot = null;
    if (editId) {
        const res = await supabase.from('ciots').select('*').eq('id', editId).single();
        if (res.error) {
            container.innerHTML = `<div class="content-panel text-danger">Erro: ${esc(res.error.message)}</div>`;
            return;
        }
        ciot = res.data;
    }

    const selectedMotorista = ciot?.agregado_id || agregadoId || '';
    container.innerHTML = `
        <div class="modulo-header">
            <div style="display:flex;gap:12px;align-items:center;">
                <button onclick="window.navegarPara('ciots')" class="btn-outline">Voltar</button>
                <h2>${editId ? 'Editar CIOT' : 'Novo CIOT'}</h2>
            </div>
        </div>
        <div class="content-panel" style="max-width:900px;">
            <form id="form-ciot">
                <input type="hidden" id="ciot_id" value="${esc(editId || '')}">
                <div class="grid-col-2">
                    <div class="form-group">
                        <label>Número do CIOT</label>
                        <input type="text" id="ciot_numero" required placeholder="Digite o número do CIOT" value="${esc(ciot?.numero_ciot || '')}">
                    </div>
                    <div class="form-group">
                        <label>Motorista</label>
                        <select id="ciot_agregado" required>
                            <option value="">Selecione...</option>
                            ${(motoristas || []).map(m => `<option value="${m.id}" ${String(m.id) === String(selectedMotorista) ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="grid-col-2">
                    <div class="form-group">
                        <label>Data de emissão</label>
                        <input type="date" id="ciot_data" required value="${esc(ciot?.data_emissao || '')}">
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="ciot_status">
                            ${['Ativo','Finalizado','Cancelado'].map(s => `<option ${s === (ciot?.status || 'Ativo') ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="grid-col-2">
                    <div class="form-group"><label>Origem</label><input type="text" id="ciot_origem" value="${esc(ciot?.origem || '')}"></div>
                    <div class="form-group"><label>Destino</label><input type="text" id="ciot_destino" value="${esc(ciot?.destino || '')}"></div>
                </div>
                <div class="form-group" style="max-width:220px;">
                    <label>Valor do contrato (R$)</label>
                    <input type="number" step="0.01" id="ciot_valor" value="${ciot?.valor_contrato ?? ''}">
                </div>
                <div class="form-group">
                    <label>Observações</label>
                    <textarea id="ciot_observacoes" rows="4" placeholder="Informações adicionais do CIOT...">${esc(ciot?.observacoes || '')}</textarea>
                </div>
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border-light);display:flex;gap:8px;">
                    <button type="submit" id="btn-salvar-ciot" class="btn-primary" data-role="gestor">${editId ? 'Atualizar CIOT' : 'Salvar CIOT'}</button>
                    ${editId ? `<button type="button" class="btn-outline" onclick="window.cancelarCiot('${editId}')">Cancelar CIOT</button>` : ''}
                </div>
            </form>
        </div>
    `;

    document.getElementById('form-ciot').addEventListener('submit', salvarCiot);

    if (!ciot && !document.getElementById('ciot_data').value) {
        document.getElementById('ciot_data').valueAsDate = new Date();
    }
}

async function salvarCiot(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-ciot');
    btn.disabled = true;
    btn.innerText = 'Salvando...';

    const id = document.getElementById('ciot_id').value;
    const payload = {
        numero_ciot: document.getElementById('ciot_numero').value.trim(),
        agregado_id: document.getElementById('ciot_agregado').value,
        data_emissao: document.getElementById('ciot_data').value,
        status: document.getElementById('ciot_status').value,
        origem: document.getElementById('ciot_origem').value.trim(),
        destino: document.getElementById('ciot_destino').value.trim(),
        valor_contrato: parseFloat(document.getElementById('ciot_valor').value) || 0,
        observacoes: document.getElementById('ciot_observacoes').value.trim()
    };

    const result = id
        ? await supabase.from('ciots').update(payload).eq('id', id)
        : await supabase.from('ciots').insert([payload]);

    if (result.error) {
        window.mostrarToast('Erro ao salvar CIOT: ' + result.error.message, 'error');
        btn.disabled = false;
        btn.innerText = id ? 'Atualizar CIOT' : 'Salvar CIOT';
        return;
    }

    window.mostrarToast(id ? 'CIOT atualizado.' : 'CIOT cadastrado.', 'success');
    window.navegarPara('ciots');
}

window.novoCiot = () => window.navegarPara('cadastrar_ciot');
window.editarCiot = (id) => window.navegarPara('editar_ciot', id);
window.cancelarCiot = async (id) => {
    if (!confirm('Deseja cancelar este CIOT? O registro será mantido no histórico.')) return;
    const { error } = await supabase.from('ciots').update({ status: 'Cancelado' }).eq('id', id);
    if (error) window.mostrarToast(error.message, 'error');
    else { window.mostrarToast('CIOT cancelado.', 'success'); window.navegarPara('ciots'); }
};
