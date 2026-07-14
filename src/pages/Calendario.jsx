import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { fmtData, algumErro } from '../lib/helpers'
import { Loading, BotaoPDF, EmptyState, ErroCarregamento, SeletorCicloLocal } from '../components/UI'
import { useCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { addDays, parseISO, differenceInDays } from 'date-fns'

// ── Urgência ──────────────────────────────────────────────────────
function getUrg(dias) {
  if (dias === null) return { label: '—',                            color: '#9CA3AF', bg: '#F9FAFB', borda: '#E5E7EB' }
  if (dias < 0)     return { label: `${Math.abs(dias)}d atraso`,    color: '#791F1F', bg: '#FCEBEB', borda: '#F5B5B5' }
  if (dias === 0)   return { label: 'Hoje!',                         color: '#92400E', bg: '#FEF3C7', borda: '#FBBF24' }
  if (dias <= 7)    return { label: `Em ${dias} dia${dias===1?'':'s'}`, color: '#633806', bg: '#FAEEDA', borda: '#F3D5A3' }
  if (dias <= 30)   return { label: `Em ${dias} dias`,              color: '#1E55B0', bg: '#E8F0FC', borda: '#A5C8F5' }
  return              { label: `Em ${dias} dias`,                   color: '#4B5563', bg: '#F9FAFB', borda: '#E5E7EB' }
}

const TIPO_BADGE = {
  parto:    { label: 'Parto',    bg: '#E8F0FC', cor: '#1E55B0' },
  sanidade: { label: 'Sanidade', bg: '#E6F1FB', cor: '#0C447C' },
  estoque:  { label: 'Estoque',  bg: '#FAEEDA', cor: '#633806' },
}

// ── Card de evento ────────────────────────────────────────────────
function EventoCard({ ev }) {
  const urg   = getUrg(ev.dias)
  const badge = TIPO_BADGE[ev.tipo]
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '11px 14px',
      background: urg.bg, border: `.5px solid ${urg.borda}`,
      borderLeft: `3px solid ${urg.color}`,
      borderRadius: 10, marginBottom: 7, alignItems: 'flex-start'
    }}>
      <div style={{ fontSize: 18, flexShrink: 0, lineHeight: 1, marginTop: 2 }}>{ev.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: '.87rem', color: '#111827' }}>{ev.titulo}</div>
        {ev.descricao && (
          <div style={{ fontSize: '.76rem', color: '#6B7280', marginTop: 2 }}>{ev.descricao}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.71rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
            <i className="ti ti-calendar" style={{ fontSize: 10 }} />{fmtData(ev.data)}
          </span>
          {badge && (
            <span style={{ fontSize: '.67rem', fontWeight: 600, background: badge.bg, color: badge.cor, borderRadius: 5, padding: '1px 6px' }}>
              {badge.label}
            </span>
          )}
        </div>
      </div>
      <div style={{
        flexShrink: 0, background: urg.color, color: 'white',
        borderRadius: 7, padding: '3px 9px', fontSize: '.71rem', fontWeight: 700, whiteSpace: 'nowrap'
      }}>
        {urg.label}
      </div>
    </div>
  )
}

// ── Card de vazia (pendência sem data) ────────────────────────────
function VaziaCard({ animal }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 14px',
      background: '#EEEDFE', border: '.5px solid #C4BBFC',
      borderLeft: '3px solid #8B5CF6', borderRadius: 10, marginBottom: 6, alignItems: 'center'
    }}>
      <span style={{ fontSize: 16 }}>🔄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: '.87rem', color: '#111827' }}>
          Brinco {animal.brinco} — Incluir no próximo lote de inseminação
        </div>
        <div style={{ fontSize: '.76rem', color: '#6B7280', marginTop: 2 }}>
          {animal.proprietario?.nome || '?'}{animal.lote?.nome ? ` · ${animal.lote.nome}` : ''} · Situação reprodutiva: Vazia
        </div>
      </div>
      <div style={{
        flexShrink: 0, background: '#8B5CF6', color: 'white',
        borderRadius: 7, padding: '3px 9px', fontSize: '.71rem', fontWeight: 700
      }}>
        Pendente
      </div>
    </div>
  )
}

