import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, fmtData, fmtMoeda, pct, ehMatriz, algumErro, somaFinita } from '../lib/helpers'
import { Loading, Badge, AlertBox, toast, SeletorCicloLocal, ErroCarregamento } from '../components/UI'
import { useFazenda } from '../lib/FazendaContext'
import { useCicloLocal } from '../lib/useCicloLocal'

const TABS = ['Resumo Geral','Reprodução','Financeiro']
const CATS_REL = [
  'Terneira','Novilha 13-24m','Novilha Prenha 13-24m',
  'Novilha 25-36m','Novilha Prenha 25-36m',
  'Vaca Vazia','Vaca Prenha','Vaca Madura Vazia','Vaca Madura Prenha',
  'Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro'
]
const NOMES_PDF = ['relatorio-geral','relatorio-reprodutivo','relatorio-financeiro']
const TITULOS_PDF = ['Relatório Geral', 'Painel Reprodutivo', 'Gestão Financeira']

export default function Relatorios() {
  const [tab,       setTab]      = useState(0)
  const [animais,   setAnimais]  = useState([])
  const [lancs,     setLancs]    = useState([])
  const [transacoes,setTransacoes]=useState([])
  const [lotes,     setLotes]    = useState([])
  const [partos,    setPartos]   = useState([])
  const [sanidade,  setSanidade] = useState([])
  const [props,     setProps]    = useState([])
  const [catPrecos, setCatPrecos]= useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [generating,setGenerating]=useState(false)
  const { fazendaAtual } = useFazenda()
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()

  const resumoRef      = useRef(null)
  const reproducaoRef  = useRef(null)
  const financeiroRef  = useRef(null)
  const tabRefs        = [resumoRef, reproducaoRef, financeiroRef]
  const hoje = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})

  useEffect(() => { loadAll() }, [cicloLocal?.id])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const base = await Promise.all([
        db.animais.list(),
        db.sanidade.list(),
        db.proprietarios.list(),
        db.categoriasPreco.list()
      ])
      if (algumErro('[Relatorios]', base)) { setLoadError(true); return }
      const [ra, rs, rp, rcp] = base
      setAnimais(ra.data || [])
      setSanidade(rs.data  || [])
      setProps(rp.data     || [])
      setCatPrecos(rcp.data|| [])
      if (cicloLocal) {
        const doCiclo = await Promise.all([
          db.lancamentos.list(cicloLocal.id),
          db.transacoes.list(cicloLocal.id),
          db.lotesInseminacao.listInseminacoesResumo(cicloLocal.id),
          db.partos.list(cicloLocal.id)
        ])
        if (algumErro('[Relatorios]', doCiclo)) { setLoadError(true); return }
        const [rl, rt, rli, rpt] = doCiclo
        setLancs(rl.data       || [])
        setTransacoes(rt.data  || [])
        setLotes(rli.data      || [])
        setPartos(rpt.data     || [])
      }
    } catch (e) {
      console.error('[Relatorios] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const gerarPDF = async (ref, filename, titulo = '') => {
    if (!ref.current) return
    setGenerating(true)
    try {
      const { gerarPDFComMolduras } = await import('../lib/pdf')
      await gerarPDFComMolduras(ref.current, filename, titulo, fazendaAtual?.nome || '')
    } catch (e) {
      toast('Erro ao gerar PDF: ' + e.message, 'error')
    }
    setGenerating(false)
  }

  const PDFButton = ({ tabIdx }) => (
    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
      <button className="btn btn-primary btn-sm"
        onClick={() => gerarPDF(tabRefs[tabIdx], NOMES_PDF[tabIdx], TITULOS_PDF[tabIdx])}
        disabled={generating}>
        <i className="ti ti-file-type-pdf" /> {generating ? 'Gerando...' : 'Gerar PDF'}
      </button>
    </div>
  )

  // Cálculos
  const ativos   = animais.filter(a => a.situacao === 'ativo')
  const inativos = animais.filter(a => a.situacao !== 'ativo')
  const matrizes = ativos.filter(a => ehMatriz(a))
  const prenhas  = ativos.filter(a => a.sit_reprodutiva === 'prenha').length
  // Receitas/despesas: lançamentos usam a coluna `valor`, transações de animais
  // usam `valor_total` — soma protegida (helpers.somaFinita) para não deixar o
  // campo errado/ausente virar NaN. Sem transações, os Relatórios ficavam
  // incompletos para fazendas que vendem/compram animais pelo fluxo do Financeiro.
  const rec      = somaFinita(lancs.filter(l=>l.tipo==='R'), 'valor') + somaFinita(transacoes.filter(t=>t.tipo==='V'), 'valor_total')
  const desp     = somaFinita(lancs.filter(l=>l.tipo==='D'), 'valor') + somaFinita(transacoes.filter(t=>t.tipo==='C'), 'valor_total')
  const resu     = rec - desp

  const totalIns = lotes.reduce((s,l)=>s+(l.inseminacoes?.length||0),0)
  const totalPrn = lotes.reduce((s,l)=>s+(l.inseminacoes?.filter(i=>i.diagnostico==='P').length||0),0)
  const hoje2    = new Date()
  const vencSan  = sanidade.filter(d=>d.proximo&&new Date(d.proximo+'T12:00:00')<hoje2).length

  const catMap = {}
  ativos.forEach(a => {
    const c = calcCategoria(a.data_nascimento, a.sexo)
    catMap[c] = (catMap[c]||0)+1
  })

  const valorRowsRel = CATS_REL.map(cat => {
    const animaisCat = ativos.filter(a =>
      calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === cat
    )
    const porProp = props.map(p => ({
      propId: p.id,
      nome:   p.nome.split(' ')[0],
      count:  animaisCat.filter(a => a.proprietario_id === p.id).length
    }))
    const total    = animaisCat.length
    const precoRec = catPrecos.find(r => r.categoria === cat)
    const valor    = precoRec && total > 0 ? total * (precoRec.peso_medio||0) * (precoRec.preco_kg||0) : 0
    return { cat, porProp, total, valor }
  }).filter(row => row.total > 0)
  const valorTotalRel = valorRowsRel.reduce((s,r) => s + r.valor, 0)

  const PrintHeader = ({ titulo }) => (
    <div style={{ textAlign:'center', padding:'16px 0 12px', borderBottom:'.5px solid #E5E7EB', marginBottom:16 }}>
      <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#111' }}>DigitalBov</div>
      <div style={{ fontSize:'.85rem', color:'#6B7280', marginTop:2 }}>{titulo} · Ciclo {cicloLocal?.nome||'—'} · Gerado em {hoje}</div>
    </div>
  )

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div className="relatorios-page">
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Resumo Geral ── */}
      {tab === 0 && (
        <div>
          <PDFButton tabIdx={0} />
          <div ref={resumoRef}>
            <div style={{ background:'var(--gray-100)', border:'.5px solid var(--gray-200)', borderRadius:12, padding:'16px 20px', color:'var(--gray-900)', marginBottom:16 }}>
              <PrintHeader titulo="Relatório Geral" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10, marginTop:8 }}>
                {[
                  { v:ativos.length,   l:'Animais ativos' },
                  { v:matrizes.length, l:'Matrizes' },
                  { v:partos.length,   l:'Nascimentos' },
                  { v:'92,6 ha',       l:'Área útil' },
                ].map(k => (
                  <div key={k.l} style={{ background:'white', border:'.5px solid var(--gray-200)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:'1.4rem', fontWeight:700, color:'#2B6CD9' }}>{k.v}</div>
                    <div style={{ fontSize:'.72rem', color:'var(--gray-500)', marginTop:2 }}>{k.l}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom:14 }}>
              <div className="card">
                <div className="card-title"><i className="ti ti-users"/> Composição do rebanho</div>
                {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,qt]) => (
                  <div key={cat} className="row">
                    <span className="row-label">{cat}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:60 }}>
                        <div className="progress-bg">
                          <div className="progress-fill" style={{ width:`${Math.round(qt/ativos.length*100)}%`, background:'#7B2FBE' }}/>
                        </div>
                      </div>
                      <span className="row-value">{qt}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title"><i className="ti ti-chart-bar"/> Índices principais</div>
                {[
                  { l:'Taxa de prenhez',    v:pct(prenhas,matrizes.length),           ok: prenhas/Math.max(1,matrizes.length)>=0.85 },
                  { l:'Taxa de parição',    v:pct(partos.length,totalPrn),             ok: partos.length/Math.max(1,totalPrn)>=0.80 },
                  { l:'Receita bruta',      v:fmtMoeda(rec),                           ok: true },
                  { l:'Resultado do ciclo', v:fmtMoeda(resu),                          ok: resu>=0 },
                  { l:'Proc. sanidade',     v:`${sanidade.length} (${vencSan} venc.)`, ok: vencSan===0 },
                ].map(k => (
                  <div key={k.l} className="row">
                    <span className="row-label">{k.l}</span>
                    <span className="row-value" style={{ color: k.ok?'#1E55B0':'#791F1F' }}>{k.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {valorRowsRel.length > 0 && (
              <div className="card" style={{ marginBottom:14 }}>
                <div className="card-title"><i className="ti ti-cash"/> Valor estimado do rebanho</div>
                <div className="table-wrap" style={{ border:'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Categoria</th>
                        {props.map(p => <th key={p.id} style={{ textAlign:'center' }}>{p.nome.split(' ')[0]}</th>)}
                        <th style={{ textAlign:'center' }}>Total</th>
                        <th style={{ textAlign:'right' }}>Valor estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {valorRowsRel.map(row => (
                        <tr key={row.cat}>
                          <td><strong>{row.cat}</strong></td>
                          {row.porProp.map(pp => (
                            <td key={pp.propId} style={{ textAlign:'center' }}>{pp.count || '—'}</td>
                          ))}
                          <td style={{ fontWeight:600, textAlign:'center' }}>{row.total}</td>
                          <td style={{ fontWeight:600, textAlign:'right', color:'#2B6CD9' }}>
                            {row.valor > 0 ? fmtMoeda(row.valor) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight:700, background:'#F0F9EC', borderTop:'1.5px solid #D1FAE5' }}>
                        <td>Total geral</td>
                        {props.map(p => (
                          <td key={p.id} style={{ textAlign:'center' }}>
                            {valorRowsRel.reduce((s,r) => s + (r.porProp.find(pp=>pp.propId===p.id)?.count||0), 0)}
                          </td>
                        ))}
                        <td style={{ textAlign:'center' }}>
                          {valorRowsRel.reduce((s,r) => s + r.total, 0)}
                        </td>
                        <td style={{ textAlign:'right', color:'#2B6CD9' }}>{fmtMoeda(valorTotalRel)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {vencSan > 0 && (
              <AlertBox type="amber" title="Procedimentos sanitários vencidos"
                body={`${vencSan} procedimento(s) com data de reforço vencida. Verifique o módulo Sanidade.`}/>
            )}
            <AlertBox type="green" title="Sistema operacional"
              body={`${ativos.length} animais ativos · ${inativos.length} inativos no histórico · Ciclo ${cicloLocal?.nome} em andamento`}/>
          </div>
        </div>
      )}

      {/* ── Reprodução ── */}
      {tab === 1 && (
        <div>
          <PDFButton tabIdx={1} />
          <div ref={reproducaoRef}>
            <div className="card" style={{ marginBottom:14 }}>
              <PrintHeader titulo="Relatório Reprodutivo" />
              <div className="sl">Lotes de inseminação</div>
              {lotes.length === 0
                ? <div style={{ color:'#9CA3AF', fontSize:'.82rem' }}>Nenhum lote registrado neste ciclo.</div>
                : (
                  <div className="table-wrap" style={{ border:'none' }}>
                    <table>
                      <thead><tr><th>Lote</th><th>Touro</th><th>Data</th><th>Insem.</th><th>Prenhas</th><th>Tx prenhez</th><th>Parto prev.</th></tr></thead>
                      <tbody>
                        {lotes.map(l => {
                          const ins = l.inseminacoes||[]
                          const prn = ins.filter(i=>i.diagnostico==='P').length
                          return (
                            <tr key={l.id}>
                              <td><strong>{l.numero}</strong></td>
                              <td>{l.touro}</td>
                              <td>{fmtData(l.data)}</td>
                              <td>{ins.length}</td>
                              <td style={{ color:'#1E55B0', fontWeight:500 }}>{prn}</td>
                              <td style={{ color: prn/Math.max(1,ins.length)>=0.85?'#1E55B0':'#791F1F' }}>{pct(prn,ins.length)}</td>
                              <td style={{ color:'#6B7280', fontSize:'.78rem' }}>
                                {l.data ? new Date(new Date(l.data+'T12:00:00').setMonth(new Date(l.data+'T12:00:00').getMonth()+9)).toLocaleDateString('pt-BR') : '—'}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="tr-total">
                          <td colSpan={3}>Total ciclo {cicloLocal?.nome}</td>
                          <td>{totalIns}</td>
                          <td style={{color:'#1E55B0'}}>{totalPrn}</td>
                          <td>{pct(totalPrn,totalIns)}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>

            <div className="card" style={{ marginBottom:14 }}>
              <div className="sl" style={{ marginBottom:12 }}>Nascimentos — ciclo {cicloLocal?.nome}</div>
              {partos.length === 0
                ? <div style={{ color:'#9CA3AF', fontSize:'.82rem' }}>Nenhum nascimento registrado.</div>
                : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10, marginBottom:12 }}>
                      {[
                        { v:partos.length,                                   l:'Total nascimentos' },
                        { v:partos.filter(p=>p.bezerro?.sexo==='M').length, l:'Machos ♂' },
                        { v:partos.filter(p=>p.bezerro?.sexo==='F').length, l:'Fêmeas ♀' },
                      ].map(k => (
                        <div key={k.l} style={{ background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'10px', textAlign:'center' }}>
                          <div style={{ fontSize:'1.3rem', fontWeight:600, color:'#2B6CD9' }}>{k.v}</div>
                          <div style={{ fontSize:'.75rem', color:'#6B7280', marginTop:2 }}>{k.l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="table-wrap" style={{ border:'none' }}>
                      <table>
                        <thead><tr><th>Data</th><th>Mãe</th><th>Sexo</th><th>Brinco</th></tr></thead>
                        <tbody>
                          {partos.map(p => (
                            <tr key={p.id}>
                              <td>{fmtData(p.data_parto)}</td>
                              <td><strong>{p.mae?.brinco||'—'}</strong></td>
                              <td>{p.bezerro?.sexo==='F'?'♀ Fêmea':'♂ Macho'}</td>
                              <td><Badge color="gray">{p.bezerro?.brinco||'—'}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              }
            </div>

            <div className="card">
              <div className="sl" style={{ marginBottom:12 }}>Índices reprodutivos — ciclo {cicloLocal?.nome}</div>
              {[
                { l:'Taxa de prenhez',     v:pct(totalPrn,totalIns),          meta:'≥85%', ok:totalPrn/Math.max(1,totalIns)>=0.85 },
                { l:'Taxa de parição',     v:pct(partos.length,totalPrn),     meta:'≥80%', ok:partos.length/Math.max(1,totalPrn)>=0.80 },
                { l:'Abortos registrados', v:'—',                             meta:'<5%',  ok:true },
                { l:'Intervalo de partos', v:'12,4 meses (est.)',             meta:'<13m', ok:true },
              ].map(k => (
                <div key={k.l} className="row">
                  <span className="row-label">{k.l}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span className="row-value" style={{ color: k.ok?'#1E55B0':'#791F1F' }}>{k.v}</span>
                    <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>meta: {k.meta} {k.ok?'✓':'↑'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Financeiro ── */}
      {tab === 2 && (
        <div>
          <PDFButton tabIdx={2} />
          <div ref={financeiroRef}>
            <div className="card" style={{ marginBottom:14 }}>
              <PrintHeader titulo="Relatório Financeiro" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:14 }}>
                {[
                  { v:fmtMoeda(rec),  l:'Receitas',  c:'#1E55B0', bg:'#E8F0FC' },
                  { v:fmtMoeda(desp), l:'Despesas',  c:'#791F1F', bg:'#FCEBEB' },
                  { v:fmtMoeda(Math.abs(resu)), l:resu>=0?'Resultado positivo':'Resultado negativo', c:resu>=0?'#2B6CD9':'#791F1F', bg:resu>=0?'#E8F0FC':'#FCEBEB' },
                ].map(k => (
                  <div key={k.l} style={{ background:k.bg, borderRadius:8, padding:'12px', textAlign:'center' }}>
                    <div style={{ fontSize:'1.1rem', fontWeight:700, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:'.72rem', color:k.c, opacity:.8, marginTop:2 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div className="sl">Receitas por grupo</div>
              {['Venda de Animais','Valores a Receber','Aporte','Outras Receitas'].map(gr => {
                const vl = lancs.filter(l=>l.tipo==='R'&&l.grupo===gr).reduce((s,l)=>s+Number(l.valor),0)
                return vl > 0 ? (
                  <div key={gr} className="row">
                    <span className="row-label">{gr}</span>
                    <span className="row-value" style={{ color:'#1E55B0' }}>{fmtMoeda(vl)}</span>
                  </div>
                ) : null
              })}
              <div className="sl" style={{ marginTop:12 }}>Despesas por grupo</div>
              {['Remédios','Suplementos','Mão de Obra','Combustível','Inseminação','Manutenção','Ferramentas','Estrutura','Máquinas e Equipamentos'].map(gr => {
                const vl = lancs.filter(l=>l.tipo==='D'&&l.grupo===gr).reduce((s,l)=>s+Number(l.valor),0)
                return vl > 0 ? (
                  <div key={gr} className="row">
                    <span className="row-label">{gr}</span>
                    <span className="row-value" style={{ color:'#791F1F' }}>{fmtMoeda(vl)}</span>
                  </div>
                ) : null
              })}
            </div>
            <div className="card">
              <div className="sl" style={{ marginBottom:10 }}>Indicadores de rentabilidade</div>
              {[
                { l:'Retorno sobre despesas (ROI)',  v:desp>0?Math.round(resu/desp*100)+'%':'—',               meta:'≥30%', ok:desp>0&&resu/desp>=0.3 },
                { l:'Margem bruta',                 v:rec>0?Math.round(resu/rec*100)+'%':'—',                  meta:'≥25%', ok:rec>0&&resu/rec>=0.25 },
                { l:'Custo por matriz (est.)',       v:matrizes.length>0?fmtMoeda(Math.round(desp/matrizes.length)):'—', meta:'≤R$500', ok:matrizes.length>0&&desp/matrizes.length<=500 },
                { l:'Eficiência por hectare (est.)', v:'—', meta:'≥180 kg/ha', ok:false },
              ].map(k => (
                <div key={k.l} className="row">
                  <span className="row-label">{k.l}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span className="row-value" style={{ color: k.ok?'#1E55B0':'#BA7517' }}>{k.v}</span>
                    <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>meta: {k.meta} {k.ok?'✓':'↑'}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
