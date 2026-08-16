import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../lib/useIsMobile'

// ── <Filtros> — padrão único de filtro (Rodada de layout, item 3, Fase 1)
// ────────────────────────────────────────────────────────────────────────
// A tela só declara O QUE filtrar (itens) e O VALOR atual de cada um
// (valores) — nunca COMO desenhar. Esta rodada é MOBILE-ONLY por decisão
// explícita (2026-08-16): no desktop, o componente reproduz exatamente o
// comportamento que cada tela já tinha ANTES deste componente existir —
// todos os itens sempre visíveis, lado a lado, sem botão "Filtros", sem
// painel, sem chips — porque isso é literalmente o que Rebanho/Feiras já
// faziam. O celular é quem ganha a barra medida + bottom sheet + chips.
//
// Uma implementação só, que se adapta por breakpoint (useIsMobile, mesmo
// 768px de global.css) — não duas telas paralelas: os dois modos
// renderizam os MESMOS itens/valores através do MESMO renderer de campo
// (Campo, abaixo), só a casca ao redor muda. Uma tela nova que declarar um
// filtro não pode nunca precisar saber se está no desktop ou no celular.
//
// Se uma tela precisar de um jeito de filtrar que NÃO existe aqui (pills,
// select, busca), o certo é ampliar este componente com um `tipo` novo —
// nunca abrir uma exceção visual na tela consumidora.
//
// O componente NUNCA recebe nem toca a lista de dados sendo filtrada — só
// os valores selecionados e um onChange(chave, valor). Filtrar client-side
// (Array.filter, como hoje) ou no servidor (nova query a cada onChange) é
// decisão de quem consome; o componente é opaco a isso por construção.
//
// `compacto` (2026-08-17) — única exceção explícita à regra "desktop = todos
// visíveis": força o formato botão+painel do celular mesmo em tela larga.
// Existe pra um espaço que É estreito mesmo no desktop (o corpo de um
// <Modal>, não a página inteira) — ali a barra expandida do FiltrosDesktop
// não cabe/não faz sentido, e a decisão não é da largura da JANELA, é da
// largura do CONTAINER. Parâmetro explícito, não detecção: quem consome
// decide, o componente não infere. Além de pular a escolha isMobile, some
// com a medição de largura (ResizeObserver) — todo item sempre no painel,
// nunca tenta caber nada na barra (dentro de um modal isso seria instável:
// o container muda de largura conforme o conteúdo do próprio modal).
// Tem um lado CSS correspondente (ver .filtros-bar--compacto em
// global.css): sem `compacto`, .filtros-panel só escapa do overflow:hidden
// da barra via @media (max-width:768px) trocando pra position:fixed —
// bug encontrado ao vivo (2026-08-16): fora desse breakpoint o painel
// nascia clipado e invisível. `compacto` também remove esse overflow,
// sem depender de largura de tela.

const VAZIO = ''

