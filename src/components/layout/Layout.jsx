import { useState, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import { Loading } from '../UI'

const PAGE_TITLES = {
  '/':             { title: 'Dashboard',            sub: 'Visão geral da fazenda' },
  '/propriedade':  { title: 'Propriedade',           sub: 'Fazenda, piquetes e lotes' },
  '/animais':      { title: 'Cadastro de Animais',   sub: 'Registro individual do rebanho' },
  '/reprodutivo':  { title: 'Painel Reprodutivo',    sub: 'Inseminação, diagnósticos e partos' },
  '/rebanho':      { title: 'Controle de Rebanho',   sub: 'Estatísticas e índices zootécnicos' },
  '/sanidade':     { title: 'Sanidade',              sub: 'Vacinas, vermifugações e exames' },
  '/pesagens':     { title: 'Pesagens & Desempenho', sub: 'Pesos e GMD por animal' },
  '/estoque':      { title: 'Estoque',               sub: 'Medicamentos, vacinas e sêmen' },
  '/financeiro':   { title: 'Gestão Financeira',     sub: 'Receitas, despesas e resultados' },
  '/relatorios':   { title: 'Relatórios',            sub: 'Exportar e imprimir' },
  '/assistente':   { title: 'Assistente IA',         sub: 'Pergunte sobre o rebanho, finanças e estoque' },
  '/calendario':   { title: 'Calendário',             sub: 'Agenda e eventos futuros da fazenda' },
  '/metas':        { title: 'Metas & Indicadores',    sub: 'Semáforo de desempenho e KPIs zootécnicos' },
  '/backup':       { title: 'Backup & Dados',          sub: 'Exportar e fazer backup de todos os dados' },
  '/comparativo':  { title: 'Comparativo',             sub: 'Análise financeira e zootécnica entre fazendas' },
}

export default function Layout({ user, perfil }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const page = PAGE_TITLES[location.pathname] || { title: 'Sistema', sub: '' }
  const today = new Date().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        perfil={perfil}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        {/* Page header */}
        <header className="page-header">
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Abrir menu"
            >
              <i className="ti ti-menu-2" />
            </button>
            <div>
              <div className="page-title">{page.title}</div>
              <div className="page-subtitle">{page.sub}</div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div className="page-date" style={{
              fontSize:'.78rem', color:'#9CA3AF',
              display:'flex', alignItems:'center', gap:5
            }}>
              <i className="ti ti-calendar" style={{fontSize:13}} />
              {today}
            </div>
            <div className="page-ia-badge" style={{
              background:'#EEEDFE', color:'#3C3489',
              borderRadius:8, padding:'3px 9px',
              fontSize:'.72rem', fontWeight:600,
              display:'flex', alignItems:'center', gap:4
            }}>
              <i className="ti ti-brain" style={{fontSize:11}} />
              IA + Voz
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="page-body">
          <Suspense fallback={<Loading text="Carregando..." />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <BottomNav onMais={() => setSidebarOpen(true)} />
    </div>
  )
}
