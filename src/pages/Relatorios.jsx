import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, calcTaxaPrenhez, contarExpostas, contarPrenhas, fmtData, fmtMoeda, pct, ehMatriz, algumErro, somaFinita, valorPropLanc, CATEGORIAS_VALOR } from '../lib/helpers'
import { Loading, Badge, AlertBox, toast, SeletorCicloLocal, ErroCarregamento } from '../components/UI'
import { useFazenda } from '../lib/FazendaContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { hoje as hojeAgora } from '../lib/hoje'

const TABS = ['Resumo Geral','Reprodução','Financeiro']
const NOMES_PDF = ['relatorio-geral','relatorio-reprodutivo','relatorio-financeiro']
const TITULOS_PDF = ['Relatório Geral', 'Painel Reprodutivo', 'Gestão Financeira']

export default function Relatorios() {
  const [tab,       setTab]      = useState(0)
  const [animais,   setAnimais]  = useState([])
  const [lancs,     setLancs]    = useState([])
  const [lotes,     setLotes]    = useState([])
  const [partos,    setPartos]   = useState([])
  const [sanidade,  setSanidade] = useState([])
  const [props,     setProps]    = useState([])
  const [catPrecos, setCatPrecos]= useState([])
  const [piquetes,  setPiquetes] = useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [generating,setGenerating]=useState(false)
  const [filtroProp, setFiltroProp] = useState('')
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
        db.categoriasPreco.list(),
        db.piquetes.list()
      ])
      if (algumErro('[Relatorios]', base)) { setLoadError(true); return }
      const [ra, rs, rp, rcp, rpq] = base
      setAnimais(ra.data || [])
      setSanidade(rs.data  || [])
      setProps(rp.data     || [])
      setCatPrecos(rcp.data|| [])
      setPiquetes(rpq.data || [])
      if (cicloLocal) {
        const doCiclo = await Promise.all([
          db.lancamentos.list(cicloLocal.id),
          db.lotesInseminacao.listInseminacoesResumo(cicloLocal.id),
          db.partos.list(cicloLocal.id)
        ])
        if (algumErro('[Relatorios]', doCiclo)) { setLoadError(true); return }
        const [rl, rli, rpt] = doCiclo
        setLancs(rl.data       || [])
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
      await gerarPDFComMolduras(ref.current, filename, titulo, fazendaAtual?.nome || '', fazendaAtual?.foto_url || '')
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

  // Cálculos — filtroProp (pills) recalcula todos os indicadores abaixo para o
  // proprietário selecionado, mesmo padrão de Rebanho/Reprodutivo/Metas.
  const ativos   = animais.filter(a => a.situacao === 'ativo' && (!filtroProp || a.proprietario_id === filtroProp))
  const inativos = animais.filter(a => a.situacao !== 'ativo' && (!filtroProp || a.proprietario_id === filtroProp))
  const matrizes = ativos.filter(a => ehMatriz(a))
  const partosFiltrados = partos.filter(p => !filtroProp || p.mae?.proprietario_id === filtroProp)
  // lancamentos_financeiros é a fonte única de dinheiro — transacoes_animais é
  // registro operacional e não entra mais nesta soma (ver Bloco D/D2).
  const rec      = filtroProp ? valorPropLanc(lancs, 'R', filtroProp) : somaFinita(lancs.filter(l=>l.tipo==='R'), 'valor')
  const desp     = filtroProp ? valorPropLanc(lancs, 'D', filtroProp) : somaFinita(lancs.filter(l=>l.tipo==='D'), 'valor')
  const resu     = rec - desp
  // Grupos "por valor" (receita/despesa) DERIVADOS dos lançamentos reais, não
  // de lista fixa — uma lista fixa deixa de fora qualquer grupo criado depois
  // (ex: 'Comissão'/'Impostos'/'Frete'/'Monta Natural', criados automático
  // pelas RPCs de compra/venda e custo de monta natural) ou digitado à mão
  // pelo usuário (grupo é texto livre em Financeiro), e a soma dos grupos
  // exibidos fica menor que o total sem nenhuma explicação. Mesmo critério de
  // valor por lançamento que valorPropLanc (helpers.js) usa pra `rec`/`desp`
  // acima — sem grupo (nulo/vazio) cai em "Sem grupo" em vez de sumir, e a
  // soma dos grupos retornados bate exatamente com rec/desp por construção
  // (mesmo filtro, mesma extração de valor, só agrupada).
  const gruposPorValor = (tipo) => {
    const porGrupo = {}
    lancs.filter(l=>l.tipo===tipo).forEach(l => {
      const grupo = l.grupo || 'Sem grupo'
      let v = filtroProp
        ? Number(l.rateios?.find(r=>r.proprietario_id===filtroProp)?.valor)
        : Number(l.valor)
      if (!Number.isFinite(v)) v = 0
      porGrupo[grupo] = (porGrupo[grupo] || 0) + v
    })
    return Object.entries(porGrupo)
      .map(([grupo, valor]) => ({ grupo, valor }))
      .filter(g => g.valor > 0)
      .sort((a,b) => b.valor - a.valor)
  }

  // Taxa de prenhez — fórmula oficial única (helpers.calcTaxaPrenhez), a mesma
  // usada em Reprodutivo/Rebanho/Metas: matrizes DISTINTAS prenhas / expostas no
  // ciclo, deduplicadas por animal_id (contarExpostas/contarPrenhas) — nunca
  // conta a mesma vaca 2x quando ela entra na IATF e no repasse. listInseminacoesResumo
  // já traz animal_id e animal.proprietario_id, necessários para a dedupe e o filtro.
  const insemRel  = lotes.flatMap(l => l.inseminacoes || []).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
  const kpiIns    = contarExpostas(insemRel)
  const kpiPrn    = contarPrenhas(insemRel)
  const txPrenhez = calcTaxaPrenhez(insemRel)
  const hoje2    = hojeAgora()
  const vencSan  = sanidade.filter(d=>d.proximo&&new Date(d.proximo+'T12:00:00')<hoje2).length

  const catMap = {}
  ativos.forEach(a => {
    const c = calcCategoria(a.data_nascimento, a.sexo)
    catMap[c] = (catMap[c]||0)+1
  })

  // Área útil = soma dos piquetes cadastrados (mesma fonte que Propriedade.jsx
  // usa para calcular fazendas.area_util — aqui somamos ao vivo em vez de ler o
  // campo salvo, que pode estar desatualizado se piquetes mudaram depois do
  // último save da fazenda).
  const areaUtilHa = piquetes.reduce((s,p) => s + (parseFloat(p.area_ha)||0), 0)
  const areaUtilTxt = areaUtilHa > 0 ? `${areaUtilHa.toFixed(1).replace('.',',')} ha` : '—'

  // Colunas por proprietário: só o selecionado quando o filtro está ativo —
  // mesmo padrão de Rebanho.jsx (propsSelecionadas). Antes a tabela sempre
  // renderizava uma coluna por proprietário, mesmo filtrando, o que parecia
  // "filtro não aplicado" (os totais já batiam, mas as colunas confundiam).
  const propsSelecionadas = filtroProp ? props.filter(p => p.id === filtroProp) : props

  const valorRowsRel = CATEGORIAS_VALOR.map(cat => {
    const animaisCat = ativos.filter(a =>
      calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === cat
    )
    const porProp = propsSelecionadas.map(p => ({
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
      {/* Logo da fazenda aparece só no PDF gerado (src/lib/pdf.js), nunca aqui na
          tela — a tela sempre mostra a marca padrão do DigitalBov. */}
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

      <div className="pill-group" style={{ marginBottom:14 }}>
        <button className={`pill ${!filtroProp ? 'active' : ''}`} onClick={() => setFiltroProp('')}>Todos</button>
        {props.map(p => (
          <button key={p.id} className={`pill ${filtroProp === p.id ? 'active' : ''}`} onClick={() => setFiltroProp(p.id)}>
            {p.nome.split(' ')[0]}
          </button>
        ))}
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
                  { v:partosFiltrados.length, l:'Nascimentos' },
                  { v:areaUtilTxt,     l:'Área útil' },
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
                  { l:'Taxa de prenhez',    v: txPrenhez!=null?`${txPrenhez}%`:'—',    ok: (txPrenhez??0)>=85 },
                  { l:'Taxa de parição',    v: kpiPrn>0?pct(partosFiltrados.length,kpiPrn):'—', ok: kpiPrn>0 && partosFiltrados.length/kpiPrn>=0.80 },
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
                        {propsSelecionadas.map(p => <th key={p.id} style={{ textAlign:'center' }}>{p.nome.split(' ')[0]}</th>)}
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
                        {propsSelecionadas.map(p => (
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
                          const ins = (l.inseminacoes||[]).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
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
                        {/* Total: matrizes DISTINTAS expostas/prenhas (kpiIns/kpiPrn), não a
                            soma das linhas por lote acima — senão a mesma vaca exposta na IATF
                            e no repasse seria contada 2x e a taxa não bateria com Reprodutivo/Metas. */}
                        <tr className="tr-total">
                          <td colSpan={3}>Total ciclo {cicloLocal?.nome} <span style={{ fontWeight:400, fontSize:'.7rem', color:'#9CA3AF' }}>(matrizes distintas)</span></td>
                          <td>{kpiIns}</td>
                          <td style={{color:'#1E55B0'}}>{kpiPrn}</td>
                          <td>{txPrenhez!=null?`${txPrenhez}%`:'—'}</td>
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
              {partosFiltrados.length === 0
                ? <div style={{ color:'#9CA3AF', fontSize:'.82rem' }}>Nenhum nascimento registrado.</div>
                : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:10, marginBottom:12 }}>
                      {[
                        { v:partosFiltrados.length,                                   l:'Total nascimentos' },
                        { v:partosFiltrados.filter(p=>p.bezerro?.sexo==='M').length, l:'Machos ♂' },
                        { v:partosFiltrados.filter(p=>p.bezerro?.sexo==='F').length, l:'Fêmeas ♀' },
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
                          {partosFiltrados.map(p => (
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
                { l:'Taxa de prenhez',     v:txPrenhez!=null?`${txPrenhez}%`:'—',           meta:'≥85%', ok:(txPrenhez??0)>=85 },
                { l:'Taxa de parição',     v:kpiPrn>0?pct(partosFiltrados.length,kpiPrn):'—', meta:'≥80%', ok:kpiPrn>0 && partosFiltrados.length/kpiPrn>=0.80 },
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
              {gruposPorValor('R').map(({ grupo, valor }) => (
                <div key={grupo} className="row">
                  <span className="row-label">{grupo}</span>
                  <span className="row-value" style={{ color:'#1E55B0' }}>{fmtMoeda(valor)}</span>
                </div>
              ))}
              <div className="sl" style={{ marginTop:12 }}>Despesas por grupo</div>
              {gruposPorValor('D').map(({ grupo, valor }) => (
                <div key={grupo} className="row">
                  <span className="row-label">{grupo}</span>
                  <span className="row-value" style={{ color:'#791F1F' }}>{fmtMoeda(valor)}</span>
                </div>
              ))}
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
