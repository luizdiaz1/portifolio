import { supabase } from './supabase.js';
import { formatarMoeda } from './calculadora.module.js';
import { buscarHistoricoMotorista, renderizarHistoricoHTML } from './historico.module.js';

export async function renderizarListaAgregados(containerId) {
    const container = document.getElementById(containerId);
    
    container.innerHTML = `<div class="modulo-header"><h2>Motoristas</h2></div><div class="content-panel">Buscando motoristas...</div>`;
    
    const { data, error } = await supabase.from('agregados').select('*').order('nome');
    if (error) { container.innerHTML = `<div class="content-panel text-danger">Erro: ${error.message}</div>`; return; }

    container.innerHTML = `
        <div class="modulo-header"><h2>Motoristas</h2></div>
        <div class="table-container">
            <table>
                <thead><tr><th>Nome</th><th>Contato / Veículo</th><th>Status</th><th>Ação</th></tr></thead>
                <tbody>
                    ${data.length === 0 ? '<tr><td colspan="4">Nenhum motorista cadastrado.</td></tr>' : ''}
                    ${data.map(a => {
                        // Extrai a placa resumida se existir nas observações
                        let placaResumo = '-';
                        if(a.observacoes && a.observacoes.includes('Placa:')) {
                            const match = a.observacoes.match(/Placa:\s([^|]+)/);
                            if(match) placaResumo = match[1].trim();
                        }

                        return `
                        <tr>
                            <td style="font-weight: 500;">${a.nome}</td>
                            <td class="text-muted">${a.telefone || '-'} <br> <span style="font-size: 11px;">Placa: ${placaResumo}</span></td>
                            <td><span class="badge ${a.status ? 'badge-success' : 'badge-danger'}">${a.status ? 'Ativo' : 'Inativo'}</span></td>
                            <td><span class="link-code" onclick="window.navegarPara('perfil_agregado', '${a.id}')">Abrir Ficha</span></td>
                        </tr>
                        `
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// === C (CREATE) e U (UPDATE) - Formulário Híbrido ===
export async function renderizarCadastroAgregado(containerId, editId = null) {
    const container = document.getElementById(containerId);
    
    container.innerHTML = `
        <div class="modulo-header">
            <div style="display: flex; gap: 12px; align-items: center;">
                <button onclick="window.navegarPara('agregados_lista')" class="btn-outline">Voltar</button>
                <h2>${editId ? 'Editar Cadastro' : 'Novo Motorista / Caminhão'}</h2>
            </div>
        </div>
        
        <div class="content-panel" style="max-width: 800px;">
            <form id="form-agregado">
                <!-- Campo Oculto para armazenar o ID se estivermos editando -->
                <input type="hidden" id="agr_id" value="${editId || ''}">
                
                <div class="panel-header">1. Dados do Motorista ou Empresa</div>
                <div class="grid-col-2">
                    <div class="form-group">
                        <label>Nome Completo / Razão Social</label>
                        <input type="text" id="agr_nome" required placeholder="Ex: João da Silva">
                    </div>
                    <div class="form-group">
                        <label>CPF ou CNPJ</label>
                        <input type="text" id="agr_documento" placeholder="Apenas números">
                    </div>
                </div>
                <div class="grid-col-2">
                    <div class="form-group">
                        <label>Telefone / WhatsApp</label>
                        <input type="text" id="agr_telefone" placeholder="(00) 00000-0000">
                    </div>
                    <div class="form-group">
                        <label>Status Operacional</label>
                        <select id="agr_status">
                            <option value="true">Ativo (Liberado)</option>
                            <option value="false">Inativo (Bloqueado)</option>
                        </select>
                    </div>
                </div>

                <div class="panel-header mt-4">2. Dados do Caminhão Agregado</div>
                <div class="grid-col-2">
                    <div class="form-group">
                        <label>Placa do Caminhão</label>
                        <input type="text" id="veic_placa" placeholder="ABC-1234" style="text-transform: uppercase;">
                    </div>
                    <div class="form-group">
                        <label>Marca e Modelo</label>
                        <input type="text" id="veic_modelo" placeholder="Ex: Acello 1116">
                    </div>
                </div>

                <div class="panel-header mt-4">3. Informações Adicionais</div>
                <div class="form-group">
                    <label>Observações Operacionais</label>
                    <textarea id="agr_observacoes" rows="4" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 3px; font-size: 13px; font-family: inherit; resize: vertical; color: var(--text-dark);" placeholder="Descreva aqui informações adicionais sobre o agregado..."></textarea>
                </div>

                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-light);">
                    <button type="submit" id="btn_salvar" class="btn-primary">Salvar Cadastro Completo</button>
                </div>
            </form>
        </div>
    `;

    // LÓGICA DE PREENCHIMENTO (Se for modo de Edição)
    if (editId) {
        document.getElementById('btn_salvar').innerText = 'Carregando dados...';
        const { data, error } = await supabase.from('agregados').select('*').eq('id', editId).single();
        
        if (!error && data) {
            document.getElementById('agr_nome').value = data.nome || '';
            document.getElementById('agr_documento').value = data.documento || '';
            document.getElementById('agr_telefone').value = data.telefone || '';
            document.getElementById('agr_status').value = data.status.toString();

            if (data.observacoes) {
                const linhas = data.observacoes.split('\n');
                linhas.forEach(linha => {
                    if (linha.startsWith('[CAMINHÃO]')) {
                        const partes = linha.replace('[CAMINHÃO]', '').split('|');
                        partes.forEach(p => {
                            if (p.includes('Placa:')) document.getElementById('veic_placa').value = p.replace('Placa:', '').trim();
                            if (p.includes('Modelo:')) document.getElementById('veic_modelo').value = p.replace('Modelo:', '').trim();
                        });
                    } else if (linha.startsWith('[NOTAS]')) {
                        document.getElementById('agr_observacoes').value = linha.replace('[NOTAS]', '').trim();
                    }
                });
            }
        }
        document.getElementById('btn_salvar').innerText = 'Atualizar Cadastro';
    }

    document.getElementById('form-agregado').addEventListener('submit', salvarAgregado);
}

async function salvarAgregado(e) {
    e.preventDefault();
    const btn = document.getElementById('btn_salvar');
    const isUpdate = document.getElementById('agr_id').value !== '';
    btn.innerText = 'Salvando...'; btn.disabled = true;

    // Coleta dados estruturados do caminhão e transforma em texto
    const placa = document.getElementById('veic_placa').value.trim().toUpperCase();
    const modelo = document.getElementById('veic_modelo').value.trim();
    const obsLivre = document.getElementById('agr_observacoes').value.trim();

    let infoVeiculo = [];
    if(placa) infoVeiculo.push(`Placa: ${placa}`);
    if(modelo) infoVeiculo.push(`Modelo: ${modelo}`);

    let observacoesFinais = "";
    if(infoVeiculo.length > 0) {
        observacoesFinais += `[CAMINHÃO] ${infoVeiculo.join(' | ')}\n`;
    }
    if(obsLivre) {
        observacoesFinais += `[NOTAS] ${obsLivre}`;
    }

    const payload = {
        nome: document.getElementById('agr_nome').value.trim(),
        documento: document.getElementById('agr_documento').value.trim(),
        telefone: document.getElementById('agr_telefone').value.trim(),
        status: document.getElementById('agr_status').value === 'true',
        observacoes: observacoesFinais.trim()
    };

    let error = null;

    if (isUpdate) {
        // Modo Edição (UPDATE)
        const id = document.getElementById('agr_id').value;
        const res = await supabase.from('agregados').update(payload).eq('id', id);
        error = res.error;
    } else {
        // Modo Criação (INSERT)
        const res = await supabase.from('agregados').insert([payload]);
        error = res.error;
    }

    if (error) { 
        window.mostrarToast(error.message, 'error'); 
        btn.innerText = isUpdate ? 'Atualizar Cadastro' : 'Salvar Cadastro Completo'; 
        btn.disabled = false; 
    }
    else { 
        window.mostrarToast(isUpdate ? 'Cadastro atualizado.' : 'Motorista e caminhão cadastrados.', 'success'); 
        window.navegarPara('agregados_lista'); 
    }
}

// === R (READ) e D (DELETE) - Perfil do Agregado ===
export async function renderizarPerfilAgregado(containerId, agregadoId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `<div class="content-panel">Carregando perfil...</div>`;
    
    // Função global de exclusão atrelada a este motorista
    window.excluirAgregado = async function(id) {
        if(!confirm("Confirma a exclusão permanente deste cadastro?")) return;
        
        const { error } = await supabase.from('agregados').delete().eq('id', id);
        if(error) {
            // Código 23503 é Violação de Chave Estrangeira no PostgreSQL (tem serviço vinculado)
            if(error.code === '23503') {
                window.mostrarToast("Este motorista possui serviços vinculados. Altere o status para Inativo em vez de excluir.", "warning");
            } else {
                window.mostrarToast(error.message, "error");
            }
        } else {
            window.mostrarToast("Cadastro excluído permanentemente.", "success");
            window.navegarPara('agregados_lista');
        }
    };

    const { data: ag } = await supabase.from('agregados').select('*').eq('id', agregadoId).single();
    const { data: srvs } = await supabase.from('servicos').select('*').eq('agregado_id', agregadoId).neq('status', 'Cancelado');
    const historico = await buscarHistoricoMotorista(agregadoId);

    let base = 0, comissao = 0, bonus = 0, compl = 0, semRec = 0, maxBonus = 0;
    srvs.forEach(s => {
        base += Number(s.valor_base || 0); comissao += Number(s.valor_comissao || 0); bonus += Number(s.valor_bonus || 0);
        if(s.entregas_realizadas) compl++;
        if(!s.houve_reclamacao) semRec++;
        if(s.bonus_percentual == 0.6) maxBonus++;
    });

    const getPct = (val) => srvs.length === 0 ? 0 : Math.round((val / srvs.length) * 100);

    // PROCESSAMENTO DAS OBSERVAÇÕES
    let txtCaminhao = "Nenhum dado cadastrado.";
    let txtNotas = "Nenhuma observação adicional.";

    if (ag.observacoes) {
        const linhas = ag.observacoes.split('\n');
        linhas.forEach(linha => {
            if (linha.startsWith('[CAMINHÃO]')) {
                txtCaminhao = linha.replace('[CAMINHÃO]', '').trim();
            } else if (linha.startsWith('[NOTAS]')) {
                txtNotas = linha.replace('[NOTAS]', '').trim();
            }
        });
    }

    container.innerHTML = `
        <div class="modulo-header">
            <div style="display: flex; gap: 12px; align-items: center;">
                <button onclick="window.navegarPara('agregados_lista')" class="btn-outline">Voltar</button>
                <h2>${ag.nome}</h2>
                <span class="badge ${ag.status ? 'badge-success' : 'badge-danger'}">${ag.status ? 'Ativo' : 'Inativo'}</span>
            </div>
            
            <!-- AQUI ESTÃO OS BOTÕES DE EDITAR E EXCLUIR -->
            <div style="display: flex; gap: 8px;">
                <button onclick="window.navegarPara('editar_agregado', '${ag.id}')" class="btn-outline" data-role="gestor">Editar Cadastro</button>
                <button onclick="window.excluirAgregado('${ag.id}')" class="btn-outline" data-role="gestor" style="color: var(--danger); border-color: var(--danger);">Excluir</button>
            </div>
        </div>

        <div class="panel-header">Ficha Cadastral e Caminhão</div>
        <div class="content-panel mb-4">
            <div class="grid-col-2" style="margin-bottom: 20px;">
                <div><span class="text-muted">Documento:</span> <br> <span style="font-size: 15px; font-weight: 500;">${ag.documento || '-'}</span></div>
                <div><span class="text-muted">Telefone:</span> <br> <span style="font-size: 15px; font-weight: 500;">${ag.telefone || '-'}</span></div>
            </div>
            
            <div class="info-block">
                <span class="info-label">Dados do Caminhão Vinculado</span>
                <span class="info-value">${txtCaminhao}</span>
            </div>
            
            <div class="info-block" style="margin-bottom: 0;">
                <span class="info-label">Observações Operacionais / Notas</span>
                <span class="info-value">${txtNotas}</span>
            </div>
        </div>

        <div class="panel-header">Resumo Financeiro (Ativos)</div>
        <div class="grid-col-4 mb-4">
            <div class="kpi-card"><span class="kpi-title">Serviços Realizados</span><span class="kpi-value">${srvs.length}</span></div>
            <div class="kpi-card"><span class="kpi-title">Valor Base Gerado</span><span class="kpi-value">${formatarMoeda(base)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Comissão (2,5%)</span><span class="kpi-value">${formatarMoeda(comissao)}</span></div>
            <div class="kpi-card"><span class="kpi-title">Bônus Recebidos</span><span class="kpi-value txt-warning">${formatarMoeda(bonus)}</span></div>
        </div>

        <div class="panel-header mt-4">Histórico do Motorista</div>
        <div class="mb-4">${historico.error ? `<div class="content-panel text-danger">Erro ao carregar histórico: ${historico.error.message}</div>` : renderizarHistoricoHTML(historico.servicos, historico.ciots)}</div>

        <div class="panel-header mt-4">Qualidade Operacional</div>
        <div class="grid-col-4">
            <div class="kpi-card"><span class="kpi-title">Entregas Completas</span><span class="kpi-value">${getPct(compl)}%</span></div>
            <div class="kpi-card"><span class="kpi-title">Sem Reclamações</span><span class="kpi-value">${getPct(semRec)}%</span></div>
            <div class="kpi-card"><span class="kpi-title">Bônus Máximo</span><span class="kpi-value">${getPct(maxBonus)}%</span></div>
        </div>
    `;
}