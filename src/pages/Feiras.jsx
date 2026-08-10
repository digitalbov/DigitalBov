import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useSubmitGuard } from '../lib/useSubmitGuard'
import { fmtData, algumErro, calcCategoriaRebanho, catCor, nomeBaseFeira, resolverFeiraDigitada, statusFeiraParticipacao } from '../lib/helpers'
import { hojeISO } from '../lib/hoje'
import { Loading, ErroCarregamento, EmptyState, Modal, Field, Badge, Confirm, toast, BotaoPDF } from '../components/UI'

const STATUS_COR = {
  agendada:              { bg: '#E8F0FC', text: '#1E55B0' },
  aguardando_resultado:  { bg: '#FAEEDA', text: '#633806' },
  premiada:              { bg: '#EAF7EE', text: '#1F7A3F' },
}

// Bloco de confirmação AO VIVO — mesmo mecanismo de ResolucaoTouro
// (Reprodutivo.jsx): sempre visível, sempre recalculado do nome digitado E
// da data preenchida (resolverFeiraDigitada, helpers.js), nunca de um id
// capturado à parte. `r` já vem calculado do componente pai — precisa da
// mesma leitura pra decidir quais campos mostrar, não dá pra calcular de
// novo aqui sem arriscar divergir.
//
// Nunca usa a palavra "edição" — só fala em feira e em ano/data, que é como
// o usuário já pensa nisso (ver comentário de resolverFeiraDigitada).
function ResolucaoFeira({ r, onEscolherAproximada }) {
  if (!r) return null
  const base = { fontSize: '.75rem', marginTop: 5, padding: '5px 9px', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 3 }

  if (r.feira) {
    return (
      <div style={{ ...base, background: '#F3E8FF', color: '#5B2A9E' }}>
        {r.ano == null && (
          <span>
            <i className="ti ti-link" style={{ fontSize: 11 }} /> Feira já cadastrada: <strong>{r.feira.nome}</strong>.
            Informe a data para conferir se este ano já tem registro.
            {r.ultimaEdicao ? ` (última participação registrada foi em ${r.ultimaEdicao.ano}.)` : ''}
          </span>
        )}
        {r.ano != null && r.edicao && (
          <span>
            <i className="ti ti-link" style={{ fontSize: 11 }} /> <strong>{r.feira.nome} — {r.ano}</strong> já cadastrada
            {r.edicao.local ? ` — ${r.edicao.local}` : ''}
            {r.edicao.data_inicio ? ` · ${fmtData(r.edicao.data_inicio)}${r.edicao.data_fim && r.edicao.data_fim !== r.edicao.data_inicio ? ' a ' + fmtData(r.edicao.data_fim) : ''}` : ''}
          </span>
        )}
        {r.ano != null && !r.edicao && (
          <span>
            <i className="ti ti-calendar-event" style={{ fontSize: 11 }} /> <strong>{r.feira.nome} — {r.ano}</strong> ainda não tem registro
            {r.ultimaEdicao ? ` (a última participação registrada foi em ${r.ultimaEdicao.ano})` : ''} — confira local e data de término abaixo.
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ ...base, background: '#F9FAFB', color: '#6B7280' }}>
      <span>
        <i className="ti ti-circle-plus" style={{ fontSize: 11 }} /> Será criada uma feira nova: <strong>{r.nomeBase}</strong>
        {r.ano != null ? ` — participação em ${r.ano}` : ''}.
      </span>
      {r.aproximadas.length > 0 && (
        <span>
          Parecido com: {r.aproximadas.map((f, i) => (
            <span key={f.id}>
              {i > 0 && ', '}
              <button type="button" onClick={() => onEscolherAproximada(f.nome)}
                style={{ background: 'none', border: 'none', padding: 0, color: '#2B6CD9', textDecoration: 'underline', cursor: 'pointer', fontSize: '.75rem' }}>
                {f.nome}
              </button>
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

export default function Feiras() {
  const refLista = useRef(null)
  const navigate = useNavigate()
  const { podeEditar } = usePermissoes()
  const podeEditarFeiras = podeEditar('feiras')
  const guard = useSubmitGuard()
  const hoje = hojeISO()

  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [participacoes, setParticipacoes] = useState([])
  const [feiras,    setFeiras]    = useState([])
  const [edicoes,   setEdicoes]   = useState([])
  const [animais,   setAnimais]   = useState([])

  const [modal,   setModal]   = useState(false)
  const [editando, setEditando] = useState(null)
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const [editandoEdicao, setEditandoEdicao] = useState(false)
  const [savingEdicao,   setSavingEdicao]   = useState(false)
  const [confirmExcluir, setConfirmExcluir] = useState(null)

  const [filtCategoria, setFiltCategoria] = useState('')
  const [filtProp,      setFiltProp]      = useState('')
  const [filtLote,      setFiltLote]      = useState('')
  const [filtFeira,     setFiltFeira]     = useState('')
  const [filtAno,       setFiltAno]       = useState('')
  const [busca,         setBusca]         = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.feiraParticipacoes.listPorFazenda(),
        db.feiras.listPorFazenda(),
        db.feiraEdicoes.listPorFazenda(),
        db.animais.list({ situacao: 'ativo' }),
      ])
      if (algumErro('[Feiras]', results)) { setLoadError(true); return }
      const [rPart, rFeiras, rEdicoes, rAnimais] = results
      setParticipacoes(rPart.data || [])
      setFeiras(rFeiras.data || [])
      setEdicoes(rEdicoes.data || [])
      setAnimais(rAnimais.data || [])
    } catch (e) {
      console.error('[Feiras] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const abrirNova = () => {
    setEditando(null)
    setForm({})
    setEditandoEdicao(false)
    setModal(true)
  }

  const abrirEdicao = (p) => {
    setEditando(p)
    setForm({
      animal_id: p.animal_id,
      feira_nome: p.edicao?.feira?.nome || '',
      feira_local: p.edicao?.local || '',
      feira_data_inicio: p.edicao?.data_inicio || '',
      feira_data_fim: p.edicao?.data_fim || '',
      categoria_julgamento: p.categoria_julgamento || '',
      colocacao: p.colocacao || '',
      titulo: p.titulo || '',
      julgador: p.julgador || '',
      raca_associacao: p.raca_associacao || '',
      observacoes: p.observacoes || '',
    })
    setEditandoEdicao(false)
    setModal(true)
  }

  // Recalculado a cada render, igual o resto — nunca um valor capturado à
  // parte. Sem fallback pra "hoje": o ano só existe quando o usuário de
  // fato preencheu a Data de início (ver resolverFeiraDigitada) — chutar um
  // ano quando o campo está vazio foi a causa dos dois bugs anteriores.
  const resolucaoFeiraAtual = resolverFeiraDigitada(form.feira_nome, feiras, edicoes, form.feira_data_inicio || null)

  // Pré-preenche só o LOCAL (nunca datas — uma data de outro ano copiada pra
  // cá seria simplesmente errada) com o da participação mais recente desta
  // feira, assim que a resolução detecta que vai ser uma feira/ano nova de
  // verdade. Só na TRANSIÇÃO pra essa combinação nome-base+ano (dependência
  // é a chave, não o objeto) — nunca sobrescreve o que o usuário já tiver
  // digitado depois. Como "nova" aqui É SEMPRE um INSERT (nunca hipótese de
  // conflito com uma edição existente — find-then-insert, ver
  // db.feiraEdicoes.findOrCreate), não existe mais o risco de auto-anular o
  // próprio aviso que existia na versão anterior desta tela.
  const prefillKey = (resolucaoFeiraAtual && resolucaoFeiraAtual.ano != null && !resolucaoFeiraAtual.edicao && resolucaoFeiraAtual.ultimaEdicao)
    ? `${resolucaoFeiraAtual.nomeBase}::${resolucaoFeiraAtual.ano}`
    : null
  useEffect(() => {
    if (!prefillKey) return
    setForm(p => ({ ...p, feira_local: resolucaoFeiraAtual.ultimaEdicao.local || '' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey])

  const salvar = () => guard(async () => {
    if (!podeEditarFeiras) return
    if (!form.animal_id) { toast('Selecione o animal.', 'error'); return }
    if (!form.feira_nome?.trim()) { toast('Informe o nome da feira.', 'error'); return }
    if (!form.feira_data_inicio) { toast('Informe a data da feira.', 'error'); return }
    setSaving(true)
    // Resolve/cria a feira (só nome) e a participação nesse ano — mesmo
    // mecanismo find-then-insert de tourosExternos/db.feiras/db.feiraEdicoes
    // (nunca upsert: salvar aqui NUNCA altera um cadastro existente, nem o
    // nome cosmético — só o botão "Corrigir" explícito faz isso). Falha em
    // qualquer uma das duas etapas aborta tudo, nunca grava a participação
    // com um vínculo nulo em silêncio.
    const nomeBase = nomeBaseFeira(form.feira_nome.trim())
    const { data: feira, error: errFeira } = await db.feiras.findOrCreate(nomeBase)
    if (errFeira) {
      setSaving(false)
      toast(`Erro ao vincular a feira "${form.feira_nome}": ${errFeira.message}`, 'error')
      return
    }
    const { data: edicao, error: errEdicao } = await db.feiraEdicoes.findOrCreate({
      feiraId:    feira.id,
      dataInicio: form.feira_data_inicio,
      dataFim:    form.feira_data_fim?.trim() || null,
      local:      form.feira_local?.trim() || null,
    })
    if (errEdicao) {
      setSaving(false)
      toast(`Erro ao vincular a data desta feira: ${errEdicao.message}`, 'error')
      return
    }
    const payload = {
      edicao_id:             edicao.id,
      animal_id:             form.animal_id,
      categoria_julgamento:  form.categoria_julgamento?.trim() || null,
      colocacao:             form.colocacao?.trim() || null,
      titulo:                form.titulo?.trim() || null,
      julgador:              form.julgador?.trim() || null,
      raca_associacao:       form.raca_associacao?.trim() || null,
      observacoes:           form.observacoes?.trim() || null,
    }
    const { error } = editando
      ? await db.feiraParticipacoes.update(editando.id, payload)
      : await db.feiraParticipacoes.insert(payload)
    setSaving(false)
    if (error) { toast('Erro ao salvar participação: ' + error.message, 'error'); return }
    toast(editando ? 'Participação atualizada!' : 'Participação registrada!')
    setModal(false); setForm({}); setEditando(null)
    loadAll()
  })

  // Único caminho que ALTERA uma feira/ano já cadastrado — atrás do botão
  // "Corrigir" explícito, nunca do Salvar da participação (ver salvar acima).
  const salvarCorrecaoFeira = () => guard(async () => {
    if (!resolucaoFeiraAtual?.edicao) return
    setSavingEdicao(true)
    const { error } = await db.feiraEdicoes.update(resolucaoFeiraAtual.edicao.id, {
      local:       form.feira_local?.trim() || null,
      data_inicio: form.feira_data_inicio || null,
      data_fim:    form.feira_data_fim || null,
    })
    setSavingEdicao(false)
    if (error) { toast('Erro ao atualizar dados da feira: ' + error.message, 'error'); return }
    toast('Dados da feira atualizados!')
    setEditandoEdicao(false)
    const { data } = await db.feiraEdicoes.listPorFazenda()
    setEdicoes(data || [])
  }, 'feira')

  const excluir = async (p) => {
    if (!podeEditarFeiras) return
    const { error } = await db.feiraParticipacoes.delete(p.id)
    setConfirmExcluir(null)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Participação removida.')
    loadAll()
  }

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  const categoriasDisponiveis = [...new Set(
    participacoes.map(p => p.animal && calcCategoriaRebanho(p.animal.data_nascimento, p.animal.sexo, p.animal.sit_reprodutiva, p.animal.is_touro)).filter(Boolean)
  )].sort()
  const propriedadesMap = new Map()
  participacoes.forEach(p => { if (p.animal?.proprietario_id && p.animal?.proprietario?.nome) propriedadesMap.set(p.animal.proprietario_id, p.animal.proprietario.nome) })
  const proprietariosDisponiveis = [...propriedadesMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const lotesMap = new Map()
  participacoes.forEach(p => { if (p.animal?.lote_id && p.animal?.lote?.nome) lotesMap.set(p.animal.lote_id, p.animal.lote.nome) })
  const lotesDisponiveis = [...lotesMap.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const feirasDisponiveis = [...feiras].sort((a, b) => a.nome.localeCompare(b.nome))
  // Anos distintos entre as edições já cadastradas — filtro SEPARADO do de
  // feira (nunca misturado num único seletor "feira 2028"), ordenado do
  // mais recente pro mais antigo.
  const anosDisponiveis = [...new Set(edicoes.map(e => e.ano))].sort((a, b) => b - a)

  // Filtro por feira agrupa TODOS os anos daquela feira — compara pelo id
  // da feira-base (p.edicao.feira.id), não pelo id da edição/ocorrência.
  const filtradas = participacoes
    .filter(p => !filtCategoria || (p.animal && calcCategoriaRebanho(p.animal.data_nascimento, p.animal.sexo, p.animal.sit_reprodutiva, p.animal.is_touro) === filtCategoria))
    .filter(p => !filtProp || p.animal?.proprietario_id === filtProp)
    .filter(p => !filtLote || p.animal?.lote_id === filtLote)
    .filter(p => !filtFeira || p.edicao?.feira?.id === filtFeira)
    .filter(p => !filtAno || String(p.edicao?.ano) === filtAno)
    .filter(p => !busca || p.animal?.brinco?.toLowerCase().includes(busca.toLowerCase()) || p.edicao?.feira?.nome?.toLowerCase().includes(busca.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: '.85rem', color: '#6B7280' }}>{participacoes.length} participações registradas</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <BotaoPDF contentRef={refLista} filename="feiras-premiacoes" titulo="Feiras e Premiações" />
          {podeEditarFeiras && (
            <button className="btn btn-primary btn-sm" onClick={abrirNova}>
              <i className="ti ti-plus" /> Nova participação
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1, minWidth: 160 }} value={busca}
          onChange={e => setBusca(e.target.value)} placeholder="Buscar por brinco ou feira..." />
        <select className="input" style={{ flex: 1, minWidth: 160 }} value={filtCategoria} onChange={e => setFiltCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: 160 }} value={filtProp} onChange={e => setFiltProp(e.target.value)}>
          <option value="">Todos os proprietários</option>
          {proprietariosDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: 160 }} value={filtLote} onChange={e => setFiltLote(e.target.value)}>
          <option value="">Todos os lotes</option>
          {lotesDisponiveis.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: 160 }} value={filtFeira} onChange={e => setFiltFeira(e.target.value)}>
          <option value="">Todas as feiras</option>
          {feirasDisponiveis.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <select className="input" style={{ flex: 1, minWidth: 120 }} value={filtAno} onChange={e => setFiltAno(e.target.value)}>
          <option value="">Todos os anos</option>
          {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <div ref={refLista}>
        {filtradas.length === 0 ? (
          <EmptyState icon="🏆" title="Nenhuma participação encontrada"
            sub={participacoes.length === 0 ? 'Registre a participação de um animal numa feira, ou agende uma futura.' : 'Nenhum resultado para esses filtros.'}
            action={podeEditarFeiras && participacoes.length === 0 ? <button className="btn btn-primary btn-sm" onClick={abrirNova}><i className="ti ti-plus" />Nova participação</button> : undefined} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Feira</th><th>Brinco</th><th>Proprietário</th><th>Categoria</th>
                  <th>Julgamento</th><th>Resultado</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(p => {
                  const cat = p.animal ? calcCategoriaRebanho(p.animal.data_nascimento, p.animal.sexo, p.animal.sit_reprodutiva, p.animal.is_touro) : null
                  const cc  = cat ? (catCor[cat] || catCor.Vaca) : null
                  const st  = statusFeiraParticipacao(p, hoje)
                  const sc  = STATUS_COR[st.tipo]
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {p.edicao?.feira?.nome || '—'}{p.edicao?.ano ? ` — ${p.edicao.ano}` : ''}
                        </div>
                        {p.edicao?.data_inicio && <div style={{ fontSize: '.72rem', color: '#9CA3AF' }}>{fmtData(p.edicao.data_inicio)}</div>}
                      </td>
                      <td>
                        {p.animal?.id ? (
                          <button onClick={() => navigate('/animais', { state: { abrirAnimalId: p.animal.id } })}
                            style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#2B6CD9', textDecoration: 'underline', cursor: 'pointer' }}>
                            {p.animal.brinco}
                          </button>
                        ) : <strong>?</strong>}
                      </td>
                      <td style={{ fontSize: '.82rem', color: '#374151' }}>{p.animal?.proprietario?.nome || '—'}</td>
                      <td>{cc && <Badge style={{ background: cc.bg, color: cc.text }}>{cat}</Badge>}</td>
                      <td style={{ fontSize: '.82rem' }}>{p.categoria_julgamento || '—'}</td>
                      <td style={{ fontSize: '.82rem' }}>
                        {p.colocacao || p.titulo
                          ? [p.colocacao, p.titulo].filter(Boolean).join(' — ')
                          : '—'}
                      </td>
                      <td><Badge style={{ background: sc.bg, color: sc.text }}>{st.label}</Badge></td>
                      <td>
                        {podeEditarFeiras && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" onClick={() => abrirEdicao(p)} title="Editar">
                              <i className="ti ti-edit" style={{ fontSize: 13 }} />
                            </button>
                            <button className="btn-icon" onClick={() => setConfirmExcluir(p)} title="Excluir">
                              <i className="ti ti-trash" style={{ fontSize: 13 }} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirm
        open={!!confirmExcluir}
        onClose={() => setConfirmExcluir(null)}
        onConfirm={() => excluir(confirmExcluir)}
        title="Excluir participação"
        message={`Excluir a participação de ${confirmExcluir?.animal?.brinco || ''} em "${confirmExcluir?.edicao?.feira?.nome || ''}"? Esta ação não pode ser desfeita.`}
        danger
      />

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar participação' : 'Nova participação'} width={560}>
        <div className="grid-form">
          <Field label="Animal (brinco)" required>
            <select value={form.animal_id || ''} onChange={e => setForm(p => ({ ...p, animal_id: e.target.value }))}>
              <option value="">— selecione —</option>
              {[...animais].sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true })).map(a => (
                <option key={a.id} value={a.id}>{a.brinco}{a.nome ? ` — ${a.nome}` : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="Categoria de julgamento" hint="Categoria do ringue (ex.: novilha júnior, touro sênior) — não é a categoria zootécnica do sistema.">
            <input value={form.categoria_julgamento || ''} onChange={e => setForm(p => ({ ...p, categoria_julgamento: e.target.value }))} placeholder="ex.: Novilha Júnior" />
          </Field>
        </div>

        <div className="grid-form">
          <Field label="Feira" required hint="Digite o nome — se já existir nesta fazenda, é reaproveitada. Não precisa incluir o ano: a data ao lado já diz de qual ano é esta participação.">
            <input value={form.feira_nome || ''} onChange={e => setForm(p => ({ ...p, feira_nome: e.target.value }))} placeholder="ex.: Expofeira" />
          </Field>
          <Field label="Data de início" required>
            <input type="date" value={form.feira_data_inicio || ''} onChange={e => setForm(p => ({ ...p, feira_data_inicio: e.target.value }))} />
          </Field>
        </div>
        <ResolucaoFeira r={resolucaoFeiraAtual} onEscolherAproximada={nome => setForm(p => ({ ...p, feira_nome: nome }))} />

        {resolucaoFeiraAtual?.ano != null && !resolucaoFeiraAtual.edicao && (
          <div className="grid-form" style={{ marginTop: 8 }}>
            <Field label="Local da feira">
              <input value={form.feira_local || ''} onChange={e => setForm(p => ({ ...p, feira_local: e.target.value }))} placeholder="opcional" />
            </Field>
            <Field label="Data de término">
              <input type="date" value={form.feira_data_fim || ''} onChange={e => setForm(p => ({ ...p, feira_data_fim: e.target.value }))} />
            </Field>
          </div>
        )}

        {resolucaoFeiraAtual?.ano != null && resolucaoFeiraAtual.edicao && (
          <div style={{ marginTop: 6 }}>
            {!editandoEdicao ? (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
                setForm(p => ({ ...p, feira_local: resolucaoFeiraAtual.edicao.local || '', feira_data_inicio: resolucaoFeiraAtual.edicao.data_inicio || '', feira_data_fim: resolucaoFeiraAtual.edicao.data_fim || '' }))
                setEditandoEdicao(true)
              }}>
                <i className="ti ti-edit" /> Corrigir local/datas desta feira
              </button>
            ) : (
              <div style={{ padding: 10, background: '#F9FAFB', borderRadius: 8, marginTop: 6 }}>
                <div className="grid-form">
                  <Field label="Local da feira">
                    <input value={form.feira_local || ''} onChange={e => setForm(p => ({ ...p, feira_local: e.target.value }))} placeholder="opcional" />
                  </Field>
                  <Field label="Data de início">
                    <input type="date" value={form.feira_data_inicio || ''} onChange={e => setForm(p => ({ ...p, feira_data_inicio: e.target.value }))} />
                  </Field>
                  <Field label="Data de término">
                    <input type="date" value={form.feira_data_fim || ''} onChange={e => setForm(p => ({ ...p, feira_data_fim: e.target.value }))} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={salvarCorrecaoFeira} disabled={savingEdicao}>
                    {savingEdicao ? 'Salvando...' : 'Salvar dados da feira'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => setEditandoEdicao(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: '.72rem', color: '#9CA3AF', marginTop: 10, marginBottom: 4 }}>
          Deixe "Colocação" e "Título" em branco para agendar (aparece no Calendário) — preencha quando o resultado sair.
        </div>

        <div className="grid-form">
          <Field label="Colocação" hint="ex.: 1º lugar, Reservado">
            <input value={form.colocacao || ''} onChange={e => setForm(p => ({ ...p, colocacao: e.target.value }))} placeholder="opcional" />
          </Field>
          <Field label="Título" hint="ex.: Grande Campeão">
            <input value={form.titulo || ''} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="opcional" />
          </Field>
          <Field label="Julgador">
            <input value={form.julgador || ''} onChange={e => setForm(p => ({ ...p, julgador: e.target.value }))} placeholder="opcional" />
          </Field>
          <Field label="Raça / associação">
            <input value={form.raca_associacao || ''} onChange={e => setForm(p => ({ ...p, raca_associacao: e.target.value }))} placeholder="opcional" />
          </Field>
        </div>
        <Field label="Observações">
          <input value={form.observacoes || ''} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} placeholder="opcional" />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : <><i className="ti ti-check" />Salvar</>}</button>
          <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
