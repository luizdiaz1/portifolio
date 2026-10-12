/**
 * utils/alerts.js
 * Calcula a "Central de Alertas" do sistema a partir dos dados atuais:
 * NC crítica, prazo próximo, prazo vencido, NC atrasada,
 * retorno pendente e eficácia ainda não verificada.
 */
const AlertsEngine = {
  DIAS_PRAZO_PROXIMO: 3,

  gerar() {
    const alertas = [];
    const ncs = NCQuery.listarTodas();

    ncs.forEach((nc) => {
      const vistoria = Store.getById('vistorias', nc.vistoria_id);
      const contexto = vistoria
        ? `${vistoria.area_local} • ${Utils.formatarData(vistoria.data)}`
        : '';

      if (nc.criticidade === 'Crítica' && nc.status !== 'Concluída') {
        alertas.push({
          tipo: 'critica',
          icone: '⚠',
          titulo: `NC ${String(nc.numero).padStart(2, '0')} crítica em aberto`,
          detalhe: `${nc.area_local || contexto} — ${nc.descricao?.slice(0, 80) || 'sem descrição'}`,
          nc_id: nc.id,
          vistoria_id: nc.vistoria_id,
        });
      }

      if (nc.status === 'Atrasada') {
        alertas.push({
          tipo: 'atrasada',
          icone: '⏰',
          titulo: `NC ${String(nc.numero).padStart(2, '0')} atrasada`,
          detalhe: `Prazo era ${Utils.formatarData(nc.prazo)} • ${contexto}`,
          nc_id: nc.id,
          vistoria_id: nc.vistoria_id,
        });
      } else if (nc.prazo && nc.status !== 'Concluída') {
        const dias = Utils.diasAte(nc.prazo);
        if (dias !== null && dias >= 0 && dias <= this.DIAS_PRAZO_PROXIMO) {
          alertas.push({
            tipo: 'prazo-proximo',
            icone: '⏳',
            titulo: `Prazo próximo — NC ${String(nc.numero).padStart(2, '0')}`,
            detalhe: `Vence em ${dias === 0 ? 'hoje' : dias + ' dia(s)'} • ${contexto}`,
            nc_id: nc.id,
            vistoria_id: nc.vistoria_id,
          });
        }
      }

      if (nc.status === 'Concluída') {
        const retorno = RetornosQuery.ultimoPorNC(nc.id);
        if (!retorno) {
          alertas.push({
            tipo: 'retorno-pendente',
            icone: '↩',
            titulo: `Retorno pendente — NC ${String(nc.numero).padStart(2, '0')}`,
            detalhe: `Ação concluída, aguardando registro de retorno • ${contexto}`,
            nc_id: nc.id,
            vistoria_id: nc.vistoria_id,
          });
        } else if (retorno.eficacia === 'Pendente de verificação') {
          alertas.push({
            tipo: 'eficacia-pendente',
            icone: '❔',
            titulo: `Eficácia não verificada — NC ${String(nc.numero).padStart(2, '0')}`,
            detalhe: `Retorno registrado, eficácia ainda não avaliada • ${contexto}`,
            nc_id: nc.id,
            vistoria_id: nc.vistoria_id,
          });
        }
      }
    });

    const ordem = {
      critica: 0,
      atrasada: 1,
      'prazo-proximo': 2,
      'retorno-pendente': 3,
      'eficacia-pendente': 4,
    };
    return alertas.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  },

  contarPorTipo() {
    const alertas = this.gerar();
    return alertas.reduce((acc, a) => {
      acc[a.tipo] = (acc[a.tipo] || 0) + 1;
      return acc;
    }, {});
  },
};

window.AlertsEngine = AlertsEngine;
