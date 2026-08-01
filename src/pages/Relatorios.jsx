import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, calcTaxaPrenhez, contarExpostas, contarPrenhas, contarMatrizes, calcGestacaoLote, calcTaxaParicao, calcResultadoFinanceiro, calcDesmameMetrics, calcIntervaloPartos, calcGMD, estavaNoRebanho, fmtData, fmtMoeda, pct, ehMatriz, algumErro, CATEGORIAS_VALOR, gruposPorValor, sanidadeRealizada } from '../lib/helpers'
import { Loading, Badge, AlertBox, toast, ErroCarregamento } from '../components/UI'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo } from '../lib/CicloContext'
import { hoje as hojeAgora } from '../lib/hoje'

const TABS = ['Resumo Geral','Reprodução','Financeiro']
const NOMES_PDF = ['relatorio-geral','relatorio-reprodutivo','relatorio-financeiro']

// Fase 8 (Etapa E) — mesma orquestração de índices reprodutivos do bloco
// ciclo-a-ciclo (Etapa C), extraída pra função reaproveitável: roda uma vez
// pro ciclo inteiro (consolidado, já validado ao vivo) e de novo por CADA
// estação de monta (lotesPorEstacao, abaixo) — sempre as MESMAS funções puras
// de helpers.js, nunca uma segunda fórmula divergente pro detalhe por estação.
function calcIndicesDeLotes(lotesArr, animaisRef, filtroPropAtivo) {
  const insemRel  = lotesArr.flatMap(l => l.inseminacoes || []).filter(i => !filtroPropAtivo || i.animal?.proprietario_id === filtroPropAtivo)
  const kpiIns    = contarExpostas(insemRel)
  const kpiPrn    = contarPrenhas(insemRel)
  const txPrenhez = calcTaxaPrenhez(insemRel)
  const partosArr  = lotesArr.flatMap(l => l.partos  || []).filter(p => !filtroPropAtivo || p.mae?.proprietario_id    === filtroPropAtivo)
  const abortosArr = lotesArr.flatMap(l => l.abortos || []).filter(a => !filtroPropAtivo || a.animal?.proprietario_id === filtroPropAtivo)
  const kpiMortos = partosArr.filter(p => p.bezerro?.situacao === 'morto').length
  const txMortalidade = partosArr.length > 0 ? Math.round(kpiMortos / partosArr.length * 100) : null
  const kpiGestando = lotesArr.reduce((soma, l) => {
    const insLote     = (l.inseminacoes || []).filter(i => !filtroPropAtivo || i.animal?.proprietario_id === filtroPropAtivo)
    const partosLote  = (l.partos       || []).filter(p => !filtroPropAtivo || p.mae?.proprietario_id    === filtroPropAtivo)
    const abortosLote = (l.abortos      || []).filter(a => !filtroPropAtivo || a.animal?.proprietario_id === filtroPropAtivo)
    return soma + calcGestacaoLote(l.data, contarPrenhas(insLote), partosLote.length, abortosLote.length).gestando
  }, 0)
  const perdasNaoIdentificadas = Math.max(0, kpiPrn - partosArr.length - abortosArr.length - kpiGestando)
  const txPerdaGestacional = kpiPrn > 0 ? Math.round((abortosArr.length + perdasNaoIdentificadas) / kpiPrn * 100) : null
  const primeiraMonta = lotesArr.map(l => l.data).filter(Boolean).sort()[0] || null
  const matrizesAptas = primeiraMonta ? contarMatrizes(animaisRef, primeiraMonta) : 0
  const txAproveitamento = matrizesAptas > 0 ? Math.round(kpiIns / matrizesAptas * 100) : null
  const desmame = calcDesmameMetrics(partosArr, kpiIns)
  const txParicao    = kpiIns > 0 ? Math.round(partosArr.length / kpiIns * 100) : null
  const txEficiencia = kpiPrn > 0 ? Math.round(partosArr.length / kpiPrn * 100) : null
  const kpiPendentes = insemRel.filter(i => !i.diagnostico).length
  const txPendentes  = kpiIns > 0 ? Math.round(kpiPendentes / kpiIns * 100) : null
  const gmds = partosArr.map(p => p.bezerro?.pesagens).filter(ps => ps?.length >= 2).map(ps => parseFloat(calcGMD(ps))).filter(Number.isFinite)
  const gmdMedio = gmds.length > 0 ? (gmds.reduce((s,v)=>s+v,0)/gmds.length) : null
  const txAborto = kpiPrn > 0 ? Math.round(abortosArr.length / kpiPrn * 100) : null
  return { kpiIns, kpiPrn, txPrenhez, partosArr, abortosArr, txMortalidade, txPerdaGestacional, matrizesAptas, txAproveitamento, desmame, txParicao, txEficiencia, kpiPendentes, txPendentes, gmdMedio, txAborto }
}

