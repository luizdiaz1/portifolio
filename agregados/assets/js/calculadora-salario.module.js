import { supabase } from './supabase.js';
import { formatarMoeda } from './calculadora.module.js';

const COMISSAO = 2.5;

function moeda(v) { return formatarMoeda(Number(v || 0)); }
function pct(v) { return `${Number(v || 0).toFixed(1).replace('.', ',')}%`; }
function dataBR(v) {
    const t = String(v || '').slice(0, 10);
    const [a, m, d] = t.split('-');
    return a && m && d ? `${d}/${m}/${a}` : '-';
}
function escapeHtml(v) {
    return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function obterMesAtual() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function limitesDoMes(mes) {
    const [ano, numeroMes] = mes.split('-').map(Number);
    const ultimoDia = new Date(ano, numeroMes, 0).getDate();
    return {
        inicio: `${mes}-01`,
        meio: `${mes}-15`,
        inicioSegunda: `${mes}-16`,
        fim: `${mes}-${String(ultimoDia).padStart(2, '0')}`
    };
}

function criarResumo(servicos) {
    const validos = (servicos || []).filter(s => s.status !== 'Cancelado');
    const primeira = validos.filter(s => String(s.data_servico).slice(0, 10).slice(8, 10) <= '15');
    const segunda = validos.filter(s => String(s.data_servico).slice(0, 10).slice(8, 10) >= '16');

    const bonusFinalizados = (lista) => lista
        .filter(x => x.status === 'Finalizado')
        .reduce((s, x) => s + Number(x.valor_bonus || 0), 0);
    // Sem finalização, o sistema não sabe se os critérios serão atendidos.
    // Mostramos apenas a projeção máxima (0,6%) para facilitar a conferência.
    const bonusEmAndamento = (lista) => lista
        .filter(x => x.status === 'Em andamento')
        .reduce((s, x) => s + Number(x.valor_base || 0) * (0.6 / 100), 0);

    const bonusPrimeira = bonusFinalizados(primeira);
    const bonusSegunda = bonusFinalizados(segunda);
    const pendentePrimeira = bonusEmAndamento(primeira);
    const pendenteSegunda = bonusEmAndamento(segunda);

    const calcular = (lista, primeiraQuinzena) => {
        const base = lista.reduce((s, x) => s + Number(x.valor_base || 0), 0);
        const comissao = base * (COMISSAO / 100);
        const finalizados = lista.filter(x => x.status === 'Finalizado');
        const andamento = lista.filter(x => x.status === 'Em andamento');
        // A bonificação é paga somente na 2ª quinzena, mas acumula a
        // bonificação apurada na 1ª + a apurada na 2ª quinzena.
        // A 1ª quinzena paga apenas a comissão.
        const bonusApurado = primeiraQuinzena ? 0 : bonusPrimeira + bonusSegunda;
        const bonusPendente = primeiraQuinzena ? 0 : pendentePrimeira + pendenteSegunda;
        return {
            lista,
            base,
            comissao,
            bonusPrimeira,
            bonusSegunda,
            // Bonificação apurada nos serviços desta própria quinzena
            bonusDaQuinzena: primeiraQuinzena ? bonusPrimeira : bonusSegunda,
            bonusApurado,
            bonusPendente,
            total: comissao + bonusApurado,
            finalizados: finalizados.length,
            andamento: andamento.length
        };
    };

    return {
        primeira: calcular(primeira, true),
        segunda: calcular(segunda, false),
        totalServicos: validos.length
    };
}

export async function renderizarCalculadoraSalario(containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <span class="eyebrow">FINANCEIRO</span>
                <h2>Calculadora de salário</h2>
                <p class="header-description">Confira quanto pagar em cada quinzena e separe a bonificação corretamente.</p>
            </div>
        </div>

        <div class="content-panel salary-calculator-controls">
            <div class="panel-header">Período de pagamento</div>
            <div class="grid-col-2">
                <div class="form-group">
                    <label>Mês de referência</label>
                    <input type="month" id="calc_salario_mes" value="${obterMesAtual()}">
                </div>
                <div class="form-group">
                    <label>Motorista</label>
                    <select id="calc_salario_motorista"><option value="">Todos os motoristas</option></select>
                </div>
            </div>
            <div class="calculator-rule-note">
                <strong>Regra da quinzena</strong>
                <span><b>01 a 15:</b> pagamento só da comissão de 2,5% (a bonificação apurada nesta quinzena é paga na 2ª). &nbsp; <b>16 ao fim do mês:</b> comissão de 2,5% + bonificação total do mês, referente à 1ª e à 2ª quinzena.</span>
            </div>
            <div class="form-actions">
                <button type="button" class="btn-primary" id="btn_calcular_salario">Calcular pagamento</button>
            </div>
        </div>

        <div id="resultado-calculadora-salario"></div>
    `;

    await carregarMotoristas();
    document.getElementById('btn_calcular_salario').addEventListener('click', calcularPagamento);
    calcularPagamento();
}

async function carregarMotoristas() {
    const select = document.getElementById('calc_salario_motorista');
    const { data, error } = await supabase.from('agregados').select('id,nome').order('nome');
    if (error) {
        window.mostrarToast('Erro ao carregar motoristas: ' + error.message, 'error');
        return;
    }
    select.innerHTML = '<option value="">Todos os motoristas</option>' +
        (data || []).map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join('');
}

async function calcularPagamento() {
    const box = document.getElementById('resultado-calculadora-salario');
    const mes = document.getElementById('calc_salario_mes')?.value;
    const agregadoId = document.getElementById('calc_salario_motorista')?.value;
    if (!mes) return;

    const limites = limitesDoMes(mes);
    box.innerHTML = '<div class="content-panel calculator-loading">Calculando pagamento...</div>';

    let query = supabase
        .from('servicos')
        .select('id,codigo_servico,data_servico,descricao,agregado_id,valor_base,valor_comissao,bonus_percentual,valor_bonus,valor_final,status,agregados(nome)')
        .gte('data_servico', limites.inicio)
        .lte('data_servico', limites.fim)
        .neq('status', 'Cancelado')
        .order('data_servico', { ascending: true });

    if (agregadoId) query = query.eq('agregado_id', agregadoId);

    const { data, error } = await query;
    if (error) {
        box.innerHTML = `<div class="content-panel"><div class="empty-state">Erro ao calcular: ${escapeHtml(error.message)}</div></div>`;
        return;
    }

    const resumo = criarResumo(data || []);
    const nomeSelecionado = agregadoId ? (data?.[0]?.agregados?.nome || 'Motorista selecionado') : 'Todos os motoristas';
    const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${mes}-01T12:00:00`));
    const totalMes = resumo.primeira.total + resumo.segunda.total;

    box.innerHTML = `
        <div class="salary-period-heading">
            <div><span class="eyebrow">FECHAMENTO</span><h3>${nomeSelecionado}</h3><span>${nomeMes}</span></div>
            <div class="salary-period-total"><small>Total previsto no mês</small><strong>${moeda(totalMes)}</strong></div>
        </div>

        <div class="salary-quinzena-grid">
            ${montarCardQuinzena('1ª quinzena', '01 a 15', resumo.primeira, true)}
            ${montarCardQuinzena('2ª quinzena', '16 ao fim do mês', resumo.segunda, false)}
        </div>

        <div class="content-panel salary-summary-panel">
            <div class="panel-header">Fechamento da quinzena</div>
            <div class="salary-summary-grid">
                <div><span>1ª quinzena — pagar</span><strong>${moeda(resumo.primeira.total)}</strong><small>Somente comissão de 2,5%</small></div>
                <div><span>2ª quinzena — pagar</span><strong>${moeda(resumo.segunda.total)}</strong><small>Comissão + bônus apurado (1ª e 2ª quinzena)</small></div>
                <div class="salary-summary-highlight"><span>Total do mês</span><strong>${moeda(totalMes)}</strong><small>Sem considerar bônus ainda pendente</small></div>
            </div>
            ${resumo.segunda.bonusPendente > 0 ? `
                <div class="salary-pending-bonus">
                    <strong>Bonificação ainda não apurada</strong>
                    <span>${moeda(resumo.segunda.bonusPendente)} é a projeção máxima de bônus (0,6%) para serviços ainda em andamento (1ª e 2ª quinzena). Esse valor <b>não está incluído</b> no total a pagar.</span>
                </div>` : ''}
        </div>

        ${montarTabelaServicos(resumo.primeira.lista, resumo.segunda.lista)}
    `;
}

