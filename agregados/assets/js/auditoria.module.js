import { supabase } from './supabase.js';
import { ehGestor } from './auth.js';

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const nomesTabelas = {
    servicos: 'Serviços',
    agregados: 'Motoristas',
    ciots: 'CIOTs',
    ocorrencias: 'Ocorrências',
    auditoria: 'Auditoria'
};

const nomesOperacoes = {
    INSERT: 'Criou',
    UPDATE: 'Alterou',
    DELETE: 'Excluiu',
    ALTERAR_SENHA: 'Alterou a senha'
};

function dataHora(v) {
    return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function valorResumo(a) {
    const dados = a.dados_novos || a.dados_anteriores || {};
    return dados.codigo_servico || dados.numero_ciot || dados.nome || dados.tipo || a.registro_id || '-';
}

export async function renderizarAuditoria(containerId) {
    const container = document.getElementById(containerId);
    if (!ehGestor()) {
        container.innerHTML = '<div class="content-panel text-danger">Acesso restrito a gestores.</div>';
        return;
    }

    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <span class="eyebrow">CONTROLE</span>
                <h2>Auditoria</h2>
                <p class="header-description">Veja quem realizou cada alteração no sistema.</p>
            </div>
        </div>
        <div class="filter-bar">
            <div class="form-group">
                <label>Operação</label>
                <select id="auditoria_operacao">
                    <option value="">Todas</option>
                    <option value="INSERT">Criações</option>
                    <option value="UPDATE">Alterações</option>
                    <option value="DELETE">Exclusões</option>
                    <option value="ALTERAR_SENHA">Alteração de senha</option>
                </select>
            </div>
            <div class="form-group">
                <label>Módulo</label>
                <select id="auditoria_tabela">
                    <option value="">Todos</option>
                    <option value="servicos">Serviços</option>
                    <option value="agregados">Motoristas</option>
                    <option value="ciots">CIOTs</option>
                    <option value="ocorrencias">Ocorrências</option>
                    <option value="conta">Conta</option>
                </select>
            </div>
            <button id="btn-filtrar-auditoria" class="btn-primary">Filtrar</button>
        </div>
        <div class="content-panel table-container">
            <table>
                <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Registro</th><th>Detalhe</th></tr></thead>
                <tbody id="tbody-auditoria"><tr><td colspan="6" style="text-align:center;">Carregando...</td></tr></tbody>
            </table>
        </div>`;

    document.getElementById('btn-filtrar-auditoria').addEventListener('click', carregarAuditoria);
    await carregarAuditoria();
}

async function carregarAuditoria() {
    const tbody = document.getElementById('tbody-auditoria');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>';

    const operacao = document.getElementById('auditoria_operacao').value;
    const tabela = document.getElementById('auditoria_tabela').value;

    let query = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(200);
    if (operacao === 'ALTERAR_SENHA') {
        query = query.eq('operacao', 'ALTERAR_SENHA');
    } else if (operacao) {
        query = query.eq('operacao', operacao);
    }
    if (tabela && tabela !== 'conta') query = query.eq('tabela', tabela);
    if (tabela === 'conta') query = query.eq('tabela', 'profiles');

    const { data, error } = await query;
    if (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Erro: ${esc(error.message)}</td></tr>`;
        return;
    }
    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro de auditoria encontrado.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(a => {
        const acao = nomesOperacoes[a.operacao] || a.operacao;
        const classe = a.operacao === 'DELETE' ? 'badge-danger' : a.operacao === 'INSERT' ? 'badge-success' : 'badge-info';
        const modulo = a.operacao === 'ALTERAR_SENHA' ? 'Conta' : (nomesTabelas[a.tabela] || a.tabela);
        return `<tr>
            <td>${esc(dataHora(a.created_at))}</td>
            <td><strong>${esc(a.usuario_email || 'Usuário desconhecido')}</strong></td>
            <td><span class="badge ${classe}">${esc(acao)}</span></td>
            <td>${esc(modulo)}</td>
            <td>${esc(a.registro_id || '-')}</td>
            <td>${esc(a.descricao || valorResumo(a))}${valorResumo(a) !== '-' && a.descricao ? ` · ${esc(valorResumo(a))}` : ''}</td>
        </tr>`;
    }).join('');
}
