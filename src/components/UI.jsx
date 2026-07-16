import { useState, useCallback } from 'react'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo, STATUS_CICLO_LABEL } from '../lib/CicloContext'

// ── Toast notification system ─────────────────────────────────────
let toastFn = null
export function setToastFn(fn) { toastFn = fn }
export function toast(msg, type = 'success') { toastFn?.(msg, type) }

export function ToastContainer() {
  const [toasts, setToasts] = useState([])

  setToastFn((msg, type) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  })

  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <i className={`ti ti-${t.type === 'success' ? 'circle-check' : 'alert-circle'}`} />
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Loading spinner ───────────────────────────────────────────────
export function Loading({ text = 'Carregando...' }) {
  return (
    <div className="loading">
      <div className="spinner" />
      {text}
    </div>
  )
}

// ── Loading de tela cheia (splash de boot do app) ──────────────────
export function FullLoading({ text = 'Carregando...' }) {
  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      height:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', flexDirection:'column', gap:12,
      background:'#FFFFFF', padding:'0 24px'
    }}>
      <img src="/pdf-header-novo.png" alt="DigitalBov"
        style={{ width:'80%', maxWidth:320, height:'auto', objectFit:'contain', marginBottom:8 }} />
      <div style={{ color:'#6B7280', fontSize:'.85rem' }}>{text}</div>
      <div style={{
        width:40, height:40, border:'3px solid #E5E7EB',
        borderTop:'3px solid #2B6CD9', borderRadius:'50%',
        animation:'spin .7s linear infinite', marginTop:8
      }} />
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────
export function EmptyState({ icon = '📋', title, sub, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

// ── Erro de carregamento ──────────────────────────────────────────
export function ErroCarregamento({ onRetry }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontWeight: 600, color: '#374151', marginBottom: 6 }}>
        Não foi possível carregar os dados
      </div>
      <div style={{ fontSize: '.82rem', color: '#9CA3AF', marginBottom: 16 }}>
        Verifique sua conexão e tente novamente.
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onRetry}>
        <i className="ti ti-refresh" style={{ marginRight: 4 }} />
        Tentar novamente
      </button>
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────
export function Badge({ children, color = 'gray', style }) {
  return <span className={`badge badge-${color}`} style={style}>{children}</span>
}

// ── Modal ─────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null
  return (
    <div
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
        display:'flex', alignItems:'center', justifyContent:'center',
        zIndex:1000, padding:16
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background:'white', borderRadius:12, width:'100%', maxWidth:`min(95vw, ${width}px)`,
        maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.2)'
      }}>
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'16px 20px', borderBottom:'.5px solid #E5E7EB'
        }}>
          <h3 style={{ fontSize:'.95rem', fontWeight:600 }}>{title}</h3>
          <button className="btn-icon" onClick={onClose}>
            <i className="ti ti-x" style={{ fontSize:16 }} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────
export function Confirm({ open, onClose, onConfirm, title, message, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirmar'} width={400}>
      <p style={{ marginBottom:20, color:'#4B5563' }}>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        <button
          className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => { onConfirm(); onClose() }}
        >
          Confirmar
        </button>
      </div>
    </Modal>
  )
}

// ── Form field wrapper ────────────────────────────────────────────
export function Field({ label, required, children, hint }) {
  return (
    <div>
      <label>
        {label}{required && <span style={{ color:'#E24B4A', marginLeft:2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:3 }}>{hint}</div>}
    </div>
  )
}

// ── Mic button with speech recognition ───────────────────────────
export function MicButton({ onResult, hint, context }) {
  const [recording, setRecording] = useState(false)
  const [status, setStatus]       = useState('')

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Use Chrome ou Edge para reconhecimento de voz.'); return }
    const rec = new SR()
    rec.lang = 'pt-BR'; rec.interimResults = false
    setRecording(true); setStatus('● Ouvindo...')
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      setStatus(`"${text}"`)
      setRecording(false)
      onResult?.(text)
    }
    rec.onerror = () => { setRecording(false); setStatus('Erro. Tente novamente.') }
    rec.onend   = () => setRecording(false)
    rec.start()
  }, [onResult])

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button
          type="button"
          className={`mic-btn ${recording ? 'recording' : ''}`}
          onClick={start}
          title={hint || 'Lançar por voz'}
        >
          <i className={`ti ti-${recording ? 'loader' : 'microphone'}`} style={{ fontSize:15, color: recording ? '#E24B4A' : '#9CA3AF' }} />
        </button>
        <span style={{
          fontSize:'.72rem', background:'#EEEDFE', color:'#3C3489',
          padding:'2px 7px', borderRadius:6, fontWeight:600
        }}>
          IA + Voz
        </span>
      </div>
      {status && (
        <div className="mic-hint" style={{ color: recording ? '#E24B4A' : '#6B7280' }}>
          {status}
        </div>
      )}
      {hint && !status && (
        <div className="mic-hint">{hint}</div>
      )}
    </div>
  )
}

