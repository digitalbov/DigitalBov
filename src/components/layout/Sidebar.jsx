import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { auth, db } from '../../lib/supabase'
import { useFazenda } from '../../lib/FazendaContext'

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
  const [seletorAberto, setSeletorAberto] = useState(false)
  const [modalNova, setModalNova] = useState(false)
  const [novaForm, setNovaForm] = useState({ nome:'', localizacao:'' })
  const [salvandoNova, setSalvandoNova] = useState(false)

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

  const criarFazenda = async () => {
    if (!novaForm.nome) return
    setSalvandoNova(true)
    const { data, error } = await db.fazendas.insert({
      nome: novaForm.nome,
      localizacao: novaForm.localizacao || null,
      ativo: true
    })
    setSalvandoNova(false)
    if (error) { alert('Não foi possível criar a fazenda.'); return }
    await carregarFazendas()
    if (data) setFazendaAtual(data)
    setModalNova(false)
    setNovaForm({ nome:'', localizacao:'' })
    setSeletorAberto(false)
    window.location.reload()
  }

  const mostrarComparativo = fazendas.length >= 2

  return (
    <>
      <div className={`sidebar-backdrop ${mobileOpen ? 'mobile-open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="/logo-circular.png" style={{width:32,height:32,objectFit:'contain',borderRadius:4}} alt="Logo"/>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">Ventos da Várzea</div>
            <div className="sidebar-logo-sub">Gestão Pecuária</div>
          </div>
        </div>

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
                      width:'100%', padding:'10px 14px', background: f.id===fazendaAtual.id ? '#EAF3DE' : 'white',
                      border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                      borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:8
                    }}
                  >
                    <i className="ti ti-home-2" style={{ color:'#1E4D35', fontSize:14 }} />
                    <div>
                      <div style={{ fontSize:'.83rem', fontWeight:f.id===fazendaAtual.id?600:400, color:'#111827' }}>{f.nome}</div>
                      {f.localizacao && <div style={{ fontSize:'.72rem', color:'#9CA3AF' }}>{f.localizacao}</div>}
                    </div>
                    {f.id===fazendaAtual.id && <i className="ti ti-check" style={{ marginLeft:'auto', color:'#1E4D35', fontSize:14 }} />}
                  </button>
                ))}
                <button
                  onClick={() => { setModalNova(true); setSeletorAberto(false) }}
                  style={{
                    width:'100%', padding:'10px 14px', background:'white', border:'none',
                    cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                    display:'flex', alignItems:'center', gap:8, color:'#1E4D35', fontWeight:600
                  }}
                >
                  <i className="ti ti-plus" style={{ fontSize:14 }} />
                  <span style={{ fontSize:'.83rem' }}>Nova fazenda</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section-label">{item.section}</div>
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => handleNav(item.path)}
                style={item.destaque && !active ? {
                  background:'rgba(151,196,89,.18)', color:'#C0DD97', fontWeight:500
                } : undefined}
              >
                <i className={`ti ${item.icon} nav-item-icon`} aria-hidden="true" />
                {item.label}
                {item.destaque && (
                  <span style={{
                    marginLeft:'auto', fontSize:'.64rem', fontWeight:700,
                    background:'rgba(151,196,89,.3)', color:'#C0DD97',
                    borderRadius:6, padding:'1px 6px'
                  }}>IA</span>
                )}
              </button>
            )
          })}

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
              <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:'#1E4D35', marginBottom:16 }}>Nova fazenda</h3>
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
    </>
  )
}