function montarCardQuinzena(titulo, periodo, r, primeira) {
    return `
        <div class="content-panel salary-quinzena-card ${primeira ? 'first' : 'second'}">
            <div class="salary-card-header">
                <div><span class="eyebrow">${primeira ? 'PAGAMENTO NORMAL' : 'PAGAMENTO + BONIFICAÇÃO (1ª + 2ª)'}</span><h3>${titulo}</h3><small>${periodo}</small></div>
                <span class="salary-card-badge">${r.lista.length} serviço${r.lista.length === 1 ? '' : 's'}</span>
            </div>
            <div class="salary-lines">
                <div><span>Valor base dos serviços</span><strong>${moeda(r.base)}</strong></div>
                <div><span>Comissão fixa (2,5%)</span><strong>${moeda(r.comissao)}</strong></div>
                ${primeira ? `
                <div><span>Bonificação apurada (paga na 2ª quinzena)</span><strong>${moeda(r.bonusDaQuinzena)}</strong></div>` : `
                <div><span>Bonificação — 1ª quinzena</span><strong>${moeda(r.bonusPrimeira)}</strong></div>
                <div><span>Bonificação — 2ª quinzena</span><strong>${moeda(r.bonusSegunda)}</strong></div>
                <div><span>Bonificação total (1ª + 2ª quinzena)</span><strong>${moeda(r.bonusApurado)}</strong></div>`}
            </div>
            <div class="salary-card-footer">
                <span>${primeira ? 'Total a pagar' : 'Total a pagar agora'}</span>
                <strong>${moeda(r.total)}</strong>
            </div>
            <div class="salary-card-meta">
                <span>${r.finalizados} finalizado${r.finalizados === 1 ? '' : 's'}</span>
                ${r.andamento ? `<span>${r.andamento} em andamento</span>` : '<span>Sem pendências</span>'}
            </div>
        </div>
    `;
}

