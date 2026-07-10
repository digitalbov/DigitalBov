import { useState, useEffect, useRef } from 'react'
import { usePermissoes } from '../lib/PermissoesContext'
import { db } from '../lib/supabase'
import { calcCategoria, calcCategoriaRebanho, idadeFormatada, fmtData, catCor, sitCor, repCor, sortBrinco } from '../lib/helpers'
import { Loading, EmptyState, Modal, Field, MicButton, Badge, toast, BotaoPDF, ErroCarregamento } from '../components/UI'
import { baixarModeloAnimais, lerPlanilhaAnimais, validarLinhas } from '../lib/importacaoAnimais'

const SITUACOES = ['ativo','vendido','morto']

// ── Helpers de timeline ───────────────────────────────────────────
const TL_ICONS = {
  nascimento:   '🐮',
  pesagem:      '⚖️',
  inseminacao:  '💉',
  dg_prenha:    '✅',
  dg_vazia:     '❌',
  parto_mae:    '🍼',
  parto_bezerro:'🐣',
}

function TimelineCard({ timeline, loading }) {
  if (loading) return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-title"><i className="ti ti-timeline" /> Linha do tempo</div>
      <Loading text="Carregando histórico..." />
    </div>
  )
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="card-title"><i className="ti ti-timeline" /> Linha do tempo</div>
      {timeline.length === 0 ? (
        <div style={{ fontSize: '.83rem', color: '#9CA3AF', padding: '4px 0' }}>
          Nenhum evento registrado além do nascimento.
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 30 }}>
          {/* Linha vertical */}
          <div style={{
            position: 'absolute', left: 9, top: 10, bottom: 4,
            width: 2, background: '#E5E7EB', borderRadius: 2
          }} />
          {timeline.map((ev, i) => (
            <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
              {/* Ponto */}
              <div style={{
                position: 'absolute', left: -26, top: 1,
                width: 20, height: 20, borderRadius: '50%',
                background: 'white', border: '2px solid #D1D5DB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, lineHeight: 1
              }}>
                {ev.icon}
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#9CA3AF', lineHeight: 1.3 }}>
                  {fmtData(ev.data)}
                </div>
                <div style={{ fontWeight: 500, fontSize: '.85rem', color: '#111827', marginTop: 1 }}>
                  {ev.titulo}
                </div>
                {ev.descricao && (
                  <div style={{ fontSize: '.78rem', color: '#6B7280' }}>{ev.descricao}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Genealogia ────────────────────────────────────────────────────

function NodoCard({ animal, nome, tipo, destaque, onSelect }) {
  const isTouro   = tipo === 'touro'
  const isUnknown = tipo === 'unknown'
  const isMale    = animal?.sexo === 'M'
  const hasClick  = !destaque && !isTouro && !isUnknown && animal && onSelect

  const borderColor = isTouro   ? '#D1D5DB'
                    : isUnknown ? '#D1D5DB'
                    : destaque  ? '#2B6CD9'
                    : isMale    ? '#93C5FD'
                    : '#1BA89C'
  const bgColor     = destaque  ? '#2B6CD9'
                    : isTouro   ? '#F9FAFB'
                    : isUnknown ? '#F9FAFB'
                    : isMale    ? '#EFF6FF'
                    : '#F0FBE4'

  return (
    <div
      onClick={() => hasClick && onSelect(animal)}
      style={{
        border: `${isUnknown ? '1.5px dashed' : '2px solid'} ${borderColor}`,
        borderRadius: 10, padding: '8px 12px', textAlign: 'center',
        minWidth: 80, maxWidth: 130, flexShrink: 0,
        background: bgColor, color: destaque ? 'white' : '#111827',
        cursor: hasClick ? 'pointer' : 'default',
        boxShadow: destaque ? '0 3px 14px rgba(30,77,53,.28)' : '0 1px 3px rgba(0,0,0,.07)',
      }}
    >
      {isTouro ? (
        <>
          <div style={{ fontSize: 18, color: '#60A5FA' }}>♂</div>
          <div style={{ fontWeight: 600, fontSize: '.82rem', lineHeight: 1.3, marginTop: 2 }}>{nome}</div>
          <div style={{ fontSize: '.63rem', color: '#9CA3AF', marginTop: 2 }}>Touro</div>
        </>
      ) : isUnknown ? (
        <>
          <div style={{ fontSize: 18, color: '#9CA3AF' }}>♀</div>
          <div style={{ fontWeight: 600, fontSize: '.82rem', lineHeight: 1.3, marginTop: 2 }}>{nome}</div>
          <div style={{ fontSize: '.63rem', color: '#9CA3AF', marginTop: 2 }}>Não cadastrada</div>
        </>
      ) : animal ? (
        <>
          <div style={{ fontSize: 18, color: destaque ? 'rgba(255,255,255,.9)' : isMale ? '#3B82F6' : '#27A838' }}>
            {animal.sexo === 'F' ? '♀' : '♂'}
          </div>
          <div style={{ fontWeight: 700, fontSize: '.92rem', lineHeight: 1.3, marginTop: 2 }}>
            {animal.brinco}
          </div>
          <div style={{ fontSize: '.63rem', color: destaque ? 'rgba(255,255,255,.65)' : '#6B7280', marginTop: 2 }}>
            {calcCategoria(animal.data_nascimento, animal.sexo)}
          </div>
          {hasClick && (
            <div style={{ fontSize: '.58rem', color: '#9CA3AF', marginTop: 3 }}>▶ ver ficha</div>
          )}
        </>
      ) : null}
    </div>
  )
}

function GenStem() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <div style={{ width: 2, height: 22, background: '#D1D5DB', borderRadius: 1 }} />
    </div>
  )
}

function GenRowLabel({ children, color = '#9CA3AF' }) {
  return (
    <div style={{
      textAlign: 'center', fontSize: '.63rem', fontWeight: 700,
      letterSpacing: '.09em', textTransform: 'uppercase',
      color, marginBottom: 7, marginTop: 2
    }}>{children}</div>
  )
}

function ArvoreGenealogica({ animal, animais, onSelect }) {
  // Mãe: busca por brinco (prioridade) ou por id
  const mae = animais.find(x =>
    (animal.mae_brinco && x.brinco === animal.mae_brinco) ||
    (animal.mae_id && !animal.mae_brinco && x.id === animal.mae_id)
  ) || null

  // Avós maternos
  const avoMae = mae ? animais.find(x =>
    (mae.mae_brinco && x.brinco === mae.mae_brinco) ||
    (mae.mae_id && !mae.mae_brinco && x.id === mae.mae_id)
  ) || null : null
  const avoPaiMae = mae?.pai || null  // touro (texto)

  // Filhos: animais com mae_brinco = brinco deste animal
  const filhos = animais
    .filter(x =>
      (animal.brinco && x.mae_brinco === animal.brinco) ||
      (animal.id && x.mae_id === animal.id)
    )
    .sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

  const hasPai         = !!animal.pai
  const hasMae         = !!mae
  const hasMaeSoText   = !mae && !!animal.mae_brinco
  const hasAvos        = mae && (avoMae || avoPaiMae)
  const hasFilhos      = filhos.length > 0
  const semDados       = !hasPai && !hasMae && !hasMaeSoText && !hasFilhos

  if (semDados) {
    return (
      <div style={{ fontSize: '.83rem', color: '#9CA3AF', fontStyle: 'italic', padding: '4px 0' }}>
        Sem informações de genealogia cadastradas para este animal.
      </div>
    )
  }

  // Alerta de consanguinidade: mesmo touro em mais de um nível
  const touros = [animal.pai, avoPaiMae, avoMae?.pai, mae?.pai].filter(Boolean)
  const tc = {}; touros.forEach(t => { tc[t] = (tc[t] || 0) + 1 })
  const repetidos = Object.entries(tc).filter(([, n]) => n > 1).map(([t]) => t)

  return (
    <div>
      {/* Alerta */}
      {repetidos.length > 0 && (
        <div style={{
          background: '#FEF3C7', border: '.5px solid #FBBF24', borderRadius: 8,
          padding: '8px 12px', marginBottom: 12,
          fontSize: '.78rem', color: '#633806',
          display: 'flex', gap: 8, alignItems: 'flex-start'
        }}>
          <span>⚠️</span>
          <span>
            O touro <strong>{repetidos.join(', ')}</strong> aparece em mais de uma geração desta linhagem. Avalie possível consanguinidade.
          </span>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 12px' }}>

          {/* Avós maternos */}
          {hasAvos && (
            <>
              <GenRowLabel>Avós maternos</GenRowLabel>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {avoPaiMae && <NodoCard tipo="touro" nome={avoPaiMae} />}
                {avoMae    && <NodoCard tipo="animal" animal={avoMae} onSelect={onSelect} />}
              </div>
              <GenStem />
            </>
          )}

          {/* Pais */}
          {(hasPai || hasMae || hasMaeSoText) && (
            <>
              <GenRowLabel>Pais</GenRowLabel>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {hasPai      && <NodoCard tipo="touro"   nome={animal.pai} />}
                {hasMae      && <NodoCard tipo="animal"  animal={mae} onSelect={onSelect} />}
                {hasMaeSoText && <NodoCard tipo="unknown" nome={`Brinco ${animal.mae_brinco}`} />}
              </div>
              <GenStem />
            </>
          )}

          {/* Animal central */}
          <GenRowLabel color="#2B6CD9">Animal selecionado</GenRowLabel>
          <NodoCard tipo="animal" animal={animal} destaque />

          {/* Filhos */}
          {hasFilhos && (
            <>
              <GenStem />
              <GenRowLabel>Descendentes ({filhos.length})</GenRowLabel>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                {filhos.map(f => (
                  <NodoCard key={f.id} tipo="animal" animal={f} onSelect={onSelect} />
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Grupo de filtros (rótulo discreto + contêiner sutil) ───────────
function FiltroGrupo({ label, children }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 5,
      background: '#F9FAFB', border: '.5px solid #E5E7EB', borderRadius: 10,
      padding: '6px 10px'
    }}>
      <span style={{ fontSize: '.65rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

export default function Animais() {
  const { podeEditar } = usePermissoes()
  const podeEditarAnimais = podeEditar('animais')


  const listaRef   = useRef(null)
  const detalheRef = useRef(null)

  const [animais,         setAnimais]         = useState([])
  const [props,           setProps]           = useState([])
  const [lotes,           setLotes]           = useState([])
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(false)
  const [filtSit,         setFiltSit]         = useState('ativo')
  const [filtProp,        setFiltProp]        = useState('')
  const [filtSexo,        setFiltSexo]        = useState('')
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState(null)
  const [modal,           setModal]           = useState(false)
  const [editData,        setEditData]        = useState(null)
  const [saving,          setSaving]          = useState(false)
  // Timeline
  const [timeline,        setTimeline]        = useState([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  // Histórico sanitário
  const [histSanidade,    setHistSanidade]     = useState([])
  // Notas
  const [notas,           setNotas]           = useState('')
  const [savingNotas,     setSavingNotas]     = useState(false)
  // Importação via planilha
  const [modalImport,     setModalImport]     = useState(false)
  const [previewImport,   setPreviewImport]   = useState(null) // { validos, erros }
  const [importando,      setImportando]      = useState(false)
  const fileImportRef = useRef(null)
  // Filtros extras (tabela desktop e mobile)
  const [filtCategoria,   setFiltCategoria]   = useState('')
  const [filtRep,         setFiltRep]         = useState('')
  const [filtLote,        setFiltLote]        = useState('')
  // Ordenação (tabela desktop)
  const [ordenacao,       setOrdenacao]       = useState({ campo: 'brinco', dir: 'asc' })
  // Seleção em lote (tabela desktop)
  const [selecionados,    setSelecionados]    = useState([])
  const [excluindoLote,   setExcluindoLote]   = useState(false)

  useEffect(() => { loadAll() }, [])

  // Carrega timeline e notas quando muda o animal selecionado
  useEffect(() => {
    if (!selected) { setTimeline([]); setNotas(''); return }
    setNotas(selected.observacoes || '')
    loadTimeline(selected)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega histórico sanitário quando muda o animal selecionado
  useEffect(() => {
    if (!selected?.id) { setHistSanidade([]); return }
    db.sanidadeAnimais.listPorAnimal(selected.id).then(({ data }) => setHistSanidade(data || []))
  }, [selected?.id])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ra, rp, rl] = await Promise.all([
        db.animais.list(),
        db.proprietarios.list(),
        db.lotes.list()
      ])
      setAnimais(ra.data || [])
      setProps(rp.data   || [])
      setLotes(rl.data   || [])
    } catch (e) {
      console.error('[Animais] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const loadTimeline = async (animal) => {
    setTimelineLoading(true)
    setTimeline([])

    const [rPes, rIns, rPartosMae, rPartoBezerro] = await Promise.all([
      db.pesagens.list(animal.id),
      db.inseminacoes.byAnimal(animal.id),
      db.partos.byMae(animal.id),
      db.partos.byBezerro(animal.id)
    ])

    const eventos = []

    // Nascimento
    if (animal.data_nascimento) {
      eventos.push({
        data:     animal.data_nascimento,
        icon:     TL_ICONS.nascimento,
        titulo:   'Nascimento',
        descricao: `${animal.raca || ''}${animal.pelagem ? ' · ' + animal.pelagem : ''} · ${animal.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'}`
      })
    }

    // Este animal é bezerro de algum parto registrado
    if (rPartoBezerro.data) {
      const p = rPartoBezerro.data
      eventos.push({
        data:     p.data_parto,
        icon:     TL_ICONS.parto_bezerro,
        titulo:   'Parto registrado',
        descricao: `Mãe: brinco ${p.mae?.brinco || '?'}`
      })
    }

    // Pesagens
    for (const p of (rPes.data || [])) {
      eventos.push({
        data:     p.data,
        icon:     TL_ICONS.pesagem,
        titulo:   `Pesagem: ${parseFloat(p.peso_kg).toFixed(1)} kg`,
        descricao: p.tipo || ''
      })
    }

    // Inseminações e diagnósticos
    for (const ins of (rIns.data || [])) {
      const dataIns = ins.lote?.data
      if (dataIns) {
        eventos.push({
          data:     dataIns,
          icon:     TL_ICONS.inseminacao,
          titulo:   `Inseminação — Lote ${ins.lote.numero}`,
          descricao: `Touro: ${ins.lote.touro || '?'}`
        })
      }
      if (ins.diagnostico && ins.data_diagnostico) {
        const prenha = ins.diagnostico === 'P'
        eventos.push({
          data:     ins.data_diagnostico,
          icon:     prenha ? TL_ICONS.dg_prenha : TL_ICONS.dg_vazia,
          titulo:   `Diagnóstico: ${prenha ? 'Prenha' : 'Vazia'}`,
          descricao: `Lote ${ins.lote?.numero || '?'} — ${ins.lote?.touro || '?'}`
        })
      }
    }

    // Partos como mãe
    for (const p of (rPartosMae.data || [])) {
      eventos.push({
        data:     p.data_parto,
        icon:     TL_ICONS.parto_mae,
        titulo:   'Parto',
        descricao: p.bezerro?.brinco
          ? `Bezerro: brinco ${p.bezerro.brinco} · ${p.bezerro.sexo === 'M' ? 'Macho ♂' : 'Fêmea ♀'}`
          : 'Bezerro não identificado'
      })
    }

    // Ordenar do mais recente para o mais antigo
    eventos.sort((a, b) => (b.data || '').localeCompare(a.data || ''))

    setTimeline(eventos)
    setTimelineLoading(false)
  }

  const salvarNotas = async () => {
    setSavingNotas(true)
    const { error } = await db.animais.update(selected.id, { observacoes: notas })
    setSavingNotas(false)
    if (error) { toast('Erro ao salvar anotação.', 'error'); return }
    toast('Anotação salva!')
    setSelected(prev => ({ ...prev, observacoes: notas }))
  }

  // Motivos que impedem a exclusão definitiva de um animal (histórico vinculado)
  const temVinculos = async (animalId) => {
    const [pes, insem, comoMae, comoBezerro] = await Promise.all([
      db.pesagens.countByAnimal(animalId),
      db.inseminacoes.byAnimal(animalId),
      db.partos.byMae(animalId),
      db.partos.byBezerro(animalId),
    ])
    const motivos = []
    if ((pes?.count || 0) > 0)            motivos.push('pesagens')
    if ((insem?.data?.length || 0) > 0)   motivos.push('inseminações')
    if ((comoMae?.data?.length || 0) > 0) motivos.push('partos como mãe')
    if (comoBezerro?.data)                motivos.push('nascimento registrado')
    return motivos
  }

  const excluirAnimal = async (animal) => {
    const motivos = await temVinculos(animal.id)
    if (motivos.length > 0) {
      toast(`Não é possível excluir: o animal tem histórico (${motivos.join(', ')}). Use "vender" ou "marcar como morto" para dar baixa.`, 'error')
      return
    }
    if (!confirm(`Excluir definitivamente o animal ${animal.brinco}? Esta ação não pode ser desfeita.`)) return
    const { error } = await db.animais.delete(animal.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Animal excluído.')
    setSelected(null)
    loadAll()
  }

  const toggleSelecionado = (id) => {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleSelecionarTodos = () => {
    const todosMarcados = filtered.length > 0 && filtered.every(a => selecionados.includes(a.id))
    setSelecionados(todosMarcados ? [] : filtered.map(a => a.id))
  }

  const excluirSelecionados = async () => {
    if (selecionados.length === 0) return
    if (!confirm(`Excluir definitivamente ${selecionados.length} animal(is) selecionado(s)? Esta ação não pode ser desfeita.`)) return
    setExcluindoLote(true)
    const animaisSel = animais.filter(a => selecionados.includes(a.id))
    const resultados  = await Promise.all(animaisSel.map(async a => ({ a, motivos: await temVinculos(a.id) })))
    const bloqueados  = resultados.filter(r => r.motivos.length > 0).map(r => r.a.brinco)
    const liberados   = resultados.filter(r => r.motivos.length === 0).map(r => r.a)
    if (liberados.length > 0) {
      await Promise.all(liberados.map(a => db.animais.delete(a.id)))
    }
    setExcluindoLote(false)
    setSelecionados([])
    const partes = []
    if (liberados.length  > 0) partes.push(`${liberados.length} animais excluídos`)
    if (bloqueados.length > 0) partes.push(`${bloqueados.length} não puderam ser excluídos por terem histórico: ${bloqueados.join(', ')}`)
    toast(partes.join('. ') || 'Nenhum animal excluído.', bloqueados.length > 0 && liberados.length === 0 ? 'error' : 'success')
    loadAll()
  }

  // Filtros
  const filtered = sortBrinco(animais.filter(a => {
    if (filtSit  && a.situacao         !== filtSit)  return false
    if (filtProp && a.proprietario_id  !== filtProp) return false
    if (filtSexo && a.sexo             !== filtSexo) return false
    if (filtCategoria && calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro) !== filtCategoria) return false
    if (filtRep      && a.sit_reprodutiva !== filtRep)  return false
    if (filtLote     && a.lote_id         !== filtLote) return false
    if (search   && !a.brinco.toLowerCase().includes(search.toLowerCase()) &&
        !calcCategoria(a.data_nascimento, a.sexo).toLowerCase().includes(search.toLowerCase())) return false
    return true
  }))

  const ativos   = animais.filter(a => a.situacao === 'ativo').length
  const inativos = animais.length - ativos

  // Opções distintas para os novos filtros
  const categoriasDisponiveis = [...new Set(
    animais.map(a => calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro))
  )].sort()
  const repsDisponiveis = [...new Set(animais.map(a => a.sit_reprodutiva).filter(Boolean))]

  // Ordenação (tabela desktop apenas — os cards mobile continuam na ordem de sortBrinco)
  const compararCampo = (a, b, campo) => {
    switch (campo) {
      case 'categoria':
        return calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
          .localeCompare(calcCategoriaRebanho(b.data_nascimento, b.sexo, b.sit_reprodutiva, b.is_touro))
      case 'proprietario':
        return (a.proprietario?.nome || '').localeCompare(b.proprietario?.nome || '')
      case 'rep':
        return (a.sit_reprodutiva || '').localeCompare(b.sit_reprodutiva || '')
      case 'situacao':
        return (a.situacao || '').localeCompare(b.situacao || '')
      case 'lote':
        return (a.lote?.nome || '').localeCompare(b.lote?.nome || '')
      case 'idade':
        return (a.data_nascimento || '').localeCompare(b.data_nascimento || '')
      case 'brinco':
      default:
        return a.brinco.localeCompare(b.brinco, undefined, { numeric: true })
    }
  }

  const ordenarPor = (campo) => {
    setOrdenacao(prev => prev.campo === campo ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' })
  }

  const filteredOrdenados = [...filtered].sort((a, b) => {
    const cmp = compararCampo(a, b, ordenacao.campo)
    return ordenacao.dir === 'asc' ? cmp : -cmp
  })

  const IndicadorOrdenacao = ({ campo }) => (
    ordenacao.campo === campo ? <span style={{ marginLeft: 3 }}>{ordenacao.dir === 'asc' ? '▲' : '▼'}</span> : null
  )

  const openNew = () => {
    setEditData({
      brinco:'', sexo:'F', data_nascimento:'', raca:'Angus', pelagem:'Preto',
      pai:'', mae_brinco:'', proprietario_id:'', lote_id:'',
      situacao:'ativo', sit_reprodutiva:'vazia', is_touro: false
    })
    setModal(true)
  }

  const openEdit = (a) => {
    setEditData({ ...a })
    setModal(true)
  }

  const limparVazios = (obj) => {
    const camposNullable = ['data_baixa', 'mae_id', 'lote_id']
    const out = { ...obj }
    for (const c of camposNullable) if (out[c] === '') out[c] = null
    return out
  }

  const salvar = async () => {
    let payload = { ...editData }
    delete payload.proprietario
    delete payload.lote
    payload = limparVazios(payload)
    if (!payload.brinco)          { toast('Preencha o brinco.', 'error'); return }
    if (!payload.sexo)            { toast('Selecione o sexo.', 'error'); return }
    if (!payload.proprietario_id) { toast('Selecione o proprietário.', 'error'); return }
    if (!payload.data_nascimento) { toast('Preencha a data de nascimento.', 'error'); return }
    setSaving(true)
    const { data: animalSalvo, error } = editData.id
      ? await db.animais.update(editData.id, payload)
      : await db.animais.insert(payload)
    setSaving(false)
    if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return }
    toast(editData.id ? 'Animal atualizado!' : 'Animal cadastrado!')
    setModal(false)
    if (editData.id && animalSalvo) setSelected(animalSalvo)
    loadAll()
  }

  const handleVoz = (text) => {
    const t = text.toLowerCase()
    const nums = t.match(/\d+/g)
    if (nums?.[0]) setEditData(p => ({ ...p, brinco: nums[0].padStart(2, '0') }))
    const pesoM = t.match(/(\d+)\s*quilo/)
    if (pesoM) setEditData(p => ({ ...p, _peso: parseInt(pesoM[1]) }))
    if (/macho|touro/i.test(t)) setEditData(p => ({ ...p, sexo: 'M', sit_reprodutiva: 'nao_se_aplica' }))
    if (/fêmea|vaca|novilha/i.test(t)) setEditData(p => ({ ...p, sexo: 'F' }))
    if (/prenha|grávida/i.test(t)) setEditData(p => ({ ...p, sit_reprodutiva: 'prenha' }))
    if (/vazia/i.test(t)) setEditData(p => ({ ...p, sit_reprodutiva: 'vazia' }))
  }

  const onEscolherArquivo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const linhas = await lerPlanilhaAnimais(file)
      const { validos, erros } = validarLinhas(linhas, props, lotes)
      setPreviewImport({ validos, erros })
      setModalImport(true)
    } catch (err) {
      toast('Erro ao ler a planilha: ' + err.message, 'error')
    }
    e.target.value = '' // permite reimportar o mesmo arquivo
  }

  const confirmarImportacao = async () => {
    if (!previewImport?.validos?.length) return
    setImportando(true)
    let ok = 0, falhas = 0
    for (const payload of previewImport.validos) {
      const { error } = await db.animais.insert(payload)
      if (error) falhas++; else ok++
    }
    setImportando(false)
    setModalImport(false)
    setPreviewImport(null)
    toast(`Importação concluída: ${ok} animais cadastrados` + (falhas ? `, ${falhas} falharam` : ''))
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  // ── Detalhe do animal ─────────────────────────────────────────────
  const detalhe = selected ? (() => {
    const a   = selected
    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
    const cc  = catCor[cat]             || catCor.Vaca
    const sc  = sitCor[a.situacao]      || sitCor.ativo
    const rc  = repCor[a.sit_reprodutiva] || repCor.nao_se_aplica
    const filhos = animais.filter(x => x.mae_brinco === a.brinco)

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
            <i className="ti ti-arrow-left" /> Lista
          </button>
          {podeEditarAnimais && a.situacao === 'ativo' && (
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
              <i className="ti ti-edit" /> Editar
            </button>
          )}
          {podeEditarAnimais && (
            <button className="btn btn-sm" style={{ background: '#FEE2E2', color: '#DC2626', border: 'none' }}
              onClick={() => excluirAnimal(a)}>
              <i className="ti ti-trash" /> Excluir
            </button>
          )}
          <BotaoPDF contentRef={detalheRef} filename={`animal-${a.brinco}`} titulo="Animais: Ficha do Animal" />
        </div>

        <div ref={detalheRef}>
          {/* Header card */}
          <div className="card" style={{
            borderLeft: `3px solid ${a.situacao === 'morto' ? '#E24B4A' : a.situacao === 'vendido' ? '#D97706' : '#2B6CD9'}`,
            marginBottom: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>Brinco {a.brinco}</span>
                  <Badge color={cc.bg === '#E8F0FC' ? 'green' : cc.bg === '#E6F1FB' ? 'blue' : cc.bg === '#EEEDFE' ? 'purple' : 'amber'}
                    style={{ background: cc.bg, color: cc.text }}>{cat}</Badge>
                  <Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge>
                  {a.sexo === 'F' && (
                    <Badge style={{ background: rc.bg, color: rc.text }}>{a.sit_reprodutiva?.replace('_', ' ')}</Badge>
                  )}
                </div>
                <div style={{ fontSize: '.82rem', color: '#6B7280', marginTop: 5 }}>
                  {a.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'} · {idadeFormatada(a.data_nascimento)} · {a.proprietario?.nome} · {a.raca}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            {/* Dados cadastrais */}
            <div className="card">
              <div className="card-title"><i className="ti ti-id" /> Dados cadastrais</div>
              {[
                ['Brinco',        a.brinco],
                ['Sexo',          a.sexo === 'F' ? 'Fêmea ♀' : 'Macho ♂'],
                ['Nascimento',    `${fmtData(a.data_nascimento)} · ${idadeFormatada(a.data_nascimento)}`],
                ['Categoria',     <Badge style={{ background: cc.bg, color: cc.text }}>{cat} <span style={{ fontSize: '.65rem', color: '#9CA3AF', marginLeft: 3 }}>automático</span></Badge>],
                ['Raça',          a.raca],
                ['Pelagem',       a.pelagem],
                ['Pai',           a.pai || '—'],
                ['Mãe (brinco)',  a.mae_brinco || '—'],
                ['Proprietário',  a.proprietario?.nome || '—'],
                ['Lote',          a.lote?.nome || '—'],
                ['Situação',      <Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge>],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '.78rem', color: '#6B7280', minWidth: 80, flexShrink: 0 }}>{l}</span>
                  <span style={{ fontSize: '.82rem' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Coluna direita */}
            <div>
              {a.sexo === 'F' && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-heart" style={{ color: '#E24B4A' }} /> Histórico reprodutivo</div>
                  <div className="row">
                    <span className="row-label">Situação atual</span>
                    <span className="row-value">
                      <Badge style={{ background: rc.bg, color: rc.text }}>{a.sit_reprodutiva?.replace('_', ' ')}</Badge>
                    </span>
                  </div>
                  <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: 8, padding: '0 2px' }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 12 }} /> Inseminações e diagnósticos aparecem na linha do tempo abaixo.
                  </div>
                </div>
              )}

              {filhos.length > 0 && (
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-title"><i className="ti ti-users" /> Filhos cadastrados ({filhos.length})</div>
                  {filhos.map(f => {
                    const fc = catCor[calcCategoria(f.data_nascimento, f.sexo)] || catCor.Vaca
                    return (
                      <div key={f.id} className="row" style={{ cursor: 'pointer' }}
                        onClick={() => setSelected(f)}>
                        <span className="row-label">
                          <b>{f.brinco}</b> · {f.sexo === 'F' ? '♀' : '♂'} · {calcCategoria(f.data_nascimento, f.sexo)}
                        </span>
                        <Badge style={{ background: fc.bg, color: fc.text }}>{f.situacao}</Badge>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="card">
                <div className="card-title"><i className="ti ti-info-circle" /> Lote e piquete</div>
                {[
                  ['Lote atual',  a.lote?.nome || '—'],
                  ['Data baixa',  fmtData(a.data_baixa) || '—'],
                ].map(([l, v]) => (
                  <div key={l} className="row">
                    <span className="row-label">{l}</span>
                    <span className="row-value">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Linha do tempo (dentro do ref para PDF) */}
          <TimelineCard timeline={timeline} loading={timelineLoading} />

          {/* Histórico Sanitário */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title"><i className="ti ti-vaccine" /> Histórico Sanitário</div>
            {histSanidade.length === 0
              ? <div style={{ fontSize: '.82rem', color: '#9CA3AF' }}>Nenhum procedimento sanitário registrado para este animal.</div>
              : histSanidade
                  .slice()
                  .sort((x, y) => (y.procedimento?.data || '').localeCompare(x.procedimento?.data || ''))
                  .map(h => (
                    <div key={h.id} style={{ padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
                      <div style={{ fontWeight: 500, fontSize: '.85rem' }}>{h.procedimento?.procedimento}</div>
                      <div style={{ fontSize: '.75rem', color: '#6B7280' }}>
                        {h.procedimento?.tipo} · {fmtData(h.procedimento?.data)}
                        {h.procedimento?.proximo && ` · próximo: ${fmtData(h.procedimento.proximo)}`}
                      </div>
                      {h.procedimento?.observacoes && <div style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{h.procedimento.observacoes}</div>}
                    </div>
                  ))
            }
          </div>

          {/* Genealogia */}
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title"><i className="ti ti-sitemap" /> Genealogia</div>
            <ArvoreGenealogica animal={a} animais={animais} onSelect={setSelected} />
          </div>
        </div>{/* end detalheRef */}

        {/* Anotações — fora do PDF, interativo */}
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-title"><i className="ti ti-notebook" /> Anotações</div>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder={`Observações sobre o brinco ${a.brinco}... Ex: "Vaca mansa, boa mãe" / "Problema de casco em 2026"`}
            rows={4}
            style={{ marginBottom: 10, fontSize: '.85rem' }}
          />
          {podeEditarAnimais && (
            <button className="btn btn-primary btn-sm" onClick={salvarNotas} disabled={savingNotas}>
              {savingNotas
                ? 'Salvando...'
                : <><i className="ti ti-device-floppy" /> Salvar anotação</>
              }
            </button>
          )}
        </div>
      </div>
    )
  })() : null

  // ── Lista ─────────────────────────────────────────────────────────
  const lista = !selected ? (
    <div>
      <div className="animais-filtros-bar" style={{
        background: 'white', border: '.5px solid #E5E7EB', borderRadius: 12,
        padding: '12px 14px', marginBottom: 12,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'
      }}>
        <div className="animais-filtros-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          <FiltroGrupo label="Situação">
            <button className={`pill ${filtSit === '' ? 'active' : ''}`}         onClick={() => setFiltSit('')}>Todos ({animais.length})</button>
            <button className={`pill ${filtSit === 'ativo' ? 'active' : ''}`}    onClick={() => setFiltSit('ativo')}>Ativos ({ativos})</button>
            <button className={`pill ${filtSit !== 'ativo' && filtSit !== '' ? 'active' : ''}`} onClick={() => setFiltSit('vendido')}>Inativos ({inativos})</button>
          </FiltroGrupo>

          <FiltroGrupo label="Proprietários">
            <button className={`pill ${!filtProp ? 'active' : ''}`}              onClick={() => setFiltProp('')}>Todos</button>
            {props.map(p => (
              <button key={p.id} className={`pill ${filtProp === p.id ? 'active' : ''}`} onClick={() => setFiltProp(p.id)}>
                {p.nome.split(' ')[0]}
              </button>
            ))}
          </FiltroGrupo>

          <FiltroGrupo label="Sexo">
            <button className={`pill ${!filtSexo ? 'active' : ''}`}   onClick={() => setFiltSexo('')}>♀♂</button>
            <button className={`pill ${filtSexo === 'F' ? 'active' : ''}`} onClick={() => setFiltSexo('F')}>♀ Fêmeas</button>
            <button className={`pill ${filtSexo === 'M' ? 'active' : ''}`} onClick={() => setFiltSexo('M')}>♂ Machos</button>
          </FiltroGrupo>

          <FiltroGrupo label="Reprodutivo">
            <button className={`pill ${!filtRep ? 'active' : ''}`} onClick={() => setFiltRep('')}>Todas</button>
            {repsDisponiveis.map(r => (
              <button key={r} className={`pill ${filtRep === r ? 'active' : ''}`} onClick={() => setFiltRep(r)}>
                {r.replace('_', ' ')}
              </button>
            ))}
          </FiltroGrupo>

          <FiltroGrupo label="Categoria / Lote">
            <select value={filtCategoria} onChange={e => setFiltCategoria(e.target.value)}
              style={{ width: 'auto', fontSize: '.8rem', padding: '6px 10px' }}>
              <option value="">Todas as categorias</option>
              {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filtLote} onChange={e => setFiltLote(e.target.value)}
              style={{ width: 'auto', fontSize: '.8rem', padding: '6px 10px' }}>
              <option value="">Todos os lotes</option>
              {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </FiltroGrupo>

          <input
            className="animais-search-input"
            style={{ flex: 1, minWidth: 130, maxWidth: 200 }}
            placeholder="🔍 Buscar brinco..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="animais-lote-botoes" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {podeEditarAnimais && (
            <>
              <div className="animais-lote-btn-group">
                <button className="btn btn-secondary btn-sm animais-btn-lote" onClick={() => baixarModeloAnimais()}>
                  <i className="ti ti-download" /> Plan. cadastro lote
                </button>
                <button className="btn btn-secondary btn-sm animais-btn-lote" onClick={() => fileImportRef.current?.click()}>
                  <i className="ti ti-upload" /> Importar plan. cad. lote
                </button>
              </div>
              <input ref={fileImportRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={onEscolherArquivo} />
              <button className="btn btn-primary btn-sm" onClick={openNew}>
                <i className="ti ti-plus" /> Novo animal
              </button>
            </>
          )}
          <BotaoPDF contentRef={listaRef} filename="animais-cadastro" titulo="Animais: Cadastro" />
        </div>
      </div>

      <div ref={listaRef}>
        {filtered.length === 0
          ? <EmptyState icon="🐄" title="Nenhum animal encontrado"
              sub="Ajuste os filtros ou cadastre um novo animal."
              action={podeEditarAnimais ? <button className="btn btn-primary btn-sm" onClick={openNew}><i className="ti ti-plus" /> Novo animal</button> : undefined} />
          : (
            <>
            {selecionados.length > 0 && (
              <div className="animais-tabela-desktop" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#FEE2E2', border: '.5px solid #FCA5A5', borderRadius: 10,
                padding: '8px 14px', marginBottom: 10
              }}>
                <span style={{ fontSize: '.85rem', color: '#7F1D1D', fontWeight: 500 }}>
                  {selecionados.length} selecionado(s)
                </span>
                <button className="btn btn-sm" style={{ background: '#DC2626', color: 'white' }}
                  onClick={excluirSelecionados} disabled={excluindoLote}>
                  <i className="ti ti-trash" /> {excluindoLote ? 'Excluindo...' : 'Excluir selecionados'}
                </button>
              </div>
            )}
            <div className="table-wrap animais-tabela-desktop">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox"
                        checked={filtered.length > 0 && filtered.every(a => selecionados.includes(a.id))}
                        onChange={toggleSelecionarTodos} />
                    </th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('brinco')}>Brinco<IndicadorOrdenacao campo="brinco" /></th>
                    <th>Sx</th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('categoria')}>Categoria<IndicadorOrdenacao campo="categoria" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('idade')}>Idade<IndicadorOrdenacao campo="idade" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('proprietario')}>Proprietário<IndicadorOrdenacao campo="proprietario" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('rep')}>Rep.<IndicadorOrdenacao campo="rep" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('situacao')}>Situação<IndicadorOrdenacao campo="situacao" /></th>
                    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => ordenarPor('lote')}>Lote<IndicadorOrdenacao campo="lote" /></th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrdenados.map(a => {
                    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
                    const cc  = catCor[cat]             || catCor.Vaca
                    const sc  = sitCor[a.situacao]      || sitCor.ativo
                    const rc  = repCor[a.sit_reprodutiva] || repCor.nao_se_aplica
                    const ina = a.situacao !== 'ativo'
                    return (
                      <tr key={a.id} style={{ opacity: ina ? .45 : 1, cursor: ina ? 'default' : 'pointer' }}
                        onClick={() => {
                          if (ina) return
                          setSelected(a)
                          document.querySelector('.page-body')?.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selecionados.includes(a.id)}
                            onClick={e => e.stopPropagation()}
                            onChange={() => toggleSelecionado(a.id)} />
                        </td>
                        <td><strong>{a.brinco}</strong></td>
                        <td style={{ textAlign: 'center', fontSize: 15 }}>{a.sexo === 'F' ? '♀' : '♂'}</td>
                        <td><Badge style={{ background: cc.bg, color: cc.text }}>{cat}</Badge></td>
                        <td style={{ color: '#6B7280' }}>{idadeFormatada(a.data_nascimento)}</td>
                        <td style={{ fontSize: '.8rem' }}>{a.proprietario?.nome?.split(' ')[0] || '—'}</td>
                        <td>{a.sexo === 'F'
                          ? <Badge style={{ background: rc.bg, color: rc.text }}>{a.sit_reprodutiva?.replace('_', ' ')}</Badge>
                          : <Badge style={{ background: '#F3F4F6', color: '#9CA3AF' }}>—</Badge>}
                        </td>
                        <td><Badge style={{ background: sc.bg, color: sc.text }}>{a.situacao}</Badge></td>
                        <td style={{ fontSize: '.78rem', color: '#9CA3AF' }}>{a.lote?.nome || '—'}</td>
                        <td style={{ textAlign: 'right', color: '#9CA3AF', fontSize: 12 }}>{ina ? '' : '›'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="animais-cards-mobile">
              {filtered.map(a => {
                const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
                const cc  = catCor[cat] || catCor.Vaca
                const ina = a.situacao !== 'ativo'
                return (
                  <div key={a.id} className="animal-card"
                    style={{ opacity: ina ? .45 : 1 }}
                    onClick={() => !ina && setSelected(a)}>
                    <div className="animal-card-avatar"
                      style={{ background: a.sexo==='F' ? '#FCE7F3' : '#DBEAFE',
                               color: a.sexo==='F' ? '#DB2777' : '#1E55B0' }}>
                      {a.sexo==='F' ? '♀' : '♂'}
                    </div>
                    <div className="animal-card-body">
                      <div className="animal-card-top">
                        <strong>{a.brinco}</strong>
                        <Badge style={{ background: cc.bg, color: cc.text }}>{cat}</Badge>
                        <span className="animal-card-meta">
                          {idadeFormatada(a.data_nascimento)} · {a.proprietario?.nome?.split(' ')[0] || '—'}
                          {a.lote?.nome ? ` · ${a.lote.nome}` : ''}
                        </span>
                      </div>
                    </div>
                    {!ina && <i className="ti ti-chevron-right" style={{ color:'#D1D5DB' }} />}
                  </div>
                )
              })}
            </div>
            </>
          )
        }
      </div>
    </div>
  ) : null

  return (
    <>

      {selected ? detalhe : lista}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editData?.id ? `Editando brinco ${editData.brinco}` : 'Novo animal'}
        width={580}
      >
        {editData && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <MicButton
                hint='Voz: "brinco zero três — fêmea — prenha"'
                onResult={handleVoz}
              />
            </div>

            <div className="grid-form">
              <Field label="Brinco" required>
                <input value={editData.brinco} onChange={e => setEditData(p => ({ ...p, brinco: e.target.value }))} placeholder="ex: 21" />
              </Field>
              <Field label="Sexo" required>
                <select value={editData.sexo} onChange={e => setEditData(p => ({ ...p, sexo: e.target.value, sit_reprodutiva: e.target.value === 'M' ? 'nao_se_aplica' : 'vazia' }))}>
                  <option value="F">Fêmea ♀</option>
                  <option value="M">Macho ♂</option>
                </select>
              </Field>
              <Field label="Data de nascimento" required>
                <input type="date" value={editData.data_nascimento || ''} onChange={e => setEditData(p => ({ ...p, data_nascimento: e.target.value }))} />
              </Field>
              <Field label="Categoria" hint="Calculada automaticamente">
                <input readOnly value={editData.data_nascimento && editData.sexo
                  ? calcCategoriaRebanho(editData.data_nascimento, editData.sexo, editData.sit_reprodutiva, editData.is_touro)
                  : '—'} />
              </Field>
              {editData?.sexo === 'M' && (
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <input type="checkbox"
                    checked={!!editData?.is_touro}
                    onChange={e => setEditData(p => ({...p, is_touro: e.target.checked}))} />
                  <span>É touro (ignora categoria por idade)</span>
                </label>
              )}
              <Field label="Raça">
                <input value={editData.raca || ''} onChange={e => setEditData(p => ({ ...p, raca: e.target.value }))} />
              </Field>
              <Field label="Pelagem">
                <input value={editData.pelagem || ''} onChange={e => setEditData(p => ({ ...p, pelagem: e.target.value }))} />
              </Field>
              <Field label="Pai">
                <input value={editData.pai || ''} onChange={e => setEditData(p => ({ ...p, pai: e.target.value }))} placeholder="Nome do touro" />
              </Field>
              <Field label="Mãe — brinco">
                <input value={editData.mae_brinco || ''} onChange={e => setEditData(p => ({ ...p, mae_brinco: e.target.value }))} placeholder="ex: 03" />
              </Field>
              <Field label="Proprietário" required>
                <select value={editData.proprietario_id || ''} onChange={e => setEditData(p => ({ ...p, proprietario_id: e.target.value }))}>
                  <option value="">— selecione —</option>
                  {props.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </Field>
              <Field label="Lote">
                <select value={editData.lote_id || ''} onChange={e => setEditData(p => ({ ...p, lote_id: e.target.value }))}>
                  <option value="">— sem lote —</option>
                  {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </Field>
              <Field label="Situação">
                <select value={editData.situacao || 'ativo'} onChange={e => setEditData(p => ({ ...p, situacao: e.target.value }))}>
                  {SITUACOES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {editData.sexo === 'F' && (
                <Field label="Situação reprodutiva">
                  <select value={editData.sit_reprodutiva || 'vazia'} onChange={e => setEditData(p => ({ ...p, sit_reprodutiva: e.target.value }))}>
                    <option value="prenha">Prenha</option>
                    <option value="vazia">Vazia</option>
                    <option value="nao_se_aplica">N/A</option>
                  </select>
                </Field>
              )}
              {(editData.situacao === 'vendido' || editData.situacao === 'morto') && (
                <Field label="Data da baixa">
                  <input type="date" value={editData.data_baixa || ''} onChange={e => setEditData(p => ({ ...p, data_baixa: e.target.value }))} />
                </Field>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: 4, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}>
                {saving
                  ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Salvando...</>
                  : <><i className="ti ti-check" />{editData.id ? 'Salvar' : 'Cadastrar'}</>
                }
              </button>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modalImport} onClose={() => setModalImport(false)} title="Importar animais" width={560}>
        {previewImport && (
          <div>
            <p style={{ fontWeight:600, marginBottom:8 }}>
              {previewImport.validos.length} animais prontos para importar
              {previewImport.erros.length > 0 && ` · ${previewImport.erros.length} linha(s) com erro`}
            </p>
            {previewImport.erros.length > 0 && (
              <div style={{ maxHeight:200, overflowY:'auto', background:'#FEF2F2', border:'.5px solid #FECACA', borderRadius:8, padding:10, marginBottom:12 }}>
                {previewImport.erros.map((er, i) => (
                  <div key={i} style={{ fontSize:'.8rem', color:'#B91C1C' }}>Linha {er.linha}: {er.motivo}</div>
                ))}
              </div>
            )}
            <p style={{ fontSize:'.8rem', color:'#6B7280', marginBottom:12 }}>
              As linhas com erro serão ignoradas. Corrija-as na planilha e importe novamente se necessário.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setModalImport(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={confirmarImportacao} disabled={importando || previewImport.validos.length===0}>
                {importando ? 'Importando...' : `Importar ${previewImport.validos.length} animais`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
