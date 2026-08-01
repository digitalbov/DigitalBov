import { useState, useEffect, useRef, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { db } from '../lib/supabase'
import { fmtMoeda, fmtData, GRUPOS_REC, GRUPOS_DES, valorPropLanc, calcResultadoFinanceiro, numeroPositivo, algumErro, calcCategoriaRebanho, CATEGORIAS_VALOR, estimarDataNascimentoPorCategoria, CATS_ESTOQUE, GRUPO_SUGERIDO_POR_CATEGORIA, capitalizarPrimeira, capitalizarNome, gruposPorValor, parsePesoIndividual, pesoIndividualInvalido, PESO_INDIVIDUAL_MAX_KG, GESTACAO_ANGUS_DIAS, desfechoReprodutivo, FALHA_MOTIVO_LABEL } from '../lib/helpers'
import { validarSaldoEstoque, aplicarMovimentacaoEstoque, reverterCascata, buscarMovsVinculadas, criarLancamentoRateado, carregarGruposExtras, gruposDisponiveis as gruposDisponiveisShared, comGrupoExtra } from '../lib/estoqueFinanceiro'
import { derivarDatasGestacao, criarPrenhezAdquirida, PRENHEZ_ADQUIRIDA_LABEL } from '../lib/prenhezAdquirida'
import RateioProprietarios from '../components/RateioProprietarios'
import GrupoSelect from '../components/GrupoSelect'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento, BadgeSomenteLeitura, Confirm } from '../components/UI'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo, STATUS_CICLO_LABEL } from '../lib/CicloContext'

const TABS = ['Resumo','Lançamentos','Compra & Venda','Resultados','Parâmetros','Ciclos','Simulações']

