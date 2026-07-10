import { lazy, useEffect, useState, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { auth, supabase } from './lib/supabase'
import { FazendaProvider, useFazenda } from './lib/FazendaContext'
import { ContaProvider, useConta } from './lib/ContaContext'
import { PermissoesProvider, usePermissoes } from './lib/PermissoesContext'
import { ToastContainer, toast, FullLoading } from './components/UI'
import InstallPrompt from './components/InstallPrompt'
import Layout          from './components/layout/Layout'
import Login           from './components/auth/Login'

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
const Usuarios    = lazy(() => import('./pages/Usuarios'))

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

// ── Onboarding: cria só a conta via RPC ────────────────────────────
function PrimeiroAcesso() {
  const { carregarContas } = useConta()
  const [form, setForm] = useState({ conta: '' })
  const [saving, setSaving] = useState(false)

  const criar = async () => {
    if (!form.conta) { toast('Informe o nome da conta.', 'error'); return }
    setSaving(true)
    const { error } = await supabase.rpc('criar_conta_simples', { p_nome_conta: form.conta })
    if (error) { toast('Erro: '+error.message, 'error'); setSaving(false); return }
    window.location.reload()
  }

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F9FAFB', padding:24 }}>
      <div style={{ background:'white', borderRadius:16, padding:'40px 36px', maxWidth:440, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,.1)', textAlign:'center' }}>
        <img src="/circular-DIGITALBOV.png" style={{ width:72, height:72, objectFit:'contain', marginBottom:16 }} alt="DigitalBov" />
        <h2 style={{ fontSize:'1.35rem', fontWeight:700, color:'#2B6CD9', marginBottom:8 }}>Bem-vindo ao DigitalBov</h2>
        <p style={{ fontSize:'.88rem', color:'#6B7280', marginBottom:28 }}>Crie sua conta para começar. Você poderá criar suas fazendas depois no módulo Propriedade.</p>
        <div style={{ textAlign:'left', marginBottom:16 }}>
          <label style={{ fontSize:'.82rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Nome da sua conta / empresa *</label>
          <input className="input" style={{ width:'100%' }} placeholder="ex: Agropecuária Silva"
            value={form.conta} onChange={e => setForm(p => ({ ...p, conta: e.target.value }))} />
        </div>
        <button className="btn btn-primary" style={{ width:'100%' }} onClick={criar} disabled={saving || !form.conta}>
          {saving ? 'Criando...' : 'Criar e começar'}
        </button>
      </div>
    </div>
  )
}

// ── Sem vínculo com fazenda (operador sem acesso) ─────────────────
function SemAcessoFazenda() {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F9FAFB', padding:24 }}>
      <div style={{ background:'white', borderRadius:16, padding:'40px 36px', maxWidth:420, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,.1)', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🔒</div>
        <h2 style={{ fontSize:'1.25rem', fontWeight:700, color:'#2B6CD9', marginBottom:8 }}>Sem acesso a fazendas</h2>
        <p style={{ fontSize:'.9rem', color:'#6B7280', marginBottom:24 }}>
          Você ainda não tem acesso a nenhuma fazenda. Fale com o administrador da sua conta para liberar o acesso.
        </p>
        <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => auth.signOut()}>
          Sair
        </button>
      </div>
    </div>
  )
}

// ── Guard de conta: aguarda contas carregarem ─────────────────────
function ContaGuard({ user, perfil }) {
  const { loading, contas } = useConta()
  if (loading) return <FullLoading text="Carregando conta..." />
  if (contas.length === 0) return <PrimeiroAcesso />
  return (
    <FazendaProvider>
      <PermissoesProvider>
        <FazendaGuard user={user} perfil={perfil} />
      </PermissoesProvider>
    </FazendaProvider>
  )
}

// ── Guard de fazenda: aguarda fazendas carregarem ─────────────────
function FazendaGuard({ user, perfil }) {
  const { loading, fazendas } = useFazenda()
  const { ehAdmin } = usePermissoes()

  if (loading) return <FullLoading text="Carregando fazendas..." />
  // 0 fazendas: admin/dono continua vendo a interface normal (pode criar uma nova em Propriedade).
  // Só bloqueia o operador sem nenhum vínculo de fazenda.
  if (fazendas.length === 0 && !ehAdmin) return <SemAcessoFazenda />

  return <Layout user={user} perfil={perfil} />
}

// ── Guard de rota: bloqueia módulo sem permissão de visualização na fazenda atual ──
function RotaProtegida({ modulo, children }) {
  const { podeVer, ehAdmin, carregado } = usePermissoes()
  if (!carregado) return null
  if (ehAdmin || modulo === 'dashboard' || podeVer(modulo)) return children
  return (
    <div style={{ padding:40, textAlign:'center', color:'#6B7280' }}>
      <i className="ti ti-lock" style={{ fontSize:40, marginBottom:12 }} />
      <div style={{ fontWeight:600, marginBottom:6 }}>Sem permissão</div>
      <div style={{ fontSize:'.85rem' }}>Você não tem permissão para acessar este módulo nesta fazenda.</div>
    </div>
  )
}

function ProtectedRoutes({ user, perfil }) {
  if (!user) return <Navigate to="/login" replace />
  return (
    <ContaProvider>
      <ContaGuard user={user} perfil={perfil} />
    </ContaProvider>
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
    const { data: { user } } = await supabase.auth.getUser()
    setPerfil({
      id: uid,
      nome: user?.email ? user.email.split('@')[0] : 'Usuário',
      email: user?.email || '',
      avatar_cor: '#2B6CD9'
    })
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
          <Route path="/metas"       element={<RotaProtegida modulo="metas"><Suspense fallback={null}><Metas /></Suspense></RotaProtegida>} />
          <Route path="/backup"      element={<Suspense fallback={null}><Backup /></Suspense>} />
          <Route path="/propriedade" element={<RotaProtegida modulo="propriedade"><Suspense fallback={null}><Propriedade /></Suspense></RotaProtegida>} />
          <Route path="/animais"     element={<RotaProtegida modulo="animais"><Suspense fallback={null}><Animais /></Suspense></RotaProtegida>} />
          <Route path="/reprodutivo" element={<RotaProtegida modulo="reprodutivo"><Suspense fallback={null}><Reprodutivo /></Suspense></RotaProtegida>} />
          <Route path="/rebanho"     element={<RotaProtegida modulo="rebanho"><Suspense fallback={null}><Rebanho /></Suspense></RotaProtegida>} />
          <Route path="/sanidade"    element={<RotaProtegida modulo="sanidade"><Suspense fallback={null}><Sanidade /></Suspense></RotaProtegida>} />
          <Route path="/pesagens"    element={<RotaProtegida modulo="pesagens"><Suspense fallback={null}><Pesagens /></Suspense></RotaProtegida>} />
          <Route path="/estoque"     element={<RotaProtegida modulo="estoque"><Suspense fallback={null}><Estoque /></Suspense></RotaProtegida>} />
          <Route path="/financeiro"  element={<RotaProtegida modulo="financeiro"><Suspense fallback={null}><Financeiro /></Suspense></RotaProtegida>} />
          <Route path="/relatorios"  element={<RotaProtegida modulo="relatorios"><Suspense fallback={null}><Relatorios /></Suspense></RotaProtegida>} />
          <Route path="/comparativo" element={<Suspense fallback={null}><Comparativo /></Suspense>} />
          <Route path="/usuarios"   element={<Suspense fallback={null}><Usuarios /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
