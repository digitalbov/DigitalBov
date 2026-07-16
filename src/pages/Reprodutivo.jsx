import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase, db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useFazenda } from '../lib/FazendaContext'
import { useConta } from '../lib/ContaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { fmtData, pct, contarMatrizes, contarExpostas, contarPrenhas, calcTaxaPrenhez, calcCategoriaRebanho, algumErro } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TABS = ['Lotes de Inseminação','Nascimentos','Índices']
const GESTACAO_ANGUS_DIAS = 283
const GESTACAO_MIN_DIAS = 260
const GESTACAO_MAX_DIAS = 300
// Intervalo entre partos plausível para bovinos (usado no cálculo do intervalo médio)
const INTERVALO_PARTOS_MIN_DIAS = 300
const INTERVALO_PARTOS_MAX_DIAS = 700

// Card único do funil da safra reprodutiva (Matrizes aptas → Aproveitamento →
// Inseminadas → Prenhez → Partos/Parição → Perdas). Reaproveitado tanto no
// detalhe de um lote quanto, consolidado, na aba Índices — mesmo visual nos
// dois lugares para o usuário reconhecer facilmente.
function CardResultadoSafra({ titulo, sm, andamento, previsao }) {
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
          ['Inseminadas (expostas)',       sm.total,                                                        '#111'   ],
          ['Prenhas',                      sm.prenhas,                                                      '#1E55B0'],
          ['Taxa de prenhez',              sm.txPrenhez!=null?`${sm.txPrenhez}%`:'—',                      '#1E55B0', 'Matrizes distintas com diagnóstico P ÷ matrizes distintas expostas (não conta a mesma vaca 2x se ela entrou na IATF e no repasse).'],
          ['Gestando',                     sm.gestando,                                                      '#92620A', 'Prenhas cuja monta ainda está dentro da janela normal de gestação e sem parto/aborto registrado — não contam como perda.'],
          ['Abortos',                      sm.nAbortos,                                                     '#791F1F'],
          ['Perdas não identificadas',     sm.perdasNaoIdentificadas,                                       '#791F1F', 'Prenhas que já passaram da janela de gestação sem parto nem aborto registrado — só entram aqui depois que a gestação deveria ter terminado.'],
          ['Perda gestacional',            sm.perdaGestacional!=null?`${sm.perdaGestacional}%`:'—',        '#791F1F', 'Abortos + perdas não identificadas ÷ prenhas. Prenhas ainda gestando não entram nesse cálculo.'],
          ['Partos',                       sm.nascimentos,                                                  '#0C447C'],
          ['Taxa de parição (natalidade)', sm.txNatalidade!=null?`${sm.txNatalidade}%`:'—',                '#0C447C', 'Partos realizados até agora ÷ matrizes expostas — tende a ser baixa enquanto a safra está em andamento.'],
          ['Parição prevista',             sm.paricaoPrevista!=null?`${sm.paricaoPrevista}%`:'—',          '#0C447C', 'Partos realizados + gestações em andamento ÷ matrizes expostas — projeção otimista assumindo que as gestações em andamento cheguem a termo.'],
          ['Mortalidade de bezerros',      sm.mortalidadeBezerros!=null?`${sm.mortalidadeBezerros}%`:'—',  '#791F1F'],
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
        Mortalidade de bezerros = bezerros com situação "morto" entre os partos desta safra ÷ total de partos.
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
  const podeEditarReprodCiclo = podeEditarReprod && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const refLotes   = useRef(null)
  const refDiag    = useRef(null)
  const refNasc    = useRef(null)
  const refIndices = useRef(null)

  const [tab,     setTab]    = useState(0)
  const [animais, setAnimais]= useState([])
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

  // Nascimentos tab state
  const [partosNasc,    setPartosNasc]    = useState(null)
  const [loadingNasc,   setLoadingNasc]   = useState(false)
  const [filtroNasc,    setFiltroNasc]    = useState('todos')
  const [proprietarios, setProprietarios] = useState([])
  const [editParto,     setEditParto]     = useState(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (cicloLocal) loadCicloScoped(cicloLocal.id) }, [cicloLocal?.id])
  useEffect(() => { setSelInsem([]); setFiltroPropLote('') }, [selLote?.id])
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
        db.proprietarios.list(),
        db.lotes.list(),
      ])
      if (algumErro('[Reprodutivo]', base)) { if (showLoading) setLoadError(true); return }
      const [ra, rprops, ls] = base
      setAnimais(ra.data || [])
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
    if (loteEdit) {
      if (!form.touro) { toast('Preencha o touro.', 'error'); return }
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
      const payload = { data: form.data, touro: form.touro, protocolo: form.protocolo || '', estacao_monta_id: estacaoId }
      const { error } = await db.lotesInseminacao.update(loteEdit.id, payload)
      setSaving(false)
      if (error) { toast('Erro ao atualizar lote: ' + error.message, 'error'); return }
      toast('Lote atualizado!')
      setModal(null); setLoteEdit(null); setForm({}); loadAll()
      return
    }

    if (!form.data || !form.touro || selBrs.length === 0) {
      toast('Preencha data, touro e selecione animais.', 'error'); return
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
      touro: form.touro,
      protocolo: form.protocolo || '',
      estacao_monta_id: estacaoId
    })
    if (error || !loteData) { toast('Erro ao criar lote.', 'error'); setSaving(false); return }

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

  // Salvar diagnóstico
  const salvarDiag = async (loteId, animalId, diag) => {
    if (!podeEditarReprodCiclo) return false
    const payload = [{
      lote_inseminacao_id: loteId,
      animal_id:           animalId,
      diagnostico:         diag,
      data_diagnostico:    new Date().toISOString().split('T')[0],
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

  // Abre modal de registro de aborto para uma inseminação com diagnóstico 'P'
  const abrirRegistrarAborto = (ins, lote) => {
    if (!podeEditarReprodCiclo) return
    setAbortoAlvo({ animal_id: ins.animal_id, brinco: ins.animal?.brinco || '?', lote_id: lote.id })
    setFormAborto({ data: new Date().toISOString().split('T')[0], causa: 'desconhecido' })
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

  // Salvar parto
  const salvarParto = async () => {
    if (!podeEditarReprodCiclo) return
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
    setSaving(true)
    const mae = animais.find(a => a.brinco === form.mae_brinco)
    if (!mae) { toast('Mãe não encontrada.','error'); setSaving(false); return }
    const cicloDoParto = cicloDaData(form.data_parto)

    // Criar bezerro (numeração provisória com base nos nascimentos já carregados do ciclo)
    const nBrinco = 'SN-' + String((partosNasc?.length || 0) + 1).padStart(2,'0')
    const { data: bezData } = await db.animais.insert({
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

    // Registrar parto — ciclo_id é o ciclo do EVENTO (data do parto); lote_inseminacao_id
    // é a SAFRA (a monta que originou a gestação), que pode ser de um ciclo anterior.
    await db.partos.insert({
      mae_id: mae.id,
      bezerro_id: bezData.id,
      data_parto: form.data_parto,
      ciclo_id: cicloDoParto.id,
      lote_inseminacao_id: form.lote_inseminacao_id || null,
      observacoes: form.obs || ''
    })

    // Pesagem ao nascer (opcional)
    if (form.peso_nascimento && bezData?.id) {
      await db.pesagens.insert({
        animal_id: bezData.id,
        data: form.data_parto,
        tipo: 'nascimento',
        peso_kg: parseFloat(form.peso_nascimento),
        observacoes: 'Peso ao nascer'
      })
    }

    // Atualizar mãe
    await db.animais.update(mae.id, { sit_reprodutiva: 'vazia' })
    toast(`Nascimento registrado! Brinco provisório: ${nBrinco}`)
    setSaving(false); setModal(null); setForm({}); loadAll()
    if (cicloLocal) loadPartosNasc(cicloLocal.id)
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
    toast('Nascimento excluído.')
    loadAll()
    if (cicloLocal) loadPartosNasc(cicloLocal.id)
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
    const ok = await salvarDiag(lote.id, ins.animal_id, isPrenha ? 'P' : 'V')
    if (ok) toast(`Brinco ${br} → ${isPrenha ? 'Prenha' : 'Vazia'}`)
  }

  // ─── Índices: dados derivados ────────────────────────────────────────────────
  // Safra reprodutiva: os índices de parição/perda/mortalidade são ancorados no
  // LOTE (a monta), não na data do parto — a gestação (~283 dias) costuma
  // atravessar a virada do ciclo, então os partos de uma safra podem ocorrer no
  // ciclo seguinte. `lote.partos` vem do FK partos.lote_inseminacao_id (join no
  // supabase.js), por isso é uma contagem exata, diferente de casar por mae_id.

  // Desmame + peso ajustado 205 dias (padrão Embrapa) para um conjunto de partos.
  // totalInseminadas = "matrizes expostas" — denominador oficial da taxa de
  // desmama e do kg desmamado por matriz exposta (não usa nascidos).
  const calcDesmameMetrics = (partosArr, totalInseminadas) => {
    const desmamados = partosArr.filter(p => p.bezerro?.data_desmame).length
    const txDesmama  = totalInseminadas > 0 ? Math.round(desmamados / totalInseminadas * 100) : null
    const pesosDesmame = []
    const p205s = []
    partosArr.forEach(p => {
      const pesagensB = p.bezerro?.pesagens || []
      const pesoNasc = pesagensB.find(ps => ps.tipo === 'nascimento')
      const pesoDesm = pesagensB.find(ps => ps.tipo === 'desmama')
      if (!pesoDesm) return
      const pd = parseFloat(pesoDesm.peso_kg)
      if (Number.isFinite(pd)) pesosDesmame.push(pd)
      if (pesoNasc && p.data_parto && pesoDesm.data) {
        const pn = parseFloat(pesoNasc.peso_kg)
        const diasDesmame = Math.round((new Date(pesoDesm.data) - new Date(p.data_parto)) / 86400000)
        if (Number.isFinite(pn) && diasDesmame > 0) {
          p205s.push(((pd - pn) / diasDesmame) * 205 + pn)
        }
      }
    })
    const media = arr => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null
    return {
      desmamados, txDesmama,
      pesoMedioDesmame: media(pesosDesmame),
      p205Medio: media(p205s),
      kgPorMatrizExposta: totalInseminadas > 0 ? Math.round(pesosDesmame.reduce((s, v) => s + v, 0) / totalInseminadas * 10) / 10 : null,
    }
  }

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
    // conhecido. Prenhas cuja monta (lote.data) ainda está dentro da janela de
    // gestação (< GESTACAO_MAX_DIAS) NÃO são perda — ainda estão gestando, e
    // contá-las como "perda" é o que fazia a taxa mostrar ~100% numa safra em
    // andamento (ex: 52 prenhas, 1 parto, 3 abortos → só os 3 abortos são perda
    // de fato; as outras 48 ainda não pariram porque a gestação não terminou).
    const diasDesdeMonta = lote.data ? Math.round((new Date() - new Date(lote.data + 'T12:00:00')) / 86400000) : null
    const aindaDentroDaJanela = diasDesdeMonta !== null && diasDesdeMonta < GESTACAO_MAX_DIAS
    const semDesfecho = Math.max(0, prenhas - nascimentos - nAbortos)
    const gestando = aindaDentroDaJanela ? semDesfecho : 0
    const perdasNaoIdentificadas = aindaDentroDaJanela ? 0 : semDesfecho
    const perdaGestacional = prenhas > 0 ? Math.round((nAbortos + perdasNaoIdentificadas) / prenhas * 100) : null
    const mortosBezerros    = partosLote.filter(p => p.bezerro?.situacao === 'morto').length
    const mortalidadeBezerros = nascimentos > 0 ? Math.round(mortosBezerros / nascimentos * 100) : null
    const matrizesAptas   = lote.data ? contarMatrizes(propId ? animais.filter(a => a.proprietario_id === propId) : animais, lote.data) : 0
    // Sem teto em 100%: taxa acima de 100% é esperada e correta quando novilhas
    // com menos de 24 meses (fora da definição de "matriz apta") são expostas.
    const txAproveitamento = matrizesAptas > 0 ? Math.round(total / matrizesAptas * 100) : null
    // Parição prevista: se todas as gestações em andamento chegarem a termo, qual
    // seria a parição final — projeção otimista pra contextualizar a parição
    // realizada (ainda baixa) enquanto a safra está em andamento.
    const paricaoPrevista = total > 0 ? Math.round((nascimentos + gestando) / total * 100) : null
    const desm = calcDesmameMetrics(partosLote, total)
    const partoPrev = lote.data
      ? new Date(new Date(lote.data).setMonth(new Date(lote.data).getMonth() + 9)).toLocaleDateString('pt-BR')
      : '—'
    return {
      total, totalInseminacoes, prenhas, vazias, pendentes, txPrenhez, nascimentos, txParicao,
      txNatalidade, paricaoPrevista, gestando, nAbortos, perdasNaoIdentificadas, perdaGestacional,
      mortalidadeBezerros, matrizesAptas, txAproveitamento, ...desm,
      partoPrev,
    }
  }

  // Uma safra é considerada "em andamento" enquanto o ciclo do lote é o atual e
  // ainda não se passaram os ~283 dias de gestação desde a monta.
  const safraEmAndamento = (lote, ciclo) => {
    if (!lote?.data || !ciclo) return false
    if (statusCiclo(ciclo) !== 'atual') return false
    const dias = Math.round((new Date() - new Date(lote.data + 'T12:00:00')) / 86400000)
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
    const animaisParaAptas = filtroPropIdx ? animais.filter(a => a.proprietario_id === filtroPropIdx) : animais
    const kpiMatrizesAptas = primeiraMontaCiclo ? contarMatrizes(animaisParaAptas, primeiraMontaCiclo) : 0
    // Sem teto em 100%: uma taxa de aproveitamento acima de 100% é esperada e
    // correta quando novilhas com menos de 24 meses (fora da definição de "matriz
    // apta") são expostas à reprodução — não é um erro de cálculo.
    const kpiTxAproveitamento = kpiMatrizesAptas > 0 ? Math.round(kpiIns / kpiMatrizesAptas * 100) : null
    const kpiParicaoPrevista = kpiIns > 0 ? Math.round((kpiPartos + kpiGestando) / kpiIns * 100) : null
    const kpiDesmame = calcDesmameMetrics(kpiPartosArr, kpiIns)
    const previsaoSafraCiclo = (() => {
      const emAndamento = lotesCicloAtual.filter(l => safraEmAndamento(l, cicloLocal))
      if (emAndamento.length === 0) return null
      const datas = emAndamento.map(l => {
        const d = new Date(l.data + 'T12:00:00'); d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS); return d
      })
      return new Date(Math.min(...datas))
    })()
    // Intervalo entre partos: para cada mãe com 2+ partos, mede o intervalo entre
    // partos consecutivos; só considera intervalos plausíveis para bovinos (300–700 dias)
    const intervalosPartosValidos = (() => {
      const partosPorMae = {}
      const partosBase = filtroPropIdx ? todosPartos.filter(p => p.mae?.proprietario_id === filtroPropIdx) : todosPartos
      partosBase.forEach(p => {
        if (!p.mae_id || !p.data_parto) return
        partosPorMae[p.mae_id] = partosPorMae[p.mae_id] || []
        partosPorMae[p.mae_id].push(p.data_parto)
      })
      const intervalos = []
      Object.values(partosPorMae).forEach(datas => {
        const ordenadas = datas.slice().sort()
        for (let i = 1; i < ordenadas.length; i++) {
          const dias = Math.round((new Date(ordenadas[i]) - new Date(ordenadas[i-1])) / 86400000)
          if (Number.isFinite(dias) && dias >= INTERVALO_PARTOS_MIN_DIAS && dias <= INTERVALO_PARTOS_MAX_DIAS) {
            intervalos.push(dias)
          }
        }
      })
      return intervalos
    })()
    const kpiIntervalo = intervalosPartosValidos.length === 0
      ? '—'
      : `${Math.round(intervalosPartosValidos.reduce((s, d) => s + d, 0) / intervalosPartosValidos.length)} dias`

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

    const touroDados = {}
    todosLotes.forEach(l => {
      if (!l.touro) return
      const m = calcLoteMetrics(l)
      if (!touroDados[l.touro]) touroDados[l.touro] = { touro: l.touro, totalIns: 0, totalPrn: 0 }
      touroDados[l.touro].totalIns += m.total
      touroDados[l.touro].totalPrn += m.prenhas
    })
    const tourosRanking = Object.values(touroDados)
      .map(t => ({ ...t, txPrenhez: t.totalIns > 0 ? Math.round(t.totalPrn/t.totalIns*100) : 0 }))
      .sort((a, b) => b.txPrenhez - a.txPrenhez)

    return {
      lotesCicloAtual, kpiInsTotal, kpiIns, kpiPrn, kpiPartos, kpiMortalidade, kpiAbortos, kpiGestando,
      kpiPerdasNaoIdentificadas, kpiPerdaGestacional, kpiMatrizesAptas, kpiTxAproveitamento, kpiParicaoPrevista,
      kpiDesmame, previsaoSafraCiclo, kpiIntervalo,
      barData, lineData, pieData, tabelaLotes, tourosRanking,
    }
  }, [todosLotes, todosPartos, cicloLocal, animais, sortCol, sortAsc, filtroPropIdx])

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  const {
    lotesCicloAtual, kpiInsTotal, kpiIns, kpiPrn, kpiPartos, kpiMortalidade, kpiAbortos, kpiGestando,
    kpiPerdasNaoIdentificadas, kpiPerdaGestacional, kpiMatrizesAptas, kpiTxAproveitamento, kpiParicaoPrevista,
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
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{lotes.length} lote{lotes.length!==1?'s':''} · Ciclo {cicloLocal?.nome}</span>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {podeEditarReprodCiclo && (
                <button className="btn btn-primary btn-sm" onClick={() => { setLoteEdit(null); setForm({}); setModal('lote'); setSelBrs([]) }}>
                  <i className="ti ti-plus" /> Novo lote de inseminação
                </button>
              )}
              <BotaoPDF contentRef={refLotes} filename="reprodutivo-lotes" titulo="Reprodutivo: Lotes de Inseminação" />
            </div>
          </div>
          <div ref={refLotes}>
          {lotes.length === 0
            ? <EmptyState icon="💉" title="Nenhum lote registrado" sub="Registre o primeiro lote de inseminação do ciclo."
                action={podeEditarReprodCiclo ? <button className="btn btn-primary btn-sm" onClick={()=>{setLoteEdit(null);setForm({});setModal('lote');setSelBrs([])}}><i className="ti ti-plus"/>Novo lote</button> : undefined} />
            : lotes.map(l => {
              const ins   = l.inseminacoes || []
              const prn   = ins.filter(i=>i.diagnostico==='P').length
              const vaz   = ins.filter(i=>i.diagnostico==='V').length
              const pend  = ins.filter(i=>!i.diagnostico).length
              return (
                <div key={l.id} className="card" style={{
                  marginBottom:10, cursor:'pointer',
                  borderLeft:`3px solid ${l.encerrado?'#7B2FBE':'#D97706'}`
                }} onClick={() => setSelLote(l)}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:500 }}>Lote {l.numero} — {l.touro}</div>
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
                    <span><strong>{ins.length}</strong> <span style={{color:'#6B7280'}}>inseminadas</span></span>
                    {prn > 0 && <span><strong style={{color:'#1E55B0'}}>{prn}</strong> <span style={{color:'#6B7280'}}>prenhas ({pct(prn,ins.length)})</span></span>}
                    {vaz > 0 && <span><strong style={{color:'#791F1F'}}>{vaz}</strong> <span style={{color:'#6B7280'}}>vazias</span></span>}
                    {pend > 0 && <Badge color="amber">{pend} aguardando diagnóstico</Badge>}
                  </div>
                </div>
              )
            })
          }
          </div>{/* end refLotes */}
        </div>
      )}

      {/* ── Detalhe lote + diagnóstico ── */}
      {tab === 0 && selLote && (
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:10, marginBottom:14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelLote(null)}>
              <i className="ti ti-arrow-left" /> Lotes
            </button>
            <span style={{ fontWeight:500 }}>Lote {selLote.numero} — {selLote.touro} · {fmtData(selLote.data)}</span>
            {podeEditarReprodCiclo && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setLoteEdit(selLote)
                setForm({ data: selLote.data, touro: selLote.touro, protocolo: selLote.protocolo || '', estacao_monta_id: selLote.estacao_monta_id || '' })
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
                  <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{sm.totalInseminacoes} inseminação{sm.totalInseminacoes!==1?'ões':''} (serviços)</span>
                </div>

                {/* Resultado da safra — índices ancorados nesta monta, mesmo que os partos ocorram no ciclo seguinte */}
                <CardResultadoSafra
                  titulo="Resultado da safra"
                  sm={sm}
                  andamento={sm.gestando > 0}
                  previsao={previsaoPartoLote}
                />
              </>
            )
          })()}

          <div className="card">
            <div className="card-title">
              <span><i className="ti ti-stethoscope" /> Diagnóstico de gestação</span>
              {podeEditarReprodCiclo && <MicButton hint='Fale: "zero três prenha" ou "doze vazia"' onResult={t => vozDiag(t, selLote)} />}
            </div>
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
                      {d === 'P' && abortoReg && (
                        <div style={{ fontSize:'.72rem', color:'#791F1F', marginTop:2 }}>
                          <i className="ti ti-alert-circle" style={{ fontSize:11 }} /> Aborto registrado em {fmtData(abortoReg.data)}
                        </div>
                      )}
                      {d === 'P' && !abortoReg && selLote.data && (
                        <div style={{ fontSize:'.72rem', color:'#1E55B0', marginTop:2 }}>
                          Prenha · Parto previsto: {fmtData(previsaoPartoLote)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {podeEditarReprodCiclo && d === 'P' && !abortoReg && (
                      <button className="btn btn-secondary btn-xs"
                        onClick={() => abrirRegistrarAborto(ins, selLote)}
                        style={{ fontSize:'.72rem', color:'#791F1F' }}>
                        <i className="ti ti-alert-circle" /> Registrar aborto
                      </button>
                    )}
                    {podeEditarReprodCiclo && (
                      <button
                        style={{
                          padding:'4px 12px', borderRadius:8, fontSize:'.8rem', cursor:'pointer',
                          fontFamily:'inherit', fontWeight:d==='P'?600:400,
                          background:d==='P'?'#E8F0FC':'white', color:d==='P'?'#1E55B0':'#6B7280',
                          border:`.5px solid ${d==='P'?'#1BA89C':'#E5E7EB'}`
                        }}
                        onClick={() => salvarDiag(selLote.id, ins.animal_id, 'P')}
                      >Prenha</button>
                    )}
                    {podeEditarReprodCiclo && (
                      <button
                        style={{
                          padding:'4px 12px', borderRadius:8, fontSize:'.8rem', cursor:'pointer',
                          fontFamily:'inherit', fontWeight:d==='V'?600:400,
                          background:d==='V'?'#FCEBEB':'white', color:d==='V'?'#791F1F':'#6B7280',
                          border:`.5px solid ${d==='V'?'#E24B4A':'#E5E7EB'}`
                        }}
                        onClick={() => salvarDiag(selLote.id, ins.animal_id, 'V')}
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
              body={`Brincos ${selLote.inseminacoes.filter(i=>i.diagnostico==='V').map(i=>i.animal?.brinco).join(', ')} diagnosticados vazios. Incluir no próximo lote de inseminação.`}
            />
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
                {podeEditarReprodCiclo && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setForm({ data_parto: new Date().toISOString().split('T')[0] }); setModal('parto') }}>
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
                <Badge color="gray"><i className="ti ti-needle" /> {kpiInsTotal} inseminações (serviços) no total</Badge>
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
                  paricaoPrevista:     kpiParicaoPrevista,
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
                  Nenhuma estação de monta cadastrada neste ciclo. Vincule os lotes a uma estação ao criá-los ou editá-los (aba Lotes de Inseminação).
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
      <Modal open={modal==='lote'} onClose={()=>{ setModal(null); setLoteEdit(null) }}
        title={loteEdit ? 'Editar lote de inseminação' : 'Novo lote de inseminação'} width={600}>
        <div className="grid-form">
          <Field label="Data da inseminação" required>
            <input type="date" value={form.data||''}
              onChange={e=>setForm(p=>({...p,data:e.target.value}))} />
          </Field>
          <Field label="Touro / Sêmen" required>
            <input value={form.touro||''} onChange={e=>setForm(p=>({...p,touro:e.target.value}))} placeholder="Nome do touro" />
          </Field>
          <Field label="Protocolo">
            <input value={form.protocolo||''} onChange={e=>setForm(p=>({...p,protocolo:e.target.value}))} placeholder="ex: IATF P4" />
          </Field>
          <Field label="Estação de monta" hint="Agrupa este lote com a IATF/repasses da mesma estação">
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
        {form.criandoEstacao && (
          <>
            <div style={{ fontSize:'.78rem', color:'#6B7280', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 12px', marginBottom:10 }}>
              A estação de monta agrupa a IATF e os repasses. Início = data da primeira inseminação; Fim = data prevista para o último repasse (pode deixar em branco e ajustar depois).
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
            Apenas vacas vazias estão disponíveis para inseminação.
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
            const touro   = loteSafra?.touro || ''
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
              const touro   = loteSafra?.touro || ''
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
              Apenas vacas com diagnóstico de prenhez confirmado em lote de inseminação aparecem aqui.
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
                <i className="ti ti-link" /> Safra (lote de inseminação)
              </div>
              <div style={{ fontSize:'.92rem', fontWeight:700, color: loteVinculado ? '#1E55B0' : '#92620A', marginBottom: 8 }}>
                {loteVinculado
                  ? <>Vinculado: Lote {loteVinculado.numero} — {loteVinculado.ciclo?.nome || ''} — {loteVinculado.touro} ({fmtData(loteVinculado.data)})</>
                  : <>Sem lote vinculado (monta natural)</>}
              </div>
              {candidatos.length > 0 ? (
                <select value={form.lote_inseminacao_id || ''}
                  onChange={e => {
                    const novoId = e.target.value || null
                    // O touro acompanha o lote escolhido manualmente — nunca fica
                    // dessincronizado do lote de fato vinculado.
                    const novoLote = candidatos.find(l => l.id === novoId)
                    setForm(p => ({ ...p, lote_inseminacao_id: novoId, touro_pai: novoLote?.touro || '' }))
                  }}
                  style={{ width:'100%' }}>
                  <option value="">— nenhum (monta natural) —</option>
                  {candidatos.map(l => (
                    <option key={l.id} value={l.id}>Lote {l.numero} — {l.ciclo?.nome || ''} — {l.touro} ({fmtData(l.data)})</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize:'.75rem', color:'#92620A' }}>
                  Nenhum lote com diagnóstico de prenhez encontrado para esta mãe — será registrado como monta natural.
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
          <button className="btn btn-primary" onClick={salvarParto} disabled={saving || !podeEditarReprodCiclo}>
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
    </div>
  )
}
