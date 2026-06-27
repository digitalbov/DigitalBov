import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { fmtData, fmtMoeda } from '../lib/helpers'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento } from '../components/UI'

const TABS = ['Inventário','Movimentar','Alertas']
const CATS = ['Medicamento','Vacina','Sêmen','Suplemento','Ração','Outro']

// Retorna dias até a validade (negativo = já venceu, null = sem validade)
const calcValidade = (validade) => {
  if (!validade) return null
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const venc = new Date(validade + 'T00:00:00')
  return Math.round((venc - hoje) / 86400000)
}

export default function Estoque() {
  const refInv     = useRef(null)
  const refMov     = useRef(null)
  const refAlertas = useRef(null)

  const [tab,     setTab]    = useState(0)
  const [itens,   setItens]  = useState([])
  const [movs,    setMovs]   = useState([])
  const [loading, setLoading]= useState(true)
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [ri, rm] = await Promise.all([db.estoque.list(), db.movEstoque.list()])
      setItens(ri.data || [])
      setMovs(rm.data  || [])
    } catch (e) {
      console.error('[Estoque] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const excluirItem = async (item) => {
    const { error } = await db.estoque.delete(item.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Item excluído.')
    loadAll()
  }

  const salvarItem = async () => {
    if (!form.item || !form.categoria || !form.unidade) {
      toast('Preencha item, categoria e unidade.', 'error'); return
    }
    setSaving(true)
    const payload = {
      item:       form.item,
      categoria:  form.categoria,
      unidade:    form.unidade,
      quantidade: parseFloat(form.quantidade) || 0,
      minimo:     parseFloat(form.minimo) || 0,
      preco_unit: parseFloat(form.preco_unit) || 0,
      validade:   form.validade || null
    }
    const { error } = form._edit && form.id
      ? await db.estoque.update(form.id, payload)
      : await db.estoque.insert(payload)
    setSaving(false)
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast(form._edit ? 'Item atualizado!' : 'Item cadastrado!')
    setModal(null); setForm({}); loadAll()
  }

  const salvarMov = async () => {
    if (!form.item_id || !form.tipo || !form.quantidade || !form.data) {
      toast('Preencha todos os campos.', 'error'); return
    }
    setSaving(true)
    const item = itens.find(i => i.id === form.item_id)
    const qt   = parseFloat(form.quantidade)
    const novaQt = form.tipo === 'E'
      ? parseFloat(item.quantidade) + qt
      : Math.max(0, parseFloat(item.quantidade) - qt)
    const [r1, r2] = await Promise.all([
      db.estoque.update(form.item_id, { quantidade: novaQt }),
      db.movEstoque.insert({
        item_id:    form.item_id,
        data:       form.data,
        tipo:       form.tipo,
        quantidade: qt,
        motivo:     form.motivo || '—'
      })
    ])
    setSaving(false)
    if (r1.error || r2.error) { toast('Erro ao salvar.', 'error'); return }
    toast(form.tipo === 'E' ? 'Entrada registrada!' : 'Saída registrada!')
    setModal(null); setForm({}); loadAll()
  }

  const vozMov = (text) => {
    const t = text.toLowerCase()
    const isEntrada = /(entrada|compra|chegou|recebeu)/i.test(t)
    setForm(p => ({ ...p, tipo: isEntrada ? 'E' : 'S' }))
    const nums = t.match(/\d[\d.,]*/g)
    if (nums) {
      const qt = parseFloat(nums[nums.length - 1].replace(',', '.'))
      if (qt > 0) setForm(p => ({ ...p, quantidade: qt }))
    }
    const match = itens.find(i => t.includes(i.item.toLowerCase().split(' ')[0].toLowerCase()))
    if (match) setForm(p => ({ ...p, item_id: match.id }))
    toast(`${isEntrada ? 'Entrada' : 'Saída'}${nums ? ` · ${nums[nums.length - 1]}` : ''} ${match ? `· ${match.item}` : ''}`)
  }

  // Alertas: estoque baixo
  const baixo = itens.filter(i => parseFloat(i.quantidade) < parseFloat(i.minimo))

  // Alertas: vencimentos (vencidos ou vencendo em ≤60 dias), ordenados por data
  const alertasValidade = itens
    .filter(i => { const d = calcValidade(i.validade); return d !== null && d <= 60 })
    .sort((a, b) => a.validade.localeCompare(b.validade))

  const totalAlertas = baixo.length + alertasValidade.length
  const catList = [...new Set(itens.map(i => i.categoria))].sort()

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div>
      <div className="tabs-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>
            {t}
            {t === 'Alertas' && totalAlertas > 0 && (
              <span style={{
                background: '#E24B4A', color: 'white',
                borderRadius: 10, padding: '0px 5px',
                fontSize: '.68rem', marginLeft: 5
              }}>{totalAlertas}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Inventário ── */}
      {tab === 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '.85rem', color: '#6B7280' }}>
              {itens.length} itens
              {baixo.length > 0 && <span style={{ color: '#791F1F', fontWeight: 500 }}> · {baixo.length} abaixo do mínimo</span>}
              {alertasValidade.length > 0 && <span style={{ color: '#633806', fontWeight: 500 }}> · {alertasValidade.length} vencendo</span>}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ categoria: 'Medicamento' }); setModal('item') }}>
                <i className="ti ti-plus" /> Novo item
              </button>
              <BotaoPDF contentRef={refInv} filename="estoque-inventario" />
            </div>
          </div>

          <div ref={refInv}>
            {itens.length === 0
              ? <EmptyState icon="📦" title="Estoque vazio" sub="Cadastre os itens do estoque."
                  action={<button className="btn btn-primary btn-sm" onClick={() => { setForm({ categoria: 'Medicamento' }); setModal('item') }}><i className="ti ti-plus" />Novo item</button>} />
              : catList.map(cat => (
                <div key={cat} className="card" style={{ marginBottom: 10 }}>
                  <div className="card-title"><i className="ti ti-tag" /> {cat}</div>
                  {itens.filter(i => i.categoria === cat).map(item => {
                    const pct  = item.minimo > 0 ? Math.min(100, Math.round(parseFloat(item.quantidade) / parseFloat(item.minimo) * 100)) : 100
                    const ok   = parseFloat(item.quantidade) >= parseFloat(item.minimo)
                    const dias = calcValidade(item.validade)
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '.88rem' }}>{item.item}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <div style={{ flex: 1, maxWidth: 120 }}>
                              <div className="progress-bg">
                                <div className="progress-fill" style={{ width: `${pct}%`, background: ok ? '#3B6D11' : '#E24B4A' }} />
                              </div>
                            </div>
                            <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>
                              {parseFloat(item.quantidade).toFixed(1)} {item.unidade} / mín {parseFloat(item.minimo).toFixed(1)}
                            </span>
                          </div>
                          {/* Validade */}
                          {dias !== null && (
                            <div style={{ marginTop: 4 }}>
                              {dias < 0
                                ? <Badge color="red">Vencido há {Math.abs(dias)} dia{Math.abs(dias) !== 1 ? 's' : ''}</Badge>
                                : dias <= 60
                                  ? <Badge color="amber">Vence em {dias} dia{dias !== 1 ? 's' : ''}</Badge>
                                  : <span style={{ fontSize: '.72rem', color: '#9CA3AF' }}>Val: {fmtData(item.validade)}</span>
                              }
                            </div>
                          )}
                        </div>
                        <Badge color={ok ? 'green' : 'red'}>{ok ? 'OK' : '⚠ Baixo'}</Badge>
                        <button className="btn btn-secondary btn-xs"
                          onClick={() => { setForm({ ...item, _edit: true }); setModal('item') }}>
                          <i className="ti ti-edit" />
                        </button>
                        <button className="btn-icon" title="Excluir item"
                          onClick={() => setConfirmDel(item)}
                          style={{ color: '#E24B4A', padding: '4px 6px' }}>
                          <i className="ti ti-trash" style={{ fontSize: 15 }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Movimentar ── */}
      {tab === 1 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '.85rem', color: '#6B7280' }}>{movs.length} movimentações</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setForm({ tipo: 'S', data: new Date().toISOString().split('T')[0] }); setModal('mov') }}>
                <i className="ti ti-plus" /> Movimentar
              </button>
              <BotaoPDF contentRef={refMov} filename="estoque-movimentacoes" />
            </div>
          </div>
          <div ref={refMov}>
            {movs.length === 0
              ? <EmptyState icon="📋" title="Nenhuma movimentação" />
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th style={{ textAlign: 'right' }}>Qtde</th><th>Motivo</th></tr></thead>
                    <tbody>
                      {movs.map(m => (
                        <tr key={m.id}>
                          <td>{fmtData(m.data)}</td>
                          <td><Badge color={m.tipo === 'E' ? 'green' : 'amber'}>{m.tipo === 'E' ? 'Entrada' : 'Saída'}</Badge></td>
                          <td style={{ fontWeight: 500 }}>{m.item?.item || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500, color: m.tipo === 'E' ? '#27500A' : '#791F1F' }}>
                            {m.tipo === 'E' ? '+' : '-'}{parseFloat(m.quantidade).toFixed(1)} {m.item?.unidade}
                          </td>
                          <td style={{ color: '#9CA3AF', fontSize: '.78rem' }}>{m.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>
        </div>
      )}

      {/* ── Alertas ── */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <BotaoPDF contentRef={refAlertas} filename="estoque-alertas" />
          </div>
          <div ref={refAlertas}>

            {/* Estoque baixo */}
            {baixo.length === 0
              ? <AlertBox type="green" title="Estoque normalizado" body="Todos os itens estão acima do estoque mínimo." />
              : baixo.map(item => (
                <AlertBox key={item.id} type="red"
                  title={`${item.item} — estoque baixo`}
                  body={`Atual: ${parseFloat(item.quantidade).toFixed(1)} ${item.unidade} · Mínimo: ${parseFloat(item.minimo).toFixed(1)} ${item.unidade} · Repor: ${(parseFloat(item.minimo) - parseFloat(item.quantidade)).toFixed(1)} ${item.unidade}`}
                />
              ))
            }

            {/* Vencimentos */}
            {alertasValidade.length > 0 ? (
              <div style={{ marginTop: baixo.length > 0 ? 16 : 0 }}>
                <div className="sl" style={{ marginBottom: 8 }}>Vencimentos</div>
                {alertasValidade.map(item => {
                  const d       = calcValidade(item.validade)
                  const vencido = d < 0
                  return (
                    <AlertBox key={`val-${item.id}`}
                      type={vencido ? 'red' : 'amber'}
                      title={`${item.item} — ${vencido ? 'produto vencido' : 'próximo do vencimento'}`}
                      body={`Validade: ${fmtData(item.validade)} · ${vencido
                        ? `Vencido há ${Math.abs(d)} dia${Math.abs(d) !== 1 ? 's' : ''}`
                        : `Vence em ${d} dia${d !== 1 ? 's' : ''}`
                      } · Quantidade em estoque: ${parseFloat(item.quantidade).toFixed(1)} ${item.unidade}`}
                    />
                  )
                })}
              </div>
            ) : (
              totalAlertas === 0 && (
                <AlertBox type="green" title="Sem vencimentos próximos" body="Nenhum item vence nos próximos 60 dias." />
              )
            )}

            {/* Status geral */}
            <div className="card" style={{ marginTop: 12 }}>
              <div className="card-title"><i className="ti ti-chart-bar" /> Status do estoque</div>
              {itens.map(item => {
                const pct = item.minimo > 0 ? Math.min(150, Math.round(parseFloat(item.quantidade) / parseFloat(item.minimo) * 100)) : 100
                const ok  = parseFloat(item.quantidade) >= parseFloat(item.minimo)
                return (
                  <div key={item.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 3 }}>
                      <span style={{ fontWeight: 500 }}>{item.item}</span>
                      <span style={{ color: ok ? '#27500A' : '#791F1F', fontWeight: 500 }}>
                        {parseFloat(item.quantidade).toFixed(1)} / {parseFloat(item.minimo).toFixed(1)} {item.unidade}
                      </span>
                    </div>
                    <div className="progress-bg">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: ok ? '#3B6D11' : '#E24B4A' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal item ── */}
      <Modal open={modal === 'item'} onClose={() => setModal(null)} title={form._edit ? 'Editar item' : 'Novo item de estoque'} width={500}>
        <div className="grid-form">
          <Field label="Nome do item" required>
            <input value={form.item || ''} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} placeholder="ex: Ivermectina 1%" />
          </Field>
          <Field label="Categoria" required>
            <select value={form.categoria || 'Medicamento'} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Unidade" required>
            <input value={form.unidade || ''} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} placeholder="ml, kg, dose, L..." />
          </Field>
          <Field label="Preço unitário (R$)">
            <input type="number" step="0.01" value={form.preco_unit || ''} onChange={e => setForm(p => ({ ...p, preco_unit: e.target.value }))} placeholder="0,00" />
          </Field>
          <Field label="Quantidade inicial">
            <input type="number" step="0.1" value={form.quantidade || ''} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" />
          </Field>
          <Field label="Estoque mínimo">
            <input type="number" step="0.1" value={form.minimo || ''} onChange={e => setForm(p => ({ ...p, minimo: e.target.value }))} placeholder="0" />
          </Field>
        </div>
        <Field label="Validade (opcional)">
          <input type="date" value={form.validade || ''} onChange={e => setForm(p => ({ ...p, validade: e.target.value }))} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvarItem} disabled={saving}>
            {saving ? 'Salvando...' : <><i className="ti ti-check" />{form._edit ? 'Salvar' : 'Cadastrar'}</>}
          </button>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
        </div>
      </Modal>

      {/* ── Confirm excluir ── */}
      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => excluirItem(confirmDel)}
        title="Excluir item do estoque"
        message={`Excluir "${confirmDel?.item}"? Esta ação não pode ser desfeita.`}
        danger
      />

      {/* ── Modal movimentação ── */}
      <Modal open={modal === 'mov'} onClose={() => setModal(null)} title="Movimentar estoque" width={480}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <MicButton hint='Voz: "saída — Ivermectina — oitenta mililitros — vermifugação"' onResult={vozMov} />
        </div>
        <div style={{ fontSize: '.78rem', background: '#EEEDFE', color: '#3C3489', padding: '7px 10px', borderRadius: 8, marginBottom: 12 }}>
          <i className="ti ti-microphone" style={{ fontSize: 12 }} /> Voz: <b>"Entrada — Sal Mineral — cem quilos — compra"</b>
        </div>
        <div className="grid-form">
          <Field label="Tipo">
            <select value={form.tipo || 'S'} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              <option value="S">Saída (uso)</option>
              <option value="E">Entrada (compra)</option>
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={form.data || ''} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
          </Field>
          <Field label="Item" required>
            <select value={form.item_id || ''} onChange={e => setForm(p => ({ ...p, item_id: e.target.value }))}>
              <option value="">— selecione —</option>
              {itens.map(i => <option key={i.id} value={i.id}>{i.item} ({parseFloat(i.quantidade).toFixed(1)} {i.unidade})</option>)}
            </select>
          </Field>
          <Field label="Quantidade" required>
            <input type="number" step="0.1" value={form.quantidade || ''} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" />
          </Field>
        </div>
        <Field label="Motivo">
          <input value={form.motivo || ''} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} placeholder="ex: Vermifugação geral" />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvarMov} disabled={saving}>
            {saving ? 'Salvando...' : <><i className="ti ti-check" />Registrar</>}
          </button>
          <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
