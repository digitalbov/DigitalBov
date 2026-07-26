import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { fmtData, diasDesde, calcCategoriaRebanho, algumErro } from '../lib/helpers'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'

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

  const { podeEditar } = usePermissoes()
  const podeEditarSanidade = podeEditar('sanidade')
  // Bloco D6 — a seção "itens do estoque utilizados" é um cruzamento de dois
  // módulos: exige sanidade (óbvio) E estoque (é uma baixa de verdade). Sem
  // permissão de estoque, a seção fica OCULTA (não desabilitada) — quem só tem
  // sanidade continua registrando procedimentos normalmente, só não vê a opção
  // de baixar estoque, e nada tenta rodar no salvamento (itensEstoqueUsados
  // nunca é preenchido porque a UI que preenche nem existe pra esse usuário).
  const podeEditarEstoque = podeEditar('estoque')
  const { contaAtual }   = useConta()
  const { fazendaAtual } = useFazenda()
  const { dentroDoCiclo, cicloDaData, dataEhEditavel } = useCiclo()
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarSanidadeCiclo = podeEditarSanidade && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const [tab,      setTab]     = useState(0)
  const [dados,    setDados]   = useState([])
  const [lotes,    setLotes]   = useState([])
  const [animais,  setAnimais] = useState([])
  const [props,    setProps]   = useState([])
  const [selLotes, setSelLotes]= useState([])
  const [loading,  setLoading] = useState(true)
  const [modal,      setModal]      = useState(false)
  const [form,       setForm]       = useState({})
  const [editandoId, setEditandoId] = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [concluindoId,   setConcluindoId]   = useState(null)
  const [ofertaNovoProc, setOfertaNovoProc] = useState(null)

  const [modoSelecao,    setModoSelecao]    = useState('lote') // 'lote' | 'individual'
  const [selAnimais,     setSelAnimais]     = useState([])
  const [filtroCategSan, setFiltroCategSan] = useState('')
  const [filtroPropSan,  setFiltroPropSan]  = useState('')

  // Bloco D6 — baixa automática no estoque, opcional, por procedimento (não por
  // animal — ver diagnóstico: quantidade em procedimentos_sanitarios é nº de
  // animais, não dose de insumo, não dá pra derivar automaticamente).
  const [estoqueItens,       setEstoqueItens]       = useState([])
  const [itensEstoqueUsados, setItensEstoqueUsados] = useState([])
  // Mapa procedimento_id -> [{item_id, quantidade, item:{item,unidade}}] —
  // usado tanto pra mostrar "itens baixados" na lista/edição (visibilidade)
  // quanto pra montar a mensagem de confirmação de exclusão.
  const [movsPorProcedimento, setMovsPorProcedimento] = useState({})

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.sanidade.list(),
        db.lotes.list(),
        db.animais.list({ situacao: 'ativo' }),
        db.proprietarios.list(),
        db.estoque.list(),
        db.movEstoque.listComProcedimento(),
      ])
      if (algumErro('[Sanidade]', results)) { setLoadError(true); return }
      const [{ data: sanData }, { data: lotesData }, { data: animaisData }, { data: propsData }, { data: estoqueData }, { data: movsProcData }] = results
      setDados(sanData       || [])
      setLotes(lotesData     || [])
      setAnimais(animaisData || [])
      setProps(propsData     || [])
      setEstoqueItens(estoqueData || [])
      const mapa = {}
      ;(movsProcData || []).forEach(m => {
        if (!mapa[m.procedimento_id]) mapa[m.procedimento_id] = []
        mapa[m.procedimento_id].push(m)
      })
      setMovsPorProcedimento(mapa)
    } catch (e) {
      console.error('[Sanidade] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  // Itens elegíveis pra baixa: categoria Medicamento/Vacina (únicas que fazem
  // sentido numa aplicação sanitária — ver diagnóstico item b) e com saldo > 0
  // (sem saldo, nem aparece na lista — evita escolher e só descobrir no bloqueio).
  const itensEstoqueDisponiveis = estoqueItens.filter(i =>
    ['Medicamento', 'Vacina'].includes(i.categoria) && parseFloat(i.quantidade) > 0
  )

  const adicionarLinhaEstoque = () => setItensEstoqueUsados(prev => [...prev, { item_id: '', quantidade: '' }])
  const removerLinhaEstoque   = (idx) => setItensEstoqueUsados(prev => prev.filter((_, i) => i !== idx))
  const atualizarLinhaEstoque = (idx, patch) => setItensEstoqueUsados(prev =>
    prev.map((l, i) => i === idx ? { ...l, ...patch } : l)
  )

  // Valida ANTES de salvar (bloqueia a criação do procedimento inteiro, não só
  // a baixa) — soma por item (2 linhas do mesmo item somam) e compara com o
  // saldo atual. Nunca deixa o estoque ir negativo.
  const validarSaldoEstoque = () => {
    const linhas = itensEstoqueUsados.filter(l => l.item_id && parseFloat(l.quantidade) > 0)
    const totais = {}
    linhas.forEach(l => { totais[l.item_id] = (totais[l.item_id] || 0) + parseFloat(l.quantidade) })
    for (const [itemId, total] of Object.entries(totais)) {
      const item = estoqueItens.find(i => i.id === itemId)
      if (!item) continue
      if (total > parseFloat(item.quantidade)) {
        return `Saldo insuficiente de "${item.item}": disponível ${parseFloat(item.quantidade).toFixed(1)} ${item.unidade}, solicitado ${total.toFixed(1)} ${item.unidade}.`
      }
    }
    return null
  }

  const togLote = (nome) => setSelLotes(prev =>
    prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]
  )

  const togAnimal = (id) => setSelAnimais(prev =>
    prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
  )

  const resetFormSelecao = () => {
    setSelLotes([]); setSelAnimais([]); setModoSelecao('lote')
    setFiltroCategSan(''); setFiltroPropSan('')
    setItensEstoqueUsados([])
  }

  const fecharModal = () => { setModal(false); setForm({}); setEditandoId(null); resetFormSelecao() }

  // Editar só toca nos campos do registro em si (data/tipo/procedimento/próximo/
  // observações) — não reabre a seleção de lote/animais, que é um passo de
  // CRIAÇÃO (vínculos em sanidade_animais) e não faz parte do que foi pedido aqui.
  const abrirEditar = (d) => {
    if (!podeEditarSanidadeCiclo) return
    resetFormSelecao()
    setEditandoId(d.id)
    setForm({
      data:         d.data,
      tipo:         d.tipo,
      procedimento: d.procedimento,
      proximo:      d.proximo || '',
      obs:          d.observacoes || '',
    })
    setModal(true)
  }

  // Quantidade automática: soma de animais ativos dos lotes selecionados, ou seleção individual.
  // Mesmo filtro de data_nascimento usado em `salvar` (abaixo), pra não mostrar uma
  // contagem maior do que o que de fato vai ser vinculado em sanidade_animais.
  const autoQtd = modoSelecao === 'individual'
    ? (selAnimais.length > 0 ? selAnimais.length : null)
    : (selLotes.length === 0 ? null : (() => {
        const ids = lotes.filter(l => selLotes.includes(l.nome)).map(l => l.id)
        return animais.filter(a =>
          ids.includes(a.lote_id) && (!a.data_nascimento || !form.data || a.data_nascimento <= form.data)
        ).length
      })())

  const categoriasDisponiveis = [...new Set(animais.map(a =>
    calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
  ))].sort()

  // Mesmo filtro de data_nascimento que o modo "Por lote" já aplicava (ver
  // animaisParaVincular/autoQtd acima) — modo Individual estava sem essa
  // checagem, deixando vincular um procedimento a um animal que ainda nem
  // tinha nascido na data escolhida. Uniformiza os dois modos.
  const animaisFiltradosSan = animais.filter(a => {
    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
    if (filtroCategSan && cat !== filtroCategSan) return false
    if (filtroPropSan && a.proprietario_id !== filtroPropSan) return false
    if (form.data && a.data_nascimento && a.data_nascimento > form.data) return false
    return true
  })

  const salvar = async () => {
    if (!podeEditarSanidadeCiclo) return
    if (!form.data || !form.tipo || !form.procedimento) {
      toast('Preencha data, tipo e procedimento.', 'error'); return
    }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }
    // Valida saldo ANTES de criar qualquer coisa — bloqueia o procedimento
    // inteiro, não só a baixa, se algum item não tiver saldo suficiente.
    if (!editandoId) {
      const erroSaldo = validarSaldoEstoque()
      if (erroSaldo) { toast(erroSaldo, 'error'); return }
    }
    setSaving(true)

    if (editandoId) {
      const { error } = await db.sanidade.update(editandoId, {
        data:         form.data,
        tipo:         form.tipo,
        procedimento: form.procedimento,
        proximo:      form.proximo || null,
        observacoes:  form.obs || ''
      })
      setSaving(false)
      if (error) { toast('Erro: ' + error.message, 'error'); return }
      toast('Procedimento atualizado!')
      setModal(false); setForm({}); setEditandoId(null); resetFormSelecao(); load()
      return
    }

    const lote_descricao = modoSelecao === 'individual'
      ? (selAnimais.length > 0
          ? `Individual: ${animais.filter(a => selAnimais.includes(a.id)).map(a => a.brinco).join(', ')}`
          : 'Individual')
      : (selLotes.length > 0 ? selLotes.join(', ') : 'Geral')
    const { data: procData, error } = await db.sanidade.insert({
      data:         form.data,
      tipo:         form.tipo,
      procedimento: form.procedimento,
      lote_descricao,
      quantidade:   autoQtd !== null ? autoQtd : (parseInt(form.quantidade) || 0),
      proximo:      form.proximo || null,
      observacoes:  form.obs || ''
    })
    if (error) { setSaving(false); toast('Erro: ' + error.message, 'error'); return }

    let animaisParaVincular = []
    if (modoSelecao === 'individual') {
      // Defesa em profundidade — o dropdown já filtra, isto garante que nunca
      // vincula mesmo se selAnimais ficou desatualizado por algum motivo.
      animaisParaVincular = selAnimais.filter(id => {
        const a = animais.find(x => x.id === id)
        return !a?.data_nascimento || a.data_nascimento <= form.data
      })
    } else if (modoSelecao === 'lote' && selLotes.length > 0) {
      const idsLotes = lotes.filter(l => selLotes.includes(l.nome)).map(l => l.id)
      // Só vincula quem já existia na data do procedimento — sem isso, um bezerro
      // nascido depois herdava procedimentos aplicados antes dele existir (bug:
      // "todo o lote" usava a composição ATUAL do lote, não a de quando o
      // procedimento aconteceu). Não cobre "estava no lote naquela data" (não há
      // histórico de mudança de lote), só "já tinha nascido".
      animaisParaVincular = animais.filter(a =>
        idsLotes.includes(a.lote_id) && (!a.data_nascimento || a.data_nascimento <= form.data)
      ).map(a => a.id)
    }

    if (animaisParaVincular.length > 0 && procData?.id) {
      const vinculos = animaisParaVincular.map(animalId => ({
        conta_id:        contaAtual.id,
        fazenda_id:      fazendaAtual.id,
        procedimento_id: procData.id,
        animal_id:       animalId,
      }))
      const { error: errVinc } = await db.sanidadeAnimais.inserirVarios(vinculos)
      if (errVinc) toast('Procedimento salvo, mas erro ao vincular animais: ' + errVinc.message, 'error')
    }

    // ── Baixa de estoque (Bloco D6, opcional) — por procedimento, não por
    // animal (ver diagnóstico). ORDEM É PROPOSITAL: grava a movimentação
    // ANTES de ajustar estoque_itens.quantidade, uma linha de cada vez (não em
    // paralelo). Se algo falhar no meio, é preferível ficar com uma
    // movimentação SEM o saldo ajustado (visível em Estoque → Movimentar,
    // auditável e corrigível manualmente) do que um saldo ajustado sem
    // nenhuma movimentação explicando a diferença (invisível, indetectável).
    // saldosLocais rastreia o saldo indo embora linha a linha (2 linhas do
    // mesmo item têm que descontar em sequência, não do mesmo saldo "congelado").
    if (podeEditarEstoque && procData?.id) {
      const linhas = itensEstoqueUsados.filter(l => l.item_id && parseFloat(l.quantidade) > 0)
      const motivo = `Sanidade: ${form.procedimento} em ${fmtData(form.data)}`
      const saldosLocais = {}
      for (const linha of linhas) {
        const item = estoqueItens.find(i => i.id === linha.item_id)
        if (!item) continue
        if (!(linha.item_id in saldosLocais)) saldosLocais[linha.item_id] = parseFloat(item.quantidade)
        const qt = parseFloat(linha.quantidade)

        const { error: errMov } = await db.movEstoque.insert({
          item_id: linha.item_id, data: form.data, tipo: 'S', quantidade: qt,
          motivo, procedimento_id: procData.id,
        })
        if (errMov) {
          toast(`Procedimento salvo, mas falhou ao baixar "${item.item}" do estoque: ${errMov.message}. As baixas seguintes foram interrompidas — confira em Estoque.`, 'error')
          break // não tenta as próximas linhas — evita baixas fora de ordem sem a anterior registrada
        }

        saldosLocais[linha.item_id] -= qt
        const { error: errSaldo } = await db.estoque.update(linha.item_id, { quantidade: saldosLocais[linha.item_id] })
        if (errSaldo) {
          // A movimentação JÁ existe (passo anterior deu certo) — o saldo é
          // que não foi ajustado. Não interrompe as próximas linhas: cada uma
          // é independente, e a inconsistência desta já ficou visível/auditável.
          toast(`Baixa de "${item.item}" registrada, mas o saldo não foi atualizado automaticamente: ${errSaldo.message}. Confira e ajuste em Estoque.`, 'error')
        }
      }
    }

    setSaving(false)
    toast('Procedimento registrado!')
    setModal(false); setForm({}); resetFormSelecao(); load()
  }

  // Reverte a baixa de estoque (se houver) antes de apagar o procedimento —
  // mesmo princípio da reversão de compra/venda (Financeiro): soma de volta,
  // depois apaga o registro. Leitura fresca do banco (não confia no cache
  // local movsPorProcedimento, que pode estar um pouco desatualizado) — é 1
  // query a mais, mas evita reverter com base em dado velho E é a mesma leitura
  // que decide o guard de permissão abaixo (nunca libera por engano com o cache
  // vazio/desatualizado). Pára no primeiro erro (NÃO segue pra apagar o
  // procedimento) — melhor deixar uma exclusão parcialmente feita e o usuário
  // tentar de novo do que apagar o procedimento com estoque ainda inconsistente.
  const excluir = async (id) => {
    if (!podeEditarSanidadeCiclo) return
    const { data: movsLigadas, error: errMovs } = await db.movEstoque.listPorProcedimento(id)
    if (errMovs) { toast('Erro ao verificar itens de estoque ligados: ' + errMovs.message, 'error'); return }

    // Reversão de baixa de estoque deixou de ser "efeito colateral livre" da
    // exclusão de sanidade — decisão do usuário: se o procedimento baixou
    // estoque, excluí-lo (e devolver o saldo) também exige podeEditar('estoque'),
    // não só sanidade. Bloqueia ANTES de tocar em qualquer coisa — o guard vem
    // logo depois da leitura fresca, antes do loop que muda saldo/apaga linhas.
    if ((movsLigadas?.length) && !podeEditarEstoque) {
      toast('Este registro baixou itens do estoque. É necessária permissão de edição no módulo Estoque para excluí-lo.', 'error')
      return
    }

    const saldosLocais = {}
    for (const m of (movsLigadas || [])) {
      const item = estoqueItens.find(i => i.id === m.item_id)
      const atualConhecido = item ? parseFloat(item.quantidade) : null
      if (atualConhecido !== null) {
        if (!(m.item_id in saldosLocais)) saldosLocais[m.item_id] = atualConhecido
        saldosLocais[m.item_id] += parseFloat(m.quantidade)
        const { error: errSaldo } = await db.estoque.update(m.item_id, { quantidade: saldosLocais[m.item_id] })
        if (errSaldo) {
          toast(`Erro ao devolver "${m.item?.item || 'item'}" ao estoque: ${errSaldo.message}. Exclusão interrompida — nada foi apagado.`, 'error')
          return
        }
      }
      const { error: errDelMov } = await db.movEstoque.delete(m.id)
      if (errDelMov) {
        toast('Erro ao remover movimentação de estoque: ' + errDelMov.message + '. Exclusão interrompida.', 'error')
        return
      }
    }

    const { error: errVinc } = await db.sanidadeAnimais.deletePorProcedimento(id)
    if (errVinc) { toast('Erro ao remover vínculos de animais: ' + errVinc.message, 'error'); return }

    const { error } = await db.sanidade.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Registro removido' + ((movsLigadas?.length) ? ' — estoque devolvido.' : '.'))
    load()
  }

  const concluirAlerta = async (d) => {
    if (!podeEditarSanidadeCiclo) return
    setConcluindoId(d.id)
    const { error } = await db.sanidade.update(d.id, { proximo_concluido_em: hojeISO() })
    setConcluindoId(null)
    if (error) { toast('Erro ao concluir: ' + error.message, 'error'); return }
    toast('Alerta concluído!')
    setOfertaNovoProc(d)
    load()
  }

  const registrarAplicacaoDoAlerta = (d) => {
    resetFormSelecao()
    setForm({ tipo: d.tipo, procedimento: d.procedimento, data: hojeISO() })
    setOfertaNovoProc(null)
    setModal(true)
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

  const hoje    = hojeAgora()
  const em30    = hojeAgora(); em30.setDate(em30.getDate() + 30)
  const vencidos = dados.filter(d => d.proximo && !d.proximo_concluido_em && new Date(d.proximo + 'T12:00:00') < hoje)
  const proximos = dados.filter(d => d.proximo && !d.proximo_concluido_em && new Date(d.proximo + 'T12:00:00') >= hoje && new Date(d.proximo + 'T12:00:00') <= em30)

  // Filtra os registros (Registros/Histórico) pelo ciclo local; Alertas mostra
  // sempre tudo, pois trata de vencimentos futuros, não do período de registro.
  const dadosFiltrados = dados.filter(d => cicloLocal && dentroDoCiclo(d.data, cicloLocal))

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={load} />

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

      <BannerCicloEncerrado ciclo={cicloLocal} />

      <div className="tabs-bar">
        {TABS.map((t, i) => (
          <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {/* ── Registros ── */}
      {tab === 0 && (
        <div>
          <div className="sanidade-reg-header">
            <span className="sanidade-reg-count">{dadosFiltrados.length} procedimentos</span>
            <div className="sanidade-reg-pdf">
              <BotaoPDF contentRef={refReg} filename="sanidade-registros" titulo="Sanidade: Registros" />
            </div>
            {podeEditarSanidadeCiclo && (
              <div className="sanidade-reg-novo">
                <button className="btn btn-primary btn-sm" onClick={() => { resetFormSelecao(); setForm({ tipo:'Vacina' }); setModal(true) }}>
                  <i className="ti ti-plus" /> Novo procedimento
                </button>
              </div>
            )}
          </div>
          <div ref={refReg}>
          {dadosFiltrados.length === 0
            ? <EmptyState icon="💉" title="Nenhum procedimento registrado neste ciclo"
                action={podeEditarSanidadeCiclo ? <button className="btn btn-primary btn-sm" onClick={()=>{resetFormSelecao();setForm({tipo:'Vacina'});setModal(true)}}><i className="ti ti-plus"/>Registrar</button> : undefined}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Grupo/Lote</th><th>Qt</th><th>Próximo</th><th></th></tr>
                  </thead>
                  <tbody>
                    {dadosFiltrados.map(d => {
                      const prx = d.proximo ? new Date(d.proximo + 'T12:00:00') : null
                      const venc = prx && prx < hoje
                      return (
                        <tr key={d.id}>
                          <td>{fmtData(d.data)}</td>
                          <td><Badge color={COR_TP[d.tipo] || 'gray'}>{d.tipo}</Badge></td>
                          <td style={{ fontWeight:500 }}>
                            {d.procedimento}
                            {movsPorProcedimento[d.id]?.length > 0 && (
                              <i className="ti ti-package" style={{ fontSize:12, color:'#7B2FBE', marginLeft:5 }}
                                title={`Estoque baixado: ${movsPorProcedimento[d.id].map(m => `${parseFloat(m.quantidade).toFixed(1)} ${m.item?.unidade || ''} de ${m.item?.item || 'item'}`).join(', ')}`} />
                            )}
                          </td>
                          <td style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{d.lote_descricao}</td>
                          <td>{d.quantidade || '—'}</td>
                          <td style={{ color: venc ? '#791F1F' : '#6B7280', fontSize:'.78rem' }}>
                            {d.proximo ? fmtData(d.proximo) : '—'}
                            {venc && ' ⚠️'}
                          </td>
                          <td style={{ whiteSpace:'nowrap' }}>
                            {podeEditarSanidadeCiclo && (
                              <>
                                <button className="btn-icon" onClick={() => abrirEditar(d)} title="Editar">
                                  <i className="ti ti-edit" style={{ fontSize:13 }} />
                                </button>
                                <button className="btn-icon" onClick={() => setConfirmDel(d)} title="Excluir">
                                  <i className="ti ti-trash" style={{ fontSize:13 }} />
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
          </div>{/* end refReg */}
        </div>
      )}

      {/* ── Alertas ── */}
      {tab === 1 && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
            <BotaoPDF contentRef={refAlertas} filename="sanidade-alertas" titulo="Sanidade: Alertas" />
          </div>
          <div ref={refAlertas}>
          {vencidos.length === 0 && proximos.length === 0 && (
            <AlertBox type="green" title="Tudo em dia!" body="Nenhum procedimento vencido ou próximo do prazo." />
          )}
          {vencidos.map(d => (
            <AlertBox key={d.id} type="red"
              title={`${d.procedimento} — vencido`}
              body={`${d.lote_descricao} · Deveria ter sido aplicado em ${fmtData(d.proximo)} · ${diasDesde(d.proximo)} dias em atraso`}
              action={podeEditarSanidadeCiclo && (
                <button className="btn btn-secondary btn-xs" disabled={concluindoId === d.id} onClick={() => concluirAlerta(d)}>
                  <i className="ti ti-check" /> {concluindoId === d.id ? 'Concluindo...' : 'Marcar como concluído'}
                </button>
              )}
            />
          ))}
          {proximos.map(d => (
            <AlertBox key={d.id} type="amber"
              title={`${d.procedimento} — próximo`}
              body={`${d.lote_descricao} · Previsto para ${fmtData(d.proximo)} · ${d.quantidade || ''} animais`}
              action={podeEditarSanidadeCiclo && (
                <button className="btn btn-secondary btn-xs" disabled={concluindoId === d.id} onClick={() => concluirAlerta(d)}>
                  <i className="ti ti-check" /> {concluindoId === d.id ? 'Concluindo...' : 'Marcar como concluído'}
                </button>
              )}
            />
          ))}
          <div className="card" style={{ marginTop:12 }}>
            <div className="card-title"><i className="ti ti-calendar-event" /> Calendário sanitário — próximos 90 dias</div>
            {dados
              .filter(d => d.proximo && !d.proximo_concluido_em)
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
                      color: dias < 0 ? '#791F1F' : dias < 30 ? '#BA7517' : '#1E55B0'
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
            <BotaoPDF contentRef={refHist} filename="sanidade-historico" titulo="Sanidade: Histórico" />
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
        onConfirm={() => excluir(confirmDel.id)}
        title="Excluir procedimento"
        message={(() => {
          const movs = confirmDel ? (movsPorProcedimento[confirmDel.id] || []) : []
          if (movs.length === 0) return 'Excluir este procedimento? Esta ação não pode ser desfeita.'
          const efeito = movs.map(m => `${parseFloat(m.quantidade).toFixed(1)} ${m.item?.unidade || ''} de ${m.item?.item || 'item'}`).join(', ')
          return `Isto vai devolver ${efeito} ao estoque, e apagar o procedimento e seus vínculos. Esta ação não pode ser desfeita.`
        })()}
        danger
      />

      <Confirm
        open={!!ofertaNovoProc}
        onClose={() => setOfertaNovoProc(null)}
        onConfirm={() => registrarAplicacaoDoAlerta(ofertaNovoProc)}
        title="Registrar aplicação agora?"
        message="Alerta concluído. Deseja já registrar esta aplicação como um novo procedimento (com a data de hoje)? Você poderá selecionar o lote/animais e informar a próxima data, se houver."
      />

      {/* ── Modal ── */}
      <Modal open={modal} onClose={fecharModal} title={editandoId ? 'Editar procedimento sanitário' : 'Novo procedimento sanitário'} width={540}>
        {!editandoId && (
          <>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
              <MicButton hint='Voz: "vacina — febre aftosa — todo rebanho — dezesseis animais"' onResult={vozSan} />
            </div>
            <div style={{ fontSize:'.78rem', background:'#EEEDFE', color:'#3C3489', padding:'7px 10px', borderRadius:8, marginBottom:12 }}>
              <i className="ti ti-microphone" style={{fontSize:12}}/> Voz: <b>"Vermifugação — Ivermectina — todo rebanho — dezesseis animais"</b>
            </div>
          </>
        )}
        <div className="grid-form">
          <Field label="Data" required>
            <input type="date" value={form.data||''} onChange={e => {
              const novaData = e.target.value
              // Trocar a data DEPOIS de já ter selecionado animais (modo
              // individual) pode deixar a seleção inválida — revalida e
              // desmarca, mesmo padrão usado na venda (Financeiro.jsx) e nas
              // pesagens.
              if (modoSelecao === 'individual' && novaData) {
                const invalidos = animais.filter(a => selAnimais.includes(a.id) && a.data_nascimento && a.data_nascimento > novaData)
                if (invalidos.length > 0) {
                  setForm(p => ({ ...p, data: novaData }))
                  setSelAnimais(prev => prev.filter(id => !invalidos.some(a => a.id === id)))
                  toast(`${invalidos.length} animal(is) desmarcado(s) por nascer depois da nova data: ${invalidos.map(a => a.brinco).join(', ')}.`, 'error')
                  return
                }
              }
              setForm(p => ({ ...p, data: novaData }))
            }}/>
          </Field>
          <Field label="Tipo" required>
            <select value={form.tipo||'Vacina'} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))}>
              {TIPOS.map(t => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Procedimento" required><input value={form.procedimento||''} onChange={e=>setForm(p=>({...p,procedimento:e.target.value}))} placeholder="ex: Ivermectina 1%"/></Field>
          {!editandoId && (
            <Field label={autoQtd !== null ? `Quantidade (auto: ${autoQtd} animais)` : 'Quantidade de animais'}>
              {autoQtd !== null
                ? <input type="number" value={autoQtd} readOnly style={{ background:'#F0F9EC', color:'#1E55B0', fontWeight:600, cursor:'default' }} />
                : <input type="number" value={form.quantidade||''} onChange={e=>setForm(p=>({...p,quantidade:e.target.value}))} placeholder="0"/>
              }
            </Field>
          )}
          {!editandoId && (
          <div style={{ gridColumn:'1 / -1' }}>
            <label style={{ fontSize:'.78rem', fontWeight:500, color:'#374151', display:'block', marginBottom:6 }}>Seleção de animais</label>
            <div className="pill-group" style={{ marginBottom:8 }}>
              <button type="button" className={`pill ${modoSelecao==='lote'?'active':''}`} onClick={() => setModoSelecao('lote')}>Por lote</button>
              <button type="button" className={`pill ${modoSelecao==='individual'?'active':''}`} onClick={() => setModoSelecao('individual')}>Individual</button>
            </div>

            {modoSelecao === 'lote' ? (
              <>
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
              </>
            ) : (
              <>
                <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                  <select value={filtroCategSan} onChange={e => setFiltroCategSan(e.target.value)}
                    className="input" style={{ flex:1, minWidth:140 }}>
                    <option value="">Todas as categorias</option>
                    {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filtroPropSan} onChange={e => setFiltroPropSan(e.target.value)}
                    className="input" style={{ flex:1, minWidth:140 }}>
                    <option value="">Todos os proprietários</option>
                    {props.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                {animaisFiltradosSan.length > 0 && (
                  <button type="button" className="btn btn-secondary btn-xs" style={{ marginBottom:8 }}
                    onClick={() => {
                      const idsFiltrados = animaisFiltradosSan.map(a => a.id)
                      const todosMarcados = idsFiltrados.every(id => selAnimais.includes(id))
                      if (todosMarcados) {
                        setSelAnimais(prev => prev.filter(id => !idsFiltrados.includes(id)))
                      } else {
                        setSelAnimais(prev => [...new Set([...prev, ...idsFiltrados])])
                      }
                    }}>
                    {animaisFiltradosSan.every(a => selAnimais.includes(a.id)) ? 'Desmarcar todos do filtro' : 'Selecionar todos do filtro'}
                  </button>
                )}
                <div style={{ border:'.5px solid #E5E7EB', borderRadius:8, background:'#F9FAFB', padding:'6px 10px', maxHeight:180, overflowY:'auto' }}>
                  {animaisFiltradosSan.length === 0
                    ? <div style={{ fontSize:'.8rem', color:'#9CA3AF', textAlign:'center', padding:'8px 0' }}>Nenhum animal encontrado</div>
                    : animaisFiltradosSan.map(a => {
                        const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
                        return (
                          <label key={a.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 4px', cursor:'pointer', fontSize:'.83rem', borderBottom:'.5px solid #F3F4F6' }}>
                            <input type="checkbox" checked={selAnimais.includes(a.id)} onChange={() => togAnimal(a.id)} />
                            <strong>{a.brinco}</strong>
                            <span style={{ fontSize:'.75rem', color:'#7B2FBE', fontWeight:500 }}>{cat}</span>
                            <span style={{ fontSize:'.75rem', color:'#9CA3AF' }}>{a.proprietario?.nome?.split(' ')[0] || ''}</span>
                          </label>
                        )
                      })
                  }
                </div>
                {selAnimais.length > 0 && (
                  <div style={{ fontSize:'.72rem', color:'#6B7280', marginTop:4 }}>{selAnimais.length} animal(is) selecionado(s)</div>
                )}
              </>
            )}
          </div>
          )}
          {/* Bloco D6 — baixa de estoque opcional, só na criação (editar não
              reabre isto, mesmo motivo de não reabrir a seleção de animais
              acima: é um passo de CRIAÇÃO) e só pra quem tem permissão de
              estoque também (sem ela, a seção nem existe — ver podeEditarEstoque). */}
          {!editandoId && podeEditarEstoque && (
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={{ fontSize:'.78rem', fontWeight:500, color:'#374151', display:'block', marginBottom:6 }}>
                Itens do estoque utilizados <span style={{ fontWeight:400, color:'#9CA3AF' }}>(opcional)</span>
              </label>
              {itensEstoqueUsados.map((linha, idx) => {
                const item = itensEstoqueDisponiveis.find(i => i.id === linha.item_id)
                return (
                  <div key={idx} style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
                    <select value={linha.item_id} onChange={e => atualizarLinhaEstoque(idx, { item_id: e.target.value })}
                      style={{ flex:2 }}>
                      <option value="">— selecione o item —</option>
                      {itensEstoqueDisponiveis.map(i => (
                        <option key={i.id} value={i.id}>{i.item} ({parseFloat(i.quantidade).toFixed(1)} {i.unidade} disp.)</option>
                      ))}
                    </select>
                    <input type="number" step="0.1" min="0" placeholder="Qtde" value={linha.quantidade}
                      onChange={e => atualizarLinhaEstoque(idx, { quantidade: e.target.value })}
                      style={{ flex:1 }} />
                    {item && <span style={{ fontSize:'.72rem', color:'#9CA3AF', minWidth:28 }}>{item.unidade}</span>}
                    <button type="button" className="btn-icon" onClick={() => removerLinhaEstoque(idx)} title="Remover">
                      <i className="ti ti-trash" style={{ fontSize:13 }} />
                    </button>
                  </div>
                )
              })}
              <button type="button" className="btn btn-secondary btn-xs" onClick={adicionarLinhaEstoque}
                disabled={itensEstoqueDisponiveis.length === 0}>
                <i className="ti ti-plus" /> Adicionar item do estoque
              </button>
              {itensEstoqueDisponiveis.length === 0 && (
                <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginTop:4 }}>Nenhum item de Medicamento/Vacina com saldo disponível.</div>
              )}
            </div>
          )}
          {editandoId && movsPorProcedimento[editandoId]?.length > 0 && (
            <div style={{ gridColumn:'1 / -1', background:'#F9FAFB', border:'.5px solid #E5E7EB', borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:'.78rem', fontWeight:500, color:'#374151', marginBottom:4 }}>Itens do estoque baixados por este procedimento</div>
              {movsPorProcedimento[editandoId].map(m => (
                <div key={m.id} style={{ fontSize:'.78rem', color:'#374151' }}>
                  {parseFloat(m.quantidade).toFixed(1)} {m.item?.unidade} de {m.item?.item}
                </div>
              ))}
              <div style={{ fontSize:'.7rem', color:'#9CA3AF', marginTop:4 }}>
                Não editável aqui — pra corrigir, exclua o procedimento (devolve ao estoque) e registre de novo.
              </div>
            </div>
          )}
          <Field label="Próxima aplicação"><input type="date" value={form.proximo||''} onChange={e=>setForm(p=>({...p,proximo:e.target.value}))}/></Field>
        </div>
        <Field label="Observações"><input value={form.obs||''} onChange={e=>setForm(p=>({...p,obs:e.target.value}))} placeholder="opcional"/></Field>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>{saving?'Salvando...':<><i className="ti ti-check"/>Salvar</>}</button>
          <button className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
