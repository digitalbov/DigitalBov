import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useFazenda } from '../../lib/FazendaContext'
import { useConta } from '../../lib/ContaContext'
import { useCiclo, statusCiclo, STATUS_CICLO_LABEL } from '../../lib/CicloContext'
import { usePermissoes } from '../../lib/PermissoesContext'
import OnboardingWizard from '../OnboardingWizard'

// Fase 14 — seletores de Fazenda e Ciclo, antes na sidebar (coluna estreita,
// tema escuro, painel position:absolute ancorado na própria largura da
// sidebar), agora na faixa superior (.page-header, tema claro, uma linha só).
// O painel do dropdown usa position:fixed (calculado a partir do retângulo
// real do botão) em vez de absolute: no mobile .page-header tem
// overflow:hidden (pra nunca quebrar linha), então um painel absolute
// filho dela seria cortado; fixed escapa disso.
function usePainelFixo(aberto, btnRef) {
  const [pos, setPos] = useState(null)
  useEffect(() => {
    if (!aberto || !btnRef.current) { setPos(null); return }
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left, minWidth: Math.max(r.width, 220) })
  }, [aberto, btnRef])
  return pos
}

const chipBtnStyle = {
  display:'flex', alignItems:'center', gap:6, background:'var(--gray-50)',
  border:'1px solid var(--gray-200)', borderRadius:8, padding:'6px 10px',
  cursor:'pointer', color:'var(--gray-700)', fontFamily:'inherit', height:34,
  maxWidth:180, minWidth:0, flexShrink:0,
}
const painelStyle = (pos) => ({
  position:'fixed', top:pos.top, left:pos.left, minWidth:pos.minWidth, zIndex:500,
  background:'white', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,.18)',
  border:'1px solid var(--gray-200)', overflow:'hidden',
})

