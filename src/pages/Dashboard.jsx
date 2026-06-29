import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, db } from '../lib/supabase'
import { calcCategoria, fmtMoeda, pct, idadeFormatada } from '../lib/helpers'
import { Loading, AlertBox, IndexCard, ErroCarregamento } from '../components/UI'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'

const MODULES = [
  { path:'/propriedade', icon:'ti-home-2',         label:'Propriedade',          sub:'Fazenda, piquetes e lotes',       bg:'#E8F0FC', color:'#1E55B0' },
  { path:'/animais',     icon:'ti-clipboard-list',  label:'Cadastro de Animais',  sub:'Registro individual do rebanho',  bg:'#FAEEDA', color:'#633806' },
  { path:'/reprodutivo', icon:'ti-activity',        label:'Painel Reprodutivo',   sub:'IATF, diagnósticos e partos',     bg:'#EEEDFE', color:'#3C3489' },
  { path:'/rebanho',     icon:'ti-chart-line',      label:'Controle de Rebanho',  sub:'Índices e estatísticas',          bg:'#E6F1FB', color:'#0C447C' },
  { path:'/sanidade',    icon:'ti-shield-check',    label:'Sanidade',             sub:'Vacinas e procedimentos',         bg:'#E8F0FC', color:'#1E55B0' },
  { path:'/pesagens',    icon:'ti-weight',          label:'Pesagens',             sub:'Pesos e GMD por animal',          bg:'#FAEEDA', color:'#633806' },
  { path:'/estoque',     icon:'ti-box',             label:'Estoque',              sub:'Medicamentos e insumos',          bg:'#EEEDFE', color:'#3C3489' },
  { path:'/financeiro',  icon:'ti-cash',            label:'Gestão Financeira',    sub:'Receitas e despesas',             bg:'#E8F0FC', color:'#1E55B0' },
]

