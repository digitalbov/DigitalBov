// ── Registro de conteúdo por seção ──────────────────────────────────────────
// Mapa id (de MANUAL_INDICE) → componente de conteúdo. Uma seção sem entrada
// aqui cai automaticamente no placeholder padrão (ver Manual.jsx) — é assim
// que o conteúdo é preenchido incrementalmente nas próximas fases sem tocar
// no layout da página nem no índice.
import SecaoPrimeirosPassos from './secoes/SecaoPrimeirosPassos'
import SecaoUsuarios from './secoes/SecaoUsuarios'
import SecaoAnimais from './secoes/SecaoAnimais'
import SecaoPropriedade from './secoes/SecaoPropriedade'
import SecaoReprodutivo from './secoes/SecaoReprodutivo'
import SecaoPesagens from './secoes/SecaoPesagens'
import SecaoSanidade from './secoes/SecaoSanidade'
import SecaoEstoque from './secoes/SecaoEstoque'
import SecaoFinanceiro from './secoes/SecaoFinanceiro'
import SecaoMetas from './secoes/SecaoMetas'
import SecaoDashboard from './secoes/SecaoDashboard'
import SecaoRelatorios from './secoes/SecaoRelatorios'
import SecaoComparativo from './secoes/SecaoComparativo'
import SecaoBackup from './secoes/SecaoBackup'
import SecaoVeterinario from './secoes/SecaoVeterinario'
import SecaoAssistente from './secoes/SecaoAssistente'
import SecaoFAQ from './secoes/SecaoFAQ'
import SecaoRebanho from './secoes/SecaoRebanho'
import SecaoCalendario from './secoes/SecaoCalendario'

export const CONTEUDOS = {
  'primeiros-passos': SecaoPrimeirosPassos,
  usuarios: SecaoUsuarios,
  animais: SecaoAnimais,
  propriedade: SecaoPropriedade,
  reprodutivo: SecaoReprodutivo,
  pesagens: SecaoPesagens,
  sanidade: SecaoSanidade,
  estoque: SecaoEstoque,
  financeiro: SecaoFinanceiro,
  metas: SecaoMetas,
  dashboard: SecaoDashboard,
  relatorios: SecaoRelatorios,
  comparativo: SecaoComparativo,
  backup: SecaoBackup,
  veterinario: SecaoVeterinario,
  assistente: SecaoAssistente,
  faq: SecaoFAQ,
  rebanho: SecaoRebanho,
  calendario: SecaoCalendario,
}
