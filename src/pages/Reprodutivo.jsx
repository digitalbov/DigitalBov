import { useState, useEffect, useRef } from 'react'
import { supabase, db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useFazenda } from '../lib/FazendaContext'
import { useConta } from '../lib/ContaContext'
import { fmtData, pct } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, ErroCarregamento } from '../components/UI'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

const TABS = ['Lotes de Inseminação','Nascimentos','Índices']

export default function Reprodutivo() {
  const { podeEditar } = usePermissoes()
  const podeEditarReprod = podeEditar('reprodutivo')
  const { fazendaAtual } = useFazenda()
  const { contaAtual } = useConta()

  const refLotes   = useRef(null)
  const refDiag    = useRef(null)
  const refNasc    = useRef(null)
  const refIndices = useRef(null)

  const [tab,     setTab]    = useState(0)
  const [animais, setAnimais]= useState([])
  const [lotes,   setLotes]  = useState([])
  const [partos,  setPartos] = useState([])
  const [ciclo,   setCiclo]  = useState(null)
  const [loading,   setLoading]  = useState(true)
  const [loadError, setLoadError]= useState(false)
  const [modal,   setModal]  = useState(null)
  const [form,    setForm]   = useState({})
  const [selBrs,  setSelBrs] = useState([])
  const [lotesSistema, setLotesSistema] = useState([])
  const [filtroLoteInsem, setFiltroLoteInsem] = useState('')
  const [selBrsAdd, setSelBrsAdd] = useState([])
  const [saving,  setSaving] = useState(false)
  const [selLote,     setSelLote]    = useState(null)
  const [todosLotes,  setTodosLotes] = useState([])
  const [todosPartos, setTodosPartos]= useState([])
  const [loadingIdx,  setLoadingIdx] = useState(false)
  const [cicloFiltro, setCicloFiltro]= useState(null)
  const [sortCol,     setSortCol]    = useState('data')
  const [sortAsc,     setSortAsc]    = useState(false)

  // Nascimentos tab state
  const [ciclosNasc,    setCiclosNasc]    = useState([])
  const [cicloNascId,   setCicloNascId]   = useState(null)
  const [partosNasc,    setPartosNasc]    = useState(null)
  const [lotesNasc,     setLotesNasc]     = useState([])
  const [loadingNasc,   setLoadingNasc]   = useState(false)
  const [filtroNasc,    setFiltroNasc]    = useState('todos')
  const [proprietarios, setProprietarios] = useState([])
  const [editParto,     setEditParto]     = useState(null)

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (tab === 2) loadIndices() }, [tab])
  useEffect(() => {
    if (tab === 1 && cicloNascId && partosNasc === null) loadPartosNasc(cicloNascId)
  }, [tab, cicloNascId, partosNasc])

  const loadAll = async (showLoading = true) => {
    if (showLoading) { setLoading(true); setLoadError(false) }
    try {
      const [ra, rc, rciclos, rprops, ls] = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.ciclos.current(),
        db.ciclos.list(),
        db.proprietarios.list(),
        db.lotes.list()
      ])
      const anList = ra.data || []
      const cicData = rc.data
      setAnimais(anList)
      setCiclo(cicData)
      setCiclosNasc(rciclos.data || [])
      setProprietarios(rprops.data || [])
      setLotesSistema(ls.data || [])
      if (cicData) {
        const [rl, rp] = await Promise.all([
          db.lotesInseminacao.list(cicData.id),
          db.partos.list(cicData.id)
        ])
        const newLotes = rl.data || []
        setLotes(newLotes)
        setPartos(rp.data || [])
        setCicloNascId(prev => prev || cicData.id)
        // Atualiza selLote com dados frescos do banco (evita estado obsoleto após saves)
        setSelLote(prev => prev ? (newLotes.find(l => l.id === prev.id) || prev) : null)
      }
    } catch (e) {
      console.error('[Reprodutivo] erro ao carregar:', e)
      if (showLoading) setLoadError(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const loadPartosNasc = async (cicloId) => {
    setLoadingNasc(true)
    const [rp, rl] = await Promise.all([
      db.partos.list(cicloId),
      db.lotesInseminacao.list(cicloId)
    ])
    setPartosNasc(rp.data || [])
    setLotesNasc(rl.data || [])
    setLoadingNasc(false)
  }

  const loadIndices = async () => {
    setLoadingIdx(true)
    const [rl, rp] = await Promise.all([
      db.lotesInseminacao.listAll(),
      db.partos.listAll()
    ])
    setTodosLotes(rl.data || [])
    setTodosPartos(rp.data || [])
    setCicloFiltro(prev => prev || ciclo?.id || null)
    setLoadingIdx(false)
  }

  const femsAtivas = animais.filter(a => a.sexo === 'F')
  const femsVazias = femsAtivas.filter(a => a.sit_reprodutiva === 'vazia')
  const femsVaziasFiltradas = filtroLoteInsem
    ? femsVazias.filter(a => a.lote_id === filtroLoteInsem)
    : femsVazias
  const femsForaDoLote = selLote
    ? femsVaziasFiltradas.filter(a => !(selLote.inseminacoes||[]).some(i => i.animal_id === a.id))
    : []

  // Apenas fêmeas com diagnóstico 'P' confirmado em algum lote de inseminação
  const maesElegiveis = femsAtivas.filter(a =>
    a.sit_reprodutiva === 'prenha' &&
    lotes.some(l => l.inseminacoes?.some(i => i.animal_id === a.id && i.diagnostico === 'P'))
  )

  // Touro do lote mais recente com diagnóstico P para a animal
  const resolverTouro = (animalId) => {
    const lotesDaMae = lotes.filter(l => l.inseminacoes?.some(i => i.animal_id === animalId && i.diagnostico === 'P'))
    const loteEnc = lotesDaMae.sort((a, b) => b.data.localeCompare(a.data))[0]
    return loteEnc?.touro || ''
  }

  const resolverTouroFromLotes = (animalId, lotesList) => {
    const lotesDaMae = lotesList.filter(l => l.inseminacoes?.some(i => i.animal_id === animalId && i.diagnostico === 'P'))
    const loteEnc = lotesDaMae.sort((a, b) => (b.data||'').localeCompare(a.data||''))[0]
    return loteEnc?.touro || ''
  }

  const resolverPrevParto = (animalId, lotesList) => {
    const lotesDaMae = lotesList.filter(l => l.inseminacoes?.some(i => i.animal_id === animalId && i.diagnostico === 'P'))
    const loteEnc = lotesDaMae.sort((a, b) => (b.data||'').localeCompare(a.data||''))[0]
    if (!loteEnc?.data) return '—'
    const d = new Date(loteEnc.data + 'T12:00:00')
    d.setDate(d.getDate() + 283)
    return d.toLocaleDateString('pt-BR')
  }

  const togSel = (br) => setSelBrs(prev =>
    prev.includes(br) ? prev.filter(b => b !== br) : [...prev, br]
  )

  // Salvar novo lote
  const salvarLote = async () => {
    if (!form.data || !form.touro || selBrs.length === 0) {
      toast('Preencha data, touro e selecione animais.', 'error'); return
    }
    if (!ciclo) { toast('Crie um ciclo financeiro antes (em Financeiro).', 'error'); return }
    setSaving(true)
    const { data: loteData, error } = await db.lotesInseminacao.insert({
      ciclo_id: ciclo.id,
      numero: lotes.length + 1,
      data: form.data,
      touro: form.touro,
      protocolo: form.protocolo || ''
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
    setModal(null); setSelBrsAdd([]); setFiltroLoteInsem('')
    await loadAll(false)
  }

  // Remover animal de um lote (só se ainda não houver diagnóstico)
  const removerInsem = async (ins) => {
    if (!confirm(`Remover o brinco ${ins.animal?.brinco || ''} deste lote?`)) return
    const { error } = await supabase.from('inseminacoes').delete().eq('id', ins.id)
    if (error) { toast('Erro ao remover: ' + error.message, 'error'); return }
    toast('Animal removido do lote.')
    await loadAll(false)
  }

  // Salvar diagnóstico
  const salvarDiag = async (loteId, animalId, diag) => {
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

  // Salvar parto
  const salvarParto = async () => {
    if (!form.mae_brinco || !form.data_parto || !form.sexo_bezerro) {
      toast('Preencha mãe, data e sexo.', 'error'); return
    }
    setSaving(true)
    const mae = animais.find(a => a.brinco === form.mae_brinco)
    if (!mae) { toast('Mãe não encontrada.','error'); setSaving(false); return }

    // Criar bezerro
    const nBrinco = 'SN-' + String(partos.length + 1).padStart(2,'0')
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

    // Registrar parto
    await db.partos.insert({
      mae_id: mae.id,
      bezerro_id: bezData.id,
      data_parto: form.data_parto,
      ciclo_id: ciclo.id,
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
    if (cicloNascId) loadPartosNasc(cicloNascId)
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
    if (await bezerroTemHistorico(p.bezerro_id)) {
      toast('Não é possível excluir: o bezerro já tem histórico (pesagens/partos).', 'error'); return
    }
    if (!confirm(`Excluir o nascimento do bezerro ${p.bezerro?.brinco||''}? O animal e o registro de parto serão removidos.`)) return
    // apaga na ordem: pesagem de nascimento -> parto -> animal
    await db.partos.delete(p.id)
    if (p.bezerro_id) await db.animais.delete(p.bezerro_id)
    toast('Nascimento excluído.')
    loadAll()
    if (cicloNascId) loadPartosNasc(cicloNascId)
  }

  // Abre modal de edição de nascimento
  const abrirEditarParto = (p) => {
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
    const ep = editParto
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
    if (cicloNascId) loadPartosNasc(cicloNascId)
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

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  // Cálculos ciclo atual (usados na aba Lotes)
  const totalIns  = lotes.reduce((s,l) => s + (l.inseminacoes?.length||0), 0)
  const totalPrn  = lotes.reduce((s,l) => s + (l.inseminacoes?.filter(i=>i.diagnostico==='P').length||0), 0)
  const totalNasc = partos.length

  // ─── Índices: dados derivados ────────────────────────────────────────────────
  const calcLoteMetrics = (lote) => {
    const ins       = lote.inseminacoes || []
    const animalIds = ins.map(i => i.animal_id)
    const prenhas   = ins.filter(i => i.diagnostico === 'P').length
    const vazias    = ins.filter(i => i.diagnostico === 'V').length
    const pendentes = ins.filter(i => !i.diagnostico).length
    const total     = ins.length
    const txPrenhez = total > 0 ? Math.round(prenhas / total * 100) : 0
    const nascimentos = todosPartos.filter(p => animalIds.includes(p.mae_id)).length
    const txParicao = prenhas > 0 ? Math.round(nascimentos / prenhas * 100) : 0
    const partoPrev = lote.data
      ? new Date(new Date(lote.data).setMonth(new Date(lote.data).getMonth() + 9)).toLocaleDateString('pt-BR')
      : '—'
    return { total, prenhas, vazias, pendentes, txPrenhez, nascimentos, txParicao, partoPrev }
  }

  const lotesCicloAtual = todosLotes.filter(l => l.ciclo_id === ciclo?.id)
  const kpiIns  = lotesCicloAtual.reduce((s, l) => s + (l.inseminacoes?.length || 0), 0)
  const kpiPrn  = lotesCicloAtual.reduce((s, l) => s + (l.inseminacoes?.filter(i => i.diagnostico === 'P').length || 0), 0)
  const kpiNasc = todosPartos.filter(p =>
    lotesCicloAtual.some(l => l.inseminacoes?.some(i => i.animal_id === p.mae_id))
  ).length
  const lotesSortedByData = [...lotesCicloAtual].sort((a, b) => (a.data||'').localeCompare(b.data||''))
  const kpiIntervalo = (() => {
    if (lotesSortedByData.length < 2) return '—'
    let tot = 0
    for (let i = 1; i < lotesSortedByData.length; i++)
      tot += Math.round((new Date(lotesSortedByData[i].data) - new Date(lotesSortedByData[i-1].data)) / 86400000)
    return `${Math.round(tot / (lotesSortedByData.length - 1))} dias`
  })()

  const cicloMapIdx = new Map()
  todosLotes.forEach(l => { if (l.ciclo) cicloMapIdx.set(l.ciclo_id, l.ciclo) })
  const ciclosUnicos = [...cicloMapIdx.values()].sort((a, b) => (a.inicio||'').localeCompare(b.inicio||''))

  const efectiveFiltro = cicloFiltro || ciclo?.id
  const barData = todosLotes
    .filter(l => l.ciclo_id === efectiveFiltro)
    .map(l => { const m = calcLoteMetrics(l); return { name: `L${l.numero}·${l.touro}`, prenhez: m.txPrenhez, paricao: m.txParicao } })

  const lineData = ciclosUnicos.map(c => {
    const lc = todosLotes.filter(l => l.ciclo_id === c.id)
    const tI = lc.reduce((s, l) => s + (l.inseminacoes?.length || 0), 0)
    const tP = lc.reduce((s, l) => s + (l.inseminacoes?.filter(i => i.diagnostico === 'P').length || 0), 0)
    const tN = todosPartos.filter(p => lc.some(l => l.inseminacoes?.some(i => i.animal_id === p.mae_id))).length
    return { ciclo: c.nome, prenhez: tI > 0 ? Math.round(tP/tI*100) : 0, paricao: tP > 0 ? Math.round(tN/tP*100) : 0 }
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

  return (
    <div>
      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={() => { setTab(i); setSelLote(null) }}>{t}</button>
        ))}
      </div>

      {/* ── Lotes ── */}
      {tab === 0 && !selLote && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{lotes.length} lote{lotes.length!==1?'s':''} · Ciclo {ciclo?.nome}</span>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarReprod && (
                <button className="btn btn-primary btn-sm" onClick={() => { setModal('lote'); setSelBrs([]) }}>
                  <i className="ti ti-plus" /> Novo lote de inseminação
                </button>
              )}
              <BotaoPDF contentRef={refLotes} filename="reprodutivo-lotes" />
            </div>
          </div>
          <div ref={refLotes}>
          {lotes.length === 0
            ? <EmptyState icon="💉" title="Nenhum lote registrado" sub="Registre o primeiro lote de inseminação do ciclo."
                action={podeEditarReprod ? <button className="btn btn-primary btn-sm" onClick={()=>{setModal('lote');setSelBrs([])}}><i className="ti ti-plus"/>Novo lote</button> : undefined} />
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
                      {podeEditarReprod && pend === ins.length && (
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
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelLote(null)}>
              <i className="ti ti-arrow-left" /> Lotes
            </button>
            <span style={{ fontWeight:500 }}>Lote {selLote.numero} — {selLote.touro} · {fmtData(selLote.data)}</span>
            {podeEditarReprod && (
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelBrsAdd([]); setFiltroLoteInsem(''); setModal('addAnimaisLote') }}>
                <i className="ti ti-plus" /> Adicionar animais
              </button>
            )}
            <BotaoPDF contentRef={refDiag} filename="reprodutivo-diagnostico" />
          </div>
          <div ref={refDiag}>
          <div className="grid-4" style={{ marginBottom:14 }}>
            {[
              ['Inseminadas', selLote.inseminacoes?.length||0,'#111'],
              ['Prenhas',     selLote.inseminacoes?.filter(i=>i.diagnostico==='P').length||0,'#1E55B0'],
              ['Vazias',      selLote.inseminacoes?.filter(i=>i.diagnostico==='V').length||0,'#791F1F'],
              ['Pendentes',   selLote.inseminacoes?.filter(i=>!i.diagnostico).length||0,'#9CA3AF'],
            ].map(([l,v,c]) => (
              <div key={l} style={{ background:'white',border:'.5px solid #E5E7EB',borderRadius:10,padding:'10px 12px',textAlign:'center' }}>
                <div style={{ fontSize:'1.4rem',fontWeight:600,color:c }}>{v}</div>
                <div style={{ fontSize:'.75rem',color:'#6B7280',marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">
              <span><i className="ti ti-stethoscope" /> Diagnóstico de gestação</span>
              {podeEditarReprod && <MicButton hint='Fale: "zero três prenha" ou "doze vazia"' onResult={t => vozDiag(t, selLote)} />}
            </div>
            <div style={{ fontSize:'.8rem', background:'#EEEDFE', color:'#3C3489', padding:'7px 10px', borderRadius:8, marginBottom:10 }}>
              <i className="ti ti-microphone" style={{ fontSize:12, marginRight:4 }} />
              Fale assim: <b>"zero três prenha"</b> ou <b>"doze vazia"</b> — primeiro o número do brinco, depois o resultado
            </div>
            {selLote.inseminacoes?.map(ins => {
              const br = ins.animal?.brinco || '?'
              const d  = ins.diagnostico
              return (
                <div key={ins.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'8px 0', borderBottom:'.5px solid #F3F4F6'
                }}>
                  <span style={{ fontWeight:500, minWidth:50 }}>{br}</span>
                  <div style={{ display:'flex', gap:6 }}>
                    {podeEditarReprod && (
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
                    {podeEditarReprod && (
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
                    {podeEditarReprod && !d && (
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
            {/* Linha 1 — seletor de ciclo + botão */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
              <select
                value={cicloNascId || ''}
                onChange={e => { const id = e.target.value; setCicloNascId(id); loadPartosNasc(id); setFiltroNasc('todos') }}
                style={{ fontSize:'.85rem', padding:'5px 10px', borderRadius:8, border:'.5px solid #D1D5DB', background:'white', fontFamily:'inherit' }}>
                {ciclosNasc.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <div style={{ display:'flex', gap:8 }}>
                {podeEditarReprod && (
                  <button className="btn btn-primary btn-sm" onClick={() => { setForm({ data_parto: new Date().toISOString().split('T')[0] }); setModal('parto') }}>
                    <i className="ti ti-plus" /> Registrar nascimento
                  </button>
                )}
                <BotaoPDF contentRef={refNasc} filename="reprodutivo-nascimentos" />
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
                  <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:2 }}>Nascimentos</div>
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
                        {pFilt.map(p => (
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
                            <td style={{ fontSize:'.82rem', color:'#6B7280' }}>{resolverTouroFromLotes(p.mae_id, lotesNasc)||'—'}</td>
                            <td style={{ fontSize:'.78rem', color:'#9CA3AF', whiteSpace:'nowrap' }}>{resolverPrevParto(p.mae_id, lotesNasc)}</td>
                            <td style={{ whiteSpace:'nowrap' }}>
                              {podeEditarReprod && (
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
                        ))}
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
            <BotaoPDF contentRef={refIndices} filename="reprodutivo-indices" />
          </div>
          {loadingIdx ? <Loading /> : <>
          <div ref={refIndices}>

            {/* Seção 1 — KPIs */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:'.9rem', fontWeight:600, color:'#2B6CD9', marginBottom:10 }}>
                <i className="ti ti-chart-bar" /> Ciclo atual — {ciclo?.nome}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10 }}>
                {[
                  { icon:'ti-stack',         l:'Lotes no ciclo',  v: lotesCicloAtual.length,                                        c:'#2B6CD9' },
                  { icon:'ti-needle',        l:'Inseminadas',     v: kpiIns,                                                         c:'#111'    },
                  { icon:'ti-rosette',       l:'Taxa de prenhez', v: kpiIns > 0 ? `${Math.round(kpiPrn/kpiIns*100)}%` : '—',        c:'#2B6CD9', meta:'meta ≥85%' },
                  { icon:'ti-baby-carriage', l:'Nascimentos',     v: kpiNasc,                                                        c:'#0C447C' },
                  { icon:'ti-trending-up',   l:'Taxa de parição', v: kpiPrn > 0 ? `${Math.round(kpiNasc/kpiPrn*100)}%` : '—',       c:'#2B6CD9', meta:'meta ≥80%' },
                  { icon:'ti-clock',         l:'Intervalo médio', v: kpiIntervalo,                                                   c:'#633806' },
                ].map(k => (
                  <div key={k.l} style={{ background:'white', border:'.5px solid #E5E7EB', borderRadius:12, padding:'12px 14px' }}>
                    <i className={`ti ${k.icon}`} style={{ fontSize:'1.1rem', color:k.c, marginBottom:6, display:'block' }} />
                    <div style={{ fontSize:'1.45rem', fontWeight:700, color:k.c, lineHeight:1.1 }}>{k.v}</div>
                    <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:4 }}>{k.l}</div>
                    {k.meta && <div style={{ fontSize:'.68rem', color:'#9CA3AF' }}>{k.meta}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Seção 2 — Bar chart comparativo */}
            <div className="card" style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                <span style={{ fontWeight:600, fontSize:'.88rem' }}><i className="ti ti-chart-bar-grouped" /> Comparativo por lote</span>
                <select value={cicloFiltro || ciclo?.id || ''} onChange={e => setCicloFiltro(e.target.value)}
                  style={{ fontSize:'.8rem', padding:'4px 8px', borderRadius:6, border:'.5px solid #E5E7EB', background:'white' }}>
                  {ciclosUnicos.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
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
                <div className="card-title"><i className="ti ti-chart-donut" /> Diagnósticos — ciclo atual</div>
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
                        background: row.ciclo_id === ciclo?.id ? '#F0F9EC' : 'white',
                        fontWeight: row.ciclo_id === ciclo?.id ? 500 : 400
                      }}>
                        <td>
                          {row.ciclo?.nome || '—'}
                          {row.ciclo_id === ciclo?.id && (
                            <span style={{ marginLeft:5, padding:'1px 5px', borderRadius:8, fontSize:'.63rem', background:'#E8F0FC', color:'#1E55B0' }}>atual</span>
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

      {/* ── Modal novo lote ── */}
      <Modal open={modal==='lote'} onClose={()=>setModal(null)} title="Novo lote de inseminação" width={600}>
        <div className="grid-form">
          <Field label="Data da inseminação" required>
            <input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))} />
          </Field>
          <Field label="Touro / Sêmen" required>
            <input value={form.touro||''} onChange={e=>setForm(p=>({...p,touro:e.target.value}))} placeholder="Nome do touro" />
          </Field>
          <Field label="Protocolo">
            <input value={form.protocolo||''} onChange={e=>setForm(p=>({...p,protocolo:e.target.value}))} placeholder="ex: IATF P4" />
          </Field>
        </div>
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
          <select value={filtroLoteInsem} onChange={e => setFiltroLoteInsem(e.target.value)}
            className="input" style={{ width:'100%', marginBottom:8 }}>
            <option value="">Todos os lotes</option>
            {lotesSistema.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
          {femsVaziasFiltradas.length > 0 && podeEditarReprod && (
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
                  </label>
                ))
            }
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={salvarLote} disabled={saving}>
            {saving ? 'Registrando...' : <><i className="ti ti-check" /> Registrar lote</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
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
          <select value={filtroLoteInsem} onChange={e => setFiltroLoteInsem(e.target.value)}
            className="input" style={{ width:'100%', marginBottom:8 }}>
            <option value="">Todos os lotes</option>
            {lotesSistema.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
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
                  </label>
                ))
            }
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-primary" onClick={adicionarAnimaisLote} disabled={saving}>
            {saving ? 'Adicionando...' : <><i className="ti ti-check" /> Adicionar ao lote</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
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

            const touro   = resolverTouro(mae.id)
            const loteLbl = mae.lote?.nome || '—'
            const prop    = mae.proprietario?.nome || '—'

            const pesoTxt = peso ? ` · ${peso}kg` : ''
            const resumo  = `Mãe ${brinco} · ${sexo === 'M' ? 'Macho' : 'Fêmea'}${pesoTxt} · Touro ${touro||'—'} · ${prop} · ${loteLbl}`
            setForm(p => ({ ...p, mae_brinco: brinco, sexo_bezerro: sexo, touro_pai: touro, auto_lote: loteLbl, auto_prop: prop, voz_resumo: resumo, peso_nascimento: peso || p.peso_nascimento }))
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
              const touro   = mae ? resolverTouro(mae.id) : ''
              const loteLbl = mae?.lote?.nome || '—'
              const prop    = mae?.proprietario?.nome || '—'
              setForm(p => ({ ...p, mae_brinco: brinco, touro_pai: touro, auto_lote: loteLbl, auto_prop: prop, voz_resumo: null }))
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
        <div className="grid-form">
          <Field label="Peso ao nascer (kg)">
            <input type="number" min="0" step="0.1" value={form.peso_nascimento||''} onChange={e=>setForm(p=>({...p,peso_nascimento:e.target.value}))} placeholder="opcional" />
          </Field>
          <Field label="Observações">
            <input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional" />
          </Field>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvarParto} disabled={saving}>
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
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
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