export default function Dashboard({ perfil }) {
  const navigate = useNavigate()
  const { fazendaAtual } = useFazenda()
  const { podeEditar } = usePermissoes()
  const fileInputRef = useRef(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [animais,    setAnimais]    = useState([])
  const [lancamentos,setLancamentos]= useState([])
  const [transacoes, setTransacoes] = useState([])
  const [ciclo,      setCiclo]      = useState(null)
  const [piqs,       setPiqs]       = useState([])
  const [plan,       setPlan]       = useState(null)
  const [acoes,      setAcoes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(false)
  const [filtProp,   setFiltProp]   = useState(0)
  const [props,      setProps]      = useState([])

  useEffect(() => { loadData() }, [fazendaAtual?.id]) // eslint-disable-line

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ra, rc, rp, rpiq, rplan] = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.ciclos.current(),
        db.proprietarios.list(),
        db.piquetes.list(),
        db.planejamentos.get(),
      ])
      const animList  = ra.data   || []
      const cicloData = rc.data
      const propList  = rp.data   || []
      const piqList   = rpiq.data || []
      const planData  = rplan.data
      setAnimais(animList)
      setCiclo(cicloData)
      setProps(propList)
      setPiqs(piqList)
      setPlan(planData)
      if (cicloData) {
        const [{ data: lData }, { data: tData }] = await Promise.all([
          db.lancamentos.list(cicloData.id),
          db.transacoes.list(cicloData.id),
        ])
        setLancamentos(lData || [])
        setTransacoes(tData || [])
      }
      if (planData) {
        const { data: aData } = await db.planejamentoAcoes.list(planData.id)
        setAcoes(aData || [])
      }
    } catch (e) {
      console.error('[Dashboard] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const filtAnimais = filtProp === 0
    ? animais
    : animais.filter(a => a.proprietario_id === filtProp)

  // Composição
  const cats = {}
  filtAnimais.forEach(a => {
    const c = calcCategoria(a.data_nascimento, a.sexo)
    cats[c] = (cats[c] || 0) + 1
  })

  // Financeiro (lançamentos + transações de animais)
  const todasReceitas = [...lancamentos.filter(l=>l.tipo==='R'), ...transacoes.filter(t=>t.tipo==='V')]
  const todasDespesas = [...lancamentos.filter(l=>l.tipo==='D'), ...transacoes.filter(t=>t.tipo==='C')]
  const rec  = todasReceitas.reduce((s,l) => s + Number(l.valor), 0)
  const desp = todasDespesas.reduce((s,l) => s + Number(l.valor), 0)
  const resu = rec - desp

  // Piquetes
  const totalHa  = piqs.reduce((s,p) => s + parseFloat(p.area_ha||0), 0)
  const emUsoCnt = piqs.filter(p => p.status === 'em_uso').length

  // Planejamento
  const getCicloAno = () => { const h=new Date(); const m=h.getMonth()+1; return m>=7?h.getFullYear():h.getFullYear()-1 }
  const cicloAno    = getCicloAno()
  const acoesCiclo  = acoes.filter(a => a.ciclo_alvo === cicloAno)
  const acoesPend   = acoes.filter(a => a.status !== 'concluida').length
  const acoesConcl  = acoes.filter(a => a.status === 'concluida').length

  const hoje        = new Date()
  const hora        = hoje.getHours()
  const greeting    = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const nomeUsuario = perfil?.nome?.split(' ')[0] || 'Usuário'
  const dataHoje    = (() => {
    const s = hoje.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const matrizes = filtAnimais.filter(a => {
    const c = calcCategoria(a.data_nascimento, a.sexo)
    return c === 'Vaca' || c === 'Vaca Velha'
  }).length

  const prenhas = filtAnimais.filter(a => a.sit_reprodutiva === 'prenha').length
  const txPrenhez = matrizes > 0 ? Math.round((prenhas / matrizes) * 100) : 0

  const enviarFoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !fazendaAtual) return
    setEnviandoFoto(true)
    try {
      const ext = file.name.split('.').pop()
      const caminho = `${fazendaAtual.id}/foto.${ext}`
      const { error: upErr } = await supabase.storage.from('fazendas')
        .upload(caminho, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('fazendas').getPublicUrl(caminho)
      const urlComCache = pub.publicUrl + '?t=' + Date.now()
      await db.fazendas.update(fazendaAtual.id, { foto_url: urlComCache })
      fazendaAtual.foto_url = urlComCache
      window.location.reload()
    } catch (err) {
      alert('Erro ao enviar foto: ' + (err.message || err))
    }
    setEnviandoFoto(false)
  }

  if (loading) return <Loading text="Carregando dashboard..." />
  if (loadError) return <ErroCarregamento onRetry={loadData} />

  return (
    <div>
      {/* Saudação */}
      <div style={{
        backgroundImage: fazendaAtual?.foto_url
          ? `linear-gradient(160deg, rgba(43,108,217,.82) 0%, rgba(123,47,190,.82) 100%), url(${fazendaAtual.foto_url})`
          : 'linear-gradient(160deg, #2B6CD9 0%, #5B3FBE 55%, #7B2FBE 100%)',
        backgroundSize:'cover', backgroundPosition:'center',
        borderRadius:12, padding:'20px 24px', marginBottom:20,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        color:'white', position:'relative'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <img src="/circular-DIGITALBOV.png" style={{width:90, height:90, objectFit:'contain', borderRadius:'50%', background:'white', padding:3, flexShrink:0}} alt="DigitalBov"/>
          <div>
            <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.55)', marginBottom:5, letterSpacing:'.02em' }}>
              {dataHoje}
            </div>
            <div style={{ fontSize:'1.65rem', fontWeight:700, lineHeight:1.15, letterSpacing:'-.01em' }}>
              {fazendaAtual?.nome || 'Fazenda'}
            </div>
            <div style={{ fontSize:'1rem', fontWeight:600, color:'rgba(255,255,255,.85)', marginTop:5 }}>
              Ciclo {ciclo?.nome || '2025/26'}
            </div>
            <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.55)', marginTop:3 }}>
              {greeting}, {nomeUsuario}! 👋
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'.78rem', color:'rgba(255,255,255,.6)' }}>Rebanho ativo</div>
          <div style={{ fontSize:'2rem', fontWeight:700 }}>{filtAnimais.length}</div>
          <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.5)' }}>animais cadastrados</div>
        </div>
        {podeEditar('dashboard') && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*"
              style={{ display:'none' }} onChange={enviarFoto} />
            <button onClick={() => fileInputRef.current?.click()} disabled={enviandoFoto}
              style={{ position:'absolute', top:10, right:10, background:'rgba(255,255,255,.2)',
                border:'1px solid rgba(255,255,255,.35)', borderRadius:8, padding:'6px 10px',
                color:'white', cursor:'pointer', fontSize:'.75rem', display:'flex', alignItems:'center', gap:5 }}>
              <i className="ti ti-camera" /> {enviandoFoto ? 'Enviando...' : 'Foto da fazenda'}
            </button>
          </>
        )}
      </div>

      {/* Filtro proprietário */}
      <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:'.78rem', color:'#6B7280', fontWeight:500 }}>Exibindo:</span>
        <div className="pill-group">
          <button className={`pill ${filtProp===0?'active':''}`} onClick={() => setFiltProp(0)}>
            Todos
          </button>
          {props.map(p => (
            <button
              key={p.id}
              className={`pill ${filtProp===p.id?'active':''}`}
              onClick={() => setFiltProp(p.id)}
            >
              {p.nome.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { value: filtAnimais.length,                             label:'Total de animais',     sub:'Ativos',                    icon:'ti-chart-bar',    bg:'#E8F0FC', color:'#1E55B0' },
          { value: matrizes,                                       label:'Matrizes',             sub:'Vacas em produção',         icon:'ti-users',        bg:'#FAEEDA', color:'#633806' },
          { value: filtAnimais.filter(a=>a.sexo==='F'&&calcCategoria(a.data_nascimento,'F').includes('ovilha')).length, label:'Novilhas',  sub:'Em desenvolvimento',  icon:'ti-arrow-up-right', bg:'#EEEDFE', color:'#3C3489' },
          { value: `${totalHa.toFixed(1)} ha`,                       label:'Área útil',            sub:`${emUsoCnt} piquetes em uso`, icon:'ti-map',          bg:'#E6F1FB', color:'#0C447C' },
        ].map(k => (
          <div key={k.label} className="kpi-card">
            <div className="kpi-icon" style={{ background:k.bg, color:k.color }}>
              <i className={`ti ${k.icon}`} />
            </div>
            <div className="kpi-value" style={{ color:k.color }}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom:16 }}>
        {/* Módulos */}
        <div>
          <div className="sl">Módulos do sistema</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {MODULES.map(m => (
              <button
                key={m.path}
                onClick={() => navigate(m.path)}
                style={{
                  background:'white', border:'.5px solid #E5E7EB', borderRadius:10,
                  padding:'12px 14px', cursor:'pointer', textAlign:'left',
                  transition:'all .15s', fontFamily:'inherit'
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='#9CA3AF'; e.currentTarget.style.background='#F9FAFB' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='#E5E7EB'; e.currentTarget.style.background='white' }}
              >
                <div style={{
                  width:30, height:30, borderRadius:8,
                  background:m.bg, color:m.color,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:14, marginBottom:7
                }}>
                  <i className={`ti ${m.icon}`} />
                </div>
                <div style={{ fontSize:'.82rem', fontWeight:500, color:'#111' }}>{m.label}</div>
                <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:2 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Painel direito */}
        <div>
          {/* Índices reprodutivos */}
          <div className="sl">Índices reprodutivos — ciclo atual</div>
          <div className="grid-3" style={{ marginBottom:12 }}>
            <IndexCard value={txPrenhez+'%'} label="Taxa de prenhez"  meta="85%" ok={txPrenhez>=85} />
            <IndexCard value={prenhas}        label="Prenhas"          color="#2B6CD9" />
            <IndexCard value={matrizes}       label="Matrizes"         color="#2B6CD9" />
          </div>

          {/* Composição */}
          <div className="sl" style={{ marginTop:8 }}>Composição do rebanho</div>
          <div className="card" style={{ padding:'12px 14px', marginBottom:12 }}>
            {Object.entries(cats).length === 0
              ? <div style={{ fontSize:'.82rem', color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>Nenhum animal cadastrado</div>
              : Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat, qtd]) => (
                <div key={cat} style={{ marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'.8rem', marginBottom:3 }}>
                    <span style={{ color:'#4B5563', fontWeight:500 }}>{cat}</span>
                    <span style={{ fontWeight:600 }}>{qtd}</span>
                  </div>
                  <div className="progress-bg">
                    <div className="progress-fill" style={{
                      width:`${Math.round(qtd/filtAnimais.length*100)}%`,
                      background:'#7B2FBE'
                    }} />
                  </div>
                </div>
              ))
            }
          </div>

          {/* Financeiro resumo */}
          <div className="sl">Financeiro — {ciclo?.nome}</div>
          <div className="grid-3">
            {[
              { label:'Receitas',  value:fmtMoeda(rec),  color:'#1E55B0' },
              { label:'Despesas',  value:fmtMoeda(desp), color:'#791F1F' },
              { label:'Resultado', value:fmtMoeda(resu), color: resu>=0?'#2B6CD9':'#791F1F' },
            ].map(f => (
              <div key={f.label} className="card" style={{ padding:'10px 12px' }}>
                <div style={{ fontSize:'.72rem', color:'#6B7280' }}>{f.label}</div>
                <div style={{ fontSize:'.95rem', fontWeight:600, color:f.color, marginTop:3 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Card de planejamento */}
      {plan && (
        <div style={{ marginBottom:16 }}>
          <div className="sl">Planejamento — ciclo {cicloAno}/{String(cicloAno+1).slice(-2)}</div>
          <div className="card" style={{ borderTop:'3px solid #0C447C' }}>
            {plan.proposito && (
              <p style={{ fontSize:'.82rem', color:'#374151', marginBottom:12, fontStyle:'italic' }}>"{plan.proposito}"</p>
            )}
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:12 }}>
              <div style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 14px' }}>
                <div style={{ fontSize:'.68rem', color:'#9CA3AF' }}>AÇÕES CONCLUÍDAS</div>
                <div style={{ fontWeight:700, color:'#2B6CD9' }}>{acoesConcl}/{acoesConcl+acoesPend}</div>
              </div>
              {acoesCiclo.length > 0 && (
                <div style={{ background:'#EEF2FF', border:'.5px solid #C7D2FE', borderRadius:8, padding:'8px 14px' }}>
                  <div style={{ fontSize:'.68rem', color:'#4338CA' }}>METAS DO CICLO</div>
                  <div style={{ fontWeight:700, color:'#3730A3' }}>{acoesCiclo.filter(a=>a.status==='concluida').length}/{acoesCiclo.length}</div>
                </div>
              )}
            </div>
            {acoesCiclo.length > 0 && (
              <div>
                <div style={{ fontSize:'.78rem', fontWeight:600, color:'#374151', marginBottom:6 }}>Objetivos do ciclo atual:</div>
                {acoesCiclo.slice(0,4).map(a => (
                  <div key={a.id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:16 }}>{a.status==='concluida'?'✅':'⭕'}</span>
                    <span style={{ fontSize:'.82rem', color:'#374151', textDecoration:a.status==='concluida'?'line-through':'none' }}>{a.descricao}</span>
                  </div>
                ))}
                {acoesCiclo.length > 4 && <div style={{ fontSize:'.75rem', color:'#9CA3AF' }}>+{acoesCiclo.length-4} mais — veja em Propriedade</div>}
              </div>
            )}
            <button className="btn btn-secondary btn-sm" style={{ marginTop:10 }} onClick={() => navigate('/propriedade')}>
              <i className="ti ti-target" /> Ver planejamento completo
            </button>
          </div>
        </div>
      )}

      {/* Alertas */}
      <div className="sl">Alertas do sistema</div>
      {txPrenhez < 85 && txPrenhez > 0 && (
        <AlertBox type="amber" title="Taxa de prenhez abaixo da meta"
          body={`${txPrenhez}% · Meta >85% · Atenção no próximo protocolo IATF`} />
      )}
      {desp > rec && rec > 0 && (
        <AlertBox type="red" title="Despesas superam as receitas no ciclo atual"
          body={`Resultado negativo de ${fmtMoeda(Math.abs(resu))}`} />
      )}
      <AlertBox type="green" title="Sistema operacional"
        body={`${filtAnimais.length} animais ativos · Ciclo ${ciclo?.nome || '2025/26'} em andamento`} />
    </div>
  )
}
