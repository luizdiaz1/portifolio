/**
 * utils/checklist10s.js
 * Modelo do checklist da Auditoria 10S (perguntas dos 10 sensos) e dos pesos
 * usados no cálculo da nota do prefeito. Vem das planilhas oficiais
 * "Checklist auditoria 2ª área" e "Cálculo para avaliação dos prefeitos".
 *
 * `invertida: true` marca a pergunta em que responder "Sim" é o resultado ruim
 * (ex.: "Há materiais desnecessários...?"). Serve só para sugerir os pontos ao
 * marcar Sim/Não; o auditor sempre pode ajustar (0 / 0,5 / 1).
 */
const CHECKLIST_10S = [
  {
    senso: 1, nome: 'Utilização', japones: 'Seiri',
    itens: [
      { pergunta: 'Há materiais, documentos ou objetos desnecessários no ambiente de trabalho ou nas mesas?', invertida: true },
      { pergunta: 'Todos os equipamentos e utensílios estão sendo utilizados?' },
      { pergunta: 'Existe local definido para descarte ou guarda temporária?' },
      { pergunta: 'Há conhecimento sobre o senso em questão por parte dos colaboradores? (entrevista)' },
    ],
  },
  {
    senso: 2, nome: 'Organização', japones: 'Seiton',
    itens: [
      { pergunta: 'Postos de trabalho organizados e padronizados' },
      { pergunta: 'As áreas de trânsito estão desobstruídas?' },
      { pergunta: 'Arquivos físicos e/ou digitais organizados' },
      { pergunta: 'Arquivos, pastas e armários estão identificados dentro do padrão' },
    ],
  },
  {
    senso: 3, nome: 'Limpeza', japones: 'Seiso',
    itens: [
      { pergunta: 'Ambiente, mobiliários e equipamentos limpos' },
      { pergunta: 'Condições adequadas das instalações (elétrica, hidráulica e civil)' },
      { pergunta: 'A manutenção do ambiente está em dia (persianas, luzes funcionando, tapetes bem conservados, paredes limpas)' },
      { pergunta: 'No ambiente não existe nenhum equipamento, item ou objeto precisando de reparo?' },
      { pergunta: 'Lixeiras limpas, identificadas e em bom estado' },
    ],
  },
  {
    senso: 4, nome: 'Padronização', japones: 'Seiketsu',
    itens: [
      { pergunta: 'Controles visuais implantados e atualizados' },
      { pergunta: 'Existem POPs definidos do setor e conhecidos pelos colaboradores?' },
      { pergunta: 'Arquivos eletrônicos organizados?' },
    ],
  },
  {
    senso: 5, nome: 'Disciplina', japones: 'Shitsuke',
    itens: [
      { pergunta: 'Padrões e normas do setor são conhecidos e praticados pelos colaboradores' },
      { pergunta: 'As pessoas praticam as normas de segurança?' },
      { pergunta: 'A equipe demonstra comprometimento com o programa 10 Ss (entrevistas)' },
      { pergunta: 'Os colaboradores conhecem o programa e o mascote de qualidade da empresa?' },
    ],
  },
  {
    senso: 6, nome: 'Determinação e União', japones: 'Shikari Yaro',
    itens: [
      { pergunta: 'A equipe demonstra cooperação e respeito no ambiente de trabalho (entrevista)' },
      { pergunta: 'Há apoio mútuo entre os colaboradores para cumprimento das rotinas (entrevista)' },
      { pergunta: 'O setor participa ativamente das ações e campanhas do programa 10 Ss' },
      { pergunta: 'Os colaboradores demonstram atitude positiva frente às orientações e auditorias' },
      { pergunta: 'O setor participa ativamente dos eventos que a empresa promove?' },
    ],
  },
  {
    senso: 7, nome: 'Treinamento', japones: 'Shido',
    itens: [
      { pergunta: 'Há orientação clara para novos colaboradores (integração ou acompanhamento inicial)' },
      { pergunta: 'Treinamentos necessários à função foram realizados ou orientações foram repassadas' },
      { pergunta: 'Existe uma programação de treinamento para o setor?' },
    ],
  },
  {
    senso: 8, nome: 'Economia e Combate aos Desperdícios', japones: 'Setsuyaku',
    itens: [
      { pergunta: 'Os recursos do setor (papel, energia, água, materiais e equipamentos) são utilizados de forma consciente' },
      { pergunta: 'Não há desperdício visível de materiais de escritório ou insumos (ex.: impressão desnecessária)' },
      { pergunta: 'Equipamentos são desligados quando não estão em uso (computadores, luzes, ar-condicionado)' },
      { pergunta: 'Há cuidado com a conservação de mobiliários, equipamentos e materiais' },
    ],
  },
  {
    senso: 9, nome: 'Princípios Morais e Éticos', japones: 'Shisei Rinri',
    itens: [
      { pergunta: 'O ambiente de trabalho demonstra respeito mútuo e comportamento profissional' },
      { pergunta: 'Não há práticas inadequadas, favorecimentos ou condutas antiéticas perceptíveis' },
      { pergunta: 'Os prestadores de serviço atendem as exigências do programa 10 Ss (verificar quais os prestadores do setor)' },
      { pergunta: 'As relações interpessoais ocorrem de forma respeitosa, sem assédio ou discriminação' },
    ],
  },
  {
    senso: 10, nome: 'Responsabilidade Social', japones: 'Sekinin Shakai',
    aviso: 'Somente Gestão, Direção e Prestadores de Serviços são auditados neste senso.',
    itens: [],
  },
];

/** Peso de cada parte na nota geral do prefeito (soma 100). */
const PESOS_NOTA_10S = { nc: 40, checklist: 30, comportamental: 30 };

/** Critérios da nota comportamental / técnica (soma dos pesos = 100). */
const CRITERIOS_COMPORTAMENTAIS = [
  { campo: 'nota_comprometimento', nome: 'Comprometimento com o programa', peso: 25 },
  { campo: 'nota_lideranca', nome: 'Liderança e mobilização de equipe', peso: 25 },
  { campo: 'nota_sensos', nome: 'Entendimento e aplicação dos sensos', peso: 20 },
  { campo: 'nota_organizacao', nome: 'Organização e planejamento das ações', peso: 15 },
  { campo: 'nota_comunicacao', nome: 'Comunicação e postura frente à auditoria', peso: 15 },
];

const STATUS_ACAO_10S = ['Pendente', 'Em andamento', 'Concluída', 'Cancelado'];
const SENSOS_ATE_NOTA = 8; // sensos 1–8 entram no checklist pontuado; 9 e 10 só se forem preenchidos

window.CHECKLIST_10S = CHECKLIST_10S;
