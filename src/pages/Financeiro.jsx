import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { fmtMoeda, fmtData, getCicloNome, GRUPOS_REC, GRUPOS_DES } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento } from '../components/UI'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { usePermissoes } from '../lib/PermissoesContext'

const TABS = ['Resumo','Lançamentos','Compra & Venda','Resultados','Parâmetros','Ciclos']

export default function Financeiro() {
  const refResumo    = useRef(null)
  const refLancs     = useRef(null)
  const refTransacs  = useRef(null)
  const refResultados= useRef(null)
  const refParams    = useRef(null)

  const [tab,      setTab]     = useState(0)
  const [ciclos,   setCiclos]  = useState([])
  const [cicloId,  setCicloId] = useState('')
  const [lancs,    setLancs]   = useState([])
  const [transacs, setTransacs]= useState([])
  const [catPrecos,setCatPrecos]= useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [modal,    setModal]   = useState(null)
  const [form,     setForm]    = useState({})
  const [filtTp,      setFiltTp]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [cicloVencido,setCicloVencido]= useState(null)
  const [modalCiclo,  setModalCiclo]  = useState(false)
  const [formCiclo,   setFormCiclo]   = useState({})
  const [savingCiclo, setSavingCiclo] = useState(false)

  const { podeEditar } = usePermissoes()
  const podeEditarFinanceiro = podeEditar('financeiro')

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (cicloId) loadCiclo() }, [cicloId])

  const loadBase = async () => {
    setLoadError(false)
    try {
      const [rc, rcp] = await Promise.all([db.ciclos.list(), db.categoriasPreco.list()])
      const cl = rc.data || []
      setCiclos(cl)
      setCatPrecos(rcp.data || [])
      const cur = cl.find(c => c.atual)
      if (cur) {
        setCicloId(cur.id)
        if (cur.fim && new Date(cur.fim + 'T23:59:59') < new Date()) setCicloVencido(cur)
      } else if (cl.length) setCicloId(cl[0].id)
    } catch (e) {
      console.error('[Financeiro] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const abrirModalNovoCiclo = () => {
    const cur = ciclos.find(c => c.atual)
    const anoBase = cur
      ? parseInt(cur.nome.split('/')[1]) + 2000
      : new Date().getFullYear() + 1
    setFormCiclo({
      nome:  `${anoBase - 1}/${String(anoBase).slice(-2)}`,
      inicio: `${anoBase - 1}-07-01`,
      fim:    `${anoBase}-06-30`
    })
    setModalCiclo(true)
  }

  const criarNovoCiclo = async () => {
    if (!formCiclo.nome || !formCiclo.inicio || !formCiclo.fim) {
      toast('Preencha todos os campos.', 'error'); return
    }
    setSavingCiclo(true)
    await db.ciclos.deactivateAll()
    const { error } = await db.ciclos.insert({
      nome: formCiclo.nome, inicio: formCiclo.inicio, fim: formCiclo.fim, atual: true
    })
    setSavingCiclo(false)
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast('Novo ciclo iniciado!')
    setModalCiclo(false)
    setCicloVencido(null)
    loadBase()
  }

  const excluirLanc = async (id) => {
    const { error } = await db.lancamentos.delete(id)
    if (error) { toast('Erro ao excluir.', 'error'); return }
    toast('Removido.')
    loadCiclo()
  }

  const loadCiclo = async () => {
    const [rl, rt] = await Promise.all([db.lancamentos.list(cicloId), db.transacoes.list(cicloId)])
    setLancs(rl.data  || [])
    setTransacs(rt.data || [])
  }

  const rec  = lancs.filter(l => l.tipo==='R').reduce((s,l) => s+Number(l.valor),0)
  const desp = lancs.filter(l => l.tipo==='D').reduce((s,l) => s+Number(l.valor),0)
  const resu = rec - desp
  const cicloAtual = ciclos.find(c => c.id === cicloId)

  const salvarLanc = async () => {
    if (!form.data||!form.grupo||!form.valor||!form.descricao) {
      toast('Preencha todos os campos.','error'); return
    }
    setSaving(true)
    const ciclo = ciclos.find(c => {
      const d=new Date(form.data+'T12:00:00'),ini=new Date(c.inicio),fim=new Date(c.fim)
      return d>=ini && d<=fim
    })
    const { error } = await db.lancamentos.insert({
      ciclo_id: ciclo?.id||cicloId, data:form.data,
      tipo:form.tipo||'D', grupo:form.grupo,
      descricao:form.descricao, valor:parseFloat(form.valor)
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Lançamento salvo!'); setModal(null); setForm({}); loadCiclo()
  }

  const salvarTransac = async () => {
    if (!form.data||!form.categoria||!form.peso_medio||!form.preco_kg) {
      toast('Preencha data, categoria, peso e preço.','error'); return
    }
    setSaving(true)
    const n   = parseInt(form.quantidade)||1
    const vt  = parseFloat(form.peso_medio)*parseFloat(form.preco_kg)*n
    const ciclo = ciclos.find(c => {
      const d=new Date(form.data+'T12:00:00'),ini=new Date(c.inicio),fim=new Date(c.fim)
      return d>=ini && d<=fim
    })
    const { error } = await db.transacoes.insert({
      ciclo_id: ciclo?.id||cicloId, data:form.data,
      tipo:form.tipo||'V', categoria:form.categoria,
      quantidade:n, peso_medio:parseFloat(form.peso_medio),
      preco_kg:parseFloat(form.preco_kg), valor_total:vt,
      contraparte:form.contraparte||'', comissao:parseFloat(form.comissao)||0,
      imposto:parseFloat(form.imposto)||0
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Transação registrada!'); setModal(null); setForm({}); loadCiclo()
  }

  const vozLanc = (text) => {
    const t     = text.toLowerCase()
    const norm  = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()
    const tNorm = norm(t)

    // TIPO
    const tipo = /receita/i.test(t) ? 'R' : 'D'

    // DATA — aceita "18/07" (Speech API) ou "18 do 7" (forma por extenso)
    let dataISO = ''
    const dataMatch = t.match(/(\d+)\s*\/\s*(\d+)/) || t.match(/(\d+)\s+do\s+(\d+)/i)
    if (dataMatch) {
      const dia = dataMatch[1].padStart(2,'0')
      const mes = dataMatch[2].padStart(2,'0')
      const ano = String(new Date().getFullYear())
      dataISO = `${ano}-${mes}-${dia}`
    }

    // GRUPO — comparação normalizada
    const todosGrupos = [...GRUPOS_REC, ...GRUPOS_DES]
    const grupoEnc = todosGrupos.find(g => tNorm.includes(norm(g)))
      || todosGrupos.find(g => tNorm.includes(norm(g.split(' ')[0])))

    // VALOR — só captura quando acompanhado da palavra "reais"
    let valor = ''
    const valorMatch = t.match(/(\d+)\s*reais?(?:\s+e\s+(\d+)\s*centavos?)?/i)
    if (valorMatch) {
      const cents = valorMatch[2] ? String(valorMatch[2]).padStart(2,'0') : '00'
      valor = `${valorMatch[1]}.${cents}`
    }

    // DESCRIÇÃO — remove partes já identificadas
    let desc = t
      .replace(/despesa|receita/gi,'')
      .replace(/\d+\s+do\s+\d+/gi,'')
      .replace(/\d+\s*reais?(?:\s+e\s+\d+\s*centavos?)?/gi,'')
      .replace(norm(grupoEnc||''),'')
      .replace(/\b\d+\b/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,80)

    setForm(p => ({
      ...p,
      tipo,
      ...(dataISO  && { data: dataISO }),
      ...(grupoEnc && { grupo: grupoEnc }),
      ...(valor    && { valor }),
      ...(desc     && { descricao: desc })
    }))
  }

  // Gráfico fluxo
  const grpDesp = {}
  lancs.filter(l=>l.tipo==='D').forEach(l => { grpDesp[l.grupo]=(grpDesp[l.grupo]||0)+Number(l.valor) })
  const grpData = Object.entries(grpDesp).sort((a,b)=>b[1]-a[1]).slice(0,7)
    .map(([name,value])=>({ name:name.split(' ')[0], value }))

  // Resultados histórico
  const histData = ciclos.slice().reverse().map(c => ({
    ciclo: c.nome, rec:0, desp:0, res:0
  }))

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadBase} />

  return (
    <div>
      {/* Seletor de ciclo */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ fontSize:'.82rem', color:'#6B7280', fontWeight:500 }}>Ciclo:</span>
        <select value={cicloId} onChange={e=>setCicloId(e.target.value)}
          style={{ width:'auto', fontSize:'.85rem', padding:'5px 10px' }}>
          {ciclos.map(c => <option key={c.id} value={c.id}>{c.nome}{c.atual?' (atual)':''}</option>)}
        </select>
      </div>

      {cicloVencido && (
        <AlertBox type="amber" title={`Ciclo ${cicloVencido.nome} encerrado`}
          body={`O ciclo encerrou em ${fmtData(cicloVencido.fim)}. Acesse a aba Ciclos → Iniciar novo ciclo para criar o próximo.`}/>
      )}

      <div className="tabs-bar">
        {TABS.map((t,i)=>(
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Resumo ── */}
      {tab===0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refResumo} filename="financeiro-resumo" titulo="Financeiro: Resumo" />
          </div>
          <div ref={refResumo}>
          <div className="kpi-grid">
            {[
              { v:fmtMoeda(rec),  l:'Receitas',  s:lancs.filter(l=>l.tipo==='R').length+' lançamentos', c:'#1E55B0' },
              { v:fmtMoeda(desp), l:'Despesas',  s:lancs.filter(l=>l.tipo==='D').length+' lançamentos', c:'#791F1F' },
              { v:fmtMoeda(Math.abs(resu)), l:resu>=0?'Resultado positivo':'Resultado negativo', s:`Margem ${rec>0?Math.round(resu/rec*100):0}%`, c:resu>=0?'#2B6CD9':'#791F1F' },
              { v:transacs.filter(t=>t.tipo==='V').length, l:'Vendas de animais', s:'no ciclo', c:'#633806' },
            ].map(k=>(
              <div key={k.l} className="kpi-card" style={{ borderLeft:`3px solid ${k.c}` }}>
                <div className="kpi-value" style={{color:k.c}}>{k.v}</div>
                <div className="kpi-label">{k.l}</div>
                <div className="kpi-sub">{k.s}</div>
              </div>
            ))}
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title"><i className="ti ti-chart-donut"/> Despesas por grupo</div>
              {grpData.length===0
                ? <div style={{color:'#9CA3AF',fontSize:'.82rem',textAlign:'center',padding:'16px 0'}}>Sem despesas lançadas</div>
                : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={grpData} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                      <XAxis type="number" tick={{fontSize:9}} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="name" tick={{fontSize:10}} width={70}/>
                      <Tooltip formatter={v=>fmtMoeda(v)}/>
                      <Bar dataKey="value" name="Valor" fill="#2B6CD9" radius={[0,4,4,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                )
              }
            </div>
            <div>
              <div className="card" style={{marginBottom:10}}>
                <div className="card-title"><i className="ti ti-arrows-exchange"/> Vendas no ciclo</div>
                {transacs.filter(t=>t.tipo==='V').length===0
                  ? <div style={{color:'#9CA3AF',fontSize:'.82rem'}}>Nenhuma venda registrada.</div>
                  : transacs.filter(t=>t.tipo==='V').map(t=>(
                    <div key={t.id} className="row">
                      <span className="row-label">{fmtData(t.data)} · {t.quantidade}x {t.categoria}</span>
                      <span className="row-value" style={{color:'#1E55B0'}}>{fmtMoeda(t.valor_total)}</span>
                    </div>
                  ))
                }
              </div>
              <div className="card">
                <div className="card-title"><i className="ti ti-calendar"/> Ciclo {cicloAtual?.nome}</div>
                <div className="row"><span className="row-label">Início</span><span className="row-value">{fmtData(cicloAtual?.inicio)}</span></div>
                <div className="row"><span className="row-label">Encerramento</span><span className="row-value">{fmtData(cicloAtual?.fim)}</span></div>
                <div className="row"><span className="row-label">Status</span><span><Badge color={cicloAtual?.atual?'green':'gray'}>{cicloAtual?.atual?'Atual':'Encerrado'}</Badge></span></div>
              </div>
            </div>
          </div>
          </div>{/* end refResumo */}
        </div>
      )}

      {/* ── Lançamentos ── */}
      {tab===1 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div className="pill-group">
              <button className={`pill ${filtTp===''?'active':''}`} onClick={()=>setFiltTp('')}>Todos</button>
              <button className={`pill ${filtTp==='R'?'active':''}`} onClick={()=>setFiltTp('R')}>Receitas</button>
              <button className={`pill ${filtTp==='D'?'active':''}`} onClick={()=>setFiltTp('D')}>Despesas</button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarFinanceiro && (
                <button className="btn btn-primary btn-sm" onClick={()=>setModal('lanc')}>
                  <i className="ti ti-plus"/> Novo lançamento
                </button>
              )}
              <BotaoPDF contentRef={refLancs} filename="financeiro-lancamentos" titulo="Financeiro: Lançamentos" />
            </div>
          </div>
          <div ref={refLancs}>
          {lancs.filter(l=>!filtTp||l.tipo===filtTp).length===0
            ? <EmptyState icon="💰" title="Nenhum lançamento" sub="Registre receitas e despesas do ciclo."/>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Tipo</th><th>Grupo</th><th>Descrição</th><th style={{textAlign:'right'}}>Valor</th><th></th></tr></thead>
                  <tbody>
                    {lancs.filter(l=>!filtTp||l.tipo===filtTp).map(l=>(
                      <tr key={l.id}>
                        <td>{fmtData(l.data)}</td>
                        <td><Badge color={l.tipo==='R'?'green':'red'}>{l.tipo==='R'?'Rec':'Des'}</Badge></td>
                        <td style={{fontSize:'.78rem',color:'#6B7280'}}>{l.grupo}</td>
                        <td style={{color:'#6B7280'}}>{l.descricao}</td>
                        <td style={{textAlign:'right',fontWeight:500,color:l.tipo==='R'?'#1E55B0':'#791F1F'}}>
                          {l.tipo==='R'?'+':'-'}{fmtMoeda(l.valor)}
                        </td>
                        <td>
                          {podeEditarFinanceiro && (
                            <button className="btn-icon" onClick={() => excluirLanc(l.id)}>
                              <i className="ti ti-trash" style={{fontSize:13}}/>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="tr-total">
                      <td colSpan={4}>Resultado do ciclo</td>
                      <td style={{textAlign:'right',color:resu>=0?'#1E55B0':'#791F1F'}}>
                        {resu>=0?'+':''}{fmtMoeda(resu)}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          }
          </div>{/* end refLancs */}
        </div>
      )}

      {/* ── Compra & Venda ── */}
      {tab===2 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:'.85rem',color:'#6B7280'}}>{transacs.length} transações</span>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarFinanceiro && (
                <button className="btn btn-primary btn-sm" onClick={()=>setModal('transac')}>
                  <i className="ti ti-plus"/> Registrar transação
                </button>
              )}
              <BotaoPDF contentRef={refTransacs} filename="financeiro-transacoes" titulo="Financeiro: Compra & Venda" />
            </div>
          </div>
          <div ref={refTransacs}>
          {transacs.length===0
            ? <EmptyState icon="🐄" title="Nenhuma transação" sub="Registre compras e vendas de animais."/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Qt</th><th>Kg/un</th><th>R$/kg</th><th>Contraparte</th><th>Comissão</th><th>Imposto</th><th style={{textAlign:'right'}}>Total</th></tr>
                  </thead>
                  <tbody>
                    {transacs.map(t=>(
                      <tr key={t.id}>
                        <td>{fmtData(t.data)}</td>
                        <td><Badge color={t.tipo==='V'?'green':'blue'}>{t.tipo==='V'?'Venda':'Compra'}</Badge></td>
                        <td>{t.categoria}</td>
                        <td>{t.quantidade}</td>
                        <td>{t.peso_medio}</td>
                        <td>R$ {parseFloat(t.preco_kg).toFixed(2)}</td>
                        <td style={{fontSize:'.78rem',color:'#9CA3AF'}}>{t.contraparte||'—'}</td>
                        <td style={{color:'#9CA3AF'}}>{fmtMoeda(t.comissao)}</td>
                        <td style={{color:'#9CA3AF'}}>{fmtMoeda(t.imposto)}</td>
                        <td style={{textAlign:'right',fontWeight:500,color:t.tipo==='V'?'#1E55B0':'#791F1F'}}>{fmtMoeda(t.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
          </div>{/* end refTransacs */}
        </div>
      )}

      {/* ── Resultados ── */}
      {tab===3 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refResultados} filename="financeiro-resultados" titulo="Financeiro: Resultados" />
          </div>
          <div ref={refResultados}>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title"><i className="ti ti-chart-bar"/> Resultado por ciclo</div>
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead><tr><th>Ciclo</th><th style={{textAlign:'right'}}>Receitas</th><th style={{textAlign:'right'}}>Despesas</th><th style={{textAlign:'right'}}>Resultado</th><th style={{textAlign:'right'}}>Margem</th></tr></thead>
                <tbody>
                  {ciclos.map(c=>(
                    <tr key={c.id} style={{fontWeight:c.atual?600:''}}>
                      <td>{c.nome}{c.atual&&<Badge color="purple" style={{marginLeft:6}}>atual</Badge>}</td>
                      <td style={{textAlign:'right',color:'#1E55B0'}}>{c.id===cicloId?fmtMoeda(rec):'—'}</td>
                      <td style={{textAlign:'right',color:'#791F1F'}}>{c.id===cicloId?fmtMoeda(desp):'—'}</td>
                      <td style={{textAlign:'right',color:resu>=0?'#1E55B0':'#791F1F'}}>{c.id===cicloId?fmtMoeda(resu):'—'}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{c.id===cicloId&&rec>0?Math.round(resu/rec*100)+'%':'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <AlertBox type="purple" icon="ti-brain" title="Análise IA"
            body={`Ciclo ${cicloAtual?.nome}: receita de ${fmtMoeda(rec)}, despesa de ${fmtMoeda(desp)}. ${resu>=0?`Resultado positivo de ${fmtMoeda(resu)}.`:`Resultado negativo de ${fmtMoeda(Math.abs(resu))}.`} Margem bruta: ${rec>0?Math.round(resu/rec*100):0}%.`}
          />
          </div>{/* end refResultados */}
        </div>
      )}

      {/* ── Parâmetros ── */}
      {tab===4 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refParams} filename="financeiro-parametros" titulo="Financeiro: Parâmetros" />
          </div>
          <div ref={refParams}>
          <div className="card">
          <div className="card-title"><i className="ti ti-adjustments"/> Parâmetros de preço por categoria</div>
          <p style={{marginBottom:12,fontSize:'.82rem'}}>Configure peso médio e preço por kg para cálculo do patrimônio em estoque.</p>
          <div className="table-wrap" style={{border:'none'}}>
            <table>
              <thead><tr><th>Categoria</th><th>Peso médio (kg)</th><th>Preço/kg (R$)</th><th style={{textAlign:'right'}}>Total estimado</th><th></th></tr></thead>
              <tbody>
                {catPrecos.map(cp=>(
                  <tr key={cp.id}>
                    <td style={{fontWeight:500}}>{cp.categoria}</td>
                    <td>
                      <input type="number" defaultValue={cp.peso_medio} style={{width:80}}
                        readOnly={!podeEditarFinanceiro}
                        onBlur={async e => {
                          await db.categoriasPreco.update(cp.id,{peso_medio:parseFloat(e.target.value)||0})
                          toast('Atualizado!')
                        }}/>
                    </td>
                    <td>
                      <input type="number" step="0.01" defaultValue={cp.preco_kg} style={{width:80}}
                        readOnly={!podeEditarFinanceiro}
                        onBlur={async e => {
                          await db.categoriasPreco.update(cp.id,{preco_kg:parseFloat(e.target.value)||0})
                          toast('Atualizado!')
                        }}/>
                    </td>
                    <td style={{textAlign:'right',fontWeight:500,color:'#1E55B0'}}>
                      {cp.peso_medio>0&&cp.preco_kg>0?fmtMoeda(cp.peso_medio*cp.preco_kg):'—'}
                    </td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
          </div>{/* end refParams */}
        </div>
      )}

      {/* ── Ciclos ── */}
      {tab===5 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <span style={{fontSize:'.85rem',color:'#6B7280'}}>{ciclos.length} ciclo(s) registrado(s)</span>
            {podeEditarFinanceiro && (
              <button className="btn btn-primary btn-sm" onClick={abrirModalNovoCiclo}>
                <i className="ti ti-plus"/> Iniciar novo ciclo
              </button>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Início</th><th>Encerramento</th><th>Status</th></tr>
              </thead>
              <tbody>
                {ciclos.map(c => (
                  <tr key={c.id} style={{fontWeight:c.atual?600:''}}>
                    <td style={{fontWeight:600}}>{c.nome}</td>
                    <td>{fmtData(c.inicio)}</td>
                    <td>{fmtData(c.fim)}</td>
                    <td>
                      <Badge color={c.atual?'green':'gray'}>{c.atual?'Atual':'Encerrado'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14}}>
            <AlertBox type="purple" icon="ti-info-circle"
              title="Sobre os ciclos financeiros"
              body="Cada ciclo corresponde a um ano pecuário (jul–jun). Ao iniciar um novo ciclo, o anterior é encerrado automaticamente. Os lançamentos de cada ciclo ficam preservados e podem ser consultados no seletor de ciclo no topo da página."/>
          </div>
        </div>
      )}

      {/* ── Modal novo ciclo ── */}
      <Modal open={modalCiclo} onClose={()=>setModalCiclo(false)} title="Iniciar novo ciclo financeiro" width={440}>
        <div style={{background:'#FFFBEB',border:'.5px solid #FCD34D',borderRadius:8,padding:'10px 12px',marginBottom:14,fontSize:'.8rem',color:'#92400E'}}>
          <i className="ti ti-alert-triangle" style={{marginRight:6}}/>
          O ciclo atual será encerrado. Esta ação não pode ser desfeita.
        </div>
        <div className="grid-form">
          <Field label="Nome do novo ciclo" required>
            <input value={formCiclo.nome||''} onChange={e=>setFormCiclo(p=>({...p,nome:e.target.value}))} placeholder="ex: 2026/27"/>
          </Field>
          <Field label="Data de início" required>
            <input type="date" value={formCiclo.inicio||''} onChange={e=>setFormCiclo(p=>({...p,inicio:e.target.value}))}/>
          </Field>
          <Field label="Data de encerramento" required>
            <input type="date" value={formCiclo.fim||''} onChange={e=>setFormCiclo(p=>({...p,fim:e.target.value}))}/>
          </Field>
        </div>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="btn btn-primary" onClick={criarNovoCiclo} disabled={savingCiclo}>
            {savingCiclo?'Criando...':<><i className="ti ti-check"/>Confirmar</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModalCiclo(false)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal lançamento ── */}
      <Modal open={modal==='lanc'} onClose={()=>setModal(null)} title="Novo lançamento" width={520}>
        <div style={{background:'#EEEDFE',borderRadius:8,padding:'10px 12px',marginBottom:14}}>
          <div style={{fontSize:'.78rem',color:'#3C3489',marginBottom:6,lineHeight:1.6}}>
            📢 Fale nesta ordem: <b>[dia] do [mês] [despesa/receita] [grupo] [valor em reais] [descrição]</b><br/>
            <span style={{color:'#5B52A3'}}>Exemplo: <i>"dezoito do sete despesa remédios trinta reais vacina aftosa"</i></span>
          </div>
          <div style={{fontSize:'.75rem',color:'#B91C1C',fontWeight:600,marginBottom:8}}>
            ⚠️ Fale tudo de uma vez, sem pausas!
          </div>
          <MicButton hint='ex: "dezoito do sete despesa remédios trinta reais vacina aftosa"' onResult={vozLanc}/>
        </div>
        <div className="grid-form">
          <Field label="Tipo"><select value={form.tipo||'D'} onChange={e=>setForm(p=>({...p,tipo:e.target.value,grupo:''}))}><option value="D">Despesa</option><option value="R">Receita</option></select></Field>
          <Field label="Data" required><input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/></Field>
          <Field label="Grupo" required>
            <select value={form.grupo||''} onChange={e=>setForm(p=>({...p,grupo:e.target.value}))}>
              <option value="">— selecione —</option>
              {(form.tipo==='R'?GRUPOS_REC:GRUPOS_DES).map(g=><option key={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Valor (R$)" required><input type="number" step="0.01" value={form.valor||''} onChange={e=>setForm(p=>({...p,valor:e.target.value}))} placeholder="0,00"/></Field>
        </div>
        <Field label="Descrição" required><input value={form.descricao||''} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))} placeholder="Descreva o lançamento..."/></Field>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="btn btn-primary" onClick={salvarLanc} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal transação ── */}
      <Modal open={modal==='transac'} onClose={()=>setModal(null)} title="Registrar transação" width={540}>
        <div className="grid-form">
          <Field label="Tipo"><select value={form.tipo||'V'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}><option value="V">Venda</option><option value="C">Compra</option></select></Field>
          <Field label="Data" required><input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/></Field>
          <Field label="Categoria" required>
            <select value={form.categoria||''} onChange={e=>setForm(p=>({...p,categoria:e.target.value}))}>
              <option value="">— selecione —</option>
              {['Terneiro','Terneira','Novilho','Novilha','Vaca Gorda','Vaca Magra','Vaca Prenha','Boi Gordo','Boi Magro'].map(c=><option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Quantidade"><input type="number" value={form.quantidade||1} onChange={e=>setForm(p=>({...p,quantidade:e.target.value}))} min={1}/></Field>
          <Field label="Peso médio (kg)" required><input type="number" step="0.1" value={form.peso_medio||''} onChange={e=>setForm(p=>({...p,peso_medio:e.target.value}))} placeholder="0"/></Field>
          <Field label="Preço/kg (R$)" required><input type="number" step="0.01" value={form.preco_kg||''} onChange={e=>setForm(p=>({...p,preco_kg:e.target.value}))} placeholder="0,00"/></Field>
          <Field label="Contraparte"><input value={form.contraparte||''} onChange={e=>setForm(p=>({...p,contraparte:e.target.value}))} placeholder="Comprador/Vendedor"/></Field>
          <Field label="Comissão (R$)"><input type="number" step="0.01" value={form.comissao||0} onChange={e=>setForm(p=>({...p,comissao:e.target.value}))}/></Field>
          <Field label="Funrural / Imposto (R$)"><input type="number" step="0.01" value={form.imposto||0} onChange={e=>setForm(p=>({...p,imposto:e.target.value}))}/></Field>
        </div>
        {form.peso_medio&&form.preco_kg&&(
          <div style={{background:'#E8F0FC',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:'.85rem',color:'#1E55B0',fontWeight:500}}>
            Valor total estimado: {fmtMoeda(parseFloat(form.peso_medio)*parseFloat(form.preco_kg)*(parseInt(form.quantidade)||1))}
          </div>
        )}
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-primary" onClick={salvarTransac} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Registrar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
