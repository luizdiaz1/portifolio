/**
 * database/queries/naoConformidades.js
 * CRUD de "nao_conformidades" + "nc_sensos" (10S infringidos).
 */
const NCQuery = {
  listarPorVistoria(vistoriaId) {
    return Store.select('nao_conformidades', (n) => n.vistoria_id === vistoriaId).sort(
      (a, b) => a.numero - b.numero
    );
  },

  listarTodas(filtros = {}) {
    let rows = Store.select('nao_conformidades');
    if (filtros.criticidade) rows = rows.filter((n) => n.criticidade === filtros.criticidade);
    if (filtros.status) rows = rows.filter((n) => n.status === filtros.status);
    if (filtros.responsavel)
      rows = rows.filter((n) =>
        (n.responsavel || '').toLowerCase().includes(filtros.responsavel.toLowerCase())
      );
    if (filtros.setor) {
      const vistoriaIds = new Set(
        Store.select('vistorias', (v) => v.setor_processo === filtros.setor).map((v) => v.id)
      );
      rows = rows.filter((n) => vistoriaIds.has(n.vistoria_id));
    }
    if (filtros.prazoInicio) rows = rows.filter((n) => n.prazo && n.prazo >= filtros.prazoInicio);
    if (filtros.prazoFim) rows = rows.filter((n) => n.prazo && n.prazo <= filtros.prazoFim);
    // Atualiza status "Atrasada" dinamicamente antes de retornar.
    rows.forEach((n) => this.aplicarAtraso(n));
    return rows.sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  },

  obter(id) {
    const nc = Store.getById('nao_conformidades', id);
    if (nc) this.aplicarAtraso(nc);
    return nc;
  },

  /** Marca como Atrasada (em memória e persistido) se o prazo já passou e não está concluída. */
  aplicarAtraso(nc) {
    if (!nc || !nc.prazo) return nc;
    const hoje = new Date().toISOString().slice(0, 10);
    if (nc.prazo < hoje && nc.status !== 'Concluída' && nc.status !== 'Atrasada') {
      Store.update('nao_conformidades', nc.id, { status: 'Atrasada' });
      nc.status = 'Atrasada';
    }
    return nc;
  },

  proximoNumero(vistoriaId) {
    const ncs = this.listarPorVistoria(vistoriaId);
    return ncs.length ? Math.max(...ncs.map((n) => n.numero)) + 1 : 1;
  },

  criar(vistoriaId, dados) {
    const numero = this.proximoNumero(vistoriaId);
    const nc = Store.insert('nao_conformidades', {
      vistoria_id: vistoriaId,
      numero,
      area_local: dados.area_local || '',
      responsavel: dados.responsavel || '',
      prazo: dados.prazo || null,
      criticidade: dados.criticidade || 'Média',
      descricao: dados.descricao || '',
      impacto_risco: dados.impacto_risco || '',
      acao_corretiva: dados.acao_corretiva || '',
      status: 'Pendente',
    });
    // Os sensos são sincronizados de forma confirmada pelo fluxo de criação.
    // Não fazemos push otimista aqui para evitar que uma falha de RLS/rede
    // fique invisível e para garantir que o registro exista em outros dispositivos.
    VistoriasQuery.recalcularStatus(vistoriaId);
    return nc;
  },

  atualizar(id, patch, sensos) {
    const nc = Store.update('nao_conformidades', id, patch);
    if (sensos) {
      Store.deleteWhere('nc_sensos', (s) => s.nc_id === id);
      sensos.forEach((s) => this.adicionarSenso(id, s));
    }
    if (nc) VistoriasQuery.recalcularStatus(nc.vistoria_id);
    return nc;
  },

  atualizarStatus(id, status) {
    const nc = Store.update('nao_conformidades', id, { status });
    if (nc) VistoriasQuery.recalcularStatus(nc.vistoria_id);
    return nc;
  },

  excluir(id) {
    const nc = Store.getById('nao_conformidades', id);
    Store.deleteWhere('nc_sensos', (s) => s.nc_id === id);
    Store.deleteWhere('evidencias', (e) => e.nc_id === id);
    Store.deleteWhere('acompanhamentos', (a) => a.nc_id === id);
    Store.deleteWhere('retornos', (r) => r.nc_id === id);
    const ok = Store.delete('nao_conformidades', id);
    if (nc) VistoriasQuery.recalcularStatus(nc.vistoria_id);
    return ok;
  },

  // --- Sensos 10S ---
  sensosDaNC(ncId) {
    return [...new Set(Store.select('nc_sensos', (s) => s.nc_id === ncId).map((s) => s.senso))];
  },

  /** Atualiza SÓ o cache em memória (resposta imediata na tela). A gravação real é sincronizarSensos. */
  definirSensosLocal(ncId, sensos = []) {
    Store.deleteWhere('nc_sensos', (s) => s.nc_id === ncId);
    [...new Set(sensos)].forEach((senso) => {
      const agora = new Date().toISOString();
      Store.insertLocal('nc_sensos', { id: Store.uuid(), nc_id: ncId, senso, created_at: agora, updated_at: agora });
    });
  },

  adicionarSenso(ncId, senso) {
    const existentes = Store.select('nc_sensos', (s) => s.nc_id === ncId && s.senso === senso);
    if (existentes.length) return existentes[0];
    return Store.insert('nc_sensos', { nc_id: ncId, senso });
  },

  /**
   * Substitui os sensos de uma NC diretamente no Supabase e só retorna
   * depois de o servidor confirmar a operação. Isso evita o problema do
   * Store otimista: a tela podia mostrar o senso localmente enquanto o
   * INSERT ainda estava pendente ou havia sido recusado pelo RLS.
   */
  async sincronizarSensos(ncId, sensos = []) {
    const lista = [...new Set((sensos || []).filter(Boolean))];
    const db = window.QualidadeDB;
    if (!db || !db.client) {
      // Fallback para o modo sem Supabase.
      Store.deleteWhere('nc_sensos', (s) => s.nc_id === ncId);
      lista.forEach((senso) => this.adicionarSenso(ncId, senso));
      return this.sensosDaNC(ncId);
    }

    if (db.flushPendingWrites) await db.flushPendingWrites();

    const { data: atuais, error: selectError } = await db.client
      .from('nc_sensos')
      .select('id,nc_id,senso,created_at,updated_at')
      .eq('nc_id', ncId);
    if (selectError) throw selectError;

    const desejados = new Set(lista);
    const remover = (atuais || []).filter((row) => !desejados.has(row.senso));
    if (remover.length) {
      // Uma única chamada para todos, em vez de uma ida ao servidor por senso.
      const { error } = await db.client.from('nc_sensos').delete().in('id', remover.map((r) => r.id));
      if (error) throw error;
    }

    const existentes = new Set((atuais || []).map((row) => row.senso));
    const inserir = lista.filter((senso) => !existentes.has(senso));
    if (inserir.length) {
      const { data: inseridos, error } = await db.client
        .from('nc_sensos')
        .insert(inserir.map((senso) => ({ nc_id: ncId, senso })))
        .select('*');
      if (error) throw error;

      // Atualiza o cache local somente com linhas confirmadas pelo servidor.
      Store.deleteWhere('nc_sensos', (row) => row.nc_id === ncId);
      (inseridos || []).forEach((row) => Store.insertLocal('nc_sensos', row));
    } else {
      // Mesmo quando não há INSERT, removemos do cache qualquer linha que
      // tenha sido excluída no servidor e preservamos as confirmadas.
      const confirmados = (atuais || []).filter((row) => desejados.has(row.senso));
      Store.deleteWhere('nc_sensos', (row) => row.nc_id === ncId);
      confirmados.forEach((row) => Store.insertLocal('nc_sensos', row));
    }

    return this.sensosDaNC(ncId);
  },

  // --- Indicadores agregados de uma vistoria ---
  resumoVistoria(vistoriaId) {
    const ncs = this.listarPorVistoria(vistoriaId);
    ncs.forEach((n) => this.aplicarAtraso(n));
    return {
      total: ncs.length,
      criticas: ncs.filter((n) => n.criticidade === 'Crítica').length,
      prazosDefinidos: ncs.filter((n) => !!n.prazo).length,
      status: Store.getById('vistorias', vistoriaId)?.status || 'Não Iniciado',
    };
  },
};

window.NCQuery = NCQuery;
