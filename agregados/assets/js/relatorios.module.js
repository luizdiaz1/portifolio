import { supabase } from './supabase.js';
import { formatarMoeda } from './calculadora.module.js';

const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const dataAtual = () => {
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
};

const primeiroDiaDoMes = (data = new Date()) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-01`;

const ultimoDiaDoMes = (data = new Date()) => {
    const ultimo = new Date(data.getFullYear(), data.getMonth() + 1, 0);
    return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`;
};

const dataFormatada = (data) => {
    if (!data) return '-';
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
};

const tituloDoPeriodo = (inicio, fim) =>
    inicio === fim ? dataFormatada(inicio) : `${dataFormatada(inicio)} a ${dataFormatada(fim)}`;

const percentual = (valor) => `${Number(valor || 0).toFixed(1).replace('.', ',')}%`;
const dataSomente = (v) => {
    const t = String(v || '').slice(0,10);
    const [a,m,d] = t.split('-');
    return a && m && d ? `${d}/${m}/${a}` : t || '-';
};
const taxa = (parte, total) => total ? `${Math.round((parte / total) * 100)}%` : '0%';

const quinzenaDoServico = (servico) => {
    const dia = Number(String(servico?.data_servico || '').slice(8, 10));
    return dia >= 16 ? 'segunda' : 'primeira';
};

const resumoFinanceiroQuinzena = (servicos, quinzena) => {
    const lista = servicos.filter(s => quinzenaDoServico(s) === quinzena && s.status === 'Finalizado');
    const valorServicos = lista.reduce((sum, s) => sum + Number(s.valor_base || 0), 0);
    const comissao = lista.reduce((sum, s) => sum + Number(s.valor_comissao ?? (Number(s.valor_base || 0) * 0.025)), 0);
    // Bonificação apurada nos serviços desta própria quinzena
    const bonusApurado = lista.reduce((sum, s) => sum + Number(s.valor_bonus || 0), 0);
    // A bonificação é paga somente na 2ª quinzena, mas ela acumula a
    // bonificação apurada na 1ª quinzena + a apurada na 2ª quinzena.
    // A 1ª quinzena paga apenas a comissão (bonificação = 0).
    let bonusPrimeira = 0;
    let bonusSegunda = 0;
    if (quinzena === 'segunda') {
        bonusSegunda = bonusApurado;
        bonusPrimeira = servicos
            .filter(s => quinzenaDoServico(s) === 'primeira' && s.status === 'Finalizado')
            .reduce((sum, s) => sum + Number(s.valor_bonus || 0), 0);
    }
    const bonus = bonusPrimeira + bonusSegunda;
    // A calculadora de salário considera como pagamento apenas a comissão
    // e a bonificação. O valor_base é o valor do serviço e serve como base
    // de cálculo; ele não é somado novamente ao que será pago ao agregado.
    const total = comissao + bonus;
    return { lista, valorServicos, comissao, bonus, bonusPrimeira, bonusSegunda, bonusApurado, total };
};

const minutosDoHorario = (valor) => {
    const texto = String(valor || '').slice(0, 5);
    const [h, m] = texto.split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? (h * 60 + m) : null;
};

const duracaoMinutos = (inicio, retorno) => {
    const a = minutosDoHorario(inicio);
    const b = minutosDoHorario(retorno);
    if (a === null || b === null) return null;
    let total = b - a;
    if (total < 0) total += 24 * 60;
    return total;
};

const formatarDuracao = (minutos) => {
    if (minutos === null || !Number.isFinite(minutos)) return '-';
    const h = Math.floor(minutos / 60);
    const m = Math.round(minutos % 60);
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
};

