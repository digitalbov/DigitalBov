// ─────────────────────────────────────────────────────────────────
// CONTROLE DE REBANHO
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, pct, fmtMoeda } from '../lib/helpers'
import { Loading, IndexCard, BotaoPDF, ErroCarregamento } from '../components/UI'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const TABS_R = ['Visão Geral','Índices','Comparativo','Histórico','Valor do Rebanho']
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
  const [ciclo,        setCiclo]        = useState(null)
  const [lotesInsem,   setLotesInsem]   = useState([])
  const [pesagensPorAnimal, setPesagensPorAnimal] = useState({})

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ra, rp, rc, rciclo] = await Promise.all([
        db.animais.list(),
        db.proprietarios.list(),
        db.categoriasPreco.list(),
        db.ciclos.current(),
      ])
      const propsData   = rp.data || []
      const animaisData = ra.data || []
      const cicloData   = rciclo.data
      setAnimais(animaisData)
      setProps(propsData)
      setCatPrecos(rc.data || [])
      setCiclo(cicloData)
      setSelProps(prev => prev.length === 0 ? propsData.map(p => p.id) : prev)

      setLotesInsem(cicloData ? (await db.lotesInseminacao.list(cicloData.id)).data || [] : [])

      // Pesagens dos terneiros/terneiras ativos, para o GMD
      const terneirosAtivos = animaisData.filter(a =>
        a.situacao === 'ativo' && ['Terneiro','Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo))
      )
      const pesagensRes = await Promise.all(terneirosAtivos.map(t => db.pesagens.list(t.id)))
      const pesagensMap = {}
      terneirosAtivos.forEach((t, idx) => { pesagensMap[t.id] = pesagensRes[idx].data || [] })
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
  const matrizes = ativos.filter(a => ['Vaca','Vaca Madura'].includes(calcCategoria(a.data_nascimento, a.sexo)))

  // Índices reprodutivos do ciclo atual (mesma lógica do Reprodutivo/Dashboard):
  // prenhas diagnosticadas / inseminadas no ciclo — não usa matrizes por idade nem sit_reprodutiva atual
  const kpiIns = lotesInsem.reduce((s, l) => s + (l.inseminacoes?.length || 0), 0)
  const kpiPrn = lotesInsem.reduce((s, l) => s + (l.inseminacoes?.filter(i => i.diagnostico === 'P').length || 0), 0)
  const txPren = kpiIns > 0 ? Math.round(kpiPrn / kpiIns * 100) + '%' : '—'

  // GMD de terneiros/terneiras ativos: (peso mais recente - peso inicial) / dias entre as pesagens
  const terneiros = ativos.filter(a => ['Terneiro','Terneira'].includes(calcCategoria(a.data_nascimento, a.sexo)))
  const calcGMD = (pesagensAnimal) => {
    if (!pesagensAnimal || pesagensAnimal.length < 2) return null
    const ordenadas = [...pesagensAnimal].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
    const primeira = ordenadas[0]
    const ultima   = ordenadas[ordenadas.length - 1]
    const dias = Math.round((new Date(ultima.data) - new Date(primeira.data)) / 86400000)
    if (dias <= 0) return null
    const ganho = parseFloat(ultima.peso_kg) - parseFloat(primeira.peso_kg)
    return Number.isFinite(ganho) ? ganho / dias : null
  }
  const gmdTerneiros = terneiros
    .map(t => ({ sexo: t.sexo, gmd: calcGMD(pesagensPorAnimal[t.id]) }))
    .filter(t => t.gmd !== null && Number.isFinite(t.gmd))
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

  // Dados para aba Valor do Rebanho
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

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  const PDF_CONFIG_R = [
    { ref: refVisao,   filename:'rebanho-visao-geral', titulo:'Rebanho: Visão Geral' },
    { ref: refIndices, filename:'rebanho-indices',      titulo:'Rebanho: Índices' },
    { ref: refComp,    filename:'rebanho-comparativo',  titulo:'Rebanho: Comparativo' },
    { ref: refHist,    filename:'rebanho-historico',    titulo:'Rebanho: Histórico' },
    { ref: refValor,   filename:'rebanho-valor',        titulo:'Rebanho: Valor do Rebanho' },
  ]
  const pdfAtualR = PDF_CONFIG_R[tab]

  return (
    <div>
      <div className="tabs-bar">
        {TABS_R.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
        <div className="pill-group">
          <button className={`pill ${!filtProp?'active':''}`} onClick={()=>setFiltProp('')}>Todos</button>
          {props.map(p => (
            <button key={p.id} className={`pill ${filtProp===p.id?'active':''}`} onClick={()=>setFiltProp(p.id)}>
              {p.nome.split(' ')[0]}
            </button>
          ))}
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
          <div className="sl">Índices reprodutivos — ciclo atual {ciclo?.nome ? `(${ciclo.nome})` : ''}</div>
          <div className="grid-3" style={{marginBottom:16}}>
            <IndexCard value={txPren} label="Taxa de prenhez" meta="≥85%" ok={kpiIns > 0 && (kpiPrn / kpiIns) >= 0.85}/>
            <IndexCard value={kpiIns} label="Inseminadas no ciclo" color="#2B6CD9"/>
            <IndexCard value={kpiPrn} label="Prenhas no ciclo" color="#2B6CD9"/>
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
          <div style={{ padding:'24px 0', textAlign:'center', color:'#9CA3AF', fontSize:'.85rem', lineHeight:1.6 }}>
            <i className="ti ti-database" style={{ fontSize:32, display:'block', marginBottom:10, opacity:.4 }}/>
            Os dados comparativos entre ciclos serão exibidos aqui<br/>
            conforme os ciclos forem sendo encerrados e registrados no sistema.
          </div>
          </div>
          </div>{/* end refComp */}
        </div>
      )}

      {tab === 3 && (
        <div>
          <div ref={refHist}>
          <div className="card">
          <div className="card-title"><i className="ti ti-trending-up"/> Evolução do rebanho</div>
          <div style={{ padding:'24px 0', textAlign:'center', color:'#9CA3AF', fontSize:'.85rem', lineHeight:1.6 }}>
            <i className="ti ti-trending-up" style={{ fontSize:32, display:'block', marginBottom:10, opacity:.4 }}/>
            O histórico de evolução do rebanho será construído automaticamente<br/>
            ao longo dos ciclos.
          </div>
          </div>
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
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>Valor estimado do rebanho por categoria e proprietário</span>
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
