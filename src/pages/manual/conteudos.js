// ── Registro de conteúdo por seção ──────────────────────────────────────────
// Mapa id (de MANUAL_INDICE) → componente de conteúdo. Uma seção sem entrada
// aqui cai automaticamente no placeholder padrão (ver Manual.jsx) — é assim
// que o conteúdo é preenchido incrementalmente nas próximas fases sem tocar
// no layout da página nem no índice.
import SecaoPesagens from './secoes/SecaoPesagens'

export const CONTEUDOS = {
  pesagens: SecaoPesagens,
}
