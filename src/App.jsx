import { lazy, useEffect, useState, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { auth, supabase } from './lib/supabase'
import { FazendaProvider, useFazenda } from './lib/FazendaContext'
import { ToastContainer } from './components/UI'
import InstallPrompt from './components/InstallPrompt'
import Layout   from './components/layout/Layout'
import Login    from './components/auth/Login'

const Dashboard   = lazy(() => import('./pages/Dashboard'))
const Propriedade = lazy(() => import('./pages/Propriedade'))
const Animais     = lazy(() => import('./pages/Animais'))
const Reprodutivo = lazy(() => import('./pages/Reprodutivo'))
const Rebanho     = lazy(() => import('./pages/Rebanho'))
const Sanidade    = lazy(() => import('./pages/Sanidade'))
const Pesagens    = lazy(() => import('./pages/Pesagens'))
const Estoque     = lazy(() => import('./pages/Estoque'))
const Financeiro  = lazy(() => import('./pages/Financeiro'))
const Relatorios  = lazy(() => import('./pages/Relatorios'))
const Assistente  = lazy(() => import('./pages/Assistente'))
const Calendario  = lazy(() => import('./pages/Calendario'))
const Metas       = lazy(() => import('./pages/Metas'))
const Backup      = lazy(() => import('./pages/Backup'))
const Comparativo = lazy(() => import('./pages/Comparativo'))

import './styles/global.css'

const TablerLink = () => {
  useEffect(() => {
    if (!document.querySelector('#tabler-icons')) {
      const link = document.createElement('link')
      link.id = 'tabler-icons'; link.rel = 'stylesheet'
      link.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css'
      document.head.appendChild(link)
    }
  }, [])
  return null
}

// ── Loading de tela cheia (usado enquanto fazendas carregam) ──────
function FullLoading({ text = 'Carregando...' }) {
  return (
    <div style={{
      height:'100vh', display:'flex', alignItems:'center',
      justifyContent:'center', flexDirection:'column', gap:12,
      background:'#1E4D35'
    }}>
      <div style={{ fontSize:48, marginBottom:8 }}>🌾</div>
      <div style={{ color:'white', fontWeight:600, fontSize:'1.1rem' }}>Ventos da Várzea</div>
      <div style={{ color:'rgba(255,255,255,.6)', fontSize:'.85rem' }}>{text}</div>
      <div style={{
        width:40, height:40, border:'3px solid rgba(255,255,255,.2)',
        borderTop:'3px solid white', borderRadius:'50%',
        animation:'spin .7s linear infinite', marginTop:8
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ── Tela de primeira fazenda ──────────────────────────────────────
function SemFazendas() {
  const { carregarFazendas } = useFazenda()
  const [form, setForm] = useState({ nome: '', localizacao: '' })
  const [saving, setSaving] = useState(false)
  const { supabase: _ } = {}

  const criar = async () => {
    if (!form.nome) return
    setSaving(true)
    const { supabase: sb } = await import('./lib/supabase')
    const { error } = await sb.from('fazendas').insert({ nome: form.nome, localizacao: form.localizacao, ativo: true, onboarding_concluido: false })
    if (!error) await carregarFazendas()
    setSaving(false)
  }

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F9FAFB', padding:24 }}>
      <div style={{ background:'white', borderRadius:16, padding:'40px 36px', maxWidth:440, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,.1)', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🏡</div>
        <h2 style={{ fontSize:'1.35rem', fontWeight:700, color:'#1E4D35', marginBottom:8 }}>Bem-vindo ao Ventos da Várzea</h2>
        <p style={{ fontSize:'.88rem', color:'#6B7280', marginBottom:28 }}>Vamos começar cadastrando sua primeira fazenda.</p>
        <div style={{ textAlign:'left', marginBottom:16 }}>
          <label style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Nome da fazenda *</label>
          <input
            className="input" style={{ width:'100%' }}
            placeholder="ex: Fazenda São João"
            value={form.nome}
            onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
          />
        </div>
        <div style={{ textAlign:'left', marginBottom:24 }}>
          <label style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Localização / Município</label>
          <input
            className="input" style={{ width:'100%' }}
            placeholder="ex: Viamão, RS"
            value={form.localizacao}
            onChange={e => setForm(p => ({ ...p, localizacao: e.target.value }))}
          />
        </div>
        <button className="btn btn-primary" style={{ width:'100%' }} onClick={criar} disabled={saving || !form.nome}>
          {saving ? 'Criando...' : 'Criar fazenda e começar'}
        </button>
      </div>
    </div>
  )
}

// ── Guard: aguarda fazendas carregarem, guarda rota ───────────────
function FazendaGuard({ user, perfil }) {
  const { loading, fazendas } = useFazenda()

  if (loading) return <FullLoading text="Carregando fazendas..." />
  if (fazendas.length === 0) return <SemFazendas />

  return <Layout user={user} perfil={perfil} />
}

function ProtectedRoutes({ user, perfil }) {
  if (!user) return <Navigate to="/login" replace />
  return (
    <FazendaProvider>
      <FazendaGuard user={user} perfil={perfil} />
    </FazendaProvider>
  )
}

export default function App() {
  const [user,    setUser]    = useState(null)
  const [perfil,  setPerfil]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadPerfil(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) loadPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadPerfil = async (uid) => {
    const { data } = await supabase.from('usuarios').select('*').eq('id', uid).single()
    setPerfil(data)
    setLoading(false)
  }

  if (loading) return <FullLoading text="Carregando sistema..." />

  return (
    <BrowserRouter>
      <TablerLink />
      <ToastContainer />
      <InstallPrompt />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<ProtectedRoutes user={user} perfil={perfil} />}>
          <Route path="/"            element={<Suspense fallback={null}><Dashboard  perfil={perfil} /></Suspense>} />
          <Route path="/assistente"  element={<Suspense fallback={null}><Assistente /></Suspense>} />
          <Route path="/calendario"  element={<Suspense fallback={null}><Calendario /></Suspense>} />
          <Route path="/metas"       element={<Suspense fallback={null}><Metas /></Suspense>} />
          <Route path="/backup"      element={<Suspense fallback={null}><Backup /></Suspense>} />
          <Route path="/propriedade" element={<Suspense fallback={null}><Propriedade /></Suspense>} />
          <Route path="/animais"     element={<Suspense fallback={null}><Animais /></Suspense>} />
          <Route path="/reprodutivo" element={<Suspense fallback={null}><Reprodutivo /></Suspense>} />
          <Route path="/rebanho"     element={<Suspense fallback={null}><Rebanho /></Suspense>} />
          <Route path="/sanidade"    element={<Suspense fallback={null}><Sanidade /></Suspense>} />
          <Route path="/pesagens"    element={<Suspense fallback={null}><Pesagens /></Suspense>} />
          <Route path="/estoque"     element={<Suspense fallback={null}><Estoque /></Suspense>} />
          <Route path="/financeiro"  element={<Suspense fallback={null}><Financeiro /></Suspense>} />
          <Route path="/relatorios"  element={<Suspense fallback={null}><Relatorios /></Suspense>} />
          <Route path="/comparativo" element={<Suspense fallback={null}><Comparativo /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
