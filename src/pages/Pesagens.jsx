import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { fmtData, calcGMD, fmtPeso } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, IndexCard, BotaoPDF, Confirm, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const TABS  = ['Registrar','Por Animal','Desempenho','Projeção']
const TIPOS = ['nascimento','desmama','sobreano','intermediaria']

export default function Pesagens() {
  const refReg    = useRef(null)
  const refAnimal = useRef(null)
  const refDesemp = useRef(null)
  const refProj   = useRef(null)

  const { podeEditar } = usePermissoes()
  const podeEditarPesagens = podeEditar('pesagens')
  const { ciclos, cicloSelecionado, dentroDoCiclo, cicloDaData, dataEhEditavel } = useCiclo()

  // Seletor de ciclo LOCAL desta tela — inicia (e reseta, a cada montagem da
  // tela) no ciclo GLOBAL selecionado no menu lateral, não no ciclo atual.
  const [cicloLocal, setCicloLocal] = useState(null)
  useEffect(() => { if (cicloSelecionado && !cicloLocal) setCicloLocal(cicloSelecionado) }, [cicloSelecionado]) // eslint-disable-line
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarPesagensCiclo = podeEditarPesagens && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const [tab,     setTab]    = useState(0)
  const [animais, setAnimais]= useState([])
  const [pesagens,setPesagens]= useState([])
  const [loading, setLoading]= useState(true)
  const [modal,   setModal]  = useState(false)
  const [form,    setForm]   = useState({})
  const [selBr,    setSelBr]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [pesoAlvo,   setPesoAlvo]   = useState(480)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ra, rp] = await Promise.all([
        db.animais.list({ situacao:'ativo' }),
        db.pesagens.listAll()
      ])
      setAnimais(ra.data  || [])
      setPesagens(rp.data || [])
    } catch (e) {
      console.error('[Pesagens] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const salvar = async () => {
    if (!podeEditarPesagensCiclo) return
    if (!form.animal_id || !form.data || !form.peso_kg || !form.tipo) {
      toast('Preencha todos os campos.','error'); return
    }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    setSaving(true)
    const { error } = await db.pesagens.insert({
      animal_id: form.animal_id,
      data:      form.data,
      tipo:      form.tipo,
      peso_kg:   parseFloat(form.peso_kg),
      observacoes: form.obs || ''
    })
    setSaving(false)
    if (error) { toast('Erro: ' + error.message,'error'); return }
    toast('Pesagem registrada!')
    setModal(false); setForm({}); loadAll()
  }

  const excluir = async (id) => {
    if (!podeEditarPesagensCiclo) return
    const { error } = await db.pesagens.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Pesagem removida.')
    loadAll()
  }

  const vozPes = (text) => {
    const t    = text.toLowerCase()
    const nums = t.match(/\d[\d.,]*/g)
    if (nums?.length >= 1) {
      const br = nums[0].padStart(2,'0')
      const a  = animais.find(x => x.brinco === br)
      if (a) setForm(p => ({ ...p, animal_id: a.id, _brinco: br }))
    }
    if (nums?.length >= 2) {
      const peso = parseFloat(nums[nums.length-1].replace(',','.'))
      if (peso > 0) setForm(p => ({ ...p, peso_kg: peso }))
    }
    const tipoMap = [
      [/nascimento|nasceu/,     'nascimento'],
      [/desmama|desmame/,       'desmama'],
      [/sobreano|sobre.ano/,    'sobreano'],
      [/intermediária|pesagem/, 'intermediaria'],
    ]
    const tp = tipoMap.find(([rx]) => rx.test(t))
    if (tp) setForm(p => ({ ...p, tipo: tp[1] }))
  }

  // Pesagens do animal selecionado
  const animal     = animais.find(a => a.brinco === selBr)
  const pesAnimal  = animal
    ? pesagens.filter(p => p.animal_id === animal.id).sort((a,b)=>a.data.localeCompare(b.data))
    : []
  const gmd        = calcGMD(pesAnimal)
  const ultimoPeso = pesAnimal[pesAnimal.length-1]
  const chartData  = pesAnimal.map(p => ({ data: fmtData(p.data), peso: parseFloat(p.peso_kg) }))

  // Desempenho
  const animaisComPeso = [...new Set(pesagens.map(p => p.animal_id))]
  const gmds = animaisComPeso.map(aid => {
    const ps = pesagens.filter(p => p.animal_id === aid).sort((a,b)=>a.data.localeCompare(b.data))
    const a  = animais.find(x => x.id === aid)
    const g  = calcGMD(ps)
    return { brinco: a?.brinco || '?', gmd: g ? parseFloat(g) : null, ultPeso: ps[ps.length-1]?.peso_kg }
  }).filter(x => x.gmd !== null).sort((a,b) => b.gmd - a.gmd)

  const mediaGMD = gmds.length ? (gmds.reduce((s,x)=>s+x.gmd,0)/gmds.length).toFixed(3) : '—'

  // Filtra a lista de registros (aba Registrar) pelo ciclo local. As demais
  // abas (Por Animal, Desempenho, Projeção) usam o histórico completo, pois
  // o cálculo de GMD/projeção depende de pesagens de qualquer época.
  const pesagensFiltradas = pesagens.filter(p => cicloLocal && dentroDoCiclo(p.data, cicloLocal))

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      <BannerCicloEncerrado ciclo={cicloLocal} />

      <div className="tabs-bar">
        {TABS.map((t,i) => (
          <button key={t} className={`tab-btn ${tab===i?'active':''}`} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Registrar ── */}
      {tab === 0 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
            <span style={{ fontSize:'.85rem', color:'#6B7280' }}>{pesagensFiltradas.length} pesagens neste ciclo · {animaisComPeso.length} animais no histórico</span>
            <div style={{ display:'flex', gap:8 }}>
              {podeEditarPesagensCiclo && (
                <button className="btn btn-primary btn-sm" onClick={() => { setForm({ tipo:'intermediaria', data: new Date().toISOString().split('T')[0] }); setModal(true) }}>
                  <i className="ti ti-plus" /> Registrar pesagem
                </button>
              )}
              <BotaoPDF contentRef={refReg} filename="pesagens-lista" titulo="Pesagens: Registros" />
            </div>
          </div>
          <div ref={refReg}>
          {pesagensFiltradas.length === 0
            ? <EmptyState icon="⚖️" title="Nenhuma pesagem registrada neste ciclo"
                action={podeEditarPesagensCiclo ? <button className="btn btn-primary btn-sm" onClick={()=>{setForm({tipo:'intermediaria',data:new Date().toISOString().split('T')[0]});setModal(true)}}><i className="ti ti-plus"/>Registrar</button> : undefined}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Brinco</th><th>Data</th><th>Tipo</th><th style={{textAlign:'right'}}>Peso</th><th></th></tr>
                  </thead>
                  <tbody>
                    {pesagensFiltradas.slice(0,30).map(p => {
                      const a = animais.find(x => x.id === p.animal_id)
                      return (
                        <tr key={p.id}>
                          <td><strong>{a?.brinco || '?'}</strong></td>
                          <td>{fmtData(p.data)}</td>
                          <td><Badge color="gray">{p.tipo}</Badge></td>
                          <td style={{ textAlign:'right', fontWeight:500 }}>{fmtPeso(p.peso_kg)}</td>
                          <td>
                            {podeEditarPesagensCiclo && (
                              <button className="btn-icon" onClick={() => setConfirmDel(p.id)}>
                                <i className="ti ti-trash" style={{fontSize:13}}/>
                              </button>
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
          </div>{/* end refReg */}
        </div>
      )}

      {/* ── Por Animal ── */}
      {tab === 1 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refAnimal} filename="pesagens-animal" titulo="Pesagens: Por Animal" />
          </div>
          <div ref={refAnimal}>
          <div style={{ marginBottom:14 }}>
            <label style={{ marginBottom:6 }}>Selecione o animal</label>
            <select value={selBr} onChange={e => setSelBr(e.target.value)} style={{ maxWidth:260 }}>
              <option value="">— escolha um brinco —</option>
              {[...new Set(pesagens.map(p => {
                const a = animais.find(x => x.id === p.animal_id)
                return a?.brinco
              }).filter(Boolean))].sort().map(br => (
                <option key={br} value={br}>{br}</option>
              ))}
            </select>
          </div>

          {selBr && pesAnimal.length > 0 && (
            <div>
              <div className="grid-3" style={{ marginBottom:14 }}>
                <IndexCard value={fmtPeso(ultimoPeso?.peso_kg)} label="Último peso" color="#2B6CD9"/>
                <IndexCard value={gmd ? `${gmd} kg/dia` : '—'} label="GMD" meta="≥0,80 kg/dia" ok={parseFloat(gmd)>=0.8}/>
                <IndexCard value={pesAnimal.length} label="Pesagens" color="#0C447C"/>
              </div>
              <div className="card" style={{ marginBottom:12 }}>
                <div className="card-title"><i className="ti ti-chart-line"/> Evolução de peso — Brinco {selBr}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{top:5,right:10,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6"/>
                    <XAxis dataKey="data" tick={{fontSize:10}}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip formatter={v=>`${v} kg`}/>
                    <Line type="monotone" dataKey="peso" name="Peso kg" stroke="#2B6CD9" strokeWidth={2} dot={{r:4}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-title"><i className="ti ti-list"/> Histórico de pesagens</div>
                <div className="table-wrap" style={{border:'none'}}>
                  <table>
                    <thead><tr><th>Data</th><th>Tipo</th><th style={{textAlign:'right'}}>Peso</th><th style={{textAlign:'right'}}>Variação</th></tr></thead>
                    <tbody>
                      {pesAnimal.map((p,i) => {
                        const v = i > 0 ? parseFloat(p.peso_kg) - parseFloat(pesAnimal[i-1].peso_kg) : null
                        return (
                          <tr key={p.id}>
                            <td>{fmtData(p.data)}</td>
                            <td><Badge color="gray">{p.tipo}</Badge></td>
                            <td style={{textAlign:'right',fontWeight:500}}>{fmtPeso(p.peso_kg)}</td>
                            <td style={{textAlign:'right',color:v===null?'':v>=0?'#1E55B0':'#791F1F'}}>
                              {v===null?'—':(v>=0?'+':'')+v.toFixed(1)+' kg'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {selBr && pesAnimal.length === 0 && (
            <EmptyState icon="⚖️" title="Nenhuma pesagem para este animal"/>
          )}
          {!selBr && (
            <EmptyState icon="⚖️" title="Selecione um animal" sub="Escolha um brinco para ver o histórico de pesagens e evolução de peso."/>
          )}
          </div>{/* end refAnimal */}
        </div>
      )}

      {/* ── Desempenho ── */}
      {tab === 2 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refDesemp} filename="pesagens-desempenho" titulo="Pesagens: Desempenho" />
          </div>
          <div ref={refDesemp}>
          <div className="grid-3" style={{ marginBottom:14 }}>
            <IndexCard value={mediaGMD} label="GMD médio kg/dia" meta="≥0,80" ok={parseFloat(mediaGMD)>=0.8}/>
            <IndexCard value={gmds.length} label="Animais avaliados" color="#0C447C"/>
            <IndexCard value={gmds.filter(x=>x.gmd>=0.8).length} label="Acima da meta" color="#2B6CD9"/>
          </div>
          <div className="card">
            <div className="card-title"><i className="ti ti-table"/> GMD por animal</div>
            <div className="table-wrap" style={{border:'none'}}>
              <table>
                <thead><tr><th>Brinco</th><th style={{textAlign:'right'}}>GMD (kg/dia)</th><th style={{textAlign:'right'}}>Último peso</th><th>Meta</th></tr></thead>
                <tbody>
                  {gmds.map(x => (
                    <tr key={x.brinco}>
                      <td><strong>{x.brinco}</strong></td>
                      <td style={{textAlign:'right',fontWeight:500,color:x.gmd>=0.8?'#1E55B0':'#BA7517'}}>{x.gmd.toFixed(3)}</td>
                      <td style={{textAlign:'right',color:'#6B7280'}}>{fmtPeso(x.ultPeso)}</td>
                      <td>
                        <Badge color={x.gmd>=0.8?'green':'amber'}>
                          {x.gmd>=0.8?'✓ OK':'↑ Baixo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>{/* end refDesemp */}
        </div>
      )}

      {/* ── Projeção ── */}
      {tab === 3 && (() => {
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0)

        const projecao = animaisComPeso.map(aid => {
          const ps = pesagens.filter(p => p.animal_id === aid).sort((a, b) => a.data.localeCompare(b.data))
          if (ps.length < 2) return null
          const an     = animais.find(x => x.id === aid)
          const g      = parseFloat(calcGMD(ps))
          const ultP   = parseFloat(ps[ps.length - 1]?.peso_kg || 0)
          const atingiu= ultP >= pesoAlvo

          if (atingiu) return { brinco: an?.brinco || '?', ultP, gmd: g, dias: 0, dataEst: null, atingiu: true }
          if (!g || g <= 0) return { brinco: an?.brinco || '?', ultP, gmd: g || 0, dias: null, dataEst: null, atingiu: false }

          const dias = Math.round((pesoAlvo - ultP) / g)
          const dest = new Date(hoje); dest.setDate(dest.getDate() + dias)
          return { brinco: an?.brinco || '?', ultP, gmd: g, dias, dataEst: dest.toLocaleDateString('pt-BR'), atingiu: false }
        }).filter(Boolean).sort((a, b) => {
          if (a.atingiu && !b.atingiu) return -1
          if (!a.atingiu && b.atingiu) return 1
          if (a.dias === null) return 1
          if (b.dias === null) return -1
          return a.dias - b.dias
        })

        const emProjecao = projecao.filter(x => !x.atingiu && x.gmd > 0)
        const diasMedios = emProjecao.length
          ? Math.round(emProjecao.reduce((s, x) => s + x.dias, 0) / emProjecao.length)
          : null

        return (
          <div>
            {/* Controles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: '.85rem', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>
                  Peso-alvo:
                </label>
                <input
                  type="number" min={100} max={1000} step={10}
                  value={pesoAlvo}
                  onChange={e => setPesoAlvo(parseFloat(e.target.value) || 480)}
                  style={{ width: 90, textAlign: 'right' }}
                />
                <span style={{ fontSize: '.85rem', color: '#9CA3AF' }}>kg</span>
                {emProjecao.length > 0 && (
                  <span style={{ fontSize: '.78rem', color: '#9CA3AF' }}>
                    · {emProjecao.length} animal(is) em projeção · média {diasMedios}d
                  </span>
                )}
              </div>
              <BotaoPDF contentRef={refProj} filename="projecao-peso" titulo="Pesagens: Projeção de Peso" />
            </div>

            <div ref={refProj}>
              {projecao.length === 0 ? (
                <EmptyState icon="📊" title="Nenhum animal com 2+ pesagens" sub="Registre ao menos duas pesagens por animal para calcular a projeção." />
              ) : (
                <div className="card">
                  <div className="card-title"><i className="ti ti-chart-dots-3" /> Projeção para {pesoAlvo} kg</div>
                  <div className="table-wrap" style={{ border: 'none' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Brinco</th>
                          <th style={{ textAlign: 'right' }}>Peso atual</th>
                          <th style={{ textAlign: 'right' }}>GMD (kg/d)</th>
                          <th style={{ textAlign: 'right' }}>Faltam</th>
                          <th>Data estimada</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projecao.map(x => (
                          <tr key={x.brinco}>
                            <td><strong>{x.brinco}</strong></td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtPeso(x.ultP)}</td>
                            <td style={{ textAlign: 'right', color: x.gmd >= 0.8 ? '#1E55B0' : x.gmd > 0 ? '#BA7517' : '#9CA3AF' }}>
                              {x.gmd > 0 ? x.gmd.toFixed(3) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#6B7280' }}>
                              {x.atingiu ? '—' : x.dias !== null ? `${x.dias}d` : '—'}
                            </td>
                            <td style={{ color: '#374151' }}>
                              {x.atingiu ? (
                                <span style={{ color: '#1E55B0', fontWeight: 500 }}>✓ Atingiu</span>
                              ) : x.dataEst ? x.dataEst : (
                                <span style={{ color: '#9CA3AF' }}>GMD insuficiente</span>
                              )}
                            </td>
                            <td>
                              {x.atingiu ? (
                                <span style={{ background: '#E8F0FC', color: '#1E55B0', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>✓ OK</span>
                              ) : x.dias !== null && x.dias <= 30 ? (
                                <span style={{ background: '#FEF3C7', color: '#633806', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>⚡ Próximo</span>
                              ) : x.dias !== null ? (
                                <span style={{ background: '#F9FAFB', color: '#6B7280', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>Em {x.dias}d</span>
                              ) : (
                                <span style={{ background: '#FCEBEB', color: '#791F1F', borderRadius: 6, padding: '2px 8px', fontSize: '.76rem', fontWeight: 600 }}>↓ GMD</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => excluir(confirmDel)}
        title="Excluir pesagem"
        message="Excluir esta pesagem? Esta ação não pode ser desfeita."
        danger
      />

      {/* ── Modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Registrar pesagem" width={500}>
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
          <MicButton hint='Voz: "brinco zero três — quatrocentos quilos — intermediária"' onResult={vozPes}/>
        </div>
        <div className="grid-form">
          <Field label="Animal (brinco)" required>
            <select value={form.animal_id||''} onChange={e=>setForm(p=>({...p,animal_id:e.target.value}))}>
              <option value="">— selecione —</option>
              {animais.map(a => <option key={a.id} value={a.id}>{a.brinco}</option>)}
            </select>
          </Field>
          <Field label="Data" required>
            <input type="date" value={form.data||''} onChange={e=>setForm(p=>({...p,data:e.target.value}))}/>
          </Field>
          <Field label="Tipo" required>
            <select value={form.tipo||'intermediaria'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Peso (kg)" required>
            <input type="number" step="0.1" value={form.peso_kg||''} onChange={e=>setForm(p=>({...p,peso_kg:e.target.value}))} placeholder="0,0"/>
          </Field>
        </div>
        <Field label="Observações">
          <input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional"/>
        </Field>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
