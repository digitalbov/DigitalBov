import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { calcCategoria, calcGMD, calcTaxaPrenhez } from '../lib/helpers'
import { Loading, Modal, toast, BotaoPDF, EmptyState, ErroCarregamento } from '../components/UI'
import { usePermissoes } from '../lib/PermissoesContext'

// ── Metadata de cada indicador ────────────────────────────────────
const CFG = {
  taxa_prenhez:  { label: 'Taxa de Prenhez',  icon: '💉', inverted: false, desc: 'Prenhas / total de inseminadas no ciclo atual' },
  taxa_paricao:  { label: 'Taxa de Parição',  icon: '🍼', inverted: false, desc: 'Partos / prenhas confirmadas (ciclo atual)' },
  gmd_terneiros: { label: 'GMD Terneiros',    icon: '⚖️', inverted: false, desc: 'GMD médio dos terneiros com ≥2 pesagens' },
  mortalidade:   { label: 'Mortalidade',      icon: '📊', inverted: true,  desc: 'Mortos / total registrado (meta = máx. aceitável)' },
}
const ORDEM = ['taxa_prenhez', 'taxa_paricao', 'gmd_terneiros', 'mortalidade']
const IDEAIS = { taxa_prenhez: '90%', taxa_paricao: '85%', gmd_terneiros: '0,8', mortalidade: '5%' }

// ── Avalia status da meta ─────────────────────────────────────────
function avaliar(atual, meta, inverted) {
  if (atual === null || meta === null || meta === 0) return 'sem-dado'
  if (inverted) return atual <= meta ? 'verde' : atual <= meta * 1.1 ? 'amarelo' : 'vermelho'
  const pct = (atual / meta) * 100
  return pct >= 100 ? 'verde' : pct >= 90 ? 'amarelo' : 'vermelho'
}

function statusSty(s) {
  if (s === 'verde')    return { dot: '#27A838', bg: '#E8F0FC', borda: '#A5C8F5', cor: '#1A5C25', txt: 'Atingiu a meta'       }
  if (s === 'amarelo')  return { dot: '#D97706', bg: '#FEF3C7', borda: '#F3D5A3', cor: '#633806', txt: 'Próximo da meta'      }
  if (s === 'vermelho') return { dot: '#E24B4A', bg: '#FCEBEB', borda: '#F5B5B5', cor: '#791F1F', txt: 'Abaixo da meta'      }
  return                        { dot: '#9CA3AF', bg: '#F9FAFB', borda: '#E5E7EB', cor: '#6B7280', txt: 'Sem dados suficientes' }
}

// ── Card de indicador ─────────────────────────────────────────────
function IndicadorCard({ meta, atual }) {
  const cfg    = CFG[meta.indicador] || {}
  const status = avaliar(atual, meta.valor_meta, cfg.inverted)
  const sty    = statusSty(status)

  const fmtVal  = (v) => v === null ? null : meta.unidade === 'kg/dia' ? v.toFixed(3) : v.toFixed(1)
  const atualFmt = fmtVal(atual)
  const metaFmt  = fmtVal(parseFloat(meta.valor_meta))

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
            {metaFmt}&nbsp;
            <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{meta.unidade}</span>
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
  const [cicloNome,    setCicloNome]    = useState('')
  const [semTabela,    setSemTabela]    = useState(false)
  const [loadError,    setLoadError]    = useState(false)
  const [editOpen,     setEditOpen]     = useState(false)
  const [editVals,     setEditVals]     = useState({})
  const [salvandoMeta, setSalvandoMeta] = useState(false)

  const { podeEditar } = usePermissoes()
  const podeEditarMetas = podeEditar('metas')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Metas da tabela (metasErr = tabela não existe, não é erro de rede)
      const { data: metasData, error: metasErr } = await db.metas.list()
      if (metasErr) {
        setSemTabela(true)
        return
      }
      setMetas(metasData || [])

      // Ciclo atual
      const { data: ciclo } = await db.ciclos.current()
      setCicloNome(ciclo?.nome || '')

      // Carregar dados para cálculo em paralelo
      const [rLotes, rPartos, rAnimais, rPesagens] = await Promise.all([
        ciclo ? db.lotesInseminacao.list(ciclo.id) : { data: [] },
        ciclo ? db.partos.list(ciclo.id)           : { data: [] },
        db.animais.list(),
        db.pesagens.listAll()
      ])

      // ── taxa_prenhez (fórmula oficial única — helpers.calcTaxaPrenhez) ──
      const todasInseminacoes = (rLotes.data || []).flatMap(lote => lote.inseminacoes || [])
      const prenhas      = todasInseminacoes.filter(i => i.diagnostico === 'P').length
      const taxaPrenhez  = calcTaxaPrenhez(todasInseminacoes)

      // ── taxa_paricao ──
      const nPartos     = (rPartos.data || []).length
      const taxaParicao = prenhas > 0 ? (nPartos / prenhas) * 100 : null

      // ── gmd_terneiros ──
      const todosAnimais  = rAnimais.data  || []
      const todasPesagens = rPesagens.data || []

      const terneiros = todosAnimais.filter(a =>
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

      // ── mortalidade ──
      const mortos   = todosAnimais.filter(a => a.situacao === 'morto').length
      const totalReg = todosAnimais.filter(a => a.situacao === 'ativo' || a.situacao === 'morto').length
      const mortalidade = totalReg > 0 ? (mortos / totalReg) * 100 : null

      setAtuais({ taxa_prenhez: taxaPrenhez, taxa_paricao: taxaParicao, gmd_terneiros: gmdTerneiros, mortalidade })
    } catch (e) {
      console.error('[Metas] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = () => {
    const vals = {}
    metas.forEach(m => { vals[m.id] = String(m.valor_meta) })
    setEditVals(vals)
    setEditOpen(true)
  }

  const salvarMetas = async () => {
    if (!podeEditarMetas) return
    setSalvandoMeta(true)
    for (const m of metas) {
      const novo = parseFloat(editVals[m.id])
      if (!isNaN(novo) && novo !== parseFloat(m.valor_meta)) {
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

  const metasOrdenadas = ORDEM.map(ind => metas.find(m => m.indicador === ind)).filter(Boolean)

  // Sumário
  const statuses = metasOrdenadas.map(m => avaliar(atuais[m.indicador], m.valor_meta, CFG[m.indicador]?.inverted))
  const nVerde    = statuses.filter(s => s === 'verde').length
  const nAmarelo  = statuses.filter(s => s === 'amarelo').length
  const nVermelho = statuses.filter(s => s === 'vermelho').length

  return (
    <div>
      {/* Ciclo + sumário */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '.82rem', color: '#6B7280' }}>
          {cicloNome && <>Ciclo: <strong style={{ color: '#111827' }}>{cicloNome}</strong> · </>}
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