// ── Page section header ───────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display:'flex', alignItems:'flex-start', justifyContent:'space-between',
      marginBottom:16, gap:12
    }}>
      <div>
        {subtitle && <div className="sl">{subtitle}</div>}
        {title && <h3>{title}</h3>}
      </div>
      {action}
    </div>
  )
}

// ── Stat row ──────────────────────────────────────────────────────
export function StatRow({ label, value, color, extra }) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value" style={color ? { color } : {}}>{value}</span>
      {extra && <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{extra}</span>}
    </div>
  )
}

// ── Index card ────────────────────────────────────────────────────
export function IndexCard({ value, label, meta, ok, color, compact }) {
  return (
    <div style={{
      background:'#F9FAFB', border:'.5px solid #E5E7EB',
      borderRadius:10, padding: compact ? '8px 6px' : '12px 8px', textAlign:'center'
    }}>
      <div style={{ fontSize: compact ? '1.05rem' : '1.25rem', fontWeight:600, color: color || (ok ? '#2B6CD9' : '#BA7517') }}>
        {value}
      </div>
      <div style={{ fontSize: compact ? '.66rem' : '.72rem', color:'#6B7280', marginTop:3, lineHeight:1.3 }}>{label}</div>
      {meta && (
        <div style={{ fontSize: compact ? '.6rem' : '.65rem', marginTop:3, color: ok ? '#1E55B0' : '#BA7517' }}>
          meta: {meta} {ok ? '✓' : '↑'}
        </div>
      )}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────
export function ProgressBar({ value, max, color = '#2B6CD9', height = 6 }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="progress-bg" style={{ height }}>
      <div
        className="progress-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ── Alert box ─────────────────────────────────────────────────────
export function AlertBox({ type = 'green', icon, title, body, action }) {
  const icons = { green:'ti-circle-check', amber:'ti-alert-triangle', red:'ti-alert-circle', purple:'ti-brain' }
  return (
    <div className={`alert alert-${type}`}>
      <i className={`ti ${icon || icons[type]}`} style={{ fontSize:16, flexShrink:0, marginTop:1 }} />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
        <div>
          {title && <div className="alert-title">{title}</div>}
          {body  && <div className="alert-body">{body}</div>}
        </div>
        {action}
      </div>
    </div>
  )
}

// ── Banner de ciclo encerrado (somente leitura) ────────────────────
// Sem prop `ciclo`, usa o ciclo GLOBAL selecionado (menu lateral). Passe
// `ciclo` para refletir um seletor LOCAL de tela (independente do global).
export function BannerCicloEncerrado({ ciclo } = {}) {
  const { cicloSelecionado } = useCiclo()
  const c = ciclo !== undefined ? ciclo : cicloSelecionado
  if (!c) return null
  const st = statusCiclo(c)
  if (st === 'atual' || st === 'carencia') return null
  return (
    <AlertBox type="amber" icon="ti-lock" title="Somente leitura"
      body={`Você está visualizando o ciclo ${c.nome}, que está encerrado. Os dados são somente para consulta e não podem ser editados.`} />
  )
}

// ── Seletor de ciclo LOCAL de tela ──────────────────────────────────
// Independente do seletor global do menu lateral: cada tela mantém seu
// próprio estado (cicloLocal) e passa ciclos + setter aqui.
export function SeletorCicloLocal({ cicloLocal, setCicloLocal, ciclos }) {
  if (!ciclos?.length) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:'.82rem', color:'#6B7280', fontWeight:500 }}>Ciclo:</span>
      <select value={cicloLocal?.id || ''} onChange={e => setCicloLocal(ciclos.find(c => c.id === e.target.value) || null)}
        style={{ width:'auto', fontSize:'.85rem', padding:'5px 10px' }}>
        {ciclos.map(c => (
          <option key={c.id} value={c.id}>{c.nome} ({STATUS_CICLO_LABEL[statusCiclo(c)]})</option>
        ))}
      </select>
    </div>
  )
}

// ── BotaoPDF ─────────────────────────────────────────────────────
export function BotaoPDF({ contentRef, filename, titulo = '', label = 'Gerar PDF' }) {
  const [gerando, setGerando] = useState(false)
  const { fazendaAtual } = useFazenda()
  const gerar = async () => {
    if (!contentRef?.current) return
    setGerando(true)
    try {
      const { gerarPDFComMolduras } = await import('../lib/pdf')
      await gerarPDFComMolduras(contentRef.current, filename, titulo, fazendaAtual?.nome || '')
    } catch(e) {
      console.error(e)
      toast('Erro ao gerar PDF: ' + e.message, 'error')
    }
    setGerando(false)
  }
  return (
    <button className="btn btn-secondary btn-sm" onClick={gerar} disabled={gerando}
      style={{display:'flex',alignItems:'center',gap:5}}>
      <i className={`ti ti-${gerando?'loader':'file-type-pdf'}`} style={{color:'#C0392B'}}/>
      {gerando ? 'Gerando...' : label}
    </button>
  )
}
