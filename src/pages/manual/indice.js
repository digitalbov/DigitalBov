// ── Índice mestre do Manual do Sistema ──────────────────────────────────────
// Fonte única do índice lateral (TOC), da busca e da ordem de renderização das
// seções em Manual.jsx. Cada entrada aqui é 1 seção com âncora própria (id vira
// o `id` do <section> na página, usado tanto pelo scroll do índice quanto pela
// exportação em PDF). `subsecoes` é opcional — usado só por módulos com abas
// internas relevantes o bastante pra merecer âncora própria (ex: Financeiro).
//
// Preenchimento incremental: o conteúdo de cada seção vem de conteudos.js (map
// id → componente). Uma seção sem componente registrado cai automaticamente no
// placeholder "Conteúdo em breve" — adicionar o conteúdo de um novo módulo nas
// próximas fases não exige mexer nem aqui nem no layout de Manual.jsx.
export const MANUAL_INDICE = [
  {
    id: 'dashboard', titulo: 'Painel (Dashboard)', icone: 'ti-layout-dashboard',
    resumo: 'Visão geral da fazenda: composição do rebanho, KPIs financeiros, piquetes, planejamento e alertas de estoque.',
  },
  {
    id: 'metas', titulo: 'Metas e Indicadores', icone: 'ti-target',
    resumo: 'Indicadores zootécnicos e financeiros com meta, semáforo de status (verde/amarelo/vermelho) e gráficos por safra.',
  },
  {
    id: 'rebanho', titulo: 'Controle de Rebanho', icone: 'ti-chart-line',
    resumo: 'Composição do rebanho ativo, índices reprodutivos/produtivos por ciclo e valor de mercado estimado.',
  },
  {
    id: 'calendario', titulo: 'Calendário', icone: 'ti-calendar-event',
    resumo: 'Agenda unificada de partos previstos, procedimentos sanitários agendados e vencimentos de estoque.',
  },
  {
    id: 'comparativo', titulo: 'Comparativo', icone: 'ti-chart-bar',
    resumo: 'Compara todas as fazendas da mesma conta lado a lado, alinhadas pelo nome do ciclo.',
  },
  {
    id: 'relatorios', titulo: 'Relatórios', icone: 'ti-file-text',
    resumo: 'Geração de relatórios em PDF: Resumo Geral, Reprodução e Financeiro.',
  },
  {
    id: 'propriedade', titulo: 'Propriedades', icone: 'ti-home-2',
    resumo: 'Cadastro da fazenda, piquetes com mapa de satélite (desenho de polígonos) e planejamento de rentabilidade.',
  },
  {
    id: 'animais', titulo: 'Cadastro de Animais', icone: 'ti-clipboard-list',
    resumo: 'Ficha individual do animal: dados básicos, genealogia e linha do tempo completa de eventos.',
  },
  {
    id: 'reprodutivo', titulo: 'Gestão Reprodutiva', icone: 'ti-activity',
    resumo: 'Lotes de inseminação (IATF/repasse), diagnósticos, partos/abortos e o funil completo de índices da safra.',
  },
  {
    id: 'sanidade', titulo: 'Sanidade', icone: 'ti-shield-check',
    resumo: 'Registro de vacinas, vermifugações e outros procedimentos sanitários, com agenda de retorno.',
  },
  {
    id: 'pesagens', titulo: 'Pesagens', icone: 'ti-weight',
    resumo: 'Registro de pesagens, cálculo de GMD, projeção de peso-alvo e fluxo de desmame em lote.',
  },
  {
    id: 'estoque', titulo: 'Estoque', icone: 'ti-box',
    resumo: 'Itens (medicamentos, vacinas, sêmen, suplementos, ração), movimentações e controle de validade por lote (FEFO).',
  },
  {
    id: 'financeiro', titulo: 'Gestão Financeira', icone: 'ti-cash',
    resumo: 'Lançamentos de receita/despesa, compra e venda de animais, resultados por ciclo, parâmetros de preço e simulações.',
    subsecoes: [
      { id: 'financeiro-lancamentos',   titulo: 'Lançamentos' },
      { id: 'financeiro-compra-venda',  titulo: 'Compra & Venda' },
      { id: 'financeiro-resultados',    titulo: 'Resultados' },
      { id: 'financeiro-parametros',    titulo: 'Parâmetros' },
      { id: 'financeiro-simulacoes',    titulo: 'Simulações' },
    ],
  },
  {
    id: 'usuarios', titulo: 'Usuários', icone: 'ti-users',
    resumo: 'Papéis (dono/admin/operador), permissões granulares por fazenda e módulo, e criação de operadores.',
  },
  {
    id: 'backup', titulo: 'Backup e Dados', icone: 'ti-database-export',
    resumo: 'Exportação de backup completo (JSON) e planilhas de animais/financeiro (Excel).',
  },
  {
    id: 'assistente', titulo: 'Assistente IA', icone: 'ti-message-chatbot',
    resumo: 'Chat com IA que responde perguntas sobre os dados reais da fazenda (rebanho, finanças, estoque).',
  },
]
