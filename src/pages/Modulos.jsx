import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, Navigate } from 'react-router-dom'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { useIsMobile } from '../lib/useIsMobile'
import { calcularNavVisivel } from '../lib/navModulos'
import { capitalizarPrimeira } from '../lib/helpers'
import Tutorial from '../components/Tutorial'

// Tela inicial em cards — MOBILE-ONLY (Rodada de layout, 2026-08-16) e, a
// partir de 2026-08-17, com o visual escuro/colorido aprovado (referência
// do usuário). Mostra TODOS os módulos que o usuário pode ver, um card por
// item de NAV (navModulos.js), agrupados pelas MESMAS seções do menu
// lateral — calcularNavVisivel é a mesma função que filtra o menu lateral,
// de propósito: nunca pode existir uma lista paralela decidindo "quem vê o
// quê" diferente da sidebar.
//
// Guarda de desktop: se alguém chegar em /modulos fora do celular — link
// direto, PWA instalada no desktop — a tela se recusa a aparecer e manda
// pro Painel (mesmo useIsMobile de Filtros.jsx/App.jsx).
//
// Fundo escuro é só desta tela (aprovado explicitamente: resto do app
// continua claro) — aplicado também no <body> via classe (useEffect
// add/remove no mount/unmount), senão a faixa de status bar (safe-area-
// inset-top, pintada pelo <body>) ficaria clara por cima de um conteúdo
// escuro logo abaixo.
const CORES = ['db-magenta', 'db-purple', 'db-blue', 'db-cyan', 'db-green', 'db-copper']

export default function Modulos() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { abrirSidebar, perfil } = useOutletContext()
  const { fazendas } = useFazenda()
  const { podeVer, ehAdmin } = usePermissoes()
  const [tutorialAberto, setTutorialAberto] = useState(false)

  useEffect(() => {
    if (!isMobile) return
    document.body.classList.add('modulos-tema-escuro')
    return () => document.body.classList.remove('modulos-tema-escuro')
  }, [isMobile])

  if (!isMobile) return <Navigate to="/" replace />

  const mostrarComparativo = fazendas.length >= 2
  const navVisivel = calcularNavVisivel({ ehAdmin, podeVer, mostrarComparativo })

  // Agrupa em seções (mesmos cabeçalhos do menu lateral), mantendo a ordem,
  // e atribui a cor do card por ÍNDICE GLOBAL (não por seção) — assim a
  // sequência de cores nunca reinicia do zero a cada seção nova.
  const secoes = []
  let atual = null
  let indiceGlobal = 0
  navVisivel.forEach(item => {
    if (item.section) { atual = { titulo: item.section, itens: [] }; secoes.push(atual); return }
    if (!atual) { atual = { titulo: null, itens: [] }; secoes.push(atual) }
    atual.itens.push({ ...item, cor: CORES[indiceGlobal % CORES.length] })
    indiceGlobal++
  })

  const abrir = (item) => {
    if (item.tipo === 'modal') { setTutorialAberto(true); return }
    navigate(item.path)
  }

  // perfil.nome vem do e-mail (não há campo de nome próprio no sistema
  // hoje — ver App.jsx::loadPerfil) — só a 1ª letra maiúscula, sem fingir
  // um nome bonito que não temos.
  const primeiroNome = capitalizarPrimeira((perfil?.nome || 'usuário').split(/[.\s_]/)[0])

  return (
    <div className="modulos-dark">
      <div className="modulos-header-dark">
        <button type="button" className="modulos-menu-btn" onClick={abrirSidebar} aria-label="Abrir menu">
          <i className="ti ti-menu-2" />
        </button>
      </div>

      <div className="modulos-greeting">
        <div className="modulos-greeting-hi">Olá, <span className="modulos-greeting-name">{primeiroNome}</span></div>
        <div className="modulos-greeting-sub">Bem-vindo ao DigitalBov</div>
      </div>

      {secoes.map((secao, i) => (
        <div key={i} className="modulos-secao">
          {secao.titulo && <div className="modulos-secao-label">{secao.titulo}</div>}
          <div className="modulos-grid">
            {secao.itens.map(item => (
              <button key={item.path || item.label} type="button"
                className="modulo-card-v2" style={{ '--card-color': `var(--${item.cor})` }}
                onClick={() => abrir(item)}>
                <i className={`ti ${item.icon} modulo-card-v2-marca`} aria-hidden="true" />
                <div className="modulo-card-v2-icone"><i className={`ti ${item.icon}`} aria-hidden="true" /></div>
                <div className="modulo-card-v2-corpo">
                  <div className="modulo-card-v2-nome">{item.label}</div>
                  <div className="modulo-card-v2-desc">{item.descricao}</div>
                </div>
                <span className="modulo-card-v2-seta"><i className="ti ti-arrow-right" /></span>
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
