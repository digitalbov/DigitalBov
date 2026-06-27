import { useState, useRef, useEffect, useCallback } from 'react'
import { perguntarIA } from '../lib/gemini'
import { coletarContexto } from '../lib/contextoIA'

const SUGESTOES = [
  'Quantas matrizes tenho?',
  'Qual a taxa de prenhez do ciclo atual?',
  'Tem algum produto abaixo do mínimo no estoque?',
  'Quanto gastei com remédios este ciclo?',
  'Quantos nascimentos tivemos neste ciclo?',
  'Quais animais estão vazios?',
  'Qual o saldo financeiro do ciclo atual?',
  'Qual a distribuição por categoria do rebanho?',
]

function useTTS() {
  const falar = useCallback((texto) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(texto)
    utt.lang = 'pt-BR'
    utt.rate = 1.05
    window.speechSynthesis.speak(utt)
  }, [])

  const parar = useCallback(() => {
    window.speechSynthesis?.cancel()
  }, [])

  return { falar, parar }
}

function Bubble({ msg, onFalar }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      alignItems: 'flex-end',
      gap: 8,
    }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: '#1E4D35', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 16, marginBottom: 2
        }}>
          🤖
        </div>
      )}
      <div style={{ maxWidth: '75%' }}>
        <div style={{
          background: isUser ? '#1E4D35' : 'white',
          color: isUser ? 'white' : '#111827',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          fontSize: '.88rem',
          lineHeight: 1.55,
          border: isUser ? 'none' : '.5px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,.07)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {msg.content}
        </div>
        {!isUser && onFalar && (
          <button
            onClick={() => onFalar(msg.content)}
            style={{
              marginTop: 4, padding: '2px 8px',
              background: 'transparent', border: 'none',
              fontSize: '.72rem', color: '#9CA3AF',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}
            title="Ler resposta em voz alta"
          >
            <i className="ti ti-volume" style={{ fontSize: 13 }} />
            Ouvir
          </button>
        )}
      </div>
    </div>
  )
}

function PensandoBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12, alignItems: 'flex-end', gap: 8 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: '#1E4D35', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 16
      }}>
        🤖
      </div>
      <div style={{
        background: 'white', border: '.5px solid #E5E7EB',
        borderRadius: '16px 16px 16px 4px',
        padding: '12px 16px', display: 'flex', gap: 5, alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,.07)'
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%', background: '#9CA3AF',
            animation: `pensando .9s ease-in-out ${i * 0.2}s infinite`
          }} />
        ))}
        <style>{`@keyframes pensando { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
      </div>
    </div>
  )
}

export default function Assistente() {
  const [msgs, setMsgs]       = useState([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')
  const [gravando, setGravando] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const { falar, parar } = useTTS()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const enviar = useCallback(async (texto) => {
    const pergunta = texto.trim()
    if (!pergunta || loading) return

    setErro('')
    setInput('')
    setMsgs(prev => [...prev, { role: 'user', content: pergunta }])
    setLoading(true)

    try {
      const contexto = await coletarContexto()
      const resposta = await perguntarIA(pergunta, contexto)
      setMsgs(prev => [...prev, { role: 'assistant', content: resposta }])
    } catch (e) {
      setErro(e.message)
      setMsgs(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [loading])

  const handleSubmit = (e) => {
    e.preventDefault()
    enviar(input)
  }

  const handleVoz = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Use Chrome ou Edge para reconhecimento de voz.'); return }
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.interimResults = false
    setGravando(true)
    rec.onresult = (e) => {
      const texto = e.results[0][0].transcript
      setGravando(false)
      enviar(texto)
    }
    rec.onerror = () => setGravando(false)
    rec.onend   = () => setGravando(false)
    rec.start()
  }, [enviar])

  const chatVazio = msgs.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 760, margin: '0 auto' }}>

      {/* Cabeçalho */}
      <div style={{
        background: 'white', border: '.5px solid #E5E7EB',
        borderRadius: 12, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, flexShrink: 0
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', background: '#EAF3DE',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22
        }}>
          🤖
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '.95rem', color: '#111827' }}>
            Assistente IA — Ventos da Várzea
          </div>
          <div style={{ fontSize: '.78rem', color: '#9CA3AF', marginTop: 2 }}>
            Faça perguntas sobre seu rebanho, estoque, reprodutivo e financeiro
          </div>
        </div>
        <div style={{
          marginLeft: 'auto', background: '#EEEDFE', color: '#3C3489',
          borderRadius: 8, padding: '3px 9px', fontSize: '.72rem', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0
        }}>
          <i className="ti ti-brain" style={{ fontSize: 11 }} />
          Gemini 2.0
        </div>
      </div>

      {/* Área de chat */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 2px',
        display: 'flex', flexDirection: 'column'
      }}>

        {/* Sugestões — visíveis apenas quando o chat está vazio */}
        {chatVazio && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: '.78rem', color: '#9CA3AF', marginBottom: 10, textAlign: 'center' }}>
              Experimente perguntar:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  disabled={loading}
                  style={{
                    background: 'white', border: '.5px solid #D1D5DB',
                    borderRadius: 20, padding: '7px 14px',
                    fontSize: '.8rem', color: '#374151', cursor: 'pointer',
                    transition: 'all .15s'
                  }}
                  onMouseEnter={e => { e.target.style.borderColor = '#1E4D35'; e.target.style.color = '#1E4D35' }}
                  onMouseLeave={e => { e.target.style.borderColor = '#D1D5DB'; e.target.style.color = '#374151' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mensagens */}
        {msgs.map((m, i) => (
          <Bubble key={i} msg={m} onFalar={m.role === 'assistant' ? falar : null} />
        ))}

        {loading && <PensandoBubble />}

        {/* Erro */}
        {erro && (
          <div style={{
            background: '#FCEBEB', color: '#791F1F', border: '.5px solid #F5B5B5',
            borderRadius: 10, padding: '10px 14px', fontSize: '.83rem', marginBottom: 12
          }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 6 }} />
            {erro}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        flexShrink: 0, background: 'white', border: '.5px solid #E5E7EB',
        borderRadius: 12, padding: '10px 12px', marginTop: 12,
        display: 'flex', gap: 8, alignItems: 'flex-end',
        boxShadow: '0 2px 8px rgba(0,0,0,.06)'
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(input) }
          }}
          placeholder="Pergunte algo sobre o rebanho, estoque, finanças..."
          rows={1}
          style={{
            flex: 1, border: 'none', outline: 'none', resize: 'none',
            fontSize: '.9rem', fontFamily: 'inherit', color: '#111827',
            background: 'transparent', lineHeight: 1.5, maxHeight: 120,
            overflowY: 'auto', minHeight: 24
          }}
          onInput={e => {
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
        />

        {/* Parar TTS */}
        <button
          type="button"
          onClick={parar}
          title="Parar leitura"
          style={{
            width: 36, height: 36, borderRadius: 8, border: '.5px solid #E5E7EB',
            background: 'transparent', cursor: 'pointer', color: '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}
        >
          <i className="ti ti-volume-off" style={{ fontSize: 17 }} />
        </button>

        {/* Microfone */}
        <button
          type="button"
          onClick={handleVoz}
          disabled={loading || gravando}
          title="Perguntar por voz"
          style={{
            width: 36, height: 36, borderRadius: 8,
            border: '.5px solid ' + (gravando ? '#E24B4A' : '#E5E7EB'),
            background: gravando ? '#FCEBEB' : 'transparent',
            cursor: 'pointer', color: gravando ? '#E24B4A' : '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            animation: gravando ? 'pulse 1s infinite' : 'none'
          }}
        >
          <i className={`ti ti-${gravando ? 'loader' : 'microphone'}`} style={{ fontSize: 17 }} />
        </button>

        {/* Enviar */}
        <button
          type="button"
          onClick={() => enviar(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 36, height: 36, borderRadius: 8,
            background: input.trim() && !loading ? '#1E4D35' : '#E5E7EB',
            border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            color: input.trim() && !loading ? 'white' : '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'background .15s'
          }}
        >
          <i className="ti ti-send" style={{ fontSize: 17 }} />
        </button>
      </div>
    </div>
  )
}
