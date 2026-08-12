import { useState, useEffect, useRef, useMemo } from 'react'
import { db, supabase } from '../lib/supabase'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { usePermissoes } from '../lib/PermissoesContext'
import { Loading, ErroCarregamento, Modal, Field, toast, Badge, Confirm, AlertBox } from '../components/UI'
import { fmtData, fmtMoeda, algumErro, numeroPositivo, capitalizarPrimeira, capitalizarNome } from '../lib/helpers'
import { hojeISO } from '../lib/hoje'
import { useSubmitGuard } from '../lib/useSubmitGuard'
import { carregarLogoFazenda } from '../lib/pdfWriter'
import { gerarPDFPrestacaoContas, gerarPDFAtestado } from '../lib/veterinarioPdf'
import { TIPOS_ATESTADO, CAMPOS_DOCUMENTO_POR_TIPO, CAMPOS_ANIMAL_POR_TIPO, linhaAnimalVazia, nomeArquivoAtestado, descricaoPorAnimal } from '../lib/veterinarioAtestados'
import { gerarBackupVeterinarioPayload } from '../lib/exportarBackupVeterinario'
import { baixarBackupJSON } from '../lib/exportarBackup'
import RestaurarBackupVeterinario from '../components/RestaurarBackupVeterinario'

const TABS = ['Configuração', 'Financeiro', 'Clientes', 'Documentos', 'Backup']
// Uma sub-aba por tipo em TIPOS_ATESTADO + Prestação de Contas + Histórico —
// um 5º tipo aprovado em veterinarioAtestados.js já aparece aqui sozinho,
// sem tocar este arquivo.
const DOC_ABAS = ['Prestação de Contas', ...TIPOS_ATESTADO.map(t => t.label), 'Histórico de Atestados']

const slug = (s) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '')

export default function Veterinario() {
  const { contaAtual } = useConta()
  const { fazendas } = useFazenda()
  const { podeEditar } = usePermissoes()
  const podeEditarVet = podeEditar('veterinario')
  const guard = useSubmitGuard()

  const [tab, setTab] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [config, setConfig] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [clientes, setClientes] = useState([])
  const [ciclos, setCiclos] = useState([])
  const [lancamentos, setLancamentos] = useState([])
  const [atestados, setAtestados] = useState([])

  const syncFazendasFeitoRef = useRef(false)

  const loadAll = async () => {
    setLoading(true); setLoadError(false)
    try {
      const results = await Promise.all([
        db.veterinario.config.get(),
        db.veterinario.categorias.list(),
        db.veterinario.clientes.list(),
        db.veterinario.ciclos.list(),
        db.veterinario.lancamentos.listAll(),
        db.veterinario.atestados.list(),
      ])
      if (algumErro('[Veterinario]', results)) { setLoadError(true); return }
      const [rc, rcat, rcli, rci, rl, rat] = results
      setConfig(rc.data || null)
      setCategorias(rcat.data || [])
      setClientes(rcli.data || [])
      setCiclos(rci.data || [])
      setLancamentos(rl.data || [])
      setAtestados(rat.data || [])
    } catch (e) {
      console.error('[Veterinario] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Sincronização fazenda -> cliente (Item 2 do plano): roda uma vez ao abrir
  // a aba Clientes, nunca de novo sozinha depois — só insere fazenda que
  // ainda não tem cliente correspondente (unique parcial no banco impede
  // duplicar mesmo se rodasse 2x). Nome já existente NUNCA é sobrescrito
  // aqui — só via botão manual "sincronizar nome" (ver AbaClientes).
  useEffect(() => {
    if (tab !== 2 || syncFazendasFeitoRef.current || loading || !contaAtual) return
    syncFazendasFeitoRef.current = true
    const jaVinculadas = new Set(clientes.filter(c => c.fazenda_id).map(c => c.fazenda_id))
    const faltando = fazendas.filter(f => !jaVinculadas.has(f.id))
    if (faltando.length === 0) return
    const linhas = faltando.map(f => ({ conta_id: contaAtual.id, fazenda_id: f.id, nome: f.nome }))
    db.veterinario.clientes.insertVarios(linhas).then(({ error }) => {
      if (error) { console.error('[Veterinario] erro ao sincronizar fazendas como clientes:', error); return }
      db.veterinario.clientes.list().then(({ data }) => setClientes(data || []))
    })
  }, [tab, loading, clientes, fazendas, contaAtual])

  if (loading) return <Loading text="Carregando módulo Veterinário..." />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div>
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <AbaConfiguracao
          config={config} setConfig={setConfig}
          contaAtual={contaAtual} podeEditarVet={podeEditarVet} guard={guard}
        />
      )}
      {tab === 1 && (
        <AbaFinanceiro
          contaAtual={contaAtual} podeEditarVet={podeEditarVet} guard={guard}
          categorias={categorias} setCategorias={setCategorias}
          clientes={clientes}
          ciclos={ciclos} setCiclos={setCiclos}
          lancamentos={lancamentos} setLancamentos={setLancamentos}
        />
      )}
      {tab === 2 && (
        <AbaClientes
          contaAtual={contaAtual} podeEditarVet={podeEditarVet} guard={guard}
          clientes={clientes} setClientes={setClientes} fazendas={fazendas}
        />
      )}
      {tab === 3 && (
        <AbaDocumentos
          contaAtual={contaAtual} podeEditarVet={podeEditarVet} guard={guard}
          config={config} clientes={clientes} lancamentos={lancamentos}
          atestados={atestados} setAtestados={setAtestados}
        />
      )}
      {tab === 4 && <AbaBackup contaAtual={contaAtual} />}
    </div>
  )
}

