import { useState, useEffect, useRef } from 'react'
import { usePermissoes } from '../lib/PermissoesContext'
import { db } from '../lib/supabase'
import { calcCategoria, idadeFormatada, fmtData, catCor, sitCor, repCor, sortBrinco } from '../lib/helpers'
import { Loading, EmptyState, Modal, Field, MicButton, Badge, toast, BotaoPDF, ErroCarregamento } from '../components/UI'

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
  // Notas
  const [notas,           setNotas]           = useState('')
  const [savingNotas,     setSavingNotas]     = useState(false)

  useEffect(() => { loadAll() }, [])

  // Carrega timeline e notas quando muda o animal selecionado
  useEffect(() => {
    if (!selected) { setTimeline([]); setNotas(''); return }
    setNotas(selected.observacoes || '')
    loadTimeline(selected)
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filtros
  const filtered = sortBrinco(animais.filter(a => {
    if (filtSit  && a.situacao         !== filtSit)  return false
    if (filtProp && a.proprietario_id  !== filtProp) return false
    if (filtSexo && a.sexo             !== filtSexo) return false
    if (search   && !a.brinco.toLowerCase().includes(search.toLowerCase()) &&
        !calcCategoria(a.data_nascimento, a.sexo).toLowerCase().includes(search.toLowerCase())) return false
    return true
  }))

  const ativos   = animais.filter(a => a.situacao === 'ativo').length
  const inativos = animais.length - ativos

  const openNew = () => {
    setEditData({
      brinco:'', sexo:'F', data_nascimento:'', raca:'Angus', pelagem:'Preto',
      pai:'End Game', mae_brinco:'', proprietario_id:'', lote_id:'',
      situacao:'ativo', sit_reprodutiva:'vazia'
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
    const { error } = editData.id
      ? await db.animais.update(editData.id, payload)
      : await db.animais.insert(payload)
    setSaving(false)
    if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return }
    toast(editData.id ? 'Animal atualizado!' : 'Animal cadastrado!')
    setModal(false)
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

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  // ── Detalhe do animal ─────────────────────────────────────────────
  const detalhe = selected ? (() => {
    const a   = selected
    const cat = calcCategoria(a.data_nascimento, a.sexo)
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
          <BotaoPDF contentRef={detalheRef} filename={`animal-${a.brinco}`} />
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
      <div style={{
        background: 'white', border: '.5px solid #E5E7EB', borderRadius: 12,
        padding: '12px 14px', marginBottom: 12,
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center'
      }}>
        <div className="pill-group">
          <button className={`pill ${filtSit === 'ativo' ? 'active' : ''}`}    onClick={() => setFiltSit('ativo')}>Ativos ({ativos})</button>
          <button className={`pill ${filtSit === '' ? 'active' : ''}`}         onClick={() => setFiltSit('')}>Todos ({animais.length})</button>
          <button className={`pill ${filtSit !== 'ativo' && filtSit !== '' ? 'active' : ''}`} onClick={() => setFiltSit('vendido')}>Inativos ({inativos})</button>
        </div>
        <div className="pill-group">
          <button className={`pill ${!filtProp ? 'active' : ''}`}              onClick={() => setFiltProp('')}>Todos</button>
          {props.map(p => (
            <button key={p.id} className={`pill ${filtProp === p.id ? 'active' : ''}`} onClick={() => setFiltProp(p.id)}>
              {p.nome.split(' ')[0]}
            </button>
          ))}
        </div>
        <div className="pill-group">
          <button className={`pill ${!filtSexo ? 'active' : ''}`}   onClick={() => setFiltSexo('')}>♀♂</button>
          <button className={`pill ${filtSexo === 'F' ? 'active' : ''}`} onClick={() => setFiltSexo('F')}>♀ Fêmeas</button>
          <button className={`pill ${filtSexo === 'M' ? 'active' : ''}`} onClick={() => setFiltSexo('M')}>♂ Machos</button>
        </div>
        <input
          style={{ flex: 1, minWidth: 130, maxWidth: 200 }}
          placeholder="🔍 Buscar brinco..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {podeEditarAnimais && (
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <i className="ti ti-plus" /> Novo animal
            </button>
          )}
          <BotaoPDF contentRef={listaRef} filename="animais-cadastro" />
        </div>
      </div>

      <div ref={listaRef}>
        {filtered.length === 0
          ? <EmptyState icon="🐄" title="Nenhum animal encontrado"
              sub="Ajuste os filtros ou cadastre um novo animal."
              action={podeEditarAnimais ? <button className="btn btn-primary btn-sm" onClick={openNew}><i className="ti ti-plus" /> Novo animal</button> : undefined} />
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Brinco</th><th>Sx</th><th>Categoria</th><th>Idade</th>
                    <th>Proprietário</th><th>Rep.</th><th>Situação</th><th>Lote</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const cat = calcCategoria(a.data_nascimento, a.sexo)
                    const cc  = catCor[cat]             || catCor.Vaca
                    const sc  = sitCor[a.situacao]      || sitCor.ativo
                    const rc  = repCor[a.sit_reprodutiva] || repCor.nao_se_aplica
                    const ina = a.situacao !== 'ativo'
                    return (
                      <tr key={a.id} style={{ opacity: ina ? .45 : 1, cursor: ina ? 'default' : 'pointer' }}
                        onClick={() => !ina && setSelected(a)}
                      >
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
                <input readOnly value={editData.data_nascimento && editData.sexo ? calcCategoria(editData.data_nascimento, editData.sexo) : '—'} />
              </Field>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 4, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
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
    </>
  )
}