export default function Relatorios() {
  const [tab,       setTab]      = useState(0)
  const [animais,   setAnimais]  = useState([])
  const [lancs,     setLancs]    = useState([])
  const [lotes,     setLotes]    = useState([])
  const [partos,    setPartos]   = useState([])
  // Fase 8 — TODOS os partos de TODOS os ciclos (não só este) — intervalo
  // entre partos precisa comparar o parto ANTERIOR de cada mãe, que pode ter
  // sido num ciclo passado; ciclo-scoped subcontaria/perderia intervalos
  // reais (mesmo motivo pelo qual Metas.jsx usa todosPartos, não partos do
  // ciclo). "Abortos registrados" usa lotes[].abortos (safra-anchored, ver
  // aggregação abaixo), não uma query própria — mesma safra da monta que
  // perda gestacional/mortalidade/desmame já usam, nunca ciclo do evento.
  const [partosTodos, setPartosTodos] = useState([])
  const [sanidade,  setSanidade] = useState([])
  const [props,     setProps]    = useState([])
  const [catPrecos, setCatPrecos]= useState([])
  const [piquetes,  setPiquetes] = useState([])
  const [transacs,  setTransacs] = useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [generating,setGenerating]=useState(false)
  const [filtroProp, setFiltroProp] = useState('')
  // Fase 8 — saldo anterior (caixa acumulado de ciclos passados), mesmo padrão
  // de Financeiro.jsx: RPC própria (agregada no banco), refeita sempre que o
  // ciclo OU o filtroProp mudam — nunca cacheada, nunca somada no `resu`.
  const [saldoAnteriorCiclo, setSaldoAnteriorCiclo] = useState(null)
  const { fazendaAtual } = useFazenda()
  const { cicloSelecionado: cicloLocal, ciclos } = useCiclo()

  const hoje = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})

  useEffect(() => { loadAll() }, [cicloLocal?.id])

  useEffect(() => {
    if (!cicloLocal) { setSaldoAnteriorCiclo(null); return }
    let cancelado = false
    db.ciclos.saldoAnterior(cicloLocal.id, filtroProp || null).then(({ data, error }) => {
      if (cancelado) return
      if (error) { console.error('[Relatorios] erro ao buscar saldo anterior:', error); setSaldoAnteriorCiclo(null); return }
      setSaldoAnteriorCiclo(Number(data) || 0)
    })
    return () => { cancelado = true }
  }, [cicloLocal?.id, filtroProp])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const base = await Promise.all([
        db.animais.list(),
        db.sanidade.list(),
        db.proprietarios.list(),
        db.categoriasPreco.list(),
        db.piquetes.list(),
        db.partos.listAll(),
        db.transacaoAnimaisItens.listDataEntradaCompras(),
      ])
      if (algumErro('[Relatorios]', base)) { setLoadError(true); return }
      const [ra, rs, rp, rcp, rpq, rptTodos, rEntradas] = base
      // data_entrada (Fase 8 — conciliação de rebanho + já era usado por
      // ehMatriz/"Matrizes", que até aqui nunca tinha essa data mesclada
      // nesta tela — um animal comprado entrava retroativamente nas
      // matrizes de ciclos ANTERIORES à compra; corrigido de graça junto).
      // Uma query só pra toda a lista (nunca N+1), mesmo padrão de Metas.jsx.
      const entradaMap = new Map(
        (rEntradas.data || []).map(r => [r.animal_id, r.transacoes_animais?.data || null])
      )
      setAnimais((ra.data || []).map(a => ({ ...a, data_entrada: entradaMap.get(a.id) || null })))
      // Fase 7 — agendamento (status='agendado') não conta no indicador "Proc.
      // sanidade" nem em vencidos (ainda não aconteceu).
      setSanidade((rs.data || []).filter(sanidadeRealizada))
      setProps(rp.data     || [])
      setCatPrecos(rcp.data|| [])
      setPiquetes(rpq.data || [])
      setPartosTodos(rptTodos.data || [])
      if (cicloLocal) {
        const doCiclo = await Promise.all([
          db.lancamentos.list(cicloLocal.id),
          // Fase 8 — trocado de listInseminacoesResumo (mais leve) pra list()
          // completo: precisa de partos[].bezerro.{situacao,pesagens,data_desmame}
          // pra mortalidade/desmame/peso ao nascer, e estacao_monta_id pra
          // agrupar por estação (etapa E) — mesma query que Reprodutivo.jsx já
          // usa pro funil da safra, aqui reaproveitada em vez de duplicada.
          db.lotesInseminacao.list(cicloLocal.id),
          db.partos.list(cicloLocal.id),
          // Fase 8 — ticket médio de venda/compra (item 3d): transacoes_animais
          // do ciclo, mesma fonte que Financeiro.jsx usa pro card "Vendas de
          // animais" (sem filtro de proprietário — a transação não carrega
          // proprietario_id direto, só o rateio do lançamento vinculado).
          db.transacoes.list(cicloLocal.id),
        ])
        if (algumErro('[Relatorios]', doCiclo)) { setLoadError(true); return }
        const [rl, rli, rpt, rtr] = doCiclo
        setLancs(rl.data       || [])
        setLotes(rli.data      || [])
        setPartos(rpt.data     || [])
        setTransacs(rtr.data   || [])
      }
    } catch (e) {
      console.error('[Relatorios] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  // Cálculos — filtroProp (pills) recalcula todos os indicadores abaixo para o
  // proprietário selecionado, mesmo padrão de Rebanho/Reprodutivo/Metas.
  const ativos   = animais.filter(a => a.situacao === 'ativo' && (!filtroProp || a.proprietario_id === filtroProp))
  const inativos = animais.filter(a => a.situacao !== 'ativo' && (!filtroProp || a.proprietario_id === filtroProp))
  const matrizes = ativos.filter(a => ehMatriz(a))
  const partosFiltrados = partos.filter(p => !filtroProp || p.mae?.proprietario_id === filtroProp)

  // Fase 8 — Conciliação de rebanho: abertura + nascimentos + compras − mortes
  // − vendas = fechamento. Período = início/fim do CICLO selecionado (mesmo
  // período usado no resto do relatório) — nunca ano civil. `animais` já vem
  // com data_entrada mesclada (ver loadAll), e estavaNoRebanho generaliza a
  // mesma lógica de entrada/saída de ehMatriz pra qualquer animal (helpers.js).
  // filtroProp aplicado direto sobre TODOS os animais (não só ativos) — um
  // animal vendido/morto no período ainda precisa entrar na conta.
  const animaisConciliacao = filtroProp ? animais.filter(a => a.proprietario_id === filtroProp) : animais
  const dataAberturaCiclo   = cicloLocal?.inicio || null
  const dataFechamentoCiclo = cicloLocal?.fim    || null
  const noPeriodo = (data) => !!(data && dataAberturaCiclo && dataFechamentoCiclo && data >= dataAberturaCiclo && data <= dataFechamentoCiclo)
  const inventarioAbertura   = dataAberturaCiclo   ? animaisConciliacao.filter(a => estavaNoRebanho(a, dataAberturaCiclo))   : []
  const inventarioFechamento = dataFechamentoCiclo ? animaisConciliacao.filter(a => estavaNoRebanho(a, dataFechamentoCiclo)) : []
  const comprasPeriodo = animaisConciliacao.filter(a => noPeriodo(a.data_entrada))
  const mortesPeriodo  = animaisConciliacao.filter(a => a.situacao === 'morto'   && noPeriodo(a.data_baixa))
  const vendasPeriodo  = animaisConciliacao.filter(a => a.situacao === 'vendido' && noPeriodo(a.data_baixa))
  const nascimentosPeriodo = partosFiltrados.length
  const fechamentoCalculado = inventarioAbertura.length + nascimentosPeriodo + comprasPeriodo.length - mortesPeriodo.length - vendasPeriodo.length
  const conciliacaoFecha = fechamentoCalculado === inventarioFechamento.length
  // Quebra por categoria (na data de referência — calcCategoria aceita
  // dataRef, então um animal é classificado pela categoria que TINHA na
  // abertura/fechamento, não pela de hoje) — proprietário já é o filtroProp
  // acima, mesmo padrão de pills usado no resto da tela.
  const categoriasConciliacao = [...new Set([
    ...inventarioAbertura.map(a => calcCategoria(a.data_nascimento, a.sexo, dataAberturaCiclo)),
    ...inventarioFechamento.map(a => calcCategoria(a.data_nascimento, a.sexo, dataFechamentoCiclo)),
  ])].sort()
  const conciliacaoPorCategoria = categoriasConciliacao.map(cat => ({
    cat,
    abertura:    inventarioAbertura.filter(a => calcCategoria(a.data_nascimento, a.sexo, dataAberturaCiclo) === cat).length,
    fechamento:  inventarioFechamento.filter(a => calcCategoria(a.data_nascimento, a.sexo, dataFechamentoCiclo) === cat).length,
  }))
  // Evolução do rebanho vs ciclo anterior (item 3d) — mesmo estavaNoRebanho,
  // só que na data de fechamento do ciclo IMEDIATAMENTE anterior ao
  // selecionado (por data, não por nome — nomes de ciclo não são sequenciais
  // garantidos). Sem ciclo anterior cadastrado (primeiro ciclo da fazenda),
  // fica null e a tela simplesmente omite a comparação.
  const cicloAnterior = (ciclos || [])
    .filter(c => dataAberturaCiclo && c.fim && c.fim < dataAberturaCiclo)
    .sort((a, b) => b.fim.localeCompare(a.fim))[0] || null
  const inventarioFechamentoAnterior = cicloAnterior?.fim
    ? animaisConciliacao.filter(a => estavaNoRebanho(a, cicloAnterior.fim)).length
    : null
  const evolucaoRebanho = inventarioFechamentoAnterior != null
    ? inventarioFechamento.length - inventarioFechamentoAnterior
    : null

  // lancamentos_financeiros é a fonte única de dinheiro — transacoes_animais é
  // registro operacional e não entra mais nesta soma (ver Bloco D/D2).
  const { receita: rec, despesa: desp, resultado: resu } = calcResultadoFinanceiro(lancs, filtroProp)

  // Taxa de prenhez — fórmula oficial única (helpers.calcTaxaPrenhez), a mesma
  // usada em Reprodutivo/Rebanho/Metas: matrizes DISTINTAS prenhas / expostas no
  // ciclo, deduplicadas por animal_id (contarExpostas/contarPrenhas) — nunca
  // conta a mesma vaca 2x quando ela entra na IATF e no repasse. lotes (agora
  // db.lotesInseminacao.list) já traz animal_id e animal.proprietario_id,
  // necessários para a dedupe e o filtro.
  const insemRel  = lotes.flatMap(l => l.inseminacoes || []).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
  const kpiIns    = contarExpostas(insemRel)
  const kpiPrn    = contarPrenhas(insemRel)
  const txPrenhez = calcTaxaPrenhez(insemRel)

  // Fase 8 — índices reprodutivos que faltavam (aproveitamento, desmame,
  // perda gestacional, mortalidade) + correção da taxa de parição — mesma
  // agregação ciclo-a-ciclo já usada em Reprodutivo.jsx (aba Índices),
  // reaproveitando as MESMAS funções puras de helpers.js
  // (calcGestacaoLote/calcDesmameMetrics/contarMatrizes) pra nunca divergir
  // da tela que já existe. TUDO aqui é ancorado na SAFRA (lote/monta), nunca
  // no ciclo do evento — mesmo princípio já documentado no AlertBox abaixo
  // ("os índices de parição e perdas contam sempre para a safra da monta").
  // partosKpiArr/abortosKpiArr vêm de lotes[].partos/abortos (FK lote_inseminacao_id),
  // não da query separada `partos`/`abortos` (que é por ciclo_id — data REAL
  // do evento, usada só na lista "Nascimentos" abaixo).
  const partosKpiArr  = lotes.flatMap(l => l.partos  || []).filter(p => !filtroProp || p.mae?.proprietario_id    === filtroProp)
  const abortosKpiArr = lotes.flatMap(l => l.abortos || []).filter(a => !filtroProp || a.animal?.proprietario_id === filtroProp)
  const kpiMortos = partosKpiArr.filter(p => p.bezerro?.situacao === 'morto').length
  const txMortalidade = partosKpiArr.length > 0 ? Math.round(kpiMortos / partosKpiArr.length * 100) : null
  const kpiGestando = lotes.reduce((soma, l) => {
    const insLote    = (l.inseminacoes || []).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
    const partosLote = (l.partos       || []).filter(p => !filtroProp || p.mae?.proprietario_id    === filtroProp)
    const abortosLote= (l.abortos      || []).filter(a => !filtroProp || a.animal?.proprietario_id === filtroProp)
    return soma + calcGestacaoLote(l.data, contarPrenhas(insLote), partosLote.length, abortosLote.length).gestando
  }, 0)
  const perdasNaoIdentificadas = Math.max(0, kpiPrn - partosKpiArr.length - abortosKpiArr.length - kpiGestando)
  const txPerdaGestacional = kpiPrn > 0 ? Math.round((abortosKpiArr.length + perdasNaoIdentificadas) / kpiPrn * 100) : null
  const primeiraMontaCiclo = lotes.map(l => l.data).filter(Boolean).sort()[0] || null
  const animaisParaAptas = filtroProp ? animais.filter(a => a.proprietario_id === filtroProp) : animais
  const matrizesAptasCiclo = primeiraMontaCiclo ? contarMatrizes(animaisParaAptas, primeiraMontaCiclo) : 0
  const txAproveitamento = matrizesAptasCiclo > 0 ? Math.round(kpiIns / matrizesAptasCiclo * 100) : null
  const desmameCiclo = calcDesmameMetrics(partosKpiArr, kpiIns)
  // "Taxa de Parição" (decisão Fase 8, item 4): partos ÷ matrizes EXPOSTAS —
  // era o que já se chamava "Taxa de parição (natalidade)" em Reprodutivo.jsx.
  // "Eficiência Gestacional": partos ÷ matrizes PRENHAS — nome novo pra
  // fórmula que ANTES se chamava "Taxa de parição" aqui (mesma chave
  // taxa_paricao em Metas.jsx, só o rótulo muda — ver Opção A).
  // calcTaxaParicao (helpers.js) consolida esta conta com Reprodutivo.jsx/
  // Metas.jsx, que divergiam no tratamento de "expostas>0 e 0 partos".
  const txParicaoNova = calcTaxaParicao(kpiIns, partosKpiArr.length, kpiGestando)
  const txEficienciaGestacional = kpiPrn > 0 ? Math.round(partosKpiArr.length / kpiPrn * 100) : null
  // % de matrizes expostas ainda sem diagnóstico (nem Prenha nem Vazia).
  const kpiPendentes = insemRel.filter(i => !i.diagnostico).length
  const txPendentes = kpiIns > 0 ? Math.round(kpiPendentes / kpiIns * 100) : null
  // GMD médio da safra — versão simplificada do cohort de Metas.jsx (que além
  // de 2+ pesagens também exige o bezerro ainda vivo e ainda classificado
  // como Terneiro/Terneira na última pesagem): aqui basta ter 2+ pesagens,
  // adequado a um número-resumo de fechamento, não ao detalhamento mês a mês
  // que Metas.jsx já cobre. calcGMD é a mesma função pura das duas telas.
  const gmdsSafra = partosKpiArr
    .map(p => p.bezerro?.pesagens)
    .filter(ps => ps?.length >= 2)
    .map(ps => parseFloat(calcGMD(ps)))
    .filter(Number.isFinite)
  const gmdMedioSafra = gmdsSafra.length > 0 ? (gmdsSafra.reduce((s,v)=>s+v,0)/gmdsSafra.length) : null

  // Fase 8 (Etapa E) — lotes agrupados por ESTAÇÃO DE MONTA (unidade
  // biológica); um ciclo (unidade financeira) pode conter mais de uma
  // estação. `l.estacao` já vem embutido na query rica (db.lotesInseminacao.
  // list, ver loadAll) — lotes sem estacao_monta_id (nunca vinculados a uma
  // estação formal) caem no bucket "Avulsos", nunca somem do relatório.
  const animaisParaEstacao = filtroProp ? animais.filter(a => a.proprietario_id === filtroProp) : animais
  const lotesPorEstacaoMap = new Map()
  lotes.forEach(l => {
    const key = l.estacao?.id || '_avulsos'
    if (!lotesPorEstacaoMap.has(key)) lotesPorEstacaoMap.set(key, { estacao: l.estacao || null, lotesEstacao: [] })
    lotesPorEstacaoMap.get(key).lotesEstacao.push(l)
  })
  const gruposEstacao = [...lotesPorEstacaoMap.values()]
    .sort((a, b) => {
      if (!a.estacao) return 1
      if (!b.estacao) return -1
      return (a.estacao.inicio || '').localeCompare(b.estacao.inicio || '')
    })
    .map(g => ({ ...g, idx: calcIndicesDeLotes(g.lotesEstacao, animaisParaEstacao, filtroProp) }))
  // Estrutura só aparece quando há mais de 1 grupo (2+ estações, ou 1 estação
  // + avulsos) — com uma única estação cobrindo o ciclo todo, o consolidado
  // já É o detalhe, mostrar os dois seria redundante.
  const mostrarEstacoes = gruposEstacao.length > 1

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

  // Fase 8 — índices financeiros que faltavam. Caixa acumulado = saldo
  // anterior (RPC, ciclos passados) + resultado deste ciclo — nunca soma no
  // `resu` acima, é um número à parte (mesmo padrão de Financeiro.jsx).
  // Resultado por proprietário reaproveita valorPropLanc (mesma fonte de
  // rec/desp) por propsSelecionadas (já reduz a 1 coluna quando filtroProp
  // está ativo). Custo/receita por matriz agora usam matrizesAptasCiclo
  // (matrizes aptas NA DATA da 1ª monta do ciclo) em vez de matrizes.length
  // (snapshot de HOJE) — um ciclo encerrado no passado estava dividindo pelo
  // rebanho de hoje, não pelo rebanho que existia durante o próprio ciclo.
  const caixaAcumulado = saldoAnteriorCiclo != null ? saldoAnteriorCiclo + resu : null
  const resultadoPorProp = propsSelecionadas.map(p => {
    const { receita: recP, despesa: despP, resultado: resuP } = calcResultadoFinanceiro(lancs, p.id)
    return { nome: p.nome.split(' ')[0], rec: recP, desp: despP, resu: resuP }
  })
  const custoPorMatriz  = matrizesAptasCiclo > 0 ? desp / matrizesAptasCiclo : null
  const receitaPorMatriz = matrizesAptasCiclo > 0 ? rec  / matrizesAptasCiclo : null
  const custoPorTerneiro = partosKpiArr.length > 0 ? desp / partosKpiArr.length : null
  // Ticket médio de venda/compra — valor total ÷ quantidade de animais das
  // transações do ciclo (mesmos campos que Financeiro.jsx exibe por linha).
  const transacsVenda   = transacs.filter(t => t.tipo === 'V')
  const transacsCompra  = transacs.filter(t => t.tipo === 'C')
  const qtdVenda    = transacsVenda.reduce((s,t) => s+(parseInt(t.quantidade)||0), 0)
  const qtdCompra   = transacsCompra.reduce((s,t) => s+(parseInt(t.quantidade)||0), 0)
  const valorVenda  = transacsVenda.reduce((s,t) => s+(parseFloat(t.valor_total)||0), 0)
  const valorCompra = transacsCompra.reduce((s,t) => s+(parseFloat(t.valor_total)||0), 0)
  const ticketMedioVenda  = qtdVenda  > 0 ? valorVenda  / qtdVenda  : null
  const ticketMedioCompra = qtdCompra > 0 ? valorCompra / qtdCompra : null

  // Índices/KPIs reaproveitados tanto na tela quanto no PDF (evita duas
  // fórmulas divergentes) — ver uso abaixo nos cards da tela e em gerarPDF.
  // Fase 8, item 4 (decisão do usuário — Opção A): "Taxa de Parição" agora é
  // partos ÷ EXPOSTAS (txParicaoNova) em todo lugar — era o que já se
  // chamava "Taxa de parição (natalidade)" em Reprodutivo.jsx. A fórmula
  // antiga (partos ÷ prenhas) continua existindo, só com nome novo:
  // "Eficiência Gestacional" — nenhuma meta já configurada muda de sentido
  // (mesma chave taxa_paricao em Metas.jsx, só o rótulo muda).
  const indicesGerais = [
    { l:'Taxa de prenhez',    v: txPrenhez!=null?`${txPrenhez}%`:'—',    ok: (txPrenhez??0)>=85 },
    { l:'Taxa de parição',    v: txParicaoNova!=null?`${txParicaoNova}%`:'—', ok: (txParicaoNova??0)>=75 },
    { l:'Receita bruta',      v:fmtMoeda(rec),                           ok: true },
    { l:'Resultado do ciclo', v:fmtMoeda(resu),                          ok: resu>=0 },
    { l:'Proc. sanidade',     v:`${sanidade.length} (${vencSan} venc.)`, ok: vencSan===0 },
  ]
  // Fase 8 — "Abortos registrados"/"Intervalo de partos" antes hardcoded
  // ('—' e '12,4 meses (est.)'): um relatório de fechamento com número
  // inventado é pior que não ter o campo. Abortos usa abortosKpiArr
  // (safra-anchored, mesma fonte de perda gestacional acima). Intervalo usa
  // partosTodos (todos os ciclos, não só este) e dias (não meses) — mesma
  // unidade já validada em Metas.jsx, pra não introduzir uma terceira
  // convenção diferente pro mesmo indicador.
  const txAborto = kpiPrn > 0 ? Math.round(abortosKpiArr.length / kpiPrn * 100) : null
  const partosTodosFiltrados = filtroProp ? partosTodos.filter(p => p.mae?.proprietario_id === filtroProp) : partosTodos
  const intervaloPartosDias = calcIntervaloPartos(partosTodosFiltrados).media
  const indicesReprodutivos = [
    { l:'Taxa de prenhez',        v:txPrenhez!=null?`${txPrenhez}%`:'—',              meta:'≥85%', ok:(txPrenhez??0)>=85 },
    { l:'Taxa de aproveitamento', v:txAproveitamento!=null?`${txAproveitamento}%`:'—', meta:'≥100%', ok:(txAproveitamento??0)>=100 },
    { l:'Taxa de parição',        v:txParicaoNova!=null?`${txParicaoNova}%`:'—',       meta:'≥75%', ok:(txParicaoNova??0)>=75 },
    { l:'Eficiência gestacional', v:txEficienciaGestacional!=null?`${txEficienciaGestacional}%`:'—', meta:'≥85%', ok:(txEficienciaGestacional??0)>=85 },
    { l:'Abortos registrados',    v:txAborto!=null?`${abortosKpiArr.length} (${txAborto}%)`:(abortosKpiArr.length>0?String(abortosKpiArr.length):'—'), meta:'<5%', ok:txAborto==null||txAborto<5 },
    { l:'Perda gestacional',      v:txPerdaGestacional!=null?`${txPerdaGestacional}%`:'—', meta:'<15%', ok:txPerdaGestacional==null||txPerdaGestacional<15 },
    { l:'Mortalidade de terneiros', v:txMortalidade!=null?`${txMortalidade}%`:'—',     meta:'<5%',  ok:txMortalidade==null||txMortalidade<5 },
    { l:'Taxa de desmama',        v:desmameCiclo.txDesmama!=null?`${desmameCiclo.txDesmama}%`:'—', meta:'≥90%', ok:(desmameCiclo.txDesmama??0)>=90 },
    { l:'Intervalo de partos',    v:intervaloPartosDias!=null?`${intervaloPartosDias} dias`:'—', meta:'≤365d', ok:intervaloPartosDias==null||intervaloPartosDias<=365 },
    { l:'Peso médio ao nascer',   v:desmameCiclo.pesoMedioNascimento!=null?`${desmameCiclo.pesoMedioNascimento.toFixed(1).replace('.',',')} kg`:'—', meta:'—', ok:true },
    { l:'GMD médio da safra',     v:gmdMedioSafra!=null?`${gmdMedioSafra.toFixed(3).replace('.',',')} kg/dia`:'—', meta:'≥0,700', ok:gmdMedioSafra==null||gmdMedioSafra>=0.7 },
    { l:'Matrizes pendentes de diagnóstico', v:txPendentes!=null?`${kpiPendentes} (${txPendentes}%)`:'—', meta:'0%', ok:kpiPendentes===0 },
  ]
  const indicadoresRentabilidade = [
    { l:'Retorno sobre despesas (ROI)',  v:desp>0?Math.round(resu/desp*100)+'%':'—',               meta:'≥30%', ok:desp>0&&resu/desp>=0.3 },
    { l:'Margem bruta',                 v:rec>0?Math.round(resu/rec*100)+'%':'—',                  meta:'≥25%', ok:rec>0&&resu/rec>=0.25 },
    // Fase 8 — corrigido: dividia por matrizes.length (snapshot de HOJE),
    // agora por matrizesAptasCiclo (matrizes aptas na data da 1ª monta deste
    // ciclo) — mesma base de contarMatrizes já usada na taxa de aproveitamento.
    { l:'Custo por matriz',              v:custoPorMatriz!=null?fmtMoeda(Math.round(custoPorMatriz)):'—', meta:'≤R$500', ok:custoPorMatriz==null||custoPorMatriz<=500 },
    { l:'Receita por matriz',            v:receitaPorMatriz!=null?fmtMoeda(Math.round(receitaPorMatriz)):'—', meta:'—', ok:true },
    { l:'Custo por terneiro',            v:custoPorTerneiro!=null?fmtMoeda(Math.round(custoPorTerneiro)):'—', meta:'—', ok:true },
    { l:'Ticket médio de venda',         v:ticketMedioVenda!=null?fmtMoeda(ticketMedioVenda):'—', meta:'—', ok:true },
    { l:'Ticket médio de compra',        v:ticketMedioCompra!=null?fmtMoeda(ticketMedioCompra):'—', meta:'—', ok:true },
    { l:'Eficiência por hectare (est.)', v:'—', meta:'≥180 kg/ha', ok:false },
  ]

  // PDF com texto real, montado direto dos dados já calculados acima (nunca
  // captura de tela) — ver pdfRelatorios.js. Nenhum dos 3 relatórios tem
  // gráfico/imagem de verdade, só números e tabelas, por isso não precisa de
  // rasterização nenhuma (arquivo final fica pequeno e com texto pesquisável).
  const gerarPDF = async () => {
    setGenerating(true)
    try {
      const fazenda = fazendaAtual?.nome || ''
      const cicloNome = cicloLocal?.nome
      // Logo da fazenda (Fase 9) — mesmo carregador do Manual (pdfWriter.js),
      // pronta ANTES de gerar (PdfWriter desenha a capa de forma síncrona).
      const { carregarLogoFazenda } = await import('../lib/pdfWriter')
      const logoDataURL = await carregarLogoFazenda(fazendaAtual?.foto_url || '')
      // Fase 8 (Etapa F) — capa rica (período + proprietários do ciclo),
      // mesmos dados nos 3 relatórios, montados uma vez aqui em vez de
      // repetidos em cada bloco de tab === N.
      const periodoTxt = dataAberturaCiclo && dataFechamentoCiclo
        ? `Período: ${fmtData(dataAberturaCiclo)} a ${fmtData(dataFechamentoCiclo)}` : null
      const propsTxt = propsSelecionadas.length > 0
        ? `Proprietário(s): ${propsSelecionadas.map(p => p.nome).join(', ')}` : null
      if (tab === 0) {
        const { gerarPDFRelatorioGeral } = await import('../lib/pdfRelatorios')
        gerarPDFRelatorioGeral({
          fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL,
          kpisTopo: [
            { v: ativos.length,        l:'Animais ativos' },
            { v: matrizes.length,      l:'Matrizes' },
            { v: partosFiltrados.length,l:'Nascimentos' },
            { v: areaUtilTxt,          l:'Área útil' },
          ],
          catMap, totalAtivos: ativos.length, indices: indicesGerais,
          valorRows: valorRowsRel, propsSelecionadas, valorTotal: valorTotalRel,
          vencSan, ativos: ativos.length, inativos: inativos.length,
          filename: NOMES_PDF[0],
        })
      } else if (tab === 1) {
        const { gerarPDFRelatorioReprodutivo } = await import('../lib/pdfRelatorios')
        gerarPDFRelatorioReprodutivo({
          fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL,
          lotesRows: lotes.map(l => {
            const ins = (l.inseminacoes||[]).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
            const prn = ins.filter(i=>i.diagnostico==='P').length
            return {
              numero: l.numero, touro: l.touro, dataFmt: fmtData(l.data),
              insCount: ins.length, prn, txPct: pct(prn, ins.length),
              partoPrevFmt: l.data ? new Date(new Date(l.data+'T12:00:00').setMonth(new Date(l.data+'T12:00:00').getMonth()+9)).toLocaleDateString('pt-BR') : '—',
            }
          }),
          kpiIns, kpiPrn, txPrenhez,
          nascKpis: [
            { v: partosFiltrados.length,                                   l:'Total nascimentos' },
            { v: partosFiltrados.filter(p=>p.bezerro?.sexo==='M').length, l:'Machos ♂' },
            { v: partosFiltrados.filter(p=>p.bezerro?.sexo==='F').length, l:'Fêmeas ♀' },
          ],
          partosRows: partosFiltrados.map(p => ({
            dataFmt: fmtData(p.data_parto), maeBrinco: p.mae?.brinco||'—',
            sexoTxt: p.bezerro?.sexo==='F'?'♀ Fêmea':'♂ Macho', bezerroBrinco: p.bezerro?.brinco||'—',
          })),
          indicesReprod: indicesReprodutivos,
          mostrarEstacoes,
          // Fase 8 (Etapa E) — mesmo agrupamento por estação de monta da tela,
          // já com os índices calculados (calcIndicesDeLotes) prontos pro PDF.
          gruposEstacaoRows: mostrarEstacoes ? gruposEstacao.map(g => ({
            nome: g.estacao?.nome || 'Avulsos (sem estação vinculada)',
            periodo: g.estacao ? `${fmtData(g.estacao.inicio)} a ${fmtData(g.estacao.fim)}` : null,
            lotesRows: g.lotesEstacao.map(l => {
              const ins = (l.inseminacoes||[]).filter(i => !filtroProp || i.animal?.proprietario_id === filtroProp)
              const prn = ins.filter(i=>i.diagnostico==='P').length
              return {
                numero: l.numero, touro: l.touro, dataFmt: fmtData(l.data),
                insCount: ins.length, prn, txPct: pct(prn, ins.length),
                partoPrevFmt: l.data ? new Date(new Date(l.data+'T12:00:00').setMonth(new Date(l.data+'T12:00:00').getMonth()+9)).toLocaleDateString('pt-BR') : '—',
              }
            }),
            subtotal: { kpiIns: g.idx.kpiIns, kpiPrn: g.idx.kpiPrn, txPrenhez: g.idx.txPrenhez },
            idxRow: {
              partos: g.idx.partosArr.length, txParicao: g.idx.txParicao, txEficiencia: g.idx.txEficiencia,
              txPerdaGestacional: g.idx.txPerdaGestacional, txMortalidade: g.idx.txMortalidade,
            },
          })) : null,
          consolidadoIdxRow: mostrarEstacoes ? {
            kpiIns, kpiPrn, txPrenhez, partos: partosKpiArr.length, txParicao: txParicaoNova,
            txEficiencia: txEficienciaGestacional, txPerdaGestacional, txMortalidade,
          } : null,
          filename: NOMES_PDF[1],
        })
      } else {
        const { gerarPDFRelatorioFinanceiro } = await import('../lib/pdfRelatorios')
        gerarPDFRelatorioFinanceiro({
          fazenda, cicloNome, periodoTxt, propsTxt, logoDataURL,
          kpisTopo: [
            { v:fmtMoeda(rec),  l:'Receitas',  cor:[30,85,176],  bg:[232,240,252] },
            { v:fmtMoeda(desp), l:'Despesas',  cor:[121,31,31],  bg:[252,235,235] },
            { v:fmtMoeda(Math.abs(resu)), l:resu>=0?'Resultado positivo':'Resultado negativo', cor:resu>=0?[43,108,217]:[121,31,31], bg:resu>=0?[232,240,252]:[252,235,235] },
            { v:saldoAnteriorCiclo!=null?fmtMoeda(saldoAnteriorCiclo):'—', l:'Saldo anterior', cor:[123,47,190], bg:[243,232,255] },
            { v:caixaAcumulado!=null?fmtMoeda(caixaAcumulado):'—', l:'Caixa acumulado', cor:[123,47,190], bg:[243,232,255] },
          ],
          receitasGrupo: gruposPorValor(lancs, 'R', filtroProp), despesasGrupo: gruposPorValor(lancs, 'D', filtroProp),
          indicadores: indicadoresRentabilidade,
          resultadoPorProp: resultadoPorProp.length > 1 ? resultadoPorProp : [],
          filename: NOMES_PDF[2],
        })
      }
    } catch (e) {
      toast('Erro ao gerar PDF: ' + e.message, 'error')
    }
    setGenerating(false)
  }

  // Cabeçalho discreto de cada aba (nome do relatório à esquerda) + botão de
  // Linha de UM lote na tabela "Lotes de inseminação" — extraída pra função
  // porque a Etapa E passou a reaproveitá-la em dois lugares (fallback flat
  // sem estação e dentro de cada grupo de estação), nunca duplicando o JSX.
  const renderLoteRow = (l) => {
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
  }

  const PrintHeader = ({ titulo }) => (
    <div style={{ textAlign:'center', padding:'16px 0 12px', borderBottom:'.5px solid #E5E7EB', marginBottom:16 }}>
      {/* Cabeçalho só da TELA — o PDF gerado (src/lib/pdfRelatorios.js) desenha
          seu próprio cabeçalho/capa em texto real, independente deste aqui. */}
      <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#111' }}>DigitalBov</div>
      <div style={{ fontSize:'.85rem', color:'#6B7280', marginTop:2 }}>{titulo} · Ciclo {cicloLocal?.nome||'—'} · Gerado em {hoje}</div>
    </div>
  )

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div className="relatorios-page">
      {/* Ciclo agora vem exclusivamente do seletor global no topo. */}
      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* Linha 2: filtro por proprietário (esquerda) + Gerar PDF (direita) */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        <div className="pill-group">
          <button className={`pill ${!filtroProp ? 'active' : ''}`} onClick={() => setFiltroProp('')}>Todos</button>
          {props.map(p => (
            <button key={p.id} className={`pill ${filtroProp === p.id ? 'active' : ''}`} onClick={() => setFiltroProp(p.id)}>
              {p.nome.split(' ')[0]}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-sm" onClick={gerarPDF} disabled={generating}>
          <i className="ti ti-file-type-pdf" /> {generating ? 'Gerando...' : 'Gerar PDF'}
        </button>
      </div>

      {/* ── Resumo Geral ── */}
      {tab === 0 && (
        <div>
          <div>
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
                {indicesGerais.map(k => (
                  <div key={k.l} className="row">
                    <span className="row-label">{k.l}</span>
                    <span className="row-value" style={{ color: k.ok?'#1E55B0':'#791F1F' }}>{k.v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fase 8 — Conciliação de rebanho: o número que um sócio/contador
                procura primeiro num fechamento. Linha a linha, com checagem
                visual de que abertura + movimentações bate com o fechamento
                real (nunca confia sem mostrar a conta). */}
            {dataAberturaCiclo && dataFechamentoCiclo && (
              <div className="card" style={{ marginBottom:14 }}>
                <div className="card-title"><i className="ti ti-clipboard-list"/> Conciliação de rebanho</div>
                <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:12 }}>
                  Período do ciclo: {fmtData(dataAberturaCiclo)} a {fmtData(dataFechamentoCiclo)}
                </div>
                <div className="table-wrap" style={{ border:'none' }}>
                  <table>
                    <tbody>
                      <tr>
                        <td>Inventário de abertura ({fmtData(dataAberturaCiclo)})</td>
                        <td style={{ textAlign:'right', fontWeight:600 }}>{inventarioAbertura.length}</td>
                      </tr>
                      <tr>
                        <td>+ Nascimentos</td>
                        <td style={{ textAlign:'right', color:'#1E55B0' }}>{nascimentosPeriodo}</td>
                      </tr>
                      <tr>
                        <td>+ Compras</td>
                        <td style={{ textAlign:'right', color:'#1E55B0' }}>{comprasPeriodo.length}</td>
                      </tr>
                      <tr>
                        <td>− Mortes</td>
                        <td style={{ textAlign:'right', color:'#791F1F' }}>{mortesPeriodo.length}</td>
                      </tr>
                      <tr>
                        <td>− Vendas</td>
                        <td style={{ textAlign:'right', color:'#791F1F' }}>{vendasPeriodo.length}</td>
                      </tr>
                      <tr style={{ borderTop:'1.5px solid #E5E7EB', fontWeight:700 }}>
                        <td>= Inventário de fechamento (calculado)</td>
                        <td style={{ textAlign:'right' }}>{fechamentoCalculado}</td>
                      </tr>
                      <tr>
                        <td style={{ fontSize:'.85rem', color:'#6B7280' }}>Inventário de fechamento ({fmtData(dataFechamentoCiclo)}, contagem direta)</td>
                        <td style={{ textAlign:'right', fontWeight:600 }}>{inventarioFechamento.length}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {conciliacaoFecha ? (
                  <AlertBox type="green" icon="ti-circle-check" title="Concilia"
                    body="O inventário calculado (abertura + nascimentos + compras − mortes − vendas) bate exatamente com a contagem real de fechamento." />
                ) : (
                  <AlertBox type="red" icon="ti-alert-triangle" title="Não concilia"
                    body={`Diferença de ${Math.abs(fechamentoCalculado - inventarioFechamento.length)} animal(is) entre o calculado e a contagem real de fechamento — revise lançamentos de compra/venda/morte no período do ciclo.`} />
                )}
                {conciliacaoPorCategoria.length > 0 && (
                  <div style={{ marginTop:14 }}>
                    <div className="sl" style={{ marginBottom:8 }}>Por categoria</div>
                    <div className="table-wrap" style={{ border:'none' }}>
                      <table>
                        <thead><tr><th>Categoria</th><th style={{ textAlign:'right' }}>Abertura</th><th style={{ textAlign:'right' }}>Fechamento</th></tr></thead>
                        <tbody>
                          {conciliacaoPorCategoria.map(row => (
                            <tr key={row.cat}>
                              <td>{row.cat}</td>
                              <td style={{ textAlign:'right' }}>{row.abertura}</td>
                              <td style={{ textAlign:'right' }}>{row.fechamento}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {/* Evolução do rebanho vs ciclo anterior (item 3d) */}
                {cicloAnterior && evolucaoRebanho != null && (
                  <div style={{ marginTop:14, fontSize:'.85rem', color:'#374151' }}>
                    Evolução vs ciclo anterior ({cicloAnterior.nome}, fechamento {inventarioFechamentoAnterior}): {' '}
                    <strong style={{ color: evolucaoRebanho >= 0 ? '#1E55B0' : '#791F1F' }}>
                      {evolucaoRebanho >= 0 ? '+' : ''}{evolucaoRebanho} animal{Math.abs(evolucaoRebanho)!==1?'is':''}
                    </strong>
                  </div>
                )}
              </div>
            )}

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
          <div>
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
                        {/* Fase 8 (Etapa E) — 2+ estações (ou 1 estação + avulsos) no
                            ciclo: lotes agrupados por estação de monta, com subtotal
                            (matrizes distintas daquela estação) antes do total do ciclo.
                            Com 1 grupo só, cai no fallback flat de sempre (mesmo output
                            de antes da Etapa E). */}
                        {mostrarEstacoes ? gruposEstacao.flatMap(g => {
                          const key = g.estacao?.id || '_avulsos'
                          return [
                            <tr key={`h-${key}`} style={{ background:'#F9FAFB' }}>
                              <td colSpan={7} style={{ fontWeight:600, color:'#374151', fontSize:'.8rem', padding:'6px 8px' }}>
                                {g.estacao ? g.estacao.nome : 'Avulsos (sem estação vinculada)'}
                                {g.estacao && <span style={{ fontWeight:400, color:'#9CA3AF', marginLeft:6 }}>{fmtData(g.estacao.inicio)} a {fmtData(g.estacao.fim)}</span>}
                              </td>
                            </tr>,
                            ...g.lotesEstacao.map(renderLoteRow),
                            <tr key={`st-${key}`} style={{ borderTop:'.5px solid #E5E7EB' }}>
                              <td colSpan={3} style={{ fontSize:'.75rem', color:'#9CA3AF', fontStyle:'italic' }}>Subtotal {g.estacao?.nome || 'avulsos'}</td>
                              <td style={{ fontSize:'.85rem' }}>{g.idx.kpiIns}</td>
                              <td style={{ color:'#1E55B0', fontSize:'.85rem' }}>{g.idx.kpiPrn}</td>
                              <td style={{ fontSize:'.85rem' }}>{g.idx.txPrenhez!=null?`${g.idx.txPrenhez}%`:'—'}</td>
                              <td></td>
                            </tr>,
                          ]
                        }) : lotes.map(renderLoteRow)}
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
              <div className="sl" style={{ marginBottom:12 }}>
                Índices reprodutivos — {mostrarEstacoes ? `consolidado do ciclo ${cicloLocal?.nome}` : `ciclo ${cicloLocal?.nome}`}
              </div>
              {indicesReprodutivos.map(k => (
                <div key={k.l} className="row">
                  <span className="row-label">{k.l}</span>
                  <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span className="row-value" style={{ color: k.ok?'#1E55B0':'#791F1F' }}>{k.v}</span>
                    <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>meta: {k.meta} {k.ok?'✓':'↑'}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Fase 8 (Etapa E) — detalhe por estação de monta, só quando o
                ciclo tem mais de 1 grupo (2+ estações, ou 1 estação + avulsos).
                Mesmas funções puras do consolidado acima, escopadas por
                lotesEstacao (calcIndicesDeLotes) — nunca uma 2ª fórmula. */}
            {mostrarEstacoes && (
              <div className="card" style={{ marginTop:14 }}>
                <div className="sl" style={{ marginBottom:12 }}>Índices por estação de monta</div>
                <div className="table-wrap" style={{ border:'none' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Estação</th>
                        <th style={{ textAlign:'right' }}>Expostas</th>
                        <th style={{ textAlign:'right' }}>Prenhas</th>
                        <th style={{ textAlign:'right' }}>Tx prenhez</th>
                        <th style={{ textAlign:'right' }}>Partos</th>
                        <th style={{ textAlign:'right' }}>Tx parição</th>
                        <th style={{ textAlign:'right' }}>Ef. gestacional</th>
                        <th style={{ textAlign:'right' }}>Perda gest.</th>
                        <th style={{ textAlign:'right' }}>Mortalidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gruposEstacao.map(g => (
                        <tr key={g.estacao?.id || '_avulsos'}>
                          <td><strong>{g.estacao?.nome || 'Avulsos'}</strong></td>
                          <td style={{ textAlign:'right' }}>{g.idx.kpiIns}</td>
                          <td style={{ textAlign:'right', color:'#1E55B0' }}>{g.idx.kpiPrn}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.txPrenhez!=null?`${g.idx.txPrenhez}%`:'—'}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.partosArr.length}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.txParicao!=null?`${g.idx.txParicao}%`:'—'}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.txEficiencia!=null?`${g.idx.txEficiencia}%`:'—'}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.txPerdaGestacional!=null?`${g.idx.txPerdaGestacional}%`:'—'}</td>
                          <td style={{ textAlign:'right' }}>{g.idx.txMortalidade!=null?`${g.idx.txMortalidade}%`:'—'}</td>
                        </tr>
                      ))}
                      <tr className="tr-total">
                        <td>Consolidado do ciclo</td>
                        <td style={{ textAlign:'right' }}>{kpiIns}</td>
                        <td style={{ textAlign:'right', color:'#1E55B0' }}>{kpiPrn}</td>
                        <td style={{ textAlign:'right' }}>{txPrenhez!=null?`${txPrenhez}%`:'—'}</td>
                        <td style={{ textAlign:'right' }}>{partosKpiArr.length}</td>
                        <td style={{ textAlign:'right' }}>{txParicaoNova!=null?`${txParicaoNova}%`:'—'}</td>
                        <td style={{ textAlign:'right' }}>{txEficienciaGestacional!=null?`${txEficienciaGestacional}%`:'—'}</td>
                        <td style={{ textAlign:'right' }}>{txPerdaGestacional!=null?`${txPerdaGestacional}%`:'—'}</td>
                        <td style={{ textAlign:'right' }}>{txMortalidade!=null?`${txMortalidade}%`:'—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Financeiro ── */}
      {tab === 2 && (
        <div>
          <div>
            <div className="card" style={{ marginBottom:14 }}>
              <PrintHeader titulo="Relatório Financeiro" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:14 }}>
                {[
                  { v:fmtMoeda(rec),  l:'Receitas',  c:'#1E55B0', bg:'#E8F0FC' },
                  { v:fmtMoeda(desp), l:'Despesas',  c:'#791F1F', bg:'#FCEBEB' },
                  { v:fmtMoeda(Math.abs(resu)), l:resu>=0?'Resultado positivo':'Resultado negativo', c:resu>=0?'#2B6CD9':'#791F1F', bg:resu>=0?'#E8F0FC':'#FCEBEB' },
                  { v:saldoAnteriorCiclo!=null?fmtMoeda(saldoAnteriorCiclo):'…', l:'Saldo anterior', c:'#7B2FBE', bg:'#F3E8FF' },
                  { v:caixaAcumulado!=null?fmtMoeda(caixaAcumulado):'…', l:'Caixa acumulado', c:'#7B2FBE', bg:'#F3E8FF' },
                ].map(k => (
                  <div key={k.l} style={{ background:k.bg, borderRadius:8, padding:'12px', textAlign:'center' }}>
                    <div style={{ fontSize:'1.1rem', fontWeight:700, color:k.c }}>{k.v}</div>
                    <div style={{ fontSize:'.72rem', color:k.c, opacity:.8, marginTop:2 }}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div className="sl">Receitas por grupo</div>
              {gruposPorValor(lancs, 'R', filtroProp).map(({ grupo, valor }) => (
                <div key={grupo} className="row">
                  <span className="row-label">{grupo}</span>
                  <span className="row-value" style={{ color:'#1E55B0' }}>{fmtMoeda(valor)}</span>
                </div>
              ))}
              <div className="sl" style={{ marginTop:12 }}>Despesas por grupo</div>
              {gruposPorValor(lancs, 'D', filtroProp).map(({ grupo, valor }) => (
                <div key={grupo} className="row">
                  <span className="row-label">{grupo}</span>
                  <span className="row-value" style={{ color:'#791F1F' }}>{fmtMoeda(valor)}</span>
                </div>
              ))}
            </div>
            {resultadoPorProp.length > 1 && (
              <div className="card" style={{ marginBottom:14 }}>
                <div className="sl" style={{ marginBottom:10 }}>Resultado por proprietário</div>
                <div className="table-wrap" style={{ border:'none' }}>
                  <table>
                    <thead><tr><th>Proprietário</th><th style={{ textAlign:'right' }}>Receitas</th><th style={{ textAlign:'right' }}>Despesas</th><th style={{ textAlign:'right' }}>Resultado</th></tr></thead>
                    <tbody>
                      {resultadoPorProp.map(p => (
                        <tr key={p.nome}>
                          <td><strong>{p.nome}</strong></td>
                          <td style={{ textAlign:'right', color:'#1E55B0' }}>{fmtMoeda(p.rec)}</td>
                          <td style={{ textAlign:'right', color:'#791F1F' }}>{fmtMoeda(p.desp)}</td>
                          <td style={{ textAlign:'right', fontWeight:600, color: p.resu>=0?'#1E55B0':'#791F1F' }}>{fmtMoeda(p.resu)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="card">
              <div className="sl" style={{ marginBottom:10 }}>Indicadores de rentabilidade</div>
              {indicadoresRentabilidade.map(k => (
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
