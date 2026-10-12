const COMISSAO_FIXA_PERCENTUAL = 2.5;

/**
 * Mecânica de bonificação conforme a regra de bonificação da operação:
 * 01. Excelência Operacional: +0,2% quando não há reclamação procedente
 *     e não há devolução de mercadoria causada por falha do motorista.
 * 02. Segurança Total: +0,2% quando não há sinistro/ocorrência de segurança.
 * 03. Combo de Performance: +0,2% quando os dois bônus anteriores
 *     forem atingidos integralmente.
 *
 * Entregas continuam sendo registradas como indicador operacional, mas
 * não geram um bônus adicional por si só.
 */
export function calcularBonificacao(valorBase, houveReclamacao, houveDevolucaoMotorista, houveSinistro) {
    const excelenciaOperacional =
        (houveReclamacao === 'nao' || houveReclamacao === false) &&
        (houveDevolucaoMotorista === 'nao' || houveDevolucaoMotorista === false);

    const segurancaTotal = !(houveSinistro === 'sim' || houveSinistro === true);
    const comboPerformance = excelenciaOperacional && segurancaTotal;

    const percentualExcelencia = excelenciaOperacional ? 0.2 : 0;
    const percentualSeguranca = segurancaTotal ? 0.2 : 0;
    const percentualCombo = comboPerformance ? 0.2 : 0;
    const percentual = Number((percentualExcelencia + percentualSeguranca + percentualCombo).toFixed(1));

    const valorComissao = valorBase * (COMISSAO_FIXA_PERCENTUAL / 100);
    const valorBonus = valorBase * (percentual / 100);
    const valorFinal = valorComissao + valorBonus;

    return {
        percentual,
        valorBonus,
        valorComissao,
        valorFinal,
        percentualComissao: COMISSAO_FIXA_PERCENTUAL,
        regras: { excelenciaOperacional, segurancaTotal, comboPerformance }
    };
}

export function formatarMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
}
