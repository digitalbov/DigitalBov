// ─────────────────────────────────────────────────────────────────
// CONTROLE DE REBANHO
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, calcTaxaPrenhez, calcGMD, pct, fmtMoeda, ehMatriz } from '../lib/helpers'
import { Loading, IndexCard, BotaoPDF, ErroCarregamento, SeletorCicloLocal, Badge, EmptyState } from '../components/UI'
import { useCicloLocal } from '../lib/useCicloLocal'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TABS_R = ['Visão Geral','Índices','Comparativo','Histórico','Valor de Mercado do Rebanho']
const CATEGORIAS_VALOR = [
  'Terneira','Novilha 13-24m','Novilha Prenha 13-24m',
  'Novilha 25-36m','Novilha Prenha 25-36m',
  'Vaca Vazia','Vaca Prenha','Vaca Madura Vazia','Vaca Madura Prenha',
  'Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro'
]

export function Rebanho() {
  const navigate   = useNavigate()
  const refVisao   = useRef(null)
  const refIndices = useRef(null)
  const refComp    = useRef(null)
  const refHist    = useRef(null)
  const refValor   = useRef(null)

  const [animais,      setAnimais]      = useState([])
  const [props,        setProps]        = useState([])
  const [tab,          setTab]          = useState(0)
  const [filtProp,     setFiltProp]     = useState('')
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)
  const [catPrecos,    setCatPrecos]    = useState([])
  const [selProps,     setSelProps]     = useState([])
  const [todosLotesInsem, setTodosLotesInsem] = useState([])
  const [pesagensPorAnimal, setPesagensPorAnimal] = useState({})

  // Seletor de ciclo LOCAL da aba Índices.
  const { cicloLocal, setCicloLocal, ciclos, cicloAtual } = useCicloLocal()
  const lotesInsem = todosLotesInsem.filter(l => l.ciclo_id === cicloLocal?.id)

  // Dados de TODOS os ciclos (partos, lançamentos, transações) — usados nas
  // abas "Comparativo" e "Histórico", que comparam a fazenda inteira ciclo a
  // ciclo (não dependem do seletor de ciclo local).
  const [partosTodos,       setPartosTodos]       = useState([])
  const [lancsPorCiclo,     setLancsPorCiclo]     = useState({})
  const [transacsPorCiclo,  setTransacsPorCiclo]  = useState({})
  const [loadingCiclos,     setLoadingCiclos]     = useState(false)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (ciclos.length > 0) loadDadosPorCiclo() }, [ciclos.length])

  const loadDadosPorCiclo = async () => {
    setLoadingCiclos(true)
    try {
      const [rPartos, pares] = await Promise.all([
        db.partos.listAll(),
        Promise.all(ciclos.map(async c => {
          const [rl, rt] = await Promise.all([db.lancamentos.list(c.id), db.transacoes.list(c.id)])
          if (rl.error) console.error(`[Rebanho] erro ao buscar lançamentos do ciclo ${c.nome}:`, rl.error)
          if (rt.error) console.error(`[Rebanho] erro ao buscar transações do ciclo ${c.nome}:`, rt.error)
          return [c.id, rl.data || [], rt.data || []]
        }))
      ])
      if (rPartos.error) console.error('[Rebanho] erro ao buscar partos:', rPartos.error)
      setPartosTodos(rPartos.data || [])
      setLancsPorCiclo(Object.fromEntries(pares.map(([id, lancs]) => [id, lancs])))
      setTransacsPorCiclo(Object.fromEntries(pares.map(([id, , transacs]) => [id, transacs])))
    } catch (e) {
      console.error('[Rebanho] erro ao carregar dados por ciclo:', e)
    } finally {
      setLoadingCiclos(false)
    }
  }

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ra, rp, rc, rli] = await Promise.all([
        db.animais.list(),
        db.proprietarios.list(),
        db.categoriasPreco.list(),
        db.lotesInseminacao.listAll(),
      ])
      const propsData   = rp.data || []
      const animaisData = ra.data || []
      setAnimais(animaisData)
      setProps(propsData)
      setCatPrecos(rc.data || [])
      setTodosLotesInsem(rli.data || [])
      setSelProps(prev => prev.length === 0 ? propsData.map(p => p.id) : prev)

      if (ra.error)  console.error('[Rebanho] erro ao buscar animais:', ra.error)
      if (rli.error) console.error('[Rebanho] erro ao buscar lotes de inseminação:', rli.error)

      // Pesagens dos terneiros/terneiras ativos, para o GMD — uma única query
      // com .in('animal_id', ids) em vez de 1 query por terneiro em loop.
      const terneirosAtivos = animaisData.filter(a =>
        a.situacao === 'ativo' && ['Terneiro','Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo))
      )
      const { data: pesagensTerneiros, error: erroPesagens } = await db.pesagens.listPorAnimais(terneirosAtivos.map(t => t.id))
      if (erroPesagens) console.error('[Rebanho] erro ao buscar pesagens dos terneiros:', erroPesagens)
      const pesagensMap = {}
      terneirosAtivos.forEach(t => { pesagensMap[t.id] = [] })
      ;(pesagensTerneiros || []).forEach(p => {
        if (!pesagensMap[p.animal_id]) pesagensMap[p.animal_id] = []
        pesagensMap[p.animal_id].push(p)
      })
      setPesagensPorAnimal(pesagensMap)
    } catch (e) {
      console.error('[Rebanho] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const togSelProp = (id) => setSelProps(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  const ativos = animais.filter(a =>
    a.situacao === 'ativo' && (!filtProp || a.proprietario_id === filtProp)
  )
  const fem    = ativos.filter(a => a.sexo === 'F')
  const matrizes = ativos.filter(a => ehMatriz(a))

  // Índices reprodutivos do ciclo atual — fórmula oficial única (helpers.calcTaxaPrenhez):
  // prenhas diagnosticadas / inseminadas no ciclo — não usa matrizes por idade nem sit_reprodutiva atual
  const insemRebanho = lotesInsem.flatMap(l => l.inseminacoes || [])
  const kpiIns = insemRebanho.length
  const kpiPrn = insemRebanho.filter(i => i.diagnostico === 'P').length
  const txPrenNum = calcTaxaPrenhez(insemRebanho)
  const txPren = txPrenNum !== null ? txPrenNum + '%' : '—'

  // GMD de terneiros/terneiras ativos: (peso mais recente - peso inicial) / dias entre as pesagens.
  // Usa o calcGMD único de helpers.js (retorna string via toFixed ou null) — convertido
  // para número aqui antes de filtrar/agregar.
  const terneiros = ativos.filter(a => ['Terneiro','Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo)))
  const gmdTerneiros = terneiros
    .map(t => ({ sexo: t.sexo, gmd: parseFloat(calcGMD(pesagensPorAnimal[t.id])) }))
    .filter(t => Number.isFinite(t.gmd))
  const mediaGMD = (lista) => lista.length > 0 ? lista.reduce((s, v) => s + v, 0) / lista.length : null
  const fmtGMD   = (v) => v === null ? '—' : `${v.toFixed(2).replace('.', ',')} kg/dia`
  const gmdTotal  = mediaGMD(gmdTerneiros.map(t => t.gmd))
  const gmdFemeas = mediaGMD(gmdTerneiros.filter(t => t.sexo === 'F').map(t => t.gmd))
  const gmdMachos = mediaGMD(gmdTerneiros.filter(t => t.sexo === 'M').map(t => t.gmd))

  const catMap = {}
  ativos.forEach(a => {
    const c = calcCategoria(a.data_nascimento, a.sexo)
    catMap[c] = (catMap[c] || 0) + 1
  })
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value }))

  // Dados para aba Valor de Mercado do Rebanho
  const ativosGlobal    = animais.filter(a => a.situacao === 'ativo')
  const propsSelecionadas = props.filter(p => selProps.includes(p.id))
  const valorRows = CATEGORIAS_VALOR.map(cat => {
    const animaisCat = ativosGlobal.filter(a =>
      calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === cat
    )
    const porProp = propsSelecionadas.map(p => ({
      propId: p.id,
      count: animaisCat.filter(a => a.proprietario_id === p.id).length
    }))
    const total    = porProp.reduce((s, pp) => s + pp.count, 0)
    const precoRec = catPrecos.find(r => r.categoria === cat)
    const valor    = precoRec && total > 0 ? total * (precoRec.peso_medio || 0) * (precoRec.preco_kg || 0) : 0
    return { cat, porProp, total, valor, precoRec }
  })
  const totalGeral = valorRows.reduce((s, r) => s + r.total, 0)
  const valorGeral = valorRows.reduce((s, r) => s + r.valor, 0)

  // Dados para as abas "Comparativo" e "Histórico" — todos os ciclos da
  // fazenda, ordenados cronologicamente (mais antigo → mais recente)
  const ciclosOrdenados = [...ciclos].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''))

  const statsPorCiclo = ciclosOrdenados.map(c => {
    const lotesDoCiclo = todosLotesInsem.filter(l => l.ciclo_id === c.id)
    const insemDoCiclo = lotesDoCiclo.flatMap(l => l.inseminacoes || [])
    const inseminacoes = insemDoCiclo.length
    const prenhas      = insemDoCiclo.filter(i => i.diagnostico === 'P').length
    const txPrenhez    = calcTaxaPrenhez(insemDoCiclo)
    const nascimentos  = partosTodos.filter(p => p.ciclo_id === c.id).length
    const lancs        = lancsPorCiclo[c.id] || []
    const transacs     = transacsPorCiclo[c.id] || []
    const receitas     = lancs.filter(l => l.tipo === 'R').reduce((s, l) => s + Number(l.valor), 0)
                       + transacs.filter(t => t.tipo === 'V').reduce((s, t) => s + Number(t.valor_total), 0)
    const despesas     = lancs.filter(l => l.tipo === 'D').reduce((s, l) => s + Number(l.valor), 0)
                       + transacs.filter(t => t.tipo === 'C').reduce((s, t) => s + Number(t.valor_total), 0)
    const resultado    = receitas - despesas
    const vendas       = transacs.filter(t => t.tipo === 'V').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0)
    const compras      = transacs.filter(t => t.tipo === 'C').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0)
    return { ciclo: c, inseminacoes, prenhas, txPrenhez, nascimentos, receitas, despesas, resultado, vendas, compras }
  })

  const evolucaoData = statsPorCiclo.map(s => ({
    nome: s.ciclo.nome,
    Nascimentos: s.nascimentos,
    Vendas: s.vendas,
    Compras: s.compras,
  }))

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  const PDF_CONFIG_R = [
    { ref: refVisao,   filename:'rebanho-visao-geral', titulo:'Rebanho: Visão Geral' },
    { ref: refIndices, filename:'rebanho-indices',      titulo:'Rebanho: Índices' },
    { ref: refComp,    filename:'rebanho-comparativo',  titulo:'Rebanho: Comparativo' },
    { ref: refHist,    filename:'rebanho-historico',    titulo:'Rebanho: Histórico' },
    { ref: refValor,   filename:'rebanho-valor',        titulo:'Rebanho: Valor de Mercado do Rebanho' },
  ]
  const pdfAtualR = PDF_CONFIG_R[tab]

  return (
    <div>
      <div className="tabs-bar">
        {TABS_R.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, alignItems:'center' }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>
          <div className="pill-group">
            <button className={`pill ${!filtProp?'active':''}`} onClick={()=>setFiltProp('')}>Todos</button>
            {props.map(p => (
              <button key={p.id} className={`pill ${filtProp===p.id?'active':''}`} onClick={()=>setFiltProp(p.id)}>
                {p.nome.split(' ')[0]}
              </button>
            ))}
          </div>
          {tab === 1 && (
            <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
          )}
        </div>
        <BotaoPDF contentRef={pdfAtualR.ref} filename={pdfAtualR.filename} titulo={pdfAtualR.titulo} />
      </div>

      {tab === 0 && (
        <div>
          <div ref={refVisao}>
          <div className="kpi-grid">
            {[
              { v:ativos.length,       l:'Animais ativos',  s:`${animais.filter(a=>a.situacao!=='ativo').length} inativos`, c:'#2B6CD9' },
              { v:matrizes.length,     l:'Matrizes',        s:'Vacas em produção',      c:'#2B6CD9' },
              { v:fem.length,          l:'Fêmeas',          s:`${ativos.filter(a=>a.sexo==='M').length} machos`,  c:'#0C447C' },
              { v:'92,6 ha',           l:'Área útil',       s:'3 piquetes',             c:'#633806' },
            ].map(k => (
              <div key={k.l} className="kpi-card">
                <div className="kpi-value" style={{color:k.c}}>{k.v}</div>
                <div className="kpi-label">{k.l}</div>
                <div className="kpi-sub">{k.s}</div>
              </div>
            ))}
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title"><i className="ti ti-chart-bar"/> Composição por categoria</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={catData} margin={{top:0,right:10,left:-20,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
                  <XAxis dataKey="name" tick={{fontSize:10}} />
                  <YAxis tick={{fontSize:10}}/>
                  <Tooltip/>
                  <Bar dataKey="value" name="Animais" fill="#7B2FBE" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-title"><i className="ti ti-users"/> Por proprietário</div>
              {props.map(p => {
                const pa = ativos.filter(a=>a.proprietario_id===p.id)
                return (
                  <div key={p.id} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:'.85rem',fontWeight:500}}>{p.nome.split(' ')[0]}</span>
                      <span style={{fontSize:'.85rem',fontWeight:600,color:'#2B6CD9'}}>{pa.length}</span>
                    </div>
                    <div className="progress-bg">
                      <div className="progress-fill" style={{width:`${pct(pa.length,ativos.length)}`,background:'#7B2FBE'}}/>
                    </div>
                    <div style={{fontSize:'.72rem',color:'#9CA3AF',marginTop:2}}>
                      {pa.filter(a=>a.sexo==='F').length}♀ · {pa.filter(a=>a.sexo==='M').length}♂
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          </div>{/* end refVisao */}
        </div>
      )}

      {tab === 1 && (
        <div>
          <div ref={refIndices}>
          <div className="sl">Índices reprodutivos</div>
          <div className="grid-4" style={{marginBottom:16}}>
            <IndexCard value={txPren} label="Taxa de prenhez" meta="≥85%" ok={txPrenNum !== null && txPrenNum >= 85}/>
            <IndexCard value={kpiIns} label="Inseminadas no ciclo" color="#2B6CD9"/>
            <IndexCard value={kpiPrn} label="Prenhas no ciclo" color="#2B6CD9"/>
            <IndexCard value={partosTodos.filter(p => p.ciclo_id === cicloLocal?.id).length} label="Nascimentos no ciclo" color="#0C447C"/>
          </div>

          <div className="sl">GMD terneiros (0–12 meses)</div>
          <div className="grid-3" style={{marginBottom:16}}>
            <IndexCard value={fmtGMD(gmdTotal)}  label="GMD total"  meta="≥0,80 kg/dia" ok={gmdTotal !== null && gmdTotal >= 0.80}/>
            <IndexCard value={fmtGMD(gmdFemeas)} label="GMD fêmeas" color="#DB2777"/>
            <IndexCard value={fmtGMD(gmdMachos)} label="GMD machos" color="#1E55B0"/>
          </div>
          <div className="card">
            <div className="card-title"><i className="ti ti-chart-line"/> Evolução dos índices</div>
            <div style={{ padding:'24px 0', textAlign:'center', color:'#9CA3AF', fontSize:'.85rem', lineHeight:1.6 }}>
              <i className="ti ti-clock" style={{ fontSize:32, display:'block', marginBottom:10, opacity:.4 }}/>
              Nenhum dado histórico disponível.<br/>
              Os índices serão exibidos aqui conforme os ciclos forem sendo registrados no sistema.
            </div>
          </div>
          </div>{/* end refIndices */}
        </div>
      )}

      {tab === 2 && (
        <div>
          <div ref={refComp}>
          <div className="card">
          <div className="card-title"><i className="ti ti-columns"/> Comparativo de ciclos</div>
          {loadingCiclos ? <Loading /> : ciclosOrdenados.length === 0 ? (
            <EmptyState icon="📊" title="Nenhum ciclo cadastrado" sub="Cadastre um ciclo em Financeiro para ver o comparativo." />
          ) : (
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead>
                  <tr>
                    <th>Indicador</th>
                    {statsPorCiclo.map(s => (
                      <th key={s.ciclo.id} style={{ textAlign:'right', fontWeight: s.ciclo.id===cicloAtual?.id?700:600 }}>
                        {s.ciclo.nome}{s.ciclo.id===cicloAtual?.id && <Badge color="purple" style={{marginLeft:6}}>atual</Badge>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Inseminações</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right'}}>{s.inseminacoes || '—'}</td>)}
                  </tr>
                  <tr>
                    <td>Prenhas</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right',color:'#1E55B0'}}>{s.prenhas || '—'}</td>)}
                  </tr>
                  <tr>
                    <td>Taxa de prenhez</td>
                    {statsPorCiclo.map(s => (
                      <td key={s.ciclo.id} style={{textAlign:'right',fontWeight:500,color:s.txPrenhez>=85?'#1E55B0':s.txPrenhez!=null?'#BA7517':'#9CA3AF'}}>
                        {s.txPrenhez !== null ? `${s.txPrenhez}%` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Nascimentos no ciclo</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right'}}>{s.nascimentos || '—'}</td>)}
                  </tr>
                  <tr className="tr-total">
                    <td>Receitas</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right',color:'#1E55B0'}}>{fmtMoeda(s.receitas)}</td>)}
                  </tr>
                  <tr>
                    <td>Despesas</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right',color:'#791F1F'}}>{fmtMoeda(s.despesas)}</td>)}
                  </tr>
                  <tr className="tr-total">
                    <td>Resultado</td>
                    {statsPorCiclo.map(s => (
                      <td key={s.ciclo.id} style={{textAlign:'right',fontWeight:600,color:s.resultado>=0?'#1E55B0':'#791F1F'}}>
                        {fmtMoeda(s.resultado)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          </div>
          </div>{/* end refComp */}
        </div>
      )}

      {tab === 3 && (
        <div>
          <div ref={refHist}>
          <div className="card" style={{marginBottom:12}}>
          <div className="card-title"><i className="ti ti-trending-up"/> Evolução do rebanho por ciclo</div>
          {loadingCiclos ? <Loading /> : ciclosOrdenados.length === 0 ? (
            <EmptyState icon="📈" title="Nenhum ciclo cadastrado" sub="Cadastre um ciclo em Financeiro para ver a evolução." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={evolucaoData} margin={{top:4,right:16,bottom:4,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="nome" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Nascimentos" name="Nascimentos no ciclo" fill="#4ADE80" radius={[4,4,0,0]} />
                  <Bar dataKey="Vendas"      fill="#60A5FA" radius={[4,4,0,0]} />
                  <Bar dataKey="Compras"     fill="#F59E0B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
          </div>
          {!loadingCiclos && ciclosOrdenados.length > 0 && (
            <div className="card">
              <div className="card-title"><i className="ti ti-table"/> Resumo por ciclo</div>
              <div className="table-wrap" style={{border:'none'}}>
                <table>
                  <thead>
                    <tr>
                      <th>Ciclo</th>
                      <th style={{textAlign:'right'}}>Nascimentos no ciclo</th>
                      <th style={{textAlign:'right'}}>Vendas</th>
                      <th style={{textAlign:'right'}}>Compras</th>
                      <th style={{textAlign:'right'}}>Variação líquida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statsPorCiclo.map(s => {
                      const variacaoLiquida = s.nascimentos - s.vendas
                      return (
                        <tr key={s.ciclo.id} style={{fontWeight: s.ciclo.id===cicloAtual?.id?600:400}}>
                          <td>{s.ciclo.nome}{s.ciclo.id===cicloAtual?.id && <Badge color="purple" style={{marginLeft:6}}>atual</Badge>}</td>
                          <td style={{textAlign:'right'}}>{s.nascimentos}</td>
                          <td style={{textAlign:'right'}}>{s.vendas}</td>
                          <td style={{textAlign:'right'}}>{s.compras}</td>
                          <td style={{textAlign:'right',color:variacaoLiquida>=0?'#1E55B0':'#791F1F'}}>
                            {variacaoLiquida>=0?'+':''}{variacaoLiquida}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{fontSize:'.72rem',color:'#9CA3AF',marginTop:8}}>
                Variação líquida = nascimentos − vendas no ciclo (estimativa, já que não há um snapshot histórico do total de animais por ciclo).
              </p>
            </div>
          )}
          </div>{/* end refHist */}
        </div>
      )}

      {tab === 4 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginBottom:8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/financeiro', { state: { tab: 4 } })}>
              <i className="ti ti-settings" /> Ajustar preços (Parâmetros)
            </button>
          </div>
          <div ref={refValor}>
          <div style={{ marginBottom:14 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>Valor de mercado estimado do rebanho, por categoria e proprietário</span>
          </div>

          {/* Checkboxes de proprietários */}
          <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:14, background:'white', border:'.5px solid #E5E7EB', borderRadius:10, padding:'10px 16px', alignItems:'center' }}>
            <span style={{ fontSize:'.78rem', fontWeight:500, color:'#6B7280' }}>Proprietários:</span>
            {props.map(p => (
              <label key={p.id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'.85rem', cursor:'pointer' }}>
                <input type="checkbox" checked={selProps.includes(p.id)} onChange={() => togSelProp(p.id)} />
                {p.nome.split(' ')[0]}
              </label>
            ))}
          </div>

          {/* Tabela */}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoria</th>
                  {propsSelecionadas.map(p => <th key={p.id} style={{ textAlign:'center' }}>{p.nome.split(' ')[0]}</th>)}
                  <th style={{ textAlign:'center' }}>Total</th>
                  <th>Peso médio</th>
                  <th>R$/kg</th>
                  <th>Valor estimado</th>
                </tr>
              </thead>
              <tbody>
                {valorRows.filter(row => row.total > 0).map(row => (
                  <tr key={row.cat}>
                    <td><strong>{row.cat}</strong></td>
                    {row.porProp.map(pp => (
                      <td key={pp.propId} style={{ textAlign:'center' }}>{pp.count || '—'}</td>
                    ))}
                    <td style={{ fontWeight:600, textAlign:'center' }}>{row.total || '—'}</td>
                    <td style={{ fontSize:'.78rem', color:'#6B7280' }}>
                      {row.precoRec ? `${row.precoRec.peso_medio} kg` : '—'}
                    </td>
                    <td style={{ fontSize:'.78rem', color:'#6B7280' }}>
                      {row.precoRec ? `R$ ${Number(row.precoRec.preco_kg||0).toFixed(2).replace('.',',')}` : '—'}
                    </td>
                    <td style={{ fontWeight:600, color:'#2B6CD9' }}>
                      {row.valor > 0 ? fmtMoeda(row.valor) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight:700, background:'#F0F9EC', borderTop:'1.5px solid #D1FAE5' }}>
                  <td>Total geral</td>
                  {propsSelecionadas.map(p => (
                    <td key={p.id} style={{ textAlign:'center' }}>
                      {valorRows.reduce((s, r) => s + (r.porProp.find(pp => pp.propId === p.id)?.count || 0), 0)}
                    </td>
                  ))}
                  <td style={{ textAlign:'center' }}>{totalGeral}</td>
                  <td></td>
                  <td></td>
                  <td style={{ color:'#2B6CD9' }}>{fmtMoeda(valorGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>{/* end refValor */}
        </div>
      )}

    </div>
  )
}
export default Rebanho
