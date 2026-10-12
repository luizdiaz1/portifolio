/**
 * utils/seed.js
 * Popula o sistema com dados de exemplo (baseados no relatório modelo
 * fornecido) na primeira execução, apenas para demonstrar o fluxo.
 * Pode ser limpo a qualquer momento em Configurações > Resetar dados.
 */
const Seed = {
  jaExecutado() {
    return localStorage.getItem('q10s_seeded') === '1';
  },

  executar() {
    if (this.jaExecutado()) return;

    const v1 = VistoriasQuery.criar({
      data: '2026-09-16',
      area_local: 'G1',
      realizada_por: 'Bernardo',
      setor_processo: 'Expedição',
      observacao:
        'Vistoria de rotina no galpão de expedição. Identificados pontos de desorganização e acúmulo de resíduos nos corredores, além de itens fora de lugar em prateleiras.',
    });

    NCQuery.criar(v1.id, {
      area_local: 'Expedição',
      responsavel: 'Gestão Expedição/Estoque',
      prazo: '2026-09-30',
      criticidade: 'Alta',
      descricao:
        'Peça de vassoura em prateleira, prancheta em prateleira, garrafa de água. Cantinhos do galpão obstruídos com sujeiras e produtos, acúmulo de resíduos de embalagens pelos corredores.',
      impacto_risco: 'Acúmulo de sujeira e risco de perdas de produtos.',
      acao_corretiva: 'Retirada dos itens das prateleiras, limpeza dos cantos e corredores.',
      sensos: ['Organização', 'Limpeza', 'Disciplina'],
    });

    NCQuery.criar(v1.id, {
      area_local: 'Expedição - Doca 2',
      responsavel: 'Carlos Souza',
      prazo: '2026-09-20',
      criticidade: 'Crítica',
      descricao:
        'Extintor de incêndio com acesso obstruído por pallets empilhados, dificultando uso emergencial.',
      impacto_risco: 'Risco de segurança em caso de princípio de incêndio.',
      acao_corretiva: 'Reorganizar pallets e sinalizar área de acesso livre ao extintor.',
      sensos: ['Segurança', 'Organização'],
    });

    const nc3 = NCQuery.criar(v1.id, {
      area_local: 'Expedição - Área de embalagens',
      responsavel: 'Ana Lima',
      prazo: '2026-09-10',
      criticidade: 'Média',
      descricao: 'Etiquetas de identificação de estoque desatualizadas em 3 prateleiras.',
      impacto_risco: 'Risco de erro na separação de pedidos.',
      acao_corretiva: 'Reimpressão e fixação das etiquetas atualizadas.',
      sensos: ['Padronização', 'Organização'],
    });
    NCQuery.atualizarStatus(nc3.id, 'Concluída');
    RetornosQuery.registrar(nc3.id, {
      resultado_correcao: 'Etiquetas reimpressas e fixadas em todas as prateleiras do setor.',
      eficacia: 'Eficaz',
      data_retorno: '2026-09-14',
      responsavel: 'Ana Lima',
    });

    const v2 = VistoriasQuery.criar({
      data: '2026-09-15',
      area_local: 'G2',
      realizada_por: 'Bernardo',
      setor_processo: 'Estoque',
      observacao: 'Vistoria mensal do setor de estoque, sem grandes desvios encontrados.',
    });
    const nc4 = NCQuery.criar(v2.id, {
      area_local: 'Estoque - Corredor B',
      responsavel: 'João Pedro',
      prazo: '2026-09-25',
      criticidade: 'Baixa',
      descricao: 'Piso com marcação de faixa de circulação desbotada.',
      impacto_risco: 'Dificuldade de identificação de rota de circulação.',
      acao_corretiva: 'Repintura da sinalização de piso.',
      sensos: ['Padronização'],
    });
    NCQuery.criar(v2.id, {
      area_local: 'Estoque - Recebimento',
      responsavel: 'João Pedro',
      prazo: '2026-09-18',
      criticidade: 'Média',
      descricao: 'Caixas de papelão vazias acumuladas próximas à doca de recebimento.',
      impacto_risco: 'Obstrução parcial da área de circulação.',
      acao_corretiva: 'Descarte imediato e definição de rotina diária de retirada.',
      sensos: ['Limpeza', 'Organização'],
    });
    NCQuery.atualizarStatus(nc4.id, 'Em andamento');

    localStorage.setItem('q10s_seeded', '1');
  },
};

window.Seed = Seed;