// Um campo (pills | select | busca) — mesmo renderer pro modo desktop
// (sempre visível) e pro celular (barra medida + painel). Reaproveita
// .pill/.pill-group já existentes — nenhuma classe visual nova pra esses
// dois tipos. `desktop` só troca a largura do select/busca (flex elástico
// como as telas originais já usavam) e omite o rótulo em cima do campo.
function Campo({ item, valor, onValor, comLabel, desktop }) {
  if (item.tipo === 'pills') {
    return (
      <div>
        {comLabel && <div className="filtros-campo-label">{item.label}</div>}
        <div className="pill-group" role="group" aria-label={item.label}>
          {item.opcoes.map(op => (
            <button key={op.valor} type="button"
              className={`pill ${valor === op.valor ? 'active' : ''}`}
              aria-pressed={valor === op.valor}
              onClick={() => onValor(op.valor)}>
              {op.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (item.tipo === 'select') {
    return (
      <div>
        {comLabel && <label htmlFor={`filtro-${item.chave}`} className="filtros-campo-label">{item.label}</label>}
        <select id={`filtro-${item.chave}`} className={desktop ? 'input' : 'input filtros-select'}
          style={desktop ? { flex: 1, minWidth: item.larguraMin || 160 } : undefined}
          value={valor} onChange={e => onValor(e.target.value)} aria-label={comLabel ? undefined : item.label}>
          {item.opcoes.map(op => <option key={op.valor} value={op.valor}>{op.label}</option>)}
        </select>
      </div>
    )
  }
  // busca
  return (
    <div>
      {comLabel && <label htmlFor={`filtro-${item.chave}`} className="filtros-campo-label">{item.label}</label>}
      <input id={`filtro-${item.chave}`} className={desktop ? 'input' : 'input filtros-busca'} type="search"
        style={desktop ? { flex: 1, minWidth: item.larguraMin || 160 } : undefined}
        value={valor} onChange={e => onValor(e.target.value)}
        placeholder={item.placeholder || item.label} aria-label={item.label} />
    </div>
  )
}

function labelValor(item, valor) {
  if (!valor) return null
  if (item.tipo === 'busca') return valor
  const op = item.opcoes?.find(o => o.valor === valor)
  return op ? op.label : valor
}

// ── Modo desktop: TODOS os itens sempre visíveis, lado a lado, envolvendo
// linha — reprodução exata do que Rebanho.jsx/Feiras.jsx já faziam antes
// deste componente existir. Sem medição, sem painel, sem chips.
//
// "Limpar filtros" (2026-08-13): com 2+ itens combináveis, zerar um por um
// é ruim em qualquer tela, não só no celular (que já tinha "Limpar tudo"
// nos chips desde o início) — por isso mora aqui no componente, não numa
// tela específica. Só aparece quando compensa: 2+ itens (num filtro único,
// clicar "Todos"/"Todas as X" já limpa) e pelo menos um ativo.
function FiltrosDesktop({ itens, valores, onChange }) {
  const ativos = itens.filter(i => valores[i.chave])
  const limparTudo = () => itens.forEach(i => onChange(i.chave, VAZIO))
  return (
    <div className="filtros-wrap">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {itens.map(item => (
          <Campo key={item.chave} item={item} desktop valor={valores[item.chave] || VAZIO}
            onValor={(v) => onChange(item.chave, v)} />
        ))}
        {itens.length > 1 && ativos.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={limparTudo}>
            <i className="ti ti-x" /> Limpar filtros
          </button>
        )}
      </div>
    </div>
  )
}

// ── Modo celular: barra com medição real de largura (ResizeObserver) +
// botão "Filtros" (bottom sheet) pro que não coube + chips removíveis.
// `compacto` desliga a medição: nenhum item tenta a barra, todos vão direto
// pro painel — usado dentro de um <Modal>, onde a largura do container não
// é a largura real disponível pra decisão de layout (ver comentário no topo
// do arquivo).
function FiltrosMobile({ itens, valores, onChange, compacto = false }) {
  const barRef = useRef(null)
  const itemRefs = useRef({})
  const btnMedidorRef = useRef(null)
  const painelRef = useRef(null)
  const triggerRef = useRef(null)

  const [inlineKeys, setInlineKeys] = useState(() => compacto ? [] : itens.map(i => i.chave)) // otimista até medir 1x
  const [painelAberto, setPainelAberto] = useState(false)
  const [rascunho, setRascunho] = useState(null) // rascunho local do bottom sheet, só aplicado no "Aplicar"

  // Candidatos em ordem de prioridade: quick primeiro (na ordem declarada),
  // depois os demais (na ordem declarada) — é essa ordem que decide quem
  // tenta entrar na barra primeiro quando o espaço aperta.
  const candidatos = [...itens.filter(i => i.quick), ...itens.filter(i => !i.quick)]

  // ── Medição real de largura. Duas passadas: 1) tenta caber TODOS sem
  // reservar o botão "Filtros" — se couber tudo, o botão nem aparece.
  // 2) se não coube, refaz reservando a largura do botão e decide o corte.
  useLayoutEffect(() => {
    if (compacto) return
    const medir = () => {
      const bar = barRef.current
      if (!bar) return
      const disponivel = bar.clientWidth
      const GAP = 10
      const larguras = candidatos.map(c => itemRefs.current[c.chave]?.offsetWidth || 0)
      const somaTudo = larguras.reduce((s, w, i) => s + w + (i > 0 ? GAP : 0), 0)

      let novaChaves
      if (somaTudo <= disponivel) {
        novaChaves = candidatos.map(c => c.chave)
      } else {
        const larguraBtn = (btnMedidorRef.current?.offsetWidth || 0) + GAP
        let acumulado = 0
        const cabem = []
        for (let i = 0; i < candidatos.length; i++) {
          const w = larguras[i] + (cabem.length > 0 ? GAP : 0)
          if (acumulado + w + larguraBtn > disponivel) break
          acumulado += w
          cabem.push(candidatos[i].chave)
        }
        novaChaves = cabem
      }

      setInlineKeys(prev => {
        if (prev.length === novaChaves.length && prev.every((k, i) => k === novaChaves[i])) return prev
        return novaChaves
      })
    }

    medir()
    const ro = new ResizeObserver(medir)
    if (barRef.current) ro.observe(barRef.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens.map(i => `${i.chave}:${i.opcoes?.length ?? 0}`).join('|')])

  const inlineSet = new Set(inlineKeys)
  const itensInline = candidatos.filter(c => inlineSet.has(c.chave))
  const itensPainel = candidatos.filter(c => !inlineSet.has(c.chave))
  const temOverflow = itensPainel.length > 0

  const ativos = itens.filter(i => valores[i.chave])

  const limparTudo = () => {
    itens.forEach(i => onChange(i.chave, VAZIO))
    setPainelAberto(false)
  }

  const abrirPainel = () => {
    setRascunho({ ...valores })
    setPainelAberto(true)
  }

  const fecharPainel = () => {
    setPainelAberto(false)
    setRascunho(null)
    triggerRef.current?.focus()
  }

  const aplicarRascunho = () => {
    if (rascunho) Object.entries(rascunho).forEach(([chave, valor]) => onChange(chave, valor))
    setPainelAberto(false)
    setRascunho(null)
  }

  useEffect(() => {
    if (!painelAberto) return
    const onKey = (e) => { if (e.key === 'Escape') fecharPainel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelAberto])

  useEffect(() => {
    if (painelAberto) painelRef.current?.querySelector('button, select, input')?.focus()
  }, [painelAberto])

  return (
    <div className="filtros-wrap">
      <div className={`filtros-bar${compacto ? ' filtros-bar--compacto' : ''}`} ref={barRef}>
        {itensInline.map(item => (
          <Campo key={item.chave} item={item} valor={valores[item.chave] || VAZIO}
            onValor={(v) => onChange(item.chave, v)} />
        ))}

        {temOverflow && (
          <div className="filtros-panel-wrap">
            <button type="button" ref={triggerRef} className="filtros-btn"
              aria-haspopup="dialog" aria-expanded={painelAberto}
              onClick={() => painelAberto ? fecharPainel() : abrirPainel()}>
              <i className="ti ti-adjustments-horizontal" />
              Filtros
              {itensPainel.filter(i => valores[i.chave]).length > 0 && (
                <span className="filtros-btn-count">{itensPainel.filter(i => valores[i.chave]).length}</span>
              )}
            </button>

            {painelAberto && (
              <>
                <div className="filtros-backdrop" onClick={fecharPainel} />
                <div className="filtros-panel" ref={painelRef} role="dialog" aria-label="Mais filtros">
                  <div className="filtros-sheet-grabber" />
                  <div className="filtros-panel-title">Mais filtros</div>
                  <div className="filtros-panel-campos">
                    {itensPainel.map(item => (
                      <Campo key={item.chave} item={item} comLabel
                        valor={(rascunho?.[item.chave]) || VAZIO}
                        onValor={(v) => setRascunho(prev => ({ ...prev, [item.chave]: v }))} />
                    ))}
                  </div>
                  <div className="filtros-panel-foot">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={limparTudo}>Limpar</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={aplicarRascunho}>
                      Aplicar{ativos.length > 0 ? ` (${ativos.length})` : ''}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {ativos.length > 0 && (
        <div className="filtros-aplicados">
          <span className="filtros-aplicados-lbl">Filtrando por:</span>
          {ativos.map(item => (
            <span key={item.chave} className="filtros-chip">
              {item.label}: {labelValor(item, valores[item.chave])}
              <button type="button" className="filtros-chip-x"
                aria-label={`Remover filtro ${item.label}`}
                onClick={() => onChange(item.chave, VAZIO)}>
                <i className="ti ti-x" />
              </button>
            </span>
          ))}
          <button type="button" className="filtros-limpar" onClick={limparTudo}>Limpar tudo</button>
        </div>
      )}

      {/* Medidor invisível — só existe pra decidir o que cabe na barra;
          `compacto` nunca tenta a barra, então nunca precisa medir nada. */}
      {!compacto && (
      <div className="filtros-medidor" aria-hidden="true" inert="">
        {candidatos.map(item => (
          <div key={item.chave} ref={el => { itemRefs.current[item.chave] = el }} style={{ display: 'inline-block' }}>
            <Campo item={item} valor={valores[item.chave] || VAZIO} onValor={() => {}} />
          </div>
        ))}
        <button type="button" ref={btnMedidorRef} className="filtros-btn" tabIndex={-1}>
          <i className="ti ti-adjustments-horizontal" /> Filtros <span className="filtros-btn-count">9</span>
        </button>
      </div>
      )}
    </div>
  )
}

export default function Filtros({ itens, valores, onChange, compacto = false }) {
  const isMobile = useIsMobile()
  return (isMobile || compacto)
    ? <FiltrosMobile itens={itens} valores={valores} onChange={onChange} compacto={compacto} />
    : <FiltrosDesktop itens={itens} valores={valores} onChange={onChange} />
}
