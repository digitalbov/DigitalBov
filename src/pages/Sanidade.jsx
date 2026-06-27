import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { fmtData, diasDesde } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento } from '../components/UI'

const TABS   = ['Registros','Alertas','Histórico']
const TIPOS  = ['Vacina','Vermifugação','Ectoparasita','Medicação','Exame']
const COR_TP = { Vacina:'green', Vermifugação:'blue', Ectoparasita:'amber', Medicação:'purple', Exame:'gray' }

const PLURAL_TIPOS = {
  'Vacina':        'Vacinações',
  'Vermifugação':  'Vermifugações',
  'Ectoparasita':  'Ectoparasitações',
  'Medicação':     'Medicações',
  'Exame':         'Exames'
}

export default function Sanidade() {
  const refReg     = useRef(null)
  const refAlertas = useRef(null)
  const refHist    = useRef(null)

  const [tab,      setTab]     = useState(0)
  const [dados,    setDados]   = useState([])
  const [lotes,    setLotes]   = useState([])
  const [animais,  setAnimais] = useState([])
  const [selLotes, setSelLotes]= useState([])
  const [loading,  setLoading] = useState(true)
  const [modal,      setModal]      = useState(false)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [{ data: sanData }, { data: lotesData }, { data: animaisData }] = await Promise.all([
        db.sanidade.list(),
        db.lotes.list(),
        db.animais.list({ situacao: 'ativo' })
      ])
      setDados(sanData       || [])
      setLotes(lotesData     || [])
      setAnimais(animaisData || [])
    } catch (e) {
      console.error('[Sanidade] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const togLote = (nome) => setSelLotes(prev =>
    prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]
  )

  // Quantidade automática: soma de animais ativos dos lotes selecionados
  const autoQtd = selLotes.length === 0 ? null : (() => {
    const ids = lotes.filter(l => selLotes.includes(l.nome)).map(l => l.id)
    return animais.filter(a => ids.includes(a.lote_id)).length
  })()

  const salvar = async () => {
    if (!form.data || !form.tipo || !form.procedimento) {
      toast('Preencha data, tipo e procedimento.', 'error'); return
    }
    setSaving(true)
    const { error } = await db.sanidade.insert({
      data:         form.data,
      tipo:         form.tipo,
      procedimento: form.procedimento,
      lote_descricao: selLotes.length > 0 ? selLotes.join(', ') : 'Geral',
      quantidade:   autoQtd !== null ? autoQtd : (parseInt(form.quantidade) || 0),
      proximo:      form.proximo || null,
      custo:        parseFloat(form.custo) || 0,
      observacoes:  form.obs || ''
    })
    setSaving(false)
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast('Procedimento registrado!')
    setModal(false); setForm({}); setSelLotes([]); load()
  }

  const excluir = async (id) => {
    const { error } = await db.sanidade.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Registro removido.')
    load()
  }

  const vozSan = (text) => {
    const t = text.toLowerCase()
    const tipo = TIPOS.find(tp => t.includes(tp.toLowerCase())) || 'Vacina'
    setForm(p => ({ ...p, tipo }))
    const nums = t.match(/\d+/g)
    if (nums) setForm(p => ({ ...p, quantidade: parseInt(nums[0]) }))
    const procs = ['aftosa','brucelose','ibr','bvd','raiva','carbúnculo','ivermectina','doramectina','carrapaticida','pen-strep']
    const pr = procs.find(p => t.includes(p))
    if (pr) setForm(p => ({ ...p, procedimento: pr.charAt(0).toUpperCase() + pr.slice(1) }))
    toast(`Tipo: ${tipo}${nums ? ` · ${nums[0]} animais` : ''}`)
  }

  const hoje    = new Date()
  const em30    = new Date(); em30.setDate(em30.getDate() + 30)
  const vencidos = dados.filter(d => d.proximo && new Date(d.proximo + 'T12:00:00') < hoje)
  const proximos = dados.filter(d => d.proximo && new Date(d.proximo + 'T12:00:00') >= hoje && new Date(d.proximo + 'T12:00:00') <= em30)

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={load} />

  return (
    <div>
      <div className="tabs-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Registros ── */}
      {tab === 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{dados.length} procedimentos</span>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ tipo:'Vacina' }); setModal(true) }}>
                <i className="ti ti-plus" /> Novo procedimento
              </button>
              <BotaoPDF contentRef={refReg} filename="sanidade-registros" />
            </div>
          </div>
          <div ref={refReg}>
          {dados.length === 0
            ? <EmptyState icon="💉" title="Nenhum procedimento registrado"
                action={<button className="btn btn-primary btn-sm" onClick={()=>{setForm({tipo:'Vacina'});setModal(true)}}><i className="ti ti-plus"/>Registrar</button>}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Grupo/Lote</th><th>Qt</th><th>Próximo</th><th>Custo</th><th></th></tr>
                  </thead>
                  <tbody>
                    {dados.map(d => {
                      const prx = d.proximo ? new Date(d.proximo + 'T12:00:00') : null
                      const venc = prx && prx < hoje
                      return (
                        <tr key={d.id}>
                          <td>{fmtData(d.data)}</td>
                          <td><Badge color={COR_TP[d.tipo] || 'gray'}>{d.tipo}</Badge></td>
                          <td style={{ fontWeight:500 }}>{d.procedimento}</td>
                          <td style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{d.lote_descricao}</td>
                          <td>{d.quantidade || '—'}</td>
                          <td style={{ color: venc ? '#791F1F' : '#6B7280', fontSize:'.78rem' }}>
                            {d.proximo ? fmtData(d.proximo) : '—'}
                            {venc && ' ⚠️'}
                          </td>
                          <td style={{ color:'#6B7280' }}>
                            {d.custo > 0 ? `R$ ${parseFloat(d.custo).toFixed(2)}` : '—'}
                          </td>
                          <td>
                            <button className="btn-icon" onClick={() => setConfirmDel(d.id)}>
                              <i className="ti ti-trash" style={{ fontSize:13 }} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
          </div>{/* end refReg */}
        </div>
      )}

      {/* ── Alertas ── */}
      {tab === 1 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refAlertas} filename="sanidade-alertas" />
          </div>
          <div ref={refAlertas}>
          {vencidos.length === 0 && proximos.length === 0 && (
            <AlertBox type="green" title="Tudo em dia!" body="Nenhum procedimento vencido ou próximo do prazo." />
          )}
          {vencidos.map(d => (
            <AlertBox key={d.id} type="red"
              title={`${d.procedimento} — vencido`}
              body={`${d.lote_descricao} · Deveria ter sido aplicado em ${fmtData(d.proximo)} · ${diasDesde(d.proximo)} dias em atraso`}
            />
          ))}
          {proximos.map(d => (
            <AlertBox key={d.id} type="amber"
              title={`${d.procedimento} — próximo`}
              body={`${d.lote_descricao} · Previsto para ${fmtData(d.proximo)} · ${d.quantidade || ''} animais`}
            />
          ))}
          <div className="card" style={{ marginTop:12 }}>
            <div className="card-title"><i className="ti ti-calendar-event" /> Calendário sanitário — próximos 90 dias</div>
            {dados
              .filter(d => d.proximo)
              .sort((a, b) => a.proximo.localeCompare(b.proximo))
              .slice(0, 8)
              .map(d => {
                const prx = new Date(d.proximo + 'T12:00:00')
                const dias = Math.ceil((prx - hoje) / 86400000)
                return (
                  <div key={d.id} className="row">
                    <span className="row-label"><strong>{d.procedimento}</strong> · {d.lote_descricao}</span>
                    <span style={{
                      fontSize:'.8rem', fontWeight:500,
                      color: dias < 0 ? '#791F1F' : dias < 30 ? '#BA7517' : '#27500A'
                    }}>
                      {dias < 0 ? `${Math.abs(dias)}d atraso` : dias === 0 ? 'Hoje' : `${dias} dias`}
                    </span>
                  </div>
                )
              })
            }
          </div>
          </div>{/* end refAlertas */}
        </div>
      )}

      {/* ── Histórico ── */}
      {tab === 2 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refHist} filename="sanidade-historico" />
          </div>
          <div ref={refHist}>
          <div className="grid-3" style={{ marginBottom:16 }}>
            {TIPOS.map(tp => {
              const qt = dados.filter(d => d.tipo === tp).length
              return (
                <div key={tp} className="kpi-card">
                  <div className="kpi-value">{qt}</div>
                  <div className="kpi-label">{PLURAL_TIPOS[tp] || tp}</div>
                </div>
              )
            })}
          </div>
          <div className="card">
            <div className="card-title"><i className="ti ti-list" /> Histórico completo por tipo</div>
            {TIPOS.map(tp => {
              const lst = dados.filter(d => d.tipo === tp)
              if (!lst.length) return null
              return (
                <div key={tp} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <Badge color={COR_TP[tp] || 'gray'}>{tp}</Badge>
                    <span style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{lst.length} registros</span>
                  </div>
                  {lst.slice(0,5).map(d => (
                    <div key={d.id} className="row">
                      <span className="row-label">{fmtData(d.data)} · {d.procedimento}</span>
                      <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{d.lote_descricao} · {d.quantidade||0} animais</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          </div>{/* end refHist */}
        </div>
      )}

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => excluir(confirmDel)}
        title="Excluir procedimento"
        message="Excluir este procedimento? Esta ação não pode ser desfeita."
        danger
      />

      {/* ── Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Novo procedimento sanitário" width={540}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
          <MicButton hint='Voz: "vacina — febre aftosa — todo rebanho — dezesseis animais"' onResult={vozSan} />
        </div>
        <div style={{ fontSize:'.78rem', background:'#EEEDFE', color:'#3C3489', padding:'7px 10px', borderRadius:8, marginBottom:12 }}>
          <i className="ti ti-microphone" style={{fontSize:12}}/> Voz: <b>"Vermifugação — Ivermectina — todo rebanho — dezesseis animais"</b>
        </div>
        <div className="grid-form">
          <Field label="Data" required><input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/></Field>
          <Field label="Tipo" required>
            <select value={form.tipo||'Vacina'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Procedimento" required><input value={form.procedimento||''} onChange={e=>setForm(p=>({...p,procedimento:e.target.value}))} placeholder="ex: Ivermectina 1%"/></Field>
          <Field label={autoQtd !== null ? `Quantidade (auto: ${autoQtd} animais)` : 'Quantidade de animais'}>
            {autoQtd !== null
              ? <input type="number" value={autoQtd} readOnly style={{ background:'#F0F9EC', color:'#27500A', fontWeight:600, cursor:'default' }} />
              : <input type="number" value={form.quantidade||''} onChange={e=>setForm(p=>({...p,quantidade:e.target.value}))} placeholder="0"/>
            }
          </Field>
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={{ fontSize:'.78rem', fontWeight:500, color:'#374151', display:'block', marginBottom:6 }}>Lotes (opcional)</label>
            <div style={{ border:'.5px solid #E5E7EB', borderRadius:8, background:'#F9FAFB', padding:'6px 10px', maxHeight:140, overflowY:'auto' }}>
              {lotes.length === 0
                ? <div style={{ fontSize:'.8rem', color:'#9CA3AF', textAlign:'center', padding:'8px 0' }}>Nenhum lote cadastrado</div>
                : lotes.map(l => (
                    <label key={l.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px', cursor:'pointer', fontSize:'.83rem', borderBottom:'.5px solid #F3F4F6' }}>
                      <input type="checkbox" checked={selLotes.includes(l.nome)} onChange={() => togLote(l.nome)} />
                      {l.nome}
                    </label>
                  ))
              }
            </div>
            {selLotes.length > 0 && (
              <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:4 }}>Selecionados: {selLotes.join(', ')}</div>
            )}
          </div>
          <Field label="Custo total (R$)"><input type="number" step="0.01" value={form.custo||''} onChange={e=>setForm(p=>({...p,custo:e.target.value}))} placeholder="0,00"/></Field>
          <Field label="Próxima aplicação"><input type="date" value={form.proximo||''} onChange={e=>setForm(p=>({...p,proximo:e.target.value}))}/></Field>
        </div>
        <Field label="Observações"><input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional"/></Field>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
