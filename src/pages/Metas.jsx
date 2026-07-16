import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import {
  calcCategoria, calcGMD, calcTaxaPrenhez, contarPrenhas, contarExpostas, contarMatrizes,
  calcGestacaoLote, calcDesmameMetrics, calcIntervaloPartos, algumErro,
} from '../lib/helpers'
import { Loading, Modal, toast, BotaoPDF, EmptyState, ErroCarregamento, SeletorCicloLocal } from '../components/UI'
import { usePermissoes } from '../lib/PermissoesContext'
import { useCicloLocal } from '../lib/useCicloLocal'

// ── Metadata de cada indicador ────────────────────────────────────
// semDadosMsg: mensagem mostrada no lugar de "Sem dados suficientes" quando o
// indicador ainda não tem base pra ser avaliado (denominador 0 ou nenhum
// evento aconteceu ainda) — evita mostrar "meta batida" enganoso pra um 0%
// que na verdade é "ainda não sabemos".
const CFG = {
  taxa_prenhez:         { label: 'Taxa de Prenhez',         icon: '💉', inverted: false, desc: 'Prenhas / total de inseminadas no ciclo atual' },
  taxa_aproveitamento:  { label: 'Taxa de Aproveitamento',  icon: '🎯', inverted: false, desc: 'Matrizes expostas / matrizes aptas (fêmeas >24 meses na data da monta)' },
  taxa_paricao:         { label: 'Taxa de Parição',         icon: '🍼', inverted: false, desc: 'Partos / prenhas confirmadas (ciclo atual)', semDadosMsg: 'Aguardando partos' },
  gmd_terneiros:        { label: 'GMD Terneiros',           icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros com ≥2 pesagens' },
  kg_bezerro_matriz:    { label: 'Kg Desmamado / Matriz',   icon: '🐄', inverted: false, desc: 'Peso de desmame somado / matrizes expostas (ciclo atual)', semDadosMsg: 'Aguardando desmames' },
  intervalo_partos:     { label: 'Intervalo entre Partos',  icon: '📅', inverted: true,  desc: 'Média de dias entre partos consecutivos da mesma matriz (meta = máx. aceitável)', semDadosMsg: 'Precisa de matrizes com 2+ partos' },
  taxa_aborto:          { label: 'Perda Gestacional',       icon: '⚠️', inverted: true,  desc: 'Abortos + perdas não identificadas / prenhas — exclui gestações ainda em andamento', semDadosMsg: 'Aguardando desfechos da safra' },
  mortalidade:          { label: 'Mortalidade de Terneiros', icon: '📊', inverted: true,  desc: 'Mortos entre os terneiros nascidos na safra do ciclo (meta = máx. aceitável)', semDadosMsg: 'Aguardando nascimentos' },
}
const ORDEM = ['taxa_prenhez', 'taxa_aproveitamento', 'taxa_paricao', 'gmd_terneiros', 'kg_bezerro_matriz', 'intervalo_partos', 'taxa_aborto', 'mortalidade']
const IDEAIS = {
  taxa_prenhez: '90%', taxa_paricao: '85%', gmd_terneiros: '0,8', mortalidade: '5%',
  taxa_aproveitamento: '100%', kg_bezerro_matriz: '>160kg', intervalo_partos: '~365d', taxa_aborto: '<5%',
}
// Usados só para auto-criar a linha do indicador na tabela `metas` na primeira
// vez que a tela carrega (a tabela não tem seed automático) — o usuário pode
// ajustar o valor depois em "Editar metas".
const DEFAULTS_NOVOS_INDICADORES = {
  taxa_aproveitamento: { unidade: '%',    valor_meta: 100 },
  kg_bezerro_matriz:   { unidade: 'kg',   valor_meta: 160 },
  intervalo_partos:    { unidade: 'dias', valor_meta: 365 },
  taxa_aborto:         { unidade: '%',    valor_meta: 5   },
}
// Unidade padrão de cada indicador — usada quando ainda não existe uma linha
// salva no banco (card "virtual"), pra sempre ter algo pra mostrar/editar.
const UNIDADES_PADRAO = {
  taxa_prenhez: '%', taxa_paricao: '%', mortalidade: '%',
  gmd_terneiros: 'kg/dia',
  taxa_aproveitamento: '%', kg_bezerro_matriz: 'kg', intervalo_partos: 'dias', taxa_aborto: '%',
}

// ── Avalia status da meta ─────────────────────────────────────────
function avaliar(atual, meta, inverted) {
  if (atual === null || meta === null || meta === 0) return 'sem-dado'
  if (inverted) return atual <= meta ? 'verde' : atual <= meta * 1.1 ? 'amarelo' : 'vermelho'
  const pct = (atual / meta) * 100
  return pct >= 100 ? 'verde' : pct >= 90 ? 'amarelo' : 'vermelho'
}

function statusSty(s, semDadosMsg) {
  if (s === 'verde')    return { dot: '#27A838', bg: '#E8F0FC', borda: '#A5C8F5', cor: '#1A5C25', txt: 'Atingiu a meta'       }
  if (s === 'amarelo')  return { dot: '#D97706', bg: '#FEF3C7', borda: '#F3D5A3', cor: '#633806', txt: 'Próximo da meta'      }
  if (s === 'vermelho') return { dot: '#E24B4A', bg: '#FCEBEB', borda: '#F5B5B5', cor: '#791F1F', txt: 'Abaixo da meta'      }
  return                        { dot: '#9CA3AF', bg: '#F9FAFB', borda: '#E5E7EB', cor: '#6B7280', txt: semDadosMsg || 'Sem dados suficientes' }
}

// ── Card de indicador ─────────────────────────────────────────────
function IndicadorCard({ meta, atual }) {
  const cfg    = CFG[meta.indicador] || {}
  const status = avaliar(atual, meta.valor_meta, cfg.inverted)
  const sty    = statusSty(status, cfg.semDadosMsg)

  const fmtVal  = (v) => (v === null || isNaN(v)) ? null : meta.unidade === 'kg/dia' ? v.toFixed(3) : v.toFixed(1)
  const atualFmt = fmtVal(atual)
  const metaFmt  = meta.valor_meta != null ? fmtVal(parseFloat(meta.valor_meta)) : null

  // Barra: quanto do alvo foi atingido (0-100%)
  const barPct = (atual !== null && meta.valor_meta > 0)
    ? Math.min(100, cfg.inverted
        ? (atual === 0 ? 100 : (meta.valor_meta / atual) * 100)
        : (atual / meta.valor_meta) * 100)
    : 0

  return (
    <div className="card" style={{ borderTop: `3px solid ${sty.dot}`, position: 'relative' }}>
      {/* Semáforo dot */}
      <div style={{
        position: 'absolute', top: 14, right: 14,
        width: 14, height: 14, borderRadius: '50%',
        background: sty.dot, boxShadow: `0 0 8px ${sty.dot}80`
      }} />

      <div style={{ fontSize: 20, marginBottom: 4 }}>{cfg.icon}</div>
      <div className="card-title" style={{ marginBottom: 3, paddingRight: 24 }}>{cfg.label}</div>
      <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginBottom: 14 }}>{cfg.desc}</div>

      {/* Valores */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: sty.cor, lineHeight: 1.1 }}>
            {atualFmt !== null ? `${atualFmt}` : '—'}&nbsp;
            <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{meta.unidade}</span>
          </div>
          <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginTop: 3 }}>Valor atual</div>
        </div>
        <div style={{ borderLeft: '1.5px solid #F3F4F6', paddingLeft: 20 }}>
          <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#9CA3AF', lineHeight: 1.1 }}>
            {metaFmt !== null ? `${metaFmt}` : 'Sem meta'}&nbsp;
            {metaFmt !== null && <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{meta.unidade}</span>}
          </div>
          <div style={{ fontSize: '.71rem', color: '#9CA3AF', marginTop: 3 }}>Meta</div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${barPct}%`, borderRadius: 4,
            background: sty.dot, transition: 'width .6s ease'
          }} />
        </div>
        <div style={{ fontSize: '.70rem', color: '#9CA3AF', marginTop: 3 }}>
          {atual !== null ? `${barPct.toFixed(0)}% da meta${cfg.inverted ? ' (menor = melhor)' : ''}` : 'Sem dados'}
        </div>
      </div>

      {/* Badge de status */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: sty.bg, color: sty.cor,
        borderRadius: 8, padding: '4px 10px', fontSize: '.75rem', fontWeight: 600
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sty.dot, flexShrink: 0 }} />
        {sty.txt}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Metas() {
  const contentRef = useRef(null)

  const [loading,      setLoading]      = useState(true)
  const [metas,        setMetas]        = useState([])
  const [atuais,       setAtuais]       = useState({})
  const [semTabela,    setSemTabela]    = useState(false)
  const [loadError,    setLoadError]    = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [editVals,     setEditVals]     = useState({})
  const [salvandoMeta, setSalvandoMeta] = useState(false)
  const [proprietarios, setProprietarios] = useState([])
  const [filtroProp,    setFiltroProp]    = useState('')

  const { podeEditar } = usePermissoes()
  const podeEditarMetas = podeEditar('metas')
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  useEffect(() => { loadAll() }, [cicloLocal?.id, filtroProp])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Metas da tabela (metasErr = tabela não existe, não é erro de rede)
      const { data: metasDataRaw, error: metasErr } = await db.metas.list()
      if (metasErr) {
        setSemTabela(true)
        return
      }
      let metasData = metasDataRaw || []

      // Auto-cria a linha dos indicadores novos na primeira vez que a tela
      // carrega nesta conta/fazenda (a tabela `metas` não tem seed automático,
      // e o campo `indicador` é texto livre — não precisa de ALTER no banco).
      // O usuário ajusta o valor-alvo depois em "Editar metas".
      if (podeEditarMetas) {
        const existentes = new Set(metasData.map(m => m.indicador))
        const faltantes = Object.keys(DEFAULTS_NOVOS_INDICADORES).filter(k => !existentes.has(k))
        if (faltantes.length > 0) {
          const criadas = await Promise.all(
            faltantes.map(ind => db.metas.insert({ indicador: ind, ...DEFAULTS_NOVOS_INDICADORES[ind] }))
          )
          metasData = [...metasData, ...criadas.filter(r => !r.error && r.data).map(r => r.data)]
        }
      }
      setMetas(metasData)

      // Ciclo selecionado localmente na tela (SeletorCicloLocal), inicia a
      // partir do ciclo global mas pode ser trocado sem afetar o resto do app.
      const ciclo = cicloLocal

      // Carregar dados para cálculo em paralelo. lotesInseminacao.list traz o
      // funil completo (inseminações + partos + abortos + pesagens de desmame
      // do bezerro) — mesma fonte usada em Reprodutivo.jsx, pra não divergir.
      const resultados = await Promise.all([
        ciclo ? db.lotesInseminacao.list(ciclo.id) : { data: [] },
        db.partos.listAll(),
        db.animais.list(),
        db.pesagens.listAll(),
        db.proprietarios.list(),
      ])
      if (algumErro('[Metas]', resultados)) { setLoadError(true); return }
      const [rLotes, rPartosTodos, rAnimais, rPesagens, rProps] = resultados
      setProprietarios(rProps.data || [])

      const lotesCiclo    = rLotes.data       || []
      const todosAnimais  = rAnimais.data     || []
      const todasPesagens = rPesagens.data    || []
      const todosPartos   = rPartosTodos.data || []

      // Filtro por proprietário — mesmo padrão usado em Rebanho/Reprodutivo
      // (via animal.proprietario_id, embutido nos embeds da query).
      const filtrar = (arr, getPropId) => filtroProp ? arr.filter(x => getPropId(x) === filtroProp) : arr

      // ── taxa_prenhez / taxa_aproveitamento (fórmulas oficiais — helpers) ──
      // prenhas deduplica por animal_id (contarPrenhas), senão nem o número bate
      // com taxaPrenhez nem os denominadores dos indicadores abaixo ficam corretos.
      const todasInseminacoes = filtrar(lotesCiclo.flatMap(l => l.inseminacoes || []), i => i.animal?.proprietario_id)
      const prenhas           = contarPrenhas(todasInseminacoes)
      const matrizesExpostas  = contarExpostas(todasInseminacoes)
      const taxaPrenhez       = calcTaxaPrenhez(todasInseminacoes)

      const primeiraMontaCiclo = lotesCiclo.map(l => l.data).filter(Boolean).sort()[0] || null
      const animaisFiltrados   = filtroProp ? todosAnimais.filter(a => a.proprietario_id === filtroProp) : todosAnimais
      const matrizesAptas      = primeiraMontaCiclo ? contarMatrizes(animaisFiltrados, primeiraMontaCiclo) : 0
      const taxaAproveitamento = matrizesAptas > 0 ? (matrizesExpostas / matrizesAptas) * 100 : null

      // ── taxa_paricao / kg_bezerro_matriz — partos ANCORADOS no lote (safra da
      // monta), igual ao funil do Reprodutivo: os partos podem cair no ciclo
      // seguinte, mas pertencem à safra da monta deste ciclo.
      const partosSafra = filtrar(lotesCiclo.flatMap(l => l.partos || []), p => p.mae?.proprietario_id)
      const nPartos      = partosSafra.length
      // Guardado por nPartos > 0: com prenhas>0 mas zero partos ainda, a safra
      // só está em andamento — 0% pareceria "parição ruim" quando na verdade é
      // "ainda não tem o que medir".
      const taxaParicao  = (prenhas > 0 && nPartos > 0) ? (nPartos / prenhas) * 100 : null
      const kgBezerroMatriz = calcDesmameMetrics(partosSafra, matrizesExpostas).kgPorMatrizExposta

      // ── taxa_aborto (perda gestacional) — soma "gestando" lote a lote, pois
      // cada lote (IATF/repasse) tem sua própria data de monta; helpers.
      // calcGestacaoLote é a MESMA fórmula corrigida usada em Reprodutivo.jsx.
      const abortosSafra = filtrar(lotesCiclo.flatMap(l => l.abortos || []), a => a.animal?.proprietario_id)
      const nAbortos = abortosSafra.length
      let gestandoTotal = 0
      lotesCiclo.forEach(l => {
        const insLote     = filtrar(l.inseminacoes || [], i => i.animal?.proprietario_id)
        const partosLote  = filtrar(l.partos || [],       p => p.mae?.proprietario_id)
        const abortosLote = filtrar(l.abortos || [],      a => a.animal?.proprietario_id)
        gestandoTotal += calcGestacaoLote(l.data, contarPrenhas(insLote), partosLote.length, abortosLote.length).gestando
      })
      const perdasNaoIdentificadas = Math.max(0, prenhas - nPartos - nAbortos - gestandoTotal)
      // Guardado por "algum desfecho já aconteceu" (nPartos+nAbortos+perdas > 0):
      // se todas as prenhas ainda estão gestando, 0% de perda é prematuro, não
      // uma avaliação real da safra.
      const desfechosResolvidos = nPartos + nAbortos + perdasNaoIdentificadas
      const taxaAborto = (prenhas > 0 && desfechosResolvidos > 0) ? ((nAbortos + perdasNaoIdentificadas) / prenhas) * 100 : null

      // ── intervalo_partos — todo o histórico (não só este ciclo), mesma mãe.
      const partosParaIntervalo = filtroProp ? todosPartos.filter(p => p.mae?.proprietario_id === filtroProp) : todosPartos
      const { media: intervaloPartosDias } = calcIntervaloPartos(partosParaIntervalo)

      // ── gmd_terneiros ──
      const terneiros = animaisFiltrados.filter(a =>
        a.situacao === 'ativo' &&
        ['Terneiro', 'Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo))
      )
      const gmdsT = []
      for (const t of terneiros) {
        const ps = todasPesagens.filter(p => p.animal_id === t.id).sort((a, b) => a.data.localeCompare(b.data))
        const g = parseFloat(calcGMD(ps))
        if (g > 0) gmdsT.push(g)
      }
      const gmdTerneiros = gmdsT.length ? gmdsT.reduce((s, v) => s + v, 0) / gmdsT.length : null

      // ── mortalidade (de bezerros da safra, não do rebanho geral) — só avalia
      // depois que nasceu o primeiro bezerro da safra/ciclo (nPartos > 0);
      // mesma base de dados (partosSafra) usada em taxa_paricao/kg_bezerro_matriz.
      const mortosBezerros = partosSafra.filter(p => p.bezerro?.situacao === 'morto').length
      const mortalidade = nPartos > 0 ? (mortosBezerros / nPartos) * 100 : null

      setAtuais({
        taxa_prenhez: taxaPrenhez, taxa_paricao: taxaParicao, gmd_terneiros: gmdTerneiros, mortalidade,
        taxa_aproveitamento: taxaAproveitamento, kg_bezerro_matriz: kgBezerroMatriz,
        intervalo_partos: intervaloPartosDias, taxa_aborto: taxaAborto,
      })
    } catch (e) {
      console.error('[Metas] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = () => {
    const vals = {}
    metasOrdenadas.forEach(m => { vals[m.id] = m.valor_meta != null ? String(m.valor_meta) : '' })
    setEditVals(vals)
    setEditOpen(true)
  }

  // Linhas "virtuais" (sem id real na tabela `metas`) são CRIADAS ao salvar, não
  // atualizadas — cobre o caso de a auto-criação no load não ter rodado (usuário
  // sem permissão na hora, ou insert falhou) sem depender de rodar SQL manual.
  const salvarMetas = async () => {
    if (!podeEditarMetas) return
    setSalvandoMeta(true)
    for (const m of metasOrdenadas) {
      const novo = parseFloat(editVals[m.id])
      if (isNaN(novo)) continue
      if (m._virtual) {
        await db.metas.insert({ indicador: m.indicador, unidade: m.unidade, valor_meta: novo })
      } else if (novo !== parseFloat(m.valor_meta)) {
        await db.metas.update(m.id, { valor_meta: novo })
      }
    }
    setSalvandoMeta(false)
    toast('Metas atualizadas!')
    setEditOpen(false)
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  if (semTabela) {
    return (
      <EmptyState
        icon="🎯"
        title="Tabela de metas não encontrada"
        sub="Execute o SQL de criação da tabela no painel do Supabase para habilitar esta página."
      />
    )
  }

  // Card aparece pra TODO indicador em ORDEM, mesmo sem linha salva na tabela
  // `metas` (ex: auto-criação falhou, ou o usuário não tem permissão de editar
  // metas). Sem isso, um indicador sem meta salva simplesmente não renderizava
  // — o card não pode depender de existir uma meta, só o "Meta: —" depende.
  const metasOrdenadas = ORDEM.map(ind =>
    metas.find(m => m.indicador === ind) ||
    { id: `virtual-${ind}`, indicador: ind, valor_meta: null, unidade: UNIDADES_PADRAO[ind] || '', _virtual: true }
  )

  // Sumário
  const statuses = metasOrdenadas.map(m => avaliar(atuais[m.indicador], m.valor_meta, CFG[m.indicador]?.inverted))
  const nVerde    = statuses.filter(s => s === 'verde').length
  const nAmarelo  = statuses.filter(s => s === 'amarelo').length
  const nVermelho = statuses.filter(s => s === 'vermelho').length

  return (
    <div>
      {/* Seletor de ciclo */}
      <div style={{ marginBottom: 12 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      {/* Filtro por proprietário */}
      <div className="pill-group" style={{ marginBottom: 12 }}>
        <button className={`pill ${!filtroProp ? 'active' : ''}`} onClick={() => setFiltroProp('')}>Todos</button>
        {proprietarios.map(p => (
          <button key={p.id} className={`pill ${filtroProp === p.id ? 'active' : ''}`} onClick={() => setFiltroProp(p.id)}>
            {p.nome.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Ciclo + sumário */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '.82rem', color: '#6B7280' }}>
          <span style={{ color: '#27A838', fontWeight: 600 }}>{nVerde} ✓</span>
          {' · '}
          <span style={{ color: '#D97706', fontWeight: 600 }}>{nAmarelo} ⚠</span>
          {' · '}
          <span style={{ color: '#E24B4A', fontWeight: 600 }}>{nVermelho} ✗</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {podeEditarMetas && (
            <button className="btn btn-secondary btn-sm" onClick={openEdit}>
              <i className="ti ti-settings" /> Editar metas
            </button>
          )}
          <BotaoPDF contentRef={contentRef} filename="metas-indicadores" titulo="Metas: Indicadores" />
        </div>
      </div>

      {/* Cards */}
      <div ref={contentRef} style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 14
      }}>
        {metasOrdenadas.map(m => (
          <IndicadorCard key={m.id} meta={m} atual={atuais[m.indicador] ?? null} />
        ))}
      </div>

      {/* Modal edição de metas */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar metas" width={440}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {metasOrdenadas.map(m => {
            const cfg = CFG[m.indicador] || {}
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{cfg.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 500, color: '#374151', marginBottom: 3 }}>
                    {cfg.label}
                    {cfg.inverted && <span style={{ fontSize: '.70rem', color: '#9CA3AF', marginLeft: 6 }}>(menor é melhor)</span>}
                    {IDEAIS[m.indicador] && <span style={{ fontSize: '.70rem', color: '#9CA3AF', marginLeft: 6 }}>(ideal: {IDEAIS[m.indicador]})</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <input
                    type="number" step="0.01" min="0"
                    value={editVals[m.id] ?? ''}
                    onChange={e => setEditVals(p => ({ ...p, [m.id]: e.target.value }))}
                    style={{ width: 90, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: '.78rem', color: '#9CA3AF', minWidth: 44 }}>{m.unidade}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn btn-primary" onClick={salvarMetas} disabled={salvandoMeta}>
            {salvandoMeta ? 'Salvando...' : <><i className="ti ti-check" /> Salvar metas</>}
          </button>
          <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
