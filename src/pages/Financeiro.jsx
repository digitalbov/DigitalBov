import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { db } from '../lib/supabase'
import { fmtMoeda, fmtData, GRUPOS_REC, GRUPOS_DES, valorPropLanc } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo, STATUS_CICLO_LABEL } from '../lib/CicloContext'

const TABS = ['Resumo','Lançamentos','Compra & Venda','Resultados','Parâmetros','Ciclos']

export default function Financeiro() {
  const location = useLocation()
  const refResumo    = useRef(null)
  const refLancs     = useRef(null)
  const refTransacs  = useRef(null)
  const refResultados= useRef(null)
  const refParams    = useRef(null)

  const [tab,      setTab]     = useState(location.state?.tab ?? 0)
  const [lancs,    setLancs]   = useState([])
  const [transacs, setTransacs]= useState([])
  const [catPrecos,setCatPrecos]= useState([])
  const [props,    setProps]   = useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [modal,    setModal]   = useState(null)
  const [form,     setForm]    = useState({})
  const [filtTp,      setFiltTp]      = useState('')
  const [filtProp,    setFiltProp]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [modalCiclo,  setModalCiclo]  = useState(false)
  const [formCiclo,   setFormCiclo]   = useState({})
  const [savingCiclo, setSavingCiclo] = useState(false)
  const [lancsPorCiclo,     setLancsPorCiclo]     = useState({})
  const [loadingResultados, setLoadingResultados] = useState(false)

  const { podeEditar } = usePermissoes()
  const podeEditarFinanceiro = podeEditar('financeiro')
  const { contaAtual } = useConta()
  const { fazendaAtual } = useFazenda()
  const { ciclos, cicloAtual, cicloSelecionado, carregarCiclos, cicloDaData, dataEhEditavel } = useCiclo()

  // Seletor de ciclo LOCAL desta tela — inicia (e reseta, a cada montagem da
  // tela) no ciclo GLOBAL selecionado no menu lateral, não no ciclo atual.
  const [cicloLocal, setCicloLocal] = useState(null)
  useEffect(() => { if (cicloSelecionado && !cicloLocal) setCicloLocal(cicloSelecionado) }, [cicloSelecionado]) // eslint-disable-line
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarFinCiclo = podeEditarFinanceiro && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (cicloLocal) loadCiclo() }, [cicloLocal?.id])
  useEffect(() => { if (tab === 3 && ciclos.length > 0) loadResultadosPorCiclo() }, [tab, ciclos.length]) // eslint-disable-line

  // Busca os lançamentos de TODOS os ciclos (usado só na aba Resultados, para
  // comparar receita/despesa/resultado de cada ciclo lado a lado)
  const loadResultadosPorCiclo = async () => {
    setLoadingResultados(true)
    const pares = await Promise.all(ciclos.map(async c => {
      const { data } = await db.lancamentos.list(c.id)
      return [c.id, data || []]
    }))
    setLancsPorCiclo(Object.fromEntries(pares))
    setLoadingResultados(false)
  }

  const loadBase = async () => {
    setLoadError(false)
    try {
      const [rcp, rp] = await Promise.all([db.categoriasPreco.list(), db.proprietarios.list()])
      setCatPrecos(rcp.data || [])
      setProps(rp.data || [])
    } catch (e) {
      console.error('[Financeiro] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const abrirModalNovoCiclo = () => {
    const anoBase = cicloAtual
      ? parseInt(cicloAtual.nome.split('/')[1]) + 2000
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
    await carregarCiclos()
  }

  const abrirModalLanc = () => {
    setForm({ rateios: props.map(p => ({ proprietario_id: p.id, percentual: '', valor: '' })) })
    setModal('lanc')
  }

  const setRateioPercentual = (propId, perc) => {
    const valorTotal = parseFloat(form.valor || 0)
    const novoValor = perc === '' ? '' : (parseFloat(perc) / 100) * valorTotal
    setForm(p => ({
      ...p,
      rateios: p.rateios.map(r => r.proprietario_id === propId
        ? { ...r, percentual: perc, valor: novoValor === '' ? '' : novoValor.toFixed(2) }
        : r)
    }))
  }

  const setRateioValor = (propId, val) => {
    const valorTotal = parseFloat(form.valor || 1) || 1
    const novoPerc = val === '' ? '' : (parseFloat(val) / valorTotal) * 100
    setForm(p => ({
      ...p,
      rateios: p.rateios.map(r => r.proprietario_id === propId
        ? { ...r, valor: val, percentual: novoPerc === '' ? '' : novoPerc.toFixed(2) }
        : r)
    }))
  }

  const dividirIgualmente = () => {
    const valorTotal = parseFloat(form.valor || 0)
    const n = props.length
    if (!valorTotal || n === 0) { toast('Preencha o valor do lançamento antes.', 'error'); return }
    const percIgual = (100 / n)
    const valorIgual = valorTotal / n
    setForm(p => ({
      ...p,
      rateios: props.map(pr => ({ proprietario_id: pr.id, percentual: percIgual.toFixed(2), valor: valorIgual.toFixed(2) }))
    }))
  }

  const totalRateioPerc  = (form.rateios || []).reduce((s, r) => s + (parseFloat(r.percentual) || 0), 0)
  const totalRateioValor = (form.rateios || []).reduce((s, r) => s + (parseFloat(r.valor) || 0), 0)

  const excluirLanc = async (id) => {
    if (!podeEditarFinCiclo) return
    const { error } = await db.lancamentos.delete(id)
    if (error) { toast('Erro ao excluir.', 'error'); return }
    toast('Removido.')
    loadCiclo()
  }

  const loadCiclo = async () => {
    if (!cicloLocal) return
    const [rl, rt] = await Promise.all([db.lancamentos.list(cicloLocal.id), db.transacoes.list(cicloLocal.id)])
    setLancs(rl.data  || [])
    setTransacs(rt.data || [])
  }

  const rec  = valorPropLanc(lancs, 'R', filtProp)
  const desp = valorPropLanc(lancs, 'D', filtProp)
  const resu = rec - desp

  const lancsFiltrados = lancs
    .filter(l => !filtTp || l.tipo === filtTp)
    .filter(l => !filtProp || l.rateios?.some(r => r.proprietario_id === filtProp))

  const totalLancs = lancsFiltrados.reduce((s, l) => {
    const v = filtProp
      ? (l.rateios?.find(r => r.proprietario_id === filtProp)?.valor ?? 0)
      : Number(l.valor)
    return s + (l.tipo === 'R' ? v : -v)
  }, 0)

  const salvarLanc = async () => {
    if (!podeEditarFinCiclo) return
    if (!form.data||!form.grupo||!form.valor||!form.descricao) {
      toast('Preencha todos os campos.','error'); return
    }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const ciclo = cicloDaData(form.data)
    const { data: lancData, error } = await db.lancamentos.insert({
      ciclo_id: ciclo.id, data:form.data,
      tipo:form.tipo||'D', grupo:form.grupo,
      descricao:form.descricao, valor:parseFloat(form.valor)
    })
    if (error) { setSaving(false); toast('Erro: '+error.message,'error'); return }

    const rateiosPreenchidos = (form.rateios || []).filter(r => parseFloat(r.valor) > 0)
    if (rateiosPreenchidos.length > 0 && lancData?.id) {
      const payload = rateiosPreenchidos.map(r => ({
        conta_id: contaAtual.id,
        fazenda_id: fazendaAtual.id,
        lancamento_id: lancData.id,
        proprietario_id: r.proprietario_id,
        valor: parseFloat(r.valor) || 0,
        percentual: parseFloat(r.percentual) || 0,
      }))
      const { error: errRateio } = await db.lancamentoRateios.inserirVarios(payload)
      if (errRateio) toast('Lançamento salvo, mas houve erro ao salvar o rateio: ' + errRateio.message, 'error')
    }

    setSaving(false)
    toast('Lançamento salvo!'); setModal(null); setForm({}); loadCiclo()
  }

  const salvarTransac = async () => {
    if (!podeEditarFinCiclo) return
    if (!form.data||!form.categoria||!form.peso_medio||!form.preco_kg) {
      toast('Preencha data, categoria, peso e preço.','error'); return
    }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const n   = parseInt(form.quantidade)||1
    const vt  = parseFloat(form.peso_medio)*parseFloat(form.preco_kg)*n
    const ciclo = cicloDaData(form.data)
    const { error } = await db.transacoes.insert({
      ciclo_id: ciclo.id, data:form.data,
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

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadBase} />

  const PDF_CONFIG = [
    { ref: refResumo,     filename:'financeiro-resumo',      titulo:'Financeiro: Resumo' },
    { ref: refLancs,      filename:'financeiro-lancamentos', titulo:'Financeiro: Lançamentos' },
    { ref: refTransacs,   filename:'financeiro-transacoes',  titulo:'Financeiro: Compra & Venda' },
    { ref: refResultados, filename:'financeiro-resultados',  titulo:'Financeiro: Resultados' },
    { ref: refParams,     filename:'financeiro-parametros',  titulo:'Financeiro: Parâmetros' },
  ]
  const pdfAtual = PDF_CONFIG[tab]

  return (
    <div>
      {/* Seletor de ciclo LOCAL desta tela (independente do global) + PDF */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
        {pdfAtual && (
          <BotaoPDF contentRef={pdfAtual.ref} filename={pdfAtual.filename} titulo={pdfAtual.titulo} />
        )}
      </div>

      <BannerCicloEncerrado ciclo={cicloLocal} />

      <div className="tabs-bar">
        {TABS.map((t,i)=>(
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Resumo ── */}
      {tab===0 && (
        <div>
          <div className="pill-group" style={{ marginBottom:8 }}>
            <button className={`pill ${filtProp===''?'active':''}`} onClick={() => setFiltProp('')}>Todos os proprietários</button>
            {props.map(p => (
              <button key={p.id} className={`pill ${filtProp===p.id?'active':''}`} onClick={() => setFiltProp(p.id)}>
                {p.nome.split(' ')[0]}
              </button>
            ))}
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
                <div className="card-title"><i className="ti ti-calendar"/> Ciclo {cicloLocal?.nome}</div>
                <div className="row"><span className="row-label">Início</span><span className="row-value">{fmtData(cicloLocal?.inicio)}</span></div>
                <div className="row"><span className="row-label">Encerramento</span><span className="row-value">{fmtData(cicloLocal?.fim)}</span></div>
                <div className="row"><span className="row-label">Status</span><span><Badge color={statusCicloLocal==='atual'?'green':statusCicloLocal==='carencia'?'amber':'gray'}>{STATUS_CICLO_LABEL[statusCicloLocal]||'—'}</Badge></span></div>
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
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              <div className="pill-group">
                <button className={`pill ${filtTp===''?'active':''}`} onClick={()=>setFiltTp('')}>Todos</button>
                <button className={`pill ${filtTp==='R'?'active':''}`} onClick={()=>setFiltTp('R')}>Receitas</button>
                <button className={`pill ${filtTp==='D'?'active':''}`} onClick={()=>setFiltTp('D')}>Despesas</button>
              </div>
              <div className="pill-group">
                <button className={`pill ${filtProp===''?'active':''}`} onClick={() => setFiltProp('')}>Todos os proprietários</button>
                {props.map(p => (
                  <button key={p.id} className={`pill ${filtProp===p.id?'active':''}`} onClick={() => setFiltProp(p.id)}>
                    {p.nome.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            {podeEditarFinCiclo && (
              <button className="btn btn-primary btn-sm" onClick={abrirModalLanc}>
                <i className="ti ti-plus"/> Novo lançamento
              </button>
            )}
          </div>
          <div ref={refLancs}>
          {lancsFiltrados.length===0
            ? <EmptyState icon="💰" title="Nenhum lançamento" sub="Registre receitas e despesas do ciclo."/>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Tipo</th><th>Grupo</th><th>Descrição</th><th style={{textAlign:'right'}}>Valor</th><th style={{textAlign:'center'}}>Rateio</th><th></th></tr></thead>
                  <tbody>
                    {lancsFiltrados.map(l=>{
                      const temRateio = (l.rateios || []).length > 0
                      const tituloRateio = temRateio
                        ? l.rateios.map(r => `${r.proprietario?.nome || '—'}: ${fmtMoeda(r.valor)}`).join(' · ')
                        : 'Sem rateio definido'
                      return (
                      <tr key={l.id}>
                        <td>{fmtData(l.data)}</td>
                        <td><Badge color={l.tipo==='R'?'green':'red'}>{l.tipo==='R'?'Rec':'Des'}</Badge></td>
                        <td style={{fontSize:'.78rem',color:'#6B7280'}}>{l.grupo}</td>
                        <td style={{color:'#6B7280'}}>{l.descricao}</td>
                        <td style={{textAlign:'right',fontWeight:500,color:l.tipo==='R'?'#1E55B0':'#791F1F'}}>
                          {(() => {
                            const valorExibir = filtProp
                              ? (l.rateios?.find(r => r.proprietario_id === filtProp)?.valor ?? l.valor)
                              : l.valor
                            return <>{l.tipo==='R'?'+':'-'}{fmtMoeda(valorExibir)}</>
                          })()}
                        </td>
                        <td style={{textAlign:'center'}} title={tituloRateio}>
                          <i className="ti ti-users" style={{ color: temRateio ? '#2B6CD9' : '#D1D5DB' }} />
                        </td>
                        <td>
                          {podeEditarFinCiclo && (
                            <button className="btn-icon" onClick={() => excluirLanc(l.id)}>
                              <i className="ti ti-trash" style={{fontSize:13}}/>
                            </button>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                    <tr className="tr-total">
                      <td colSpan={4}>Resultado do ciclo</td>
                      <td style={{textAlign:'right',color:totalLancs>=0?'#1E55B0':'#791F1F'}}>
                        {totalLancs>=0?'+':''}{fmtMoeda(totalLancs)}
                      </td>
                      <td></td>
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
            {podeEditarFinCiclo && (
              <button className="btn btn-primary btn-sm" onClick={()=>setModal('transac')}>
                <i className="ti ti-plus"/> Registrar transação
              </button>
            )}
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
          <div className="pill-group" style={{ marginBottom:8 }}>
            <button className={`pill ${filtProp===''?'active':''}`} onClick={() => setFiltProp('')}>Todos os proprietários</button>
            {props.map(p => (
              <button key={p.id} className={`pill ${filtProp===p.id?'active':''}`} onClick={() => setFiltProp(p.id)}>
                {p.nome.split(' ')[0]}
              </button>
            ))}
          </div>
          <div ref={refResultados}>
          <div className="card" style={{marginBottom:12}}>
            <div className="card-title"><i className="ti ti-chart-bar"/> Resultado por ciclo</div>
            {loadingResultados ? <Loading /> : (
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead><tr><th>Ciclo</th><th style={{textAlign:'right'}}>Receitas</th><th style={{textAlign:'right'}}>Despesas</th><th style={{textAlign:'right'}}>Resultado</th><th style={{textAlign:'right'}}>Margem</th></tr></thead>
                <tbody>
                  {ciclos.map(c=>{
                    const ehAtual = c.id === cicloAtual?.id
                    const lancsCiclo = lancsPorCiclo[c.id]
                    const recC  = lancsCiclo ? valorPropLanc(lancsCiclo, 'R', filtProp) : null
                    const despC = lancsCiclo ? valorPropLanc(lancsCiclo, 'D', filtProp) : null
                    const resuC = recC !== null && despC !== null ? recC - despC : null
                    return (
                    <tr key={c.id} style={{fontWeight:ehAtual?600:''}}>
                      <td>{c.nome}{ehAtual&&<Badge color="purple" style={{marginLeft:6}}>atual</Badge>}</td>
                      <td style={{textAlign:'right',color:'#1E55B0'}}>{recC !== null ? fmtMoeda(recC) : '—'}</td>
                      <td style={{textAlign:'right',color:'#791F1F'}}>{despC !== null ? fmtMoeda(despC) : '—'}</td>
                      <td style={{textAlign:'right',color:resuC>=0?'#1E55B0':'#791F1F'}}>{resuC !== null ? fmtMoeda(resuC) : '—'}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{recC>0?Math.round(resuC/recC*100)+'%':'—'}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
          <AlertBox type="purple" icon="ti-brain" title="Análise IA"
            body={`Ciclo ${cicloLocal?.nome}: receita de ${fmtMoeda(rec)}, despesa de ${fmtMoeda(desp)}. ${resu>=0?`Resultado positivo de ${fmtMoeda(resu)}.`:`Resultado negativo de ${fmtMoeda(Math.abs(resu))}.`} Margem bruta: ${rec>0?Math.round(resu/rec*100):0}%.`}
          />
          </div>{/* end refResultados */}
        </div>
      )}

      {/* ── Parâmetros ── */}
      {tab===4 && (
        <div>
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
                          const novoValor = parseFloat(e.target.value) || 0
                          await db.categoriasPreco.update(cp.id, { peso_medio: novoValor })
                          setCatPrecos(prev => prev.map(x => x.id === cp.id ? { ...x, peso_medio: novoValor } : x))
                          toast('Atualizado!')
                        }}/>
                    </td>
                    <td>
                      <input type="number" step="0.01" defaultValue={cp.preco_kg} style={{width:80}}
                        readOnly={!podeEditarFinanceiro}
                        onBlur={async e => {
                          const novoValor = parseFloat(e.target.value) || 0
                          await db.categoriasPreco.update(cp.id, { preco_kg: novoValor })
                          setCatPrecos(prev => prev.map(x => x.id === cp.id ? { ...x, preco_kg: novoValor } : x))
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
            {podeEditarFinCiclo && (
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
                {ciclos.map(c => {
                  const st = statusCiclo(c)
                  return (
                  <tr key={c.id} style={{fontWeight:st==='atual'?600:''}}>
                    <td style={{fontWeight:600}}>{c.nome}</td>
                    <td>{fmtData(c.inicio)}</td>
                    <td>{fmtData(c.fim)}</td>
                    <td>
                      <Badge color={st==='atual'?'green':st==='carencia'?'amber':'gray'}>{STATUS_CICLO_LABEL[st]}</Badge>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{marginTop:14}}>
            <AlertBox type="purple" icon="ti-info-circle"
              title="Sobre os ciclos financeiros"
              body="Cada ciclo corresponde a um ano pecuário (jul–jun). Ao iniciar um novo ciclo, o anterior é encerrado automaticamente. Os lançamentos de cada ciclo ficam preservados e podem ser consultados trocando o ciclo no menu lateral."/>
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

        {props.length > 0 && (
          <div style={{ marginTop:16, paddingTop:14, borderTop:'.5px solid #E5E7EB' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:'.85rem', fontWeight:600, color:'#374151' }}>Rateio por proprietário (opcional)</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={dividirIgualmente}>
                Dividir igualmente
              </button>
            </div>
            <p style={{ fontSize:'.75rem', color:'#9CA3AF', marginBottom:10 }}>
              Deixe em branco se não quiser definir rateio agora.
            </p>
            {(form.rateios || []).map(r => {
              const prop = props.find(p => p.id === r.proprietario_id)
              return (
                <div key={r.proprietario_id} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ flex:1, fontSize:'.83rem', color:'#374151' }}>{prop?.nome || '—'}</span>
                  <input type="number" step="0.01" placeholder="%" value={r.percentual}
                    onChange={e => setRateioPercentual(r.proprietario_id, e.target.value)}
                    style={{ width:70, textAlign:'right' }} />
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>%</span>
                  <input type="number" step="0.01" placeholder="0,00" value={r.valor}
                    onChange={e => setRateioValor(r.proprietario_id, e.target.value)}
                    style={{ width:90, textAlign:'right' }} />
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>R$</span>
                </div>
              )
            })}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:16, fontSize:'.78rem', color:'#6B7280', marginTop:6 }}>
              <span>Total: <strong style={{ color:'#374151' }}>{totalRateioPerc.toFixed(2)}%</strong></span>
              <span>{fmtMoeda(totalRateioValor)}</span>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="btn btn-primary" onClick={salvarLanc} disabled={saving || !podeEditarFinCiclo}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
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
          <button className="btn btn-primary" onClick={salvarTransac} disabled={saving || !podeEditarFinCiclo}>{saving?'Salvando...':<><i className="ti ti-check"/>Registrar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