export default function SeletoresTopo() {
  const navigate = useNavigate()
  const location = useLocation()
  const { fazendas, fazendaAtual, setFazendaAtual, carregarFazendas } = useFazenda()
  const { contaAtual } = useConta()
  const { ciclos, cicloSelecionado, setCicloSelecionado, statusCicloSelecionado } = useCiclo()
  const { ehAdmin } = usePermissoes()

  const [seletorAberto, setSeletorAberto] = useState(false)
  const [seletorCicloAberto, setSeletorCicloAberto] = useState(false)
  const [modalNova, setModalNova] = useState(false)
  const [novaForm, setNovaForm] = useState({ nome:'', localizacao:'' })
  const [salvandoNova, setSalvandoNova] = useState(false)
  const [wizardFazendaId, setWizardFazendaId] = useState(null)

  const btnFazendaRef = useRef(null)
  const btnCicloRef = useRef(null)
  const posFazenda = usePainelFixo(seletorAberto, btnFazendaRef)
  const posCiclo = usePainelFixo(seletorCicloAberto, btnCicloRef)

  const handleSelectFazenda = (f) => {
    setFazendaAtual(f)
    setSeletorAberto(false)
    navigate(location.pathname, { replace: true })
    window.location.reload()
  }

  const criarFazenda = async () => {
    if (!ehAdmin) return
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

  return (
    <div className="header-selectors" style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
      {/* Seletor de Fazenda */}
      {fazendaAtual && (
        <div style={{ position:'relative', minWidth:0 }}>
          <button ref={btnFazendaRef} className="header-selector-btn" style={chipBtnStyle} onClick={() => setSeletorAberto(o => !o)}>
            <i className="ti ti-home-2" style={{ fontSize:14, color:'var(--gray-500)', flexShrink:0 }} />
            <span className="header-selector-label" style={{ fontSize:'.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
              {fazendaAtual.nome}
            </span>
            <i className={`ti ti-chevron-${seletorAberto?'up':'down'}`} style={{ fontSize:11, color:'var(--gray-400)', flexShrink:0 }} />
          </button>

          {seletorAberto && posFazenda && (
            <div style={painelStyle(posFazenda)}>
              {fazendas.map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFazenda(f)}
                  style={{
                    width:'100%', padding:'10px 14px', background: f.id===fazendaAtual.id ? 'var(--brand-green-bg)' : 'white',
                    border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                    borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8
                  }}
                >
                  <i className="ti ti-home-2" style={{ color:'var(--brand-green)', fontSize:14 }} />
                  <div>
                    <div style={{ fontSize:'.83rem', fontWeight:f.id===fazendaAtual.id?600:400, color:'var(--gray-900)' }}>{f.nome}</div>
                    {f.localizacao && <div style={{ fontSize:'.72rem', color:'var(--gray-400)' }}>{f.localizacao}</div>}
                  </div>
                  {f.id===fazendaAtual.id && <i className="ti ti-check" style={{ marginLeft:'auto', color:'var(--brand-green)', fontSize:14 }} />}
                </button>
              ))}
              {ehAdmin && (
                <button
                  onClick={() => { setModalNova(true); setSeletorAberto(false) }}
                  style={{
                    width:'100%', padding:'10px 14px', background:'white', border:'none',
                    cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                    display:'flex', alignItems:'center', gap:8, color:'var(--brand-green)', fontWeight:600
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

      {/* Seletor de Ciclo */}
      {cicloSelecionado && (
        <div style={{ position:'relative', minWidth:0 }}>
          <button ref={btnCicloRef} className="header-selector-btn" style={chipBtnStyle} onClick={() => setSeletorCicloAberto(o => !o)}>
            <i className="ti ti-calendar-event" style={{ fontSize:14, color:'var(--gray-500)', flexShrink:0 }} />
            <span className="header-selector-label" style={{ fontSize:'.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
              {cicloSelecionado.nome}
            </span>
            <i className={`ti ti-chevron-${seletorCicloAberto?'up':'down'}`} style={{ fontSize:11, color:'var(--gray-400)', flexShrink:0 }} />
          </button>

          {seletorCicloAberto && posCiclo && (
            <div style={{ ...painelStyle(posCiclo), maxHeight:280, overflowY:'auto' }}>
              {ciclos.map(c => {
                const st = statusCiclo(c)
                return (
                  <button
                    key={c.id}
                    onClick={() => { setCicloSelecionado(c); setSeletorCicloAberto(false) }}
                    style={{
                      width:'100%', padding:'10px 14px', background: c.id===cicloSelecionado.id ? 'var(--brand-green-bg)' : 'white',
                      border:'none', cursor:'pointer', textAlign:'left', fontFamily:'inherit',
                      borderBottom:'1px solid var(--gray-100)', display:'flex', alignItems:'center', gap:8
                    }}
                  >
                    <i className="ti ti-calendar-event" style={{ color:'var(--brand-green)', fontSize:14 }} />
                    <div>
                      <div style={{ fontSize:'.83rem', fontWeight:c.id===cicloSelecionado.id?600:400, color:'var(--gray-900)' }}>
                        {c.nome} <span style={{ fontSize:'.7rem', color:'var(--gray-500)', fontWeight:400 }}>({STATUS_CICLO_LABEL[st]})</span>
                      </div>
                    </div>
                    {c.id===cicloSelecionado.id && <i className="ti ti-check" style={{ marginLeft:'auto', color:'var(--brand-green)', fontSize:14 }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Link externo — abre o site de índices/mercado da Nespro/UFRGS em nova
          aba. Não é um seletor (não tem estado/dropdown), mas usa o mesmo
          chipBtnStyle e a mesma classe header-selector-label (que some no
          mobile) pra não destoar visualmente dos botões de fazenda/ciclo. */}
      <a
        href="https://bovinos-indices.nesproufrgs.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="header-selector-btn"
        style={{ ...chipBtnStyle, textDecoration:'none', maxWidth:220 }}
        title="Mercado e Índices Nespro (abre em nova aba)"
      >
        <i className="ti ti-chart-line" style={{ fontSize:14, color:'var(--gray-500)', flexShrink:0 }} />
        <span className="header-selector-label" style={{ fontSize:'.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>
          Mercado e Índices Nespro
        </span>
        <i className="ti ti-external-link" style={{ fontSize:11, color:'var(--gray-400)', flexShrink:0 }} />
      </a>

      {modalNova && (
        <div onClick={() => setModalNova(false)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center', padding:20
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'white', borderRadius:14, padding:'28px 26px', maxWidth:380, width:'100%'
          }}>
            <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--brand-green)', marginBottom:16 }}>Nova fazenda</h3>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:'.8rem', fontWeight:600, color:'var(--gray-700)', display:'block', marginBottom:6 }}>Nome da fazenda *</label>
              <input className="input" style={{ width:'100%' }} placeholder="ex: Fazenda Nova"
                value={novaForm.nome} onChange={e => setNovaForm(p => ({...p, nome:e.target.value}))} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:'.8rem', fontWeight:600, color:'var(--gray-700)', display:'block', marginBottom:6 }}>Localização</label>
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

      {wizardFazendaId && (
        <OnboardingWizard
          fazendaId={wizardFazendaId}
          onClose={() => { setWizardFazendaId(null); window.location.reload() }}
        />
      )}
    </div>
  )
}