// ── Aba Backup ───────────────────────────────────────────────────────────
// Backup CONTA-scoped, mecanismo separado do "Backup e Dados" do menu
// principal (que é por FAZENDA — ver Backup.jsx). De propósito não fica
// junto daquela tela: os dois nunca deveriam se misturar visualmente, o
// escopo de cada um é diferente (ver P2 aprovado / SecaoBackup.jsx no
// manual). Só dono/admin da conta vê esta aba — mesmo critério de acesso da
// RPC de restauração (restaurar_backup_conta_veterinario), não
// pode_editar_modulo('veterinario') como o resto do módulo: restaurar é
// mais privilegiado que editar.
function AbaBackup({ contaAtual }) {
  const { ehAdmin } = usePermissoes()
  const [loading, setLoading] = useState(false)
  const [ts, setTs] = useState('')

  const gerarBackup = async () => {
    if (!contaAtual?.id) { toast('Aguarde a conta carregar e tente novamente.', 'error'); return }
    setLoading(true)
    try {
      const payload = await gerarBackupVeterinarioPayload({ contaId: contaAtual.id, contaNome: contaAtual.nome })
      baixarBackupJSON(payload, `backup-veterinario-${(contaAtual.nome || 'conta').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`)
      setTs(new Date().toLocaleString('pt-BR'))
      toast(`Backup gerado! ${payload.dados.veterinario_clientes.length} clientes · ${payload.dados.veterinario_lancamentos.length} lançamentos · ${payload.dados.veterinario_atestados.length} atestados`)
    } catch (e) {
      toast('Erro ao gerar backup: ' + e.message, 'error')
    }
    setLoading(false)
  }

  if (!ehAdmin) {
    return <AlertBox type="amber" icon="ti-lock" body="Só administradores da conta podem baixar ou restaurar o backup do módulo Veterinário." />
  }

  return (
    <div>
      <AlertBox type="amber" icon="ti-info-circle"
        title="Este backup é separado do backup de fazenda"
        body='Cobre só o módulo Veterinário (configuração, categorias, clientes, ciclos, lançamentos e atestados) — dado de CONTA, compartilhado entre todas as fazendas. NÃO cobre animais, financeiro de fazenda, reprodutivo, estoque ou sanidade: isso está em "Backup e Dados" no menu principal, um mecanismo à parte.' />

      <div className="card" style={{ borderTop: '3px solid #2B6CD9', maxWidth: 420, marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 6 }}>Backup do Veterinário (.json)</div>
        <div style={{ fontSize: '.77rem', color: '#6B7280', marginBottom: 14 }}>
          Exporta configuração, categorias, clientes, ciclos, lançamentos e atestados desta conta em um arquivo estruturado e restaurável.
        </div>
        <button className="btn btn-primary btn-sm" onClick={gerarBackup} disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
          {loading ? 'Gerando...' : <><i className="ti ti-download" /> Baixar backup</>}
        </button>
        {ts && (
          <div style={{ fontSize: '.68rem', color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
            <i className="ti ti-check" style={{ fontSize: 11 }} /> Gerado em: {ts}
          </div>
        )}
      </div>

      <RestaurarBackupVeterinario />
    </div>
  )
}

// ── Aba Configuração ─────────────────────────────────────────────────────
function AbaConfiguracao({ config, setConfig, contaAtual, podeEditarVet, guard }) {
  const [form, setForm] = useState(config || {})
  const [salvando, setSalvando] = useState(false)
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(() => { setForm(config || {}) }, [config])

  const campo = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const salvar = () => guard(async () => {
    if (!podeEditarVet || !contaAtual) return
    setSalvando(true)
    const { data, error } = await db.veterinario.config.upsert({
      conta_id: contaAtual.id,
      nome: capitalizarNome(form.nome || '') || null,
      crv: form.crv || null,
      slogan: form.slogan || null,
      telefone: form.telefone || null,
      email: form.email || null,
      banco: form.banco || null,
      agencia: form.agencia || null,
      conta_bancaria: form.conta_bancaria || null,
      pix: form.pix || null,
      logo_url: config?.logo_url || null,
    })
    setSalvando(false)
    if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return }
    setConfig(data)
    toast('Configuração salva!')
  })

  // Upload de logo: mesmo padrão de Dashboard.jsx::enviarFoto (bucket
  // dedicado, path por conta, upsert:true, cache-bust na URL) — bucket
  // 'veterinario' precisa existir no Storage do Supabase (não faz parte do
  // schema SQL desta rodada, é infraestrutura de Storage — avisar o usuário).
  const enviarLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !contaAtual || !podeEditarVet) return
    setEnviandoLogo(true)
    try {
      const ext = file.name.split('.').pop()
      const caminho = `${contaAtual.id}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from('veterinario').upload(caminho, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('veterinario').getPublicUrl(caminho)
      const urlComCache = pub.publicUrl + '?t=' + Date.now()
      const { data, error } = await db.veterinario.config.upsert({ ...form, conta_id: contaAtual.id, logo_url: urlComCache })
      if (error) throw error
      setConfig(data)
      toast('Logo atualizada!')
    } catch (err) {
      toast('Erro ao enviar logo: ' + (err.message || err), 'error')
    }
    setEnviandoLogo(false)
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={enviarLogo} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
        {config?.logo_url ? (
          <img src={config.logo_url} alt="Logo do veterinário"
            onClick={() => podeEditarVet && fileInputRef.current?.click()}
            style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 8, border: '1px solid #E5E7EB',
              cursor: podeEditarVet ? 'pointer' : 'default', background: '#fff' }} />
        ) : (
          <div onClick={() => podeEditarVet && fileInputRef.current?.click()}
            style={{ width: 96, height: 96, borderRadius: 8, border: '2px dashed #D1D5DB',
              display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              fontSize: '.7rem', color: '#9CA3AF', padding: 6, cursor: podeEditarVet ? 'pointer' : 'default' }}>
            {enviandoLogo ? 'Enviando...' : 'Coloque seu logo aqui'}
          </div>
        )}
        <div style={{ fontSize: '.78rem', color: '#6B7280' }}>
          Logo usada no cabeçalho dos documentos gerados (prestação de contas e atestados), em proporção original — não é recortada.
        </div>
      </div>

      <Field label="Nome do veterinário"><input value={form.nome || ''} onChange={campo('nome')} disabled={!podeEditarVet} /></Field>
      <Field label="CRV"><input value={form.crv || ''} onChange={campo('crv')} disabled={!podeEditarVet} /></Field>
      <Field label="Slogan"><input value={form.slogan || ''} onChange={campo('slogan')} disabled={!podeEditarVet} /></Field>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input value={form.telefone || ''} onChange={campo('telefone')} disabled={!podeEditarVet} /></Field></div>
        <div style={{ flex: 1 }}><Field label="E-mail"><input value={form.email || ''} onChange={campo('email')} disabled={!podeEditarVet} /></Field></div>
      </div>

      <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '16px 0 8px' }}>Dados bancários</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Banco"><input value={form.banco || ''} onChange={campo('banco')} disabled={!podeEditarVet} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Agência"><input value={form.agencia || ''} onChange={campo('agencia')} disabled={!podeEditarVet} /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}><Field label="Conta"><input value={form.conta_bancaria || ''} onChange={campo('conta_bancaria')} disabled={!podeEditarVet} /></Field></div>
        <div style={{ flex: 1 }}><Field label="PIX"><input value={form.pix || ''} onChange={campo('pix')} disabled={!podeEditarVet} /></Field></div>
      </div>

      {podeEditarVet && (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar configuração'}
        </button>
      )}
    </div>
  )
}

// ── Aba Financeiro ───────────────────────────────────────────────────────
function AbaFinanceiro({ contaAtual, podeEditarVet, guard, categorias, setCategorias, clientes, ciclos, setCiclos, lancamentos, setLancamentos }) {
  const [cicloSelId, setCicloSelId] = useState('')
  const [modalCiclo, setModalCiclo] = useState(false)
  const [formCiclo, setFormCiclo] = useState({})
  const [savingCiclo, setSavingCiclo] = useState(false)

  const [modalLanc, setModalLanc] = useState(null) // objeto (editar) | 'novo' | null
  const [formLanc, setFormLanc] = useState({})
  const [savingLanc, setSavingLanc] = useState(false)
  const [confirmDelLanc, setConfirmDelLanc] = useState(null)

  const [modalCategorias, setModalCategorias] = useState(false)
  const [novaCategoria, setNovaCategoria] = useState('')
  const [confirmDelCategoria, setConfirmDelCategoria] = useState(null)

  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')

  const ciclosDesc = useMemo(() => [...ciclos].sort((a, b) => (b.inicio || '').localeCompare(a.inicio || '')), [ciclos])
  const cicloSel = ciclos.find(c => c.id === cicloSelId) || ciclos.find(c => c.atual) || ciclosDesc[0] || null

  // Saldo 100% derivado na leitura (Item 6) — soma todos os lançamentos de
  // cada ciclo, ordena os ciclos por início e acumula: `transportado` é o
  // que entrou no ciclo vindo de todos os anteriores, `acumulado` é o total
  // até o FIM deste ciclo. Nada disso é gravado em lugar nenhum.
  const saldosPorCiclo = useMemo(() => {
    const porCiclo = {}
    lancamentos.forEach(l => {
      const delta = l.tipo === 'R' ? Number(l.valor) : -Number(l.valor)
      porCiclo[l.ciclo_id] = (porCiclo[l.ciclo_id] || 0) + delta
    })
    const ordenadosAsc = [...ciclos].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''))
    const mapa = {}
    let acumulado = 0
    ordenadosAsc.forEach(c => {
      const doCiclo = porCiclo[c.id] || 0
      const transportado = acumulado
      acumulado += doCiclo
      mapa[c.id] = { doCiclo, transportado, acumulado }
    })
    return mapa
  }, [lancamentos, ciclos])

  const saldoAtual = cicloSel ? (saldosPorCiclo[cicloSel.id] || { doCiclo: 0, transportado: 0, acumulado: 0 }) : { doCiclo: 0, transportado: 0, acumulado: 0 }

  const lancamentosDoCiclo = useMemo(() => {
    if (!cicloSel) return []
    return lancamentos
      .filter(l => l.ciclo_id === cicloSel.id)
      .filter(l => !filtroCategoria || l.categoria_id === filtroCategoria)
      .filter(l => !filtroCliente || l.cliente_id === filtroCliente)
  }, [lancamentos, cicloSel, filtroCategoria, filtroCliente])

  const recarregarLancamentos = async () => {
    const { data, error } = await db.veterinario.lancamentos.listAll()
    if (error) { console.error('[Veterinario] erro ao recarregar lançamentos:', error); return }
    setLancamentos(data || [])
  }

  const criarCiclo = () => guard(async () => {
    if (!podeEditarVet || !contaAtual) return
    if (!formCiclo.nome || !formCiclo.inicio || !formCiclo.fim) { toast('Preencha nome, início e fim.', 'error'); return }
    if (formCiclo.fim < formCiclo.inicio) { toast('Fim não pode ser antes do início.', 'error'); return }
    setSavingCiclo(true)
    if (formCiclo.atual) await db.veterinario.ciclos.deactivateAll()
    const { data, error } = await db.veterinario.ciclos.insert({
      conta_id: contaAtual.id, nome: formCiclo.nome, inicio: formCiclo.inicio, fim: formCiclo.fim, atual: !!formCiclo.atual,
    })
    setSavingCiclo(false)
    if (error) { toast('Erro ao criar ciclo: ' + error.message, 'error'); return }
    setCiclos(prev => formCiclo.atual ? [...prev.map(c => ({ ...c, atual: false })), data] : [...prev, data])
    setCicloSelId(data.id)
    toast('Ciclo criado!')
    setModalCiclo(false); setFormCiclo({})
  }, 'novo-ciclo')

  const abrirNovoLanc = () => { setFormLanc({ tipo: 'D', data: hojeISO() }); setModalLanc('novo') }
  const abrirEditarLanc = (l) => {
    setFormLanc({ tipo: l.tipo, data: l.data, descricao: l.descricao || '', valor: l.valor, categoria_id: l.categoria_id || '', cliente_id: l.cliente_id || '' })
    setModalLanc(l)
  }

  const salvarLanc = () => guard(async () => {
    if (!podeEditarVet) return
    if (!cicloSel) { toast('Crie um ciclo antes de lançar.', 'error'); return }
    const valor = numeroPositivo(formLanc.valor)
    if (!valor) { toast('Informe um valor válido.', 'error'); return }
    if (!formLanc.data) { toast('Informe a data.', 'error'); return }
    setSavingLanc(true)
    const payload = {
      ciclo_id: cicloSel.id,
      cliente_id: formLanc.cliente_id || null,
      categoria_id: formLanc.categoria_id || null,
      tipo: formLanc.tipo === 'R' ? 'R' : 'D',
      descricao: capitalizarPrimeira(formLanc.descricao || '') || null,
      valor,
      data: formLanc.data,
    }
    const editando = modalLanc && modalLanc !== 'novo'
    const { error } = editando
      ? await db.veterinario.lancamentos.update(modalLanc.id, payload)
      : await db.veterinario.lancamentos.insert({ ...payload, conta_id: contaAtual.id })
    setSavingLanc(false)
    if (error) { toast('Erro ao salvar lançamento: ' + error.message, 'error'); return }
    await recarregarLancamentos()
    toast('Lançamento salvo!')
    setModalLanc(null); setFormLanc({})
  }, 'salvar-lanc')

  const excluirLanc = () => guard(async () => {
    if (!confirmDelLanc) return
    const { error } = await db.veterinario.lancamentos.delete(confirmDelLanc.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    setLancamentos(prev => prev.filter(l => l.id !== confirmDelLanc.id))
    setConfirmDelLanc(null)
    toast('Lançamento excluído.')
  }, 'excluir-lanc')

  const criarCategoria = () => guard(async () => {
    if (!podeEditarVet || !contaAtual) return
    const nome = capitalizarPrimeira(novaCategoria.trim())
    if (!nome) return
    const { data, error } = await db.veterinario.categorias.insert({ conta_id: contaAtual.id, nome })
    if (error) { toast('Erro ao criar categoria: ' + error.message, 'error'); return }
    setCategorias(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    setNovaCategoria('')
  }, 'nova-categoria')

  const excluirCategoria = () => guard(async () => {
    if (!confirmDelCategoria) return
    const { error } = await db.veterinario.categorias.delete(confirmDelCategoria.id)
    if (error) { toast('Erro ao excluir categoria: ' + error.message, 'error'); return }
    setCategorias(prev => prev.filter(c => c.id !== confirmDelCategoria.id))
    setConfirmDelCategoria(null)
    toast('Categoria excluída.')
  }, 'excluir-categoria')

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {ciclos.length > 0 ? (
              <select value={cicloSel?.id || ''} onChange={e => setCicloSelId(e.target.value)} style={{ maxWidth: 240 }}>
                {ciclosDesc.map(c => <option key={c.id} value={c.id}>{c.nome}{c.atual ? ' (atual)' : ''}</option>)}
              </select>
            ) : <span style={{ fontSize: '.85rem', color: '#6B7280' }}>Nenhum ciclo cadastrado ainda.</span>}
            {cicloSel && <span style={{ fontSize: '.8rem', color: '#6B7280' }}>{fmtData(cicloSel.inicio)} – {fmtData(cicloSel.fim)}</span>}
          </div>
          {podeEditarVet && (
            <button className="btn btn-secondary btn-sm" onClick={() => { setFormCiclo({}); setModalCiclo(true) }}>
              <i className="ti ti-plus" /> Novo ciclo
            </button>
          )}
        </div>
      </div>

      {cicloSel && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <ResumoCard label="Saldo transportado" valor={saldoAtual.transportado} />
          <ResumoCard label="Resultado do ciclo" valor={saldoAtual.doCiclo} />
          <ResumoCard label="Saldo acumulado" valor={saldoAtual.acumulado} destaque />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
            <option value="">Todos os clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        {podeEditarVet && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setModalCategorias(true)}>
              <i className="ti ti-tags" /> Categorias
            </button>
            <button className="btn btn-primary btn-sm" onClick={abrirNovoLanc} disabled={!cicloSel}>
              <i className="ti ti-plus" /> Lançamento
            </button>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Cliente</th><th style={{ textAlign: 'right' }}>Valor</th><th></th></tr></thead>
          <tbody>
            {lancamentosDoCiclo.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9CA3AF', padding: 20 }}>Nenhum lançamento neste ciclo.</td></tr>
            )}
            {lancamentosDoCiclo.map(l => (
              <tr key={l.id}>
                <td>{fmtData(l.data)}</td>
                <td><Badge color={l.tipo === 'R' ? 'green' : 'red'}>{l.tipo === 'R' ? 'Receita' : 'Despesa'}</Badge></td>
                <td>{l.descricao || '—'}</td>
                <td>{l.categoria?.nome || '—'}</td>
                <td>{l.cliente?.nome || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 500, color: l.tipo === 'R' ? '#1E55B0' : '#791F1F' }}>{fmtMoeda(l.valor)}</td>
                <td>
                  {podeEditarVet && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn-icon" onClick={() => abrirEditarLanc(l)} title="Editar"><i className="ti ti-edit" /></button>
                      <button className="btn-icon" onClick={() => setConfirmDelLanc(l)} title="Excluir" style={{ color: '#DC2626' }}><i className="ti ti-trash" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalCiclo} onClose={() => setModalCiclo(false)} title="Novo ciclo de fechamento">
        <Field label="Nome" required><input value={formCiclo.nome || ''} onChange={e => setFormCiclo(p => ({ ...p, nome: e.target.value }))} placeholder="ex: 2026" /></Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Início" required><input type="date" value={formCiclo.inicio || ''} onChange={e => setFormCiclo(p => ({ ...p, inicio: e.target.value }))} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Fim" required><input type="date" value={formCiclo.fim || ''} onChange={e => setFormCiclo(p => ({ ...p, fim: e.target.value }))} /></Field></div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', marginTop: 4 }}>
          <input type="checkbox" checked={!!formCiclo.atual} onChange={e => setFormCiclo(p => ({ ...p, atual: e.target.checked }))} />
          Marcar como ciclo atual
        </label>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setModalCiclo(false)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={criarCiclo} disabled={savingCiclo}>{savingCiclo ? 'Salvando...' : 'Criar ciclo'}</button>
        </div>
      </Modal>

      <Modal open={!!modalLanc} onClose={() => setModalLanc(null)} title={modalLanc && modalLanc !== 'novo' ? 'Editar lançamento' : 'Novo lançamento'}>
        <Field label="Tipo" required>
          <select value={formLanc.tipo || 'D'} onChange={e => setFormLanc(p => ({ ...p, tipo: e.target.value }))}>
            <option value="D">Despesa</option>
            <option value="R">Receita</option>
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Data" required><input type="date" value={formLanc.data || ''} onChange={e => setFormLanc(p => ({ ...p, data: e.target.value }))} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Valor (R$)" required><input type="number" step="0.01" value={formLanc.valor || ''} onChange={e => setFormLanc(p => ({ ...p, valor: e.target.value }))} placeholder="0,00" /></Field></div>
        </div>
        <Field label="Descrição"><input value={formLanc.descricao || ''} onChange={e => setFormLanc(p => ({ ...p, descricao: e.target.value }))} /></Field>
        <Field label="Categoria">
          <select value={formLanc.categoria_id || ''} onChange={e => setFormLanc(p => ({ ...p, categoria_id: e.target.value }))}>
            <option value="">Nenhuma</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Cliente" hint="Opcional — apropriar este lançamento a um cliente permite incluí-lo numa prestação de contas">
          <select value={formLanc.cliente_id || ''} onChange={e => setFormLanc(p => ({ ...p, cliente_id: e.target.value }))}>
            <option value="">Nenhum</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setModalLanc(null)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={salvarLanc} disabled={savingLanc}>{savingLanc ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </Modal>

      <Modal open={modalCategorias} onClose={() => setModalCategorias(false)} title="Categorias">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nova categoria" style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') criarCategoria() }} />
          <button className="btn btn-primary btn-sm" onClick={criarCategoria}>Adicionar</button>
        </div>
        {categorias.length === 0 && <div style={{ color: '#9CA3AF', fontSize: '.85rem' }}>Nenhuma categoria ainda.</div>}
        {categorias.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '.5px solid #F3F4F6' }}>
            <span>{c.nome}</span>
            <button className="btn-icon" onClick={() => setConfirmDelCategoria(c)} style={{ color: '#DC2626' }}><i className="ti ti-trash" /></button>
          </div>
        ))}
      </Modal>

      <Confirm open={!!confirmDelLanc} onClose={() => setConfirmDelLanc(null)} onConfirm={excluirLanc}
        title="Excluir lançamento" message="Excluir este lançamento? Esta ação não pode ser desfeita." danger />
      <Confirm open={!!confirmDelCategoria} onClose={() => setConfirmDelCategoria(null)} onConfirm={excluirCategoria}
        title="Excluir categoria" message={`Excluir "${confirmDelCategoria?.nome}"? Lançamentos que usam essa categoria ficam sem categoria — não são apagados.`} danger />
    </div>
  )
}

function ResumoCard({ label, valor, destaque }) {
  const cor = valor < 0 ? '#791F1F' : (destaque ? '#1E55B0' : '#1a1a1a')
  return (
    <div className="card" style={{ flex: '1 1 160px', textAlign: 'center', padding: '14px 10px' }}>
      <div style={{ fontSize: destaque ? '1.3rem' : '1.1rem', fontWeight: 700, color: cor }}>{fmtMoeda(valor)}</div>
      <div style={{ fontSize: '.75rem', color: '#6B7280', marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Aba Clientes ─────────────────────────────────────────────────────────
function AbaClientes({ contaAtual, podeEditarVet, guard, clientes, setClientes, fazendas }) {
  const [modal, setModal] = useState(null) // objeto (editar) | 'novo' | null
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmSync, setConfirmSync] = useState(null)

  const fazendaDoCliente = (c) => fazendas.find(f => f.id === c.fazenda_id) || null

  const abrirNovo = () => { setForm({}); setModal('novo') }
  const abrirEditar = (c) => { setForm({ nome: c.nome, telefone: c.telefone || '', observacao_1: c.observacao_1 || '', observacao_2: c.observacao_2 || '' }); setModal(c) }

  const salvar = () => guard(async () => {
    if (!podeEditarVet || !contaAtual) return
    if (!form.nome?.trim()) { toast('Informe o nome.', 'error'); return }
    setSaving(true)
    const payload = {
      nome: capitalizarNome(form.nome.trim()),
      telefone: form.telefone || null,
      observacao_1: form.observacao_1 || null,
      observacao_2: form.observacao_2 || null,
    }
    const editando = modal && modal !== 'novo'
    const { data, error } = editando
      ? await db.veterinario.clientes.update(modal.id, payload)
      : await db.veterinario.clientes.insert({ ...payload, conta_id: contaAtual.id })
    setSaving(false)
    if (error) { toast('Erro ao salvar cliente: ' + error.message, 'error'); return }
    setClientes(prev => editando ? prev.map(c => c.id === data.id ? data : c) : [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
    toast('Cliente salvo!')
    setModal(null); setForm({})
  }, 'salvar-cliente')

  const excluir = () => guard(async () => {
    if (!confirmDel) return
    const { error } = await db.veterinario.clientes.delete(confirmDel.id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    setClientes(prev => prev.filter(c => c.id !== confirmDel.id))
    setConfirmDel(null)
    toast('Cliente excluído.')
  }, 'excluir-cliente')

  const sincronizarNome = () => guard(async () => {
    if (!confirmSync) return
    const faz = fazendaDoCliente(confirmSync)
    if (!faz) { setConfirmSync(null); return }
    const { data, error } = await db.veterinario.clientes.update(confirmSync.id, { nome: faz.nome })
    if (error) { toast('Erro ao sincronizar: ' + error.message, 'error'); return }
    setClientes(prev => prev.map(c => c.id === data.id ? data : c))
    setConfirmSync(null)
    toast('Nome sincronizado com a fazenda.')
  }, 'sync-nome')

  return (
    <div>
      {podeEditarVet && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={abrirNovo}><i className="ti ti-plus" /> Novo cliente</button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fazenda</th><th>Nome</th><th>Telefone</th><th>Observações</th><th></th></tr></thead>
          <tbody>
            {clientes.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: 20 }}>Nenhum cliente cadastrado.</td></tr>
            )}
            {clientes.map(c => {
              const faz = fazendaDoCliente(c)
              const desatualizado = faz && faz.nome !== c.nome
              return (
                <tr key={c.id}>
                  <td>{faz ? <Badge color="blue">{faz.nome}</Badge> : '—'}</td>
                  <td>{c.nome}{desatualizado && <span title="Nome da fazenda mudou desde a última sincronização" style={{ color: '#D97706', marginLeft: 4 }}>●</span>}</td>
                  <td>{c.telefone || '—'}</td>
                  <td style={{ fontSize: '.8rem', color: '#6B7280' }}>{[c.observacao_1, c.observacao_2].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    {podeEditarVet && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {faz && <button className="btn-icon" onClick={() => setConfirmSync(c)} title="Sincronizar nome com a fazenda"><i className="ti ti-refresh" /></button>}
                        <button className="btn-icon" onClick={() => abrirEditar(c)} title="Editar"><i className="ti ti-edit" /></button>
                        <button className="btn-icon" onClick={() => setConfirmDel(c)} title="Excluir" style={{ color: '#DC2626' }}><i className="ti ti-trash" /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal && modal !== 'novo' ? 'Editar cliente' : 'Novo cliente'}>
        <Field label="Nome" required><input value={form.nome || ''} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} /></Field>
        <Field label="Telefone"><input value={form.telefone || ''} onChange={e => setForm(p => ({ ...p, telefone: e.target.value }))} /></Field>
        <Field label="Observações 01"><input value={form.observacao_1 || ''} onChange={e => setForm(p => ({ ...p, observacao_1: e.target.value }))} /></Field>
        <Field label="Observações 02"><input value={form.observacao_2 || ''} onChange={e => setForm(p => ({ ...p, observacao_2: e.target.value }))} /></Field>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setModal(null)}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </Modal>

      <Confirm open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={excluir}
        title="Excluir cliente" message="Excluir este cliente? Lançamentos apropriados a ele ficam sem cliente — não são apagados." danger />
      <Confirm open={!!confirmSync} onClose={() => setConfirmSync(null)} onConfirm={sincronizarNome}
        title="Sincronizar nome"
        message={confirmSync ? `Trocar o nome deste cliente de "${confirmSync.nome}" para "${fazendaDoCliente(confirmSync)?.nome}" (nome atual da fazenda)?` : ''} />
    </div>
  )
}

// ── Aba Documentos ───────────────────────────────────────────────────────
function AbaDocumentos({ contaAtual, podeEditarVet, guard, config, clientes, lancamentos, atestados, setAtestados }) {
  const [docTab, setDocTab] = useState(0)

  return (
    <div>
      <div className="tabs-bar" style={{ marginBottom: 14 }}>
        {DOC_ABAS.map((t, i) => (
          <button key={t} className={`tab-btn ${docTab === i ? 'active' : ''}`} onClick={() => setDocTab(i)}>{t}</button>
        ))}
      </div>
      {docTab === 0 && <DocPrestacaoContas config={config} clientes={clientes} lancamentos={lancamentos} />}
      {docTab >= 1 && docTab <= TIPOS_ATESTADO.length && (
        <DocAtestado
          tipo={TIPOS_ATESTADO[docTab - 1].valor}
          config={config} contaAtual={contaAtual} podeEditarVet={podeEditarVet} guard={guard}
          setAtestados={setAtestados}
        />
      )}
      {docTab === TIPOS_ATESTADO.length + 1 && <DocHistoricoAtestados config={config} atestados={atestados} />}
    </div>
  )
}

function DocPrestacaoContas({ config, clientes, lancamentos }) {
  const [clienteId, setClienteId] = useState('')
  const [selecionados, setSelecionados] = useState(new Set())
  const [itensManuais, setItensManuais] = useState([])
  const [gerando, setGerando] = useState(false)

  const doCliente = useMemo(() => lancamentos.filter(l => l.cliente_id === clienteId), [lancamentos, clienteId])

  useEffect(() => {
    setSelecionados(new Set(lancamentos.filter(l => l.cliente_id === clienteId).map(l => l.id)))
    setItensManuais([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  const toggleSel = (id) => setSelecionados(prev => {
    const novo = new Set(prev)
    novo.has(id) ? novo.delete(id) : novo.add(id)
    return novo
  })

  const addManual = () => setItensManuais(prev => [...prev, { _id: crypto.randomUUID(), data: hojeISO(), descricao: '', categoria: '', tipo: 'D', valor: '' }])
  const updManual = (id, campo, valor) => setItensManuais(prev => prev.map(it => it._id === id ? { ...it, [campo]: valor } : it))
  const rmManual = (id) => setItensManuais(prev => prev.filter(it => it._id !== id))

  const itensPdf = useMemo(() => {
    const apropriados = doCliente
      .filter(l => selecionados.has(l.id))
      .map(l => ({ data: l.data, descricao: l.descricao, categoria: l.categoria?.nome || '', tipo: l.tipo, valor: Number(l.valor) }))
    const manuais = itensManuais
      .filter(it => numeroPositivo(it.valor))
      .map(it => ({ data: it.data, descricao: it.descricao, categoria: it.categoria, tipo: it.tipo, valor: Number(it.valor) }))
    return [...apropriados, ...manuais].sort((a, b) => (a.data || '').localeCompare(b.data || ''))
  }, [doCliente, selecionados, itensManuais])

  const total = itensPdf.reduce((s, it) => s + (it.tipo === 'R' ? it.valor : -it.valor), 0)
  const cliente = clientes.find(c => c.id === clienteId)

  const gerar = async () => {
    if (!cliente) { toast('Selecione um cliente.', 'error'); return }
    if (itensPdf.length === 0) { toast('Selecione ao menos um lançamento ou adicione um item manual.', 'error'); return }
    setGerando(true)
    try {
      const logoDataURL = await carregarLogoFazenda(config?.logo_url || '', 240, { circular: false })
      gerarPDFPrestacaoContas({
        veterinario: { ...(config || {}), logoDataURL },
        cliente, itens: itensPdf, total,
        filename: `prestacao-contas-${slug(cliente.nome)}`,
      })
      toast('PDF gerado!')
    } catch (e) {
      toast('Erro ao gerar PDF: ' + e.message, 'error')
    }
    setGerando(false)
  }

  return (
    <div>
      <Field label="Cliente" required>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ maxWidth: 320 }}>
          <option value="">Selecione...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Field>

      {clienteId && (
        <>
          <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '14px 0 6px' }}>Lançamentos apropriados a este cliente</div>
          {doCliente.length === 0 && <div style={{ color: '#9CA3AF', fontSize: '.85rem', marginBottom: 10 }}>Nenhum lançamento apropriado a este cliente ainda.</div>}
          {doCliente.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table>
                <thead><tr><th></th><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {doCliente.map(l => (
                    <tr key={l.id}>
                      <td><input type="checkbox" checked={selecionados.has(l.id)} onChange={() => toggleSel(l.id)} /></td>
                      <td>{fmtData(l.data)}</td>
                      <td><Badge color={l.tipo === 'R' ? 'green' : 'red'}>{l.tipo === 'R' ? 'Receita' : 'Despesa'}</Badge></td>
                      <td>{l.descricao || '—'}</td>
                      <td>{l.categoria?.nome || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{fmtMoeda(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
            <div style={{ fontWeight: 600, fontSize: '.85rem' }}>Itens manuais</div>
            <button className="btn btn-secondary btn-sm" onClick={addManual}><i className="ti ti-plus" /> Item</button>
          </div>
          {itensManuais.map(it => (
            <div key={it._id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <input type="date" value={it.data} onChange={e => updManual(it._id, 'data', e.target.value)} style={{ width: 130 }} />
              <input placeholder="Descrição" value={it.descricao} onChange={e => updManual(it._id, 'descricao', e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <input placeholder="Categoria" value={it.categoria} onChange={e => updManual(it._id, 'categoria', e.target.value)} style={{ width: 130 }} />
              <select value={it.tipo} onChange={e => updManual(it._id, 'tipo', e.target.value)} style={{ width: 100 }}>
                <option value="D">Despesa</option>
                <option value="R">Receita</option>
              </select>
              <input type="number" step="0.01" placeholder="0,00" value={it.valor} onChange={e => updManual(it._id, 'valor', e.target.value)} style={{ width: 100 }} />
              <button className="btn-icon" onClick={() => rmManual(it._id)} style={{ color: '#DC2626' }}><i className="ti ti-trash" /></button>
            </div>
          ))}

          <div className="card" style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600 }}>Total: <span style={{ color: total < 0 ? '#791F1F' : '#1E55B0' }}>{fmtMoeda(total)}</span></span>
            <button className="btn btn-primary btn-sm" onClick={gerar} disabled={gerando}>
              <i className="ti ti-file-type-pdf" /> {gerando ? 'Gerando...' : 'Gerar PDF'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Input genérico por metadado de campo ({chave,label,tipo,opcoes,step}) —
// usado tanto nos campos de documento quanto nas colunas da tabela de
// animais. Único lugar que sabe mapear tipo('text'|'date'|'number'|
// 'select') pra input — um 5º tipo de atestado nunca precisa de um input
// novo aqui, só reaproveita um desses 4 tipos de campo.
function CampoGenerico({ campo, valor, onChange, largura, onKeyDown, onBlur, campoRef }) {
  const style = largura ? { width: largura } : undefined
  if (campo.tipo === 'date') return <input ref={campoRef} type="date" value={valor || ''} onChange={e => onChange(e.target.value)} style={style} onKeyDown={onKeyDown} onBlur={onBlur} />
  if (campo.tipo === 'number') return <input ref={campoRef} type="number" step={campo.step || 'any'} value={valor ?? ''} onChange={e => onChange(e.target.value)} style={style} onKeyDown={onKeyDown} onBlur={onBlur} />
  if (campo.tipo === 'select') {
    return (
      <select ref={campoRef} value={valor || ''} onChange={e => onChange(e.target.value)} style={style} onKeyDown={onKeyDown} onBlur={onBlur}>
        <option value="">—</option>
        {campo.opcoes.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  return <input ref={campoRef} value={valor || ''} onChange={e => onChange(e.target.value)} style={style} onKeyDown={onKeyDown} onBlur={onBlur} />
}

// Atestado genérico — 1 documento, N animais, campos específicos do tipo
// vindos 100% de veterinarioAtestados.js (CAMPOS_DOCUMENTO_POR_TIPO/
// CAMPOS_ANIMAL_POR_TIPO). Sem nenhum `if (tipo === ...)` aqui.
function DocAtestado({ tipo, config, contaAtual, podeEditarVet, guard, setAtestados }) {
  const camposDocumento = CAMPOS_DOCUMENTO_POR_TIPO[tipo] || []
  const camposAnimal = CAMPOS_ANIMAL_POR_TIPO[tipo] || []
  const metaTipo = TIPOS_ATESTADO.find(t => t.valor === tipo)
  const mostraDescricaoAnimal = descricaoPorAnimal(tipo)

  const documentoInicial = () => ({
    data_evento: hojeISO(), local_evento: '', proprietario_nome: '',
    veterinario_nome: config?.nome || '', veterinario_crv: config?.crv || '',
    ...(mostraDescricaoAnimal ? {} : { descricao: '' }),
    ...Object.fromEntries(camposDocumento.map(c => [c.chave, ''])),
  })

  const [documento, setDocumento] = useState(documentoInicial)
  const [animais, setAnimais] = useState(() => [linhaAnimalVazia(tipo)])
  const [emitindo, setEmitindo] = useState(false)
  const brincoRefs = useRef({})
  const tabelaRef = useRef(null)
  const focoAlvoIdRef = useRef(null) // _id da linha cujo brinco deve ganhar foco no próximo render

  // Troca de sub-aba (tipo) — reseta o formulário inteiro pro tipo novo,
  // nunca carrega campo de um tipo pro outro.
  useEffect(() => {
    setDocumento(documentoInicial())
    setAnimais([linhaAnimalVazia(tipo)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo])

  // Depois de criar linha (teclado) ou remover uma do meio, foca o brinco
  // da linha certa — fluxo pra lançar dezenas de animais sem tirar a mão do
  // teclado, e pra remover uma linha sem "perder" o foco pro body da página.
  useEffect(() => {
    if (!focoAlvoIdRef.current) return
    const alvo = focoAlvoIdRef.current
    focoAlvoIdRef.current = null
    brincoRefs.current[alvo]?.focus()
  }, [animais])

  const campoDoc = (k) => (e) => setDocumento(prev => ({ ...prev, [k]: e.target.value }))

  // Só cria linha nova se a ÚLTIMA linha tiver brinco preenchido (nunca em
  // cima de uma linha em branco) — e só se `linhaQueSaiu` bater com a
  // última (evita criar linha ao sair de uma linha do MEIO, ex: clicar
  // direto numa linha de cima depois de editar outra).
  const garantirLinhaEmBranco = (linhaQueSaiu = null) => {
    setAnimais(prev => {
      const ultima = prev[prev.length - 1]
      if (!ultima) return prev
      if (linhaQueSaiu && ultima._id !== linhaQueSaiu) return prev
      if (!ultima.brinco?.trim()) return prev
      const nova = linhaAnimalVazia(tipo)
      focoAlvoIdRef.current = nova._id
      return [...prev, nova]
    })
  }

  const addAnimal = () => setAnimais(prev => [...prev, linhaAnimalVazia(tipo)])

  const updAnimal = (id, campo, valor) => setAnimais(prev => prev.map(a => a._id === id ? { ...a, [campo]: valor } : a))

  const rmAnimal = (id) => setAnimais(prev => {
    if (prev.length <= 1) return prev
    const idx = prev.findIndex(a => a._id === id)
    const novo = prev.filter(a => a._id !== id)
    const alvo = novo[Math.min(idx, novo.length - 1)]
    if (alvo) focoAlvoIdRef.current = alvo._id
    return novo
  })

  // Campo a campo dentro da linha (Tab nativo já faz isso certo — não
  // intercepto), mas do ÚLTIMO campo da ÚLTIMA linha em diante não existe
  // "próximo" — aí crio a linha e movo o foco pra ela. Enter nunca move
  // foco sozinho no browser, então SEMPRE intercepto e replico o mesmo
  // pulo que o Tab faria.
  const camposDaTabela = () => Array.from(tabelaRef.current?.querySelectorAll('input, select') || [])

  const irParaProximoCampo = (e) => {
    e.preventDefault()
    const campos = camposDaTabela()
    const idx = campos.indexOf(e.target)
    if (idx === -1) return
    if (idx < campos.length - 1) { campos[idx + 1].focus(); return }
    garantirLinhaEmBranco()
  }

  const onKeyDownCampo = (e) => {
    if (e.key === 'Enter') { irParaProximoCampo(e); return }
    if (e.key !== 'Tab' || e.shiftKey) return
    const campos = camposDaTabela()
    if (campos.indexOf(e.target) === campos.length - 1) { e.preventDefault(); garantirLinhaEmBranco() }
    // Senão, deixa o Tab nativo seguir — já pula certo pro próximo campo da
    // linha, ou pro brinco da próxima linha se ela já existir no DOM.
  }

  // "Clica fora" (Tab só sai do campo com foco, não cobre clique/blur) —
  // mesma regra: só cria linha se quem perdeu o foco é a ÚLTIMA linha, e só
  // se o foco não foi pra outro campo da MESMA linha (nesse caso o usuário
  // só está navegando dentro da linha, ainda preenchendo).
  const onBlurCampo = (rowId) => (e) => {
    const mesmaLinha = e.relatedTarget?.closest?.('tr')?.dataset?.rowId === rowId
    if (mesmaLinha) return
    garantirLinhaEmBranco(rowId)
  }

  const emitir = () => guard(async () => {
    if (!podeEditarVet || !contaAtual) return
    const animaisValidos = animais.filter(a => a.brinco?.trim())
    if (animaisValidos.length === 0) { toast('Adicione ao menos um animal com brinco preenchido.', 'error'); return }
    if (!documento.data_evento) { toast('Informe a data.', 'error'); return }
    if (!documento.proprietario_nome?.trim()) { toast('Informe o nome do proprietário.', 'error'); return }
    setEmitindo(true)

    const dadosDocumento = {
      ...(mostraDescricaoAnimal ? {} : { descricao: documento.descricao || null }),
      ...Object.fromEntries(camposDocumento.map(c => [c.chave, documento[c.chave] || null])),
    }
    const payloadAtestado = {
      conta_id: contaAtual.id, tipo,
      data_evento: documento.data_evento,
      local_evento: documento.local_evento || null,
      proprietario_nome: documento.proprietario_nome.trim(),
      veterinario_nome: documento.veterinario_nome || null,
      veterinario_crv: documento.veterinario_crv || null,
      dados_documento: dadosDocumento,
    }
    const { data: atestado, error: errAtestado } = await db.veterinario.atestados.insert(payloadAtestado)
    if (errAtestado) { toast('Erro ao salvar atestado: ' + errAtestado.message, 'error'); setEmitindo(false); return }

    const linhasAnimais = animaisValidos.map((a, i) => ({
      conta_id: contaAtual.id, atestado_id: atestado.id, ordem: i + 1,
      brinco: a.brinco.trim(), descricao_animal: mostraDescricaoAnimal ? (a.descricao_animal || null) : null,
      dados: Object.fromEntries(camposAnimal.map(c => [c.chave, a[c.chave] || null])),
    }))
    const { error: errAnimais } = await db.veterinario.atestados.insertAnimais(linhasAnimais)
    if (errAnimais) {
      // Compensação: sem os animais, o atestado ficaria órfão (gravado, mas
      // sem nenhuma linha filha) — desfaz o insert do documento em vez de
      // deixar esse estado inconsistente pra trás.
      await db.veterinario.atestados.delete(atestado.id)
      toast('Erro ao gravar os animais — nada foi salvo: ' + errAnimais.message, 'error')
      setEmitindo(false)
      return
    }

    try {
      const logoDataURL = await carregarLogoFazenda(config?.logo_url || '', 240, { circular: false })
      gerarPDFAtestado(tipo, {
        veterinario: { nome: config?.nome, slogan: config?.slogan, telefone: config?.telefone, email: config?.email, logoDataURL },
        documento: { ...payloadAtestado, ...dadosDocumento },
        animais: linhasAnimais.map(l => ({ brinco: l.brinco, descricao_animal: l.descricao_animal, ...l.dados })),
        filename: nomeArquivoAtestado(tipo, linhasAnimais),
      })
      toast('Atestado emitido!')
    } catch (e) {
      toast('Atestado salvo, mas houve erro ao gerar o PDF: ' + e.message, 'error')
    }

    const { data: listaAtualizada, error: errLista } = await db.veterinario.atestados.list()
    if (!errLista) setAtestados(listaAtualizada || [])
    setDocumento(documentoInicial())
    setAnimais([linhaAnimalVazia(tipo)])
    setEmitindo(false)
  }, 'emitir-atestado')

  return (
    <div>
      <div className="card" style={{ maxWidth: 560, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Data" required><input type="date" value={documento.data_evento || ''} onChange={campoDoc('data_evento')} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Local"><input value={documento.local_evento || ''} onChange={campoDoc('local_evento')} /></Field></div>
        </div>
        <Field label="Nome do proprietário" required><input value={documento.proprietario_nome || ''} onChange={campoDoc('proprietario_nome')} /></Field>
        {!mostraDescricaoAnimal && (
          <Field label="Descrição dos animais" hint="Uma descrição só, vale para todos os animais deste documento">
            <input value={documento.descricao || ''} onChange={campoDoc('descricao')} placeholder="ex: vacas Nelore, 3 anos" />
          </Field>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Veterinário (assinatura)"><input value={documento.veterinario_nome || ''} onChange={campoDoc('veterinario_nome')} /></Field></div>
          <div style={{ flex: 1 }}><Field label="CRV"><input value={documento.veterinario_crv || ''} onChange={campoDoc('veterinario_crv')} /></Field></div>
        </div>
        {camposDocumento.length > 0 && (
          <>
            <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '12px 0 6px' }}>{metaTipo?.labelCamposDocumento || 'Dados do documento'}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {camposDocumento.map(c => (
                <div key={c.chave} style={{ flex: '1 1 160px' }}>
                  <Field label={c.label}><CampoGenerico campo={c} valor={documento[c.chave]} onChange={v => setDocumento(p => ({ ...p, [c.chave]: v }))} /></Field>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>Animais ({animais.length})</div>
        <button className="btn btn-secondary btn-sm" onClick={addAnimal}><i className="ti ti-plus" /> Adicionar animal</button>
      </div>
      <div className="table-wrap" style={{ marginBottom: 14 }} ref={tabelaRef}>
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>Brinco</th>
              {mostraDescricaoAnimal && <th>Descrição</th>}
              {camposAnimal.map(c => <th key={c.chave} style={{ minWidth: c.largura }}>{c.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {animais.map((a) => (
              <tr key={a._id} data-row-id={a._id}>
                <td>
                  <input ref={el => { brincoRefs.current[a._id] = el }} value={a.brinco}
                    onChange={e => updAnimal(a._id, 'brinco', e.target.value)}
                    onKeyDown={onKeyDownCampo}
                    onBlur={onBlurCampo(a._id)}
                    style={{ width: 100 }} placeholder="Brinco" />
                </td>
                {mostraDescricaoAnimal && (
                  <td>
                    <input value={a.descricao_animal || ''} onChange={e => updAnimal(a._id, 'descricao_animal', e.target.value)}
                      onKeyDown={onKeyDownCampo} onBlur={onBlurCampo(a._id)}
                      placeholder="Descrição" style={{ minWidth: 140 }} />
                  </td>
                )}
                {camposAnimal.map(c => (
                  <td key={c.chave}>
                    <CampoGenerico campo={c} valor={a[c.chave]} onChange={v => updAnimal(a._id, c.chave, v)} largura={c.largura}
                      onKeyDown={onKeyDownCampo} onBlur={onBlurCampo(a._id)} />
                  </td>
                ))}
                <td>
                  <button className="btn-icon" tabIndex={-1} onClick={() => rmAnimal(a._id)} disabled={animais.length === 1} style={{ color: '#DC2626' }} title="Remover animal">
                    <i className="ti ti-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeEditarVet && (
        <button className="btn btn-primary btn-sm" onClick={emitir} disabled={emitindo}>
          <i className="ti ti-file-type-pdf" /> {emitindo ? 'Emitindo...' : 'Emitir atestado'}
        </button>
      )}
    </div>
  )
}

function DocHistoricoAtestados({ config, atestados }) {
  const [reemitindoId, setReemitindoId] = useState(null)

  // Fidelidade: mesma função geradora, mesmo formato de `documento`/`animais`
  // que a emissão original usa — a única diferença é a FONTE do dado (linha
  // já gravada, em vez do formulário).
  const reemitir = async (row) => {
    setReemitindoId(row.id)
    try {
      const logoDataURL = await carregarLogoFazenda(config?.logo_url || '', 240, { circular: false })
      const animaisOrdenados = [...(row.animais || [])].sort((a, b) => a.ordem - b.ordem)
      gerarPDFAtestado(row.tipo, {
        veterinario: { nome: config?.nome, slogan: config?.slogan, telefone: config?.telefone, email: config?.email, logoDataURL },
        documento: {
          data_evento: row.data_evento, local_evento: row.local_evento,
          proprietario_nome: row.proprietario_nome, veterinario_nome: row.veterinario_nome,
          veterinario_crv: row.veterinario_crv, ...(row.dados_documento || {}),
        },
        animais: animaisOrdenados.map(a => ({ brinco: a.brinco, descricao_animal: a.descricao_animal, ...(a.dados || {}) })),
        filename: nomeArquivoAtestado(row.tipo, animaisOrdenados),
      })
    } catch (e) {
      toast('Erro ao reemitir: ' + e.message, 'error')
    }
    setReemitindoId(null)
  }

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Tipo</th><th>Animais</th><th>Proprietário</th><th>Data</th><th>Emitido em</th><th></th></tr></thead>
        <tbody>
          {atestados.length === 0 && (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: 20 }}>Nenhum atestado emitido ainda.</td></tr>
          )}
          {atestados.map(a => {
            const animaisOrdenados = [...(a.animais || [])].sort((x, y) => x.ordem - y.ordem)
            const resumoAnimais = animaisOrdenados.length <= 2
              ? (animaisOrdenados.map(x => x.brinco).join(', ') || '—')
              : `${animaisOrdenados.length} animais`
            return (
              <tr key={a.id}>
                <td><Badge color="blue">{TIPOS_ATESTADO.find(t => t.valor === a.tipo)?.label || a.tipo}</Badge></td>
                <td>{resumoAnimais}</td>
                <td>{a.proprietario_nome}</td>
                <td>{fmtData(a.data_evento)}</td>
                <td>{fmtData(a.criado_em?.slice(0, 10))}</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => reemitir(a)} disabled={reemitindoId === a.id}>
                    <i className="ti ti-file-type-pdf" /> {reemitindoId === a.id ? 'Gerando...' : 'Reemitir'}
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