export function renderizarRelatorios(containerId) {
    const container = document.getElementById(containerId);

    container.innerHTML = `
        <div class="report-page-header">
            <div class="report-page-title">
                <span class="report-page-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19V5"/><path d="M4 19h17"/><path d="m7 15 3.2-3.2 2.5 2.1L19 7.5"/><path d="M16 7.5H19V10.5"/>
                    </svg>
                </span>
                <div>
                    <h2>Relatórios</h2>
                    <p>Acompanhe o desempenho dos agregados e motoristas em períodos específicos.</p>
                </div>
            </div>
            <div class="report-brand-mark" aria-label="Exemplo Agregados">
                <span class="report-brand-symbol">//</span>
                <span><strong>EXEMPLO</strong><small>AGREGADOS</small></span>
            </div>
        </div>

        <div class="content-panel monthly-report-filter">
            <div class="monthly-report-filter-info">
                <span class="report-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16h6"/>
                    </svg>
                </span>
                <div>
                    <strong>Relatório por período</strong>
                    <span>Selecione um intervalo para visualizar serviços, entregas, comissões e indicadores.</span>
                </div>
            </div>
            <div class="monthly-report-actions">
                <div class="form-group monthly-driver-picker">
                    <label>Motorista</label>
                    <select id="relatorio_motorista"><option value="">Todos os motoristas</option></select>
                </div>
                <div class="form-group report-date-picker">
                    <label class="report-section-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg> Período</label>
                    <div class="report-date-fields">
                        <div class="report-date-field">
                            <span>De</span>
                            <input type="date" id="relatorio_data_inicio" value="${dataAtual()}">
                        </div>
                        <div class="report-date-separator">até</div>
                        <div class="report-date-field">
                            <span>Até</span>
                            <input type="date" id="relatorio_data_fim" value="${dataAtual()}">
                        </div>
                    </div>
                    <div class="report-period-presets">
                        <button type="button" class="report-period-btn" data-periodo="hoje">Hoje</button>
                        <button type="button" class="report-period-btn" data-periodo="1-15">1–15</button>
                        <button type="button" class="report-period-btn" data-periodo="16-fim">16–fim do mês</button>
                        <button type="button" class="report-period-btn" data-periodo="mes">Mês inteiro</button>
                    </div>
                </div>
                <button id="btn_gerar_relatorio" class="btn-primary">Gerar relatório</button>
            </div>
        </div>

        <div id="resultado_relatorio">
            <div class="content-panel report-empty-state">
                <strong>Selecione o período e gere o relatório.</strong>
                <span>Você verá o resumo financeiro, os indicadores de performance e o ranking dos motoristas.</span>
            </div>
        </div>
    `;

    document.getElementById('btn_gerar_relatorio').addEventListener('click', gerarRelatorio);
    carregarMotoristasRelatorio();
    document.querySelectorAll('.report-period-btn').forEach(btn => {
        btn.addEventListener('click', () => aplicarPeriodo(btn.dataset.periodo));
    });
}

