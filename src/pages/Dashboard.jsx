import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, calcTaxaPrenhez, contarExpostas, contarPrenhas, fmtMoeda, valorPropLanc, contarMatrizes, somaFinita, algumErro, calcLotesFEFO, diasAteValidade } from '../lib/helpers'
import { Loading, FullLoading, AlertBox, IndexCard, ErroCarregamento } from '../components/UI'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo } from '../lib/CicloContext'
import { usePermissoes } from '../lib/PermissoesContext'

const CATEGORIAS_VALOR = [
  'Terneira','Novilha 13-24m','Novilha Prenha 13-24m',
  'Novilha 25-36m','Novilha Prenha 25-36m',
  'Vaca Vazia','Vaca Prenha','Vaca Madura Vazia','Vaca Madura Prenha',
  'Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro'
]

export default function Dashboard({ perfil }) {
  const navigate = useNavigate()
  const { fazendaAtual, fazendas } = useFazenda()
  const { cicloSelecionado } = useCiclo()
  const { podeEditar } = usePermissoes()
  const fileInputRef = useRef(null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [animais,    setAnimais]    = useState([])
  const [lancamentos,setLancamentos]= useState([])
  const [transacoes, setTransacoes] = useState([])
  const [piqs,       setPiqs]       = useState([])
  const [plan,       setPlan]       = useState(null)
  const [acoes,      setAcoes]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [loadError,  setLoadError]  = useState(false)
  const [filtProp,   setFiltProp]   = useState(0)
  const [props,      setProps]      = useState([])
  const [catPrecos,  setCatPrecos]  = useState([])
  const [lotesInsem, setLotesInsem] = useState([])
  const [itensEstoque, setItensEstoque] = useState([])
  const [movsEstoque,  setMovsEstoque]  = useState([])
  const primeiroCarregamento = useRef(true)

  useEffect(() => { loadData() }, [fazendaAtual?.id, cicloSelecionado?.id])

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const base = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.proprietarios.list(),
        db.piquetes.list(),
        db.planejamentos.get(),
        db.categoriasPreco.list(),
        db.estoque.list(),
        db.movEstoque.list(),
      ])
      if (algumErro('[Dashboard]', base)) { setLoadError(true); return }
      const [ra, rp, rpiq, rplan, rcp, rest, rmovest] = base
      const animList  = ra.data   || []
      const propList  = rp.data   || []
      const piqList   = rpiq.data || []
      const planData  = rplan.data
      setAnimais(animList)
      setProps(propList)
      setPiqs(piqList)
      setPlan(planData)
      setCatPrecos(rcp.data || [])
      setItensEstoque(rest.data || [])
      setMovsEstoque(rmovest.data || [])
      if (cicloSelecionado) {
        const doCiclo = await Promise.all([
          db.lancamentos.list(cicloSelecionado.id),
          db.transacoes.list(cicloSelecionado.id),
          db.lotesInseminacao.listInseminacoesResumo(cicloSelecionado.id),
        ])
        if (algumErro('[Dashboard]', doCiclo)) { setLoadError(true); return }
        const [{ data: lData }, { data: tData }, { data: liData }] = doCiclo
        setLancamentos(lData || [])
        setTransacoes(tData || [])
        setLotesInsem(liData || [])
      }
      if (planData) {
        const { data: aData, error: erroAcoes } = await db.planejamentoAcoes.list(planData.id)
        if (erroAcoes) console.error('[Dashboard] erro ao buscar ações do planejamento:', erroAcoes)
        setAcoes(aData || [])
      }
    } catch (e) {
      console.error('[Dashboard] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
      primeiroCarregamento.current = false
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

  // Financeiro (lançamentos com rateio por proprietário + transações de animais, sem rateio)
  // lancamentos_financeiros usa a coluna `valor`; transacoes_animais usa
  // `valor_total` — somar com o campo errado dá NaN e contamina rec/desp/resu inteiros.
  const filtPropId  = filtProp === 0 ? '' : filtProp
  const recLanc     = valorPropLanc(lancamentos, 'R', filtPropId)
  const despLanc    = valorPropLanc(lancamentos, 'D', filtPropId)
  const recTransac  = filtProp === 0 ? somaFinita(transacoes.filter(t=>t.tipo==='V'), 'valor_total') : 0
  const despTransac = filtProp === 0 ? somaFinita(transacoes.filter(t=>t.tipo==='C'), 'valor_total') : 0
  const rec  = recLanc + recTransac
  const desp = despLanc + despTransac
  const resu = rec - desp

  // Piquetes
  const totalHa  = piqs.reduce((s,p) => s + parseFloat(p.area_ha||0), 0)
  const emUsoCnt = piqs.filter(p => p.status === 'em_uso').length

  // Rentabilidade do planejamento (mesmo cálculo de Propriedade.jsx — não é salvo no banco)
  const vTerra  = plan?.dados?.valor_terra > 0
    ? plan.dados.valor_terra
    : (plan?.dados?.valor_ha > 0 && totalHa > 0 ? plan.dados.valor_ha * totalHa : 0)
  const vRebanho = plan?.dados?.valor_rebanho > 0 ? plan.dados.valor_rebanho : 0
  const vBenf    = plan?.dados?.valor_benfeitorias > 0 ? plan.dados.valor_benfeitorias : 0
  const vTotal   = vTerra + vRebanho + vBenf
  const rentTerra   = vTerra  > 0 && typeof resu==='number' && !isNaN(resu) ? (resu/vTerra*100)   : null
  const rentRebanho = vRebanho> 0 && typeof resu==='number' && !isNaN(resu) ? (resu/vRebanho*100) : null
  const rentTotal   = vTotal  > 0 && typeof resu==='number' && !isNaN(resu) ? (resu/vTotal*100)   : null

  // Planejamento
  const getCicloAno = () => { const h=new Date(); const m=h.getMonth()+1; return m>=7?h.getFullYear():h.getFullYear()-1 }
  const cicloAno    = getCicloAno()
  const acoesCiclo  = acoes.filter(a => a.ciclo_alvo === cicloAno)

  const hoje        = new Date()
  const hora        = hoje.getHours()
  const greeting    = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const nomeUsuario = perfil?.nome?.split(' ')[0] || 'Usuário'
  const dataHoje    = (() => {
    const s = hoje.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  // Estoque: lotes vencidos ou vencendo em até 30 dias (FEFO — helpers.calcLotesFEFO)
  const movsEstoquePorItem = {}
  movsEstoque.forEach(m => {
    movsEstoquePorItem[m.item_id] = movsEstoquePorItem[m.item_id] || []
    movsEstoquePorItem[m.item_id].push(m)
  })
  const lotesEstoqueVencendo = itensEstoque.flatMap(item =>
    calcLotesFEFO(movsEstoquePorItem[item.id] || [])
      .filter(l => l.validade)
      .map(l => ({ item, dias: diasAteValidade(l.validade) }))
  ).filter(l => l.dias !== null && l.dias <= 30)

  const matrizes = contarMatrizes(filtAnimais)

  // Taxa de prenhez: fórmula oficial única (helpers.calcTaxaPrenhez) — matrizes
  // distintas prenhas / matrizes distintas expostas no ciclo atual. kpiIns/kpiPrn
  // usam a mesma deduplicação por animal_id, senão o contador não bate com a taxa.
  const insemDashboard = lotesInsem.flatMap(l => l.inseminacoes || [])
  const kpiIns = contarExpostas(insemDashboard)
  const kpiPrn = contarPrenhas(insemDashboard)
  const txPrenhez = calcTaxaPrenhez(insemDashboard)

  // Valor do rebanho (resumo)
  const valorRows = CATEGORIAS_VALOR.map(cat => {
    const animaisCat = filtAnimais.filter(a =>
      calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === cat
    )
    const total = animaisCat.length
    const precoRec = catPrecos.find(r => r.categoria === cat)
    const valor = precoRec && total > 0 ? total * (precoRec.peso_medio || 0) * (precoRec.preco_kg || 0) : 0
    return { cat, total, valor }
  }).filter(row => row.total > 0)
  const totalAnimais = valorRows.reduce((s, r) => s + r.total, 0)
  const totalValor   = valorRows.reduce((s, r) => s + r.valor, 0)

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

  if (loading) return primeiroCarregamento.current
    ? <FullLoading text="Carregando dashboard..." />
    : <Loading text="Carregando dashboard..." />
  if (loadError) return <ErroCarregamento onRetry={loadData} />

  if (fazendas.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', padding:24 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🏡</div>
        <div style={{ fontSize:'1.2rem', fontWeight:700, color:'#1a1a1a', marginBottom:8 }}>
          Bem-vindo ao DigitalBov!
        </div>
        <div style={{ fontSize:'.95rem', color:'#6B7280', marginBottom:24, maxWidth:380 }}>
          Você ainda não tem nenhuma fazenda cadastrada. Crie sua primeira fazenda no módulo Propriedade para começar a usar o sistema.
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/propriedade')}
          style={{ animation:'pulseNovaFazenda 1.6s ease-in-out infinite' }}>
          <i className="ti ti-arrow-right" /> Ir para Propriedade
        </button>
        <style>{`
          @keyframes pulseNovaFazenda {
            0%, 100% { box-shadow: 0 0 0 0 rgba(43,108,217,.45); }
            50%      { box-shadow: 0 0 0 9px rgba(43,108,217,0); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div>
      {/* Saudação */}
      <div className="dash-header" style={{
        background:'linear-gradient(160deg, #2B6CD9 0%, #5B3FBE 55%, #7B2FBE 100%)',
        borderRadius:12, padding:'20px 24px', marginBottom:20,
        display:'flex', flexWrap:'wrap', alignItems:'center', justifyContent:'space-between', gap:16,
        color:'white', position:'relative'
      }}>
        <div className="dash-header-left" style={{ display:'flex', alignItems:'center', gap:16, minWidth:0 }}>
          {fazendaAtual?.foto_url ? (
            <img src={fazendaAtual.foto_url}
              onClick={() => podeEditar('dashboard') && fileInputRef.current?.click()}
              style={{ width:90, height:90, borderRadius:'50%', objectFit:'cover',
                cursor: podeEditar('dashboard') ? 'pointer' : 'default', flexShrink:0,
                border:'2px solid rgba(255,255,255,.4)' }} alt="Foto da fazenda" />
          ) : (
            <div onClick={() => podeEditar('dashboard') && fileInputRef.current?.click()}
              style={{ width:90, height:90, borderRadius:'50%', flexShrink:0,
                background:'rgba(255,255,255,.12)', border:'2px dashed rgba(255,255,255,.5)',
                display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center',
                cursor: podeEditar('dashboard') ? 'pointer' : 'default', padding:8 }}>
              <span style={{ fontSize:'.62rem', color:'rgba(255,255,255,.85)', lineHeight:1.2 }}>
                {enviandoFoto ? 'Enviando...' : (podeEditar('dashboard') ? 'Coloque seu logo aqui' : 'Sem foto')}
              </span>
            </div>
          )}
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:'.75rem', color:'rgba(255,255,255,.55)', marginBottom:5, letterSpacing:'.02em' }}>
              {dataHoje}
            </div>
            <div className="dash-fazenda-nome" style={{ fontSize:'1.65rem', fontWeight:700, lineHeight:1.15, letterSpacing:'-.01em' }}>
              {fazendaAtual?.nome || 'Fazenda'}
            </div>
            <div style={{ fontSize:'1rem', fontWeight:600, color:'rgba(255,255,255,.85)', marginTop:5 }}>
              Ciclo {cicloSelecionado?.nome || '2025/26'}
            </div>
            <div style={{ fontSize:'.8rem', color:'rgba(255,255,255,.55)', marginTop:3 }}>
              {greeting}, {nomeUsuario}! 👋
            </div>
          </div>
        </div>
        <div className="dash-header-right dash-rebanho-info" style={{ textAlign:'right' }}>
          <div style={{ fontSize:'.78rem', color:'rgba(255,255,255,.6)' }}>Rebanho ativo</div>
          <div className="dash-rebanho-contador" style={{ fontSize:'2rem', fontWeight:700 }}>{filtAnimais.length}</div>
          <div style={{ fontSize:'.72rem', color:'rgba(255,255,255,.5)' }}>animais cadastrados</div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*"
          style={{ display:'none' }} onChange={enviarFoto} />
      </div>

      {/* Card de planejamento (resumo do ciclo) */}
      {plan && (
        <div className="card" style={{ marginBottom:16, borderTop:'3px solid #2B6CD9' }}>
          <div className="kpi-label" style={{ marginBottom:2 }}>
            <span className="dash-plan-title-bold">Ciclo</span> {cicloAno}/{cicloAno+1} — <span className="dash-plan-title-bold">Planejamento</span>
          </div>
          {plan.dados?.proposito && (
            <div style={{ fontSize:'.88rem', marginBottom:4 }}>
              <span className="kpi-label dash-plan-title-bold" style={{ marginRight:4 }}>Propósito:</span>
              <span className="dash-plan-proposito-content" style={{ fontWeight:600, color:'var(--gray-900,#111)' }}>{plan.dados.proposito}</span>
            </div>
          )}
          {plan.dados?.objetivos_longo_prazo && (
            <div style={{ fontSize:'.85rem', marginBottom:10 }}>
              <span className="kpi-label dash-plan-title-bold" style={{ marginRight:4 }}>Objetivo:</span>
              <span style={{ color:'var(--gray-600,#4B5563)' }}>{plan.dados.objetivos_longo_prazo}</span>
            </div>
          )}
          <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
            <div className="dash-plan-metrics">
              <div className="dash-plan-item">
                <div className="kpi-label">
                  <span className="dash-plan-label-full">Resultado do ciclo</span>
                  <span className="dash-plan-label-abbr">Result. ciclo</span>
                </div>
                <div className="kpi-value dash-plan-value" style={{ fontSize:'1.1rem', color:'#1E55B0' }}>
                  {typeof resu==='number'&&!isNaN(resu) ? fmtMoeda(resu) : '—'}
                </div>
              </div>
              {rentTerra != null && (
                <div className="dash-plan-item">
                  <div className="kpi-label">
                    <span className="dash-plan-label-full">Rent. Terra</span>
                    <span className="dash-plan-label-abbr">R. Terra</span>
                  </div>
                  <div className="kpi-value dash-plan-value" style={{ fontSize:'1.1rem' }}>{rentTerra.toFixed(2)}%</div>
                </div>
              )}
              {rentRebanho != null && (
                <div className="dash-plan-item">
                  <div className="kpi-label">
                    <span className="dash-plan-label-full">Rent. Rebanho</span>
                    <span className="dash-plan-label-abbr">R. Rebanho</span>
                  </div>
                  <div className="kpi-value dash-plan-value" style={{ fontSize:'1.1rem' }}>{rentRebanho.toFixed(2)}%</div>
                </div>
              )}
              {rentTotal != null && (
                <div className="dash-plan-item">
                  <div className="kpi-label">
                    <span className="dash-plan-label-full">Rent. Propriedade</span>
                    <span className="dash-plan-label-abbr">R. Prop.</span>
                  </div>
                  <div className="kpi-value dash-plan-value" style={{ fontSize:'1.1rem' }}>{rentTotal.toFixed(2)}%</div>
                </div>
              )}
            </div>
            {acoesCiclo.length > 0 && (
              <div>
                <div className="kpi-label">Ações concluídas</div>
                <div className="kpi-value" style={{ fontSize:'1.1rem' }}>
                  {acoesCiclo.filter(a=>a.status==='concluida').length}/{acoesCiclo.length}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
        {/* Valor do Rebanho */}
        <div>
          <div className="sl">Valor de mercado do rebanho</div>
          <div className="card" style={{ padding:'12px 14px' }}>
            {valorRows.length === 0 ? (
              <div style={{ fontSize:'.82rem', color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>
                Sem dados suficientes (cadastre animais e preços por categoria em Financeiro → Parâmetros)
              </div>
            ) : (
              <div className="table-wrap dash-valor-table-wrap">
                <table className="dash-valor-table">
                  <thead>
                    <tr><th>Categoria</th><th style={{ textAlign:'center' }}>Qtd</th><th style={{ textAlign:'right' }}>Valor estimado</th></tr>
                  </thead>
                  <tbody>
                    {valorRows.map(row => (
                      <tr key={row.cat}>
                        <td>{row.cat}</td>
                        <td style={{ textAlign:'center' }}>{row.total}</td>
                        <td style={{ textAlign:'right', fontWeight:600, color:'#2B6CD9' }}>
                          {row.valor > 0 ? fmtMoeda(row.valor) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid #E5E7EB', fontWeight: 700 }}>
                      <td>Total</td>
                      <td style={{ textAlign:'center' }}>{totalAnimais}</td>
                      <td style={{ textAlign:'right', color:'#1E55B0' }}>
                        {totalValor > 0 ? fmtMoeda(totalValor) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Painel direito */}
        <div>
          {/* Índices reprodutivos */}
          <div className="sl">Índices reprodutivos — ciclo atual</div>
          <div className="grid-3" style={{ marginBottom:12 }}>
            <IndexCard value={txPrenhez !== null ? txPrenhez+'%' : '—'} label="Taxa de prenhez"  meta="85%" ok={txPrenhez !== null && txPrenhez>=85} />
            <IndexCard value={kpiIns > 0 ? kpiPrn : '—'} label="Prenhas"          color="#2B6CD9" />
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
          <div className="sl">Financeiro — {cicloSelecionado?.nome}</div>
          <div className="grid-3 dash-fin-grid">
            {[
              { label:'Receitas',  value:fmtMoeda(rec),  color:'#1E55B0' },
              { label:'Despesas',  value:fmtMoeda(desp), color:'#791F1F' },
              { label:'Resultado', value:fmtMoeda(resu), color: resu>=0?'#2B6CD9':'#791F1F' },
            ].map(f => (
              <div key={f.label} className="card dash-fin-card" style={{ padding:'10px 12px' }}>
                <div className="dash-fin-label" style={{ fontSize:'.72rem', color:'#6B7280' }}>{f.label}</div>
                <div className="dash-fin-value" style={{ fontSize:'.95rem', fontWeight:600, color:f.color, marginTop:3 }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas */}
      <div className="sl">Alertas do sistema</div>
      {txPrenhez !== null && txPrenhez < 85 && (
        <AlertBox type="amber" title="Taxa de prenhez abaixo da meta"
          body={`${txPrenhez}% · Meta >85% · Atenção no próximo protocolo IATF`} />
      )}
      {desp > rec && rec > 0 && (
        <AlertBox type="red" title="Despesas superam as receitas no ciclo atual"
          body={`Resultado negativo de ${fmtMoeda(Math.abs(resu))}`} />
      )}
      {lotesEstoqueVencendo.length > 0 && (
        <AlertBox type={lotesEstoqueVencendo.some(l => l.dias < 0) ? 'red' : 'amber'}
          title={`${lotesEstoqueVencendo.length} lote${lotesEstoqueVencendo.length !== 1 ? 's' : ''} de estoque vencido${lotesEstoqueVencendo.length !== 1 ? 's' : ''} ou vencendo`}
          body={`${[...new Set(lotesEstoqueVencendo.map(l => l.item.item))].slice(0, 4).join(', ')}${lotesEstoqueVencendo.length > 4 ? '...' : ''} · Veja detalhes em Estoque → Alertas`} />
      )}
      <AlertBox type="green" title="Sistema operacional"
        body={`${filtAnimais.length} animais ativos · Ciclo ${cicloSelecionado?.nome || '2025/26'} em andamento`} />
    </div>
  )
}
