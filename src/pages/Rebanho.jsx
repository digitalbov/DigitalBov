// ─────────────────────────────────────────────────────────────────
// CONTROLE DE REBANHO
// ─────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, calcTaxaPrenhez, contarExpostas, contarPrenhas, calcGMD, pct, fmtMoeda, ehMatriz, algumErro, calcResultadoFinanceiro, CATEGORIAS_VALOR, idadeFormatada, calcDesempenhoVidaFemea, classificarDesfechosPorSafra, CORES_DESFECHO, ROTULOS_DESFECHO } from '../lib/helpers'
import { Loading, IndexCard, BotaoPDF, ErroCarregamento, SeletorCicloLocal, Badge, EmptyState, AlertBox } from '../components/UI'
import { useCicloLocal } from '../lib/useCicloLocal'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TABS_R = ['Visão Geral','Índices','Comparativo','Histórico','Valor de Mercado do Rebanho','Ranking de Matrizes']

// Safras consecutivas sem cria a partir das quais o selo de atenção aparece —
// é só um SINAL VISUAL pra olhar com mais cuidado, nunca uma ordem de
// descarte (a decisão é sempre do produtor).
const SAFRAS_ATENCAO = 2

export function Rebanho() {
  const navigate   = useNavigate()
  const refVisao   = useRef(null)
  const refIndices = useRef(null)
  const refComp    = useRef(null)
  const refHist    = useRef(null)
  const refValor   = useRef(null)
  const refRanking = useRef(null)

  const [animais,      setAnimais]      = useState([])
  const [props,        setProps]        = useState([])
  const [tab,          setTab]          = useState(0)
  const [filtProp,     setFiltProp]     = useState('')
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(false)
  const [catPrecos,    setCatPrecos]    = useState([])
  const [todosLotesInsem, setTodosLotesInsem] = useState([])
  const [pesagens,        setPesagens]        = useState([])

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

  // Ranking de Matrizes (Fase 14) — carregamento PREGUIÇOSO, mesmo padrão de
  // todosStale/loadTodos em Reprodutivo.jsx: só busca db.lotesInseminacao.listAll()
  // (a variante PESADA, com partos.bezerro.pesagens + inseminações + abortos
  // embutidos — é a única que dá pra montar o histórico reprodutivo completo de
  // cada matriz numa query só) na primeira vez que a aba é aberta, nunca no
  // load inicial de Rebanho (que continua leve pras outras 5 abas).
  const [rankingLotes,   setRankingLotes]   = useState([])
  const [rankingStale,   setRankingStale]   = useState(true)
  const [loadingRanking, setLoadingRanking] = useState(false)
  const [filtCatRanking, setFiltCatRanking] = useState('')
  const [sortColRanking, setSortColRanking] = useState('kgPorAno')
  const [sortAscRanking, setSortAscRanking] = useState(false) // desc: maior kg/ano primeiro

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (ciclos.length > 0) loadDadosPorCiclo() }, [ciclos.length])
  useEffect(() => { if (tab === 5 && rankingStale) loadRanking() }, [tab, rankingStale])

  const loadRanking = async () => {
    setLoadingRanking(true)
    const { data, error } = await db.lotesInseminacao.listAll()
    if (error) console.error('[Rebanho] erro ao buscar ranking de matrizes:', error)
    setRankingLotes(data || [])
    setRankingStale(false)
    setLoadingRanking(false)
  }

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
      const base = await Promise.all([
        db.animais.list(),
        db.proprietarios.list(),
        db.categoriasPreco.list(),
        db.lotesInseminacao.listInseminacoesResumo(),
        db.pesagens.listAll(),
      ])
      if (algumErro('[Rebanho]', base)) { setLoadError(true); return }
      const [ra, rp, rc, rli, rpes] = base
      const propsData   = rp.data || []
      const animaisData = ra.data || []
      setAnimais(animaisData)
      setProps(propsData)
      setCatPrecos(rc.data || [])
      setTodosLotesInsem(rli.data || [])
      // Carrega TODAS as pesagens de uma vez (igual Metas.jsx) — o recorte por
      // ciclo (cicloLocal) do GMD acontece no render, então trocar de ciclo
      // não exige recarregar nada; sem isso, o GMD ficava preso ao cohort
      // calculado no load e não reagia à troca de ciclo (bug corrigido aqui).
      setPesagens(rpes.data || [])
    } catch (e) {
      console.error('[Rebanho] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const ativos = animais.filter(a =>
    a.situacao === 'ativo' && (!filtProp || a.proprietario_id === filtProp)
  )
  const fem    = ativos.filter(a => a.sexo === 'F')
  const matrizes = ativos.filter(a => ehMatriz(a))

  // ── Ranking de Matrizes (Fase 14) ──────────────────────────────────────────
  // Monta, a partir da query ÚNICA e pesada (rankingLotes), 3 mapas por
  // animal_id/mae_id — o mesmo formato {partos,inseminacoes,abortos} que
  // calcDesempenhoVidaFemea/classificarDesfechosPorSafra já esperam (é
  // literalmente o reprodutivoBruto que a ficha do animal monta, só que aqui
  // pra TODAS as matrizes de uma vez, sem 1 query por vaca. useMemo pra não
  // reprocessar a cada render — só quando os dados brutos ou os filtros mudam.
  const rankingRows = useMemo(() => {
    if (rankingLotes.length === 0) return []
    const partosPorMae = new Map()
    const insPorAnimal = new Map()
    const abortosPorAnimal = new Map()
    rankingLotes.forEach(l => {
      ;(l.partos || []).forEach(p => {
        if (!p.mae_id) return
        if (!partosPorMae.has(p.mae_id)) partosPorMae.set(p.mae_id, [])
        partosPorMae.get(p.mae_id).push(p)
      })
      ;(l.inseminacoes || []).forEach(i => {
        if (!i.animal_id) return
        if (!insPorAnimal.has(i.animal_id)) insPorAnimal.set(i.animal_id, [])
        // lote.data é o que classificarDesfechosPorSafra/calcDesempenhoVidaFemea
        // usam pra saber QUANDO a monta aconteceu — mesmo formato de
        // db.inseminacoes.byAnimal (ins.lote.data), só remontado aqui porque
        // listAll() traz o lote como pai, não embutido em cada inseminação.
        insPorAnimal.get(i.animal_id).push({ ...i, lote: { data: l.data } })
      })
      ;(l.abortos || []).forEach(ab => {
        if (!ab.animal_id) return
        if (!abortosPorAnimal.has(ab.animal_id)) abortosPorAnimal.set(ab.animal_id, [])
        abortosPorAnimal.get(ab.animal_id).push(ab)
      })
    })
    return matrizes.map(a => {
      const reprodutivoBruto = {
        partos: partosPorMae.get(a.id) || [],
        inseminacoes: insPorAnimal.get(a.id) || [],
        abortos: abortosPorAnimal.get(a.id) || [],
      }
      const d = calcDesempenhoVidaFemea(a, reprodutivoBruto)
      const desfechos = classificarDesfechosPorSafra(a, ciclos, reprodutivoBruto)
      let safrasSemCria = 0
      for (let i = desfechos.length - 1; i >= 0; i--) {
        if (desfechos[i].desfecho === 'pariu' || desfechos[i].desfecho === 'pariu_aguardando') break
        safrasSemCria++
      }
      return {
        animal: a,
        categoria: calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro),
        numeroPartosVida: d.numeroPartosVida,
        kgAcumulado: d.kgDesmamadoAcumulado,
        kgPorAno: d.kgDesmamadoPorAno,
        taxaDesmame: d.taxaDesmame,
        safrasSemCria,
        ultimoDesfecho: desfechos.length > 0 ? desfechos[desfechos.length - 1].desfecho : null,
      }
    })
  }, [rankingLotes, matrizes, ciclos])

  // Matriz jovem na 1ª safra, ainda sem nenhum parto na vida: não tem
  // denominador nenhum (kg/ano, taxa de desmame etc. seriam todos "—"), então
  // NUNCA entra na tabela principal (ordenada por kg/ano) — apareceria como
  // "pior do rebanho" só por falta de histórico, o que é enganoso. Fica numa
  // lista separada, só informativa.
  const rankingComHistorico = rankingRows.filter(r => r.numeroPartosVida > 0 && (!filtCatRanking || r.categoria === filtCatRanking))
  const rankingSemHistorico = rankingRows.filter(r => r.numeroPartosVida === 0 && (!filtCatRanking || r.categoria === filtCatRanking))
  const categoriasRanking = [...new Set(rankingRows.map(r => r.categoria))].sort()

  const rankingOrdenado = [...rankingComHistorico].sort((a, b) => {
    const get = r => {
      switch (sortColRanking) {
        case 'brinco':       return r.animal.brinco
        case 'idade':        return r.animal.data_nascimento || ''
        case 'categoria':    return r.categoria
        case 'partos':       return r.numeroPartosVida
        case 'kgAcumulado':  return r.kgAcumulado
        case 'kgPorAno':     return r.kgPorAno
        case 'taxaDesmame':  return r.taxaDesmame
        case 'safrasSemCria':return r.safrasSemCria
        case 'ultimoDesfecho': return ROTULOS_DESFECHO[r.ultimoDesfecho] || ''
        default:              return r.kgPorAno
      }
    }
    const va = get(a), vb = get(b)
    const vaNulo = va === null || va === undefined
    const vbNulo = vb === null || vb === undefined
    if (vaNulo && vbNulo) return 0
    if (vaNulo) return 1  // "—" sempre por último, nas duas direções
    if (vbNulo) return -1
    if (typeof va === 'string') return sortColRanking === 'idade'
      ? (sortAscRanking ? va.localeCompare(vb) : vb.localeCompare(va)) // data ISO: comparação de string já ordena certo
      : (sortAscRanking ? va.localeCompare(vb, undefined, { numeric: true }) : vb.localeCompare(va, undefined, { numeric: true }))
    return sortAscRanking ? va - vb : vb - va
  })
  const clicarColunaRanking = (col) => { setSortColRanking(col); setSortAscRanking(p => sortColRanking === col ? !p : true) }

  // Índices reprodutivos do ciclo atual — fórmula oficial única (helpers.calcTaxaPrenhez):
  // matrizes distintas prenhas / matrizes distintas expostas no ciclo — não usa
  // matrizes por idade nem sit_reprodutiva atual. kpiIns/kpiPrn deduplicam por
  // animal_id (contarExpostas/contarPrenhas), senão o card não bate com a taxa.
  // Filtra por proprietário (via animal.proprietario_id, embutido na inseminação).
  const insemRebanho = lotesInsem.flatMap(l => l.inseminacoes || [])
    .filter(i => !filtProp || i.animal?.proprietario_id === filtProp)
  const kpiInsServicos = insemRebanho.length
  const kpiIns = contarExpostas(insemRebanho)
  const kpiPrn = contarPrenhas(insemRebanho)
  const txPrenNum = calcTaxaPrenhez(insemRebanho)
  const txPren = txPrenNum !== null ? txPrenNum + '%' : '—'

  // GMD de terneiros/terneiras: (peso mais recente - peso inicial) / dias entre as pesagens.
  // Usa o calcGMD único de helpers.js (retorna string via toFixed ou null) —
  // convertido para número aqui antes de filtrar/agregar. Cohort ANCORADO NA
  // SAFRA DA MONTA (mesmo critério de Metas.jsx — ver comentário lá): o
  // terneiro pertence ao ciclo da monta que o gerou (via lote.partos), não à
  // data de nascimento dele — um nascido em outubro (ciclo seguinte) mas
  // gerado pela monta deste ciclo ainda é desta safra. Igual a Metas.jsx, não
  // inclui monta natural (lote_inseminacao_id nulo) — não há "ciclo da monta"
  // pra ancorar uma cobertura não lançada. Exclui mortos (perda real,
  // categoria diferente de venda). TODA pesagem do animal entra no cálculo,
  // inclusive compra/venda (o peso médio de uma transação é o peso real do
  // lote pesado — não é o peso individual exato de cada cabeça, mas os
  // desvios se compensam no GMD do grupo). A categoria (Terneiro/Terneira) é
  // avaliada na data da última pesagem considerada, não em "hoje".
  const bezerroIdsSafra = new Set(
    lotesInsem.flatMap(l => (l.partos || []).map(p => p.bezerro_id)).filter(Boolean)
  )
  const candidatosGmd = animais.filter(a =>
    (!filtProp || a.proprietario_id === filtProp) &&
    a.situacao !== 'morto' &&
    bezerroIdsSafra.has(a.id)
  )
  const gmdTerneiros = candidatosGmd
    .map(t => {
      const ps = pesagens.filter(p => p.animal_id === t.id).sort((a, b) => a.data.localeCompare(b.data))
      if (ps.length < 2) return null
      const dataUltimaPesagem = ps[ps.length - 1].data
      if (!['Terneiro','Terneira'].includes(calcCategoria(t.data_nascimento, t.sexo, dataUltimaPesagem))) return null
      return { sexo: t.sexo, gmd: parseFloat(calcGMD(ps)) }
    })
    .filter(t => t && Number.isFinite(t.gmd))
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

  // Dados para aba Valor de Mercado do Rebanho — usa o filtro padrão de
  // proprietário (`filtProp`, mesmo pill-group do topo, igual às outras abas).
  const propsSelecionadas = filtProp ? props.filter(p => p.id === filtProp) : props
  const valorRows = CATEGORIAS_VALOR.map(cat => {
    const animaisCat = ativos.filter(a =>
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
      .filter(i => !filtProp || i.animal?.proprietario_id === filtProp)
    const inseminacoesServicos = insemDoCiclo.length
    const inseminacoes = contarExpostas(insemDoCiclo)
    const prenhas      = contarPrenhas(insemDoCiclo)
    const txPrenhez    = calcTaxaPrenhez(insemDoCiclo)
    const nascimentos  = partosTodos.filter(p => p.ciclo_id === c.id && (!filtProp || p.mae?.proprietario_id === filtProp)).length
    const lancs        = lancsPorCiclo[c.id] || []
    const transacs     = transacsPorCiclo[c.id] || []
    // lancamentos_financeiros é a fonte única de dinheiro — transacoes_animais é
    // registro operacional (vendas/compras abaixo são contagem, não soma de
    // dinheiro) e não entra mais nesta apuração (ver Bloco D/D2).
    const { receita: receitas, despesa: despesas, resultado } = calcResultadoFinanceiro(lancs, filtProp)
    const vendas       = filtProp ? 0 : transacs.filter(t => t.tipo === 'V').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0)
    const compras      = filtProp ? 0 : transacs.filter(t => t.tipo === 'C').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0)
    return { ciclo: c, inseminacoes, inseminacoesServicos, prenhas, txPrenhez, nascimentos, receitas, despesas, resultado, vendas, compras }
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
    { ref: refRanking, filename:'rebanho-ranking-matrizes', titulo:'Rebanho: Ranking de Matrizes' },
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
          {tab === 5 && categoriasRanking.length > 0 && (
            <div className="pill-group">
              <button className={`pill ${!filtCatRanking?'active':''}`} onClick={()=>setFiltCatRanking('')}>Todas categorias</button>
              {categoriasRanking.map(c => (
                <button key={c} className={`pill ${filtCatRanking===c?'active':''}`} onClick={()=>setFiltCatRanking(c)}>{c}</button>
              ))}
            </div>
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
          <div className="grid-idx-repro" style={{marginBottom:16}}>
            <IndexCard compact value={txPren} label="Taxa de prenhez" meta="≥85%" ok={txPrenNum !== null && txPrenNum >= 85}/>
            <IndexCard compact value={kpiIns} label="Matrizes expostas no ciclo" color="#2B6CD9"/>
            <IndexCard compact value={kpiPrn} label="Prenhas no ciclo" color="#2B6CD9"/>
            <IndexCard compact value={partosTodos.filter(p => p.ciclo_id === cicloLocal?.id && (!filtProp || p.mae?.proprietario_id === filtProp)).length} label="Nascimentos no ciclo" color="#0C447C"/>
            <IndexCard compact value={kpiInsServicos} label="Inseminações (serviços)" color="#9CA3AF"/>
          </div>

          <div className="sl">GMD terneiros (0–12 meses)</div>
          <div className="grid-idx-repro" style={{marginBottom:16}}>
            <IndexCard compact value={fmtGMD(gmdTotal)}  label="GMD total"  meta="≥0,80 kg/dia" ok={gmdTotal !== null && gmdTotal >= 0.80}/>
            <IndexCard compact value={fmtGMD(gmdFemeas)} label="GMD fêmeas" color="#DB2777"/>
            <IndexCard compact value={fmtGMD(gmdMachos)} label="GMD machos" color="#1E55B0"/>
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
          {filtProp && (
            <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginBottom:10 }}>
              Filtrado por proprietário: nascimentos e lançamentos (com rateio) são filtrados; transações de venda/compra de animais não têm proprietário definido no sistema, então não entram em receitas/despesas com o filtro ativo.
            </div>
          )}
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
                    <td>Matrizes expostas</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right'}}>{s.inseminacoes || '—'}</td>)}
                  </tr>
                  <tr>
                    <td style={{ color:'#9CA3AF' }}>Inseminações (serviços)</td>
                    {statsPorCiclo.map(s => <td key={s.ciclo.id} style={{textAlign:'right',color:'#9CA3AF'}}>{s.inseminacoesServicos || '—'}</td>)}
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
                {filtProp && ' Com filtro de proprietário ativo, vendas/compras não entram (transações de venda/compra não têm proprietário definido no sistema, só nascimentos e lançamentos com rateio são filtráveis).'}
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
                      {row.precoRec ? fmtMoeda(row.precoRec.preco_kg||0) : '—'}
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

      {tab === 5 && (
        <div>
          <div ref={refRanking}>
          {loadingRanking ? <Loading text="Calculando desempenho de vida de cada matriz..." /> : (
            <>
              <AlertBox type="purple" icon="ti-bulb"
                title="Ferramenta de decisão de descarte"
                body='Ordenado por padrão pelo "Kg desmamado por ano de vida" — é a coluna que normaliza vacas de idades diferentes (sem ela, uma vaca velha sempre parece melhor só por ter tido mais partos). Clique em qualquer cabeçalho pra reordenar.' />

              {rankingComHistorico.length === 0 ? (
                <EmptyState icon="🐄" title="Nenhuma matriz com histórico reprodutivo" sub="Assim que houver partos registrados, o ranking aparece aqui." />
              ) : (
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr>
                        {[
                          ['brinco', 'Brinco'], ['idade', 'Idade'], ['categoria', 'Categoria'],
                          ['partos', 'Partos na vida'], ['kgAcumulado', 'Kg desmamado acumulado'],
                          ['kgPorAno', 'Kg desmamado / ano de vida'], ['taxaDesmame', 'Taxa de desmame'],
                          ['safrasSemCria', 'Safras sem cria'], ['ultimoDesfecho', 'Último desfecho'],
                        ].map(([col, label]) => (
                          <th key={col} onClick={() => clicarColunaRanking(col)}
                            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', textAlign: col === 'brinco' || col === 'categoria' || col === 'ultimoDesfecho' ? 'left' : 'right' }}>
                            {label}{sortColRanking === col ? (sortAscRanking ? ' ↑' : ' ↓') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rankingOrdenado.map(r => (
                        <tr key={r.animal.id}>
                          <td>
                            <button onClick={() => navigate('/animais', { state: { abrirAnimalId: r.animal.id } })}
                              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#2B6CD9', textDecoration: 'underline', cursor: 'pointer' }}>
                              {r.animal.brinco}
                            </button>
                          </td>
                          <td>{idadeFormatada(r.animal.data_nascimento)}</td>
                          <td>{r.categoria}</td>
                          <td style={{ textAlign: 'right' }}>{r.numeroPartosVida}</td>
                          <td style={{ textAlign: 'right' }}>{r.kgAcumulado !== null ? `${r.kgAcumulado} kg` : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#2B6CD9' }}>{r.kgPorAno !== null ? `${r.kgPorAno} kg/ano` : '—'}</td>
                          <td style={{ textAlign: 'right' }}>{r.taxaDesmame !== null ? `${r.taxaDesmame}%` : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {r.safrasSemCria}
                            {r.safrasSemCria >= SAFRAS_ATENCAO && (
                              <span title={`${r.safrasSemCria} safras seguidas sem cria — sinal de atenção, não é ordem de descarte. A decisão é sua.`}
                                style={{ marginLeft: 5, color: '#D97706' }}>
                                <i className="ti ti-alert-triangle-filled" style={{ fontSize: 12 }} />
                              </span>
                            )}
                          </td>
                          <td>
                            {r.ultimoDesfecho ? (
                              <Badge style={{ background: CORES_DESFECHO[r.ultimoDesfecho] + '22', color: CORES_DESFECHO[r.ultimoDesfecho] }}>
                                {ROTULOS_DESFECHO[r.ultimoDesfecho]}
                              </Badge>
                            ) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {rankingSemHistorico.length > 0 && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="card-title"><i className="ti ti-info-circle" /> Sem histórico suficiente ({rankingSemHistorico.length})</div>
                  <p style={{ fontSize: '.78rem', color: '#9CA3AF', marginBottom: 10 }}>
                    Matrizes aptas mas ainda sem nenhum parto na vida — não têm denominador pra calcular kg/ano, taxa de
                    desmame etc., então não entram no ranking acima (apareceriam como "piores" só por falta de histórico).
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Brinco</th><th>Idade</th><th>Categoria</th><th>Último desfecho</th></tr></thead>
                      <tbody>
                        {rankingSemHistorico.map(r => (
                          <tr key={r.animal.id}>
                            <td>
                              <button onClick={() => navigate('/animais', { state: { abrirAnimalId: r.animal.id } })}
                                style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#2B6CD9', textDecoration: 'underline', cursor: 'pointer' }}>
                                {r.animal.brinco}
                              </button>
                            </td>
                            <td>{idadeFormatada(r.animal.data_nascimento)}</td>
                            <td>{r.categoria}</td>
                            <td>{r.ultimoDesfecho ? ROTULOS_DESFECHO[r.ultimoDesfecho] : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
          </div>{/* end refRanking */}
        </div>
      )}

    </div>
  )
}
export default Rebanho
