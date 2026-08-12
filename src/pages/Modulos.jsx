import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { useIsMobile } from '../lib/useIsMobile'
import { NAV, calcularNavVisivel } from '../lib/navModulos'
import Tutorial from '../components/Tutorial'

// Tela inicial em cards — MOBILE-ONLY por decisão explícita (Rodada de
// layout, 2026-08-16): mostra TODOS os módulos que o usuário pode ver, um
// card por item de NAV (navModulos.js), agrupados pelas MESMAS seções do
// menu lateral. Usa calcularNavVisivel — a mesma função que filtra o menu
// lateral — de propósito: nunca pode existir uma lista paralela decidindo
// "quem vê o quê" diferente da sidebar.
//
// Guarda de desktop AQUI DENTRO (não só no redirect de entrada em App.jsx):
// se alguém chegar em /modulos fora do celular — link direto, PWA instalada
// no desktop — a tela se recusa a aparecer e manda pro Painel. É o mesmo
// useIsMobile de Filtros.jsx/App.jsx, garantindo que "isto é mobile-only"
// nunca dependa de lembrar de checar em todo lugar que leva até aqui.
export default function Modulos() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { fazendas } = useFazenda()
  const { podeVer, ehAdmin } = usePermissoes()
  const [tutorialAberto, setTutorialAberto] = useState(false)

  if (!isMobile) return <Navigate to="/" replace />

  const mostrarComparativo = fazendas.length >= 2
  const navVisivel = calcularNavVisivel({ ehAdmin, podeVer, mostrarComparativo })

  // Agrupa em seções (mesmos cabeçalhos do menu lateral) mantendo a ordem.
  const secoes = []
  let atual = null
  navVisivel.forEach(item => {
    if (item.section) { atual = { titulo: item.section, itens: [] }; secoes.push(atual); return }
    if (!atual) { atual = { titulo: null, itens: [] }; secoes.push(atual) }
    atual.itens.push(item)
  })

  const abrir = (item) => {
    if (item.tipo === 'modal') { setTutorialAberto(true); return }
    navigate(item.path)
  }

  return (
    <div>
      {secoes.map((secao, i) => (
        <div key={i} style={{ marginBottom: 28 }}>
          {secao.titulo && <div className="sl" style={{ marginBottom: 12 }}>{secao.titulo}</div>}
          <div className="modulos-grid">
            {secao.itens.map(item => (
              <button key={item.path || item.label} className="modulo-card" onClick={() => abrir(item)}>
                <div className="modulo-card-icon">
                  <i className={`ti ${item.icon}`} aria-hidden="true" />
                </div>
                <div className="modulo-card-label">{item.label}</div>
                {item.destaque && <span className="modulo-card-badge">IA</span>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {tutorialAberto && (
        <Tutorial
          onClose={() => setTutorialAberto(false)}
          onNaoMostrarMais={() => {
            localStorage.setItem('digitalbov_tutorial_visto', '1')
            setTutorialAberto(false)
          }}
        />
      )}
    </div>
  )
}
