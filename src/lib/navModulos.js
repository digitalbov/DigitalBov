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
export const NAV = [
  { section: 'PRINCIPAL' },
  { path: '/',             icon: 'ti-layout-dashboard', label: 'Painel' },
  { path: '/metas',        icon: 'ti-target',           label: 'Metas e Indicadores' },
  { path: '/rebanho',      icon: 'ti-chart-line',       label: 'Controle de Rebanho' },
  { path: '/calendario',   icon: 'ti-calendar-event',   label: 'Calendário' },
  { path: '/comparativo',  icon: 'ti-chart-bar',        label: 'Comparativo de Fazendas', condicao: 'comparativo' },
  { path: '/relatorios',   icon: 'ti-file-text',        label: 'Relatório de Fechamento' },
  { path: '/assistente',  icon: 'ti-message-chatbot',  label: 'Assistente IA', destaque: true },

  { section: 'GESTÃO OPERACIONAL' },
  { path: '/propriedade', icon: 'ti-home-2',           label: 'Propriedades' },
  { path: '/animais',     icon: 'ti-clipboard-list',   label: 'Cadastro de Animais' },
  { path: '/feiras',      icon: 'ti-trophy',           label: 'Feiras e Premiações' },
  { path: '/reprodutivo', icon: 'ti-activity',         label: 'Gestão Reprodutiva' },
  { path: '/sanidade',    icon: 'ti-shield-check',     label: 'Manejo Sanitário' },
  { path: '/pesagens',    icon: 'ti-weight',           label: 'Pesagens' },
  { path: '/estoque',     icon: 'ti-box',              label: 'Estoque' },
  { path: '/financeiro',  icon: 'ti-cash',             label: 'Gestão Financeira' },
  { path: '/veterinario', icon: 'ti-stethoscope',      label: 'Veterinário' },

  { section: 'SISTEMA' },
  { path: '/usuarios', icon: 'ti-users',           label: 'Configurações de Usuários', adminOnly: true },
  { path: '/backup',   icon: 'ti-database-export', label: 'Backup e Dados' },
  { tipo: 'modal',     icon: 'ti-school',          label: 'Tutorial', adminOnly: true },
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
