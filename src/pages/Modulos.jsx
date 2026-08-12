import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, Navigate } from 'react-router-dom'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { useIsMobile } from '../lib/useIsMobile'
import { calcularNavVisivel } from '../lib/navModulos'
import { capitalizarPrimeira } from '../lib/helpers'
import Tutorial from '../components/Tutorial'

// Tela inicial em cards — MOBILE-ONLY. Mostra TODOS os módulos que o
// usuário pode ver, um card por item de NAV (navModulos.js), agrupados
// pelas MESMAS seções do menu lateral — calcularNavVisivel é a mesma
// função que filtra o menu lateral, de propósito: nunca pode existir uma
// lista paralela decidindo "quem vê o quê" diferente da sidebar.
//
// Guarda de desktop: se alguém chegar em /modulos fora do celular — link
// direto, PWA instalada no desktop — a tela se recusa a aparecer e manda
// pro Painel (mesmo useIsMobile de Filtros.jsx/App.jsx).
//
// Fundo escuro é só desta tela — aplicado também no <body> via classe
// (useEffect add/remove no mount/unmount), senão a faixa de status bar
// (safe-area-inset-top, pintada pelo <body>) ficaria clara por cima de um
// conteúdo escuro logo abaixo.
//
// 2026-08-17 — visual com foto (revisão da 1ª versão, que usava só
// gradiente + ícone gigante apagado e ficou "pouco criativo" no teste).
// Foto real por módulo, licença Unsplash padrão (uso comercial livre, sem
// exigência de atribuição — https://unsplash.com/license), baixada e
// otimizada em WebP no tamanho real do card (public/modulos/*.webp, ~36KB
// médios, 688KB as 19 juntas), hospedada localmente — nunca a API ao vivo
// do Unsplash (que teria exigência de atribuição própria, diferente da
// licença de download direto).
const CORES = ['db-magenta', 'db-purple', 'db-blue', 'db-cyan', 'db-green', 'db-copper']

// path -> nome do arquivo em public/modulos/. Só usado aqui (é detalhe de
// apresentação do card, não um fato do módulo — por isso não entra em
// navModulos.js, diferente de label/ícone/descrição).
const FOTO_POR_PATH = {
  '/': 'painel', '/metas': 'metas', '/rebanho': 'rebanho', '/calendario': 'calendario',
  '/comparativo': 'comparativo', '/relatorios': 'relatorios', '/assistente': 'assistente',
  '/propriedade': 'propriedade', '/animais': 'animais', '/feiras': 'feiras',
  '/reprodutivo': 'reprodutivo', '/sanidade': 'sanidade', '/pesagens': 'pesagens',
  '/estoque': 'estoque', '/financeiro': 'financeiro', '/veterinario': 'veterinario',
  '/usuarios': 'usuarios', '/backup': 'backup',
}
const fotoDoItem = (item) => FOTO_POR_PATH[item.path] || 'tutorial' // só o Tutorial não tem path

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

  // Agrupa em seções (mesmos cabeçalhos do menu lateral), mantendo a ordem;
  // cor por ÍNDICE GLOBAL (não por seção, pra sequência nunca reiniciar); e
  // marca o 1º item de CADA seção como destaque (card mais largo/alto) —
  // é o que evita a tela virar uma "tabela colorida" de 19 células iguais.
  const secoes = []
  let atual = null
  let indiceGlobal = 0
  navVisivel.forEach(item => {
    if (item.section) { atual = { titulo: item.section, itens: [] }; secoes.push(atual); return }
    if (!atual) { atual = { titulo: null, itens: [] }; secoes.push(atual) }
    atual.itens.push({ ...item, cor: CORES[indiceGlobal % CORES.length], destaque: atual.itens.length === 0 })
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
                className={`modulo-card-v2 ${item.destaque ? 'modulo-card-v2--destaque' : ''}`}
                style={{ '--card-color': `var(--${item.cor})`, '--card-foto': `url(/modulos/${fotoDoItem(item)}.webp)` }}
                onClick={() => abrir(item)}>
                <div className="modulo-card-v2-icone"><i className={`ti ${item.icon}`} aria-hidden="true" /></div>
                <div className="modulo-card-v2-corpo">
                  <div className="modulo-card-v2-textos">
                    <div className="modulo-card-v2-nome">{item.label}</div>
                    <div className="modulo-card-v2-desc">{item.descricao}</div>
                  </div>
                  <span className="modulo-card-v2-seta"><i className="ti ti-arrow-right" /></span>
                </div>
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
