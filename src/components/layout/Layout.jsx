import { useState, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import SeletoresTopo from './SeletoresTopo'
import { Loading, Modal } from '../UI'
import ErrorBoundary from '../ErrorBoundary'
import AvisosLogin from '../AvisosLogin'
import { hoje as hojeAgora, hojeISO, getDataSimulada, setDataSimulada, limparDataSimulada } from '../../lib/hoje'
import { fmtData } from '../../lib/helpers'
import { useCiclo, calcularCicloEsperado, CARENCIA_DIAS } from '../../lib/CicloContext'
import { useFazenda } from '../../lib/FazendaContext'
import { usePermissoes } from '../../lib/PermissoesContext'
import { useConta } from '../../lib/ContaContext'

const PAGE_TITLES = {
  '/':             { title: 'Painel',                sub: 'Visão geral da fazenda' },
  '/modulos':      { title: 'Módulos',               sub: 'Todas as áreas do sistema em um só lugar' },
  '/propriedade':  { title: 'Propriedade',           sub: 'Fazenda, piquetes e lotes' },
  '/animais':      { title: 'Cadastro de Animais',   sub: 'Registro individual do rebanho' },
  '/reprodutivo':  { title: 'Gestão Reprodutiva',    sub: 'Inseminação, diagnósticos e partos' },
  '/rebanho':      { title: 'Controle de Rebanho',   sub: 'Estatísticas e índices zootécnicos' },
  '/sanidade':     { title: 'Manejo Sanitário',       sub: 'Vacinas, vermifugações e exames' },
  '/pesagens':     { title: 'Pesagens & Desempenho', sub: 'Pesos e GMD por animal' },
  '/estoque':      { title: 'Estoque',               sub: 'Medicamentos, vacinas e sêmen' },
  '/financeiro':   { title: 'Gestão Financeira',     sub: 'Receitas, despesas e resultados' },
  '/relatorios':   { title: 'Relatório de Fechamento', sub: 'Exportar e imprimir' },
  '/assistente':   { title: 'Assistente IA',         sub: 'Pergunte sobre o rebanho, finanças e estoque' },
  '/calendario':   { title: 'Calendário',             sub: 'Agenda e eventos futuros da fazenda' },
  '/metas':        { title: 'Metas & Indicadores',    sub: 'Semáforo de desempenho e KPIs zootécnicos' },
  '/backup':       { title: 'Backup & Dados',          sub: 'Exportar e fazer backup de todos os dados' },
  '/comparativo':  { title: 'Comparativo de Fazendas', sub: 'Análise financeira e zootécnica entre fazendas' },
  '/manual':       { title: 'Manual do Sistema',        sub: 'Guia completo de uso do DigitalBov' },
}

export default function Layout({ user, perfil }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [modalCicloOpen, setModalCicloOpen] = useState(false)
  const location = useLocation()
  const page = PAGE_TITLES[location.pathname] || { title: 'Sistema', sub: '' }
  // /modulos desenha o próprio cabeçalho (escuro, com saudação) — o
  // cabeçalho padrão simplesmente não entra pra essa rota, em vez de um
  // segundo <header> por cima ou um monte de `{!isModulos && ...}` picado
  // por dentro do de sempre. O botão de abrir a sidebar do cabeçalho escuro
  // usa o MESMO setSidebarOpen de sempre, passado via contexto do Outlet —
  // não é um segundo mecanismo de abrir a sidebar, só um segundo botão
  // chamando a mesma função.
  const isModulos = location.pathname === '/modulos'
  const today = hojeAgora().toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const dataSimulada = getDataSimulada()
  const { cicloAtual } = useCiclo()
  const { fazendaAtual } = useFazenda()
  const { ehAdmin } = usePermissoes()
  const { contaAtual } = useConta()
  // Data simulada é ferramenta INTERNA de teste — não existe do ponto de vista
  // do cliente. Faixa inteira (aviso + edição inline) só aparece se a CONTA
  // logada tem a flag contas.testes (ver migration_conta_testes_d9_1.sql);
  // ehAdmin continua exigido por cima, igual à tela Usuários. Edição inline
  // usa a mesma fonte única (hoje.js/localStorage) e o MESMO mecanismo de
  // aplicação da tela Usuários (setDataSimulada + reload): hoje()/hojeISO()
  // leem localStorage direto, não são reativos a estado React, então só um
  // reload garante que tudo em tela (ciclo atual, vencimentos, idades etc.)
  // passe a usar o valor novo. Por serem a mesma fonte e o mesmo helper dos
  // dois lugares, não tem como divergir.
  const podeVerDataSimulada = ehAdmin && !!contaAtual?.testes
  const [novaDataSim, setNovaDataSim] = useState(dataSimulada || '')

  const aplicarNovaDataSimulada = () => {
    if (!novaDataSim) return
    setDataSimulada(novaDataSim)
    window.location.reload()
  }

  const sairDoModoSimulacao = () => {
    limparDataSimulada()
    window.location.reload()
  }

  // Faixas de ciclo financeiro (fim próximo / início recente) — usam hoje()
  // (respeita a data simulada, então dá pra testar a virada mudando a data
  // simulada pra junho/julho). Comparação por string ISO ancorada em T12:00:00
  // pra não sofrer arredondamento por causa da hora do dia.
  const hojeISOStr = hojeISO()
  const diasParaFimCiclo = cicloAtual
    ? Math.round((new Date(cicloAtual.fim + 'T12:00:00') - new Date(hojeISOStr + 'T12:00:00')) / 86400000)
    : null
  const diasDesdeInicioCiclo = cicloAtual
    ? Math.round((new Date(hojeISOStr + 'T12:00:00') - new Date(cicloAtual.inicio + 'T12:00:00')) / 86400000)
    : null
  // Início tem prioridade, mas os períodos (jul 1-15 vs. os 30 dias antes de
  // jun 30) nunca se sobrepõem, então na prática nunca as duas disputam.
  const mostrarFaixaInicio = cicloAtual && diasDesdeInicioCiclo !== null && diasDesdeInicioCiclo >= 0 && diasDesdeInicioCiclo <= 15
  const mostrarFaixaFim    = !mostrarFaixaInicio && cicloAtual && diasParaFimCiclo !== null && diasParaFimCiclo >= 0 && diasParaFimCiclo <= 30

  // Próximo ciclo (pro texto do modal "ver mais") — calculado a partir do dia
  // seguinte ao fim do ciclo atual, mesma fonte única de nomes/datas usada na
  // criação automática (CicloContext.calcularCicloEsperado).
  const proximoCiclo = cicloAtual
    ? calcularCicloEsperado(`${parseInt(cicloAtual.fim.slice(0,4),10)}-07-01`)
    : null

  const faixaStyle = (bg, cor, borda) => ({
    width:'100%', boxSizing:'border-box', flexShrink:0,
    background:bg, color:cor, borderBottom:`1px solid ${borda}`,
    padding:'6px 12px', fontSize:13, fontWeight:600,
    display:'flex', alignItems:'center', justifyContent:'center', gap:12,
    flexWrap:'wrap', textAlign:'center',
  })

  return (
    <div className="app-shell">
      {/* Parte 3 (2026-08-13) — avisos de pendência (diagnóstico/parto/desmame
          atrasados), uma vez por login. Vive fora do fluxo de banners abaixo
          de propósito: é modal, não faixa fixa, e decide sozinho (timeout de
          4s + checagem de interação) se deve aparecer ou não. */}
      <AvisosLogin />

      {/* Aviso persistente de modo simulação — ferramenta de TESTE, para nunca
          esquecer que a data usada pelo app não é a real. Fica visível em toda
          página porque Layout envolve todas as rotas. */}
      {dataSimulada && podeVerDataSimulada && (
        <div style={faixaStyle('#FEF3C7', '#92400E', '#F3D5A3')}>
          <span>
            <i className="ti ti-alert-triangle" style={{ marginRight:6 }} />
            MODO SIMULAÇÃO (ferramenta de teste) — o sistema está usando <strong>{fmtData(dataSimulada)}</strong> como data de hoje
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:6 }}>
            <label htmlFor="faixa-nova-data-sim" style={{ fontWeight:600 }}>Mudar para:</label>
            <input id="faixa-nova-data-sim" type="date" value={novaDataSim}
              onChange={e => setNovaDataSim(e.target.value)}
              style={{ fontSize:'.75rem', padding:'2px 6px', borderRadius:6, border:`1px solid #F3D5A3` }} />
            <button onClick={aplicarNovaDataSimulada} disabled={!novaDataSim || novaDataSim === dataSimulada} style={{
              background:'#92400E', color:'white', border:'none', borderRadius:6,
              padding:'3px 10px', fontSize:'.75rem', fontWeight:700, cursor:'pointer',
              opacity:(!novaDataSim || novaDataSim === dataSimulada) ? .5 : 1,
            }}>
              aplicar
            </button>
          </span>
          <button onClick={sairDoModoSimulacao} style={{
            background:'#92400E', color:'white', border:'none', borderRadius:6,
            padding:'3px 10px', fontSize:'.75rem', fontWeight:700, cursor:'pointer',
          }}>
            voltar ao normal
          </button>
        </div>
      )}

      {mostrarFaixaInicio && (
        <div style={faixaStyle('#D1FAE5', '#065F46', '#A7F3D0')}>
          <span>
            <i className="ti ti-calendar-event" style={{ marginRight:6 }} />
            O ciclo financeiro <strong>{cicloAtual.nome}</strong> iniciou em <strong>{fmtData(cicloAtual.inicio)}</strong>. Você poderá acessar o ciclo anterior no seletor de ciclo, na faixa superior da tela.
          </span>
        </div>
      )}

      {mostrarFaixaFim && (
        <div style={faixaStyle('#D1FAE5', '#065F46', '#A7F3D0')}>
          <button onClick={() => setModalCicloOpen(true)} style={{
            background:'none', border:'none', padding:0, margin:0, font:'inherit',
            color:'inherit', cursor:'pointer', textDecoration:'none',
          }}>
            <i className="ti ti-calendar-event" style={{ marginRight:6 }} />
            O ciclo financeiro <strong>{cicloAtual.nome}</strong> da fazenda <strong>{fazendaAtual?.nome || '—'}</strong> encerra em <strong>{fmtData(cicloAtual.fim)}</strong>. <u>Clique aqui para saber mais.</u>
          </button>
        </div>
      )}

      <Modal open={modalCicloOpen} onClose={() => setModalCicloOpen(false)} title="Sobre o ciclo financeiro" width={520}>
        {cicloAtual && proximoCiclo && (
          <div style={{ fontSize:'.88rem', color:'#374151', lineHeight:1.7 }}>
            <p>Um ciclo financeiro pecuário inicia em 01/07 e encerra em 30/06 do ano seguinte.</p>
            <p>Após o encerramento você terá um período de <strong>{CARENCIA_DIAS} dias</strong> para fazer lançamentos e ajustes. O ciclo encerrado fica disponível para consulta e pode ser selecionado no botão seletor "Ciclo", na faixa superior da tela.</p>
            <p>Os lançamentos realizados com data igual ou posterior à <strong>{fmtData(proximoCiclo.inicio)}</strong> serão contabilizados no novo ciclo financeiro <strong>{proximoCiclo.nome}</strong>.</p>
          </div>
        )}
        <div style={{ display:'flex', marginTop:14 }}>
          <button className="btn btn-secondary" onClick={() => setModalCicloOpen(false)}>Fechar</button>
        </div>
      </Modal>

      <div className="app-body">
        <Sidebar
          user={user}
          perfil={perfil}
          mobileOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="main-content">
          {/* Page header — não entra em /modulos, que desenha o próprio. */}
          {!isModulos && (
            <header className="page-header">
              <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0, flex:1 }}>
                <button
                  className="hamburger-btn"
                  onClick={() => setSidebarOpen(o => !o)}
                  aria-label="Abrir menu"
                >
                  <i className="ti ti-menu-2" />
                </button>
                <div style={{ minWidth:0, flexShrink:1 }}>
                  <div className="page-title">{page.title}</div>
                  <div className="page-subtitle">{page.sub}</div>
                </div>
                {/* Barra sombreada — separa o texto do módulo dos seletores de
                    fazenda/ciclo (Fase 14, movidos aqui da sidebar). */}
                <div className="header-divider" />
                <SeletoresTopo />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
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
          )}

          {/* Page content */}
          <main className={`page-body ${isModulos ? 'page-body-modulos' : ''}`}>
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<Loading text="Carregando..." />}>
                <Outlet context={{ abrirSidebar: () => setSidebarOpen(true), perfil }} />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        <BottomNav />
      </div>
    </div>
  )
}
