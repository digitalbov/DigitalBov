import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { auth, supabase } from '../../lib/supabase'
import { useFazenda } from '../../lib/FazendaContext'
import { useConta } from '../../lib/ContaContext'
import { usePermissoes } from '../../lib/PermissoesContext'
import OnboardingWizard from '../OnboardingWizard'
import Tutorial from '../Tutorial'

// Módulos com permissão gerenciável (mesma lista de Usuarios.jsx). Itens fora
// desta lista (assistente, calendário, backup) ficam sempre visíveis: o
// sistema de permissões não os cobre.
const MODULOS_GERENCIAVEIS = [
  'propriedade', 'animais', 'reprodutivo', 'rebanho', 'sanidade',
  'pesagens', 'estoque', 'financeiro', 'relatorios', 'metas',
]

const NAV = [
  { section: 'PRINCIPAL' },
  { path: '/',             icon: 'ti-layout-dashboard', label: 'Dashboard' },
  { path: '/assistente',   icon: 'ti-message-chatbot',  label: 'Assistente IA', destaque: true },
  { path: '/calendario',   icon: 'ti-calendar-event',   label: 'Calendário' },
  { path: '/metas',        icon: 'ti-target',            label: 'Metas & Indicadores' },

  { section: 'GESTÃO' },
  { path: '/propriedade', icon: 'ti-home-2',           label: 'Propriedade' },
  { path: '/animais',     icon: 'ti-clipboard-list',   label: 'Cadastro de Animais' },
  { path: '/reprodutivo', icon: 'ti-activity',         label: 'Painel Reprodutivo' },
  { path: '/rebanho',     icon: 'ti-chart-line',       label: 'Controle de Rebanho' },

  { section: 'OPERACIONAL' },
  { path: '/sanidade',    icon: 'ti-shield-check',     label: 'Sanidade' },
  { path: '/pesagens',    icon: 'ti-weight',           label: 'Pesagens' },
  { path: '/estoque',     icon: 'ti-box',              label: 'Estoque' },

  { section: 'FINANCEIRO' },
  { path: '/financeiro',  icon: 'ti-cash',             label: 'Gestão Financeira' },
  { path: '/relatorios',  icon: 'ti-file-text',        label: 'Relatórios' },

  { section: 'SISTEMA' },
  { path: '/backup',      icon: 'ti-database-export',  label: 'Backup & Dados' },
]

