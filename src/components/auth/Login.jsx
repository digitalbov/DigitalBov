import { useState } from 'react'
import { auth } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [erro, setErro]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await auth.signIn(email, senha)
    setLoading(false)
    if (error) {
      setErro(error.message === 'Invalid login credentials'
        ? 'E-mail ou senha incorretos.'
        : 'Erro ao entrar. Tente novamente.')
    }
  }

  return (
    <div className="login-page">
      {/* Painel esquerdo — formulário */}
      <div className="login-panel">
        <div className="login-logo">
          <img src="/circular-DIGITALBOV.png" style={{width:180, height:180, objectFit:'contain'}} alt="DigitalBov"/>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label>E-mail</label>
            <input
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label>Senha</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                autoComplete="current-password"
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', color: '#9CA3AF',
                  fontSize: 14, padding: 0
                }}
              >
                <i className={`ti ti-eye${showPass ? '-off' : ''}`} />
              </button>
            </div>
          </div>

          {erro && (
            <div style={{
              background: '#FCEBEB', color: '#791F1F', padding: '10px 14px',
              borderRadius: 8, fontSize: '.82rem', marginBottom: 12,
              border: '.5px solid #F5B5B5', display: 'flex', gap: 7, alignItems: 'center'
            }}>
              <i className="ti ti-alert-circle" />
              {erro}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '11px' }}
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                Entrando...
              </>
            ) : (
              <>
                <i className="ti ti-login" />
                Entrar no sistema
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: 32, padding: 14, background: '#F9FAFB',
          borderRadius: 10, border: '.5px solid #E5E7EB'
        }}>
          <div style={{ fontSize: '.75rem', fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
            ACESSO RESTRITO
          </div>
          <div style={{ fontSize: '.78rem', color: '#9CA3AF', lineHeight: 1.5 }}>
            Este sistema é de uso exclusivo do DigitalBov.
            Em caso de problemas, entre em contato com o administrador.
          </div>
        </div>
      </div>

      {/* Painel direito — visual */}
      <div className="login-side" style={{ position: 'relative' }}>
        {/* LOGO — ancorada no topo, posição independente */}
        <img src="/log vazado 2.png"
          style={{
            position: 'absolute',
            top: '-20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300, height: 300, objectFit: 'contain'
          }}
          alt="DigitalBov" />

        {/* CAIXA de texto — ancorada independentemente; ajuste só o "top" para subir/descer */}
        <div style={{
          position: 'absolute',
          top: '220px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '85%', maxWidth: 420,
          background: 'rgba(255,255,255,0.0)',
          backdropFilter: 'blur(2px)',
          borderRadius: '12px',
          padding: '14px 20px',
          boxShadow: 'none',
          textAlign: 'center', color: '#1a1a1a'
        }}>
          <p style={{ color: 'rgba(0,0,0,.7)', fontSize: '.95rem', lineHeight: 1.7, marginTop: 0, marginBottom: 12, fontWeight: 700 }}>
            Sistema completo de gestão pecuária. Rebanho, reprodução, financeiro, sanidade e muito mais.
          </p>
          {[
            ['🐄', 'Cadastro completo do rebanho Angus'],
            ['🧬', 'Painel reprodutivo com IA e voz'],
            ['💰', 'Gestão financeira por ciclo'],
            ['💉', 'Controle sanitário com alertas'],
            ['📊', 'Índices zootécnicos em tempo real'],
          ].map(([icon, text]) => (
            <div key={text} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '6px 0', borderBottom: '.5px solid rgba(0,0,0,.1)',
              textAlign: 'left', fontSize: '.9rem', color: 'rgba(0,0,0,.85)', fontWeight: 700
            }}>
              <span style={{ fontSize: '1.2rem' }}>{icon}</span>
              {text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
