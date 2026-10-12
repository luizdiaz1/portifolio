/**
 * modules/retornos/retornos.js
 * Componente de histórico de RETORNO / EFICÁCIA de uma NC.
 * Cada NC pode receber mais de um registro de retorno ao longo do
 * tempo (ex.: primeira verificação "Parcialmente eficaz", depois
 * uma nova verificação "Eficaz"). Este módulo renderiza esse histórico
 * dentro do bloco de detalhe da NC (modules/vistorias/vistorias.js).
 */
const RetornosModule = {
  historicoHtml(ncId) {
    const historico = RetornosQuery.listarPorNC(ncId);
    if (!historico.length) {
      return `<p class="hint" style="margin-top:6px">Nenhum retorno registrado ainda para esta NC.</p>`;
    }
    return `
      <div class="report-block-label" style="margin-top:18px">Histórico de retornos</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Data</th><th>Resultado da correção</th><th>Eficácia</th><th>Responsável</th></tr></thead>
          <tbody>
            ${historico
              .map(
                (r) => `<tr>
                  <td>${Utils.formatarData(r.data_retorno)}</td>
                  <td>${Utils.escapeHtml(r.resultado_correcao) || '—'}</td>
                  <td><span class="tag ${Utils.eficaciaClass(r.eficacia)}">${r.eficacia}</span></td>
                  <td>${Utils.escapeHtml(r.responsavel) || '—'}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  },
};

window.RetornosModule = RetornosModule;
