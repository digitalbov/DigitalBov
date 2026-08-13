// Fonte única da lista de módulos/navegação e de quem pode ver cada um —
// usada por Sidebar.jsx (menu lateral) e Modulos.jsx (tela inicial em
// cards), pra nunca termos duas listas que podem divergir sobre o que
// existe ou quem enxerga o quê. Extraído de Sidebar.jsx (Rodada de layout,
// item 1) sem mudar NENHUM path/ícone/rótulo/regra de visibilidade — só
// mudou de arquivo.

// Módulos com permissão gerenciável (mesma lista de Usuarios.jsx). Itens fora
// desta lista (assistente, calendário, backup) ficam sempre visíveis: o
// sistema de permissões não os cobre.
export const MODULOS_GERENCIAVEIS = [
  'propriedade', 'animais', 'feiras', 'reprodutivo', 'rebanho', 'sanidade',
  'pesagens', 'estoque', 'financeiro', 'relatorios', 'metas', 'veterinario',
]

// Ordem/agrupamento/rótulos/ícones — única fonte pro menu lateral E pra tela
// de módulos em cards. `condicao:'comparativo'` = precisa de 2+ fazendas;
// `adminOnly` = só ehAdmin; `tipo:'modal'` = abre o Tutorial em vez de navegar.
// `descricao` (2026-08-17): só usada pelos cards de Modulos.jsx (a sidebar
// não mostra descrição) — mas fica aqui, não em Modulos.jsx, porque é um
// FATO sobre o módulo (o que ele faz), igual label/ícone, não um detalhe de
// desenho do card.
export const NAV = [
  { section: 'PRINCIPAL' },
  { path: '/',             icon: 'ti-layout-dashboard', label: 'Painel', descricao: 'Visão geral da fazenda, hoje' },
  { path: '/metas',        icon: 'ti-target',           label: 'Metas e Indicadores', descricao: 'Acompanhe metas e desempenho zootécnico' },
  { path: '/rebanho',      icon: 'ti-chart-line',       label: 'Controle de Rebanho', descricao: 'Composição, índices e valor do rebanho' },
  { path: '/calendario',   icon: 'ti-calendar-event',   label: 'Calendário', descricao: 'Partos, vacinas e vencimentos em um só lugar' },
  { path: '/comparativo',  icon: 'ti-chart-bar',        label: 'Comparativo de Fazendas', descricao: 'Compare o desempenho entre fazendas', condicao: 'comparativo' },
  { path: '/relatorios',   icon: 'ti-file-text',        label: 'Relatório de Fechamento', descricao: 'Gere o relatório completo do ciclo' },
  { path: '/assistente',  icon: 'ti-message-chatbot',  label: 'Assistente IA', descricao: 'Pergunte sobre rebanho, finanças e estoque', destaque: true },

  { section: 'GESTÃO OPERACIONAL' },
  { path: '/propriedade', icon: 'ti-home-2',           label: 'Propriedades', descricao: 'Fazenda, piquetes e lotes' },
  { path: '/animais',     icon: 'ti-clipboard-list',   label: 'Cadastro de Animais', descricao: 'Ficha completa de cada animal do rebanho' },
  { path: '/feiras',      icon: 'ti-trophy',           label: 'Feiras e Premiações', descricao: 'Participações e resultados em feiras' },
  { path: '/reprodutivo', icon: 'ti-activity',         label: 'Gestão Reprodutiva', descricao: 'Estações, inseminações, partos e diagnósticos' },
  { path: '/sanidade',    icon: 'ti-shield-check',     label: 'Manejo Sanitário', descricao: 'Vacinas, vermífugos e procedimentos' },
  { path: '/pesagens',    icon: 'ti-weight',           label: 'Pesagens', descricao: 'Peso, GMD e desmame por animal' },
  { path: '/estoque',     icon: 'ti-box',              label: 'Estoque', descricao: 'Medicamentos, vacinas e sêmen' },
  { path: '/financeiro',  icon: 'ti-cash',             label: 'Gestão Financeira', descricao: 'Receitas, despesas e resultado do ciclo' },
  { path: '/veterinario', icon: 'ti-stethoscope',      label: 'Veterinário', descricao: 'Financeiro, clientes e atestados' },

  { section: 'SISTEMA' },
  { path: '/usuarios', icon: 'ti-users',           label: 'Configurações de Usuários', descricao: 'Permissões e acesso da equipe', adminOnly: true },
  { path: '/backup',   icon: 'ti-database-export', label: 'Backup e Dados', descricao: 'Exporte e restaure os dados do sistema' },
  { tipo: 'modal',     icon: 'ti-school',          label: 'Tutorial', descricao: 'Um guia passo a passo pelo sistema', adminOnly: true },
]

// Mesma regra de sempre: admin vê tudo (exceto Comparativo, que depende de
// ter 2+ fazendas independente de admin); operador vê os itens fora da lista
// gerenciável sempre, e os demais conforme podeVer(modulo). adminOnly sempre
// exige ehAdmin, mesmo pra quem "vê tudo". Cabeçalhos de seção só entram no
// resultado se sobrar algum item abaixo.
export function calcularNavVisivel({ ehAdmin, podeVer, mostrarComparativo }) {
  const itemVisivel = (item) => {
    if (item.condicao === 'comparativo') return mostrarComparativo
    if (item.adminOnly) return ehAdmin
    if (ehAdmin) return true
    const modulo = item.path === '/' ? 'dashboard' : item.path?.slice(1)
    if (modulo === 'dashboard' || !MODULOS_GERENCIAVEIS.includes(modulo)) return true
    return podeVer(modulo)
  }
  const out = []
  let secaoPendente = null
  NAV.forEach(item => {
    if (item.section) { secaoPendente = item; return }
    if (!itemVisivel(item)) return
    if (secaoPendente) { out.push(secaoPendente); secaoPendente = null }
    out.push(item)
  })
  return out
}