async function carregarMotoristasRelatorio() {
    const select = document.getElementById('relatorio_motorista');
    if (!select) return;
    const { data, error } = await supabase.from('agregados').select('id,nome').order('nome');
    if (error) {
        console.error('Erro ao carregar motoristas:', error);
        return;
    }
    select.innerHTML = '<option value="">Todos os motoristas</option>' +
        (data || []).map(a => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join('');
}

function aplicarPeriodo(periodo) {
    const inicio = document.getElementById('relatorio_data_inicio');
    const fim = document.getElementById('relatorio_data_fim');
    if (!inicio || !fim) return;

    const hoje = new Date();
    const hojeIso = dataAtual();

    if (periodo === 'hoje') {
        inicio.value = hojeIso;
        fim.value = hojeIso;
    } else if (periodo === '1-15') {
        inicio.value = primeiroDiaDoMes(hoje);
        fim.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-15`;
    } else if (periodo === '16-fim') {
        inicio.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-16`;
        fim.value = ultimoDiaDoMes(hoje);
    } else if (periodo === 'mes') {
        inicio.value = primeiroDiaDoMes(hoje);
        fim.value = ultimoDiaDoMes(hoje);
    }
}

async function gerarRelatorio() {
    const inicio = document.getElementById('relatorio_data_inicio')?.value;
    const fim = document.getElementById('relatorio_data_fim')?.value;
    const divResult = document.getElementById('resultado_relatorio');
    const btn = document.getElementById('btn_gerar_relatorio');

    if (!inicio || !fim) {
        window.mostrarToast('Informe a data inicial e a data final.', 'warning');
        return;
    }

    if (inicio > fim) {
        window.mostrarToast('A data inicial não pode ser posterior à data final.', 'warning');
        return;
    }

    const periodoTitulo = tituloDoPeriodo(inicio, fim);
    const motoristaId = document.getElementById('relatorio_motorista')?.value || '';
    const motoristaNome = document.getElementById('relatorio_motorista')?.selectedOptions?.[0]?.textContent || 'Todos os motoristas';
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    divResult.innerHTML = '<div class="content-panel report-loading">Processando o relatório do período...</div>';

    let query = supabase
        .from('servicos')
        .select('*, agregados(nome)')
        .gte('data_servico', inicio)
        .lte('data_servico', fim)
        .neq('status', 'Cancelado')
        .order('data_servico', { ascending: true });
    if (motoristaId) query = query.eq('agregado_id', motoristaId);
    const { data, error } = await query;

    btn.disabled = false;
    btn.textContent = 'Gerar relatório';

    if (error) {
        divResult.innerHTML = '<div class="content-panel">Não foi possível gerar o relatório.</div>';
        window.mostrarToast(error.message, 'error');
        return;
    }

    const servicos = data || [];
    const finalizados = servicos.filter(s => s.status === 'Finalizado');
    const andamento = servicos.filter(s => s.status === 'Em andamento');

    if (servicos.length === 0) {
        divResult.innerHTML = `
            <div class="content-panel report-empty-state">
                <strong>Nenhum serviço encontrado em ${esc(periodoTitulo)} · ${esc(motoristaNome)}.</strong>
                <span>Não há serviços ativos ou finalizados dentro do período selecionado.</span>
            </div>`;
        return;
    }

    const totalBase = finalizados.reduce((sum, s) => sum + Number(s.valor_base || 0), 0);
    const totalComissao = finalizados.reduce((sum, s) => sum + Number(s.valor_comissao || 0), 0);
    const totalBonus = finalizados.reduce((sum, s) => sum + Number(s.valor_bonus || 0), 0);
    const totalFinal = finalizados.reduce((sum, s) => sum + Number(s.valor_final || 0), 0);
    const primeiraQuinzena = resumoFinanceiroQuinzena(finalizados, 'primeira');
    const segundaQuinzena = resumoFinanceiroQuinzena(finalizados, 'segunda');
    const totalAPagarPeriodo = primeiraQuinzena.total + segundaQuinzena.total;
    const totalEntregas = finalizados.reduce((sum, s) => sum + Number(s.quantidade_entregas || 0), 0);
    const mediaEntregas = finalizados.length ? totalEntregas / finalizados.length : 0;
    const duracoes = finalizados.map(s => duracaoMinutos(s.hora_inicio, s.hora_retorno)).filter(v => v !== null);
    const mediaDuracao = duracoes.length ? duracoes.reduce((sum, v) => sum + v, 0) / duracoes.length : null;
    const menorDuracao = duracoes.length ? Math.min(...duracoes) : null;
    const maiorDuracao = duracoes.length ? Math.max(...duracoes) : null;
    const mediaBonus = finalizados.length ? finalizados.reduce((sum, s) => sum + Number(s.bonus_percentual || 0), 0) / finalizados.length : 0;
    const maxBonus = finalizados.filter(s => Number(s.bonus_percentual || 0) >= 0.6).length;
    const excelencia = finalizados.filter(s => {
        const reclamacaoOk = s.houve_reclamacao === false || s.houve_reclamacao === 'nao';
        const devolucaoOk = s.devolucao_causada_motorista === false || s.devolucao_causada_motorista === 'nao';
        return reclamacaoOk && devolucaoOk;
    }).length;
    const seguranca = finalizados.filter(s => s.houve_sinistro === false || s.houve_sinistro === 'nao').length;

    const distribuicao = {
        '0': finalizados.filter(s => Number(s.bonus_percentual || 0) === 0).length,
        '0.2': finalizados.filter(s => Number(s.bonus_percentual || 0) === 0.2).length,
        '0.4': finalizados.filter(s => Number(s.bonus_percentual || 0) === 0.4).length,
        '0.6': finalizados.filter(s => Number(s.bonus_percentual || 0) === 0.6).length
    };

    const motoristas = {};
    finalizados.forEach(s => {
        const id = s.agregado_id || `sem-id-${s.id}`;
        if (!motoristas[id]) {
            motoristas[id] = {
                nome: s.agregados?.nome || 'Motorista não identificado',
                servicos: 0,
                base: 0,
                comissao: 0,
                bonus: 0,
                final: 0,
                bonusSoma: 0,
                entregas: 0,
                bonusMaximo: 0,
                excelencia: 0,
                seguranca: 0
            };
        }
        const m = motoristas[id];
        m.servicos++;
        m.base += Number(s.valor_base || 0);
        m.comissao += Number(s.valor_comissao || 0);
        m.bonus += Number(s.valor_bonus || 0);
        m.final += Number(s.valor_final || 0);
        m.entregas += Number(s.quantidade_entregas || 0);
        m.bonusSoma += Number(s.bonus_percentual || 0);
        if (Number(s.bonus_percentual || 0) >= 0.6) m.bonusMaximo++;
        if ((s.houve_reclamacao === false || s.houve_reclamacao === 'nao') && (s.devolucao_causada_motorista === false || s.devolucao_causada_motorista === 'nao')) m.excelencia++;
        if (s.houve_sinistro === false || s.houve_sinistro === 'nao') m.seguranca++;
    });

    const ranking = Object.values(motoristas).sort((a, b) => {
        const mediaA = a.servicos ? a.bonusSoma / a.servicos : 0;
        const mediaB = b.servicos ? b.bonusSoma / b.servicos : 0;
        return mediaB - mediaA || b.servicos - a.servicos || a.nome.localeCompare(b.nome);
    });

    const linhasMotoristas = ranking.map((m, index) => {
        const media = m.servicos ? m.bonusSoma / m.servicos : 0;
        return `
            <tr>
                <td><span class="ranking-position">${index + 1}</span></td>
                <td><strong>${esc(m.nome)}</strong></td>
                <td>${m.servicos}</td>
                <td>${m.entregas}</td>
                <td>${formatarMoeda(m.base)}</td>
                <td>${formatarMoeda(m.bonus)}</td>
                <td><span class="badge ${media >= 0.6 ? 'badge-success' : media >= 0.4 ? 'badge-warning' : 'badge-info'}">${percentual(media)}</span></td>
                <td>${taxa(m.bonusMaximo, m.servicos)}</td>
                <td>${formatarMoeda(m.final)}</td>
            </tr>`;
    }).join('');

    const linhasServicos = finalizados.map(s => `
        <tr>
            <td>${esc(s.codigo_servico || 'S/ COD')}</td>
            <td>${dataSomente(s.data_servico)}</td>
            <td>${esc(s.agregados?.nome || 'Não identificado')}</td>
            <td>${esc(String(s.hora_inicio || '').slice(0,5) || '-')}</td>
            <td>${esc(String(s.hora_retorno || '').slice(0,5) || '-')}</td>
            <td>${formatarDuracao(duracaoMinutos(s.hora_inicio, s.hora_retorno))}</td>
            <td>${Number(s.notas_saida || 0)}</td>
            <td>${Number(s.notas_retorno || 0)}</td>
            <td>${Number(s.quantidade_entregas || 0)}</td>
            <td>${formatarMoeda(s.valor_base)}</td>
            <td><span class="badge ${Number(s.bonus_percentual || 0) >= 0.6 ? 'badge-success' : 'badge-warning'}">${percentual(s.bonus_percentual)}</span></td>
            <td>${formatarMoeda(s.valor_final)}</td>
        </tr>`).join('');

    divResult.innerHTML = `
        <div class="monthly-report" id="relatorio-mensal">
            <div class="print-report-header">
                <div class="print-brand">
                    <span class="print-brand-symbol">//</span>
                    <div><strong>EXEMPLO</strong><small>AGREGADOS</small></div>
                </div>
                <div class="print-report-meta">
                    <span>RELATÓRIO DE DESEMPENHO</span>
                    <strong>${esc(periodoTitulo)}</strong>
                    <small>${esc(motoristaNome)}</small>
                </div>
            </div>
            <div class="report-heading">
                <div>
                    <span class="eyebrow">RELATÓRIO DO PERÍODO</span>
                    <h3>Performance — ${esc(periodoTitulo)} · ${esc(motoristaNome)}</h3>
                    <p>Serviços finalizados no período de ${dataFormatada(inicio)} a ${dataFormatada(fim)}.</p>
                </div>
                <div class="report-heading-actions">
                    <button class="btn-outline" id="btn_imprimir_relatorio">Imprimir / PDF</button>
                    <button class="btn-outline" id="btn_exportar_csv">Exportar CSV</button>
                </div>
            </div>

            <div class="grid-col-4 report-kpis report-kpis-deliveries">
                <div class="kpi-card"><span class="kpi-title">Serviços finalizados</span><span class="kpi-value">${finalizados.length}</span><span class="kpi-subtitle">${andamento.length} em andamento</span></div>
                <div class="kpi-card"><span class="kpi-title">Entregas realizadas</span><span class="kpi-value">${totalEntregas}</span><span class="kpi-subtitle">Média de ${mediaEntregas.toFixed(1).replace('.', ',')} por serviço</span></div>
                <div class="kpi-card kpi-card-duration"><span class="kpi-title">Tempo médio de entrega</span><span class="kpi-value">${formatarDuracao(mediaDuracao)}</span><span class="kpi-subtitle">${duracoes.length} serviço${duracoes.length === 1 ? '' : 's'} com horários válidos</span></div>
                <div class="kpi-card"><span class="kpi-title">Valor base</span><span class="kpi-value">${formatarMoeda(totalBase)}</span></div>
                <div class="kpi-card"><span class="kpi-title">Bonificações</span><span class="kpi-value txt-warning">${formatarMoeda(totalBonus)}</span><span class="kpi-subtitle">Média de ${percentual(mediaBonus)} por serviço</span></div>
                <div class="kpi-card"><span class="kpi-title">Total a pagar no período</span><span class="kpi-value txt-success">${formatarMoeda(totalAPagarPeriodo)}</span><span class="kpi-subtitle">Comissão de 2,5% + bonificação (1ª e 2ª quinzena) paga na 2ª quinzena</span></div>
            </div>

            <div class="panel-header mt-4">Fechamento financeiro</div>
            <div class="report-payment-grid">
                ${primeiraQuinzena.lista.length ? `
                    <div class="content-panel report-payment-card first">
                        <div class="report-payment-card-header">
                            <div><span class="eyebrow">01 A 15</span><strong>1ª quinzena</strong><small>Pagamento normal; a bonificação desta quinzena é paga na 2ª.</small></div>
                            <span class="report-payment-tag">2,5%</span>
                        </div>
                        <div class="report-payment-lines">
                            <div><span>Valor dos serviços</span><strong>${formatarMoeda(primeiraQuinzena.valorServicos)}</strong></div>
                            <div><span>Comissão fixa (2,5%)</span><strong>${formatarMoeda(primeiraQuinzena.comissao)}</strong></div>
                            <div class="report-payment-total"><span>Valor total a pagar</span><strong>${formatarMoeda(primeiraQuinzena.total)}</strong></div>
                        </div>
                        <p>O valor base dos serviços é usado somente para calcular a comissão. O pagamento da 1ª quinzena é exclusivamente a comissão fixa de 2,5%; a bonificação apurada nesta quinzena não entra neste pagamento e é somada à bonificação da 2ª quinzena.</p>
                    </div>` : ''}
                ${segundaQuinzena.lista.length || segundaQuinzena.bonusPrimeira > 0 ? `
                    <div class="content-panel report-payment-card second">
                        <div class="report-payment-card-header">
                            <div><span class="eyebrow">16 A FIM DO MÊS</span><strong>2ª quinzena</strong><small>Pagamento com bonificação operacional apurada.</small></div>
                            <span class="report-payment-tag">+0,6%</span>
                        </div>
                        <div class="report-payment-lines">
                            <div><span>Valor dos serviços</span><strong>${formatarMoeda(segundaQuinzena.valorServicos)}</strong></div>
                            <div><span>Comissão fixa (2,5%)</span><strong>${formatarMoeda(segundaQuinzena.comissao)}</strong></div>
                            <div><span>Bonificação operacional — 1ª quinzena</span><strong>${formatarMoeda(segundaQuinzena.bonusPrimeira)}</strong></div>
                            <div><span>Bonificação operacional — 2ª quinzena</span><strong>${formatarMoeda(segundaQuinzena.bonusSegunda)}</strong></div>
                            <div><span>Bonificação operacional total (1ª + 2ª quinzena, até 0,6%)</span><strong>${formatarMoeda(segundaQuinzena.bonus)}</strong></div>
                            <div class="report-payment-total"><span>Valor total</span><strong>${formatarMoeda(segundaQuinzena.total)}</strong></div>
                        </div>
                        <p>O valor base dos serviços é usado para calcular a comissão. O pagamento da 2ª quinzena é a comissão fixa de 2,5% + a bonificação operacional total do mês, referente à 1ª e à 2ª quinzena. A bonificação da 1ª quinzena não entra no pagamento da 1ª quinzena; ela é paga somente junto com a 2ª.</p>
                    </div>` : ''}
                ${!primeiraQuinzena.lista.length && !segundaQuinzena.lista.length ? `
                    <div class="content-panel report-payment-empty">Nenhum serviço finalizado no período para calcular o fechamento financeiro.</div>` : ''}
            </div>
            <div class="report-payment-total-period">
                <div><span>Total a pagar no período selecionado</span><small>Pagamento ao agregado: comissão de 2,5% + bonificação total do período (1ª e 2ª quinzena), paga na 2ª quinzena. O valor base dos serviços é apenas a base de cálculo.</small></div>
                <strong>${formatarMoeda(totalAPagarPeriodo)}</strong>
            </div>

            <div class="panel-header mt-4">Indicadores de performance</div>
            <div class="grid-col-4 report-indicators">
                <div class="content-panel report-indicator"><span>Excelência Operacional</span><strong>${taxa(excelencia, finalizados.length)}</strong><small>${excelencia} de ${finalizados.length} serviços</small></div>
                <div class="content-panel report-indicator"><span>Segurança Total</span><strong>${taxa(seguranca, finalizados.length)}</strong><small>${seguranca} de ${finalizados.length} serviços</small></div>
                <div class="content-panel report-indicator"><span>Bônus máximo</span><strong>${taxa(maxBonus, finalizados.length)}</strong><small>${maxBonus} serviços com +0,6%</small></div>
                <div class="content-panel report-indicator"><span>Ticket médio</span><strong>${formatarMoeda(finalizados.length ? totalFinal / finalizados.length : 0)}</strong><small>Valor final por serviço</small></div>
                <div class="content-panel report-indicator"><span>Menor tempo</span><strong>${formatarDuracao(menorDuracao)}</strong><small>Menor duração registrada</small></div>
                <div class="content-panel report-indicator"><span>Maior tempo</span><strong>${formatarDuracao(maiorDuracao)}</strong><small>Maior duração registrada</small></div>
                <div class="content-panel report-indicator"><span>Horários considerados</span><strong>${duracoes.length}</strong><small>Serviços com início e retorno</small></div>
            </div>

            <div class="panel-header mt-4">Distribuição da bonificação</div>
            <div class="bonus-distribution-grid">
                <div class="bonus-distribution-item"><span>0%</span><strong>${distribuicao['0']}</strong><small>serviços</small></div>
                <div class="bonus-distribution-item"><span>+0,2%</span><strong>${distribuicao['0.2']}</strong><small>serviços</small></div>
                <div class="bonus-distribution-item"><span>+0,4%</span><strong>${distribuicao['0.4']}</strong><small>serviços</small></div>
                <div class="bonus-distribution-item is-highlight"><span>+0,6%</span><strong>${distribuicao['0.6']}</strong><small>serviços</small></div>
            </div>

            <div class="panel-header mt-4">Performance por motorista</div>
            <div class="content-panel table-container report-table-wrap">
                <table class="report-table">
                    <thead>
                        <tr>
                            <th>#</th><th>Motorista</th><th>Serviços</th><th>Entregas</th><th>Valor base</th><th>Bônus</th><th>Média bônus</th><th>Bônus máximo</th><th>Valor final</th>
                        </tr>
                    </thead>
                    <tbody>${linhasMotoristas || '<tr><td colspan="9">Nenhum motorista com serviço finalizado no período.</td></tr>'}</tbody>
                </table>
            </div>

            <div class="panel-header mt-4">Serviços do período</div>
            <div class="content-panel table-container report-table-wrap">
                <table class="report-table">
                    <thead><tr><th>Código</th><th>Data</th><th>Motorista</th><th>Início</th><th>Retorno</th><th>Duração</th><th>Notas saída</th><th>Notas chegada</th><th>Entregas</th><th>Valor dos serviços</th><th>Bonificação</th><th>Comissão + bônus</th></tr></thead>
                    <tbody>${linhasServicos || '<tr><td colspan="12">Nenhum serviço finalizado no período.</td></tr>'}</tbody>
                </table>
            </div>

            <div class="report-footer-note">
                <strong>Fechamento:</strong> ${finalizados.length} serviços finalizados, ${totalEntregas} entregas realizadas, ${andamento.length} em andamento, tempo médio de ${formatarDuracao(mediaDuracao)} e ${formatarMoeda(totalAPagarPeriodo)} no total a pagar do período. Serviços em andamento não entram no fechamento.
            </div>
        </div>
    `;

    document.getElementById('btn_imprimir_relatorio')?.addEventListener('click', imprimirRelatorio);
    document.getElementById('btn_exportar_csv')?.addEventListener('click', () => exportarCsv(ranking, periodoTitulo));
    window.mostrarToast('Relatório do período gerado!', 'success');
}

function imprimirRelatorio() {
    window.print();
}

function exportarCsv(ranking, periodoTitulo) {
    const cabecalho = ['Posição', 'Motorista', 'Serviços', 'Entregas', 'Valor Base', 'Bônus', 'Média Bônus', 'Bônus Máximo', 'Valor Final'];
    const linhas = ranking.map((m, index) => [
        index + 1,
        m.nome,
        m.servicos,
        m.entregas,
        m.base.toFixed(2),
        m.bonus.toFixed(2),
        (m.servicos ? m.bonusSoma / m.servicos : 0).toFixed(1),
        m.servicos ? ((m.bonusMaximo / m.servicos) * 100).toFixed(0) + '%' : '0%',
        m.final.toFixed(2)
    ]);
    const csv = [cabecalho, ...linhas]
        .map(linha => linha.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
        .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-motoristas-${periodoTitulo.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    window.mostrarToast('CSV exportado!', 'success');
}