function montarTabelaServicos(primeira, segunda) {
    const lista = [...primeira.map(s => ({...s, quinzena: '1ª'})), ...segunda.map(s => ({...s, quinzena: '2ª'}))];
    if (!lista.length) return '<div class="content-panel empty-state">Nenhum serviço encontrado para o período selecionado.</div>';
    return `
        <div class="content-panel table-container salary-services-table">
            <div class="panel-header">Serviços considerados no cálculo</div>
            <table>
                <thead><tr><th>Data</th><th>Quinzena</th><th>Motorista</th><th>Serviço</th><th>Status</th><th>Base</th><th>Comissão</th><th>Bônus</th><th>A pagar</th></tr></thead>
                <tbody>
                    ${lista.map(s => {
                        const comissao = Number(s.valor_comissao ?? (Number(s.valor_base || 0) * 0.025));
                        const bonus = s.status === 'Finalizado' ? Number(s.valor_bonus || 0) : 0;
                        const pagar = comissao + (s.quinzena === '2ª' ? bonus : 0);
                        return `<tr>
                            <td>${dataBR(s.data_servico)}</td>
                            <td><span class="badge ${s.quinzena === '1ª' ? 'badge-info' : 'badge-success'}">${s.quinzena}</span></td>
                            <td>${escapeHtml(s.agregados?.nome || '-')}</td>
                            <td>${escapeHtml(s.codigo_servico || s.descricao || '-')}</td>
                            <td><span class="badge ${s.status === 'Finalizado' ? 'badge-success' : 'badge-info'}">${escapeHtml(s.status)}</span></td>
                            <td>${moeda(s.valor_base)}</td>
                            <td>${moeda(comissao)}</td>
                            <td>${s.status === 'Finalizado' ? moeda(bonus) + (s.quinzena === '1ª' ? ' <small class="text-muted">(paga na 2ª)</small>' : '') : '<span class="text-muted">A apurar</span>'}</td>
                            <td><strong>${moeda(pagar)}</strong></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}
