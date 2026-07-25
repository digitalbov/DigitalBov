import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useFazenda } from '../lib/FazendaContext'
import { useConta } from '../lib/ContaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import {
  fmtData, pct, contarMatrizes, contarExpostas, contarPrenhas, calcTaxaPrenhez, calcCategoriaRebanho, algumErro,
  GESTACAO_MAX_DIAS, calcGestacaoLote, calcDesmameMetrics, calcIntervaloPartos, statusReprodutivoExibicao,
  dataNaoFutura, resolverPaiDerivado,
} from '../lib/helpers'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TABS = ['Lotes / Montas','Nascimentos','Índices']
const GESTACAO_ANGUS_DIAS = 283
const GESTACAO_MIN_DIAS = 260

// Card único do funil da safra reprodutiva (Matrizes aptas → Aproveitamento →
// Inseminadas → Prenhez → Partos/Parição → Perdas). Reaproveitado tanto no
// detalhe de um lote quanto, consolidado, na aba Índices — mesmo visual nos
// dois lugares para o usuário reconhecer facilmente.
function CardResultadoSafra({ titulo, sm, andamento, previsao, tipo }) {
  // Rótulo condicional ao tipo do lote (IA/natural) — em contexto consolidado
  // (tipo indefinido, mistura os dois), usa o rótulo genérico "Expostas".
  const rotuloExpostas = tipo === 'ia' ? 'Inseminadas' : tipo === 'natural' ? 'Expostas (monta natural)' : 'Expostas'
  return (
    <div className="card" style={{ marginBottom:14 }}>
      <div className="card-title"><i className="ti ti-report-analytics" /> {titulo}</div>
      <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:10 }}>
        Índices ancorados na(s) monta(s) desta safra — os partos podem ocorrer no ciclo seguinte, mas pertencem à safra da monta.
      </div>
      {andamento && (
        <AlertBox type="amber" icon="ti-hourglass"
          title="Safra em andamento — perda gestacional parcial"
          body={`${sm.nAbortos} aborto${sm.nAbortos!==1?'s':''} registrado${sm.nAbortos!==1?'s':''} · ${sm.gestando} gestaç${sm.gestando!==1?'ões':'ão'} em andamento · perda gestacional final a apurar. Próximos partos previstos a partir de ${fmtData(previsao)}.`} />
      )}
      <div className="grid-4" style={{ marginTop:10 }}>
        {[
          ['Matrizes aptas',               sm.matrizesAptas,                                                '#374151'],
          ['Taxa de aproveitamento',       sm.txAproveitamento!=null?`${sm.txAproveitamento}%`:'—',         '#2B6CD9', 'Matrizes expostas (distintas) ÷ matrizes aptas. Acima de 100% indica que fêmeas com menos de 24 meses foram expostas (novilhas precoces) — não é um erro.'],
          [rotuloExpostas,                 sm.total,                                                        '#111'   ],
          ['Prenhas',                      sm.prenhas,                                                      '#1E55B0'],
          ['Taxa de prenhez',              sm.txPrenhez!=null?`${sm.txPrenhez}%`:'—',                      '#1E55B0', 'Matrizes distintas com diagnóstico P ÷ matrizes distintas expostas (não conta a mesma vaca 2x se ela entrou na IATF e no repasse).'],
          ['Gestando',                     sm.gestando,                                                      '#92620A', 'Prenhas cuja monta ainda está dentro da janela normal de gestação e sem parto/aborto registrado — não contam como perda.'],
          ['Abortos',                      sm.nAbortos,                                                     '#791F1F'],
          ['Perdas não identificadas',     sm.perdasNaoIdentificadas,                                       '#791F1F', 'Prenhas que já passaram da janela de gestação sem parto nem aborto registrado — só entram aqui depois que a gestação deveria ter terminado.'],
          ['Perda gestacional',            sm.perdaGestacional!=null?`${sm.perdaGestacional}%`:'—',        '#791F1F', 'Abortos + perdas não identificadas ÷ prenhas. Prenhas ainda gestando não entram nesse cálculo.'],
          ['Partos',                       sm.nascimentos,                                                  '#0C447C'],
          ['Taxa de parição (natalidade)', sm.txNatalidade!=null?`${sm.txNatalidade}%`:'—',                '#0C447C', 'Partos realizados até agora ÷ matrizes expostas — tende a ser baixa enquanto a safra está em andamento.'],
          ['Peso médio ao nascer',         sm.pesoMedioNascimento!=null?`${sm.pesoMedioNascimento.toFixed(1).replace('.',',')} kg`:'—', '#0C447C', 'Média das pesagens tipo "nascimento" dos bezerros desta safra.'],
          ['Mortalidade de terneiros',     sm.mortalidadeBezerros!=null?`${sm.mortalidadeBezerros}%`:'—',  '#791F1F'],
          ['Desmamados',                   sm.desmamados,                                                   '#166534'],
          ['Taxa de desmama',              sm.txDesmama!=null?`${sm.txDesmama}%`:'—',                      '#166534'],
          ['Peso médio ao desmame',        sm.pesoMedioDesmame!=null?`${sm.pesoMedioDesmame} kg`:'—',       '#166534'],
          ['P205 médio',                   sm.p205Medio!=null?`${sm.p205Medio} kg`:'—',                    '#166534'],
          ['Kg desmamado / matriz exposta',sm.kgPorMatrizExposta!=null?`${sm.kgPorMatrizExposta} kg`:'—',   '#166534'],
        ].map(([l,v,c,tip]) => (
          <div key={l} title={tip} style={{ background:'white',border:'.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',textAlign:'center', cursor:tip?'help':'default' }}>
            <div style={{ fontSize:'1.15rem',fontWeight:600,color:c }}>{v}</div>
            <div style={{ fontSize:'.72rem',color:'#6B7280',marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:10, lineHeight:1.5 }}>
        Taxa de aproveitamento acima de 100% indica que fêmeas com menos de 24 meses foram expostas (novilhas precoces) — é um sinal de boa arquitetura de rebanho, não um erro; abaixo de 100% indica matrizes aptas que ficaram ociosas.
        Matrizes expostas e prenhas contam animais distintos (uma vaca exposta na IATF e no repasse conta 1x).
        Perda gestacional = (abortos registrados + perdas não identificadas) ÷ prenhas — prenhas ainda dentro da janela de gestação (gestando) NÃO contam como perda.
        Perdas não identificadas = prenhas − partos − abortos − gestando (só as que já deveriam ter parido e não pariram nem abortaram).
        Mortalidade de terneiros = terneiros com situação "morto" entre os partos desta safra ÷ total de partos.
        Taxa de desmama e kg/matriz exposta usam as matrizes expostas (distintas) como base, não os nascidos — referência de mercado para kg/matriz exposta: acima de 160 kg.
      </div>
    </div>
  )
}

// Painel de filtros unificado para a seleção de animais (lote + proprietário +
// categoria), usado nos modais "Novo lote" e "Adicionar animais ao lote".
function PainelFiltroAnimais({ lotesSistema, proprietarios, categorias, filtroLote, setFiltroLote, filtroProp, setFiltroProp, filtroCateg, setFiltroCateg }) {
  return (
    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
      <select value={filtroLote} onChange={e => setFiltroLote(e.target.value)}
        className="input" style={{ flex:'1 1 150px', minWidth:0 }}>
        <option value="">Todos os lotes</option>
        {lotesSistema.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
      </select>
      <select value={filtroProp} onChange={e => setFiltroProp(e.target.value)}
        className="input" style={{ flex:'1 1 150px', minWidth:0 }}>
        <option value="">Todos os proprietários</option>
        {proprietarios.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      <select value={filtroCateg} onChange={e => setFiltroCateg(e.target.value)}
        className="input" style={{ flex:'1 1 150px', minWidth:0 }}>
        <option value="">Todas as categorias</option>
        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )
}

export default function Reprodutivo() {
  const { podeEditar } = usePermissoes()
  const podeEditarReprod = podeEditar('reprodutivo')
  const { fazendaAtual } = useFazenda()
  const { contaAtual } = useConta()
  const { cicloDaData, dataEhEditavel } = useCiclo()
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()
  const statusCicloLocal = statusCiclo(cicloLocal)
  const location = useLocation()
  const abrirLoteConsumido = useRef(false)
  const podeEditarReprodCiclo = podeEditarReprod && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const refLotes   = useRef(null)
  const refDiag    = useRef(null)
  const refNasc    = useRef(null)
  const refIndices = useRef(null)

  const [tab,     setTab]    = useState(0)
  const [animais, setAnimais]= useState([])
  // TODOS os animais (qualquer situação — ativo/vendido/morto), só pra
  // contarMatrizes/ehMatriz nos cálculos HISTÓRICOS (matrizesAptas por lote e
  // kpiMatrizesAptas do funil). `animais` (acima) continua só ativos, de
  // propósito, pra tudo que é ação sobre o rebanho atual (selecionar vaca pra
  // um lote novo, mãe elegível etc.) — só o cálculo de matriz histórica não
  // pode usar essa lista restrita, senão uma vaca vendida some retroativamente
  // das matrizes aptas de um ciclo em que ela participou (regressão corrigida
  // aqui — ver comentário em ehMatriz, helpers.js).
  const [todosAnimaisHistorico, setTodosAnimaisHistorico] = useState([])
  const [lotes,   setLotes]  = useState([])
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [modal,   setModal]  = useState(null)
  const [form,    setForm]   = useState({})
  const [selBrs,  setSelBrs] = useState([])
  const [loteEdit, setLoteEdit] = useState(null)
  const [lotesSistema, setLotesSistema] = useState([])
  const [filtroLoteInsem, setFiltroLoteInsem] = useState('')
  const [filtroPropInsem, setFiltroPropInsem] = useState('')
  const [filtroCategInsem, setFiltroCategInsem] = useState('')
  const [buscaBrincoLote, setBuscaBrincoLote] = useState('')
  const [selBrsAdd, setSelBrsAdd] = useState([])
  const [saving,  setSaving] = useState(false)
  const [selLote,     setSelLote]    = useState(null)
  const [selInsem,    setSelInsem]   = useState([])
  const [removendoLote, setRemovendoLote] = useState(false)
  const [filtroPropLote, setFiltroPropLote] = useState('') // filtro visual dos animais dentro do detalhe do lote
  const [filtroPropIdx,  setFiltroPropIdx]  = useState('') // filtra o funil da aba Índices por proprietário
  // todosLotes/todosPartos cobrem TODOS os ciclos (necessário pro histórico da
  // aba Índices e pra localizar a monta de uma mãe fora do ciclo selecionado).
  // É a query mais pesada da tela (embeds aninhados de inseminações, partos,
  // pesagens e abortos) — só é buscada quando a aba Nascimentos ou Índices é
  // aberta (ver useEffect abaixo), nunca no carregamento inicial da aba Lotes.
  const [todosLotes,  setTodosLotes] = useState([])
  const [todosPartos, setTodosPartos]= useState([])
  const [todosStale,  setTodosStale] = useState(true)
  const [loadingIdx,  setLoadingIdx] = useState(false)
  const [sortCol,     setSortCol]    = useState('data')
  const [sortAsc,     setSortAsc]    = useState(false)

  // Estação de monta (agrupador de lotes: IATF + repasses)
  const [estacoes,     setEstacoes]     = useState([])
  const [estacaoIdxSel, setEstacaoIdxSel] = useState('')
  const [estacaoEdit,  setEstacaoEdit]  = useState(null) // {id, nome, inicio, fim} em edição
  const [savingEstacao, setSavingEstacao] = useState(false)

  // Aborto (registrado a partir de uma inseminação com diagnóstico 'P')
  const [abortoAlvo, setAbortoAlvo] = useState(null)
  const [formAborto, setFormAborto] = useState({})
  const [editAborto, setEditAborto] = useState(null)

  // Data única do diagnóstico de gestação, aplicada a todos os cliques/voz no
  // lote selecionado (em vez de sempre usar a data do clique) — reseta pra hoje
  // sempre que o lote selecionado muda (ver useEffect abaixo).
  const [dataDiagLote, setDataDiagLote] = useState(() => hojeISO())
  const [editDiag, setEditDiag] = useState(null)

  // Desmame direto no detalhe do lote — atalho pra não precisar ir até a aba
  // Desmame de Pesagens. Uma única data no topo do card (mesmo padrão de
  // dataDiagLote) aplicada a todos os registros; formDesmame guarda só o peso
  // por parto.id, que é opcional (dá pra desmamar sem informar peso).
  const [dataDesmameLote,  setDataDesmameLote]  = useState(() => hojeISO())
  const [formDesmame,      setFormDesmame]      = useState({})
  const [salvandoDesmameId, setSalvandoDesmameId] = useState(null)

  // Nascimentos tab state
  const [partosNasc,    setPartosNasc]    = useState(null)
  const [loadingNasc,   setLoadingNasc]   = useState(false)
  const [filtroNasc,    setFiltroNasc]    = useState('todos')
  const [proprietarios, setProprietarios] = useState([])
  const [editParto,     setEditParto]     = useState(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (cicloLocal) loadCicloScoped(cicloLocal.id) }, [cicloLocal?.id])
  useEffect(() => { setSelInsem([]); setFiltroPropLote(''); setDataDiagLote(hojeISO()); setDataDesmameLote(hojeISO()) }, [selLote?.id])
  // Diagnóstico temporário: abortos do lote aberto no detalhe.
  useEffect(() => {
    if (selLote) console.log('[Reprodutivo] abortos do lote selecionado:', selLote.numero, selLote.id, selLote.abortos)
  }, [selLote])
  useEffect(() => { setFiltroPropIdx('') }, [cicloLocal?.id])
  // Seleciona a primeira estação do ciclo por padrão (senão o painel — e o botão
  // Editar, que só aparece com uma estação selecionada — ficam vazios até o
  // usuário escolher manualmente no dropdown).
  useEffect(() => {
    if (estacoes.length === 0) { if (estacaoIdxSel) setEstacaoIdxSel(''); return }
    if (!estacoes.some(es => es.id === estacaoIdxSel)) setEstacaoIdxSel(estacoes[0].id)
  }, [estacoes])
  // Atualiza selLote com dados frescos sempre que `lotes` muda (evita estado obsoleto após saves)
  useEffect(() => {
    setSelLote(prev => prev ? (lotes.find(l => l.id === prev.id) || prev) : null)
  }, [lotes])
  // Veio de Animais.jsx (clique em "Pai" — monta natural com paternidade
  // indefinida) — abre o lote de origem direto na aba Lotes/Montas. O lote
  // pode ser de um ciclo ANTERIOR ao cicloLocal atual (gestação atravessa a
  // virada de ciclo, mesmo caso do bug de regressão corrigido antes), então
  // troca cicloLocal pro ciclo do lote primeiro — isso recarrega `lotes`
  // (efeito de cicloLocal?.id acima) e este efeito acha o lote na sequência.
  useEffect(() => {
    const alvo = location.state?.abrirLoteId
    if (!alvo || abrirLoteConsumido.current) return
    const cicloAlvoId = location.state.cicloId
    if (cicloAlvoId && cicloAlvoId !== cicloLocal?.id) {
      const cicloAlvo = ciclos.find(c => c.id === cicloAlvoId)
      if (cicloAlvo) { setCicloLocal(cicloAlvo); return }
    }
    const lote = lotes.find(l => l.id === alvo)
    if (!lote) return
    abrirLoteConsumido.current = true
    setTab(0)
    setSelLote(lote)
  }, [location.state, ciclos, cicloLocal, lotes])
  // todosLotes/todosPartos (todos os ciclos) só são buscados quando o usuário
  // realmente precisa deles: aba Nascimentos (vínculo da safra) ou Índices.
  useEffect(() => { if ((tab === 1 || tab === 2) && todosStale) loadTodos() }, [tab, todosStale])
  useEffect(() => { setPartosNasc(null) }, [cicloLocal?.id])
  useEffect(() => {
    if (tab === 1 && cicloLocal && partosNasc === null) loadPartosNasc(cicloLocal.id)
  }, [tab, cicloLocal, partosNasc])

  const loadAll = async (showLoading = true) => {
    if (showLoading) { setLoading(true); setLoadError(false) }
    try {
      const base = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.animais.list(),
        db.proprietarios.list(),
        db.lotes.list(),
        db.transacaoAnimaisItens.listDataEntradaCompras(),
      ])
      if (algumErro('[Reprodutivo]', base)) { if (showLoading) setLoadError(true); return }
      const [ra, raTodos, rprops, ls, rEntradas] = base
      // data_entrada (só animais comprados) mesclada uma vez aqui — usada por
      // ehMatriz (helpers.js) pra excluir a comprada dos cohorts de matriz em
      // ciclos ANTERIORES à compra (calcLoteMetrics/kpiMatrizesAptas abaixo).
      const entradaMap = new Map(
        (rEntradas.data || []).map(r => [r.animal_id, r.transacoes_animais?.data || null])
      )
      const comEntrada = (lista) => (lista || []).map(a => ({ ...a, data_entrada: entradaMap.get(a.id) || null }))
      setAnimais(comEntrada(ra.data))
      setTodosAnimaisHistorico(comEntrada(raTodos.data))
      setProprietarios(rprops.data || [])
      setLotesSistema(ls.data || [])
      // Qualquer carregamento/mutação pode ter afetado o histórico completo —
      // marca para recarregar na próxima vez que a aba Nascimentos/Índices abrir.
      setTodosStale(true)
      if (cicloLocal) await loadCicloScoped(cicloLocal.id)
    } catch (e) {
      console.error('[Reprodutivo] erro ao carregar:', e)
      if (showLoading) setLoadError(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  // Dados do CICLO selecionado — leve, buscado sempre (aba Lotes é a tela inicial)
  const loadCicloScoped = async (cicloId) => {
    try {
      const results = await Promise.all([
        db.lotesInseminacao.list(cicloId),
        db.estacoesMonta.list(cicloId)
      ])
      if (algumErro('[Reprodutivo]', results)) { setLoadError(true); return }
      const [rl, re] = results
      // Diagnóstico temporário: abortos por lote deste ciclo, como vieram do embed.
      console.log('[Reprodutivo] abortos por lote (ciclo ' + cicloId + '):',
        (rl.data || []).map(l => ({ lote: l.numero, lote_id: l.id, ciclo_id: l.ciclo_id, nAbortos: (l.abortos || []).length, abortos: l.abortos }))
      )
      setLotes(rl.data || [])
      setEstacoes(re.data || [])
    } catch (e) {
      console.error('[Reprodutivo] erro ao carregar dados do ciclo:', e)
      setLoadError(true)
    }
  }

  const loadPartosNasc = async (cicloId) => {
    setLoadingNasc(true)
    const { data, error } = await db.partos.list(cicloId)
    if (error) console.error('[Reprodutivo] erro ao buscar nascimentos:', error)
    setPartosNasc(data || [])
    setLoadingNasc(false)
  }

  // Histórico completo (todos os ciclos) — carregado sob demanda, ver useEffect acima
  const loadTodos = async () => {
    setLoadingIdx(true)
    const results = await Promise.all([
      db.lotesInseminacao.listAll(),
      db.partos.listAll()
    ])
    algumErro('[Reprodutivo]', results) // histórico é dado secundário/lazy — loga mas não derruba a tela
    const [rl, rp] = results
    setTodosLotes(rl.data || [])
    setTodosPartos(rp.data || [])
    setTodosStale(false)
    setLoadingIdx(false)
  }

  const femsAtivas = animais.filter(a => a.sexo === 'F')
  const femsVazias = femsAtivas.filter(a => a.sit_reprodutiva === 'vazia')
  // Filtro unificado: lote + proprietário + categoria, aplicados juntos na
  // seleção de animais (modais "Novo lote" e "Adicionar animais"). A categoria é
  // calculada com o mesmo helper usado no resto do sistema (calcCategoriaRebanho).
  const femsVaziasPreCateg = femsVazias
    .filter(a => !filtroLoteInsem || a.lote_id === filtroLoteInsem)
    .filter(a => !filtroPropInsem || a.proprietario_id === filtroPropInsem)
  const categoriasInsemDisponiveis = [...new Set(
    femsVaziasPreCateg.map(a => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro))
  )].sort()
  const femsVaziasFiltradas = femsVaziasPreCateg
    .filter(a => !filtroCategInsem || calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) === filtroCategInsem)
  const femsForaDoLote = selLote
    ? femsVaziasFiltradas.filter(a => !(selLote.inseminacoes||[]).some(i => i.animal_id === a.id))
    : []

  // Apenas fêmeas com diagnóstico 'P' confirmado em algum lote de inseminação.
  // Usa todosLotes (não apenas o ciclo selecionado): a gestação (~283 dias) costuma
  // atravessar a virada do ciclo, então a monta pode ter sido num ciclo anterior.
  const maesElegiveis = femsAtivas.filter(a =>
    a.sit_reprodutiva === 'prenha' &&
    todosLotes.some(l => l.inseminacoes?.some(i => i.animal_id === a.id && i.diagnostico === 'P'))
  )

  // Acha o lote de inseminação (safra) mais provável para o nascimento: entre os
  // lotes com diagnóstico 'P' para a mãe, o que cai numa janela de gestação
  // plausível (260–300 dias) mais próxima do padrão (283 dias).
  const encontrarLoteSafra = (maeId, dataParto) => {
    if (!maeId || !dataParto) return null
    const dParto = new Date(dataParto + 'T12:00:00')
    let melhor = null, melhorDelta = Infinity
    todosLotes.forEach(l => {
      if (!l.data) return
      if (!l.inseminacoes?.some(i => i.animal_id === maeId && i.diagnostico === 'P')) return
      const dias = Math.round((dParto - new Date(l.data + 'T12:00:00')) / 86400000)
      if (dias < GESTACAO_MIN_DIAS || dias > GESTACAO_MAX_DIAS) return
      const delta = Math.abs(dias - GESTACAO_ANGUS_DIAS)
      if (delta < melhorDelta) { melhorDelta = delta; melhor = l }
    })
    return melhor
  }

  const togSel = (br) => setSelBrs(prev =>
    prev.includes(br) ? prev.filter(b => b !== br) : [...prev, br]
  )

  // Cria a estação de monta inline (usado ao salvar um lote com "+ Criar nova estação")
  const criarEstacaoInline = async (cicloId) => {
    if (!form.nova_estacao_nome || !form.nova_estacao_inicio) {
      toast('Preencha nome e início da nova estação de monta.', 'error')
      return { error: true }
    }
    const { data, error } = await db.estacoesMonta.insert({
      ciclo_id: cicloId,
      nome:     form.nova_estacao_nome,
      inicio:   form.nova_estacao_inicio,
      fim:      form.nova_estacao_fim || null,
    })
    if (error || !data) { toast('Erro ao criar estação: ' + (error?.message || ''), 'error'); return { error: true } }
    return { id: data.id }
  }

  const abrirEditarEstacao = (es) => {
    if (!podeEditarReprodCiclo) return
    setEstacaoEdit({ id: es.id, nome: es.nome, inicio: es.inicio || '', fim: es.fim || '' })
  }

  // Salva a edição da estação de monta — só permite alterar início/fim se TODOS
  // os lotes já vinculados a ela couberem no novo intervalo (senão o histórico
  // da safra fica inconsistente com o período declarado da estação).
  const salvarEdicaoEstacao = async () => {
    if (!podeEditarReprodCiclo || !estacaoEdit) return
    const { id, nome, inicio, fim } = estacaoEdit
    if (!nome || !inicio) { toast('Preencha nome e início da estação.', 'error'); return }
    if (fim && fim < inicio) { toast('A data de fim não pode ser anterior ao início.', 'error'); return }

    const lotesDaEstacao = lotes.filter(l => l.estacao_monta_id === id)
    const foraDoIntervalo = lotesDaEstacao.filter(l =>
      l.data && (l.data < inicio || (fim && l.data > fim))
    )
    if (foraDoIntervalo.length > 0) {
      const lista = foraDoIntervalo.map(l => `Lote ${l.numero} (${fmtData(l.data)})`).join(', ')
      toast(
        `Não é possível alterar: ${lista} ficaria${foraDoIntervalo.length > 1 ? 'm' : ''} fora do novo período. Ajuste as datas para incluir todos os lotes da estação.`,
        'error'
      )
      return
    }

    setSavingEstacao(true)
    const { error } = await db.estacoesMonta.update(id, { nome, inicio, fim: fim || null })
    setSavingEstacao(false)
    if (error) { toast('Erro ao salvar estação: ' + error.message, 'error'); return }
    toast('Estação de monta atualizada!')
    setEstacaoEdit(null)
    if (cicloLocal) loadCicloScoped(cicloLocal.id)
  }

  // Exclui a estação de monta. Os lotes vinculados NÃO são apagados — só
  // desvinculados (estacao_monta_id = null) antes da exclusão, para não deixar
  // referência quebrada e não perder o histórico das inseminações.
  const excluirEstacao = async (es) => {
    if (!podeEditarReprodCiclo || !es) return
    const lotesDaEstacao = lotes.filter(l => l.estacao_monta_id === es.id)
    const msg = lotesDaEstacao.length > 0
      ? `Os ${lotesDaEstacao.length} lote${lotesDaEstacao.length !== 1 ? 's' : ''} desta estação serão desvinculados, mas não excluídos. Confirmar?`
      : `Excluir a estação "${es.nome}"? Esta ação não pode ser desfeita.`
    if (!confirm(msg)) return

    setSavingEstacao(true)
    if (lotesDaEstacao.length > 0) {
      await Promise.all(lotesDaEstacao.map(l => db.lotesInseminacao.update(l.id, { estacao_monta_id: null })))
    }
    const { error } = await db.estacoesMonta.delete(es.id)
    setSavingEstacao(false)
    if (error) { toast('Erro ao excluir estação: ' + error.message, 'error'); return }
    toast('Estação de monta excluída.')
    if (estacaoIdxSel === es.id) setEstacaoIdxSel('')
    if (cicloLocal) loadCicloScoped(cicloLocal.id)
  }

  // Salvar lote (cria novo ou edita data/touro/protocolo/estação de um existente)
  const salvarLote = async () => {
    if (!podeEditarReprodCiclo) return
    const ehNaturalSalvar = form.tipo === 'natural'
    // Lista única "Touros" (só monta natural) — o 1º item vai pra
    // lotes_inseminacao.touro (preserva as ~29 leituras que assumem uma
    // string única), o resto vai pra lote_touros. IA continua com form.touro.
    const listaTouros    = ehNaturalSalvar ? (form.touros || []).filter(Boolean) : []
    const touroPrincipal = ehNaturalSalvar ? listaTouros[0] : form.touro
    if (loteEdit) {
      if (!touroPrincipal) { toast(ehNaturalSalvar ? 'Adicione pelo menos um touro.' : 'Preencha o touro.', 'error'); return }
      if (!dataEhEditavel(form.data)) {
        const c = cicloDaData(form.data)
        toast(c
          ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
          : 'Data fora de qualquer ciclo cadastrado.', 'error')
        return
      }
      setSaving(true)
      let estacaoId = form.estacao_monta_id || null
      if (form.criandoEstacao) {
        const r = await criarEstacaoInline(loteEdit.ciclo_id)
        if (r.error) { setSaving(false); return }
        estacaoId = r.id
      }
      const payload = { data: form.data, touro: touroPrincipal, protocolo: form.protocolo || '', estacao_monta_id: estacaoId, tipo: form.tipo || 'ia' }
      const { error } = await db.lotesInseminacao.update(loteEdit.id, payload)
      if (error) { toast('Erro ao atualizar lote: ' + error.message, 'error'); setSaving(false); return }
      // Touros adicionais (monta natural com vários touros) — apaga tudo e
      // recria a partir da lista atual do form; a lista é sempre pequena,
      // substituir é mais simples e seguro que fazer diff linha a linha.
      if (loteEdit.lote_touros?.length > 0) {
        await Promise.all(loteEdit.lote_touros.map(t => db.loteTouros.delete(t.id)))
      }
      const extrasEdit = listaTouros.slice(1)
      if (extrasEdit.length > 0) {
        const rows = extrasEdit.map(nome => ({
          lote_id: loteEdit.id, nome,
          conta_id: loteEdit.conta_id ?? contaAtual?.id,
          fazenda_id: loteEdit.fazenda_id ?? fazendaAtual?.id,
        }))
        const { error: errTouros } = await supabase.from('lote_touros').insert(rows)
        if (errTouros) toast('Lote atualizado, mas houve erro ao salvar touros adicionais: ' + errTouros.message, 'error')
      }
      setSaving(false)
      toast('Lote atualizado!')
      setModal(null); setLoteEdit(null); setForm({}); loadAll()
      return
    }

    if (!form.data || !touroPrincipal || selBrs.length === 0) {
      toast(ehNaturalSalvar && !touroPrincipal ? 'Adicione pelo menos um touro.' : 'Preencha data, touro e selecione animais.', 'error'); return
    }
    if (!dataEhEditavel(form.data)) {
      const cVerif = cicloDaData(form.data)
      toast(cVerif
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const cicloDoLote = cicloDaData(form.data)
    let estacaoId = form.estacao_monta_id || null
    if (form.criandoEstacao) {
      const r = await criarEstacaoInline(cicloDoLote.id)
      if (r.error) { setSaving(false); return }
      estacaoId = r.id
    }
    const { data: loteData, error } = await db.lotesInseminacao.insert({
      ciclo_id: cicloDoLote.id,
      numero: lotes.length + 1,
      data: form.data,
      touro: touroPrincipal,
      protocolo: form.protocolo || '',
      estacao_monta_id: estacaoId,
      tipo: form.tipo || 'ia'
    })
    if (error || !loteData) { toast('Erro ao criar lote.', 'error'); setSaving(false); return }

    // Touros adicionais (monta natural com vários touros) — o 1º touro já foi
    // gravado acima em lotes_inseminacao.touro; aqui só o 2º em diante.
    const extrasNovo = listaTouros.slice(1)
    if (extrasNovo.length > 0) {
      const rowsTouros = extrasNovo.map(nome => ({
        lote_id: loteData.id, nome,
        conta_id: loteData.conta_id ?? contaAtual?.id,
        fazenda_id: loteData.fazenda_id ?? fazendaAtual?.id,
      }))
      const { error: errTouros } = await supabase.from('lote_touros').insert(rowsTouros)
      if (errTouros) toast('Lote criado, mas houve erro ao salvar touros adicionais: ' + errTouros.message, 'error')
    }

    // Inserir inseminações
    const ins = selBrs.map(br => {
      const a = animais.find(x => x.brinco === br)
      return {
        lote_inseminacao_id: loteData.id,
        animal_id:           a?.id,
        conta_id:            loteData.conta_id   ?? contaAtual?.id,
        fazenda_id:          loteData.fazenda_id ?? fazendaAtual?.id,
      }
    }).filter(x => x.animal_id)
    const insRes = await supabase.from('inseminacoes').insert(ins)
    if (insRes.error) { toast('Erro ao registrar inseminações: ' + insRes.error.message, 'error'); setSaving(false); return }

    toast(`Lote ${lotes.length + 1} registrado com ${selBrs.length} animais!`)
    setSaving(false); setModal(null); setSelBrs([]); setForm({}); loadAll()
  }

  const excluirLote = async (l, e) => {
    e.stopPropagation()   // não abrir o detalhe ao clicar no botão
    if (!podeEditarReprodCiclo) return
    if (l.inseminacoes?.some(i => i.diagnostico)) {
      toast('Não é possível excluir: já há diagnóstico registrado.', 'error'); return
    }
    if (!confirm(`Excluir o Lote ${l.numero} (${l.touro})? As inseminações sem diagnóstico serão removidas.`)) return
    const { error } = await db.lotesInseminacao.delete(l.id)
    if (error) { toast('Erro ao excluir: '+error.message, 'error'); return }
    toast('Lote excluído.')
    loadAll()
  }

  const togSelAdd = (br) => setSelBrsAdd(prev =>
    prev.includes(br) ? prev.filter(b => b !== br) : [...prev, br]
  )

  // Adicionar animais a um lote já criado
  const adicionarAnimaisLote = async () => {
    if (!podeEditarReprodCiclo) return
    if (selBrsAdd.length === 0) { toast('Selecione ao menos um animal.', 'error'); return }
    setSaving(true)
    const ins = selBrsAdd.map(br => {
      const a = animais.find(x => x.brinco === br)
      return {
        lote_inseminacao_id: selLote.id,
        animal_id:           a?.id,
        conta_id:            contaAtual?.id,
        fazenda_id:          fazendaAtual?.id,
      }
    }).filter(x => x.animal_id)
    const { error } = await supabase.from('inseminacoes').insert(ins)
    setSaving(false)
    if (error) { toast('Erro ao adicionar animais: ' + error.message, 'error'); return }
    toast(`${ins.length} animal(is) adicionado(s) ao lote!`)
    setModal(null); setSelBrsAdd([]); setFiltroLoteInsem(''); setFiltroPropInsem(''); setFiltroCategInsem('')
    await loadAll(false)
  }

  // Remover animal de um lote (só se ainda não houver diagnóstico)
  const removerInsem = async (ins) => {
    if (!podeEditarReprodCiclo) return
    if (!confirm(`Remover o brinco ${ins.animal?.brinco || ''} deste lote?`)) return
    const { error } = await db.inseminacoes.delete(ins.id)
    if (error) { toast('Erro ao remover: ' + error.message, 'error'); return }
    toast('Animal removido do lote.')
    await loadAll(false)
  }

  const toggleSelInsem = (id) => setSelInsem(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  // Opera sobre a lista VISÍVEL (respeita o filtro por proprietário do detalhe do lote)
  const toggleSelInsemTodos = (insVisiveis) => {
    const todosMarcados = insVisiveis.length > 0 && insVisiveis.every(i => selInsem.includes(i.id))
    setSelInsem(todosMarcados
      ? selInsem.filter(id => !insVisiveis.some(i => i.id === id))
      : [...new Set([...selInsem, ...insVisiveis.map(i => i.id)])])
  }

  // Remover várias inseminações do lote de uma vez (com ou sem diagnóstico)
  const removerInsemSelecionados = async () => {
    if (!podeEditarReprodCiclo) return
    if (selInsem.length === 0) return
    if (!confirm(`Remover ${selInsem.length} animais do lote? (inclui animais já diagnosticados, se houver — o diagnóstico deles será perdido)`)) return
    setRemovendoLote(true)
    const { error } = await db.inseminacoes.deleteVarios(selInsem)
    setRemovendoLote(false)
    if (error) { toast('Erro ao remover: ' + error.message, 'error'); return }
    toast(`${selInsem.length} animais removidos do lote.`)
    setSelInsem([])
    await loadAll(false)
  }

  // Salvar diagnóstico. `dataDiagnostico` é a data REAL do exame (escolhida no
  // campo do topo da lista, ou editada depois) — não a data do clique. criado_em
  // (timestamp real de auditoria) não entra no payload, então o upsert nunca o
  // sobrescreve.
  const salvarDiag = async (loteId, animalId, diag, dataDiagnostico) => {
    if (!podeEditarReprodCiclo) return false
    const lote = lotes.find(l => l.id === loteId)
    // Guarda ligada ao item 2: se a mãe já tem parto vinculado a ESTE lote, o
    // diagnóstico não pode mais ser alterado — clicar "Prenha" de novo nela
    // reescreveria sit_reprodutiva para 'prenha' numa vaca que já pariu.
    const partoDaMae = (lote?.partos || []).find(p => p.mae_id === animalId)
    if (partoDaMae) {
      toast('Esta vaca já pariu neste lote — o diagnóstico não pode ser alterado.', 'error')
      return false
    }
    // Mesma proteção em duas camadas do parto: se já há aborto registrado para
    // esta vaca neste lote, o diagnóstico não pode ser reescrito por cima (senão
    // sit_reprodutiva voltaria pra 'prenha'/'vazia' por engano numa vaca que já
    // teve o desfecho da gestação registrado).
    const abortoDaMae = (lote?.abortos || []).find(ab => ab.animal_id === animalId)
    if (abortoDaMae) {
      toast('Esta vaca teve aborto registrado neste lote — o diagnóstico não pode ser alterado.', 'error')
      return false
    }
    if (!dataEhEditavel(dataDiagnostico)) {
      const c = cicloDaData(dataDiagnostico)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return false
    }
    if (lote?.data && dataDiagnostico < lote.data) {
      toast('A data do diagnóstico não pode ser anterior à data da monta do lote.', 'error')
      return false
    }
    const hoje = hojeISO()
    if (dataDiagnostico > hoje) {
      toast('A data do diagnóstico não pode ser no futuro.', 'error')
      return false
    }
    const payload = [{
      lote_inseminacao_id: loteId,
      animal_id:           animalId,
      diagnostico:         diag,
      data_diagnostico:    dataDiagnostico,
      conta_id:            contaAtual?.id,
      fazenda_id:          fazendaAtual?.id,
    }]
    const { error } = await supabase
      .from('inseminacoes')
      .upsert(payload, { onConflict: 'lote_inseminacao_id,animal_id' })
    if (error) { toast('Erro ao salvar diagnóstico: ' + error.message, 'error'); return false }
    const a = animais.find(x => x.id === animalId)
    if (a) await db.animais.update(animalId, { sit_reprodutiva: diag === 'P' ? 'prenha' : 'vazia' })
    await loadAll(false)
    return true
  }

  // Abre modal pra editar só a DATA de um diagnóstico já registrado (mesmas
  // validações de salvarDiag, diagnóstico em si não muda).
  const abrirEditarDiagData = (ins) => {
    if (!podeEditarReprodCiclo || !ins.diagnostico) return
    setEditDiag({
      loteId: selLote.id, animalId: ins.animal_id, diagnostico: ins.diagnostico,
      data: ins.data_diagnostico || dataDiagLote, brinco: ins.animal?.brinco || '?'
    })
  }

  const salvarEdicaoDiagData = async () => {
    if (!editDiag) return
    const ok = await salvarDiag(editDiag.loteId, editDiag.animalId, editDiag.diagnostico, editDiag.data)
    if (ok) { toast('Data do diagnóstico atualizada.'); setEditDiag(null) }
  }

  // Abre modal de registro de aborto para uma inseminação com diagnóstico 'P'
  const abrirRegistrarAborto = (ins, lote) => {
    if (!podeEditarReprodCiclo) return
    setAbortoAlvo({ animal_id: ins.animal_id, brinco: ins.animal?.brinco || '?', lote_id: lote.id })
    setFormAborto({ data: hojeISO(), causa: 'desconhecido' })
    setModal('aborto')
  }

  // Salva o aborto: grava em abortos, vira a mãe para 'vazia' de novo
  const salvarAborto = async () => {
    if (!podeEditarReprodCiclo || !abortoAlvo) return
    if (!formAborto.data) { toast('Informe a data do aborto.', 'error'); return }
    if (!dataEhEditavel(formAborto.data)) {
      const c = cicloDaData(formAborto.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const cicloDoAborto = cicloDaData(formAborto.data)
    const { error } = await db.abortos.insert({
      animal_id:           abortoAlvo.animal_id,
      lote_inseminacao_id: abortoAlvo.lote_id,
      ciclo_id:             cicloDoAborto?.id || null,
      data:                 formAborto.data,
      causa:                formAborto.causa || 'desconhecido',
      observacoes:          formAborto.observacoes || ''
    })
    if (error) { toast('Erro ao registrar aborto: ' + error.message, 'error'); setSaving(false); return }
    await db.animais.update(abortoAlvo.animal_id, { sit_reprodutiva: 'vazia' })
    toast('Aborto registrado.')
    setSaving(false); setModal(null); setAbortoAlvo(null); setFormAborto({})
    await loadAll(false)
  }

  // Abre modal de edição de um aborto já registrado
  const abrirEditarAborto = (ab, brinco) => {
    if (!podeEditarReprodCiclo) return
    setEditAborto({
      id: ab.id, data: ab.data, causa: ab.causa || 'desconhecido',
      observacoes: ab.observacoes || '', brinco: brinco || ab.animal?.brinco || '?'
    })
  }

  // Salva edição de aborto (data/causa/observações) — mesmas validações de data
  // do registro original.
  const salvarEdicaoAborto = async () => {
    if (!podeEditarReprodCiclo || !editAborto) return
    if (!editAborto.data) { toast('Informe a data do aborto.', 'error'); return }
    if (!dataEhEditavel(editAborto.data)) {
      const c = cicloDaData(editAborto.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    if (selLote?.data && editAborto.data < selLote.data) {
      toast('A data do aborto não pode ser anterior à data da monta do lote.', 'error')
      return
    }
    const hoje = hojeISO()
    if (editAborto.data > hoje) {
      toast('A data do aborto não pode ser no futuro.', 'error')
      return
    }
    const { error } = await db.abortos.update(editAborto.id, {
      data: editAborto.data, causa: editAborto.causa || 'desconhecido', observacoes: editAborto.observacoes || ''
    })
    if (error) { toast('Erro ao atualizar aborto: ' + error.message, 'error'); return }
    toast('Aborto atualizado.')
    setEditAborto(null)
    await loadAll(false)
  }

  // Exclui um aborto. Não reverte sit_reprodutiva automaticamente — mesma lógica
  // cautelosa da exclusão de parto: não há garantia de que a vaca esteja prenha
  // de novo só porque o registro de aborto foi removido.
  const excluirAborto = async (ab) => {
    if (!podeEditarReprodCiclo) return
    if (!confirm(`Excluir o registro de aborto de ${fmtData(ab.data)}? A situação reprodutiva do animal não é alterada automaticamente.`)) return
    const { error } = await db.abortos.delete(ab.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Aborto excluído.')
    await loadAll(false)
  }

  // Salvar parto
  // Gate de PERMISSÃO (podeEditarReprod), não de ciclo — de propósito.
  // partos.ciclo_id vem da DATA do parto (cicloDaData(form.data_parto), ver
  // abaixo), nunca do cicloLocal selecionado na tela: o usuário normalmente
  // encontra a mãe grávida navegando até o LOTE/monta de um ciclo anterior
  // (a gestação atravessa a virada de ciclo), e esse cicloLocal pode já estar
  // "encerrado" mesmo com o parto em si caindo dentro do ciclo atual. Usar
  // podeEditarReprodCiclo aqui bloqueava esse caso, silenciosamente (sem
  // toast). A proteção correta já existe logo abaixo: dataEhEditavel avalia o
  // ciclo da DATA DO PARTO (o que de fato vai ser gravado), não o cicloLocal.
  const salvarParto = async () => {
    if (!podeEditarReprod) return
    if (!form.mae_brinco || !form.data_parto || !form.sexo_bezerro) {
      toast('Preencha mãe, data e sexo.', 'error'); return
    }
    if (!dataEhEditavel(form.data_parto)) {
      const c = cicloDaData(form.data_parto)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    const mae = animais.find(a => a.brinco === form.mae_brinco)
    if (!mae) { toast('Mãe não encontrada.', 'error'); return }
    const cicloDoParto = cicloDaData(form.data_parto)

    // Tudo dentro de try/catch/finally: setSaving(false) TEM que rodar mesmo se
    // algum passo falhar, senão o botão trava em "Registrando..." pra sempre —
    // era exatamente o bug: nenhum erro de insert era checado, então um insert
    // que falhava (ex: brinco duplicado) deixava bezData nulo e a linha
    // seguinte (bezData.id) estourava um TypeError não capturado antes de
    // chegar no setSaving(false), que só existia no fim do caminho de sucesso.
    setSaving(true)
    try {
      // Numeração provisória (SN-01, SN-02...) baseada em partosNasc.length —
      // mas brinco é ÚNICO EM TODO O SISTEMA (constraint animais.brinco), não
      // só no ciclo atual, então esse número "óbvio" pode já estar em uso por
      // um bezerro de outro ciclo/sessão (era o caso do "segundo registro
      // trava": o primeiro pegava SN-01 certo, mas partosNasc só é recarregado
      // DEPOIS do insert, então o segundo registro recalculava o mesmo SN-01
      // antes do estado atualizar e colidia). Em vez de assumir que o número
      // está livre, tenta inserir e, se colidir (23505 = unique_violation),
      // avança pro próximo e tenta de novo.
      let bezData = null
      let numero = (partosNasc?.length || 0) + 1
      let ultimoErro = null
      for (let tentativa = 0; tentativa < 20; tentativa++) {
        const nBrinco = 'SN-' + String(numero).padStart(2, '0')
        const { data, error } = await db.animais.insert({
          brinco: nBrinco, sexo: form.sexo_bezerro,
          data_nascimento: form.data_parto,
          raca: 'Angus', pelagem: 'Preto',
          pai: form.touro_pai || '',
          mae_brinco: mae.brinco,
          mae_id: mae.id,
          proprietario_id: mae.proprietario_id,
          situacao: 'ativo',
          sit_reprodutiva: form.sexo_bezerro === 'F' ? 'vazia' : 'nao_se_aplica'
        })
        if (!error) { bezData = data; break }
        ultimoErro = error
        console.error(`[Reprodutivo] salvarParto: falha ao criar bezerro com brinco ${nBrinco} (tentativa ${tentativa + 1}/20):`, error)
        if (error.code !== '23505') break // só insiste se for colisão de brinco; outro erro não some incrementando o número
        numero++
      }
      if (!bezData) {
        toast('Erro ao criar o bezerro: ' + (ultimoErro?.message || 'não foi possível gerar um brinco provisório livre.'), 'error')
        return
      }

      // Registrar parto — ciclo_id é o ciclo do EVENTO (data do parto); lote_inseminacao_id
      // é a SAFRA (a monta que originou a gestação), que pode ser de um ciclo anterior.
      const { error: errParto } = await db.partos.insert({
        mae_id: mae.id,
        bezerro_id: bezData.id,
        data_parto: form.data_parto,
        ciclo_id: cicloDoParto.id,
        lote_inseminacao_id: form.lote_inseminacao_id || null,
        observacoes: form.obs || ''
      })
      if (errParto) {
        console.error('[Reprodutivo] salvarParto: erro ao inserir parto (bezerro', bezData.brinco, 'já foi criado):', errParto)
        toast(`Bezerro ${bezData.brinco} criado, mas houve erro ao registrar o parto: ` + errParto.message, 'error')
        return
      }

      // Pesagem ao nascer (opcional) — falha aqui não desfaz o parto já
      // registrado, só avisa: o peso pode ser lançado depois em Pesagens.
      if (form.peso_nascimento) {
        const { error: errPeso } = await db.pesagens.insert({
          animal_id: bezData.id,
          data: form.data_parto,
          tipo: 'nascimento',
          peso_kg: parseFloat(form.peso_nascimento),
          observacoes: 'Peso ao nascer'
        })
        if (errPeso) {
          console.error('[Reprodutivo] salvarParto: erro ao registrar peso ao nascer:', errPeso)
          toast('Nascimento registrado, mas o peso ao nascer não foi salvo: ' + errPeso.message, 'error')
        }
      }

      // Atualizar mãe
      const { error: errMae } = await db.animais.update(mae.id, { sit_reprodutiva: 'vazia' })
      if (errMae) console.error('[Reprodutivo] salvarParto: erro ao atualizar sit_reprodutiva da mãe:', errMae)

      toast(`Nascimento registrado! Brinco provisório: ${bezData.brinco}`)
      setModal(null); setForm({})
      await loadAll()
      if (cicloLocal) loadPartosNasc(cicloLocal.id)
    } catch (e) {
      console.error('[Reprodutivo] salvarParto: erro inesperado:', e)
      toast('Erro inesperado ao registrar nascimento: ' + (e?.message || String(e)), 'error')
    } finally {
      setSaving(false)
    }
  }

  // Checa se o bezerro já tem histórico (além da pesagem de nascimento)
  const bezerroTemHistorico = async (bezerroId) => {
    if (!bezerroId) return false
    // conta pesagens: permite no máximo 1 (a de nascimento)
    const { count: nPes } = await db.pesagens.countByAnimal(bezerroId)
    if ((nPes || 0) > 1) return true
    // é mãe de algum parto?
    const { data: comoMae } = await db.partos.byMae(bezerroId)
    if (comoMae && comoMae.length > 0) return true
    return false
  }

  // Excluir nascimento (apaga parto + bezerro)
  const excluirParto = async (p) => {
    if (!podeEditarReprodCiclo) return
    if (await bezerroTemHistorico(p.bezerro_id)) {
      toast('Não é possível excluir: o bezerro já tem histórico (pesagens/partos).', 'error'); return
    }
    if (!confirm(`Excluir o nascimento do bezerro ${p.bezerro?.brinco||''}? O animal e o registro de parto serão removidos.`)) return
    // apaga na ordem: pesagem de nascimento -> parto -> animal
    await db.partos.delete(p.id)
    if (p.bezerro_id) await db.animais.delete(p.bezerro_id)
    // A mãe foi marcada 'vazia' quando o parto foi registrado (salvarParto) e NÃO
    // é revertida para 'prenha' automaticamente aqui: não há garantia de que ela
    // ainda esteja gestante (pode já ter sido reinseminada, abortado etc. desde
    // então) — reverter às cegas arriscaria marcar como prenha uma vaca que não
    // está. Se este era o único parto da mãe no histórico, avisamos para revisão manual.
    const { data: partosRestantes } = await db.partos.byMae(p.mae_id)
    toast((!partosRestantes || partosRestantes.length === 0)
      ? 'Nascimento excluído. Essa era a única cria registrada da mãe — se ela ainda estiver prenha, atualize a situação reprodutiva manualmente no cadastro do animal.'
      : 'Nascimento excluído.')
    loadAll()
    if (cicloLocal) loadPartosNasc(cicloLocal.id)
  }

  // Desmame direto no detalhe do lote — atalho pra aba Desmame de Pesagens.
  // Data única no topo do card (dataDesmameLote), mesmo padrão de dataDiagLote:
  // todo desmame registrado usa essa data até o usuário trocá-la. Peso é
  // OPCIONAL: sempre grava animais.data_desmame; só insere a pesagem
  // tipo='desmama' se um peso válido foi informado.
  const salvarDesmame = async (parto) => {
    if (!podeEditarReprodCiclo) return
    const data = dataDesmameLote
    if (!data) { toast('Informe a data do desmame.', 'error'); return }
    if (!dataNaoFutura(data)) { toast('Data do desmame não pode ser futura.', 'error'); return }
    if (!dataEhEditavel(data)) {
      const c = cicloDaData(data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSalvandoDesmameId(parto.id)
    try {
      const { error: errUpd } = await db.animais.update(parto.bezerro_id, { data_desmame: data })
      if (errUpd) { toast('Erro ao registrar desmame: ' + errUpd.message, 'error'); return }
      const fd = formDesmame[parto.id] || {}
      const peso = fd.peso ? parseFloat(fd.peso) : null
      if (peso && peso > 0) {
        const { error: errPes } = await db.pesagens.insert({
          animal_id: parto.bezerro_id, data, tipo: 'desmama',
          peso_kg: peso, observacoes: 'Peso ao desmame'
        })
        if (errPes) {
          console.error('[Reprodutivo] salvarDesmame: erro ao salvar peso:', errPes)
          toast('Desmame registrado, mas o peso não foi salvo: ' + errPes.message, 'error')
        }
      }
      toast(`Terneiro ${parto.bezerro?.brinco || ''} desmamado!`)
      setFormDesmame(prev => { const n = { ...prev }; delete n[parto.id]; return n })
      await loadAll(false)
    } catch (e) {
      console.error('[Reprodutivo] salvarDesmame: erro inesperado:', e)
      toast('Erro inesperado ao registrar desmame: ' + (e?.message || String(e)), 'error')
    } finally {
      setSalvandoDesmameId(null)
    }
  }

  // Abre modal de edição de nascimento
  const abrirEditarParto = (p) => {
    if (!podeEditarReprodCiclo) return
    setEditParto({
      id: p.id,
      bezerro_id: p.bezerro_id,
      data_parto: p.data_parto,
      sexo_bezerro: p.bezerro?.sexo || 'F',
      brinco_bezerro: p.bezerro?.brinco || '',
      observacoes: p.observacoes || ''
    })
  }

  // Salva edição de nascimento (atualiza parto + bezerro)
  const salvarEdicaoParto = async () => {
    if (!podeEditarReprodCiclo) return
    const ep = editParto
    if (!dataEhEditavel(ep.data_parto)) {
      const c = cicloDaData(ep.data_parto)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    // atualiza o parto
    const { error: e1 } = await db.partos.update(ep.id, {
      data_parto: ep.data_parto, observacoes: ep.observacoes
    })
    // atualiza o bezerro
    if (ep.bezerro_id) {
      await db.animais.update(ep.bezerro_id, {
        sexo: ep.sexo_bezerro, brinco: ep.brinco_bezerro,
        data_nascimento: ep.data_parto,
        sit_reprodutiva: ep.sexo_bezerro === 'F' ? 'vazia' : 'nao_se_aplica'
      })
    }
    if (e1) { toast('Erro ao salvar: '+e1.message, 'error'); return }
    toast('Nascimento atualizado.')
    setEditParto(null); loadAll()
    if (cicloLocal) loadPartosNasc(cicloLocal.id)
  }

  // Voz diagnóstico
  const vozDiag = async (text, lote) => {
    const t = text.toLowerCase()
    const nums = t.match(/\d+/g)
    if (!nums) { toast('Não ouvi um número de brinco', 'error'); return }
    const br = nums[0].padStart(2,'0')
    const isPrenha = /(prenha|grávida|positiv|cheia)/i.test(t)
    const isVazia  = /(vazi|negativ|sem|vácua)/i.test(t)
    if (!isPrenha && !isVazia) { toast(`Diagnóstico não identificado para brinco ${br}`, 'error'); return }
    const ins = lote.inseminacoes?.find(i => i.animal?.brinco === br)
    if (!ins) { toast(`Brinco ${br} não está neste lote`, 'error'); return }
    const ok = await salvarDiag(lote.id, ins.animal_id, isPrenha ? 'P' : 'V', dataDiagLote)
    if (ok) toast(`Brinco ${br} → ${isPrenha ? 'Prenha' : 'Vazia'} (${fmtData(dataDiagLote)})`)
  }

  // ─── Índices: dados derivados ────────────────────────────────────────────────
  // Safra reprodutiva: os índices de parição/perda/mortalidade são ancorados no
  // LOTE (a monta), não na data do parto — a gestação (~283 dias) costuma
  // atravessar a virada do ciclo, então os partos de uma safra podem ocorrer no
  // ciclo seguinte. `lote.partos` vem do FK partos.lote_inseminacao_id (join no
  // supabase.js), por isso é uma contagem exata, diferente de casar por mae_id.

  const calcLoteMetrics = (lote, propId = null) => {
    const insAll = lote.inseminacoes || []
    const ins = propId ? insAll.filter(i => i.animal?.proprietario_id === propId) : insAll
    const totalInseminacoes = ins.length                                  // total de serviços (informativo)
    // "Matrizes expostas" nunca é o número de inseminações: se a mesma vaca entra
    // na IATF e depois no repasse, ela é 1 matriz exposta, não 2. contarExpostas/
    // contarPrenhas/calcTaxaPrenhez são os helpers únicos (helpers.js) usados em
    // todas as telas (Dashboard, Rebanho, Comparativo, Metas) — mesma lógica aqui.
    const total     = contarExpostas(ins)                                 // matrizes expostas (distintas)
    const prenhas   = contarPrenhas(ins)                                  // matrizes prenhas (distintas)
    const vazias    = ins.filter(i => i.diagnostico === 'V').length
    const pendentes = ins.filter(i => !i.diagnostico).length
    const txPrenhez = calcTaxaPrenhez(ins)
    const partosLoteAll = lote.partos || []
    const partosLote = propId ? partosLoteAll.filter(p => p.mae?.proprietario_id === propId) : partosLoteAll
    const nascimentos = partosLote.length
    const txParicao   = prenhas > 0 ? Math.round(nascimentos / prenhas * 100) : 0
    // Novos índices da safra — denominador = matrizes expostas distintas
    const txNatalidade      = total > 0 ? Math.round(nascimentos / total * 100) : null
    const abortosLoteAll = lote.abortos || []
    const abortosLote = propId ? abortosLoteAll.filter(a => a.animal?.proprietario_id === propId) : abortosLoteAll
    const nAbortos = abortosLote.length
    // Perda gestacional: só conta o que já é (ou já deveria ser) um desfecho
    // conhecido — prenhas ainda dentro da janela de gestação não são perda.
    // calcGestacaoLote é a fórmula única, compartilhada com Metas.jsx.
    const { gestando, perdasNaoIdentificadas, perdaGestacional } = calcGestacaoLote(lote.data, prenhas, nascimentos, nAbortos)
    const mortosBezerros    = partosLote.filter(p => p.bezerro?.situacao === 'morto').length
    const mortalidadeBezerros = nascimentos > 0 ? Math.round(mortosBezerros / nascimentos * 100) : null
    // HISTÓRICO: usa todosAnimaisHistorico (qualquer situação), não `animais`
    // (só ativos) — uma vaca vendida depois de lote.data continua contando
    // como matriz apta aqui (ehMatriz já resolve isso via data_baixa).
    const matrizesAptas   = lote.data ? contarMatrizes(propId ? todosAnimaisHistorico.filter(a => a.proprietario_id === propId) : todosAnimaisHistorico, lote.data) : 0
    // Sem teto em 100%: taxa acima de 100% é esperada e correta quando novilhas
    // com menos de 24 meses (fora da definição de "matriz apta") são expostas.
    const txAproveitamento = matrizesAptas > 0 ? Math.round(total / matrizesAptas * 100) : null
    // Peso médio ao nascer — pesagens tipo 'nascimento' dos bezerros desta safra
    // (já vêm embutidas em lote.partos[].bezerro.pesagens via supabase.js).
    const pesosNascimento = partosLote
      .flatMap(p => p.bezerro?.pesagens || [])
      .filter(ps => ps.tipo === 'nascimento' && ps.peso_kg != null)
      .map(ps => ps.peso_kg)
    const pesoMedioNascimento = pesosNascimento.length
      ? Math.round((pesosNascimento.reduce((s, v) => s + v, 0) / pesosNascimento.length) * 10) / 10
      : null
    const desm = calcDesmameMetrics(partosLote, total)
    const partoPrev = lote.data
      ? new Date(new Date(lote.data).setMonth(new Date(lote.data).getMonth() + 9)).toLocaleDateString('pt-BR')
      : '—'
    return {
      total, totalInseminacoes, prenhas, vazias, pendentes, txPrenhez, nascimentos, txParicao,
      txNatalidade, pesoMedioNascimento, gestando, nAbortos, perdasNaoIdentificadas, perdaGestacional,
      mortalidadeBezerros, matrizesAptas, txAproveitamento, ...desm,
      partoPrev,
    }
  }

  // Uma safra é considerada "em andamento" enquanto o ciclo do lote é o atual e
  // ainda não se passaram os ~283 dias de gestação desde a monta.
  const safraEmAndamento = (lote, ciclo) => {
    if (!lote?.data || !ciclo) return false
    if (statusCiclo(ciclo) !== 'atual') return false
    const dias = Math.round((hojeAgora() - new Date(lote.data + 'T12:00:00')) / 86400000)
    return dias < GESTACAO_ANGUS_DIAS
  }

  // Todo este bloco só depende de todosLotes/todosPartos/cicloLocal/animais/
  // sortCol/sortAsc — memoizado para não recalcular a cada render (ex: digitar
  // num campo de outro modal não deve re-somar/re-ordenar todo o histórico).
  const idx = useMemo(() => {
    const lotesCicloAtual = todosLotes.filter(l => l.ciclo_id === cicloLocal?.id)
    // Filtro por proprietário: restringe inseminações/partos/abortos aos animais
    // do proprietário selecionado antes de calcular o funil da safra — matrizes
    // aptas também passa a considerar só os animais dele.
    const insCicloAtualBruto = lotesCicloAtual.flatMap(l => l.inseminacoes || [])
    const insCicloAtual = filtroPropIdx
      ? insCicloAtualBruto.filter(i => i.animal?.proprietario_id === filtroPropIdx)
      : insCicloAtualBruto
    const kpiInsTotal = insCicloAtual.length                          // total de serviços/inseminações (informativo)
    // Matrizes expostas/prenhas DISTINTAS do ciclo: um ciclo pode ter vários lotes
    // (IATF + repasses) e a mesma vaca não pode ser contada mais de uma vez.
    const kpiIns  = contarExpostas(insCicloAtual)
    const kpiPrn  = contarPrenhas(insCicloAtual)
    const kpiPartosArrBruto = lotesCicloAtual.flatMap(l => l.partos || [])
    const kpiPartosArr = filtroPropIdx
      ? kpiPartosArrBruto.filter(p => p.mae?.proprietario_id === filtroPropIdx)
      : kpiPartosArrBruto
    const kpiPartos = kpiPartosArr.length
    const kpiMortos = kpiPartosArr.filter(p => p.bezerro?.situacao === 'morto').length
    const kpiMortalidade = kpiPartos > 0 ? Math.round(kpiMortos / kpiPartos * 100) : null
    const kpiAbortosArrBruto = lotesCicloAtual.flatMap(l => l.abortos || [])
    const kpiAbortos = (filtroPropIdx
      ? kpiAbortosArrBruto.filter(a => a.animal?.proprietario_id === filtroPropIdx)
      : kpiAbortosArrBruto).length
    // Gestando precisa da data da MONTA de cada lote (varia entre IATF/repasses
    // do mesmo ciclo), então é somado por lote via calcLoteMetrics — não dá pra
    // derivar isso só dos totais agregados acima. O restante do funil (prenhas/
    // partos/abortos deduplicados) continua vindo dos totais já calculados.
    const kpiGestando = lotesCicloAtual.reduce((soma, l) => soma + calcLoteMetrics(l, filtroPropIdx || null).gestando, 0)
    const kpiPerdasNaoIdentificadas = Math.max(0, kpiPrn - kpiPartos - kpiAbortos - kpiGestando)
    const kpiPerdaGestacional = kpiPrn > 0 ? Math.round((kpiAbortos + kpiPerdasNaoIdentificadas) / kpiPrn * 100) : null
    const primeiraMontaCiclo = lotesCicloAtual.map(l => l.data).filter(Boolean).sort()[0] || null
    // HISTÓRICO: todosAnimaisHistorico (qualquer situação) — mesmo motivo do
    // matrizesAptas em calcLoteMetrics, ver comentário lá.
    const animaisParaAptas = filtroPropIdx ? todosAnimaisHistorico.filter(a => a.proprietario_id === filtroPropIdx) : todosAnimaisHistorico
    const kpiMatrizesAptas = primeiraMontaCiclo ? contarMatrizes(animaisParaAptas, primeiraMontaCiclo) : 0
    // Sem teto em 100%: uma taxa de aproveitamento acima de 100% é esperada e
    // correta quando novilhas com menos de 24 meses (fora da definição de "matriz
    // apta") são expostas à reprodução — não é um erro de cálculo.
    const kpiTxAproveitamento = kpiMatrizesAptas > 0 ? Math.round(kpiIns / kpiMatrizesAptas * 100) : null
    // Peso médio ao nascer (consolidado do ciclo) — mesma base de kpiPartosArr.
    const kpiPesosNascimento = kpiPartosArr
      .flatMap(p => p.bezerro?.pesagens || [])
      .filter(ps => ps.tipo === 'nascimento' && ps.peso_kg != null)
      .map(ps => ps.peso_kg)
    const kpiPesoMedioNascimento = kpiPesosNascimento.length
      ? Math.round((kpiPesosNascimento.reduce((s, v) => s + v, 0) / kpiPesosNascimento.length) * 10) / 10
      : null
    const kpiDesmame = calcDesmameMetrics(kpiPartosArr, kpiIns)
    const previsaoSafraCiclo = (() => {
      const emAndamento = lotesCicloAtual.filter(l => safraEmAndamento(l, cicloLocal))
      if (emAndamento.length === 0) return null
      const datas = emAndamento.map(l => {
        const d = new Date(l.data + 'T12:00:00'); d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS); return d
      })
      return new Date(Math.min(...datas))
    })()
    // Intervalo entre partos — fórmula única (helpers.calcIntervaloPartos),
    // compartilhada com Metas.jsx.
    const partosBaseIntervalo = filtroPropIdx ? todosPartos.filter(p => p.mae?.proprietario_id === filtroPropIdx) : todosPartos
    const { media: intervaloMedioDias } = calcIntervaloPartos(partosBaseIntervalo)
    const kpiIntervalo = intervaloMedioDias === null ? '—' : `${intervaloMedioDias} dias`

    const cicloMapIdx = new Map()
    todosLotes.forEach(l => { if (l.ciclo) cicloMapIdx.set(l.ciclo_id, l.ciclo) })
    const ciclosUnicos = [...cicloMapIdx.values()].sort((a, b) => (a.inicio||'').localeCompare(b.inicio||''))

    const barData = todosLotes
      .filter(l => l.ciclo_id === cicloLocal?.id)
      .map(l => { const m = calcLoteMetrics(l); return { name: `L${l.numero}·${l.touro}`, prenhez: m.txPrenhez ?? 0, paricao: m.txParicao } })

    const lineData = ciclosUnicos.map(c => {
      const lc = todosLotes.filter(l => l.ciclo_id === c.id)
      const insLc = lc.flatMap(l => l.inseminacoes || [])
      // Distintos: um ciclo pode ter vários lotes (IATF + repasses) — a mesma vaca
      // não pode ser contada 2x nem no total exposto nem nas prenhas.
      const tExp = contarExpostas(insLc)
      const tP   = contarPrenhas(insLc)
      const tN   = lc.reduce((s, l) => s + (l.partos?.length || 0), 0)
      return { ciclo: c.nome, prenhez: tExp > 0 ? Math.round(tP / tExp * 100) : 0, paricao: tP > 0 ? Math.round(tN/tP*100) : 0 }
    })

    const pieData = [
      { name:'Prenha',   value: lotesCicloAtual.reduce((s,l) => s + (l.inseminacoes?.filter(i => i.diagnostico==='P').length||0), 0), color:'#7B2FBE' },
      { name:'Vazia',    value: lotesCicloAtual.reduce((s,l) => s + (l.inseminacoes?.filter(i => i.diagnostico==='V').length||0), 0), color:'#DC2626' },
      { name:'Pendente', value: lotesCicloAtual.reduce((s,l) => s + (l.inseminacoes?.filter(i => !i.diagnostico).length||0), 0),      color:'#D97706' },
    ].filter(d => d.value > 0)

    const tabelaLotes = [...todosLotes]
      .map(l => ({ ...l, _m: calcLoteMetrics(l) }))
      .sort((a, b) => {
        const get = r => {
          switch (sortCol) {
            case 'ciclo':       return r.ciclo?.nome || ''
            case 'numero':      return r.numero
            case 'touro':       return r.touro || ''
            case 'data':        return r.data || ''
            case 'total':       return r._m.total
            case 'prenhas':     return r._m.prenhas
            case 'vazias':      return r._m.vazias
            case 'txPrenhez':   return r._m.txPrenhez
            case 'nascimentos': return r._m.nascimentos
            case 'txParicao':   return r._m.txParicao
            default:            return r.data || ''
          }
        }
        const va = get(a), vb = get(b)
        if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
        return sortAsc ? va - vb : vb - va
      })

    // Ranking por touro — lote de monta natural com VÁRIOS touros (lote_touros)
    // não tem como saber qual touro cobriu qual vaca, então não entra fundido
    // com nenhum touro nomeado: cada lote assim vira sua própria linha
    // "paternidade indefinida" no ranking (nunca soma dentro de um touro real).
    const touroDados = {}
    todosLotes.forEach(l => {
      if (!l.touro) return
      const chave = l.lote_touros?.length > 0 ? `Monta natural (vários touros) — Lote Nº ${l.numero}` : l.touro
      const m = calcLoteMetrics(l)
      if (!touroDados[chave]) touroDados[chave] = { touro: chave, totalIns: 0, totalPrn: 0 }
      touroDados[chave].totalIns += m.total
      touroDados[chave].totalPrn += m.prenhas
    })
    const tourosRanking = Object.values(touroDados)
      .map(t => ({ ...t, txPrenhez: t.totalIns > 0 ? Math.round(t.totalPrn/t.totalIns*100) : 0 }))
      .sort((a, b) => b.txPrenhez - a.txPrenhez)

    return {
      lotesCicloAtual, kpiInsTotal, kpiIns, kpiPrn, kpiPartos, kpiMortalidade, kpiAbortos, kpiGestando,
      kpiPerdasNaoIdentificadas, kpiPerdaGestacional, kpiMatrizesAptas, kpiTxAproveitamento, kpiPesoMedioNascimento,
      kpiDesmame, previsaoSafraCiclo, kpiIntervalo,
      barData, lineData, pieData, tabelaLotes, tourosRanking,
    }
  }, [todosLotes, todosPartos, cicloLocal, animais, todosAnimaisHistorico, sortCol, sortAsc, filtroPropIdx])

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  const {
    lotesCicloAtual, kpiInsTotal, kpiIns, kpiPrn, kpiPartos, kpiMortalidade, kpiAbortos, kpiGestando,
    kpiPerdasNaoIdentificadas, kpiPerdaGestacional, kpiMatrizesAptas, kpiTxAproveitamento, kpiPesoMedioNascimento,
    kpiDesmame, previsaoSafraCiclo, kpiIntervalo,
    barData, lineData, pieData, tabelaLotes, tourosRanking,
  } = idx

  // Previsão de parto do lote selecionado (data da inseminação + gestação padrão)
  const previsaoPartoLote = selLote?.data ? (() => {
    const d = new Date(selLote.data + 'T12:00:00')
    d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS)
    return d
  })() : null

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      <BannerCicloEncerrado ciclo={cicloLocal} />

      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={() => { setTab(i); setSelLote(null) }}>{t}</button>
        ))}
      </div>

      {/* ── Lotes ── */}
      {tab === 0 && !selLote && (
        <div>
          {estacoes.length > 0 && (() => {
            const estacaoGerenciada = estacoes.find(es => es.id === estacaoIdxSel) || estacoes[0]
            return (
              <div className="card" style={{ marginBottom:14 }}>
                <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <i className="ti ti-calendar-stats" style={{ color:'#2B6CD9', fontSize:16 }} />
                    {estacoes.length > 1 ? (
                      <select value={estacaoIdxSel} onChange={e => setEstacaoIdxSel(e.target.value)} style={{ maxWidth:260 }}>
                        {estacoes.map(es => <option key={es.id} value={es.id}>{es.nome}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontWeight:600 }}>{estacaoGerenciada.nome}</span>
                    )}
                    <span style={{ fontSize:'.8rem', color:'#6B7280' }}>
                      {estacaoGerenciada.inicio ? fmtData(estacaoGerenciada.inicio) : '—'}{estacaoGerenciada.fim ? ` – ${fmtData(estacaoGerenciada.fim)}` : ''}
                    </span>
                  </div>
                  {podeEditarReprodCiclo && (
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => abrirEditarEstacao(estacaoGerenciada)}>
                        <i className="ti ti-edit" /> Editar
                      </button>
                      <button className="btn btn-secondary btn-xs" style={{ color:'#DC2626' }} onClick={() => excluirEstacao(estacaoGerenciada)}>
                        <i className="ti ti-trash" /> Excluir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
          {(() => {
            // Dois grupos visuais separados por tipo (item 2 da Fase 1 de monta
            // natural) — o usuário bate o olho e já sabe o que é o quê, sem
            // precisar abrir cada lote pra descobrir. O card em si (renderLoteCard)
            // é reaproveitado pelos dois grupos — só muda o rótulo "expostas/
            // inseminadas" dentro dele, condicional ao tipo do lote.
            const lotesIA      = lotes.filter(l => l.tipo !== 'natural')
            const lotesNatural = lotes.filter(l => l.tipo === 'natural')
            const renderLoteCard = (l) => {
              const ins   = l.inseminacoes || []
              const prn   = ins.filter(i=>i.diagnostico==='P').length
              const vaz   = ins.filter(i=>i.diagnostico==='V').length
              const pend  = ins.filter(i=>!i.diagnostico).length
              const rotuloExpostas = l.tipo === 'natural' ? 'expostas' : 'inseminadas'
              return (
                <div key={l.id} className="card" style={{
                  marginBottom:10, cursor:'pointer',
                  borderLeft:`3px solid ${l.encerrado?'#7B2FBE':'#D97706'}`
                }} onClick={() => setSelLote(l)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
                        Lote {l.numero} — {l.touro}
                        {l.lote_touros?.length > 0 && <Badge color="purple">+{l.lote_touros.length} touro{l.lote_touros.length!==1?'s':''}</Badge>}
                      </div>
                      <div style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{fmtData(l.data)} · Parto prev: {l.data ? new Date(new Date(l.data).setMonth(new Date(l.data).getMonth()+9)).toLocaleDateString('pt-BR') : '—'}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Badge color={l.encerrado?'green':'amber'}>{l.encerrado?'Encerrado':'Em andamento'}</Badge>
                      {podeEditarReprodCiclo && pend === ins.length && (
                        <button onClick={(e) => excluirLote(l, e)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', padding:4 }}
                          title="Excluir lote">
                          <i className="ti ti-trash" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:'.82rem' }}>
                    <span><strong>{ins.length}</strong> <span style={{color:'#6B7280'}}>{rotuloExpostas}</span></span>
                    {prn > 0 && <span><strong style={{color:'#1E55B0'}}>{prn}</strong> <span style={{color:'#6B7280'}}>prenhas ({pct(prn,ins.length)})</span></span>}
                    {vaz > 0 && <span><strong style={{color:'#791F1F'}}>{vaz}</strong> <span style={{color:'#6B7280'}}>vazias</span></span>}
                    {pend > 0 && <Badge color="amber">{pend} aguardando diagnóstico</Badge>}
                  </div>
                </div>
              )
            }
            return (
              <>
              <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:12 }}>
                <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{lotes.length} lote{lotes.length!==1?'s':''} · Ciclo {cicloLocal?.nome}</span>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {podeEditarReprodCiclo && (
                    <button className="btn btn-primary btn-sm" onClick={() => { setLoteEdit(null); setForm({ tipo: 'ia' }); setModal('lote'); setSelBrs([]) }}>
                      <i className="ti ti-plus" /> Novo lote de inseminação
                    </button>
                  )}
                  {podeEditarReprodCiclo && (
                    <button className="btn btn-primary btn-sm" onClick={() => { setLoteEdit(null); setForm({ tipo: 'natural', touros: [] }); setModal('lote'); setSelBrs([]) }}>
                      <i className="ti ti-plus" /> Nova monta natural
                    </button>
                  )}
                  <BotaoPDF contentRef={refLotes} filename="reprodutivo-lotes" titulo="Reprodutivo: Lotes / Montas" />
                </div>
              </div>
              <div ref={refLotes}>
              {lotes.length === 0
                ? <EmptyState icon="💉" title="Nenhum lote registrado" sub="Registre o primeiro lote de inseminação ou monta natural do ciclo."
                    action={podeEditarReprodCiclo ? (
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                        <button className="btn btn-primary btn-sm" onClick={()=>{setLoteEdit(null);setForm({ tipo: 'ia' });setModal('lote');setSelBrs([])}}><i className="ti ti-plus"/>Inseminação</button>
                        <button className="btn btn-primary btn-sm" onClick={()=>{setLoteEdit(null);setForm({ tipo: 'natural', touros: [] });setModal('lote');setSelBrs([])}}><i className="ti ti-plus"/>Monta natural</button>
                      </div>
                    ) : undefined} />
                : (
                  <>
                    <div style={{ fontSize:'.72rem', fontWeight:700, color:'#1E55B0', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }}>
                      <i className="ti ti-needle" /> Inseminações ({lotesIA.length})
                    </div>
                    {lotesIA.length === 0
                      ? <div style={{ fontSize:'.8rem', color:'#9CA3AF', marginBottom:18 }}>Nenhum lote de inseminação neste ciclo.</div>
                      : <div style={{ marginBottom:18 }}>{lotesIA.map(renderLoteCard)}</div>}

                    <div style={{ fontSize:'.72rem', fontWeight:700, color:'#7B2FBE', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:8 }}>
                      <i className="ti ti-paw" /> Montas naturais ({lotesNatural.length})
                    </div>
                    {lotesNatural.length === 0
                      ? <div style={{ fontSize:'.8rem', color:'#9CA3AF' }}>Nenhuma monta natural neste ciclo.</div>
                      : <div>{lotesNatural.map(renderLoteCard)}</div>}
                  </>
                )
              }
              </div>{/* end refLotes */}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Detalhe lote + diagnóstico ── */}
      {tab === 0 && selLote && (
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, marginBottom:14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelLote(null)}>
              <i className="ti ti-arrow-left" /> Lotes
            </button>
            <span style={{ fontWeight:500, display:'flex', alignItems:'center', gap:6 }}>
              Lote {selLote.numero} — {selLote.touro} · {fmtData(selLote.data)}
              <Badge color={selLote.tipo === 'natural' ? 'purple' : 'blue'}>{selLote.tipo === 'natural' ? 'Natural' : 'IA'}</Badge>
            </span>
            {podeEditarReprodCiclo && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setLoteEdit(selLote)
                setForm({
                  data: selLote.data, touro: selLote.touro, protocolo: selLote.protocolo || '',
                  estacao_monta_id: selLote.estacao_monta_id || '', tipo: selLote.tipo || 'ia',
                  touros: selLote.tipo === 'natural' ? [selLote.touro, ...(selLote.lote_touros || []).map(t => t.nome)].filter(Boolean) : [],
                })
                setModal('lote')
              }}>
                <i className="ti ti-edit" /> Editar
              </button>
            )}
            {podeEditarReprodCiclo && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelBrsAdd([]); setFiltroLoteInsem(''); setFiltroPropInsem(''); setFiltroCategInsem(''); setModal('addAnimaisLote') }}>
                <i className="ti ti-plus" /> Adicionar animais
              </button>
            )}
            <BotaoPDF contentRef={refDiag} filename="reprodutivo-diagnostico" titulo="Reprodutivo: Diagnóstico do Lote" />
          </div>
          {selLote.lote_touros?.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
              <span style={{ fontSize:'.78rem', color:'#6B7280' }}>Touros deste lote:</span>
              <Badge color="purple">{selLote.touro}</Badge>
              {selLote.lote_touros.map(t => <Badge key={t.id} color="purple">{t.nome}</Badge>)}
              <span style={{ fontSize:'.72rem', color:'#92620A' }}>
                <i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Vários touros — paternidade indefinida nos bezerros deste lote.
              </span>
            </div>
          )}
          <div ref={refDiag}>
          {(() => {
            // Proprietários presentes neste lote — nome vem direto do embed da
            // query (ins.animal.proprietario), não da lista `proprietarios` (que
            // só traz ativos e derrubaria silenciosamente um dono desativado).
            // O filtro selecionado aqui vale tanto para o funil (Resultado da
            // safra) quanto para a lista de diagnóstico, mais abaixo.
            const propsNoLote = [...new Map(
              (selLote.inseminacoes || [])
                .filter(i => i.animal?.proprietario_id)
                .map(i => [i.animal.proprietario_id, { id: i.animal.proprietario_id, nome: i.animal.proprietario?.nome || '—' }])
            ).values()]
            // Resumo do lote — mesmos helpers usados em todo o sistema (contarExpostas/
            // contarPrenhas/calcTaxaPrenhez), garantindo que a taxa aqui bate com a do
            // Dashboard/Rebanho/Comparativo/Metas para o mesmo lote/ciclo.
            const sm = calcLoteMetrics(selLote, filtroPropLote || null)
            return (
              <>
                {propsNoLote.length > 1 && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {[{ id:'', nome:'Todos' }, ...propsNoLote].map(prop => {
                      const active = filtroPropLote === prop.id
                      return (
                        <button key={prop.id || 'todos'} onClick={() => setFiltroPropLote(prop.id)} style={{
                          padding:'4px 14px', borderRadius:20, fontSize:'.82rem', cursor:'pointer',
                          fontFamily:'inherit', fontWeight: active ? 600 : 400,
                          background: active ? '#7B2FBE' : 'white',
                          color: active ? 'white' : '#374151',
                          border: active ? '.5px solid #7B2FBE' : '.5px solid #D1D5DB',
                          transition: 'all .15s'
                        }}>
                          {prop.id === '' ? 'Todos' : prop.nome.split(' ')[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div className="card-title" style={{ marginBottom:8 }}><i className="ti ti-clipboard-list" /> Resumo do lote</div>
                <div className="grid-4" style={{ marginBottom:8 }}>
                  {[
                    ['Matrizes expostas', sm.total,     '#111'],
                    ['Prenhas',           sm.prenhas,   '#1E55B0'],
                    ['Vazias',            sm.vazias,    '#791F1F'],
                    ['Pendentes',         sm.pendentes, '#9CA3AF'],
                  ].map(([l,v,c]) => (
                    <div key={l} style={{ background:'white',border:'.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',textAlign:'center' }}>
                      <div style={{ fontSize:'1.4rem',fontWeight:600,color:c }}>{v}</div>
                      <div style={{ fontSize:'.75rem',color:'#6B7280',marginTop:2 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14, flexWrap:'wrap', marginBottom:14 }}>
                  <div style={{ background:'#E8F0FC', border:'.5px solid #1BA89C', borderRadius:10, padding:'8px 16px' }}>
                    <span style={{ fontSize:'.78rem', color:'#6B7280' }}>Taxa de prenhez do lote: </span>
                    <strong style={{ fontSize:'1rem', color:'#1E55B0' }}>{sm.txPrenhez != null ? `${sm.txPrenhez}%` : '—'}</strong>
                  </div>
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>
                    {sm.totalInseminacoes} {selLote.tipo === 'natural' ? 'exposiç' : 'inseminaç'}{sm.totalInseminacoes!==1?'ões':'ão'} (serviços)
                  </span>
                </div>

                {/* Resultado da safra — índices ancorados nesta monta, mesmo que os partos ocorram no ciclo seguinte */}
                <CardResultadoSafra
                  titulo="Resultado da safra"
                  sm={sm}
                  andamento={sm.gestando > 0}
                  previsao={previsaoPartoLote}
                  tipo={selLote.tipo}
                />
              </>
            )
          })()}

          <div className="card">
            <div className="card-title">
              <span><i className="ti ti-stethoscope" /> Diagnóstico de gestação</span>
              {podeEditarReprodCiclo && <MicButton hint='Fale: "zero três prenha" ou "doze vazia"' onResult={t => vozDiag(t, selLote)} />}
            </div>
            {podeEditarReprodCiclo && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                <label style={{ fontSize:'.8rem', color:'#374151', fontWeight:500 }}>Data do diagnóstico:</label>
                <input type="date" value={dataDiagLote} onChange={e => setDataDiagLote(e.target.value)} style={{ maxWidth:170 }} />
                <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>
                  Todo diagnóstico marcado abaixo (clique ou voz) usa esta data — não a data de hoje.
                </span>
              </div>
            )}
            <div style={{ fontSize:'.8rem', background:'#EEEDFE', color:'#3C3489', padding:'7px 10px', borderRadius:8, marginBottom:10 }}>
              <i className="ti ti-microphone" style={{ fontSize:12, marginRight:4 }} />
              Fale assim: <b>"zero três prenha"</b> ou <b>"doze vazia"</b> — primeiro o número do brinco, depois o resultado
            </div>
            {selInsem.length > 0 && (
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                background:'#FEE2E2', border:'.5px solid #FCA5A5', borderRadius:10,
                padding:'8px 14px', marginBottom:10
              }}>
                <span style={{ fontSize:'.85rem', color:'#7F1D1D', fontWeight:500 }}>
                  {selInsem.length} selecionado(s)
                </span>
                <button className="btn btn-sm" style={{ background:'#DC2626', color:'white' }}
                  onClick={removerInsemSelecionados} disabled={removendoLote}>
                  <i className="ti ti-trash" /> {removendoLote ? 'Removendo...' : 'Remover selecionados'}
                </button>
              </div>
            )}
            {(() => {
              // Filtro por proprietário compartilhado com o Resumo do lote, acima
              // (pills renderizados uma única vez, junto ao funil).
              const insLoteFiltradas = filtroPropLote
                ? (selLote.inseminacoes || []).filter(i => i.animal?.proprietario_id === filtroPropLote)
                : (selLote.inseminacoes || [])
              return (
                <>
                  {podeEditarReprodCiclo && insLoteFiltradas.length > 0 && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0 8px', borderBottom:'.5px solid #F3F4F6' }}>
                      <input type="checkbox"
                        checked={insLoteFiltradas.every(i => selInsem.includes(i.id))}
                        onChange={() => toggleSelInsemTodos(insLoteFiltradas)} />
                      <span style={{ fontSize:'.78rem', color:'#6B7280' }}>Marcar/desmarcar todos{filtroPropLote ? ' (filtrados)' : ''}</span>
                    </div>
                  )}
                  {insLoteFiltradas.map(ins => {
              const br = ins.animal?.brinco || '?'
              const d  = ins.diagnostico
              const abortoReg = (selLote.abortos || []).find(ab => ab.animal_id === ins.animal_id)
              // Parto já registrado para esta mãe NESTE lote (partos vem embutido
              // via FK partos.lote_inseminacao_id -> já vem filtrado pelo lote).
              const partoReg = (selLote.partos || []).find(p => p.mae_id === ins.animal_id)
              // Prenha/Vazia ficam bloqueados tanto se já pariu quanto se já teve
              // aborto registrado neste lote — mesma proteção em duas camadas
              // (UI desabilitada aqui + guard em salvarDiag) pra não sobrescrever
              // sit_reprodutiva por engano num desfecho já registrado.
              const diagBloqueado = !!(partoReg || abortoReg)
              const motivoBloqueio = partoReg
                ? 'Esta vaca já pariu neste lote — diagnóstico bloqueado'
                : abortoReg
                  ? 'Esta vaca teve aborto registrado neste lote — diagnóstico bloqueado'
                  : undefined
              // "Lactante" é só exibição (statusReprodutivoExibicao, helpers.js):
              // vaca 'vazia' cujo último parto NESTE lote ainda não foi desmamado.
              // Nunca sobrescreve sit_reprodutiva no banco.
              const situacaoAtual = statusReprodutivoExibicao(
                { id: ins.animal_id, sit_reprodutiva: ins.animal?.sit_reprodutiva },
                selLote.partos
              )
              return (
                <div key={ins.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'8px 0', borderBottom:'.5px solid #F3F4F6'
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    {podeEditarReprodCiclo && (
                      <input type="checkbox" checked={selInsem.includes(ins.id)}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleSelInsem(ins.id)} />
                    )}
                    <div>
                      <span style={{ fontWeight:500, minWidth:50, display:'inline-block' }}>{br}</span>
                      {situacaoAtual && (
                        <Badge color={situacaoAtual === 'prenha' ? 'blue' : situacaoAtual === 'Lactante' ? 'purple' : 'gray'} style={{ marginLeft:6 }}>
                          {situacaoAtual === 'prenha' ? 'Prenha (atual)' : situacaoAtual === 'vazia' ? 'Vazia (atual)' : situacaoAtual === 'Lactante' ? 'Lactante' : situacaoAtual}
                        </Badge>
                      )}
                      {d === 'P' && partoReg && (
                        <div style={{ fontSize:'.72rem', color:'#166534', marginTop:2, fontWeight:600 }}>
                          <i className="ti ti-circle-check" style={{ fontSize:11 }} /> Pariu em {fmtData(partoReg.data_parto)}
                        </div>
                      )}
                      {d === 'P' && !partoReg && abortoReg && (
                        <div style={{ fontSize:'.72rem', color:'#791F1F', marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                          <span><i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Aborto registrado em {fmtData(abortoReg.data)}</span>
                          {podeEditarReprodCiclo && (
                            <>
                              <button onClick={() => abrirEditarAborto(abortoReg, br)} title="Editar aborto"
                                style={{ background:'none', border:'none', cursor:'pointer', color:'#2B6CD9', padding:2 }}>
                                <i className="ti ti-edit" style={{ fontSize:12 }} />
                              </button>
                              <button onClick={() => excluirAborto(abortoReg)} title="Excluir aborto"
                                style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', padding:2 }}>
                                <i className="ti ti-trash" style={{ fontSize:12 }} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {d === 'P' && !partoReg && !abortoReg && selLote.data && (
                        <div style={{ fontSize:'.72rem', color:'#1E55B0', marginTop:2 }}>
                          Prenha · Parto previsto: {fmtData(previsaoPartoLote)}
                        </div>
                      )}
                      {d && ins.data_diagnostico && (
                        <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:2 }}>
                          Diagnóstico em {fmtData(ins.data_diagnostico)}
                          {podeEditarReprodCiclo && !partoReg && (
                            <button onClick={() => abrirEditarDiagData(ins)} title="Editar data do diagnóstico"
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:'0 0 0 4px' }}>
                              <i className="ti ti-edit" style={{ fontSize:11 }} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {/* podeEditarReprod (permissão), não podeEditarReprodCiclo — este
                        lote pode estar num cicloLocal já encerrado (é assim que o
                        usuário normalmente CHEGA na vaca prenha, atravessando a
                        virada de ciclo) mesmo com o parto em si caindo dentro do
                        ciclo atual; salvarParto valida a data real do parto. */}
                    {podeEditarReprod && d === 'P' && !abortoReg && !partoReg && (
                      <button className="btn btn-secondary btn-xs"
                        onClick={() => {
                          // Abre o MESMO modal de "Registrar nascimento" da aba Nascimentos,
                          // pré-preenchido com a mãe e o lote/safra já conhecidos aqui —
                          // dispensa o usuário de reencontrar a vaca no select da outra aba.
                          // O <select> de "Brinco da mãe" só lista quem está em maesElegiveis,
                          // que depende de todosLotes — carregado sob demanda só quando as
                          // abas Nascimentos/Índices são abertas (ver useEffect com todosStale).
                          // Clicando aqui (aba Lotes de Inseminação), todosLotes podia ainda
                          // estar vazio: a opção da mãe não existia no <select> e o valor
                          // pré-preenchido aparecia em branco, mesmo com o form já correto.
                          if (todosStale) loadTodos()
                          const mae = animais.find(a => a.id === ins.animal_id)
                          setForm({
                            data_parto: hojeISO(),
                            mae_brinco: ins.animal?.brinco || '',
                            touro_pai: resolverPaiDerivado(selLote),
                            auto_lote: mae?.lote?.nome || '—',
                            auto_prop: mae?.proprietario?.nome || ins.animal?.proprietario?.nome || '—',
                            lote_inseminacao_id: selLote.id,
                          })
                          setModal('parto')
                        }}
                        style={{ fontSize:'.72rem', color:'#166534' }}>
                        <i className="ti ti-plus" /> Registrar nascimento
                      </button>
                    )}
                    {podeEditarReprodCiclo && d === 'P' && !abortoReg && !partoReg && (
                      <button className="btn btn-secondary btn-xs"
                        onClick={() => abrirRegistrarAborto(ins, selLote)}
                        style={{ fontSize:'.72rem', color:'#791F1F' }}>
                        <i className="ti ti-alert-circle" /> Registrar aborto
                      </button>
                    )}
                    {podeEditarReprodCiclo && (
                      <button
                        disabled={diagBloqueado}
                        title={motivoBloqueio}
                        style={{
                          padding:'4px 12px', borderRadius:8, fontSize:'.8rem',
                          cursor:diagBloqueado?'not-allowed':'pointer', opacity:diagBloqueado?0.5:1,
                          fontFamily:'inherit', fontWeight:d==='P'?600:400,
                          background:d==='P'?'#E8F0FC':'white', color:d==='P'?'#1E55B0':'#6B7280',
                          border:`.5px solid ${d==='P'?'#1BA89C':'#E5E7EB'}`
                        }}
                        onClick={() => salvarDiag(selLote.id, ins.animal_id, 'P', dataDiagLote)}
                      >Prenha</button>
                    )}
                    {podeEditarReprodCiclo && (
                      <button
                        disabled={diagBloqueado}
                        title={motivoBloqueio}
                        style={{
                          padding:'4px 12px', borderRadius:8, fontSize:'.8rem',
                          cursor:diagBloqueado?'not-allowed':'pointer', opacity:diagBloqueado?0.5:1,
                          fontFamily:'inherit', fontWeight:d==='V'?600:400,
                          background:d==='V'?'#FCEBEB':'white', color:d==='V'?'#791F1F':'#6B7280',
                          border:`.5px solid ${d==='V'?'#E24B4A':'#E5E7EB'}`
                        }}
                        onClick={() => salvarDiag(selLote.id, ins.animal_id, 'V', dataDiagLote)}
                      >Vazia</button>
                    )}
                    {!d && <Badge color="gray">Pendente</Badge>}
                    {podeEditarReprodCiclo && !d && (
                      <button onClick={() => removerInsem(ins)}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', padding:4 }}
                        title="Remover do lote">
                        <i className="ti ti-trash" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
                </>
              )
            })()}
          </div>
          {/* Sugestão IA para vazias */}
          {selLote.inseminacoes?.some(i=>i.diagnostico==='V') && (
            <AlertBox type="purple" icon="ti-brain"
              title="Sugestão IA — Repasse"
              body={`Brincos ${selLote.inseminacoes.filter(i=>i.diagnostico==='V').map(i=>i.animal?.brinco).join(', ')} diagnosticados vazios. Incluir no próximo lote (repasse${selLote.tipo === 'natural' ? ' com touro' : ' de IA'}).`}
            />
          )}

          {/* Desmame dos terneiros nascidos neste lote — atalho pra não precisar ir
              até a aba Desmame de Pesagens. Data única no topo (mesmo padrão da
              data do diagnóstico de gestação), peso por terneiro é opcional. */}
          {selLote.partos?.length > 0 && (
            <div className="card" style={{ marginTop:14 }}>
              <div className="card-title"><i className="ti ti-scale" /> Desmame dos terneiros deste lote</div>
              {podeEditarReprodCiclo && (
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                  <label style={{ fontSize:'.8rem', color:'#374151', fontWeight:500 }}>Data do desmame:</label>
                  <input type="date" value={dataDesmameLote} onChange={e => setDataDesmameLote(e.target.value)} style={{ maxWidth:170 }} />
                  <span style={{ fontSize:'.72rem', color:'#9CA3AF' }}>
                    Todo desmame registrado abaixo usa esta data — não a data de hoje.
                  </span>
                </div>
              )}
              {selLote.partos.map(p => {
                const desmamado = !!p.bezerro?.data_desmame
                const pesoDesm  = (p.bezerro?.pesagens || []).find(ps => ps.tipo === 'desmama')
                const fd = formDesmame[p.id] || {}
                return (
                  <div key={p.id} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    flexWrap:'wrap', gap:8, padding:'8px 0', borderBottom:'.5px solid #F3F4F6'
                  }}>
                    <div>
                      <span style={{ fontWeight:500 }}>{p.bezerro?.brinco || '?'}</span>
                      <span style={{ fontSize:'.75rem', color:'#9CA3AF', marginLeft:6 }}>
                        {p.bezerro?.sexo === 'F' ? '♀' : '♂'} · mãe {p.mae?.brinco || '?'} · nasceu {fmtData(p.data_parto)}
                      </span>
                    </div>
                    {desmamado ? (
                      <Badge color="green">
                        Desmamado em {fmtData(p.bezerro.data_desmame)}{pesoDesm ? ` · ${pesoDesm.peso_kg}kg` : ''}
                      </Badge>
                    ) : podeEditarReprodCiclo ? (
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        <input type="number" step="0.1" min="0" placeholder="kg (opcional)" value={fd.peso || ''}
                          onChange={e => setFormDesmame(prev => ({ ...prev, [p.id]: { ...prev[p.id], peso: e.target.value } }))}
                          style={{ maxWidth:110 }} />
                        <button className="btn btn-secondary btn-xs" disabled={salvandoDesmameId === p.id}
                          onClick={() => salvarDesmame(p)}>
                          {salvandoDesmameId === p.id ? 'Salvando...' : <><i className="ti ti-check" /> Registrar desmame</>}
                        </button>
                      </div>
                    ) : (
                      <Badge color="gray">Não desmamado</Badge>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>{/* end refDiag */}
        </div>
      )}

      {/* ── Nascimentos ── */}
      {tab === 1 && (() => {
        const pFilt = (partosNasc || []).filter(p =>
          filtroNasc === 'todos' || p.mae?.proprietario_id === filtroNasc
        )
        const nascMachos = pFilt.filter(p => p.bezerro?.sexo === 'M').length
        const nascFemeas = pFilt.filter(p => p.bezerro?.sexo === 'F').length
        return (
          <div>
            {/* Linha 1 — ciclo + botão */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
              <span style={{ fontSize:'.85rem', color:'#6B7280' }}>Nascimentos no ciclo (pela data do parto): <strong style={{ color:'#374151' }}>{cicloLocal?.nome || '—'}</strong></span>
              <div style={{ display:'flex', gap:8 }}>
                {/* podeEditarReprod (permissão) — não podeEditarReprodCiclo, ver
                    comentário em salvarParto. */}
                {podeEditarReprod && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setForm({ data_parto: hojeISO() }); setModal('parto') }}>
                    <i className="ti ti-plus" /> Registrar nascimento
                  </button>
                )}
                <BotaoPDF contentRef={refNasc} filename="reprodutivo-nascimentos" titulo="Reprodutivo: Nascimentos" />
              </div>
            </div>

            {(loadingNasc || partosNasc === null) ? <Loading /> : <>
            <div ref={refNasc}>
              {/* Linha 2 — pills de filtro */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                {[{ id:'todos', nome:'Todos' }, ...proprietarios].map(prop => {
                  const active = filtroNasc === prop.id
                  return (
                    <button key={prop.id} onClick={() => setFiltroNasc(prop.id)} style={{
                      padding:'4px 14px', borderRadius:20, fontSize:'.82rem', cursor:'pointer',
                      fontFamily:'inherit', fontWeight: active ? 600 : 400,
                      background: active ? '#7B2FBE' : 'white',
                      color: active ? 'white' : '#374151',
                      border: active ? '.5px solid #7B2FBE' : '.5px solid #D1D5DB',
                      transition: 'all .15s'
                    }}>
                      {prop.id === 'todos' ? 'Todos' : prop.nome.split(' ')[0]}
                    </button>
                  )
                })}
              </div>

              {/* Linha 3 — KPI cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(128px, 1fr))', gap:10, marginBottom:14 }}>
                <div style={{ background:'white', border:'.5px solid #E5E7EB', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:'1.6rem', fontWeight:700, color:'#2B6CD9' }}>{pFilt.length}</div>
                  <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:2 }}>Nascimentos no ciclo</div>
                </div>
                <div style={{ background:'#EFF6FF', border:'.5px solid #BFDBFE', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:'1.5rem', fontWeight:700, color:'#1D4ED8' }}>♂ {nascMachos}</div>
                  <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:2 }}>Machos</div>
                </div>
                <div style={{ background:'#FDF4FF', border:'.5px solid #F0ABFC', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:'1.5rem', fontWeight:700, color:'#86198F' }}>♀ {nascFemeas}</div>
                  <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:2 }}>Fêmeas</div>
                </div>
                {proprietarios.map(prop => {
                  const pProp = partosNasc.filter(p => p.mae?.proprietario_id === prop.id)
                  if (pProp.length === 0) return null
                  return (
                    <div key={prop.id} style={{ background:'#F0F9EC', border:'.5px solid #BBF7D0', borderRadius:12, padding:'12px 14px' }}>
                      <div style={{ fontSize:'.73rem', fontWeight:600, color:'#166534', marginBottom:3 }}>{prop.nome.split(' ')[0]}</div>
                      <div style={{ fontSize:'1.3rem', fontWeight:700, color:'#2B6CD9' }}>{pProp.length} nasc.</div>
                      <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:2 }}>
                        ♂{pProp.filter(p => p.bezerro?.sexo==='M').length} ♀{pProp.filter(p => p.bezerro?.sexo==='F').length}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Linha 4 — tabela filtrada */}
              {pFilt.length === 0
                ? <EmptyState icon="🐮" title="Nenhum nascimento registrado" />
                : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Data nasc.</th><th>Mãe</th><th>Proprietário</th><th>Sexo</th><th>Brinco</th><th>Touro</th><th>Prev. parto</th><th>Ações</th></tr>
                      </thead>
                      <tbody>
                        {pFilt.map(p => {
                          // Touro sempre pelo lote VINCULADO ao parto (por ID, via
                          // partos.lote_inseminacao_id) — nunca "o lote mais recente
                          // com diagnóstico P para a mãe", que pode ser de outro ciclo.
                          const loteDoP = todosLotes.find(l => l.id === p.lote_inseminacao_id) || null
                          const prevPartoLoteP = loteDoP?.data ? (() => {
                            const d = new Date(loteDoP.data + 'T12:00:00')
                            d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS)
                            return d.toLocaleDateString('pt-BR')
                          })() : '—'
                          return (
                          <tr key={p.id}>
                            <td style={{ whiteSpace:'nowrap' }}>{fmtData(p.data_parto)}</td>
                            <td><strong>{p.mae?.brinco||'—'}</strong></td>
                            <td style={{ fontSize:'.82rem' }}>{p.mae?.proprietario?.nome?.split(' ')[0]||'—'}</td>
                            <td>
                              {p.bezerro?.sexo==='F'
                                ? <span style={{ color:'#86198F', fontWeight:500 }}>♀ Fêmea</span>
                                : <span style={{ color:'#1D4ED8', fontWeight:500 }}>♂ Macho</span>}
                            </td>
                            <td><Badge color="gray">{p.bezerro?.brinco||'—'}</Badge></td>
                            <td style={{ fontSize:'.82rem', color:'#6B7280' }}>{loteDoP?.touro || '—'}</td>
                            <td style={{ fontSize:'.78rem', color:'#9CA3AF', whiteSpace:'nowrap' }}>{prevPartoLoteP}</td>
                            <td style={{ whiteSpace:'nowrap' }}>
                              {podeEditarReprodCiclo && (
                                <>
                                  <button onClick={() => abrirEditarParto(p)} title="Editar"
                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#2B6CD9', padding:4 }}>
                                    <i className="ti ti-edit" />
                                  </button>
                                  <button onClick={() => excluirParto(p)} title="Excluir"
                                    style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', padding:4 }}>
                                    <i className="ti ti-trash" />
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>{/* end refNasc */}
            </>}
          </div>
        )
      })()}

      {/* ── Índices ── */}
      {tab === 2 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refIndices} filename="reprodutivo-indices" titulo="Reprodutivo: Índices" />
          </div>
          {loadingIdx ? <Loading /> : <>
          <div ref={refIndices}>

            {/* Filtro por proprietário — reduz o funil da safra a um único dono */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
              {[{ id:'', nome:'Todos' }, ...proprietarios].map(prop => {
                const active = filtroPropIdx === prop.id
                return (
                  <button key={prop.id || 'todos'} onClick={() => setFiltroPropIdx(prop.id)} style={{
                    padding:'4px 14px', borderRadius:20, fontSize:'.82rem', cursor:'pointer',
                    fontFamily:'inherit', fontWeight: active ? 600 : 400,
                    background: active ? '#7B2FBE' : 'white',
                    color: active ? 'white' : '#374151',
                    border: active ? '.5px solid #7B2FBE' : '.5px solid #D1D5DB',
                    transition: 'all .15s'
                  }}>
                    {prop.id === '' ? 'Todos' : prop.nome.split(' ')[0]}
                  </button>
                )
              })}
            </div>

            {/* Seção 1 — Resultado da safra reprodutiva (consolidado do ciclo selecionado) */}
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
                <Badge color="blue"><i className="ti ti-stack" /> {lotesCicloAtual.length} lote{lotesCicloAtual.length!==1?'s':''} no ciclo</Badge>
                <Badge color="gray"><i className="ti ti-needle" /> {kpiInsTotal} exposições (serviços) no total — IA + monta natural</Badge>
                <Badge color="amber"><i className="ti ti-clock" /> Intervalo médio entre partos: {kpiIntervalo}</Badge>
              </div>
              <CardResultadoSafra
                titulo={`Resultado da safra reprodutiva — ${cicloLocal?.nome || ''}`}
                sm={{
                  matrizesAptas:       kpiMatrizesAptas,
                  txAproveitamento:    kpiTxAproveitamento,
                  total:               kpiIns,
                  prenhas:             kpiPrn,
                  txPrenhez:           kpiIns > 0 ? Math.round(kpiPrn / kpiIns * 100) : null,
                  gestando:            kpiGestando,
                  nAbortos:            kpiAbortos,
                  perdasNaoIdentificadas: kpiPerdasNaoIdentificadas,
                  perdaGestacional:    kpiPerdaGestacional,
                  nascimentos:         kpiPartos,
                  txNatalidade:        kpiIns > 0 ? Math.round(kpiPartos / kpiIns * 100) : null,
                  pesoMedioNascimento: kpiPesoMedioNascimento,
                  mortalidadeBezerros: kpiMortalidade,
                  ...kpiDesmame,
                }}
                andamento={kpiGestando > 0}
                previsao={previsaoSafraCiclo}
              />
            </div>

            {/* Seção 1B — Estação de monta (agrupa IATF + repasses) */}
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-title"><i className="ti ti-calendar-stats" /> Estação de monta</div>
              {estacoes.length === 0 ? (
                <p style={{ color:'#9CA3AF', fontSize:'.85rem', textAlign:'center', padding:'20px 0' }}>
                  Nenhuma estação de monta cadastrada neste ciclo. Vincule os lotes a uma estação ao criá-los ou editá-los (aba Lotes / Montas).
                </p>
              ) : (
                <>
                  <select value={estacaoIdxSel} onChange={e => setEstacaoIdxSel(e.target.value)}
                    style={{ maxWidth:340, marginBottom:14 }}>
                    <option value="">— selecione uma estação —</option>
                    {estacoes.map(es => <option key={es.id} value={es.id}>{es.nome}</option>)}
                  </select>
                  {estacaoIdxSel && (() => {
                    const estacaoObj = estacoes.find(es => es.id === estacaoIdxSel)
                    const lotesDaEstacao = lotesCicloAtual.filter(l => l.estacao_monta_id === estacaoIdxSel)
                    const todasInsEstBruto = lotesDaEstacao.flatMap(l => l.inseminacoes || [])
                    const todasInsEst = filtroPropIdx
                      ? todasInsEstBruto.filter(i => i.animal?.proprietario_id === filtroPropIdx)
                      : todasInsEstBruto
                    // Matrizes distintas — a vaca que entrou na IATF e no repasse conta 1x
                    const matrizesExpostas = contarExpostas(todasInsEst)
                    const matrizesPrenhas  = contarPrenhas(todasInsEst)
                    const prenhezAcumulada = calcTaxaPrenhez(todasInsEst)
                    const comparacaoData = [
                      ...lotesDaEstacao.map(l => ({ name: `Lote ${l.numero}`, prenhez: calcLoteMetrics(l).txPrenhez ?? 0 })),
                      { name: 'Acumulada', prenhez: prenhezAcumulada ?? 0 },
                    ]
                    return (
                      <div>
                        <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:10 }}>
                          {estacaoObj?.inicio ? fmtData(estacaoObj.inicio) : '—'}{estacaoObj?.fim ? ` – ${fmtData(estacaoObj.fim)}` : ''}
                          {estacaoObj?.observacoes && <> · {estacaoObj.observacoes}</>}
                        </div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:14 }}>
                          {lotesDaEstacao.length === 0
                            ? <span style={{ fontSize:'.82rem', color:'#9CA3AF' }}>Nenhum lote vinculado a esta estação ainda.</span>
                            : lotesDaEstacao.map(l => (
                                <Badge key={l.id} color="gray">Lote {l.numero} — {l.touro} ({l.inseminacoes?.length||0} insem.)</Badge>
                              ))
                          }
                        </div>
                        <div className="grid-3" style={{ marginBottom:14 }}>
                          <div style={{ background:'white',border:'.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',textAlign:'center' }}>
                            <div style={{ fontSize:'1.35rem',fontWeight:700,color:'#374151' }}>{matrizesExpostas}</div>
                            <div style={{ fontSize:'.72rem',color:'#6B7280',marginTop:2 }}>Matrizes expostas</div>
                          </div>
                          <div style={{ background:'white',border:'.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',textAlign:'center' }}>
                            <div style={{ fontSize:'1.35rem',fontWeight:700,color:'#1E55B0' }}>{matrizesPrenhas}</div>
                            <div style={{ fontSize:'.72rem',color:'#6B7280',marginTop:2 }}>Matrizes prenhas</div>
                          </div>
                          <div style={{ background:'#E8F0FC',border:'.5px solid #1BA89C',borderRadius:10,padding:'10px 12px',textAlign:'center' }}>
                            <div style={{ fontSize:'1.35rem',fontWeight:700,color:'#1E55B0' }}>{prenhezAcumulada!=null?`${prenhezAcumulada}%`:'—'}</div>
                            <div style={{ fontSize:'.72rem',color:'#6B7280',marginTop:2 }}>Prenhez acumulada da estação</div>
                          </div>
                        </div>
                        <div style={{ fontSize:'.76rem', color:'#6B7280', marginBottom:6 }}>Prenhez por lote (IATF x repasses) vs. acumulada:</div>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={comparacaoData} margin={{ top:4, right:10, left:-20, bottom:5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                            <XAxis dataKey="name" tick={{ fontSize:10 }} />
                            <YAxis tick={{ fontSize:10 }} domain={[0,100]} unit="%" />
                            <Tooltip formatter={v => `${v}%`} />
                            <Bar dataKey="prenhez" name="Prenhez %" radius={[4,4,0,0]}>
                              {comparacaoData.map((d, i) => (
                                <Cell key={i} fill={d.name === 'Acumulada' ? '#1E55B0' : '#7B2FBE'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Seção 2 — Bar chart comparativo */}
            <div className="card" style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                <span style={{ fontWeight:600, fontSize:'.88rem' }}><i className="ti ti-chart-bar-grouped" /> Comparativo por lote — {cicloLocal?.nome}</span>
              </div>
              {barData.length === 0
                ? <p style={{ color:'#9CA3AF', fontSize:'.85rem', textAlign:'center', padding:'20px 0' }}>Nenhum dado neste ciclo.</p>
                : <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={barData} margin={{ top:4, right:10, left:-20, bottom:28 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="name" tick={{ fontSize:9 }} angle={-25} textAnchor="end" />
                      <YAxis tick={{ fontSize:10 }} domain={[0,100]} unit="%" />
                      <Tooltip formatter={v => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize:11 }} />
                      <Bar dataKey="prenhez" name="Prenhez %" fill="#7B2FBE" radius={[4,4,0,0]} />
                      <Bar dataKey="paricao" name="Parição %"  fill="#0C447C" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>

            {/* Seção 3 + 4 — Line + Donut */}
            <div className="grid-2" style={{ marginBottom:16 }}>
              <div className="card">
                <div className="card-title"><i className="ti ti-chart-line" /> Evolução entre ciclos</div>
                {lineData.length < 2
                  ? <p style={{ color:'#9CA3AF', fontSize:'.82rem', textAlign:'center', padding:'20px 0' }}>Dados insuficientes para histórico.</p>
                  : <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={lineData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                        <XAxis dataKey="ciclo" tick={{ fontSize:10 }} />
                        <YAxis tick={{ fontSize:10 }} domain={[0,100]} unit="%" />
                        <Tooltip formatter={v => `${v}%`} />
                        <Legend wrapperStyle={{ fontSize:11 }} />
                        <Line type="monotone" dataKey="prenhez" name="Prenhez %" stroke="#7B2FBE" strokeWidth={2} dot={{ r:4 }} />
                        <Line type="monotone" dataKey="paricao" name="Parição %"  stroke="#0C447C" strokeWidth={2} dot={{ r:4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                }
              </div>
              <div className="card">
                <div className="card-title"><i className="ti ti-chart-donut" /> Diagnósticos — ciclo selecionado</div>
                {pieData.length === 0
                  ? <p style={{ color:'#9CA3AF', fontSize:'.82rem', textAlign:'center', padding:'20px 0' }}>Sem diagnósticos registrados.</p>
                  : <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} dataKey="value" labelLine={false}>
                            {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip formatter={(v, name) => [`${v} animais`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display:'flex', justifyContent:'center', gap:14, fontSize:'.78rem', marginTop:4 }}>
                        {pieData.map(d => (
                          <span key={d.name} style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ width:10, height:10, borderRadius:'50%', background:d.color, display:'inline-block', flexShrink:0 }} />
                            {d.name}: <strong style={{ marginLeft:2 }}>{d.value}</strong>
                          </span>
                        ))}
                      </div>
                    </>
                }
              </div>
            </div>

            {/* Seção 5 — Tabela dinâmica */}
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-title"><i className="ti ti-table" /> Todos os lotes — todos os ciclos</div>
              <div className="table-wrap" style={{ border:'none' }}>
                <table>
                  <thead>
                    <tr>
                      {[
                        ['ciclo','Ciclo'],['numero','Lote'],['touro','Touro'],['data','Data'],
                        ['total','Insem.'],['prenhas','Prenhas'],['vazias','Vazias'],
                        ['txPrenhez','Tx Prenhez'],['nascimentos','Nasc.'],['txParicao','Tx Parição'],['partoPrev','Parto Prev.']
                      ].map(([col, label]) => (
                        <th key={col} onClick={() => { setSortCol(col); setSortAsc(p => sortCol === col ? !p : true) }}
                          style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                          {label}{sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabelaLotes.map(row => (
                      <tr key={row.id} style={{
                        background: row.ciclo_id === cicloLocal?.id ? '#F0F9EC' : 'white',
                        fontWeight: row.ciclo_id === cicloLocal?.id ? 500 : 400
                      }}>
                        <td>
                          {row.ciclo?.nome || '—'}
                          {row.ciclo_id === cicloLocal?.id && (
                            <span style={{ marginLeft:5, padding:'1px 5px', borderRadius:8, fontSize:'.63rem', background:'#E8F0FC', color:'#1E55B0' }}>selecionado</span>
                          )}
                        </td>
                        <td>{row.numero}</td>
                        <td>{row.touro}</td>
                        <td style={{ fontSize:'.78rem', whiteSpace:'nowrap' }}>{fmtData(row.data)}</td>
                        <td>{row._m.total}</td>
                        <td style={{ color:'#1E55B0' }}>{row._m.prenhas}</td>
                        <td style={{ color:'#791F1F' }}>{row._m.vazias}</td>
                        <td style={{ fontWeight:500, color: row._m.txPrenhez >= 85 ? '#1E55B0' : row._m.txPrenhez > 0 ? '#D97706' : '#9CA3AF' }}>
                          {row._m.total > 0 ? `${row._m.txPrenhez}%` : '—'}
                        </td>
                        <td>{row._m.nascimentos || '—'}</td>
                        <td style={{ color: row._m.txParicao >= 80 ? '#1E55B0' : row._m.txParicao > 0 ? '#D97706' : '#9CA3AF' }}>
                          {row._m.prenhas > 0 ? `${row._m.txParicao}%` : '—'}
                        </td>
                        <td style={{ fontSize:'.78rem', color:'#9CA3AF', whiteSpace:'nowrap' }}>{row._m.partoPrev}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Seção 6 — Ranking touros */}
            <div className="card">
              <div className="card-title"><i className="ti ti-trophy" /> Ranking de touros</div>
              {tourosRanking.length === 0
                ? <p style={{ color:'#9CA3AF', fontSize:'.85rem', textAlign:'center' }}>Sem dados de touros.</p>
                : tourosRanking.map((t, i) => (
                    <div key={t.touro} style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:'.85rem', fontWeight:700, minWidth:22, color: i===0?'#D97706':i===1?'#6B7280':i===2?'#A0522D':'#9CA3AF' }}>
                            #{i+1}
                          </span>
                          <span style={{ fontWeight:500 }}>{t.touro}</span>
                        </div>
                        <div>
                          <span style={{ fontWeight:700, color:'#2B6CD9' }}>{t.txPrenhez}%</span>
                          <span style={{ fontSize:'.75rem', color:'#9CA3AF', marginLeft:6 }}>{t.totalIns} insem.</span>
                        </div>
                      </div>
                      <div className="progress-bg">
                        <div className="progress-fill" style={{ width:`${t.txPrenhez}%`, background: i === 0 ? '#D97706' : '#7B2FBE' }} />
                      </div>
                    </div>
                  ))
              }
            </div>

          </div>{/* end refIndices */}
          </>}
        </div>
      )}

      {/* ── Modal novo lote / editar lote ── */}
      {(() => {
        // Tipo é definido pelo botão que abriu o modal (Novo lote de inseminação
        // / Nova monta natural) — não é mais uma escolha dentro do modal, só um
        // rótulo fixo indicando o que está sendo criado/editado.
        const ehNatural = (form.tipo || 'ia') === 'natural'
        return (
      <Modal open={modal==='lote'} onClose={()=>{ setModal(null); setLoteEdit(null) }}
        title={ehNatural ? (loteEdit ? 'Editar monta natural' : 'Nova monta natural') : (loteEdit ? 'Editar lote de inseminação' : 'Novo lote de inseminação')} width={600}>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:6, marginBottom:14,
          background: ehNatural ? '#F3E8FF' : '#E8F0FC', color: ehNatural ? '#5B2A9E' : '#1E55B0',
          border: `.5px solid ${ehNatural ? '#C4B5FD' : '#93C5FD'}`, borderRadius:8, padding:'5px 12px',
          fontSize:'.8rem', fontWeight:600,
        }}>
          <i className={`ti ${ehNatural ? 'ti-paw' : 'ti-needle'}`} />
          {ehNatural ? 'Monta Natural' : 'Inseminação'}
        </div>
        <div className="grid-form">
          <Field label={`Data da ${ehNatural ? 'monta' : 'inseminação'}`} required>
            <input type="date" value={form.data||''}
              onChange={e=>setForm(p=>({...p,data:e.target.value}))} />
          </Field>
          {!ehNatural && (
            <Field label="Touro" required>
              <input value={form.touro||''} onChange={e=>setForm(p=>({...p,touro:e.target.value}))} placeholder="Nome do touro" />
            </Field>
          )}
          {!ehNatural && (
            <Field label="Protocolo">
              <input value={form.protocolo||''} onChange={e=>setForm(p=>({...p,protocolo:e.target.value}))} placeholder="ex: IATF P4" />
            </Field>
          )}
          <Field label="Estação de monta" hint="Agrupa este lote com os demais desta estação (IATF, repasses, montas naturais)">
            <select
              value={form.criandoEstacao ? '__nova__' : (form.estacao_monta_id || '')}
              onChange={e => {
                const v = e.target.value
                if (v === '__nova__') setForm(p => ({ ...p, estacao_monta_id: '', criandoEstacao: true }))
                else setForm(p => ({ ...p, estacao_monta_id: v || null, criandoEstacao: false }))
              }}>
              <option value="">— nenhuma (lote avulso) —</option>
              {estacoes.map(es => (
                <option key={es.id} value={es.id}>{es.nome} ({fmtData(es.inicio)}{es.fim ? ` – ${fmtData(es.fim)}` : ''})</option>
              ))}
              <option value="__nova__">+ Criar nova estação de monta…</option>
            </select>
          </Field>
        </div>
        {ehNatural && (
          <div style={{ marginBottom:14 }}>
            <label style={{ marginBottom:6, display:'block' }}>
              Touros <span style={{ fontWeight:400, fontSize:'.75rem', color:'#9CA3AF' }}>(pelo menos 1 — o 1º da lista é o principal)</span>
            </label>
            {(form.touros || []).length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
                {form.touros.map((nome, i) => (
                  <span key={i} style={{
                    background:'#F3E8FF', color:'#5B2A9E', border:'.5px solid #C4B5FD',
                    borderRadius:10, padding:'2px 8px', fontSize:'.8rem', display:'inline-flex', alignItems:'center', gap:4
                  }}>
                    {nome}
                    <button type="button" onClick={() => setForm(p => ({ ...p, touros: p.touros.filter((_, j) => j !== i) }))}
                      style={{ background:'none',border:'none',color:'#7B2FBE',cursor:'pointer',fontSize:14,padding:0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <input
                value={form.novoTouro || ''}
                onChange={e => setForm(p => ({ ...p, novoTouro: e.target.value }))}
                onKeyDown={e => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const nome = (form.novoTouro || '').trim()
                  if (nome) setForm(p => ({ ...p, touros: [...(p.touros || []), nome], novoTouro: '' }))
                }}
                placeholder="Nome do touro" style={{ flex:1 }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                const nome = (form.novoTouro || '').trim()
                if (nome) setForm(p => ({ ...p, touros: [...(p.touros || []), nome], novoTouro: '' }))
              }}>
                <i className="ti ti-plus" /> Adicionar
              </button>
            </div>
            {(form.touros || []).length > 1 && (
              <div style={{ fontSize:'.72rem', color:'#92620A', marginTop:6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize:11 }} /> Com mais de um touro, a paternidade dos bezerros deste lote fica indefinida — o pai é registrado como "Monta natural — Lote", não um touro específico.
              </div>
            )}
          </div>
        )}
        {form.criandoEstacao && (
          <>
            <div style={{ fontSize:'.78rem', color:'#6B7280', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>
              A estação de monta agrupa a IATF, os repasses e as montas naturais. Início = data da primeira monta; Fim = data prevista para a última (pode deixar em branco e ajustar depois).
            </div>
            <div className="grid-form3" style={{ marginTop:-4 }}>
              <Field label="Nome da estação" required>
                <input value={form.nova_estacao_nome||''} onChange={e=>setForm(p=>({...p,nova_estacao_nome:e.target.value}))} placeholder="ex: Estação 2025/26" />
              </Field>
              <Field label="Início" required>
                <input type="date" value={form.nova_estacao_inicio||''} onChange={e=>setForm(p=>({...p,nova_estacao_inicio:e.target.value}))} />
              </Field>
              <Field label="Fim">
                <input type="date" value={form.nova_estacao_fim||''} onChange={e=>setForm(p=>({...p,nova_estacao_fim:e.target.value}))} />
              </Field>
            </div>
          </>
        )}
        {!loteEdit && (
        <div style={{ marginBottom:10 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <label>Animais do lote ({selBrs.length} selecionados)</label>
            <MicButton hint='Voz: "brinco zero três"' onResult={t => {
              const n = t.match(/\d+/g)
              if (n) { const br = n[0].padStart(2,'0'); if (!selBrs.includes(br) && animais.find(a=>a.brinco===br)) togSel(br) }
            }} />
          </div>
          {selBrs.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
              {selBrs.map(br => (
                <span key={br} style={{
                  background:'#E8F0FC', color:'#1E55B0', border:'.5px solid #1BA89C',
                  borderRadius:10, padding:'2px 8px', fontSize:'.8rem', display:'inline-flex', alignItems:'center', gap:4
                }}>
                  {br}
                  <button onClick={() => togSel(br)} style={{ background:'none',border:'none',color:'#7B2FBE',cursor:'pointer',fontSize:14,padding:0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize:'.75rem', color:'#6B7280', marginBottom:6 }}>
            Apenas vacas vazias estão disponíveis para {ehNatural ? 'monta natural' : 'inseminação'}.
          </div>
          {/* Busca/adiciona direto por brinco, além dos filtros e da lista abaixo —
              mesma lógica do MicButton (achar em femsVazias e togSel), só via texto. */}
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input
              value={buscaBrincoLote}
              onChange={e => setBuscaBrincoLote(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                const br = buscaBrincoLote.trim()
                const a = femsVazias.find(x => x.brinco === br) || femsVazias.find(x => x.brinco === br.padStart(2,'0'))
                if (!a) { toast('Brinco não encontrado entre as vacas vazias disponíveis.', 'error'); return }
                if (!selBrs.includes(a.brinco)) togSel(a.brinco)
                setBuscaBrincoLote('')
              }}
              placeholder="Buscar/adicionar por brinco…" style={{ flex:1 }} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
              const br = buscaBrincoLote.trim()
              const a = femsVazias.find(x => x.brinco === br) || femsVazias.find(x => x.brinco === br.padStart(2,'0'))
              if (!a) { toast('Brinco não encontrado entre as vacas vazias disponíveis.', 'error'); return }
              if (!selBrs.includes(a.brinco)) togSel(a.brinco)
              setBuscaBrincoLote('')
            }}>Adicionar</button>
          </div>
          <PainelFiltroAnimais
            lotesSistema={lotesSistema} proprietarios={proprietarios} categorias={categoriasInsemDisponiveis}
            filtroLote={filtroLoteInsem} setFiltroLote={setFiltroLoteInsem}
            filtroProp={filtroPropInsem} setFiltroProp={setFiltroPropInsem}
            filtroCateg={filtroCategInsem} setFiltroCateg={setFiltroCategInsem}
          />
          {femsVaziasFiltradas.length > 0 && podeEditarReprodCiclo && (
            <button type="button" className="btn btn-secondary btn-xs" style={{ marginBottom:8 }}
              onClick={() => {
                const todos = femsVaziasFiltradas.map(a => a.brinco)
                const todosSelecionados = todos.every(br => selBrs.includes(br))
                setSelBrs(todosSelecionados
                  ? selBrs.filter(br => !todos.includes(br))
                  : [...new Set([...selBrs, ...todos])])
              }}>
              Selecionar todos do filtro
            </button>
          )}
          <div style={{ border:'.5px solid #E5E7EB', borderRadius:8, maxHeight:180, overflowY:'auto', background:'#F9FAFB' }}>
            {femsVaziasFiltradas.length === 0
              ? <div style={{ padding:'16px 12px', textAlign:'center', color:'#9CA3AF', fontSize:'.82rem' }}>
                  Nenhuma vaca vazia disponível no momento.
                </div>
              : femsVaziasFiltradas.map(a => (
                  <label key={a.id} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'7px 12px', cursor:'pointer', fontSize:'.82rem',
                    borderBottom:'.5px solid #F3F4F6'
                  }}>
                    <input type="checkbox" checked={selBrs.includes(a.brinco)} onChange={() => togSel(a.brinco)} />
                    <strong>{a.brinco}</strong>
                    <span style={{ color:'#6B7280' }}>{a.proprietario?.nome?.split(' ')[0]}</span>
                    <Badge color="gray">{calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)}</Badge>
                  </label>
                ))
            }
          </div>
        </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={salvarLote} disabled={saving || !podeEditarReprodCiclo}>
            {saving
              ? (loteEdit ? 'Salvando...' : 'Registrando...')
              : <><i className="ti ti-check" /> {loteEdit ? 'Salvar alterações' : 'Registrar lote'}</>
            }
          </button>
          <button className="btn btn-secondary" onClick={()=>{ setModal(null); setLoteEdit(null) }}>Cancelar</button>
        </div>
      </Modal>
        )
      })()}

      {/* ── Modal adicionar animais a um lote existente ── */}
      <Modal open={modal==='addAnimaisLote'} onClose={()=>setModal(null)} title="Adicionar animais ao lote" width={600}>
        <div style={{ marginBottom:10 }}>
          <label>Animais a adicionar ({selBrsAdd.length} selecionados)</label>
          {selBrsAdd.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, margin:'8px 0' }}>
              {selBrsAdd.map(br => (
                <span key={br} style={{
                  background:'#E8F0FC', color:'#1E55B0', border:'.5px solid #1BA89C',
                  borderRadius:10, padding:'2px 8px', fontSize:'.8rem', display:'inline-flex', alignItems:'center', gap:4
                }}>
                  {br}
                  <button onClick={() => togSelAdd(br)} style={{ background:'none',border:'none',color:'#7B2FBE',cursor:'pointer',fontSize:14,padding:0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ fontSize:'.75rem', color:'#6B7280', marginBottom:6 }}>
            Apenas vacas vazias que ainda não estão neste lote estão disponíveis.
          </div>
          <PainelFiltroAnimais
            lotesSistema={lotesSistema} proprietarios={proprietarios} categorias={categoriasInsemDisponiveis}
            filtroLote={filtroLoteInsem} setFiltroLote={setFiltroLoteInsem}
            filtroProp={filtroPropInsem} setFiltroProp={setFiltroPropInsem}
            filtroCateg={filtroCategInsem} setFiltroCateg={setFiltroCategInsem}
          />
          {femsForaDoLote.length > 0 && (
            <button type="button" className="btn btn-secondary btn-xs" style={{ marginBottom:8 }}
              onClick={() => {
                const todos = femsForaDoLote.map(a => a.brinco)
                const todosSelecionados = todos.every(br => selBrsAdd.includes(br))
                setSelBrsAdd(todosSelecionados
                  ? selBrsAdd.filter(br => !todos.includes(br))
                  : [...new Set([...selBrsAdd, ...todos])])
              }}>
              Selecionar todos do filtro
            </button>
          )}
          <div style={{ border:'.5px solid #E5E7EB', borderRadius:8, maxHeight:180, overflowY:'auto', background:'#F9FAFB' }}>
            {femsForaDoLote.length === 0
              ? <div style={{ padding:'16px 12px', textAlign:'center', color:'#9CA3AF', fontSize:'.82rem' }}>
                  Nenhuma vaca vazia disponível para adicionar.
                </div>
              : femsForaDoLote.map(a => (
                  <label key={a.id} style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'7px 12px', cursor:'pointer', fontSize:'.82rem',
                    borderBottom:'.5px solid #F3F4F6'
                  }}>
                    <input type="checkbox" checked={selBrsAdd.includes(a.brinco)} onChange={() => togSelAdd(a.brinco)} />
                    <strong>{a.brinco}</strong>
                    <span style={{ color:'#6B7280' }}>{a.proprietario?.nome?.split(' ')[0]}</span>
                    <Badge color="gray">{calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)}</Badge>
                  </label>
                ))
            }
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={adicionarAnimaisLote} disabled={saving || !podeEditarReprodCiclo}>
            {saving ? 'Adicionando...' : <><i className="ti ti-check" /> Adicionar ao lote</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal editar estação de monta ── */}
      <Modal open={!!estacaoEdit} onClose={() => setEstacaoEdit(null)} title="Editar estação de monta" width={460}>
        {estacaoEdit && (() => {
          const lotesDaEstacaoEdit = lotes.filter(l => l.estacao_monta_id === estacaoEdit.id)
          return (
            <>
              {lotesDaEstacaoEdit.length > 0 && (
                <div style={{ fontSize:'.78rem', color:'#6B7280', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 12px', marginBottom:12 }}>
                  {lotesDaEstacaoEdit.length} lote{lotesDaEstacaoEdit.length!==1?'s':''} vinculado{lotesDaEstacaoEdit.length!==1?'s':''} a esta estação. O novo período precisa incluir a data de todos eles: {lotesDaEstacaoEdit.map(l => `Lote ${l.numero} (${fmtData(l.data)})`).join(', ')}.
                </div>
              )}
              <div className="grid-form">
                <Field label="Nome da estação" required>
                  <input value={estacaoEdit.nome} onChange={e=>setEstacaoEdit(p=>({...p,nome:e.target.value}))} />
                </Field>
                <Field label="Início" required>
                  <input type="date" value={estacaoEdit.inicio} onChange={e=>setEstacaoEdit(p=>({...p,inicio:e.target.value}))} />
                </Field>
                <Field label="Fim">
                  <input type="date" value={estacaoEdit.fim} onChange={e=>setEstacaoEdit(p=>({...p,fim:e.target.value}))} />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={salvarEdicaoEstacao} disabled={savingEstacao}>
                  {savingEstacao ? 'Salvando...' : <><i className="ti ti-check" /> Salvar alterações</>}
                </button>
                <button className="btn btn-secondary" onClick={() => setEstacaoEdit(null)}>Cancelar</button>
              </div>
            </>
          )
        })()}
      </Modal>

      {/* ── Modal registrar aborto ── */}
      <Modal open={modal==='aborto'} onClose={()=>{ setModal(null); setAbortoAlvo(null) }}
        title={`Registrar aborto — Brinco ${abortoAlvo?.brinco || ''}`} width={460}>
        <div className="grid-form">
          <Field label="Data do aborto" required>
            <input type="date" value={formAborto.data||''} onChange={e=>setFormAborto(p=>({...p,data:e.target.value}))} />
          </Field>
          <Field label="Causa">
            <select value={formAborto.causa||'desconhecido'} onChange={e=>setFormAborto(p=>({...p,causa:e.target.value}))}>
              <option value="infeccioso">Infeccioso</option>
              <option value="nutricional">Nutricional</option>
              <option value="traumatico">Traumático</option>
              <option value="desconhecido">Desconhecido</option>
              <option value="outro">Outro (ver observações)</option>
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea value={formAborto.observacoes||''} onChange={e=>setFormAborto(p=>({...p,observacoes:e.target.value}))} placeholder="opcional" />
        </Field>
        <div style={{ fontSize:'.75rem', color:'#9CA3AF', marginTop:4 }}>
          A situação reprodutiva do animal volta para "vazia". O diagnóstico de prenhez original é mantido — o aborto fica registrado como um evento separado.
        </div>
        <div className="modal-actions" style={{ marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvarAborto} disabled={saving || !podeEditarReprodCiclo}>
            {saving ? 'Registrando...' : <><i className="ti ti-check" /> Registrar aborto</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>{ setModal(null); setAbortoAlvo(null) }}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal parto ── */}
      <Modal open={modal==='parto'} onClose={()=>setModal(null)} title="Registrar nascimento" width={520}>
        {/* Bloco de voz único */}
        <div style={{ background:'#EEEDFE', borderRadius:8, padding:'10px 12px', marginBottom:14 }}>
          <div style={{ fontSize:'.78rem', color:'#3C3489', marginBottom:8, lineHeight:1.5 }}>
            📢 Fale: <b>[número da mãe] [sexo] [peso opcional]</b><br/>
            <span style={{ color:'#5B52A3' }}>Exemplo: <i>"três fêmea"</i> ou <i>"três fêmea 32"</i></span>
          </div>
          <MicButton hint='ex: "três fêmea" ou "três fêmea 32"' onResult={t => {
            const lower = t.toLowerCase()

            // Localiza sexo e sua posição na string
            const machoM = lower.match(/macho/)
            const femeaM = lower.match(/f[êe]mea|bezerra/)
            let sexo = null, sexoFim = -1
            if (machoM) { sexo = 'M'; sexoFim = machoM.index + machoM[0].length }
            else if (femeaM) { sexo = 'F'; sexoFim = femeaM.index + femeaM[0].length }

            // Primeiro grupo de dígitos = brinco
            const nums   = lower.match(/\d+/g)
            const brinco = nums ? nums[0].padStart(2, '0') : null

            // Dígitos APÓS a palavra de sexo = peso (opcional)
            let peso = null
            if (sexoFim >= 0) {
              const afterSexo = lower.slice(sexoFim)
              const pesoM = afterSexo.match(/\d+/)
              if (pesoM) peso = pesoM[0]
            }

            if (!brinco || !sexo) {
              toast('Não entendi. Fale o número da mãe e o sexo (macho/fêmea)', 'error'); return
            }
            const mae = maesElegiveis.find(a => a.brinco === brinco)
            if (!mae) { toast(`Brinco ${brinco} não encontrado entre as mães com diagnóstico confirmado`, 'error'); return }

            // Touro SEMPRE do lote resolvido por ID (o mesmo vinculado ao parto) —
            // nunca de "o lote mais recente com diagnóstico P", que pode ser de um
            // ciclo diferente (o número do lote reinicia a cada ciclo, então nunca
            // usar lote.numero para identificar/comparar lotes entre ciclos).
            const loteSafra = encontrarLoteSafra(mae.id, form.data_parto)
            const touro   = resolverPaiDerivado(loteSafra)
            const loteLbl = mae.lote?.nome || '—'
            const prop    = mae.proprietario?.nome || '—'

            const pesoTxt = peso ? ` · ${peso}kg` : ''
            const resumo  = `Mãe ${brinco} · ${sexo === 'M' ? 'Macho' : 'Fêmea'}${pesoTxt} · Touro ${touro||'—'} · ${prop} · ${loteLbl}`
            setForm(p => ({ ...p, mae_brinco: brinco, sexo_bezerro: sexo, touro_pai: touro, auto_lote: loteLbl, auto_prop: prop, voz_resumo: resumo, peso_nascimento: peso || p.peso_nascimento, lote_inseminacao_id: loteSafra?.id || null }))
          }} />
        </div>

        {/* Resumo do que foi entendido */}
        {form.voz_resumo && (
          <div style={{ background:'#E8F0FC', border:'.5px solid #1BA89C', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:'.85rem', color:'#1E55B0', fontWeight:500 }}>
            <i className="ti ti-check" style={{ marginRight:6 }} />{form.voz_resumo}
          </div>
        )}

        <div className="grid-form">
          <Field label="Data do nascimento" required>
            <input type="date" value={form.data_parto||''} onChange={e=>setForm(p=>({...p,data_parto:e.target.value}))} />
          </Field>
          <Field label="Brinco da mãe" required>
            <select value={form.mae_brinco||''} onChange={e => {
              const brinco = e.target.value
              const mae = maesElegiveis.find(a => a.brinco === brinco)
              // Touro SEMPRE do lote resolvido por ID (ver comentário acima, no handler de voz)
              const loteSafra = mae ? encontrarLoteSafra(mae.id, form.data_parto) : null
              const touro   = resolverPaiDerivado(loteSafra)
              const loteLbl = mae?.lote?.nome || '—'
              const prop    = mae?.proprietario?.nome || '—'
              setForm(p => ({ ...p, mae_brinco: brinco, touro_pai: touro, auto_lote: loteLbl, auto_prop: prop, voz_resumo: null, lote_inseminacao_id: loteSafra?.id || null }))
            }}>
              <option value="">— selecione —</option>
              {maesElegiveis.map(a => (
                <option key={a.id} value={a.brinco}>{a.brinco} · {a.proprietario?.nome?.split(' ')[0]}</option>
              ))}
            </select>
            <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:4 }}>
              Apenas vacas com diagnóstico de prenhez confirmado em algum lote (inseminação ou monta natural) aparecem aqui.
            </div>
          </Field>
          <Field label="Sexo do bezerro" required>
            <select value={form.sexo_bezerro||''} onChange={e=>setForm(p=>({...p,sexo_bezerro:e.target.value}))}>
              <option value="">— selecione —</option>
              <option value="M">Macho ♂</option>
              <option value="F">Fêmea ♀</option>
            </select>
          </Field>
          <Field label="Touro pai">
            <input value={form.touro_pai||''} readOnly style={{ background:'#F9FAFB', color:'#6B7280', cursor:'default' }} />
          </Field>
          <Field label="Proprietário">
            <input value={form.auto_prop||''} readOnly style={{ background:'#F9FAFB', color:'#6B7280', cursor:'default' }} />
          </Field>
          <Field label="Lote">
            <input value={form.auto_lote||''} readOnly style={{ background:'#F9FAFB', color:'#6B7280', cursor:'default' }} />
          </Field>
        </div>

        {/* Vínculo com a safra reprodutiva (lote de inseminação que originou a gestação) — em
            destaque visual proposital, para o usuário ver claramente antes de salvar. */}
        {form.mae_brinco && (() => {
          const maeObj = animais.find(a => a.brinco === form.mae_brinco)
          const candidatos = maeObj
            ? todosLotes
                .filter(l => l.inseminacoes?.some(i => i.animal_id === maeObj.id && i.diagnostico === 'P'))
                .slice()
                .sort((a, b) => (b.data||'').localeCompare(a.data||''))
            : []
          const loteVinculado = candidatos.find(l => l.id === form.lote_inseminacao_id)
          return (
            <div style={{
              background: loteVinculado ? '#E8F0FC' : '#FEF3C7',
              border: `1.5px solid ${loteVinculado ? '#1BA89C' : '#F3D5A3'}`,
              borderRadius: 10, padding: '10px 14px', marginBottom: 14
            }}>
              <div style={{ fontSize:'.68rem', fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:.4, marginBottom:5 }}>
                <i className="ti ti-link" /> Safra (lote de origem)
              </div>
              <div style={{ fontSize:'.92rem', fontWeight:700, color: loteVinculado ? '#1E55B0' : '#92620A', marginBottom: 8 }}>
                {loteVinculado
                  ? <>Vinculado: Lote {loteVinculado.numero} — {loteVinculado.ciclo?.nome || ''} — {
                      (loteVinculado.lote_touros?.length > 0)
                        ? `vários touros (paternidade indefinida): ${[loteVinculado.touro, ...loteVinculado.lote_touros.map(t => t.nome)].join(', ')}`
                        : loteVinculado.touro
                    } · {loteVinculado.tipo === 'natural' ? 'Monta Natural' : 'IA'} ({fmtData(loteVinculado.data)})</>
                  : <>Sem lote vinculado</>}
              </div>
              {candidatos.length > 0 ? (
                <select value={form.lote_inseminacao_id || ''}
                  onChange={e => {
                    const novoId = e.target.value || null
                    // O touro acompanha o lote escolhido manualmente — nunca fica
                    // dessincronizado do lote de fato vinculado.
                    const novoLote = candidatos.find(l => l.id === novoId)
                    setForm(p => ({ ...p, lote_inseminacao_id: novoId, touro_pai: resolverPaiDerivado(novoLote) }))
                  }}
                  style={{ width:'100%' }}>
                  <option value="">— nenhum (sem lote) —</option>
                  {candidatos.map(l => (
                    <option key={l.id} value={l.id}>Lote {l.numero} — {l.ciclo?.nome || ''} — {l.touro} · {l.tipo === 'natural' ? 'Monta Natural' : 'IA'} ({fmtData(l.data)})</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize:'.75rem', color:'#92620A' }}>
                  Nenhum lote com diagnóstico de prenhez encontrado para esta mãe — será registrado sem lote de origem vinculado.
                </div>
              )}
            </div>
          )
        })()}

        <div className="grid-form">
          <Field label="Peso ao nascer (kg)">
            <input type="number" min="0" step="0.1" value={form.peso_nascimento||''} onChange={e=>setForm(p=>({...p,peso_nascimento:e.target.value}))} placeholder="opcional" />
          </Field>
          <Field label="Observações">
            <input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional" />
          </Field>
        </div>
        <div className="modal-actions" style={{ marginTop:14 }}>
          {/* podeEditarReprod (permissão) — não podeEditarReprodCiclo, ver
              comentário em salvarParto. */}
          <button className="btn btn-primary" onClick={salvarParto} disabled={saving || !podeEditarReprod}>
            {saving ? 'Registrando...' : <><i className="ti ti-check" /> Registrar e criar animal</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Modal editar nascimento ── */}
      <Modal open={!!editParto} onClose={()=>setEditParto(null)} title="Editar nascimento" width={480}>
        {editParto && (
          <>
            <div className="grid-form">
              <Field label="Data do nascimento" required>
                <input type="date" value={editParto.data_parto||''} onChange={e=>setEditParto(p=>({...p,data_parto:e.target.value}))} />
              </Field>
              <Field label="Sexo do bezerro" required>
                <select value={editParto.sexo_bezerro||'F'} onChange={e=>setEditParto(p=>({...p,sexo_bezerro:e.target.value}))}>
                  <option value="F">Fêmea</option>
                  <option value="M">Macho</option>
                </select>
              </Field>
            </div>
            <div className="grid-form">
              <Field label="Brinco do bezerro">
                <input value={editParto.brinco_bezerro||''} onChange={e=>setEditParto(p=>({...p,brinco_bezerro:e.target.value}))} />
              </Field>
            </div>
            <Field label="Observações">
              <textarea value={editParto.observacoes||''} onChange={e=>setEditParto(p=>({...p,observacoes:e.target.value}))} placeholder="opcional" />
            </Field>
            <div className="modal-actions" style={{ marginTop:14 }}>
              <button className="btn btn-primary" onClick={salvarEdicaoParto}>
                <i className="ti ti-check" /> Salvar
              </button>
              <button className="btn btn-secondary" onClick={()=>setEditParto(null)}>Cancelar</button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Modal editar aborto ── */}
      <Modal open={!!editAborto} onClose={()=>setEditAborto(null)} title={`Editar aborto — Brinco ${editAborto?.brinco || ''}`} width={460}>
        {editAborto && (
          <>
            <div className="grid-form">
              <Field label="Data do aborto" required>
                <input type="date" value={editAborto.data||''} onChange={e=>setEditAborto(p=>({...p,data:e.target.value}))} />
              </Field>
              <Field label="Causa">
                <select value={editAborto.causa||'desconhecido'} onChange={e=>setEditAborto(p=>({...p,causa:e.target.value}))}>
                  <option value="infeccioso">Infeccioso</option>
                  <option value="nutricional">Nutricional</option>
                  <option value="traumatico">Traumático</option>
                  <option value="desconhecido">Desconhecido</option>
                  <option value="outro">Outro (ver observações)</option>
                </select>
              </Field>
            </div>
            <Field label="Observações">
              <textarea value={editAborto.observacoes||''} onChange={e=>setEditAborto(p=>({...p,observacoes:e.target.value}))} placeholder="opcional" />
            </Field>
            <div className="modal-actions" style={{ marginTop:14 }}>
              <button className="btn btn-primary" onClick={salvarEdicaoAborto}>
                <i className="ti ti-check" /> Salvar
              </button>
              <button className="btn btn-secondary" onClick={()=>setEditAborto(null)}>Cancelar</button>
            </div>
          </>
        )}
      </Modal>

      {/* ── Modal editar data do diagnóstico ── */}
      <Modal open={!!editDiag} onClose={()=>setEditDiag(null)} title={`Editar data do diagnóstico — Brinco ${editDiag?.brinco || ''}`} width={420}>
        {editDiag && (
          <>
            <Field label="Data do diagnóstico" required>
              <input type="date" value={editDiag.data||''} onChange={e=>setEditDiag(p=>({...p,data:e.target.value}))} />
            </Field>
            <div className="modal-actions" style={{ marginTop:14 }}>
              <button className="btn btn-primary" onClick={salvarEdicaoDiagData}>
                <i className="ti ti-check" /> Salvar
              </button>
              <button className="btn btn-secondary" onClick={()=>setEditDiag(null)}>Cancelar</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