export default function Sidebar({ user, perfil, mobileOpen, onClose }) {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { fazendas, fazendaAtual, setFazendaAtual, carregarFazendas } = useFazenda()
  const { contas, contaAtual, setContaAtual } = useConta()
  const { podeVer } = usePermissoes()
  const ehAdmin = contaAtual?.papel === 'dono' || contaAtual?.papel === 'admin'
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [seletorContaAberto, setSeletorContaAberto] = useState(false)
  const [modalNova, setModalNova] = useState(false)
  const [novaForm, setNovaForm] = useState({ nome:'', localizacao:'' })
  const [salvandoNova, setSalvandoNova] = useState(false)
  const [wizardFazendaId, setWizardFazendaId] = useState(null)
  const [tutorialAberto, setTutorialAberto] = useState(false)

  useEffect(() => {
    const jaViu = localStorage.getItem('digitalbov_tutorial_visto')
    if (!jaViu && ehAdmin) {
      setTutorialAberto(true)
    }
  }, [ehAdmin])

  const initials = (nome) => nome
    ? nome.split(' ').filter((_,i,a) => i===0||i===a.length-1).map(w=>w[0]).join('').toUpperCase()
    : '?'

  const handleNav = (path) => { navigate(path); onClose?.() }

  const handleSelectFazenda = (f) => {
    setFazendaAtual(f)
    setSeletorAberto(false)
    navigate(location.pathname, { replace: true })
    window.location.reload()
  }

  const handleSelectConta = (c) => {
    setContaAtual(c)
    setSeletorContaAberto(false)
    // limpa a fazenda atual, pois é de outra conta
    localStorage.removeItem('fazenda_atual_id')
    navigate('/', { replace: true })
    window.location.reload()
  }

  const criarFazenda = async () => {
    if (!novaForm.nome) return
    if (!contaAtual) { alert('Conta não carregada. Recarregue a página.'); return }
    setSalvandoNova(true)
    const { data, error } = await supabase.rpc('criar_fazenda', {
      p_conta_id: contaAtual.id,
      p_nome: novaForm.nome,
      p_localizacao: novaForm.localizacao || null
    })
    setSalvandoNova(false)
    if (error || !data) {
      alert('Não foi possível criar a fazenda: ' + (error?.message || 'erro desconhecido'))
      return
    }
    await carregarFazendas()
    setFazendaAtual(data)
    setModalNova(false)
    setNovaForm({ nome:'', localizacao:'' })
    setSeletorAberto(false)
    setWizardFazendaId(data.id)
  }

  const mostrarComparativo = fazendas.length >= 2

  // Itens visíveis do menu: admin vê tudo; operador vê dashboard + módulos
  // fora da lista gerenciável sempre, e os demais conforme podeVer(modulo).
  // Cabeçalhos de seção (item.section) só aparecem se sobrar algum item abaixo.
  const navVisivel = (() => {
    const itemVisivel = (item) => {
      if (ehAdmin) return true
      const modulo = item.path === '/' ? 'dashboard' : item.path.slice(1)
      if (modulo === 'dashboard' || !MODULOS_GERENCIAVEIS.includes(modulo)) return true
      return podeVer(modulo)
    }
    const out = []
    let secaoPendente = null
    NAV.forEach(item => {
      if (item.section) { secaoPendente = item; return }
      if (!itemVisivel(item)) return
      if (secaoPendente) { out.push(secaoPendente); secaoPendente = null }
      out.push(item)
    })
    return out
  })()

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? 'mobile-open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="/solido.png" style={{width:88,height:88,objectFit:'contain',borderRadius:4}} alt="Logo"/>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">DigitalBov</div>
            <div className="sidebar-logo-sub">Gestão Pecuária</div>
          </div>
        </div>

        {/* Seletor de Conta — só aparece se o usuário tem mais de uma conta */}
        {contas.length > 1 && contaAtual && (
          <div style={{ padding:'6px 12px', marginBottom:4, position:'relative' }}>
            <button
              onClick={() => setSeletorContaAberto(o => !o)}
              style={{
                width:'100%', background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.14)',
                borderRadius:10, padding:'8px 10px', cursor:'pointer', color:'white',
                display:'flex', alignItems:'center', gap:8, fontFamily:'inherit', textAlign:'left'
              }}
            >
              <i className="ti ti-building-bank" style={{ fontSize:14, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.55)' }}>
                  Conta
                </div>
                <div style={{ fontSize:'.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {contaAtual.nome}
                </div>
              </div>
              <i className={`ti ti-chevron-${seletorContaAberto?'up':'down'}`} style={{ fontSize:12, flexShrink:0 }} />
            </button>

            {seletorContaAberto && (
              <div style={{
                position:'absolute', top:'100%', left:12, right:12, zIndex:100,
                background:'white', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.18)',
                border:'1px solid #E5E7EB', overflow:'hidden', marginTop:4
              }}>
                {contas.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectConta(c)}
                    style={{
                      width:'100%', padding:'10px 14px', background: c.id===contaAtual.id ? '#E8F0FC' : 'white',
                      border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                      borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:8
                    }}
                  >
                    <i className="ti ti-building-bank" style={{ color:'#2B6CD9', fontSize:14 }} />
                    <div>
                      <div style={{ fontSize:'.83rem', fontWeight:c.id===contaAtual.id?600:400, color:'#111827' }}>{c.nome}</div>
                      <div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>{c.papel}</div>
                    </div>
                    {c.id===contaAtual.id && <i className="ti ti-check" style={{ marginLeft:'auto', color:'#2B6CD9', fontSize:14 }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Seletor de Fazenda */}
        {fazendaAtual && (
          <div style={{ padding:'6px 12px', marginBottom:4, position:'relative' }}>
            <button
              onClick={() => setSeletorAberto(o => !o)}
              style={{
                width:'100%', background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.18)',
                borderRadius:10, padding:'8px 10px', cursor:'pointer', color:'white',
                display:'flex', alignItems:'center', gap:8, fontFamily:'inherit', textAlign:'left'
              }}
            >
              <i className="ti ti-home-2" style={{ fontSize:14, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {fazendaAtual.nome}
                </div>
                <div style={{ fontSize:'.65rem', color:'rgba(255,255,255,.55)', marginTop:1 }}>
                    Trocar fazenda
                  </div>
              </div>
              <i className={`ti ti-chevron-${seletorAberto?'up':'down'}`} style={{ fontSize:12, flexShrink:0 }} />
            </button>

            {seletorAberto && (
              <div style={{
                position:'absolute', top:'100%', left:12, right:12, zIndex:100,
                background:'white', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.18)',
                border:'1px solid #E5E7EB', overflow:'hidden', marginTop:4
              }}>
                {fazendas.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleSelectFazenda(f)}
                    style={{
                      width:'100%', padding:'10px 14px', background: f.id===fazendaAtual.id ? '#E8F0FC' : 'white',
                      border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                      borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:8
                    }}
                  >
                    <i className="ti ti-home-2" style={{ color:'#2B6CD9', fontSize:14 }} />
                    <div>
                      <div style={{ fontSize:'.83rem', fontWeight:f.id===fazendaAtual.id?600:400, color:'#111827' }}>{f.nome}</div>
                      {f.localizacao && <div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>{f.localizacao}</div>}
                    </div>
                    {f.id===fazendaAtual.id && <i className="ti ti-check" style={{ marginLeft:'auto', color:'#2B6CD9', fontSize:14 }} />}
                  </button>
                ))}
                {ehAdmin && (
                  <button
                    onClick={() => { setModalNova(true); setSeletorAberto(false) }}
                    style={{
                      width:'100%', padding:'10px 14px', background:'white', border:'none',
                      cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                      display:'flex', alignItems:'center', gap:8, color:'#2B6CD9', fontWeight:600
                    }}
                  >
                    <i className="ti ti-plus" style={{ fontSize:14 }} />
                    <span style={{ fontSize:'.83rem' }}>Nova fazenda</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navVisivel.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section-label">{item.section}</div>
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => handleNav(item.path)}
                style={item.destaque && !active ? {
                  background:'rgba(151,196,89,.18)', color:'#A5C8F5', fontWeight:500
                } : undefined}
              >
                <i className={`ti ${item.icon} nav-item-icon`} aria-hidden="true" />
                {item.label}
                {item.destaque && (
                  <span style={{
                    marginLeft:'auto', fontSize:'.64rem', fontWeight:700,
                    background:'rgba(151,196,89,.3)', color:'#A5C8F5',
                    borderRadius:6, padding:'1px 6px'
                  }}>IA</span>
                )}
              </button>
            )
          })}

          {ehAdmin && (
            <button
              className="nav-item"
              onClick={() => setTutorialAberto(true)}
            >
              <i className="ti ti-school nav-item-icon" />
              Tutorial
            </button>
          )}

          {/* Comparativo — só aparece com 2+ fazendas */}
          {mostrarComparativo && (
            <>
              <div className="nav-section-label">MULTI-FAZENDA</div>
              <button
                className={`nav-item ${location.pathname==='/comparativo'?'active':''}`}
                onClick={() => handleNav('/comparativo')}
              >
                <i className="ti ti-chart-bar nav-item-icon" />
                Comparativo
                <span style={{
                  marginLeft:'auto', fontSize:'.64rem', fontWeight:700,
                  background:'rgba(99,135,206,.25)', color:'#93C5FD',
                  borderRadius:6, padding:'1px 6px'
                }}>NOVO</span>
              </button>
            </>
          )}

          {ehAdmin && (
            <>
              <div className="nav-section-label">ADMINISTRAÇÃO</div>
              <button
                className={`nav-item ${location.pathname==='/usuarios'?'active':''}`}
                onClick={() => handleNav('/usuarios')}
              >
                <i className="ti ti-users nav-item-icon" />
                Usuários
              </button>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: perfil?.avatar_cor || 'rgba(255,255,255,.2)' }}>
              {initials(perfil?.nome || user?.email || '?')}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {perfil?.nome || 'Usuário'}
              </div>
              <div className="user-email" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user?.email}
              </div>
            </div>
          </div>
          <button className="nav-item" style={{ marginTop:4, width:'100%' }} onClick={() => auth.signOut()}>
            <i className="ti ti-logout nav-item-icon" />
            Sair
          </button>
        </div>
        {modalNova && (
          <div onClick={() => setModalNova(false)} style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300,
            display:'flex', alignItems:'center', justifyContent:'center', padding:20
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background:'white', borderRadius:14, padding:'28px 26px', maxWidth:380, width:'100%'
            }}>
              <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:'#2B6CD9', marginBottom:16 }}>Nova fazenda</h3>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:'.8rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Nome da fazenda *</label>
                <input className="input" style={{ width:'100%' }} placeholder="ex: Fazenda Nova"
                  value={novaForm.nome} onChange={e => setNovaForm(p => ({...p, nome:e.target.value}))} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:'.8rem', fontWeight:600, color:'#374151', display:'block', marginBottom:6 }}>Localização</label>
                <input className="input" style={{ width:'100%' }} placeholder="ex: Viamão, RS"
                  value={novaForm.localizacao} onChange={e => setNovaForm(p => ({...p, localizacao:e.target.value}))} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn" style={{ flex:1 }} onClick={() => setModalNova(false)}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex:1 }} onClick={criarFazenda} disabled={salvandoNova || !novaForm.nome}>
                  {salvandoNova ? 'Criando...' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
      {wizardFazendaId && (
        <OnboardingWizard
          fazendaId={wizardFazendaId}
          onClose={() => { setWizardFazendaId(null); window.location.reload() }}
        />
      )}
      {tutorialAberto && (
        <Tutorial
          onClose={() => setTutorialAberto(false)}
          onNaoMostrarMais={() => {
            localStorage.setItem('digitalbov_tutorial_visto', '1')
            setTutorialAberto(false)
          }}
        />
      )}
    </>
  )
}
