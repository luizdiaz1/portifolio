import { supabase } from './supabase.js';

const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const date = (v) => v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR') : '-';
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function buscarHistoricoMotorista(agregadoId) {
    const [servicosRes, ciotsRes] = await Promise.all([
        supabase.from('servicos').select('*').eq('agregado_id', agregadoId).order('data_servico', { ascending: false }),
        supabase.from('ciots').select('*').eq('agregado_id', agregadoId).order('data_emissao', { ascending: false })
    ]);

    return {
        servicos: servicosRes.data || [],
        ciots: ciotsRes.data || [],
        error: servicosRes.error || ciotsRes.error
    };
}

export function renderizarHistoricoHTML(servicos, ciots) {
    const eventos = [
        ...servicos.map(s => ({
            data: s.data_servico,
            tipo: 'Serviço',
            titulo: s.descricao || 'Serviço realizado',
            detalhe: `${s.origem || '-'} → ${s.destino || '-'} | ${s.status === 'Em andamento' ? 'Valor final pendente' : money(s.valor_final)}`,
            status: s.status || 'Em andamento'
        })),
        ...ciots.map(c => ({
            data: c.data_emissao,
            tipo: 'CIOT',
            titulo: `CIOT ${c.numero_ciot}`,
            detalhe: `${c.origem || '-'} → ${c.destino || '-'}${c.valor_contrato ? ` | ${money(c.valor_contrato)}` : ''}`,
            status: c.status || 'Ativo'
        }))
    ].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

    if (!eventos.length) return '<div class="content-panel text-muted">Nenhum histórico registrado para este motorista.</div>';

    return `
        <div class="table-container">
            <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Registro</th><th>Detalhes</th><th>Status</th></tr></thead>
                <tbody>
                    ${eventos.map(e => `
                        <tr>
                            <td>${date(e.data)}</td>
                            <td><span class="badge ${e.tipo === 'CIOT' ? 'badge-info' : 'badge-success'}">${e.tipo}</span></td>
                            <td style="font-weight:500;">${esc(e.titulo)}</td>
                            <td class="text-muted">${esc(e.detalhe)}</td>
                            <td>${esc(e.status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
