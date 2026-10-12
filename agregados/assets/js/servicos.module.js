import { supabase } from './supabase.js';
import { ehGestor } from './auth.js';
import { calcularBonificacao, formatarMoeda } from './calculadora.module.js';

export function renderizarServicos(containerId) {
    const container = document.getElementById(containerId);

    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <span class="eyebrow">OPERAÇÃO</span>
                <h2>Novo Serviço</h2>
                <p class="header-description">Cadastre o serviço agora e deixe a conclusão para depois.</p>
            </div>
        </div>

        <div class="grid-layout-2">
            <div class="content-panel">
                <form id="form-servico">
                    <div class="panel-header">Dados do Serviço</div>
                    <div class="grid-col-2">
                        <div class="form-group">
                            <label>Data</label>
                            <input type="date" id="data_servico" required>
                        </div>
                        <div class="form-group">
                            <label>Motorista</label>
                            <select id="agregado_id" required><option value="">Carregando...</option></select>
                        </div>
                    </div>
                    <div class="grid-col-2">
                        <div class="form-group">
                            <label>Horário de início</label>
                            <input type="time" id="hora_inicio" required>
                            <small class="field-help">Informe o horário em que o motorista iniciou o serviço.</small>
                        </div>
                        <div class="form-group">
                            <label>Notas na saída</label>
                            <input type="number" id="notas_saida" min="0" step="1" value="0" required inputmode="numeric" placeholder="Ex: 25">
                            <small class="field-help">Quantidade de notas com que o motorista saiu.</small>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Descrição do serviço</label>
                        <input type="text" id="descricao" required placeholder="Ex: Rota Sul / Entrega para cliente X">
                    </div>

                    <div class="grid-col-2">
                        <div class="form-group"><label>Origem <span class="optional-label">Opcional</span></label><input type="text" id="origem"></div>
                        <div class="form-group"><label>Destino <span class="optional-label">Opcional</span></label><input type="text" id="destino"></div>
                    </div>

                    <div class="panel-header mt-4">Financeiro</div>
                    <div class="finance-input-grid">
                        <div class="form-group">
                            <label>Valor Base (R$)</label>
                            <input type="number" step="0.01" min="0" id="valor_base" required placeholder="0,00">
                        </div>
                        <div class="finance-preview-card">
                            <span>Comissão fixa (2,5%)</span>
                            <strong id="preview_comissao">R$ 0,00</strong>
                        </div>
                    </div>

                    <div class="workflow-note">
                        <div class="workflow-note-icon">↻</div>
                        <div>
                            <strong>O serviço ficará em andamento</strong>
                            <span>Entregas, reclamações e sinistros serão registrados somente quando o serviço for finalizado.</span>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn-primary">Criar Serviço</button>
                    </div>
                </form>
            </div>

            <div class="summary-panel service-status-panel">
                <div class="summary-body">
                    <div class="panel-header" style="border:none; padding:0; margin-bottom:14px;">Fluxo do serviço</div>
                    <div class="workflow-step active">
                        <span class="workflow-dot">1</span>
                        <div><strong>Cadastro</strong><small>Dados iniciais e valor base</small></div>
                    </div>
                    <div class="workflow-line"></div>
                    <div class="workflow-step">
                        <span class="workflow-dot">2</span>
                        <div><strong>Em andamento</strong><small>O serviço permanece aberto</small></div>
                    </div>
                    <div class="workflow-line"></div>
                    <div class="workflow-step">
                        <span class="workflow-dot">3</span>
                        <div><strong>Finalização</strong><small>Apontamentos e bonificação</small></div>
                    </div>
                </div>
                <div class="summary-footer">
                    <span>Status inicial</span>
                    <span class="badge badge-info">Em andamento</span>
                </div>
            </div>
        </div>
    `;

    document.getElementById('data_servico').valueAsDate = new Date();
    const agora = new Date();
    document.getElementById('hora_inicio').value = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    carregarAgregados();
    document.getElementById('form-servico').addEventListener('submit', salvarServico);
    document.getElementById('valor_base').addEventListener('input', atualizarPreviewComissao);
}

function atualizarPreviewComissao() {
    const valor = Number(document.getElementById('valor_base')?.value || 0);
    const el = document.getElementById('preview_comissao');
    if (el) el.textContent = formatarMoeda(valor * 0.025);
}

function dataSomente(v) {
    if (!v) return '-';
    const texto = String(v).slice(0, 10);
    const [ano, mes, dia] = texto.split('-');
    return ano && mes && dia ? `${dia}/${mes}/${ano}` : texto;
}

async function carregarAgregados() {
    const select = document.getElementById('agregado_id');
    const { data, error } = await supabase.from('agregados').select('id, nome').eq('status', true).order('nome');

    if (error) {
        select.innerHTML = '<option value="">Erro de conexão</option>';
        window.mostrarToast('Erro ao buscar motoristas.', 'error');
        return;
    }

    if (!data || data.length === 0) {
        select.innerHTML = '<option value="">Nenhum motorista ATIVO encontrado</option>';
        return;
    }

    select.innerHTML = '<option value="">Selecione...</option>' +
        data.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
}

async function salvarServico(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.innerText = 'Criando serviço...';
    btn.disabled = true;

    const valorBase = parseFloat(document.getElementById('valor_base').value);
    const notasSaida = Number.parseInt(document.getElementById('notas_saida')?.value, 10);
    if (!Number.isInteger(notasSaida) || notasSaida < 0) {
        window.mostrarToast('Informe uma quantidade válida de notas na saída.', 'warning');
        btn.innerText = 'Criar Serviço';
        btn.disabled = false;
        document.getElementById('notas_saida')?.focus();
        return;
    }
    const payload = {
        agregado_id: document.getElementById('agregado_id').value,
        data_servico: document.getElementById('data_servico').value,
        hora_inicio: document.getElementById('hora_inicio').value,
        notas_saida: Number.parseInt(document.getElementById('notas_saida').value, 10),
        descricao: document.getElementById('descricao').value.trim(),
        origem: document.getElementById('origem').value.trim(),
        destino: document.getElementById('destino').value.trim(),
        valor_base: valorBase,
        status: 'Em andamento',
        entregas_realizadas: null,
        quantidade_entregas: null,
        houve_reclamacao: null,
        entregas_descricao: null,
        reclamacao_descricao: null,
        devolucao_realizada: null,
        devolucao_causada_motorista: null,
        devolucao_descricao: null,
        percentual_comissao: 2.5,
        valor_comissao: null,
        bonus_percentual: null,
        valor_bonus: null,
        valor_final: null
    };

    const { data: servicoCriado, error } = await supabase
        .from('servicos')
        .insert([payload])
        .select('id')
        .single();

    if (error) {
        window.mostrarToast('Erro ao criar serviço: ' + error.message, 'error');
        btn.innerText = 'Criar Serviço';
        btn.disabled = false;
        return;
    }

    window.mostrarToast('Serviço criado e colocado em andamento.', 'success');
    window.navegarPara('detalhe_servico', servicoCriado.id);
}

// === FINALIZAÇÃO DO SERVIÇO ===
function atualizarVisibilidadeFinalizacao() {
    const entregasPendentes = document.querySelector('input[name="final_entregas"]:checked')?.value === 'nao';
    const reclamacao = document.querySelector('input[name="final_reclamacao"]:checked')?.value === 'sim';
    const devolucaoMotorista = document.querySelector('input[name="final_devolucao"]:checked')?.value === 'sim';
    const sinistro = document.querySelector('input[name="final_sinistro"]:checked')?.value === 'sim';

    const toggleBox = (boxId, textareaId, visible) => {
        const box = document.getElementById(boxId);
        const textarea = document.getElementById(textareaId);
        if (!box || !textarea) return;
        box.style.display = visible ? 'block' : 'none';
        textarea.required = visible;
    };

    toggleBox('final_entregas_box', 'final_entregas_descricao', entregasPendentes);
    toggleBox('final_reclamacao_box', 'final_reclamacao_descricao', reclamacao);
    toggleBox('final_devolucao_box', 'final_devolucao_descricao', devolucaoMotorista);
    toggleBox('final_sinistro_box', 'final_sinistro_descricao', sinistro);

    atualizarResumoBonificacao();
}

function atualizarResumoBonificacao() {
    const reclamacao = document.querySelector('input[name="final_reclamacao"]:checked')?.value || 'nao';
    const devolucao = document.querySelector('input[name="final_devolucao"]:checked')?.value || 'nao';
    const sinistro = document.querySelector('input[name="final_sinistro"]:checked')?.value || 'nao';
    const calc = calcularBonificacao(100, reclamacao, devolucao, sinistro);

    const percentualEl = document.getElementById('final_bonus_percentual');
    if (percentualEl) percentualEl.textContent = `+${calc.percentual.toFixed(1).replace('.', ',')}%`;

    const excellenceEl = document.getElementById('status-excelencia');
    const safetyEl = document.getElementById('status-seguranca');
    const comboEl = document.getElementById('status-combo');
    if (excellenceEl) {
        excellenceEl.className = `bonus-status ${calc.regras.excelenciaOperacional ? 'is-ok' : 'is-fail'}`;
        excellenceEl.innerHTML = calc.regras.excelenciaOperacional ? '✓ Critérios atendidos' : '× Critérios não atendidos';
    }
    if (safetyEl) {
        safetyEl.className = `bonus-status ${calc.regras.segurancaTotal ? 'is-ok' : 'is-fail'}`;
        safetyEl.innerHTML = calc.regras.segurancaTotal ? '✓ Critério atendido' : '× Critério não atendido';
    }
    if (comboEl) {
        comboEl.className = `bonus-status ${calc.regras.comboPerformance ? 'is-ok' : 'is-fail'}`;
        comboEl.innerHTML = calc.regras.comboPerformance ? '✓ Combo ativado' : '× Combo não ativado';
    }

    const excellenceMini = document.getElementById('status-excelencia-mini');
    const safetyMini = document.getElementById('status-seguranca-mini');
    if (excellenceMini) excellenceMini.textContent = calc.regras.excelenciaOperacional ? 'Critérios atendidos' : 'Critérios não atendidos';
    if (safetyMini) safetyMini.textContent = calc.regras.segurancaTotal ? 'Critério atendido' : 'Critério não atendido';
}

function montarPainelFinalizacao() {
    return `
        <div class="finalizacao-panel" id="painel-finalizacao">
            <div class="finalizacao-header">
                <div>
                    <span class="eyebrow">ENCERRAMENTO</span>
                    <h3>Finalizar serviço</h3>
                    <p>Registre os apontamentos do serviço. A bonificação será calculada automaticamente pela mecânica vigente.</p>
                </div>
                <button type="button" class="btn-outline" id="btn-fechar-finalizacao">Fechar</button>
            </div>

            <form id="form-finalizacao">
                <div class="content-panel" style="margin-bottom:16px;">
                    <div class="panel-header" style="margin-top:0;">Retorno do motorista</div>
                    <div class="grid-col-2">
                        <div class="form-group" style="margin-bottom:0;">
                            <label>Horário de retorno</label>
                            <input type="time" id="hora_retorno" required>
                            <small class="field-help">Informe o horário em que o motorista retornou do serviço.</small>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label>Notas na chegada</label>
                            <input type="number" id="notas_retorno" min="0" step="1" value="0" required inputmode="numeric" placeholder="Ex: 10">
                            <small class="field-help">Quantidade de notas com que o motorista retornou.</small>
                        </div>
                    </div>
                </div>
                <div class="bonus-rule-stack">
                    <section class="finalizacao-card bonus-rule-card">
                        <div class="finalizacao-card-title bonus-rule-title">
                            <span>01</span>
                            <div><strong>Excelência Operacional</strong><small>+0,2% quando os dois critérios forem atendidos</small></div>
                            <em class="bonus-rule-value">+0,2%</em>
                        </div>

                        <div class="rule-question">
                            <label class="field-title">Houve reclamação procedente de cliente?</label>
                            <div class="choice-group">
                                <label class="choice-card"><input type="radio" name="final_reclamacao" value="nao" checked> <span><strong>Nenhuma <em class="bonus-hint positive">critério atendido</em></strong><small>Serviço sem reclamações procedentes</small></span></label>
                                <label class="choice-card"><input type="radio" name="final_reclamacao" value="sim"> <span><strong>Houve reclamação <em class="bonus-hint muted">critério perdido</em></strong><small>Registrar o motivo</small></span></label>
                            </div>
                            <div class="form-group occurrence-box" id="final_reclamacao_box" style="display:none;">
                                <label>Descrição da reclamação</label>
                                <textarea id="final_reclamacao_descricao" rows="3" placeholder="Descreva o que aconteceu e o motivo da reclamação..."></textarea>
                            </div>
                        </div>

                        <div class="rule-question">
                            <label class="field-title">Houve devolução de mercadoria causada por falha do motorista?</label>
                            <div class="choice-group">
                                <label class="choice-card"><input type="radio" name="final_devolucao" value="nao" checked> <span><strong>Não <em class="bonus-hint positive">critério atendido</em></strong><small>Nenhuma devolução causada por falha do motorista</small></span></label>
                                <label class="choice-card"><input type="radio" name="final_devolucao" value="sim"> <span><strong>Sim <em class="bonus-hint muted">critério perdido</em></strong><small>Registrar o motivo</small></span></label>
                            </div>
                            <div class="form-group occurrence-box" id="final_devolucao_box" style="display:none;">
                                <label>Motivo da devolução</label>
                                <textarea id="final_devolucao_descricao" rows="3" placeholder="Descreva o motivo da devolução e a falha identificada..."></textarea>
                            </div>
                        </div>

                        <div class="bonus-rule-result"><span>Resultado da Excelência Operacional</span><strong id="status-excelencia" class="bonus-status is-ok">✓ Critérios atendidos</strong></div>
                    </section>

                    <section class="finalizacao-card bonus-rule-card">
                        <div class="finalizacao-card-title bonus-rule-title">
                            <span>02</span>
                            <div><strong>Segurança Total</strong><small>+0,2% sem ocorrência de segurança</small></div>
                            <em class="bonus-rule-value">+0,2%</em>
                        </div>

                        <div class="rule-question">
                            <label class="field-title">Houve sinistro?</label>
                            <div class="choice-group">
                                <label class="choice-card"><input type="radio" name="final_sinistro" value="nao" checked> <span><strong>Não <em class="bonus-hint positive">+0,2%</em></strong><small>Sem roubo, furto, extravio ou desaparecimento de carga</small></span></label>
                                <label class="choice-card"><input type="radio" name="final_sinistro" value="sim"> <span><strong>Sim <em class="bonus-hint muted">sem +0,2%</em></strong><small>Registrar ocorrência automaticamente</small></span></label>
                            </div>
                            <div class="form-group occurrence-box" id="final_sinistro_box" style="display:none;">
                                <label>Descrição do sinistro</label>
                                <textarea id="final_sinistro_descricao" rows="4" placeholder="Descreva o que aconteceu, local, danos, envolvidos e demais informações relevantes..."></textarea>
                                <small class="field-help">Uma ocorrência será criada automaticamente na tela de Ocorrências.</small>
                            </div>
                        </div>

                        <div class="bonus-rule-result"><span>Resultado da Segurança Total</span><strong id="status-seguranca" class="bonus-status is-ok">✓ Critério atendido</strong></div>
                    </section>

                    <section class="finalizacao-card bonus-rule-card bonus-combo-card">
                        <div class="finalizacao-card-title bonus-rule-title">
                            <span>03</span>
                            <div><strong>Combo de Performance</strong><small>Bônus extra quando 01 e 02 são atingidos integralmente</small></div>
                            <em class="bonus-rule-value">+0,2%</em>
                        </div>
                        <div class="combo-grid">
                            <div><span>01</span><strong>Excelência Operacional</strong><small id="status-excelencia-mini">Critérios atendidos</small></div>
                            <div><span>02</span><strong>Segurança Total</strong><small id="status-seguranca-mini">Critério atendido</small></div>
                        </div>
                        <div class="bonus-rule-result combo-result"><span>Resultado do Combo</span><strong id="status-combo" class="bonus-status is-ok">✓ Combo ativado</strong></div>
                    </section>

                    <section class="finalizacao-card operational-card">
                        <div class="finalizacao-card-title"><span>04</span><div><strong>Registro Operacional</strong><small>Informação do serviço, sem bônus adicional</small></div></div>
                        <label class="field-title">As entregas foram concluídas?</label>
                        <div class="choice-group">
                            <label class="choice-card"><input type="radio" name="final_entregas" value="sim" checked> <span><strong>Sim</strong><small>Todas as entregas foram concluídas</small></span></label>
                            <label class="choice-card"><input type="radio" name="final_entregas" value="nao"> <span><strong>Não</strong><small>Houve pendência ou falha</small></span></label>
                        </div>
                        <div class="form-group deliveries-quantity-group">
                            <label for="final_quantidade_entregas">Quantidade de entregas realizadas</label>
                            <input type="number" id="final_quantidade_entregas" min="0" step="1" value="0" required inputmode="numeric" placeholder="Ex: 15">
                            <small class="field-help">Informe quantas entregas foram realizadas neste serviço.</small>
                        </div>
                        <div class="form-group occurrence-box" id="final_entregas_box" style="display:none;">
                            <label>Motivo da pendência</label>
                            <textarea id="final_entregas_descricao" rows="3" placeholder="Descreva quais entregas ficaram pendentes e o motivo..."></textarea>
                        </div>
                    </section>
                </div>

                <div class="finalizacao-footer">
                    <div class="bonus-live-total">
                        <span>Bonificação calculada</span>
                        <strong id="final_bonus_percentual">+0,6%</strong>
                    </div>
                    <div class="finalizacao-footer-copy"><strong>Pronto para encerrar?</strong><span>O valor final será calculado com comissão fixa de 2,5% + bonificação.</span></div>
                    <button type="submit" class="btn-primary">Finalizar Serviço</button>
                </div>
            </form>
        </div>
    `;
}

function registrarEventosFinalizacao(servicoId) {
    document.querySelectorAll('input[name="final_entregas"], input[name="final_reclamacao"], input[name="final_devolucao"], input[name="final_sinistro"]')
        .forEach(input => input.addEventListener('change', atualizarVisibilidadeFinalizacao));

    document.getElementById('btn-fechar-finalizacao')?.addEventListener('click', () => {
        document.getElementById('painel-finalizacao')?.remove();
    });

    document.getElementById('form-finalizacao')?.addEventListener('submit', e => finalizarServico(e, servicoId));
    const agora = new Date();
    const horaRetorno = document.getElementById('hora_retorno');
    if (horaRetorno) horaRetorno.value = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
    atualizarVisibilidadeFinalizacao();
}

async function finalizarServico(e, servicoId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = 'Finalizando...';

    const horaRetorno = document.getElementById('hora_retorno')?.value;
    const notasRetorno = Number.parseInt(document.getElementById('notas_retorno')?.value, 10);
    if (!horaRetorno) {
        window.mostrarToast('Informe o horário de retorno.', 'warning');
        btn.disabled = false;
        btn.innerText = 'Finalizar Serviço';
        document.getElementById('hora_retorno')?.focus();
        return;
    }
    if (!Number.isInteger(notasRetorno) || notasRetorno < 0) {
        window.mostrarToast('Informe uma quantidade válida de notas na chegada.', 'warning');
        btn.disabled = false;
        btn.innerText = 'Finalizar Serviço';
        document.getElementById('notas_retorno')?.focus();
        return;
    }

    const entregas = document.querySelector('input[name="final_entregas"]:checked').value;
    const reclamacao = document.querySelector('input[name="final_reclamacao"]:checked').value;
    const sinistro = document.querySelector('input[name="final_sinistro"]:checked').value;
    const devolucao = document.querySelector('input[name="final_devolucao"]:checked').value;
    const quantidadeEntregas = Number.parseInt(document.getElementById('final_quantidade_entregas')?.value, 10);
    if (!Number.isInteger(quantidadeEntregas) || quantidadeEntregas < 0) {
        window.mostrarToast('Informe uma quantidade válida de entregas.', 'warning');
        btn.disabled = false;
        btn.innerText = 'Finalizar Serviço';
        document.getElementById('final_quantidade_entregas')?.focus();
        return;
    }
    const entregasDescricao = document.getElementById('final_entregas_descricao').value.trim();
    const reclamacaoDescricao = document.getElementById('final_reclamacao_descricao').value.trim();
    const sinistroDescricao = document.getElementById('final_sinistro_descricao').value.trim();
    const devolucaoDescricao = document.getElementById('final_devolucao_descricao').value.trim();

    const { data: atual, error: fetchError } = await supabase
        .from('servicos')
        .select('id, agregado_id, valor_base, status, notas_saida')
        .eq('id', servicoId)
        .single();

    if (fetchError) {
        window.mostrarToast('Não foi possível carregar o serviço: ' + fetchError.message, 'error');
        btn.disabled = false;
        btn.innerText = 'Finalizar Serviço';
        return;
    }

    if (atual.status !== 'Em andamento') {
        window.mostrarToast('Este serviço não está mais em andamento.', 'warning');
        window.navegarPara('detalhe_servico', servicoId);
        return;
    }

    const calc = calcularBonificacao(parseFloat(atual.valor_base) || 0, reclamacao, devolucao, sinistro);
    const payload = {
        entregas_realizadas: entregas === 'sim',
        quantidade_entregas: quantidadeEntregas,
        houve_reclamacao: reclamacao === 'sim',
        entregas_descricao: entregas === 'nao' ? entregasDescricao : null,
        reclamacao_descricao: reclamacao === 'sim' ? reclamacaoDescricao : null,
        // Campo antigo mantido para compatibilidade; a nova regra usa o campo específico abaixo.
        devolucao_realizada: null,
        devolucao_causada_motorista: devolucao === 'sim',
        devolucao_descricao: devolucao === 'sim' ? devolucaoDescricao : null,
        percentual_comissao: calc.percentualComissao,
        valor_comissao: calc.valorComissao,
        bonus_percentual: calc.percentual,
        valor_bonus: calc.valorBonus,
        valor_final: calc.valorFinal,
        hora_retorno: horaRetorno,
        notas_retorno: notasRetorno,
        status: 'Finalizado'
    };

    const { error: updateError } = await supabase.from('servicos').update(payload).eq('id', servicoId).eq('status', 'Em andamento');
    if (updateError) {
        window.mostrarToast('Erro ao finalizar: ' + updateError.message, 'error');
        btn.disabled = false;
        btn.innerText = 'Finalizar Serviço';
        return;
    }

    if (sinistro === 'sim') {
        const { error: ocorrenciaError } = await supabase.from('ocorrencias').insert([{
            servico_id: servicoId,
            agregado_id: atual.agregado_id,
            tipo: 'Sinistro',
            descricao: sinistroDescricao,
            status: 'Aberta'
        }]);

        if (ocorrenciaError) {
            window.mostrarToast('Serviço finalizado, mas a ocorrência não pôde ser criada: ' + ocorrenciaError.message, 'warning');
            window.navegarPara('detalhe_servico', servicoId);
            return;
        }
    }

    window.mostrarToast('Serviço finalizado com sucesso.', 'success');
    window.navegarPara('detalhe_servico', servicoId);
}

// === TELA DE DETALHES ===
export async function renderizarDetalheServico(containerId, servicoId) {
    const container = document.getElementById(containerId);
    const { data: srv, error } = await supabase
        .from('servicos')
        .select('*, agregados(nome)')
        .eq('id', servicoId)
        .single();

    if (error) return container.innerHTML = `<div class="content-panel">Erro: ${error.message}</div>`;

    const isCancelado = srv.status === 'Cancelado';
    const isEmAndamento = srv.status === 'Em andamento';
    const statusClass = isCancelado ? 'badge-danger' : isEmAndamento ? 'badge-info' : 'badge-success';
    const totalPercentual = 2.5 + Number(srv.bonus_percentual || 0);

    window.cancelarServico = async function(id) {
        if (confirm('Confirmar cancelamento deste serviço?')) {
            const { error } = await supabase.from('servicos').update({ status: 'Cancelado' }).eq('id', id).eq('status', 'Em andamento');
            if (error) window.mostrarToast(error.message, 'error');
            else {
                window.mostrarToast('Serviço cancelado.', 'success');
                window.navegarPara('detalhe_servico', id);
            }
        }
    };

    window.excluirServico = async function(id) {
        const confirmar = confirm('Excluir este serviço permanentemente?\n\nEssa ação não pode ser desfeita. Se houver ocorrências vinculadas, elas também serão removidas.');
        if (!confirmar) return;
        const { error } = await supabase.from('servicos').delete().eq('id', id);
        if (error) {
            window.mostrarToast('Erro ao excluir serviço: ' + error.message, 'error');
            return;
        }
        window.mostrarToast('Serviço excluído com sucesso.', 'success');
        window.navegarPara('listagem');
    };

    window.editarServico = async function(id) {
        if (!ehGestor()) {
            window.mostrarToast('Seu usuário possui apenas permissão de visualização.', 'warning');
            return;
        }
        const atual = srv;
        const { data: agregados } = await supabase.from('agregados').select('id,nome').eq('status', true).order('nome');
        const options = (agregados || []).map(a => `<option value="${a.id}" ${a.id === atual.agregado_id ? 'selected' : ''}>${escHtml(a.nome)}</option>`).join('');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card service-edit-modal">
                <div class="modal-header">
                    <div><span class="eyebrow">SERVIÇO</span><h3>Editar serviço</h3></div>
                    <button type="button" class="modal-close" id="fechar-edicao">×</button>
                </div>
                <form id="form-edicao-servico">
                    <div class="grid-col-2">
                        <div class="form-group"><label>Data</label><input type="date" id="edit_data" value="${String(atual.data_servico || '').slice(0,10)}" required></div>
                        <div class="form-group"><label>Motorista</label><select id="edit_agregado" required>${options}</select></div>
                    </div>
                    <div class="form-group"><label>Descrição do serviço</label><input type="text" id="edit_descricao" value="${escAttr(atual.descricao)}" required></div>
                    <div class="grid-col-2">
                        <div class="form-group"><label>Origem</label><input type="text" id="edit_origem" value="${escAttr(atual.origem)}"></div>
                        <div class="form-group"><label>Destino</label><input type="text" id="edit_destino" value="${escAttr(atual.destino)}"></div>
                    </div>
                    <div class="grid-col-2">
                        <div class="form-group"><label>Horário de início</label><input type="time" id="edit_hora_inicio" value="${escAttr(String(atual.hora_inicio || '').slice(0,5))}" required></div>
                        <div class="form-group"><label>Horário de retorno</label><input type="time" id="edit_hora_retorno" value="${escAttr(String(atual.hora_retorno || '').slice(0,5))}" ${atual.status === 'Finalizado' ? 'required' : ''}></div>
                    </div>
                    <div class="grid-col-2">
                        <div class="form-group"><label>Notas na saída</label><input type="number" min="0" step="1" id="edit_notas_saida" value="${Number(atual.notas_saida || 0)}" required></div>
                        <div class="form-group"><label>Notas na chegada</label><input type="number" min="0" step="1" id="edit_notas_retorno" value="${Number(atual.notas_retorno || 0)}" ${atual.status === 'Finalizado' ? 'required' : ''}></div>
                    </div>
                    <div class="form-group"><label>Valor Base (R$)</label><input type="number" step="0.01" min="0" id="edit_valor" value="${Number(atual.valor_base || 0).toFixed(2)}" required></div>
                    ${atual.status === 'Finalizado' ? `<div class="form-group"><label>Quantidade de entregas realizadas</label><input type="number" min="0" step="1" id="edit_quantidade_entregas" value="${Number(atual.quantidade_entregas || 0)}" required></div>` : ''}
                    <div class="finance-preview-card"><span>Comissão fixa (2,5%)</span><strong id="edit_comissao_preview">${formatarMoeda(Number(atual.valor_base || 0) * 0.025)}</strong></div>
                    <div class="form-actions"><button type="button" class="btn-outline" id="cancelar-edicao">Cancelar</button><button class="btn-primary" type="submit">Salvar alterações</button></div>
                </form>
            </div>`;
        document.body.appendChild(modal);
        const fechar = () => modal.remove();
        modal.querySelector('#fechar-edicao').onclick = fechar;
        modal.querySelector('#cancelar-edicao').onclick = fechar;
        modal.addEventListener('click', e => { if (e.target === modal) fechar(); });
        modal.querySelector('#edit_valor').addEventListener('input', e => {
            modal.querySelector('#edit_comissao_preview').textContent = formatarMoeda(Number(e.target.value || 0) * 0.025);
        });
        modal.querySelector('#form-edicao-servico').addEventListener('submit', async e => {
            e.preventDefault();
            const btn = e.submitter;
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            const valorBase = Number(modal.querySelector('#edit_valor').value || 0);
            const update = {
                data_servico: modal.querySelector('#edit_data').value,
                agregado_id: modal.querySelector('#edit_agregado').value,
                hora_inicio: modal.querySelector('#edit_hora_inicio').value,
                hora_retorno: modal.querySelector('#edit_hora_retorno').value || null,
                notas_saida: Number.parseInt(modal.querySelector('#edit_notas_saida').value, 10),
                notas_retorno: Number.parseInt(modal.querySelector('#edit_notas_retorno').value, 10) || 0,
                descricao: modal.querySelector('#edit_descricao').value.trim(),
                origem: modal.querySelector('#edit_origem').value.trim(),
                destino: modal.querySelector('#edit_destino').value.trim(),
                valor_base: valorBase
            };
            if (atual.status === 'Finalizado') {
                const quantidade = Number.parseInt(modal.querySelector('#edit_quantidade_entregas')?.value, 10);
                if (!Number.isInteger(quantidade) || quantidade < 0) {
                    window.mostrarToast('Informe uma quantidade válida de entregas.', 'warning');
                    btn.disabled = false; btn.textContent = 'Salvar alterações';
                    return;
                }
                update.quantidade_entregas = quantidade;
            }
            if (atual.status === 'Finalizado') {
                update.valor_comissao = valorBase * 0.025;
                update.valor_bonus = valorBase * (Number(atual.bonus_percentual || 0) / 100);
                update.valor_final = update.valor_comissao + update.valor_bonus;
            }
            const { error } = await supabase.from('servicos').update(update).eq('id', id);
            if (error) {
                window.mostrarToast('Erro ao salvar alterações: ' + error.message, 'error');
                btn.disabled = false; btn.textContent = 'Salvar alterações';
                return;
            }
            window.mostrarToast('Serviço atualizado com sucesso.', 'success');
            fechar();
            window.navegarPara('detalhe_servico', id);
        });
    };

    const auditoriaHtml = !isEmAndamento ? `
        <div class="panel-header mt-4">Conclusão</div>
        <div class="rule-box ${srv.entregas_realizadas ? 'rule-pass' : 'rule-fail'}">${srv.entregas_realizadas ? 'Entregas concluídas' : 'Entregas pendentes/falhas'}</div>
        <div class="delivery-total-detail"><span>Entregas realizadas</span><strong>${Number(srv.quantidade_entregas || 0)}</strong></div>
        ${!srv.entregas_realizadas && srv.entregas_descricao ? `<div class="text-muted mb-4"><strong>Motivo da pendência:</strong><br>${escHtml(srv.entregas_descricao)}</div>` : ''}
        <div class="rule-box ${!srv.houve_reclamacao ? 'rule-pass' : 'rule-fail'}">${!srv.houve_reclamacao ? 'Sem reclamações' : 'Reclamação registrada'}</div>
        ${srv.houve_reclamacao && srv.reclamacao_descricao ? `<div class="text-muted mb-4"><strong>Descrição da reclamação:</strong><br>${escHtml(srv.reclamacao_descricao)}</div>` : ''}
        ${srv.devolucao_causada_motorista != null ? `<div class="rule-box ${srv.devolucao_causada_motorista ? 'rule-fail' : 'rule-pass'}">${srv.devolucao_causada_motorista ? 'Devolução causada por falha do motorista' : 'Sem devolução causada por falha do motorista'}</div>` : ''}
    ` : `<div class="pending-state"><span class="pending-state-icon">◷</span><div><strong>Serviço em andamento</strong><span>Os apontamentos de entrega, reclamação e sinistro serão registrados na finalização.</span></div></div>`;

    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <div class="detail-title-row">
                    <button onclick="window.navegarPara('listagem')" class="btn-outline">Voltar</button>
                    <div><span class="eyebrow">SERVIÇO</span><h2>${escHtml(srv.codigo_servico || 'SRV-PENDENTE')}</h2></div>
                    <span class="badge ${statusClass}">${escHtml(srv.status)}</span>
                </div>
            </div>
            <div class="detail-actions">
                ${ehGestor() ? `<button onclick="window.editarServico('${srv.id}')" class="btn-outline">Editar</button>` : ''}
                ${isEmAndamento ? `<button id="btn-abrir-finalizacao" class="btn-primary">Finalizar Serviço</button>` : ''}
                ${isEmAndamento ? `<button onclick="window.cancelarServico('${srv.id}')" class="btn-outline danger-button">Cancelar</button>` : ''}
                <button onclick="window.excluirServico('${srv.id}')" class="btn-outline danger-button">Excluir</button>
            </div>
        </div>
        <div class="grid-layout-2">
            <div class="content-panel">
                <div class="panel-header">Detalhes do Serviço</div>
                <div class="grid-col-2 mb-4">
                    <div><span class="text-muted">Data:</span><br>${dataSomente(srv.data_servico)}</div>
                    <div><span class="text-muted">Motorista:</span><br><span class="link-code" onclick="window.navegarPara('perfil_agregado', '${srv.agregado_id}')">${escHtml(srv.agregados?.nome || '-')}</span></div>
                </div>
                <div class="grid-col-2 mb-4">
                    <div><span class="text-muted">Início do serviço:</span><br>${escHtml(String(srv.hora_inicio || '').slice(0,5) || '-')}</div>
                    <div><span class="text-muted">Retorno do motorista:</span><br>${escHtml(String(srv.hora_retorno || '').slice(0,5) || '-')}</div>
                </div>
                <div class="grid-col-2 mb-4">
                    <div><span class="text-muted">Notas na saída:</span><br>${Number(srv.notas_saida || 0)}</div>
                    <div><span class="text-muted">Notas na chegada:</span><br>${isEmAndamento ? '-' : Number(srv.notas_retorno || 0)}</div>
                </div>
                <div class="mb-4"><span class="text-muted">Descrição:</span><br>${escHtml(srv.descricao)}</div>
                <div class="mb-4"><span class="text-muted">Rota:</span><br>${escHtml(srv.origem || '-')} / ${escHtml(srv.destino || '-')}</div>
                ${auditoriaHtml}
            </div>
            <div class="summary-panel">
                <div class="summary-body">
                    <div class="panel-header" style="border:none; padding:0; margin-bottom:12px;">Composição financeira</div>
                    <div class="calc-row"><span>Valor base do serviço</span><span>${formatarMoeda(srv.valor_base)}</span></div>
                    <div class="calc-row text-muted"><span>Comissão fixa (2,5%)</span><span>${isEmAndamento ? 'A definir' : formatarMoeda(srv.valor_comissao)}</span></div>
                    <div class="calc-row text-muted"><span>Bônus operacional (${Number(srv.bonus_percentual || 0).toFixed(1).replace('.', ',')}%)</span><span>${isEmAndamento ? 'A definir' : formatarMoeda(srv.valor_bonus)}</span></div>
                </div>
                ${!isEmAndamento ? `<div class="total-bonus-row"><span>Comissão + Bônus operacional = ${totalPercentual.toFixed(1).replace('.', ',')}%</span></div>` : ''}
                <div class="summary-footer">
                    <span>Total a receber</span>
                    <strong class="${isCancelado ? 'text-muted' : isEmAndamento ? 'txt-warning' : 'txt-success'}">${isEmAndamento ? 'Pendente' : formatarMoeda(srv.valor_final)}</strong>
                </div>
            </div>
        </div>
    `;

    if (isEmAndamento) {
        document.getElementById('btn-abrir-finalizacao')?.addEventListener('click', () => {
            if (document.getElementById('painel-finalizacao')) return;
            container.insertAdjacentHTML('beforeend', montarPainelFinalizacao());
            document.getElementById('painel-finalizacao')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            registrarEventosFinalizacao(srv.id);
        });
    }
}

function escHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function escAttr(v) { return escHtml(v); }
