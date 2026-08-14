import { useState } from 'react'
import { auth } from '../../lib/supabase'

// Tela unica de "escolher senha". Serve para dois casos:
//   1. recuperacao — o usuario chegou pelo link do e-mail (/nova-senha)
//   2. primeiro acesso — a senha atual foi definida pelo administrador e
//      ainda nao foi trocada pelo proprio usuario
// Em ambos ja existe sessao valida do Supabase, entao basta updateUser.
export default function DefinirSenha({ motivo = 'recuperacao', email = '' }) {
  const [senha, setSenha]   = useState('')
  const [conf, setConf]     = useState('')
  const [ver, setVer]       = useState(false)
  const [erro, setErro]     = useState('')
  const [salvando, setSalvando] = useState(false)
  const [pronto, setPronto] = useState(false)

  const primeiroAcesso = motivo === 'primeiro-acesso'

  const salvar = async (e) => {
    e.preventDefault()
    setErro('')
    if (senha.length < 8)  { setErro('A senha precisa ter pelo menos 8 caracteres.'); return }
    if (senha !== conf)    { setErro('As duas senhas nao sao iguais.'); return }
    setSalvando(true)
    const { error } = await auth.definirSenha(senha)
    setSalvando(false)
    if (error) {
      setErro(error.message?.includes('should be different')
        ? 'A senha nova precisa ser diferente da atual.'
        : 'Nao foi possivel salvar a senha. Tente novamente.')
      return
    }
    setPronto(true)
    setTimeout(() => { window.location.href = '/' }, 1200)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F9FAFB', padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 36px', maxWidth:440, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,.1)' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <img src="/circular-DIGITALBOV.png" style={{ width:72, height:72, objectFit:'contain', marginBottom:12 }} alt="DigitalBov" />
          <h2 style={{ fontSize:'1.3rem', fontWeight:700, color:'#2B6CD9', marginBottom:6 }}>
            {primeiroAcesso ? 'Crie sua senha' : 'Nova senha'}
          </h2>
          <p style={{ fontSize:'.86rem', color:'#6B7280', lineHeight:1.5, margin:0 }}>
            {primeiroAcesso
              ? 'Sua senha atual foi criada pelo administrador. Escolha uma senha sua para continuar — so voce vai conhece-la.'
              : 'Escolha a senha que voce vai usar para entrar no DigitalBov.'}
          </p>
          {email && (
            <p style={{ fontSize:'.8rem', color:'#9CA3AF', marginTop:8 }}>{email}</p>
          )}
        </div>

        {pronto ? (
          <div style={{ background:'#ECFDF5', color:'#065F46', padding:'14px 16px', borderRadius:10,
                        fontSize:'.86rem', textAlign:'center', border:'.5px solid #A7F3D0' }}>
            <i className="ti ti-circle-check" style={{ fontSize:22, display:'block', marginBottom:6 }} />
            Senha salva. Entrando no sistema...
          </div>
        ) : (
          <form onSubmit={salvar}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                Nova senha
              </label>
              <div style={{ position:'relative' }}>
                <input className="input" type={ver ? 'text' : 'password'} value={senha}
                  onChange={e => setSenha(e.target.value)} placeholder="minimo 8 caracteres"
                  autoComplete="new-password" required style={{ width:'100%', paddingRight:40 }} />
                <button type="button" onClick={() => setVer(!ver)}
                  style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                           background:'none', border:'none', cursor:'pointer', color:'#9CA3AF', padding:0 }}>
                  <i className={`ti ti-eye${ver ? '-off' : ''}`} />
                </button>
              </div>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>
                Repita a senha
              </label>
              <input className="input" type={ver ? 'text' : 'password'} value={conf}
                onChange={e => setConf(e.target.value)} placeholder="digite de novo"
                autoComplete="new-password" required style={{ width:'100%' }} />
            </div>

            {erro && (
              <div style={{ background:'#FCEBEB', color:'#791F1F', padding:'10px 14px', borderRadius:8,
                            fontSize:'.82rem', marginBottom:12, border:'.5px solid #F5B5B5' }}>
                <i className="ti ti-alert-circle" /> {erro}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={salvando}
              style={{ width:'100%', justifyContent:'center', padding:11 }}>
              {salvando ? 'Salvando...' : 'Salvar senha'}
            </button>

            {!primeiroAcesso && (
              <button type="button" onClick={() => auth.signOut().then(() => window.location.href='/login')}
                style={{ width:'100%', marginTop:12, background:'none', border:'none', color:'#6B7280',
                         fontSize:'.82rem', cursor:'pointer' }}>
                Voltar para o login
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