// ── Rótulo de seção ───────────────────────────────────────────────
function SecLabel({ children, color, mt = 0 }) {
  return (
    <div style={{
      fontSize: '.72rem', fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase',
      color: color || '#9CA3AF', marginBottom: 8, marginTop: mt
    }}>
      {children}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export default function Calendario() {
  const agendaRef = useRef(null)

  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [eventos,   setEventos]  = useState([])
  const [vazias,    setVazias]   = useState([])
  const [filtTipo,  setFiltTipo] = useState('todos')

  const { dentroDoCiclo } = useCiclo()
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

      const diasAte = (dateStr) => {
        if (!dateStr) return null
        try { return differenceInDays(parseISO(dateStr), hoje) }
        catch { return null }
      }

      const previaParto = (dataIns) => {
        if (!dataIns) return null
        try { return addDays(parseISO(dataIns), 283).toISOString().split('T')[0] }
        catch { return null }
      }

      const resultados = await Promise.all([
        db.lotesInseminacao.listInseminacoesResumo(),
        db.sanidade.list(),
        db.estoque.list(),
        db.animais.list({ situacao: 'ativo' })
      ])
      if (algumErro('[Calendario]', resultados)) { setLoadError(true); return }
      const [rLotes, rSanidade, rEstoque, rAnimais] = resultados

      const evs = []

      // a. Previsões de parto (inseminação + 283 dias) por animal prenho
      for (const lote of (rLotes.data || [])) {
        const prenhas = (lote.inseminacoes || []).filter(i => i.diagnostico === 'P')
        if (!prenhas.length) continue
        const dataPrev = previaParto(lote.data)
        const dias     = diasAte(dataPrev)
        for (const ins of prenhas) {
          evs.push({
            tipo: 'parto', icon: '🍼',
            titulo:    `Previsão de parto — Brinco ${ins.animal?.brinco || '?'}`,
            descricao: `Lote ${lote.numero} · Touro ${lote.touro || '?'} · Inseminado em ${fmtData(lote.data)}`,
            data: dataPrev, dias
          })
        }
      }

      // b. Próximos procedimentos sanitários (campo "proximo" preenchido)
      for (const proc of (rSanidade.data || [])) {
        if (!proc.proximo) continue
        const dias = diasAte(proc.proximo)
        const titulo = [proc.tipo, proc.procedimento].filter(Boolean).join(' — ')
        evs.push({
          tipo: 'sanidade', icon: '💉',
          titulo:    titulo || 'Procedimento sanitário',
          descricao: `Realizado em ${fmtData(proc.data)}`,
          data: proc.proximo, dias
        })
      }

      // c. Vencimentos de estoque (validade preenchida)
      for (const item of (rEstoque.data || [])) {
        if (!item.validade) continue
        const dias = diasAte(item.validade)
        evs.push({
          tipo: 'estoque', icon: '📦',
          titulo:    `Validade — ${item.item}`,
          descricao: `Estoque: ${parseFloat(item.quantidade).toFixed(1)} ${item.unidade} · ${item.categoria}`,
          data: item.validade, dias
        })
      }

      // Ordenar: menor dias (mais urgente) primeiro; null no final
      evs.sort((a, b) => {
        const va = a.dias ?? 99999
        const vb = b.dias ?? 99999
        return va - vb
      })

      // d. Pendências sem data — vacas vazias ativas
      const anVazias = (rAnimais.data || [])
        .filter(a => a.sexo === 'F' && a.sit_reprodutiva === 'vazia')

      setEventos(evs)
      setVazias(anVazias)
    } catch (e) {
      console.error('[Calendario] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadData} />

  // Eventos dentro do ciclo local selecionado
  const eventosCiclo = eventos.filter(e => cicloLocal && dentroDoCiclo(e.data, cicloLocal))

  // Filtros aplicados
  const filtrados = filtTipo === 'todos' ? eventosCiclo : eventosCiclo.filter(e => e.tipo === filtTipo)
  const overdue   = filtrados.filter(e => e.dias !== null && e.dias < 0)
  const upcoming  = filtrados.filter(e => e.dias === null || e.dias >= 0)
  const mostrarVazias = filtTipo === 'todos' || filtTipo === 'reproducao'

  // KPIs (sempre sobre o total do ciclo, independente do filtro de tipo)
  const kpiAtrasados = eventosCiclo.filter(e => e.dias !== null && e.dias < 0).length
  const kpiSemana    = eventosCiclo.filter(e => e.dias !== null && e.dias >= 0 && e.dias <= 7).length
  const kpiMes       = eventosCiclo.filter(e => e.dias !== null && e.dias > 7 && e.dias <= 30).length
  const kpiTotal     = eventosCiclo.length + vazias.length

  const totalVisiveis = filtrados.length + (mostrarVazias ? vazias.length : 0)

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      {/* ── KPI cards ── */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {[
          { v: kpiAtrasados, label: 'Atrasados / Vencidos', icon: '⚠️', color: '#791F1F', bg: '#FCEBEB' },
          { v: kpiSemana,    label: 'Esta semana (7d)',      icon: '📅', color: '#633806', bg: '#FAEEDA' },
          { v: kpiMes,       label: 'Este mês (30d)',        icon: '📆', color: '#1E55B0', bg: '#E8F0FC' },
          { v: kpiTotal,     label: 'Total de eventos',      icon: '📋', color: '#2B6CD9', bg: 'white'  },
        ].map(k => (
          <div key={k.label} className="kpi-card" style={{ background: k.v > 0 ? k.bg : 'white' }}>
            <div className="kpi-icon" style={{ background: k.bg, fontSize: 15 }}>{k.icon}</div>
            <div className="kpi-value" style={{ color: k.v > 0 ? k.color : '#9CA3AF' }}>{k.v}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filtros + PDF ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="pill-group">
          {[
            { key: 'todos',      icon: '',    label: 'Todos'      },
            { key: 'parto',      icon: '🍼 ', label: 'Partos'     },
            { key: 'sanidade',   icon: '💉 ', label: 'Sanidade'   },
            { key: 'estoque',    icon: '📦 ', label: 'Estoque'    },
            { key: 'reproducao', icon: '🔄 ', label: 'Reprodução' },
          ].map(t => (
            <button key={t.key} className={`pill ${filtTipo === t.key ? 'active' : ''}`}
              onClick={() => setFiltTipo(t.key)}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        <BotaoPDF contentRef={agendaRef} filename="agenda-fazenda" titulo="Calendário: Agenda" />
      </div>

      {/* ── Conteúdo ── */}
      <div ref={agendaRef}>
        {totalVisiveis === 0 ? (
          <EmptyState icon="✅" title="Tudo em dia!" sub="Nenhum evento pendente para este filtro." />
        ) : (
          <>
            {/* Seção: Atrasados / Vencidos */}
            {overdue.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SecLabel color="#791F1F">⚠️ Atrasados / Vencidos ({overdue.length})</SecLabel>
                {overdue.map((ev, i) => <EventoCard key={`o${i}`} ev={ev} />)}
              </div>
            )}

            {/* Seção: Próximos eventos */}
            {upcoming.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <SecLabel mt={overdue.length > 0 ? 4 : 0}>
                  📅 Próximos eventos ({upcoming.length})
                </SecLabel>
                {upcoming.map((ev, i) => <EventoCard key={`u${i}`} ev={ev} />)}
              </div>
            )}

            {/* Seção: Pendências sem data — Repasse de Vazias */}
            {mostrarVazias && vazias.length > 0 && (
              <div>
                <SecLabel color="#3C3489" mt={upcoming.length > 0 || overdue.length > 0 ? 4 : 0}>
                  🔄 Pendências sem data — Repasse de Vazias ({vazias.length})
                </SecLabel>
                {vazias.map(a => <VaziaCard key={a.id} animal={a} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