// Peso em kg pra exibição na demonstração de cálculo (Bloco D12) — inteiro
// sem casas decimais soltas (ex: "160"), só cai pra 1 casa quando o valor
// realmente tem fração (ex: média de pesos individuais "399.9").
const fmtKg = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// Barra horizontal em HTML/CSS puro (não recharts/SVG) — o nome do grupo é
// texto normal, que quebra linha sozinho em vez de ser cortado pelo eixo de
// um gráfico. Precisa suportar grupo digitado à mão pelo usuário (texto
// livre em Financeiro, pode ser longo) sem nunca truncar com reticências.
function BarraGrupo({ grupo, valor, maxValor, cor }) {
  const pct = maxValor > 0 ? Math.max(2, Math.round(valor / maxValor * 100)) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:'.78rem', marginBottom:3 }}>
        <span style={{ color:'#374151', wordBreak:'break-word' }}>{grupo}</span>
        <span style={{ color:cor, fontWeight:600, whiteSpace:'nowrap' }}>{fmtMoeda(valor)}</span>
      </div>
      <div style={{ background:'#F3F4F6', borderRadius:4, height:8, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:cor, borderRadius:4 }} />
      </div>
    </div>
  )
}

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
  const [filtTransacTipo,        setFiltTransacTipo]        = useState('')
  const [filtTransacCategoria,   setFiltTransacCategoria]   = useState('')
  const [filtTransacContraparte, setFiltTransacContraparte] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [lancsPorCiclo,     setLancsPorCiclo]     = useState({})
  const [loadingResultados, setLoadingResultados] = useState(false)
  const [gruposExtras, setGruposExtras] = useState({ R: [], D: [] })
  const [itensEstoque, setItensEstoque] = useState([])
  const [animaisAtivos, setAnimaisAtivos] = useState([])
  const [lotes,       setLotes]       = useState([])
  // Item 7 — dados reprodutivos (inseminações/partos/abortos), carregados sob
  // demanda só quando o modal de venda abre (nunca no load geral da tela: a
  // maioria das visitas a Financeiro não mexe em venda) — usados pelos
  // filtros "sem cria" e "aborto registrado" abaixo.
  const [reprodutivoVenda, setReprodutivoVenda] = useState(null)
  const [carregandoReprodVenda, setCarregandoReprodVenda] = useState(false)
  // Item 8 — estações de monta do ciclo da compra, carregadas sob demanda só
  // pro seletor de "Prenhez adquirida" (compra de vaca já prenha). Recarrega
  // sempre que o ciclo da data da compra muda.
  const [estacoesCompra, setEstacoesCompra] = useState([])
  const [transacaoExpandida, setTransacaoExpandida] = useState(null)
  const [itensPorTransacao,  setItensPorTransacao]  = useState({})
  const [carregandoItens,   setCarregandoItens]     = useState(false)
  const [confirmDelLanc,    setConfirmDelLanc]      = useState(null)
  const [estoqueDoLancDel,  setEstoqueDoLancDel]     = useState([]) // movs de estoque vinculadas ao lanc em confirmDelLanc (Bloco D10)
  const [simulacoes,        setSimulacoes]          = useState([])
  const [confirmDelSim,     setConfirmDelSim]       = useState(null)
  // Bloco D11 — saldo anterior (caixa acumulado de ciclos passados), sempre
  // buscado do banco (nunca cache local) — ver db.ciclos.saldoAnterior.
  const [saldoAnteriorCiclo,   setSaldoAnteriorCiclo]   = useState(null)
  const [saldosPorCiclo,       setSaldosPorCiclo]       = useState({})
  const [loadingSaldosCiclos,  setLoadingSaldosCiclos]  = useState(false)

  const { podeEditar } = usePermissoes()
  const podeEditarFinanceiro = podeEditar('financeiro')
  // Bloco D10 — integração Estoque <-> Financeiro (caminhos 2/3) exige as
  // DUAS permissões: sem uma delas, nem o checkbox aparece no formulário.
  const podeEditarEstoque = podeEditar('estoque')
  const { contaAtual } = useConta()
  const { fazendaAtual } = useFazenda()
  const { cicloDaData, dataEhEditavel, cicloSelecionado: cicloLocal, ciclos, cicloAtual } = useCiclo()
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarFinCiclo = podeEditarFinanceiro && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  useEffect(() => { loadBase() }, [])
  useEffect(() => { if (cicloLocal) loadCiclo() }, [cicloLocal?.id])
  useEffect(() => { if (tab === 3 && ciclos.length > 0) loadResultadosPorCiclo() }, [tab, ciclos.length, filtProp])

  // Item 5 — carrega estações de monta + lotes (histórico completo, sem
  // escopo de ciclo: a última estação pode ser de qualquer ciclo) só quando o
  // modal de venda é aberto pela 1ª vez nesta visita à tela — nunca no
  // loadBase() geral. Determina aqui a "última estação de monta" da fazenda —
  // a mais recente (maior inicio) que já tem PELO MENOS 1 diagnóstico
  // registrado num dos seus lotes. Estação em andamento sem nenhum
  // diagnóstico ainda não conta: não há o que descartar dela.
  useEffect(() => {
    if (modal !== 'transac' || !(form.tipo === 'V' || form.tipo === 'venda_sim')) return
    if (reprodutivoVenda || carregandoReprodVenda) return
    setCarregandoReprodVenda(true)
    Promise.all([
      db.estacoesMonta.listAll(),
      db.lotesInseminacao.listParaDescarte(),
    ]).then(([re, rl]) => {
      const estacoes = re.data || []
      const lotes    = rl.data || []
      const lotesPorEstacao = new Map()
      lotes.forEach(l => {
        if (!lotesPorEstacao.has(l.estacao_monta_id)) lotesPorEstacao.set(l.estacao_monta_id, [])
        lotesPorEstacao.get(l.estacao_monta_id).push(l)
      })
      const temDiagnostico = (estId) =>
        (lotesPorEstacao.get(estId) || []).some(l => (l.inseminacoes || []).some(i => i.diagnostico))
      const ultimaEstacao = [...estacoes]
        .filter(es => temDiagnostico(es.id))
        .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''))[0] || null
      const lotesUltimaEstacao = ultimaEstacao ? (lotesPorEstacao.get(ultimaEstacao.id) || []) : []
      // Achatado uma vez aqui (todos os lotes da estação juntos) — o desfecho
      // é da VACA NA ESTAÇÃO, não do lote: uma vaca pode ter diagnóstico 'V'
      // na IATF e 'P' no repasse (mesma estação, lotes diferentes). Cada
      // inseminação carrega lote.data (a data da MONTA, não do diagnóstico)
      // — desfechoReprodutivo (helpers.js) precisa disso pra calcular o prazo
      // de perda gestacional presumida.
      setReprodutivoVenda({
        ultimaEstacao,
        inseminacoesUltimaEstacao: lotesUltimaEstacao.flatMap(l =>
          (l.inseminacoes || []).map(i => ({ ...i, lote: { data: l.data } }))),
        partosUltimaEstacao:  lotesUltimaEstacao.flatMap(l => l.partos  || []),
        abortosUltimaEstacao: lotesUltimaEstacao.flatMap(l => l.abortos || []),
      })
      setCarregandoReprodVenda(false)
    })
  }, [modal, form.tipo, reprodutivoVenda, carregandoReprodVenda])

  // Item 8 — estações de monta do ciclo da data de compra, pro seletor do
  // bloco opcional "Prenhez adquirida" (compra de vaca já prenha). Recarrega
  // quando o ciclo muda (troca de data) — lista pequena, sem custo relevante.
  useEffect(() => {
    if (modal !== 'transac' || !(form.tipo === 'C' || form.tipo === 'compra_sim') || !form.data) return
    const ciclo = cicloDaData(form.data)
    if (!ciclo) { setEstacoesCompra([]); return }
    let cancelado = false
    db.estacoesMonta.list(ciclo.id).then(({ data }) => { if (!cancelado) setEstacoesCompra(data || []) })
    return () => { cancelado = true }
  }, [modal, form.tipo, form.data])

  // Bloco D11 — saldo anterior do ciclo exibido no Resumo (faixa do ciclo +
  // card "Caixa disponível"). Sempre recalculado no banco a cada troca de
  // ciclo/proprietário — nunca guardado em estado que sobrevive à troca.
  useEffect(() => {
    if (!cicloLocal) { setSaldoAnteriorCiclo(null); return }
    let cancelado = false
    db.ciclos.saldoAnterior(cicloLocal.id, filtProp || null).then(({ data, error }) => {
      if (cancelado) return
      if (error) { console.error('[Financeiro] erro ao buscar saldo anterior:', error); setSaldoAnteriorCiclo(null); return }
      setSaldoAnteriorCiclo(Number(data) || 0)
    })
    return () => { cancelado = true }
  }, [cicloLocal?.id, filtProp])

  // Busca os lançamentos de TODOS os ciclos (usado só na aba Resultados, para
  // comparar receita/despesa/resultado de cada ciclo lado a lado)
  const loadResultadosPorCiclo = async () => {
    setLoadingResultados(true)
    const pares = await Promise.all(ciclos.map(async c => {
      const { data, error } = await db.lancamentos.list(c.id)
      if (error) console.error(`[Financeiro] erro ao buscar lançamentos do ciclo ${c.nome}:`, error)
      return [c.id, data || []]
    }))
    setLancsPorCiclo(Object.fromEntries(pares))
    setLoadingResultados(false)

    // Bloco D11 — saldo anterior de cada ciclo, para as colunas "Saldo
    // anterior"/"Caixa acumulado" da tabela abaixo. Consulta separada (é
    // agregado no banco, não dá pra derivar de lancsPorCiclo) — refeita
    // sempre que filtProp muda, já que o resultado por proprietário depende
    // do rateio, calculado no próprio banco.
    setLoadingSaldosCiclos(true)
    const paresSaldo = await Promise.all(ciclos.map(async c => {
      const { data, error } = await db.ciclos.saldoAnterior(c.id, filtProp || null)
      if (error) console.error(`[Financeiro] erro ao buscar saldo anterior do ciclo ${c.nome}:`, error)
      return [c.id, error ? null : (Number(data) || 0)]
    }))
    setSaldosPorCiclo(Object.fromEntries(paresSaldo))
    setLoadingSaldosCiclos(false)
  }

  const loadBase = async () => {
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.categoriasPreco.list(), db.proprietarios.list(),
        db.estoque.list(), db.animais.list({ situacao:'ativo' }), db.lotes.list(),
        // Grupos "personalizados" (fora da lista fixa GRUPOS_REC/GRUPOS_DES) já
        // usados em algum lançamento — a mesma função (estoqueFinanceiro.js) que
        // o Estoque usa, pra garantir que os dois lugares mostram a MESMA lista.
        carregarGruposExtras(),
      ])
      if (algumErro('[Financeiro]', results)) { setLoadError(true); return }
      const [rcp, rp, rItensEstoque, rAnimais, rLotes, rGrupos] = results
      setCatPrecos(rcp.data || [])
      setProps(rp.data || [])
      setItensEstoque(rItensEstoque.data || [])
      setAnimaisAtivos(rAnimais.data || [])
      setLotes(rLotes.data || [])
      setGruposExtras(rGrupos.extras)
    } catch (e) {
      console.error('[Financeiro] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const gruposDisponiveis = (tipo) => gruposDisponiveisShared(tipo, gruposExtras)

  // ── Bloco D10 — coerência quantidade × unitário ↔ total (caminho 2, entrada
  // de estoque via despesa). O "Total" É o próprio campo Valor (R$) do
  // lançamento — não existe um campo Total separado. Editar quantidade ou
  // unitário recalcula o total; editar o total (ex: veio de nota fiscal)
  // recalcula o unitário — nas duas direções, sempre os três coerentes.
  const setEstoqueQuantidade = (v) => setForm(p => {
    const qtd = parseFloat(v) || 0, unit = parseFloat(p.estoqueUnitario) || 0
    return { ...p, estoqueQuantidade: v, valor: (qtd > 0 && unit > 0) ? (qtd * unit).toFixed(2) : p.valor }
  })
  const setEstoqueUnitario = (v) => setForm(p => {
    const qtd = parseFloat(p.estoqueQuantidade) || 0, unit = parseFloat(v) || 0
    return { ...p, estoqueUnitario: v, valor: (qtd > 0 && unit > 0) ? (qtd * unit).toFixed(2) : p.valor }
  })
  const setValorLanc = (v) => setForm(p => {
    if (!p.criarEntradaEstoque) return { ...p, valor: v }
    const qtd = parseFloat(p.estoqueQuantidade) || 0
    return { ...p, valor: v, estoqueUnitario: qtd > 0 ? (parseFloat(v || 0) / qtd).toFixed(2) : p.estoqueUnitario }
  })

  // Não existe "editar lançamento" nesta tela (só criar/excluir), então este
  // form sempre é de um lançamento NOVO: pode preencher a data com hoje() sem
  // risco de sobrescrever uma data já gravada.
  const abrirModalLanc = () => {
    setForm({ data: hojeISO(), rateios: props.map(p => ({ proprietario_id: p.id, percentual: '', valor: '' })) })
    setModal('lanc')
  }

  // form é compartilhado com o modal de lançamento — sem resetar aqui, tipo
  // podia ficar 'D'/'R' (sobra do outro modal) ou undefined (primeira vez),
  // nunca 'V' de fato, mesmo com o <select> exibindo "Venda" por causa do
  // fallback visual (value={form.tipo||'V'}). Isso fazia o painel de venda
  // nunca renderizar (ver histórico do Bloco D2 pra mais detalhes do bug).
  const abrirModalTransac = () => {
    setForm({ tipo: 'V', data: hojeISO() })
    setModal('transac')
  }

  // Efeito colateral de excluir um lançamento — venda reativa animais, compra
  // apaga os cadastrados por ela. Usado só pra avisar no texto de confirmação;
  // a reversão de verdade é feita pelo trigger no banco (reverter_venda_ao_excluir_lancamento).
  const efeitosExclusaoLanc = (lancId) => {
    const doLanc = transacs.filter(t => t.lancamento_id === lancId)
    return {
      vendaQtd:  doLanc.filter(t => t.tipo === 'V').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0),
      compraQtd: doLanc.filter(t => t.tipo === 'C').reduce((s, t) => s + (parseInt(t.quantidade) || 0), 0),
    }
  }

  // Busca fresca (não confia em cache local) só pra mostrar o efeito exato
  // ANTES do usuário confirmar — a checagem que de fato vale (e bloqueia) é
  // feita de novo dentro de reverterCascata, na hora de excluir.
  const abrirConfirmExcluirLanc = async (l) => {
    const { data } = await buscarMovsVinculadas({ lancamentoId: l.id })
    setEstoqueDoLancDel(data || [])
    setConfirmDelLanc(l)
  }

  const excluirLanc = async (id) => {
    if (!podeEditarFinCiclo) return
    // Caminhos 2/3 (Bloco D10) — reverte o estoque vinculado ANTES de excluir
    // o lançamento, via reverterCascata (módulo compartilhado, mesma função
    // usada por Sanidade.jsx e por Estoque.jsx do outro lado). checarCicloEditavel
    // confere o ciclo do lado do Estoque também, não só o lado que está excluindo.
    const rev = await reverterCascata({
      lancamentoId: id, itensEstoque, podeEditarEstoque,
      checarCicloEditavel: (data) => dataEhEditavel(data),
    })
    if (!rev.ok) { toast(rev.erro, 'error'); return }

    const { error } = await db.lancamentos.delete(id)
    // O trigger de reversão (ver reverter_venda_ao_excluir_lancamento) pode
    // abortar a exclusão com uma mensagem específica (ex: animal com pesagem
    // registrada depois da compra) — mostra ela em vez de um erro genérico.
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Removido.' + (rev.movs.length ? ' Estoque revertido.' : ''))
    loadCiclo()
    // A exclusão pode ter reativado (venda) ou apagado (compra) animais via
    // trigger no banco — recarrega a lista de ativos pra refletir isso na tela de Venda.
    const { data: rAnimais } = await db.animais.list({ situacao:'ativo' })
    setAnimaisAtivos(rAnimais || [])
    if (rev.movs.length) {
      const { data: rItens } = await db.estoque.list()
      setItensEstoque(rItens || [])
    }
  }

  const loadCiclo = async () => {
    if (!cicloLocal) return
    try {
      const results = await Promise.all([
        db.lancamentos.list(cicloLocal.id), db.transacoes.list(cicloLocal.id), db.simulacoes.list(),
      ])
      if (algumErro('[Financeiro]', results)) { setLoadError(true); return }
      const [rl, rt, rs] = results
      setLancs(rl.data  || [])
      setTransacs(rt.data || [])
      setSimulacoes(rs.data || [])
    } catch (e) {
      console.error('[Financeiro] erro ao carregar ciclo:', e)
      setLoadError(true)
    }
  }

  const { receita: rec, despesa: desp, resultado: resu } = calcResultadoFinanceiro(lancs, filtProp)

  // ── Filtros da aba Compra & Venda — combináveis (tipo + categoria +
  // contraparte). Categoria/contraparte são dropdowns populados com os
  // valores que já existem em `transacs` (não uma lista fixa), então nunca
  // mostram opção sem transação nenhuma.
  const categoriasTransac   = [...new Set(transacs.map(t => t.categoria).filter(Boolean))].sort()
  const contrapartesTransac = [...new Set(transacs.map(t => t.contraparte).filter(Boolean))].sort()
  const transacsFiltradas = transacs.filter(t =>
    (!filtTransacTipo        || t.tipo        === filtTransacTipo) &&
    (!filtTransacCategoria   || t.categoria   === filtTransacCategoria) &&
    (!filtTransacContraparte || t.contraparte === filtTransacContraparte)
  )

  // ── Venda real (tipo === 'V'): seleção de animais + preço por categoria ──
  // Categoria é sempre calcCategoriaRebanho (as mesmas 14 categorias comerciais
  // de Rebanho/Dashboard/Relatorios — CATEGORIAS_VALOR), sem override manual:
  // peso médio e preço/kg já são editáveis por categoria nesta mesma tela, então
  // vender um animal por um preço diferente do padrão da categoria não precisa
  // de uma categoria "fake" — só de ajustar o peso/preço daquela categoria.
  const categoriaReal = (a) => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
  const categoriasComAtivos = [...new Set(animaisAtivos.map(categoriaReal))].sort()
  const vendaFiltroCategoria    = form.vendaFiltroCategoria    || ''
  const vendaFiltroProprietario = form.vendaFiltroProprietario || ''
  const vendaFiltroLote         = form.vendaFiltroLote         || ''
  // Item 5 — "Falhada" é guarda-chuva (não emprenhou / aborto / perda
  // gestacional), com opção de pegar todas de uma vez — ver
  // vendaFiltroFalhadaMotivos abaixo.
  const vendaFiltroFalhadaMotivos = form.vendaFiltroFalhadaMotivos || []
  const vendaFiltroTodasFalhadas  = !!form.vendaFiltroTodasFalhadas
  const vendaSelecionados = form.vendaSelecionados || []

  // Item 5 — seleção de DESCARTE: o desfecho CONSOLIDADO da vaca na ÚLTIMA
  // ESTAÇÃO DE MONTA inteira, nunca lote a lote e nunca a situação reprodutiva
  // atual — reaproveita desfechoReprodutivo (helpers.js), a MESMA função usada
  // no status "Falhada" da sequência do lote e da ficha do animal
  // (Reprodutivo.jsx/Animais.jsx) — não duplicar essa lógica aqui. "Falhada" é
  // guarda-chuva: não entregou terneiro na estação, qualquer que seja o
  // motivo — quem pariu não é falhada, mesmo tendo falhado numa tentativa
  // anterior da mesma estação (isso já vem de graça de desfechoReprodutivo).
  const motivoFalhaUltimaEstacao = (animalId) => {
    if (!reprodutivoVenda?.ultimaEstacao) return null
    const d = desfechoReprodutivo(animalId, {
      inseminacoes: reprodutivoVenda.inseminacoesUltimaEstacao,
      partos:       reprodutivoVenda.partosUltimaEstacao,
      abortos:      reprodutivoVenda.abortosUltimaEstacao,
    })
    return d.resultado === 'falhou' ? d.motivo : null
  }
  // Nunca oferece pra venda um animal que ainda nem tinha nascido na data da
  // venda (bug real já visto em produção: 32 animais vendidos meses antes de
  // nascer, porque nada aqui comparava data_nascimento com a data escolhida).
  // Sem form.data ainda, não filtra por data (deixa o usuário escolher a data
  // primeiro) — sem data_nascimento cadastrada, também não filtra (não dá pra
  // provar que é inválido).
  const animaisFiltradosVenda = animaisAtivos.filter(a => {
    if (vendaFiltroCategoria && categoriaReal(a) !== vendaFiltroCategoria) return false
    if (vendaFiltroProprietario && a.proprietario_id !== vendaFiltroProprietario) return false
    if (vendaFiltroLote && a.lote_id !== vendaFiltroLote) return false
    if (form.data && a.data_nascimento && a.data_nascimento > form.data) return false
    if (vendaFiltroTodasFalhadas || vendaFiltroFalhadaMotivos.length > 0) {
      const motivo = motivoFalhaUltimaEstacao(a.id)
      if (!motivo) return false
      if (!vendaFiltroTodasFalhadas && !vendaFiltroFalhadaMotivos.includes(motivo)) return false
    }
    return true
  })
  const animaisSelecionadosObjs = animaisAtivos.filter(a => vendaSelecionados.includes(a.id))
  const categoriasNaSelecaoVenda = [...new Set(
    animaisSelecionadosObjs.map(categoriaReal)
  )].sort()
  const vendaPrecos = form.vendaPrecos || {}
  // Bloco D12 — peso individual por animal (opcional): quem tem peso digitado
  // usa esse peso; quem não tem usa o peso médio da categoria (vendaPrecos,
  // igual a antes). peso_medio_resultante é só exibição (total ÷ qtd) — o
  // valor de verdade (peso_medio da categoria) é gravado como fallback pela
  // própria RPC, que recalcula o resultante no servidor.
  const vendaPesosIndividuais = form.vendaPesosIndividuais || {}
  const resumoPorCategoriaVenda = categoriasNaSelecaoVenda.map(cat => {
    const animaisDaCategoria = animaisSelecionadosObjs.filter(a => categoriaReal(a) === cat)
    const qtd   = animaisDaCategoria.length
    const peso  = numeroPositivo(vendaPrecos[cat]?.peso_medio)
    const preco = numeroPositivo(vendaPrecos[cat]?.preco_kg)
    const pesosIndividuais = animaisDaCategoria.map(a => parsePesoIndividual(vendaPesosIndividuais[a.id]))
    const qtdComPesoIndividual = pesosIndividuais.filter(p => p !== null).length
    const qtdComPesoMedio = qtd - qtdComPesoIndividual
    const somaIndividuais = pesosIndividuais.reduce((s, p) => s + (p || 0), 0)
    // Bloco D12.2 — com 100% peso individual (qtdComPesoMedio===0), o peso
    // médio da categoria não é usado nem exigido: pesoTotal vem só dos
    // individuais, mesmo com o campo vazio (não pré-preenchido).
    const pesoTotal = qtdComPesoMedio === 0 ? somaIndividuais : (peso !== null ? somaIndividuais + qtdComPesoMedio * peso : null)
    const pesoResultante = (pesoTotal !== null && qtd > 0) ? pesoTotal / qtd : null
    const subtotal = (pesoTotal !== null && preco) ? pesoTotal * preco : 0
    // Demonstração do cálculo (D12.1) — só mostra as origens de peso que
    // realmente existem na seleção: com 100% peso individual, a linha de
    // peso médio da categoria some (mesmo que o campo esteja preenchido).
    const mediaPesoIndividual = qtdComPesoIndividual > 0 ? somaIndividuais / qtdComPesoIndividual : null
    const valorIndividual = preco !== null ? somaIndividuais * preco : null
    const valorMedio = (preco !== null && peso !== null) ? qtdComPesoMedio * peso * preco : null
    return {
      categoria: cat, quantidade: qtd, peso, preco, subtotal, pesoResultante, qtdComPesoIndividual, qtdComPesoMedio,
      mediaPesoIndividual, valorIndividual, valorMedio,
      animalIdsComPeso: animaisDaCategoria.map((a, i) => ({ id: a.id, peso: pesosIndividuais[i] })),
    }
  })
  const totalVenda = resumoPorCategoriaVenda.reduce((s,r) => s+r.subtotal, 0)

  // Tipo "formato venda" (real ou simulada) e "formato compra" (real ou
  // simulada) — Simular venda/compra reaproveitam a MESMA interface e o mesmo
  // estado da real (vendaSelecionados/vendaPrecos ou compraCategorias); só o
  // destino no Registrar muda (ver salvarSimulacao/confirmarTransacao).
  const ehVendaShape  = form.tipo === 'V' || form.tipo === 'venda_sim'
  const ehCompraShape = form.tipo === 'C' || form.tipo === 'compra_sim'

  // Handler ÚNICO do campo Data — usado tanto no formulário normal (venda/
  // compra reais) quanto no banner de simulação (venda_sim/compra_sim), pra
  // nunca ter duas cópias divergentes da mesma lógica. Revalida a seleção de
  // animais (mesmo em venda_sim, que reaproveita vendaSelecionados/
  // ehVendaShape) — trocar a data DEPOIS de já ter selecionado animais pode
  // deixar a seleção inválida (animal que só nasceu depois da nova data).
  const handleDataChange = e => {
    const novaData = e.target.value
    if (ehVendaShape && novaData) {
      const invalidos = animaisSelecionadosObjs.filter(a => a.data_nascimento && a.data_nascimento > novaData)
      if (invalidos.length > 0) {
        setForm(p => ({
          ...p, data: novaData,
          vendaSelecionados: (p.vendaSelecionados || []).filter(id => !invalidos.some(a => a.id === id)),
        }))
        toast(`${invalidos.length} animal(is) desmarcado(s) por nascer depois da nova data: ${invalidos.map(a => a.brinco).join(', ')}.`, 'error')
        return
      }
    }
    setForm(p => ({ ...p, data: novaData }))
  }

  // Bloco D12.2 — peso médio e preço/kg NÃO são mais pré-preenchidos a partir
  // de categorias_preco: esses valores agora entram no histórico de pesagem e
  // no GMD dos animais (ver pesagens.peso_individual/regra de GMD), e um
  // valor de referência que o usuário não conferiu virava dado inventado no
  // histórico. Os campos nascem vazios — o usuário informa o peso/preço real
  // do negócio. categorias_preco continua alimentando só Parâmetros e o Valor
  // de Mercado do Rebanho; aqui vira só uma DICA visual (hint no Field).

  // ── Compra real/simulada: N categorias, cada uma com quantidade + peso
  // médio + preço/kg + proprietário + data de nascimento estimada. Ao
  // registrar de verdade, cada categoria vira N animais cadastrados em lote.
  const compraCategorias = form.compraCategorias || []
  const adicionarCategoriaCompra = () => {
    setForm(p => ({
      ...p,
      compraCategorias: [...(p.compraCategorias || []), {
        categoria: '', quantidade: 1, peso_medio: '', preco_kg: '',
        proprietario_id: '', data_nascimento_estimada: '',
        pesos_individuais: [''], mostrarPesosIndividuais: false,
      }]
    }))
  }
  // Bloco D12 — mudar a quantidade realinha pesos_individuais pra ter
  // exatamente N posições (mantém o que já tinha digitado em cada posição,
  // corta o excedente, completa vazio o que faltar) — o índice é o que liga
  // cada peso ao "animal #N" que vai ser criado pela RPC.
  const atualizarCategoriaCompra = (idx, patch) => {
    setForm(p => ({
      ...p,
      compraCategorias: p.compraCategorias.map((c, i) => {
        if (i !== idx) return c
        const atualizado = { ...c, ...patch }
        if ('quantidade' in patch) {
          const n = parseInt(patch.quantidade) || 0
          const atuais = c.pesos_individuais || []
          atualizado.pesos_individuais = Array.from({ length: n }, (_, j) => atuais[j] || '')
        }
        return atualizado
      })
    }))
  }
  const setPesoIndividualCompra = (idx, posicao, valor) => {
    setForm(p => ({
      ...p,
      compraCategorias: p.compraCategorias.map((c, i) => {
        if (i !== idx) return c
        const arr = [...(c.pesos_individuais || [])]
        arr[posicao] = valor
        return { ...c, pesos_individuais: arr }
      })
    }))
  }
  const removerCategoriaCompra = (idx) => {
    setForm(p => ({ ...p, compraCategorias: p.compraCategorias.filter((_, i) => i !== idx) }))
  }
  // Garante pelo menos 1 linha assim que o usuário entra no "formato compra".
  useEffect(() => {
    if (ehCompraShape && compraCategorias.length === 0) adicionarCategoriaCompra()
  }, [ehCompraShape])

  const resumoCompra = compraCategorias.map(c => {
    const qtd   = numeroPositivo(c.quantidade)
    const peso  = numeroPositivo(c.peso_medio)
    const preco = numeroPositivo(c.preco_kg)
    // Bloco D12 — mesma lógica da venda: peso individual (por posição) some
    // com o peso médio pros animais sem override, formando o peso total real
    // dessa categoria antes de aplicar o preço/kg.
    const pesosIndividuaisNum = (c.pesos_individuais || []).slice(0, qtd || 0).map(v => parsePesoIndividual(v))
    const qtdComPesoIndividual = pesosIndividuaisNum.filter(p => p !== null).length
    const qtdComPesoMedio = (qtd || 0) - qtdComPesoIndividual
    const somaIndividuais = pesosIndividuaisNum.reduce((s, p) => s + (p || 0), 0)
    // Bloco D12.2 — com 100% peso individual (qtdComPesoMedio===0), o peso
    // médio da categoria não é usado nem exigido: pesoTotal vem só dos
    // individuais, mesmo com o campo vazio (não pré-preenchido).
    const pesoTotal = !qtd ? null : (qtdComPesoMedio === 0 ? somaIndividuais : (peso !== null ? somaIndividuais + qtdComPesoMedio * peso : null))
    const pesoResultante = (pesoTotal !== null && qtd) ? pesoTotal / qtd : null
    const subtotal = (pesoTotal !== null && preco) ? pesoTotal * preco : 0
    // Demonstração do cálculo (D12.1) — mesma lógica da venda: só mostra as
    // origens de peso realmente usadas na seleção.
    const mediaPesoIndividual = qtdComPesoIndividual > 0 ? somaIndividuais / qtdComPesoIndividual : null
    const valorIndividual = preco !== null ? somaIndividuais * preco : null
    const valorMedio = (preco !== null && peso !== null) ? qtdComPesoMedio * peso * preco : null
    return {
      ...c, qtdNum: qtd, pesoNum: peso, precoNum: preco, subtotal, pesoResultante, qtdComPesoIndividual, qtdComPesoMedio,
      mediaPesoIndividual, valorIndividual, valorMedio, pesosIndividuaisNum,
    }
  })
  const totalCompra = resumoCompra.reduce((s, r) => s + r.subtotal, 0)

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
    const valor = numeroPositivo(form.valor)
    if (valor === null) { toast('Valor inválido: informe um número maior que zero.', 'error'); return }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }

    // Caminhos 2/3 (Bloco D10) — vinculação opcional com Estoque, só se as DUAS
    // permissões existem. Tudo validado ANTES de criar o lançamento: se algo
    // estiver incompleto ou o saldo for insuficiente, nada é salvo (nem o
    // lançamento), evitando um lançamento "órfão" sem o vínculo pedido.
    const tipo = form.tipo || 'D'
    const criarEstoque = tipo === 'D' && podeEditarEstoque && form.criarEntradaEstoque
    const baixarEstoque = tipo === 'R' && podeEditarEstoque && form.baixarEstoque

    let estoqueQtd = null, estoqueUnit = null
    if (criarEstoque) {
      estoqueQtd = numeroPositivo(form.estoqueQuantidade)
      if (estoqueQtd === null) { toast('Informe a quantidade da entrada no estoque.', 'error'); return }
      estoqueUnit = numeroPositivo(form.estoqueUnitario)
      if (estoqueUnit === null) { toast('Informe o valor unitário da entrada no estoque.', 'error'); return }
      if (!form.estoqueItemId) { toast('Selecione ou crie um item de estoque.', 'error'); return }
      if (form.estoqueItemId === '__novo__' && (!form.estoqueItemNome || !form.estoqueUnidade)) {
        toast('Informe o nome e a unidade do novo item de estoque.', 'error'); return
      }
    }
    let baixaQtd = null
    if (baixarEstoque) {
      baixaQtd = numeroPositivo(form.estoqueBaixaQuantidade)
      if (baixaQtd === null) { toast('Informe a quantidade a dar baixa no estoque.', 'error'); return }
      if (!form.estoqueBaixaItemId) { toast('Selecione o item de estoque.', 'error'); return }
      const erroSaldo = validarSaldoEstoque(itensEstoque, [{ item_id: form.estoqueBaixaItemId, quantidade: baixaQtd }])
      if (erroSaldo) { toast(erroSaldo, 'error'); return }
    }

    setSaving(true)
    const ciclo = cicloDaData(form.data)

    // Item novo de estoque (Decisão 2 — campos completos, item idêntico ao
    // criado por "Novo item"): criado ANTES do lançamento, com saldo 0 — a
    // quantidade de verdade entra depois via aplicarMovimentacaoEstoque,
    // junto do vínculo lancamento_id, único lugar que ajusta saldo.
    let itemIdParaEntrada = criarEstoque ? form.estoqueItemId : null
    let itensParaEntrada = itensEstoque
    if (criarEstoque && itemIdParaEntrada === '__novo__') {
      const { data: novoItem, error: errItem } = await db.estoque.insert({
        item: capitalizarNome(form.estoqueItemNome), categoria: form.estoqueCategoria || 'Outro',
        unidade: form.estoqueUnidade, quantidade: 0, minimo: numeroPositivo(form.estoqueMinimo) || 0, preco_unit: estoqueUnit,
      })
      if (errItem || !novoItem) {
        setSaving(false); toast('Erro ao criar item de estoque: ' + (errItem?.message || ''), 'error'); return
      }
      itemIdParaEntrada = novoItem.id
      itensParaEntrada = [...itensEstoque, novoItem]
    }

    const { data: lancData, error, avisoRateio } = await criarLancamentoRateado({
      contaId: contaAtual.id, fazendaId: fazendaAtual.id, cicloId: ciclo.id,
      tipo, grupo: form.grupo, descricao: form.descricao, valor, data: form.data,
      rateios: form.rateios, props,
    })
    if (error) { setSaving(false); toast('Erro: ' + error.message, 'error'); return }
    if (avisoRateio) {
      toast('Lançamento salvo, mas houve erro ao salvar o rateio: ' + avisoRateio, 'error')
    } else if (tipo === 'D' && (form.rateios || []).filter(r => parseFloat(r.valor) > 0).length === 0 && props.length > 0) {
      toast(`Rateio automático aplicado: dividido igualmente entre ${props.length} proprietário${props.length > 1 ? 's' : ''}.`)
    }

    // Grupo personalizado (fora da lista fixa): fica disponível pros próximos
    // lançamentos do mesmo tipo a partir de agora, sem esperar um reload da
    // página — mesma função que o Estoque usa depois de salvar por lá.
    setGruposExtras(prev => comGrupoExtra(prev, tipo, capitalizarPrimeira(form.grupo)))

    if (criarEstoque && lancData?.id) {
      const r = await aplicarMovimentacaoEstoque({
        itemId: itemIdParaEntrada, tipo: 'E', quantidade: estoqueQtd, data: form.data,
        motivo: `Despesa: ${form.descricao}`, validade: form.estoqueValidade,
        vinculo: { lancamento_id: lancData.id }, precoUnitNovo: estoqueUnit, itensEstoque: itensParaEntrada,
      })
      toast(r.error
        ? 'Lançamento salvo, mas a entrada no estoque NÃO foi registrada: ' + r.error.message + ' — registre manualmente em Estoque.'
        : 'Lançamento salvo e entrada no estoque registrada!', r.error ? 'error' : undefined)
      const { data: rItens } = await db.estoque.list()
      setItensEstoque(rItens || [])
    } else if (baixarEstoque && lancData?.id) {
      const r = await aplicarMovimentacaoEstoque({
        itemId: form.estoqueBaixaItemId, tipo: 'S', quantidade: baixaQtd, data: form.data,
        motivo: `Receita: ${form.descricao}`, vinculo: { lancamento_id: lancData.id }, itensEstoque,
      })
      toast(r.error
        ? 'Lançamento salvo, mas a baixa no estoque NÃO foi registrada: ' + r.error.message + ' — registre manualmente em Estoque.'
        : 'Lançamento salvo e baixa no estoque registrada!', r.error ? 'error' : undefined)
      const { data: rItens } = await db.estoque.list()
      setItensEstoque(rItens || [])
    } else {
      toast('Lançamento salvo!')
    }

    setSaving(false)
    setModal(null); setForm({}); loadCiclo()
  }

  // Compra real (tipo === 'C'): registra tudo numa RPC atômica — 1 lançamento
  // de despesa + 1 transacoes_animais por categoria + N animais cadastrados
  // em lote (brinco provisório) + rateio automático. Ver registrar_compra_animais.
  const salvarCompra = async () => {
    if (!podeEditarFinCiclo) return
    if (!form.data) { toast('Informe a data.','error'); return }
    if (compraCategorias.length === 0) { toast('Adicione ao menos uma categoria.','error'); return }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    for (const r of resumoCompra) {
      if (!r.categoria) { toast('Selecione a categoria em todas as linhas.', 'error'); return }
      if (r.qtdNum === null) { toast(`Quantidade inválida para "${r.categoria}".`, 'error'); return }
      if (r.precoNum === null) { toast(`Informe um preço/kg válido para "${r.categoria}".`, 'error'); return }
      // Peso médio só é obrigatório se sobrar algum animal sem peso individual
      // nessa categoria (Bloco D12.2) — com 100% peso individual, o campo não é usado.
      if (r.qtdComPesoMedio > 0 && r.pesoNum === null) {
        toast(`Informe um peso médio válido para "${r.categoria}" (${r.qtdComPesoMedio} animal(is) sem peso individual).`, 'error'); return
      }
      if (!r.proprietario_id) { toast(`Selecione o proprietário de "${r.categoria}".`, 'error'); return }
      if (!r.data_nascimento_estimada) { toast(`Informe a data de nascimento estimada de "${r.categoria}".`, 'error'); return }
      if (r.data_nascimento_estimada > form.data) {
        toast(`A data de nascimento estimada de "${r.categoria}" não pode ser depois da data da compra.`, 'error'); return
      }
      const posInvalida = (r.pesos_individuais || []).findIndex(v => pesoIndividualInvalido(v))
      if (posInvalida !== -1) {
        toast(`Peso individual inválido na categoria "${r.categoria}" (posição ${posInvalida+1}) — informe um valor maior que 0 e até ${PESO_INDIVIDUAL_MAX_KG} kg, ou deixe em branco para usar o peso médio.`, 'error')
        return
      }
      // Item 8 — categoria com "Prenhez adquirida" marcada
      if (r.prenhezAtiva) {
        const dataInformada = r.prenhezModo === 'monta' ? r.prenhezDataMonta : r.prenhezDataPartoPrevisto
        if (!dataInformada) {
          toast(`"${r.categoria}": informe a data da monta ou a data prevista de parto para a prenhez adquirida.`, 'error'); return
        }
        const { dataMonta: dataMontaCalc } = derivarDatasGestacao({
          dataMonta: r.prenhezModo === 'monta' ? r.prenhezDataMonta : '',
          dataPartoPrevisto: r.prenhezModo !== 'monta' ? r.prenhezDataPartoPrevisto : '',
        })
        if (dataMontaCalc > form.data) {
          toast(`"${r.categoria}": a monta calculada (${fmtData(dataMontaCalc)}) fica depois da data da compra — confira a data informada.`, 'error'); return
        }
        if (r.prenhezCriandoEstacao && (!r.prenhezNovaEstacaoNome || !r.prenhezNovaEstacaoInicio)) {
          toast(`"${r.categoria}": preencha nome e início da nova estação de monta, ou escolha uma existente.`, 'error'); return
        }
      }
    }
    setSaving(true)
    const ciclo = cicloDaData(form.data)
    // Item 8 — snapshot de quem já existia ANTES da compra, pra depois achar
    // por diferença os animais recém-criados (a RPC não devolve os IDs
    // criados por categoria).
    const idsAnimaisAntes = new Set(animaisAtivos.map(a => a.id))
    const detalhes = resumoCompra.map(r => ({
      categoria: r.categoria, quantidade: r.qtdNum,
      peso_medio: r.pesoNum, preco_kg: r.precoNum, valor_total: r.subtotal,
      proprietario_id: r.proprietario_id, data_nascimento_estimada: r.data_nascimento_estimada,
      pesos_individuais: r.pesosIndividuaisNum,
    }))
    const totalAnimais = detalhes.reduce((s,d) => s+d.quantidade, 0)
    const descricao = `Compra de ${totalAnimais} animal(is): ` +
      detalhes.map(d => `${d.quantidade}x ${d.categoria}`).join(', ')
    const { error } = await db.transacoes.registrarCompra({
      conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, ciclo_id: ciclo.id, data: form.data,
      valor_total: totalCompra, descricao,
      contraparte: capitalizarNome(form.contraparte) || '', comissao: parseFloat(form.comissao)||0, imposto: parseFloat(form.imposto)||0,
      frete: parseFloat(form.frete)||0,
      detalhes,
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Compra registrada!')
    setModal(null); setForm({}); loadCiclo()
    const { data: rAnimais } = await db.animais.list({ situacao:'ativo' })
    setAnimaisAtivos(rAnimais || [])

    // Item 8 — para cada categoria com "Prenhez adquirida" marcada, acha por
    // diferença (novos = quem não existia antes desta compra) os animais
    // daquela linha específica (mesma categoria/proprietário/data de
    // nascimento estimada) e cria o lote + inseminações com diagnóstico 'P'.
    const linhasPrenhez = resumoCompra.filter(r => r.prenhezAtiva)
    if (linhasPrenhez.length > 0) {
      const novos = (rAnimais || []).filter(a => !idsAnimaisAntes.has(a.id))
      for (const r of linhasPrenhez) {
        const candidatos = novos.filter(a =>
          a.proprietario_id === r.proprietario_id &&
          a.data_nascimento === r.data_nascimento_estimada &&
          categoriaReal(a) === r.categoria)
        if (candidatos.length !== r.qtdNum) {
          toast(`Compra registrada, mas não foi possível identificar com segurança os animais de "${r.categoria}" para vincular a prenhez adquirida — vincule manualmente depois pela aba Lotes/Montas ("+ Vincular prenhez adquirida").`, 'error')
          continue
        }
        const { dataMonta } = derivarDatasGestacao({
          dataMonta: r.prenhezModo === 'monta' ? r.prenhezDataMonta : '',
          dataPartoPrevisto: r.prenhezModo !== 'monta' ? r.prenhezDataPartoPrevisto : '',
        })
        const cicloDaMonta = cicloDaData(dataMonta)
        if (!cicloDaMonta) {
          toast(`"${r.categoria}": não há ciclo cadastrado cobrindo a data da monta (${fmtData(dataMonta)}) — vincule manualmente depois pela aba Lotes/Montas.`, 'error')
          continue
        }
        const { error: errPrenhez } = await criarPrenhezAdquirida({
          cicloId: cicloDaMonta.id, dataMonta, dataDiagnostico: form.data,
          estacaoMontaId: r.prenhezCriandoEstacao ? null : (r.prenhezEstacaoId || null),
          novaEstacao: r.prenhezCriandoEstacao ? { nome: r.prenhezNovaEstacaoNome, inicio: r.prenhezNovaEstacaoInicio } : null,
          animalIds: candidatos.map(a => a.id),
        })
        if (errPrenhez) toast(`"${r.categoria}": ${errPrenhez}`, 'error')
        else toast(`"${r.categoria}": lote de prenhez adquirida criado — ${candidatos.length} animal(is) já com diagnóstico Prenha.`)
      }
    }
  }

  // Venda real (tipo === 'V'): registra tudo numa RPC atômica —
  // 1 lançamento de receita + 1 transacoes_animais por categoria + baixa dos
  // animais selecionados (situacao='vendido'). Ver registrar_venda_animais.
  const salvarVenda = async () => {
    if (!podeEditarFinCiclo) return
    if (!form.data) { toast('Informe a data.','error'); return }
    if (vendaSelecionados.length === 0) { toast('Selecione ao menos um animal.','error'); return }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    for (const r of resumoPorCategoriaVenda) {
      if (r.preco === null) { toast(`Informe um preço/kg válido para "${r.categoria}".`, 'error'); return }
      // Peso médio só é obrigatório se sobrar algum animal sem peso individual
      // nessa categoria (Bloco D12.2) — com 100% peso individual, o campo não é usado.
      if (r.qtdComPesoMedio > 0 && r.peso === null) {
        toast(`Informe um peso médio válido para "${r.categoria}" (${r.qtdComPesoMedio} animal(is) sem peso individual).`, 'error')
        return
      }
    }
    for (const a of animaisSelecionadosObjs) {
      if (pesoIndividualInvalido(vendaPesosIndividuais[a.id])) {
        toast(`Peso individual do animal ${a.brinco} inválido — informe um valor maior que 0 e até ${PESO_INDIVIDUAL_MAX_KG} kg, ou deixe em branco para usar o peso médio.`, 'error')
        return
      }
    }
    setSaving(true)
    const ciclo = cicloDaData(form.data)
    const detalhes = resumoPorCategoriaVenda.map(r => ({
      categoria: r.categoria, quantidade: r.quantidade,
      peso_medio: r.peso, preco_kg: r.preco, valor_total: r.subtotal,
      animal_ids: r.animalIdsComPeso,
    }))
    const descricao = `Venda de ${vendaSelecionados.length} animal(is): ` +
      detalhes.map(d => `${d.quantidade}x ${d.categoria}`).join(', ')
    const { error } = await db.transacoes.registrarVenda({
      conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, ciclo_id: ciclo.id, data: form.data,
      valor_total: totalVenda, descricao,
      contraparte: capitalizarNome(form.contraparte) || '', comissao: parseFloat(form.comissao)||0, imposto: parseFloat(form.imposto)||0,
      frete: parseFloat(form.frete)||0,
      detalhes, animal_ids: vendaSelecionados,
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Venda registrada!')
    setModal(null); setForm({}); loadCiclo()
    const { data: rAnimais } = await db.animais.list({ situacao:'ativo' })
    setAnimaisAtivos(rAnimais || [])
  }

  // Consulta (D2.3): expande uma transação e busca os animais individuais em
  // transacao_animais_itens (cache por transacao_id — só busca uma vez). Serve
  // pra venda (V) hoje e pra compra (C) a partir do D3, sem distinção aqui.
  const toggleAnimaisTransacao = async (t) => {
    if (transacaoExpandida === t.id) { setTransacaoExpandida(null); return }
    setTransacaoExpandida(t.id)
    if (!itensPorTransacao[t.id]) {
      setCarregandoItens(true)
      const { data, error } = await db.transacaoAnimaisItens.listPorTransacao(t.id)
      if (error) toast('Erro ao buscar animais da transação: ' + error.message, 'error')
      setItensPorTransacao(prev => ({ ...prev, [t.id]: data || [] }))
      setCarregandoItens(false)
    }
  }

  // Simulação (venda_sim/compra_sim): grava só em simulacoes_transacoes — NÃO
  // cria lançamento, NÃO dá baixa/cadastra animal, NÃO rateia, NÃO afeta
  // apuração. Reaproveita a mesma interface e o mesmo estado da real (venda ou
  // compra, conforme form.tipo) — só o destino muda. Por isso o guard aqui é
  // podeEditarFinanceiro (permissão do módulo), não podeEditarFinCiclo: uma
  // simulação não mexe no ciclo, então ciclo fechado não deveria bloqueá-la.
  const salvarSimulacao = async () => {
    if (!podeEditarFinanceiro) return
    if (!form.data) { toast('Informe a data.','error'); return }
    let detalhes, valorTotal
    if (form.tipo === 'venda_sim') {
      if (vendaSelecionados.length === 0) { toast('Selecione ao menos um animal.','error'); return }
      for (const r of resumoPorCategoriaVenda) {
        if (r.preco === null) { toast(`Informe um preço/kg válido para "${r.categoria}".`, 'error'); return }
        if (r.qtdComPesoMedio > 0 && r.peso === null) {
          toast(`Informe um peso médio válido para "${r.categoria}" (${r.qtdComPesoMedio} animal(is) sem peso individual).`, 'error'); return
        }
      }
      detalhes = resumoPorCategoriaVenda.map(r => ({
        categoria: r.categoria, quantidade: r.quantidade, peso_medio: r.peso, preco_kg: r.preco, valor_total: r.subtotal,
      }))
      valorTotal = totalVenda
    } else {
      if (compraCategorias.length === 0) { toast('Adicione ao menos uma categoria.','error'); return }
      for (const r of resumoCompra) {
        if (!r.categoria) { toast('Selecione a categoria em todas as linhas.', 'error'); return }
        if (r.qtdNum === null) { toast(`Quantidade inválida para "${r.categoria}".`, 'error'); return }
        if (r.precoNum === null) { toast(`Informe um preço/kg válido para "${r.categoria}".`, 'error'); return }
        if (r.qtdComPesoMedio > 0 && r.pesoNum === null) {
          toast(`Informe um peso médio válido para "${r.categoria}" (${r.qtdComPesoMedio} animal(is) sem peso individual).`, 'error'); return
        }
      }
      detalhes = resumoCompra.map(r => ({
        categoria: r.categoria, quantidade: r.qtdNum, peso_medio: r.pesoNum, preco_kg: r.precoNum, valor_total: r.subtotal,
      }))
      valorTotal = totalCompra
    }
    setSaving(true)
    const ciclo = cicloDaData(form.data)
    const { error } = await db.simulacoes.insert({
      conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, ciclo_id: ciclo?.id || null,
      tipo: form.tipo, data: form.data, valor_total: valorTotal, detalhes,
      observacoes: form.observacoesSimulacao || '',
    })
    setSaving(false)
    if (error) { toast('Erro: '+error.message,'error'); return }
    toast('Simulação registrada!')
    setModal(null); setForm({})
    const { data: rSim } = await db.simulacoes.list()
    setSimulacoes(rSim || [])
  }

  const excluirSimulacao = async (id) => {
    if (!podeEditarFinanceiro) return
    const { error } = await db.simulacoes.delete(id)
    if (error) { toast('Erro ao excluir.', 'error'); return }
    toast('Simulação removida.')
    loadCiclo()
  }

  // Ramificação por tipo do modal de transação: simulações (venda_sim/
  // compra_sim) vão pra simulacoes_transacoes; Venda e Compra reais têm cada
  // uma sua RPC atômica própria.
  const ehSimulacaoTransac = form.tipo === 'venda_sim' || form.tipo === 'compra_sim'
  const confirmarTransacao = () => {
    if (ehSimulacaoTransac) { salvarSimulacao(); return }
    if (form.tipo === 'V') { salvarVenda(); return }
    if (form.tipo === 'C') { salvarCompra(); return }
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
      const ano = String(hojeAgora().getFullYear())
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

  // Despesas/Receitas por grupo — mesma função compartilhada com Relatorios.jsx
  // (helpers.gruposPorValor), nunca lista fixa: um grupo criado pela RPC de
  // venda/compra (Comissão/Impostos/Frete) ou digitado à mão em "+ Novo
  // grupo..." aparece igual. Mostra TODOS os grupos (antes travava nos 7
  // maiores) — a lista agora é HTML/CSS puro (BarraGrupo), então cresce sem
  // cortar nome nenhum; se ficar muito longa, o próprio card rola.
  const despesasGrupo = gruposPorValor(lancs, 'D', filtProp || null)
  const receitasGrupo = gruposPorValor(lancs, 'R', filtProp || null)
  const maxDespGrupo = despesasGrupo[0]?.valor || 0
  const maxRecGrupo  = receitasGrupo[0]?.valor || 0

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
      {/* Ciclo agora é selecionado exclusivamente pelo seletor global no
          topo (SeletoresTopo) — aqui só o indicador de somente leitura. */}
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:14 }}>
        <BadgeSomenteLeitura ciclo={cicloLocal} />
      </div>

      {/* Abas + Gerar PDF na mesma linha, alinhado à direita (Fase 14) — o
          botão troca de alvo conforme a aba ativa (pdfAtual). */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:16, borderBottom:'.5px solid var(--gray-200)' }}>
        <div className="tabs-bar" style={{ flex:1, minWidth:0, marginBottom:0, border:'none' }}>
          {TABS.map((t,i)=>(
            <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
          ))}
        </div>
        {pdfAtual && (
          <BotaoPDF contentRef={pdfAtual.ref} filename={pdfAtual.filename} titulo={pdfAtual.titulo} />
        )}
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
              // Bloco D11 — "Caixa disponível" = saldo anterior (ciclos passados,
              // calculado no banco) + resultado deste ciclo. Nunca soma no `resu`
              // acima (que fica intocado) — é um card à parte, cor roxa pra nunca
              // ser confundido com Receita/Despesa/Resultado.
              { v: saldoAnteriorCiclo !== null ? fmtMoeda(saldoAnteriorCiclo + resu) : '…', l:'Caixa disponível', s:'saldo anterior + resultado do ciclo', c:'#7B2FBE' },
              { v:transacs.filter(t=>t.tipo==='V').length, l:'Vendas de animais', s:'no ciclo', c:'#633806' },
            ].map(k=>(
              <div key={k.l} className="kpi-card" style={{ borderLeft:`3px solid ${k.c}` }}>
                <div className="kpi-value" style={{color:k.c}}>{k.v}</div>
                <div className="kpi-label">{k.l}</div>
                <div className="kpi-sub">{k.s}</div>
              </div>
            ))}
          </div>

          {/* Faixa compacta do ciclo — era um card inteiro (grid-2, ocupava
              metade da largura) só pra 3 linhas de informação; virou uma
              faixa horizontal, acima dos gráficos. */}
          <div style={{
            display:'flex', alignItems:'center', flexWrap:'wrap', gap:'6px 20px',
            background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:10,
            padding:'10px 16px', marginBottom:14, fontSize:'.82rem',
          }}>
            <strong style={{ color:'#111', display:'flex', alignItems:'center', gap:6 }}>
              <i className="ti ti-calendar" /> Ciclo {cicloLocal?.nome}
            </strong>
            <span style={{ color:'#6B7280' }}>Início: <strong style={{ color:'#374151' }}>{fmtData(cicloLocal?.inicio)}</strong></span>
            <span style={{ color:'#6B7280' }}>Encerramento: <strong style={{ color:'#374151' }}>{fmtData(cicloLocal?.fim)}</strong></span>
            <Badge color={statusCicloLocal==='atual'?'green':statusCicloLocal==='carencia'?'amber':'gray'}>{STATUS_CICLO_LABEL[statusCicloLocal]||'—'}</Badge>
            <span style={{ color:'#6B7280' }}>
              Saldo anterior: <strong style={{ color:'#7B2FBE' }}>{saldoAnteriorCiclo !== null ? fmtMoeda(saldoAnteriorCiclo) : '…'}</strong>
            </span>
          </div>

          {/* Despesas/Receitas por grupo lado a lado — .grid-2 já empilha em 1
              coluna na tela estreita (ver global.css), sem precisar de CSS novo. */}
          <div className="grid-2" style={{ marginBottom:14 }}>
            <div className="card">
              <div className="card-title"><i className="ti ti-chart-donut"/> Despesas por grupo</div>
              <div style={{ maxHeight:280, overflowY:'auto', paddingRight:4 }}>
                {despesasGrupo.length===0
                  ? <div style={{color:'#9CA3AF',fontSize:'.82rem',textAlign:'center',padding:'16px 0'}}>Sem despesas lançadas</div>
                  : despesasGrupo.map(g => (
                    <BarraGrupo key={g.grupo} grupo={g.grupo} valor={g.valor} maxValor={maxDespGrupo} cor="#791F1F" />
                  ))
                }
              </div>
            </div>
            <div className="card">
              <div className="card-title"><i className="ti ti-chart-donut"/> Receitas por grupo</div>
              <div style={{ maxHeight:280, overflowY:'auto', paddingRight:4 }}>
                {receitasGrupo.length===0
                  ? <div style={{color:'#9CA3AF',fontSize:'.82rem',textAlign:'center',padding:'16px 0'}}>Sem receitas lançadas</div>
                  : receitasGrupo.map(g => (
                    <BarraGrupo key={g.grupo} grupo={g.grupo} valor={g.valor} maxValor={maxRecGrupo} cor="#1E55B0" />
                  ))
                }
              </div>
            </div>
          </div>

          <div className="card">
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
                            <button className="btn-icon" onClick={() => abrirConfirmExcluirLanc(l)}>
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
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div style={{display:'flex', gap:8, flexWrap:'wrap', alignItems:'center'}}>
              <div className="pill-group">
                <button className={`pill ${filtTransacTipo===''?'active':''}`} onClick={()=>setFiltTransacTipo('')}>Todos</button>
                <button className={`pill ${filtTransacTipo==='V'?'active':''}`} onClick={()=>setFiltTransacTipo('V')}>Venda</button>
                <button className={`pill ${filtTransacTipo==='C'?'active':''}`} onClick={()=>setFiltTransacTipo('C')}>Compra</button>
              </div>
              <select value={filtTransacCategoria} onChange={e=>setFiltTransacCategoria(e.target.value)} style={{width:170}}>
                <option value="">Todas as categorias</option>
                {categoriasTransac.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtTransacContraparte} onChange={e=>setFiltTransacContraparte(e.target.value)} style={{width:170}}>
                <option value="">Todas as contrapartes</option>
                {contrapartesTransac.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{fontSize:'.85rem',color:'#6B7280'}}>{transacsFiltradas.length} de {transacs.length} transações</span>
            </div>
            {podeEditarFinCiclo && (
              <button className="btn btn-primary btn-sm" onClick={abrirModalTransac}>
                <i className="ti ti-plus"/> Registrar transação
              </button>
            )}
          </div>
          <div ref={refTransacs}>
          {transacsFiltradas.length===0
            ? <EmptyState icon="🐄" title="Nenhuma transação" sub={transacs.length===0 ? "Registre compras e vendas de animais." : "Nenhuma transação bate com os filtros selecionados."}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Qt</th><th>Kg/un</th><th>R$/kg</th><th>Contraparte</th><th>Comissão</th><th>Imposto</th><th>Frete</th><th style={{textAlign:'right'}}>Total</th><th></th></tr>
                  </thead>
                  <tbody>
                    {transacsFiltradas.map(t=>{
                      const expandida = transacaoExpandida === t.id
                      const itens = itensPorTransacao[t.id]
                      return (
                      <Fragment key={t.id}>
                      <tr>
                        <td>{fmtData(t.data)}</td>
                        <td><Badge color={t.tipo==='V'?'green':'blue'}>{t.tipo==='V'?'Venda':'Compra'}</Badge></td>
                        <td>{t.categoria}</td>
                        <td>{t.quantidade}</td>
                        <td>{t.peso_medio}</td>
                        <td>{fmtMoeda(t.preco_kg)}</td>
                        <td style={{fontSize:'.78rem',color:'#9CA3AF'}}>{t.contraparte||'—'}</td>
                        <td style={{color:'#9CA3AF'}}>{fmtMoeda(t.comissao)}</td>
                        <td style={{color:'#9CA3AF'}}>{fmtMoeda(t.imposto)}</td>
                        <td style={{color:'#9CA3AF'}}>{fmtMoeda(t.frete)}</td>
                        <td style={{textAlign:'right',fontWeight:500,color:t.tipo==='V'?'#1E55B0':'#791F1F'}}>{fmtMoeda(t.valor_total)}</td>
                        <td>
                          <button className="btn-icon" title="Ver animais desta transação" onClick={() => toggleAnimaisTransacao(t)}>
                            <i className={`ti ti-chevron-${expandida?'up':'down'}`}/>
                          </button>
                        </td>
                      </tr>
                      {expandida && (
                        <tr>
                          <td colSpan={11} style={{background:'#F9FAFB',padding:'10px 14px'}}>
                            {carregandoItens && !itens
                              ? <div style={{fontSize:'.8rem',color:'#9CA3AF'}}>Carregando animais...</div>
                              : !itens || itens.length === 0
                                ? <div style={{fontSize:'.8rem',color:'#9CA3AF'}}>Nenhum animal individual registrado para esta transação.</div>
                                : (
                                  <table style={{width:'100%'}}>
                                    <thead>
                                      <tr>
                                        <th>Brinco</th><th>Categoria</th><th>Proprietário</th>
                                        <th>Peso (kg)</th><th>Preço/kg</th><th style={{textAlign:'right'}}>Valor</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {itens.map(item => (
                                        <tr key={item.id}>
                                          <td>{item.animal?.brinco || '—'}</td>
                                          <td>{item.categoria_venda}</td>
                                          <td>{item.proprietario?.nome || '—'}</td>
                                          <td>{item.peso_medio}</td>
                                          <td>{fmtMoeda(item.preco_kg||0)}</td>
                                          <td style={{textAlign:'right',fontWeight:500}}>{fmtMoeda(item.valor)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )
                            }
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    )})}
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
            {(loadingResultados || loadingSaldosCiclos) ? <Loading /> : (
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead><tr>
                  <th>Ciclo</th>
                  <th style={{textAlign:'right'}}>Receitas</th>
                  <th style={{textAlign:'right'}}>Despesas</th>
                  <th style={{textAlign:'right'}}>Resultado</th>
                  <th style={{textAlign:'right'}}>Margem</th>
                  <th style={{textAlign:'right', color:'#6B7280'}}>Saldo anterior</th>
                  <th style={{textAlign:'right', color:'#6B7280'}}>Caixa acumulado</th>
                </tr></thead>
                <tbody>
                  {ciclos.map(c=>{
                    const ehAtual = c.id === cicloAtual?.id
                    const lancsCiclo = lancsPorCiclo[c.id]
                    const { receita: recC, despesa: despC, resultado: resuC } = lancsCiclo
                      ? calcResultadoFinanceiro(lancsCiclo, filtProp)
                      : { receita: null, despesa: null, resultado: null }
                    // Bloco D11 — saldo anterior/caixa acumulado NUNCA entram no
                    // Resultado/Margem acima (colunas intocadas) — são valores à
                    // parte, buscados em saldosPorCiclo (soma no banco).
                    const saldoAntC = saldosPorCiclo[c.id]
                    const caixaC = (resuC !== null && saldoAntC !== null && saldoAntC !== undefined) ? resuC + saldoAntC : null
                    return (
                    <tr key={c.id} style={{fontWeight:ehAtual?600:''}}>
                      <td>{c.nome}{ehAtual&&<Badge color="purple" style={{marginLeft:6}}>atual</Badge>}</td>
                      <td style={{textAlign:'right',color:'#1E55B0'}}>{recC !== null ? fmtMoeda(recC) : '—'}</td>
                      <td style={{textAlign:'right',color:'#791F1F'}}>{despC !== null ? fmtMoeda(despC) : '—'}</td>
                      <td style={{textAlign:'right',color:resuC>=0?'#1E55B0':'#791F1F'}}>{resuC !== null ? fmtMoeda(resuC) : '—'}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{recC>0?Math.round(resuC/recC*100)+'%':'—'}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{saldoAntC !== null && saldoAntC !== undefined ? fmtMoeda(saldoAntC) : '—'}</td>
                      <td style={{textAlign:'right',color:'#6B7280',fontWeight:600}}>{caixaC !== null ? fmtMoeda(caixaC) : '—'}</td>
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
                {/* Itera pela lista oficial (CATEGORIAS_VALOR), não pela ordem crua do
                    banco — mesma ordem/nomenclatura usada na Venda e em Rebanho/Dashboard/
                    Relatorios. Se uma categoria não existir em categorias_preco, a linha
                    aparece sem edição em vez de quebrar. */}
                {CATEGORIAS_VALOR.map(cat => {
                  const cp = catPrecos.find(c => c.categoria === cat)
                  if (!cp) return (
                    <tr key={cat}>
                      <td style={{fontWeight:500}}>{cat}</td>
                      <td colSpan={3} style={{color:'#9CA3AF',fontSize:'.8rem'}}>Categoria ainda não cadastrada em categorias_preco</td>
                      <td></td>
                    </tr>
                  )
                  return (
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
                  )
                })}
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
              body="Cada ciclo corresponde a um ano pecuário (jul–jun). Um novo ciclo é criado automaticamente ao virar 01/07, encerrando o anterior. Os lançamentos de cada ciclo ficam preservados e podem ser consultados trocando o ciclo no menu lateral."/>
          </div>
        </div>
      )}

      {/* ── Simulações ── */}
      {tab===6 && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:'.85rem',color:'#6B7280'}}>{simulacoes.length} simulação(ões)</span>
          </div>
          {simulacoes.length===0
            ? <EmptyState icon="🧪" title="Nenhuma simulação" sub={'Use "Simular venda" ou "Simular compra" em Compra & Venda pra testar um cenário sem afetar o financeiro real.'}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data</th><th>Tipo</th><th>Categorias</th><th style={{textAlign:'right'}}>Valor total</th><th></th></tr></thead>
                  <tbody>
                    {simulacoes.map(s => (
                      <tr key={s.id}>
                        <td>{fmtData(s.data)}</td>
                        <td><Badge color={s.tipo==='venda_sim'?'green':'blue'}>{s.tipo==='venda_sim'?'Venda simulada':'Compra simulada'}</Badge></td>
                        <td style={{fontSize:'.78rem',color:'#6B7280'}}>{(s.detalhes||[]).map(d=>`${d.quantidade}x ${d.categoria}`).join(', ')}</td>
                        <td style={{textAlign:'right',fontWeight:500}}>{fmtMoeda(s.valor_total)}</td>
                        <td>
                          <button className="btn-icon" onClick={()=>setConfirmDelSim(s)}>
                            <i className="ti ti-trash" style={{fontSize:13}}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* ── Modal novo ciclo ── */}
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
          <Field label="Tipo"><select value={form.tipo||'D'} onChange={e=>setForm(p=>({...p,tipo:e.target.value,grupo:'',criarEntradaEstoque:false,baixarEstoque:false}))}><option value="D">Despesa</option><option value="R">Receita</option></select></Field>
          <Field label="Data" required><input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/></Field>
          <Field label="Grupo" required>
            <GrupoSelect key={form.tipo||'D'} value={form.grupo} opcoes={gruposDisponiveis(form.tipo||'D')}
              onChange={g=>setForm(p=>({...p,grupo:g}))} />
          </Field>
          <Field label={form.criarEntradaEstoque ? 'Valor total (R$)' : 'Valor (R$)'} required>
            <input type="number" step="0.01" value={form.valor||''} onChange={e=>setValorLanc(e.target.value)} placeholder="0,00"/>
          </Field>
        </div>
        <Field label="Descrição" required><input value={form.descricao||''} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))} placeholder="Descreva o lançamento..."/></Field>

        {(form.tipo||'D')==='D' && podeEditarEstoque && (
          <div style={{ marginTop:14, paddingTop:14, borderTop:'.5px solid #E5E7EB' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:600, color:'#374151', cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.criarEntradaEstoque}
                onChange={e=>setForm(p=>({...p,criarEntradaEstoque:e.target.checked}))} />
              Lançar também como entrada no estoque
            </label>
            {form.criarEntradaEstoque && (
              <div className="grid-form" style={{ marginTop:10 }}>
                <Field label="Item de estoque" required>
                  <select value={form.estoqueItemId||''} onChange={e=>{
                    const id = e.target.value
                    const item = itensEstoque.find(i=>i.id===id)
                    setForm(p=>{
                      const novoUnit = item ? String(item.preco_unit ?? '') : p.estoqueUnitario
                      const qtd = parseFloat(p.estoqueQuantidade)||0, unit = parseFloat(novoUnit)||0
                      const grupoSugerido = item ? GRUPO_SUGERIDO_POR_CATEGORIA[item.categoria] : null
                      return {
                        ...p, estoqueItemId:id, estoqueUnitario: novoUnit,
                        valor: (item && qtd>0 && unit>0) ? (qtd*unit).toFixed(2) : p.valor,
                        grupo: grupoSugerido || p.grupo,
                      }
                    })
                  }}>
                    <option value="">— selecione —</option>
                    {itensEstoque.map(i=><option key={i.id} value={i.id}>{i.item} ({parseFloat(i.quantidade).toFixed(1)} {i.unidade})</option>)}
                    <option value="__novo__">+ Novo item...</option>
                  </select>
                </Field>
                {form.estoqueItemId === '__novo__' ? (
                  <>
                    <Field label="Nome do item" required>
                      <input value={form.estoqueItemNome||''} onChange={e=>setForm(p=>({...p,estoqueItemNome:e.target.value}))} placeholder="ex: Ivermectina 1%"/>
                    </Field>
                    <Field label="Categoria" required>
                      <select value={form.estoqueCategoria||'Medicamento'} onChange={e=>{
                        const cat = e.target.value
                        setForm(p=>({...p, estoqueCategoria:cat, grupo: GRUPO_SUGERIDO_POR_CATEGORIA[cat] || p.grupo}))
                      }}>
                        {CATS_ESTOQUE.map(c=><option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field label="Unidade" required>
                      <input value={form.estoqueUnidade||''} onChange={e=>setForm(p=>({...p,estoqueUnidade:e.target.value}))} placeholder="ml, kg, dose, L..."/>
                    </Field>
                    <Field label="Estoque mínimo" hint="Opcional — dispara o alerta de 'estoque baixo'.">
                      <input type="number" step="0.1" value={form.estoqueMinimo||''} onChange={e=>setForm(p=>({...p,estoqueMinimo:e.target.value}))} placeholder="0"/>
                    </Field>
                  </>
                ) : null}
                <Field label="Quantidade" required>
                  <input type="number" step="0.1" value={form.estoqueQuantidade||''} onChange={e=>setEstoqueQuantidade(e.target.value)} placeholder="0"/>
                </Field>
                <Field label="Valor unitário (R$)" required hint="Preço de UMA unidade — o Valor total acima é recalculado sozinho (quantidade × unitário), e vice-versa.">
                  <input type="number" step="0.01" value={form.estoqueUnitario||''} onChange={e=>setEstoqueUnitario(e.target.value)} placeholder="0,00"/>
                </Field>
                <Field label="Validade" hint="Opcional — nem todo item tem.">
                  <input type="date" value={form.estoqueValidade||''} onChange={e=>setForm(p=>({...p,estoqueValidade:e.target.value}))}/>
                </Field>
              </div>
            )}
          </div>
        )}

        {(form.tipo||'D')==='R' && podeEditarEstoque && (
          <div style={{ marginTop:14, paddingTop:14, borderTop:'.5px solid #E5E7EB' }}>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.85rem', fontWeight:600, color:'#374151', cursor:'pointer' }}>
              <input type="checkbox" checked={!!form.baixarEstoque}
                onChange={e=>setForm(p=>({...p,baixarEstoque:e.target.checked}))} />
              Dar baixa no estoque
            </label>
            {form.baixarEstoque && (
              <>
                <div className="grid-form" style={{ marginTop:10 }}>
                  <Field label="Item de estoque" required>
                    <select value={form.estoqueBaixaItemId||''} onChange={e=>setForm(p=>({...p,estoqueBaixaItemId:e.target.value}))}>
                      <option value="">— selecione —</option>
                      {itensEstoque.filter(i=>parseFloat(i.quantidade)>0).map(i=>
                        <option key={i.id} value={i.id}>{i.item} ({parseFloat(i.quantidade).toFixed(1)} {i.unidade} em estoque)</option>
                      )}
                    </select>
                  </Field>
                  <Field label="Quantidade vendida" required>
                    <input type="number" step="0.1" value={form.estoqueBaixaQuantidade||''} onChange={e=>setForm(p=>({...p,estoqueBaixaQuantidade:e.target.value}))} placeholder="0"/>
                  </Field>
                </div>
                <p style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:6 }}>
                  O valor da receita acima é o valor da venda, informado por você — não tem relação com o preço cadastrado do item no estoque.
                </p>
              </>
            )}
          </div>
        )}

        <RateioProprietarios tipo={form.tipo || 'D'} valorTotal={parseFloat(form.valor || 0)} props={props}
          rateios={form.rateios} onChange={r => setForm(p => ({ ...p, rateios: r }))} />

        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button className="btn btn-primary" onClick={salvarLanc} disabled={saving || !podeEditarFinCiclo}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal transação ── */}
      <Modal open={modal==='transac'} onClose={()=>setModal(null)}
        title={ehSimulacaoTransac ? 'Simular transação' : (ehVendaShape ? 'Registrar venda' : 'Registrar compra')}
        width={ehVendaShape ? 860 : (ehCompraShape ? 760 : 540)}>
        {ehSimulacaoTransac && (
          <div style={{background:'#EEF2FF',border:'.5px solid #C7D2FE',borderRadius:8,padding:'10px 12px',marginBottom:14,fontSize:'.8rem',color:'#3730A3'}}>
            <i className="ti ti-flask" style={{marginRight:6}}/>
            Simulação: usa a mesma tela da transação real, mas não gera lançamento financeiro, não dá baixa nem cadastra
            animais, não rateia e não afeta a apuração — é só consulta. Veja e exclua simulações na aba "Simulações".
          </div>
        )}
        <div className="grid-form">
          <Field label="Tipo">
            <select value={form.tipo||'V'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              <option value="V">Venda</option>
              <option value="C">Compra</option>
              <option value="venda_sim">Simular venda</option>
              <option value="compra_sim">Simular compra</option>
            </select>
          </Field>
          <Field label="Data" required>
            <input type="date" value={form.data||''} onChange={handleDataChange} />
          </Field>
        </div>

        {ehVendaShape && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap'}}>
              <select className="input" style={{flex:1,minWidth:140}} value={vendaFiltroCategoria}
                onChange={e=>setForm(p=>({...p,vendaFiltroCategoria:e.target.value}))}>
                <option value="">Todas as categorias</option>
                {categoriasComAtivos.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" style={{flex:1,minWidth:140}} value={vendaFiltroProprietario}
                onChange={e=>setForm(p=>({...p,vendaFiltroProprietario:e.target.value}))}>
                <option value="">Todos os proprietários</option>
                {props.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select className="input" style={{flex:1,minWidth:140}} value={vendaFiltroLote}
                onChange={e=>setForm(p=>({...p,vendaFiltroLote:e.target.value}))}>
                <option value="">Todos os lotes</option>
                {lotes.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            {/* Item 5 — seleção de descarte pela última estação de monta,
                combinável com os filtros de cima (categoria/proprietário/lote)
                e entre si (E lógico). Dados carregados sob demanda (ver
                useEffect de reprodutivoVenda) — desabilitados enquanto carrega
                pra não sugerir um resultado incompleto. "Falhada" é
                guarda-chuva (não entregou terneiro na estação, qualquer que
                seja o motivo) — os 3 motivos são úteis separados pra decisão
                (quem não emprenha é problema diferente de quem aborta), com
                "Todas as falhadas" como atalho pra pegar as 3 de uma vez, sem
                precisar marcar uma por uma. Pills (.pill/.pill-group,
                global.css) — mesmo padrão visual usado nos outros filtros do
                app (proprietário/tipo/situação em Financeiro/Animais/etc.),
                aqui com seleção MÚLTIPLA (toggle por clique) em vez de
                exclusiva, já que os motivos são combináveis entre si. */}
            <div className="pill-group" style={{marginBottom:10}}>
              <button type="button" className={`pill ${vendaFiltroTodasFalhadas ? 'active' : ''}`}
                disabled={carregandoReprodVenda}
                style={{opacity: carregandoReprodVenda ? 0.5 : 1, fontWeight: 600}}
                onClick={() => setForm(p => ({ ...p, vendaFiltroTodasFalhadas: !p.vendaFiltroTodasFalhadas }))}>
                Todas as falhadas
              </button>
              {[
                ['nao_emprenhou', 'Não emprenhou'],
                ['aborto', 'Aborto'],
                ['perda_gestacional', 'Perda gestacional'],
              ].map(([motivo, texto]) => (
                <button key={motivo} type="button"
                  className={`pill ${vendaFiltroFalhadaMotivos.includes(motivo) ? 'active' : ''}`}
                  disabled={carregandoReprodVenda || vendaFiltroTodasFalhadas}
                  style={{opacity: (carregandoReprodVenda || vendaFiltroTodasFalhadas) ? 0.5 : 1}}
                  onClick={() => setForm(p => {
                    const atuais = p.vendaFiltroFalhadaMotivos || []
                    return { ...p, vendaFiltroFalhadaMotivos: atuais.includes(motivo) ? atuais.filter(m=>m!==motivo) : [...atuais, motivo] }
                  })}>
                  {texto}
                </button>
              ))}
              {carregandoReprodVenda && <span style={{fontSize:'.76rem',color:'#9CA3AF',alignSelf:'center'}}>carregando histórico reprodutivo...</span>}
              {!carregandoReprodVenda && reprodutivoVenda && !reprodutivoVenda.ultimaEstacao &&
                <span style={{fontSize:'.76rem',color:'#9CA3AF',alignSelf:'center'}}>nenhuma estação de monta com diagnóstico registrado ainda</span>}
            </div>

            {animaisFiltradosVenda.length > 0 && (
              <button type="button" className="btn btn-secondary btn-xs" style={{marginBottom:8}}
                onClick={() => {
                  const idsFiltrados = animaisFiltradosVenda.map(a=>a.id)
                  const todosMarcados = idsFiltrados.every(id=>vendaSelecionados.includes(id))
                  setForm(p => ({
                    ...p,
                    vendaSelecionados: todosMarcados
                      ? vendaSelecionados.filter(id=>!idsFiltrados.includes(id))
                      : [...new Set([...vendaSelecionados, ...idsFiltrados])]
                  }))
                }}>
                {animaisFiltradosVenda.every(a=>vendaSelecionados.includes(a.id)) ? 'Desmarcar todos do filtro' : 'Selecionar todos do filtro'}
              </button>
            )}

            <div style={{border:'.5px solid #E5E7EB',borderRadius:8,background:'#F9FAFB',padding:'6px 10px',maxHeight:200,overflowY:'auto',marginBottom:10}}>
              {animaisFiltradosVenda.length === 0
                ? <div style={{fontSize:'.8rem',color:'#9CA3AF',textAlign:'center',padding:'8px 0'}}>Nenhum animal ativo encontrado</div>
                : animaisFiltradosVenda.map(a => {
                    const marcado = vendaSelecionados.includes(a.id)
                    const cat = categoriaReal(a)
                    return (
                      <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 4px',fontSize:'.83rem',borderBottom:'.5px solid #F3F4F6'}}>
                        <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',flex:1,minWidth:0}}>
                          <input type="checkbox" checked={marcado} onChange={() => setForm(p => ({
                            ...p,
                            vendaSelecionados: marcado
                              ? vendaSelecionados.filter(id=>id!==a.id)
                              : [...vendaSelecionados, a.id]
                          }))}/>
                          <strong>{a.brinco}</strong>
                          <span style={{fontSize:'.75rem',color:'#7B2FBE',fontWeight:500}}>{cat}</span>
                          <span style={{fontSize:'.75rem',color:'#9CA3AF'}}>{a.proprietario?.nome?.split(' ')[0] || ''}</span>
                        </label>
                        {marcado && (
                          <input type="number" step="0.1" value={vendaPesosIndividuais[a.id] ?? ''}
                            onChange={e=>setForm(p=>({...p,vendaPesosIndividuais:{...p.vendaPesosIndividuais,[a.id]:e.target.value}}))}
                            placeholder="Dig. peso kg"
                            title="Peso individual (opcional) — em branco usa o peso médio da categoria"
                            style={{width:74,fontSize:'.75rem',padding:'2px 6px',flexShrink:0}}
                          />
                        )}
                      </div>
                    )
                  })
              }
            </div>

            {categoriasNaSelecaoVenda.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:'.78rem',fontWeight:500,color:'#374151',marginBottom:6}}>Peso e preço por categoria</div>
                {categoriasNaSelecaoVenda.map(cat => (
                  <div key={cat} style={{display:'flex',gap:8,alignItems:'flex-end',marginBottom:4,flexWrap:'wrap'}}>
                    <div style={{fontSize:'.8rem',fontWeight:500,minWidth:110}}>{cat}</div>
                    <Field label="Peso médio (kg)">
                      <input type="number" step="0.1" value={vendaPrecos[cat]?.peso_medio ?? ''} placeholder="0,0"
                        onChange={e=>setForm(p=>({...p,vendaPrecos:{...p.vendaPrecos,[cat]:{...p.vendaPrecos?.[cat],peso_medio:e.target.value}}}))}/>
                    </Field>
                    <Field label="Preço/kg (R$)">
                      <input type="number" step="0.01" value={vendaPrecos[cat]?.preco_kg ?? ''} placeholder="0,00"
                        onChange={e=>setForm(p=>({...p,vendaPrecos:{...p.vendaPrecos,[cat]:{...p.vendaPrecos?.[cat],preco_kg:e.target.value}}}))}/>
                    </Field>
                  </div>
                ))}
              </div>
            )}

            {vendaSelecionados.length > 0 && (
              <div style={{background:'#E8F0FC',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:'.85rem',color:'#1E55B0',fontWeight:500}}>
                <div>Total: {vendaSelecionados.length} animal(is) selecionado(s) — {fmtMoeda(totalVenda)}</div>
                {resumoPorCategoriaVenda.length > 0 && (
                  <div style={{marginTop:6,fontSize:'.74rem',fontWeight:400,color:'#3B5FA0'}}>
                    {resumoPorCategoriaVenda.map(r => (
                      <div key={r.categoria}>
                        {r.preco === null ? (
                          <div>{r.quantidade}x {r.categoria} (falta preço/kg)</div>
                        ) : (
                          <>
                            {r.qtdComPesoIndividual > 0 && (
                              <div>{r.qtdComPesoIndividual}x {r.categoria} · peso individual (média {fmtKg(r.mediaPesoIndividual)} kg) × {fmtMoeda(r.preco)} = {fmtMoeda(r.valorIndividual)}</div>
                            )}
                            {r.qtdComPesoMedio > 0 && (
                              r.peso !== null
                                ? <div>{r.qtdComPesoMedio}x {r.categoria} · peso médio {fmtKg(r.peso)} kg × {fmtMoeda(r.preco)} = {fmtMoeda(r.valorMedio)}</div>
                                : <div>{r.qtdComPesoMedio}x {r.categoria} (falta peso médio)</div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid-form">
              <Field label="Contraparte"><input value={form.contraparte||''} onChange={e=>setForm(p=>({...p,contraparte:e.target.value}))} placeholder="Comprador"/></Field>
              <Field label="Comissão (R$)"><input type="number" step="0.01" value={form.comissao??''} onChange={e=>setForm(p=>({...p,comissao:e.target.value}))} placeholder="0,00"/></Field>
              <Field label="Funrural / Imposto (R$)"><input type="number" step="0.01" value={form.imposto??''} onChange={e=>setForm(p=>({...p,imposto:e.target.value}))} placeholder="0,00"/></Field>
              <Field label="Frete (R$)"><input type="number" step="0.01" value={form.frete??''} onChange={e=>setForm(p=>({...p,frete:e.target.value}))} placeholder="0,00"/></Field>
            </div>
          </div>
        )}

        {ehCompraShape && (
          <div>
            {compraCategorias.map((c, idx) => {
              const r = resumoCompra[idx]
              return (
                <div key={idx} style={{border:'.5px solid #E5E7EB',borderRadius:8,background:'#F9FAFB',padding:'10px 12px',marginBottom:10}}>
                  <div style={{display:'flex',gap:8,marginBottom:8,flexWrap:'wrap',alignItems:'flex-end'}}>
                    <Field label="Categoria" required>
                      <select value={c.categoria} onChange={e=>{
                        const cat = e.target.value
                        const dataNascEstimada = estimarDataNascimentoPorCategoria(cat, form.data || hojeISO())
                        // Bloco D12.2 — peso médio/preço/kg NÃO são mais pré-preenchidos
                        // (categorias_preco vira só referência visual, ver hint abaixo).
                        atualizarCategoriaCompra(idx, { categoria: cat, peso_medio: '', preco_kg: '', data_nascimento_estimada: dataNascEstimada })
                      }}>
                        <option value="">— selecione —</option>
                        {CATEGORIAS_VALOR.map(cat=><option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </Field>
                    <Field label="Quantidade" required>
                      <input type="number" min={1} value={c.quantidade} onChange={e=>atualizarCategoriaCompra(idx,{quantidade:e.target.value})}/>
                    </Field>
                    <Field label="Peso médio (kg)">
                      <input type="number" step="0.1" value={c.peso_medio} placeholder="0,0" onChange={e=>atualizarCategoriaCompra(idx,{peso_medio:e.target.value})}/>
                    </Field>
                    <Field label="Preço/kg (R$)" required>
                      <input type="number" step="0.01" value={c.preco_kg} placeholder="0,00" onChange={e=>atualizarCategoriaCompra(idx,{preco_kg:e.target.value})}/>
                    </Field>
                    {compraCategorias.length > 1 && (
                      <button type="button" className="btn-icon" title="Remover categoria" onClick={()=>removerCategoriaCompra(idx)}>
                        <i className="ti ti-trash" style={{fontSize:13}}/>
                      </button>
                    )}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <Field label="Proprietário" required>
                      <select value={c.proprietario_id} onChange={e=>atualizarCategoriaCompra(idx,{proprietario_id:e.target.value})}>
                        <option value="">— selecione —</option>
                        {props.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                      </select>
                    </Field>
                    <Field label="Data de nascimento estimada" required hint="Pré-preenchida pela categoria — pode ajustar">
                      <input type="date" value={c.data_nascimento_estimada} onChange={e=>atualizarCategoriaCompra(idx,{data_nascimento_estimada:e.target.value})}/>
                    </Field>
                  </div>

                  <div style={{marginTop:8}}>
                    <button type="button" onClick={()=>atualizarCategoriaCompra(idx,{mostrarPesosIndividuais: !c.mostrarPesosIndividuais})}
                      style={{fontSize:'.76rem',color:'#2B6CD9',background:'none',border:'none',padding:0,cursor:'pointer'}}>
                      {c.mostrarPesosIndividuais ? '− ocultar pesos individuais' : '+ pesos individuais (opcional)'}
                    </button>
                    {c.mostrarPesosIndividuais && r?.qtdNum > 0 && (
                      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
                        {Array.from({length:r.qtdNum}).map((_,pos)=>(
                          <div key={pos} style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                            <span style={{fontSize:'.66rem',color:'#9CA3AF'}}>#{pos+1}</span>
                            <input type="number" step="0.1" value={c.pesos_individuais?.[pos] ?? ''}
                              onChange={e=>setPesoIndividualCompra(idx,pos,e.target.value)}
                              placeholder="Dig. peso kg"
                              style={{width:64,fontSize:'.74rem',padding:'2px 4px'}}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Item 8 — categoria comprada já prenha: oferece criar o
                      lote que representa a monta de origem, opcional. Sem
                      isso, a vaca nunca aparece em maesElegiveis (nenhum lote
                      com diagnóstico 'P') e o nascimento do terneiro dela
                      fica bloqueado (todo parto exige safra vinculada). */}
                  {/* Nunca em simulação (compra_sim não cadastra animal
                      nenhum — não haveria o que vincular). */}
                  {!ehSimulacaoTransac && c.categoria?.includes('Prenha') && (() => {
                    const modo = c.prenhezModo || 'parto'
                    const { dataMonta, dataPartoPrevisto } = derivarDatasGestacao({
                      dataMonta: modo === 'monta' ? c.prenhezDataMonta : '',
                      dataPartoPrevisto: modo === 'parto' ? c.prenhezDataPartoPrevisto : '',
                    })
                    return (
                      <div style={{marginTop:8,padding:'8px 12px',background:'#F3F0FF',border:'.5px solid #C4B5FD',borderRadius:8}}>
                        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'.82rem',color:'#3C3489',fontWeight:500,cursor:'pointer'}}>
                          <input type="checkbox" checked={!!c.prenhezAtiva}
                            onChange={e=>atualizarCategoriaCompra(idx,{prenhezAtiva:e.target.checked})} />
                          Registrar a prenhez já confirmada (cria um lote "{PRENHEZ_ADQUIRIDA_LABEL}")
                        </label>
                        {c.prenhezAtiva && (
                          <div style={{marginTop:10}}>
                            <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}}>
                              <Field label="Você sabe...">
                                <select value={modo} onChange={e=>atualizarCategoriaCompra(idx,{prenhezModo:e.target.value, prenhezDataMonta:'', prenhezDataPartoPrevisto:''})}>
                                  <option value="parto">A data prevista de parto</option>
                                  <option value="monta">A data da monta</option>
                                </select>
                              </Field>
                              {modo === 'monta' ? (
                                <Field label="Data da monta (estimada)" required>
                                  <input type="date" value={c.prenhezDataMonta||''} onChange={e=>atualizarCategoriaCompra(idx,{prenhezDataMonta:e.target.value})} />
                                </Field>
                              ) : (
                                <Field label="Data prevista de parto" required>
                                  <input type="date" value={c.prenhezDataPartoPrevisto||''} onChange={e=>atualizarCategoriaCompra(idx,{prenhezDataPartoPrevisto:e.target.value})} />
                                </Field>
                              )}
                              {dataMonta && dataPartoPrevisto && (
                                <div style={{fontSize:'.76rem',color:'#6B7280',paddingBottom:8}}>
                                  {modo==='monta' ? `Parto previsto: ${fmtData(dataPartoPrevisto)}` : `Monta estimada: ${fmtData(dataMonta)}`}
                                  {' '}(gestação de {GESTACAO_ANGUS_DIAS} dias)
                                </div>
                              )}
                            </div>
                            <Field label="Estação de monta" hint="Agrupa este lote com as demais montas desta estação">
                              <select value={c.prenhezCriandoEstacao ? '__nova__' : (c.prenhezEstacaoId||'')}
                                onChange={e=>{
                                  const v = e.target.value
                                  if (v === '__nova__') atualizarCategoriaCompra(idx,{prenhezEstacaoId:'', prenhezCriandoEstacao:true})
                                  else atualizarCategoriaCompra(idx,{prenhezEstacaoId:v||null, prenhezCriandoEstacao:false})
                                }}>
                                <option value="">— nenhuma —</option>
                                {estacoesCompra.map(es=><option key={es.id} value={es.id}>{es.nome} ({fmtData(es.inicio)}{es.fim?` – ${fmtData(es.fim)}`:''})</option>)}
                                <option value="__nova__">+ Criar nova estação de monta…</option>
                              </select>
                            </Field>
                            {c.prenhezCriandoEstacao && (
                              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
                                <Field label="Nome da estação" required>
                                  <input value={c.prenhezNovaEstacaoNome||''} onChange={e=>atualizarCategoriaCompra(idx,{prenhezNovaEstacaoNome:e.target.value})} placeholder="ex: Estação 2026/27" />
                                </Field>
                                <Field label="Início" required>
                                  <input type="date" value={c.prenhezNovaEstacaoInicio||''} onChange={e=>atualizarCategoriaCompra(idx,{prenhezNovaEstacaoInicio:e.target.value})} />
                                </Field>
                              </div>
                            )}
                            <div style={{fontSize:'.72rem',color:'#5B52A3',marginTop:8}}>
                              O lote fica rotulado "{PRENHEZ_ADQUIRIDA_LABEL}" — nunca se confunde com uma monta feita
                              aqui na fazenda. As {r?.qtdNum || 0} matriz(es) desta categoria entram já com diagnóstico
                              Prenha confirmado nesse lote, e os terneiros delas passam a contar normalmente nos
                              índices da safra (parição, mortalidade, GMD Terneiros, kg desmamado).
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {r && r.precoNum !== null && (r.subtotal > 0 || r.qtdComPesoIndividual > 0 || r.qtdComPesoMedio > 0) && (
                    <div style={{marginTop:6}}>
                      {r.subtotal > 0 && (
                        <div style={{textAlign:'right',fontSize:'.8rem',fontWeight:500,color:'#791F1F'}}>
                          Subtotal: {fmtMoeda(r.subtotal)}
                        </div>
                      )}
                      <div style={{textAlign:'right',fontSize:'.72rem',fontWeight:400,color:'#9B7373',marginTop:2}}>
                        {r.qtdComPesoIndividual > 0 && (
                          <div>{r.qtdComPesoIndividual}x {r.categoria} · peso individual (média {fmtKg(r.mediaPesoIndividual)} kg) × {fmtMoeda(r.precoNum)} = {fmtMoeda(r.valorIndividual)}</div>
                        )}
                        {r.qtdComPesoMedio > 0 && (
                          r.pesoNum !== null
                            ? <div>{r.qtdComPesoMedio}x {r.categoria} · peso médio {fmtKg(r.pesoNum)} kg × {fmtMoeda(r.precoNum)} = {fmtMoeda(r.valorMedio)}</div>
                            : <div>{r.qtdComPesoMedio}x {r.categoria} (falta peso médio)</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            <button type="button" className="btn btn-secondary btn-sm" onClick={adicionarCategoriaCompra} style={{marginBottom:10}}>
              <i className="ti ti-plus"/> Adicionar categoria
            </button>

            {totalCompra > 0 && (
              <div style={{background:'#FDEEEE',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:'.85rem',color:'#791F1F',fontWeight:500}}>
                Total: {resumoCompra.reduce((s,r)=>s+(r.qtdNum||0),0)} animal(is) — {fmtMoeda(totalCompra)}
              </div>
            )}

            <div className="grid-form">
              <Field label="Contraparte"><input value={form.contraparte||''} onChange={e=>setForm(p=>({...p,contraparte:e.target.value}))} placeholder="Vendedor"/></Field>
              <Field label="Comissão (R$)"><input type="number" step="0.01" value={form.comissao??''} onChange={e=>setForm(p=>({...p,comissao:e.target.value}))} placeholder="0,00"/></Field>
              <Field label="Funrural / Imposto (R$)"><input type="number" step="0.01" value={form.imposto??''} onChange={e=>setForm(p=>({...p,imposto:e.target.value}))} placeholder="0,00"/></Field>
              <Field label="Frete (R$)"><input type="number" step="0.01" value={form.frete??''} onChange={e=>setForm(p=>({...p,frete:e.target.value}))} placeholder="0,00"/></Field>
            </div>
          </div>
        )}

        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-primary" onClick={confirmarTransacao}
            disabled={saving
              || (ehSimulacaoTransac ? !podeEditarFinanceiro : !podeEditarFinCiclo)
              || (ehVendaShape && vendaSelecionados.length===0)
              || (ehCompraShape && compraCategorias.length===0)}>
            {saving?'Salvando...':<><i className="ti ti-check"/>{ehSimulacaoTransac?'Simular':'Registrar'}</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Confirmação de exclusão de lançamento (avisa se reativa venda ou apaga compra) ── */}
      <Confirm
        open={!!confirmDelLanc}
        onClose={()=>setConfirmDelLanc(null)}
        title="Excluir lançamento"
        danger
        message={(() => {
          if (!confirmDelLanc) return ''
          const { vendaQtd, compraQtd } = efeitosExclusaoLanc(confirmDelLanc.id)
          if (vendaQtd > 0) {
            return `Isto vai reativar ${vendaQtd} animal${vendaQtd>1?'is':''} e apagar o registro da venda (transações e rateios por proprietário inclusos). Esta ação não pode ser desfeita.`
          }
          if (compraQtd > 0) {
            return `Isto vai apagar ${compraQtd} animal${compraQtd>1?'is':''} cadastrados por esta compra (e o registro da compra), desde que nenhum deles tenha pesagem, sanidade, evento reprodutivo ou outra transação depois. Se algum tiver, a exclusão será bloqueada. Esta ação não pode ser desfeita.`
          }
          if (estoqueDoLancDel.length > 0) {
            const partes = estoqueDoLancDel.map(m => m.tipo === 'E'
              ? `remover ${parseFloat(m.quantidade).toFixed(1)} ${m.item?.unidade||''} de "${m.item?.item||'item'}"`
              : `devolver ${parseFloat(m.quantidade).toFixed(1)} ${m.item?.unidade||''} a "${m.item?.item||'item'}"`
            ).join('; ')
            return `Isto vai reverter a movimentação de estoque vinculada (${partes}) e apagar este lançamento. Esta ação não pode ser desfeita.`
          }
          return 'Excluir este lançamento? Esta ação não pode ser desfeita.'
        })()}
        onConfirm={() => excluirLanc(confirmDelLanc.id)}
      />

      {/* ── Confirmação de exclusão de simulação ── */}
      <Confirm
        open={!!confirmDelSim}
        onClose={()=>setConfirmDelSim(null)}
        title="Excluir simulação"
        danger
        message="Excluir esta simulação? Ela não afeta dados reais, só a consulta. Esta ação não pode ser desfeita."
        onConfirm={() => excluirSimulacao(confirmDelSim.id)}
      />
    </div>
  )
}
