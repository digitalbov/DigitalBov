import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { fmtData, diasDesde, calcCategoriaRebanho, algumErro, capitalizarPrimeira, sanidadeRealizada, sanidadeAgendada, labelTipoSanidade } from '../lib/helpers'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { validarSaldoEstoque, aplicarMovimentacaoEstoque, reverterCascata } from '../lib/estoqueFinanceiro'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento, BadgeSomenteLeitura } from '../components/UI'

const TABS   = ['Registros','Calendário de vacinação','Alertas','Histórico']
// TIPOS é o valor GRAVADO (procedimentos_sanitarios.tipo) — sempre singular,
// nunca muda. COR_TP também é indexado por esse valor cru. O rótulo exibido
// na tela é outra coisa (labelTipoSanidade/LABEL_TIPO_SANIDADE, helpers.js) —
// nunca comparar nem indexar por rótulo, só pelo valor de TIPOS.
const TIPOS  = ['Vacina','Vermifugação','Ectoparasita','Medicação','Exame']
const COR_TP = { Vacina:'green', Vermifugação:'blue', Ectoparasita:'amber', Medicação:'purple', Exame:'gray' }

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
  const { dentroDoCiclo, cicloDaData, dataEhEditavel, cicloSelecionado: cicloLocal } = useCiclo()
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
  // Fase 7 — 'novo' | 'editar' (registro realizado, como já era) |
  // 'editar-agendamento' (troca campos + animais, continua agendado) |
  // 'concluir' (idem + status vira 'realizado' + pode baixar estoque agora).
  const [modalIntent, setModalIntent] = useState('novo')
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

  const fecharModal = () => { setModal(false); setForm({}); setEditandoId(null); setModalIntent('novo'); resetFormSelecao() }

  const abrirNovo = () => {
    if (!podeEditarSanidadeCiclo) return
    resetFormSelecao()
    setEditandoId(null)
    setModalIntent('novo')
    setForm({ tipo: 'Vacina', data: hojeISO() })
    setModal(true)
  }

  // Editar um registro REALIZADO só toca nos campos do registro em si (data/
  // tipo/procedimento/próximo/observações) — não reabre a seleção de lote/
  // animais, que é um passo de CRIAÇÃO (vínculos em sanidade_animais) e não
  // faz parte do que foi pedido aqui. Diferente de abrirEditarAgendamento
  // abaixo (Fase 7), que reabre tudo porque agendamento é editável por inteiro.
  const abrirEditar = (d) => {
    if (!podeEditarSanidadeCiclo) return
    resetFormSelecao()
    setEditandoId(d.id)
    setModalIntent('editar')
    setForm({
      data:         d.data,
      tipo:         d.tipo,
      procedimento: d.procedimento,
      proximo:      d.proximo || '',
      obs:          d.observacoes || '',
    })
    setModal(true)
  }

  // Fase 7 — abre o modal de EDIÇÃO de um AGENDAMENTO (status='agendado'):
  // todos os campos editáveis, inclusive trocar os animais (recarrega a
  // seleção a partir dos vínculos atuais em sanidade_animais) e os itens de
  // estoque PREVISTOS (carregados de itens_previstos — reaproveita o mesmo
  // estado/UI de itensEstoqueUsados, só que aqui é planejamento: NUNCA baixa
  // estoque, só grava no jsonb). Continua agendado ao salvar — a baixa de
  // verdade só acontece na conclusão (ver confirmarConclusao abaixo).
  const abrirEditarAgendamento = async (d) => {
    if (!podeEditarSanidadeCiclo) return
    resetFormSelecao()
    setEditandoId(d.id)
    setModalIntent('editar-agendamento')
    setForm({
      data:         d.data,
      tipo:         d.tipo,
      procedimento: d.procedimento,
      proximo:      d.proximo || '',
      obs:          d.observacoes || '',
    })
    setModoSelecao('individual')
    setItensEstoqueUsados((d.itens_previstos || []).map(it => ({ item_id: it.item_id, quantidade: String(it.quantidade) })))
    setModal(true)
    const { data: vincs, error } = await db.sanidadeAnimais.listPorProcedimento(d.id)
    if (error) { toast('Erro ao carregar animais vinculados: ' + error.message, 'error'); return }
    setSelAnimais((vincs || []).map(v => v.animal_id))
  }

  // Fase 7 — CONCLUIR um agendamento é uma confirmação curta, não um modal de
  // edição (edição é uma ação separada — ver abrirEditarAgendamento acima).
  // confirmConcluir guarda o registro sendo concluído, só pra montar o resumo
  // no <Confirm>; confirmarConclusao é chamado com esse mesmo registro.
  const [confirmConcluir, setConfirmConcluir] = useState(null)

  const confirmarConclusao = async (d) => {
    if (!d || !podeEditarSanidadeCiclo) return
    // Não dá pra "concluir" algo que ainda não aconteceu — a data tem que
    // estar em hoje ou no passado. Se o usuário quer mudar a data, usa Editar
    // primeiro (fluxo separado) e só depois conclui.
    if (d.data > hojeISO()) {
      toast(`A data deste agendamento (${fmtData(d.data)}) ainda é futura — edite a data para hoje ou uma data passada antes de concluir.`, 'error')
      return
    }
    if (!dataEhEditavel(d.data)) {
      const c = cicloDaData(d.data)
      toast(c
        ? 'Não é possível concluir: a data está fora do ciclo atual (ou em um ciclo já encerrado). Edite a data antes de concluir.'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }

    const previstos = d.itens_previstos || []
    if (previstos.length > 0) {
      // Item previsto que não existe mais no estoque (excluído desde o
      // agendamento) é tratado como saldo insuficiente — mesma decisão,
      // mesmo bloqueio total, mensagem clara de qual item.
      const removido = previstos.find(p => !estoqueItens.some(i => i.id === p.item_id))
      if (removido) {
        toast(`Não é possível concluir: um item previsto foi excluído do estoque. Edite o agendamento e ajuste os itens previstos antes de concluir.`, 'error')
        return
      }
      // Bloqueia tudo se faltar saldo em qualquer item — nunca baixa parcial.
      const erroSaldo = validarSaldoEstoque(estoqueItens, previstos)
      if (erroSaldo) { toast(erroSaldo, 'error'); return }
    }

    const { error } = await db.sanidade.update(d.id, { status: 'realizado' })
    if (error) { toast('Erro: ' + error.message, 'error'); return }

    // A partir daqui itens_previstos deixa de valer — a movimentação real
    // (vinculada ao procedimento) é que passa a ser a fonte de verdade, é ela
    // que reverterCascata usa se o registro for excluído depois.
    if (podeEditarEstoque && previstos.length > 0) {
      await aplicarBaixaEstoque(d.id, d.data, d.procedimento, previstos.map(p => ({ item_id: p.item_id, quantidade: String(p.quantidade) })))
    }

    toast('Vacinação concluída!')
    load()
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

  // Fase 7 — mesmo filtro de data_nascimento usado hoje (individual e por
  // lote), fatorado pra ser reusado em 3 lugares: criação, editar-agendamento
  // e concluir. Uma função só, sem caminho paralelo.
  const animaisParaVincularAtual = () => {
    if (modoSelecao === 'individual') {
      return selAnimais.filter(id => {
        const a = animais.find(x => x.id === id)
        return !a?.data_nascimento || a.data_nascimento <= form.data
      })
    }
    if (modoSelecao === 'lote' && selLotes.length > 0) {
      const idsLotes = lotes.filter(l => selLotes.includes(l.nome)).map(l => l.id)
      return animais.filter(a =>
        idsLotes.includes(a.lote_id) && (!a.data_nascimento || a.data_nascimento <= form.data)
      ).map(a => a.id)
    }
    return []
  }

  const descricaoSelecaoAtual = () => modoSelecao === 'individual'
    ? (selAnimais.length > 0
        ? `Individual: ${animais.filter(a => selAnimais.includes(a.id)).map(a => a.brinco).join(', ')}`
        : 'Individual')
    : (selLotes.length > 0 ? selLotes.join(', ') : 'Geral')

  // Fase 7 — itens de estoque PREVISTOS de um agendamento, no formato salvo
  // em itens_previstos (jsonb [{item_id, quantidade}]) — usa o mesmo estado
  // itensEstoqueUsados da seção de estoque do form, só que aqui nunca vira
  // uma baixa de verdade (ver mostrarEstoqueForm/modoEstoquePrevisto abaixo).
  const itensPrevistosAtual = () => itensEstoqueUsados
    .filter(l => l.item_id && parseFloat(l.quantidade) > 0)
    .map(l => ({ item_id: l.item_id, quantidade: parseFloat(l.quantidade) }))

  // Apaga e recria os vínculos em sanidade_animais a partir da seleção ATUAL
  // — usada na criação, ao editar um agendamento (trocar animais) e ao
  // concluir. Delete de um procedimento sem vínculo nenhum (caso da criação)
  // é um no-op seguro. Retorna string de erro ou null.
  const sincronizarVinculos = async (procedimentoId) => {
    const ids = animaisParaVincularAtual()
    const { error: errDel } = await db.sanidadeAnimais.deletePorProcedimento(procedimentoId)
    if (errDel) return errDel.message
    if (ids.length === 0) return null
    const vinculos = ids.map(animalId => ({
      conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, procedimento_id: procedimentoId, animal_id: animalId,
    }))
    const { error: errIns } = await db.sanidadeAnimais.inserirVarios(vinculos)
    return errIns ? errIns.message : null
  }

  // Baixa de estoque (Bloco D6, opcional) — por procedimento, não por animal
  // (ver diagnóstico). Usa aplicarMovimentacaoEstoque (Bloco D10 — módulo
  // compartilhado), que já grava a movimentação ANTES de ajustar o saldo
  // (ordem auditável). itensSnapshot avança a cada linha, pra 2 linhas do
  // mesmo item descontarem em sequência. Fatorada (Fase 7) pra ser chamada
  // tanto ao criar um registro já realizado (linhasBrutas = itensEstoqueUsados
  // do form) quanto ao concluir um agendamento (linhasBrutas = itens_previstos
  // do registro, já que o form não está aberto nessa confirmação) — nenhum
  // caminho paralelo de baixa de estoque. Recebe as linhas por parâmetro (não
  // lê itensEstoqueUsados direto) justamente pra servir aos dois casos.
  const aplicarBaixaEstoque = async (procedimentoId, dataProced, procedimentoNome, linhasBrutas) => {
    const linhas = linhasBrutas.filter(l => l.item_id && parseFloat(l.quantidade) > 0)
    if (linhas.length === 0) return
    const motivo = `Sanidade: ${procedimentoNome} em ${fmtData(dataProced)}`
    let itensSnapshot = estoqueItens
    for (const linha of linhas) {
      const item = itensSnapshot.find(i => i.id === linha.item_id)
      if (!item) continue
      const r = await aplicarMovimentacaoEstoque({
        itemId: linha.item_id, tipo: 'S', quantidade: linha.quantidade, data: dataProced,
        motivo, vinculo: { procedimento_id: procedimentoId }, itensEstoque: itensSnapshot,
      })
      if (r.error && !r.movJaGravada) {
        toast(`Salvo, mas falhou ao baixar "${item.item}" do estoque: ${r.error.message}. As baixas seguintes foram interrompidas — confira em Estoque.`, 'error')
        break // não tenta as próximas linhas — evita baixas fora de ordem sem a anterior registrada
      }
      if (r.error && r.movJaGravada) {
        // A movimentação JÁ existe (passo anterior deu certo) — o saldo é
        // que não foi ajustado. Não interrompe as próximas linhas: cada uma
        // é independente, e a inconsistência desta já ficou visível/auditável.
        toast(`Baixa de "${item.item}" registrada, mas o saldo não foi atualizado automaticamente: ${r.error.message}. Confira e ajuste em Estoque.`, 'error')
        continue // não avança o snapshot pra este item — saldo real não mudou
      }
      itensSnapshot = itensSnapshot.map(i => i.id === linha.item_id ? { ...i, quantidade: r.novaQt } : i)
    }
  }

  const salvar = async () => {
    if (!podeEditarSanidadeCiclo) return
    if (!form.data || !form.tipo || !form.procedimento) {
      toast('Preencha data, tipo e procedimento.', 'error'); return
    }

    // Fase 7 — um agendamento (criação com data futura, ou edição de um que
    // já é agendado) não é evento financeiro/operacional até ser concluído,
    // então pula o guard de ciclo. Editar um registro REALIZADO continua
    // exigindo data dentro do ciclo atual/carência — concluir um agendamento
    // (que também exige isso) não passa mais por aqui, tem fluxo próprio (ver
    // confirmarConclusao).
    const criandoAgendamento = !editandoId && form.data > hojeISO()
    const puloGuardCiclo = criandoAgendamento || modalIntent === 'editar-agendamento'
    if (!puloGuardCiclo && !dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }

    // Baixa de estoque só acontece ao criar um registro já realizado (data
    // hoje/passada) — nunca ao criar/editar um agendamento (ele não baixa
    // nada enquanto não for concluído, e concluir não passa mais por aqui).
    const vaiAplicarEstoque = !editandoId && !criandoAgendamento
    if (vaiAplicarEstoque) {
      const pedidos = itensEstoqueUsados.filter(l => l.item_id && parseFloat(l.quantidade) > 0)
      const erroSaldo = validarSaldoEstoque(estoqueItens, pedidos)
      if (erroSaldo) { toast(erroSaldo, 'error'); return }
    }
    setSaving(true)

    // ── Editar registro REALIZADO (Registros) — só os campos do registro em
    // si, como já era antes da Fase 7. ──
    if (editandoId && modalIntent === 'editar') {
      const { error } = await db.sanidade.update(editandoId, {
        data:         form.data,
        tipo:         form.tipo,
        procedimento: capitalizarPrimeira(form.procedimento),
        proximo:      form.proximo || null,
        observacoes:  capitalizarPrimeira(form.obs) || ''
      })
      setSaving(false)
      if (error) { toast('Erro: ' + error.message, 'error'); return }
      toast('Procedimento atualizado!')
      fecharModal(); load()
      return
    }

    // ── Editar AGENDAMENTO sem concluir (Calendário de vacinação) — campos +
    // reselecionar animais, continua 'agendado'. ──
    if (editandoId && modalIntent === 'editar-agendamento') {
      const { error } = await db.sanidade.update(editandoId, {
        data:          form.data,
        tipo:          form.tipo,
        procedimento:  capitalizarPrimeira(form.procedimento),
        lote_descricao: descricaoSelecaoAtual(),
        quantidade:    autoQtd !== null ? autoQtd : (parseInt(form.quantidade) || 0),
        proximo:       form.proximo || null,
        observacoes:   capitalizarPrimeira(form.obs) || '',
        status:        'agendado',
        itens_previstos: itensPrevistosAtual(),
      })
      if (error) { setSaving(false); toast('Erro: ' + error.message, 'error'); return }
      const errVinc = await sincronizarVinculos(editandoId)
      setSaving(false)
      if (errVinc) toast('Agendamento atualizado, mas erro ao atualizar animais: ' + errVinc, 'error')
      else toast('Agendamento atualizado!')
      fecharModal(); load()
      return
    }

    // ── Novo procedimento — realizado imediato (data hoje/passada) OU novo
    // agendamento (data futura). ──
    const { data: procData, error } = await db.sanidade.insert({
      data:         form.data,
      tipo:         form.tipo,
      procedimento: capitalizarPrimeira(form.procedimento),
      lote_descricao: descricaoSelecaoAtual(),
      quantidade:   autoQtd !== null ? autoQtd : (parseInt(form.quantidade) || 0),
      proximo:      form.proximo || null,
      observacoes:  capitalizarPrimeira(form.obs) || '',
      status:       criandoAgendamento ? 'agendado' : 'realizado',
      itens_previstos: criandoAgendamento ? itensPrevistosAtual() : [],
    })
    if (error) { setSaving(false); toast('Erro: ' + error.message, 'error'); return }

    const errVinc = await sincronizarVinculos(procData.id)
    if (errVinc) toast('Procedimento salvo, mas erro ao vincular animais: ' + errVinc, 'error')

    if (vaiAplicarEstoque && podeEditarEstoque) {
      await aplicarBaixaEstoque(procData.id, form.data, form.procedimento, itensEstoqueUsados)
    }

    setSaving(false)
    toast(criandoAgendamento ? 'Vacinação agendada!' : 'Procedimento registrado!')
    fecharModal(); load()
  }

  // Reverte a baixa de estoque (se houver) antes de apagar o procedimento —
  // via reverterCascata (estoqueFinanceiro.js), usada também pelos caminhos
  // 2-5 (Financeiro <-> Estoque). Leitura fresca do banco (não confia no
  // cache local movsPorProcedimento) e pára no primeiro erro (NÃO segue pra
  // apagar o procedimento) — melhor deixar uma exclusão parcialmente feita e
  // o usuário tentar de novo do que apagar o procedimento com estoque ainda
  // inconsistente.
  const excluir = async (id) => {
    if (!podeEditarSanidadeCiclo) return
    // Reversão de baixa de estoque deixou de ser "efeito colateral livre" da
    // exclusão de sanidade — decisão do usuário: se o procedimento baixou
    // estoque, excluí-lo (e devolver o saldo) também exige podeEditar('estoque'),
    // não só sanidade. reverterCascata (Bloco D10 — módulo compartilhado) já
    // faz a leitura fresca, o guard de permissão e a reversão em 2 passadas.
    const rev = await reverterCascata({ procedimentoId: id, itensEstoque: estoqueItens, podeEditarEstoque })
    if (!rev.ok) { toast(rev.erro, 'error'); return }

    const { error: errVinc } = await db.sanidadeAnimais.deletePorProcedimento(id)
    if (errVinc) { toast('Erro ao remover vínculos de animais: ' + errVinc.message, 'error'); return }

    const { error } = await db.sanidade.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Registro removido' + (rev.movs.length ? ' — estoque devolvido.' : '.'))
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
    setEditandoId(null)
    setModalIntent('novo')
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
    toast(`Tipo: ${labelTipoSanidade(tipo)}${nums ? ` · ${nums[0]} animais` : ''}`)
  }

  const hoje    = hojeAgora()
  const em30    = hojeAgora(); em30.setDate(em30.getDate() + 30)
  const em90    = hojeAgora(); em90.setDate(em90.getDate() + 90)
  // Fase 7 — agendamento não é procedimento REALIZADO, então não gera alerta
  // de "próxima aplicação" (ele ainda nem aconteceu uma vez sequer) — isso
  // continua vindo só de dados REALIZADOS. Mas o próprio agendamento entra em
  // Alertas por outro motivo: dentro dos próximos 90 dias, ou vencido (passou
  // da data e ninguém concluiu — o caso mais importante de ver). Os dois tipos
  // (reaplicação de realizado × agendamento) ficam juntos nas mesmas seções
  // vencidos/próximos, ordenados por proximidade da data, cada um com um
  // _origem pra o JSX saber como renderizar (badge "Agendado" só no segundo).
  const vencidos = [
    ...dados.filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em && new Date(d.proximo + 'T12:00:00') < hoje)
      .map(d => ({ ...d, _origem: 'reaplicacao', _dataRef: d.proximo })),
    ...dados.filter(d => sanidadeAgendada(d) && new Date(d.data + 'T12:00:00') < hoje)
      .map(d => ({ ...d, _origem: 'agendamento', _dataRef: d.data })),
  ].sort((a, b) => a._dataRef.localeCompare(b._dataRef))
  const proximos = [
    ...dados.filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em && new Date(d.proximo + 'T12:00:00') >= hoje && new Date(d.proximo + 'T12:00:00') <= em30)
      .map(d => ({ ...d, _origem: 'reaplicacao', _dataRef: d.proximo })),
    ...dados.filter(d => sanidadeAgendada(d) && new Date(d.data + 'T12:00:00') >= hoje && new Date(d.data + 'T12:00:00') <= em90)
      .map(d => ({ ...d, _origem: 'agendamento', _dataRef: d.data })),
  ].sort((a, b) => a._dataRef.localeCompare(b._dataRef))

  // Filtra os registros (Registros/Histórico) pelo ciclo local; Alertas mostra
  // sempre tudo, pois trata de vencimentos futuros, não do período de registro.
  // Fase 7 — Registros/Alertas/Histórico só mostram REALIZADO; agendamento
  // vive só na aba Calendário de vacinação (dadosAgendados), sem filtro de
  // ciclo (é uma lista prospectiva, não presa ao período de um ciclo fechado).
  const dadosFiltrados = dados.filter(d => sanidadeRealizada(d) && cicloLocal && dentroDoCiclo(d.data, cicloLocal))
  const dadosAgendados = dados.filter(sanidadeAgendada).sort((a, b) => a.data.localeCompare(b.data))

  // Fase 7 — no modal, a seleção de animais e a visibilidade da seção de
  // estoque dependem do modo (novo/editar/editar-agendamento) e, numa
  // criação, também da data escolhida (futura = vira agendamento). Concluir
  // não usa mais este modal (é uma confirmação curta — ver confirmarConclusao),
  // então não aparece em nenhuma condição aqui. modoEstoquePrevisto distingue
  // planejamento (agendamento — grava em itens_previstos, nunca baixa) de
  // baixa imediata (registro já realizado — baixa de verdade ao salvar).
  const criandoAgendamentoForm = !editandoId && form.data && form.data > hojeISO()
  const mostrarSelecaoAnimais  = !editandoId || modalIntent === 'editar-agendamento'
  const modoEstoquePrevisto    = criandoAgendamentoForm || modalIntent === 'editar-agendamento'
  const mostrarEstoqueForm     = podeEditarEstoque && (!editandoId || modalIntent === 'editar-agendamento')

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={load} />

  // Botão único de PDF ao lado das abas (Fase 14) — "Calendário de vacinação"
  // (tab 1) não tem exportação própria.
  const pdfAtual = tab === 0 ? { ref: refReg,     filename:'sanidade-registros', titulo:'Sanidade: Registros' }
    : tab === 2 ? { ref: refAlertas, filename:'sanidade-alertas',   titulo:'Sanidade: Alertas' }
    : tab === 3 ? { ref: refHist,    filename:'sanidade-historico', titulo:'Sanidade: Histórico' }
    : null

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:14 }}>
        <BadgeSomenteLeitura ciclo={cicloLocal} />
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:16, borderBottom:'.5px solid var(--gray-200)' }}>
        <div className="tabs-bar" style={{ flex:1, minWidth:0, marginBottom:0, border:'none' }}>
          {TABS.map((t, i) => (
            <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
        {pdfAtual && <BotaoPDF contentRef={pdfAtual.ref} filename={pdfAtual.filename} titulo={pdfAtual.titulo} />}
      </div>

      {/* ── Registros ── */}
      {tab === 0 && (
        <div>
          <div className="sanidade-reg-header">
            <span className="sanidade-reg-count">{dadosFiltrados.length} procedimentos</span>
            {podeEditarSanidadeCiclo && (
              <div className="sanidade-reg-novo">
                <button className="btn btn-primary btn-sm" onClick={abrirNovo}>
                  <i className="ti ti-plus" /> Novo procedimento
                </button>
              </div>
            )}
          </div>
          <div ref={refReg}>
          {dadosFiltrados.length === 0
            ? <EmptyState icon="💉" title="Nenhum procedimento registrado neste ciclo"
                action={podeEditarSanidadeCiclo ? <button className="btn btn-primary btn-sm" onClick={abrirNovo}><i className="ti ti-plus"/>Registrar</button> : undefined}/>
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
                          <td><Badge color={COR_TP[d.tipo] || 'gray'}>{labelTipoSanidade(d.tipo)}</Badge></td>
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

      {/* ── Calendário de vacinação (Fase 7) — procedimentos com status='agendado'
          (data futura, ainda não concluídos). Nunca aparecem em Registros, na
          ficha do animal, em Alertas/Histórico nem em indicadores — só aqui e
          no módulo Calendário, até o usuário confirmar via "Marcar como
          concluído". ── */}
      {tab === 1 && (
        <div>
          <div className="sanidade-reg-header">
            <span className="sanidade-reg-count">{dadosAgendados.length} agendado{dadosAgendados.length===1?'':'s'}</span>
            {podeEditarSanidadeCiclo && (
              <div className="sanidade-reg-novo">
                <button className="btn btn-primary btn-sm" onClick={abrirNovo}>
                  <i className="ti ti-plus" /> Novo agendamento
                </button>
              </div>
            )}
          </div>
          {dadosAgendados.length === 0
            ? <EmptyState icon="📅" title="Nenhuma vacinação agendada"
                sub="Registre um procedimento com data futura para agendá-lo aqui."
                action={podeEditarSanidadeCiclo ? <button className="btn btn-primary btn-sm" onClick={abrirNovo}><i className="ti ti-plus"/>Agendar</button> : undefined}/>
            : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Grupo/Lote</th><th>Qt</th><th></th><th></th></tr>
                  </thead>
                  <tbody>
                    {dadosAgendados.map(d => (
                      <tr key={d.id}>
                        <td>{fmtData(d.data)}</td>
                        <td><Badge color={COR_TP[d.tipo] || 'gray'}>{labelTipoSanidade(d.tipo)}</Badge></td>
                        <td style={{ fontWeight:500 }}>
                          {d.procedimento}
                          {d.itens_previstos?.length > 0 && (
                            <i className="ti ti-package" style={{ fontSize:12, color:'#9CA3AF', marginLeft:5 }}
                              title={`Itens previstos (não baixados ainda): ${d.itens_previstos.map(p => {
                                const item = estoqueItens.find(i => i.id === p.item_id)
                                return item ? `${p.quantidade} ${item.unidade} de ${item.item}` : `${p.quantidade} de item excluído do estoque`
                              }).join(', ')}`} />
                          )}
                        </td>
                        <td style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{d.lote_descricao}</td>
                        <td>{d.quantidade || '—'}</td>
                        <td><Badge color="amber">Agendado</Badge></td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          {podeEditarSanidadeCiclo && (
                            <>
                              <button className="btn-icon" onClick={() => abrirEditarAgendamento(d)} title="Editar agendamento">
                                <i className="ti ti-edit" style={{ fontSize:13 }} />
                              </button>
                              <button className="btn-icon" onClick={() => setConfirmConcluir(d)} title="Marcar como concluído">
                                <i className="ti ti-check" style={{ fontSize:13, color:'#1E7A34' }} />
                              </button>
                              <button className="btn-icon" onClick={() => setConfirmDel(d)} title="Excluir">
                                <i className="ti ti-trash" style={{ fontSize:13 }} />
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
        </div>
      )}

      {/* ── Alertas ── */}
      {tab === 2 && (
        <div>
          <div ref={refAlertas}>
          {vencidos.length === 0 && proximos.length === 0 && (
            <AlertBox type="green" title="Tudo em dia!" body="Nenhum procedimento vencido ou próximo do prazo." />
          )}
          {vencidos.map(d => (
            <AlertBox key={d.id} type="red"
              title={d._origem === 'agendamento'
                ? <>{d.procedimento} — agendamento vencido <Badge color="amber">Agendado</Badge></>
                : `${d.procedimento} — vencido`}
              body={d._origem === 'agendamento'
                ? `${d.lote_descricao || 'Sem grupo/lote'} · Estava agendado para ${fmtData(d.data)} · ${diasDesde(d.data)} dias em atraso`
                : `${d.lote_descricao} · Deveria ter sido aplicado em ${fmtData(d.proximo)} · ${diasDesde(d.proximo)} dias em atraso`}
              action={podeEditarSanidadeCiclo && (
                d._origem === 'agendamento' ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => abrirEditarAgendamento(d)}><i className="ti ti-edit"/> Editar</button>
                    <button className="btn btn-secondary btn-xs" onClick={() => setConfirmConcluir(d)}><i className="ti ti-check"/> Concluir</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary btn-xs" disabled={concluindoId === d.id} onClick={() => concluirAlerta(d)}>
                    <i className="ti ti-check" /> {concluindoId === d.id ? 'Concluindo...' : 'Marcar como concluído'}
                  </button>
                )
              )}
            />
          ))}
          {proximos.map(d => (
            <AlertBox key={d.id} type="amber"
              title={d._origem === 'agendamento'
                ? <>{d.procedimento} — agendado <Badge color="amber">Agendado</Badge></>
                : `${d.procedimento} — próximo`}
              body={d._origem === 'agendamento'
                ? `${d.lote_descricao || 'Sem grupo/lote'} · Agendado para ${fmtData(d.data)} · ${d.quantidade || 0} animais`
                : `${d.lote_descricao} · Previsto para ${fmtData(d.proximo)} · ${d.quantidade || ''} animais`}
              action={podeEditarSanidadeCiclo && (
                d._origem === 'agendamento' ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-secondary btn-xs" onClick={() => abrirEditarAgendamento(d)}><i className="ti ti-edit"/> Editar</button>
                    <button className="btn btn-secondary btn-xs" onClick={() => setConfirmConcluir(d)}><i className="ti ti-check"/> Concluir</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary btn-xs" disabled={concluindoId === d.id} onClick={() => concluirAlerta(d)}>
                    <i className="ti ti-check" /> {concluindoId === d.id ? 'Concluindo...' : 'Marcar como concluído'}
                  </button>
                )
              )}
            />
          ))}
          <div className="card" style={{ marginTop:12 }}>
            <div className="card-title"><i className="ti ti-calendar-event" /> Calendário sanitário — próximos 90 dias</div>
            {dados
              .filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em)
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
      {tab === 3 && (
        <div>
          <div ref={refHist}>
          <div className="grid-3" style={{ marginBottom:16 }}>
            {TIPOS.map(tp => {
              const qt = dados.filter(d => sanidadeRealizada(d) && d.tipo === tp).length
              return (
                <div key={tp} className="kpi-card">
                  <div className="kpi-value">{qt}</div>
                  <div className="kpi-label">{labelTipoSanidade(tp)}</div>
                </div>
              )
            })}
          </div>
          <div className="card">
            <div className="card-title"><i className="ti ti-list" /> Histórico completo por tipo</div>
            {TIPOS.map(tp => {
              const lst = dados.filter(d => sanidadeRealizada(d) && d.tipo === tp)
              if (!lst.length) return null
              return (
                <div key={tp} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <Badge color={COR_TP[tp] || 'gray'}>{labelTipoSanidade(tp)}</Badge>
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
        title={confirmDel && sanidadeAgendada(confirmDel) ? 'Excluir agendamento' : 'Excluir procedimento'}
        message={(() => {
          if (!confirmDel) return ''
          if (sanidadeAgendada(confirmDel)) return 'Excluir este agendamento? Ele nunca baixou estoque nem afetou nada além da própria agenda — nada será revertido. Esta ação não pode ser desfeita.'
          const movs = movsPorProcedimento[confirmDel.id] || []
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

      {/* Fase 7 — concluir um agendamento é uma confirmação curta com o
          resumo, não um modal de edição (edição é uma ação separada). */}
      <Confirm
        open={!!confirmConcluir}
        onClose={() => setConfirmConcluir(null)}
        onConfirm={() => confirmarConclusao(confirmConcluir)}
        title="Marcar vacinação como concluída"
        message={confirmConcluir ? (() => {
          const previstos = confirmConcluir.itens_previstos || []
          const itensTxt = previstos.length > 0
            ? ' Itens previstos: ' + previstos.map(p => {
                const item = estoqueItens.find(i => i.id === p.item_id)
                return item ? `${p.quantidade} ${item.unidade} de ${item.item}` : `${p.quantidade} de item excluído do estoque`
              }).join(', ') + '.'
            : ''
          return `${fmtData(confirmConcluir.data)} · ${labelTipoSanidade(confirmConcluir.tipo)} — ${confirmConcluir.procedimento} · ${confirmConcluir.quantidade || 0} animal(is)${confirmConcluir.lote_descricao ? ` (${confirmConcluir.lote_descricao})` : ''}.${itensTxt} Confirma que esta vacinação foi realizada?`
        })() : ''}
      />

      {/* ── Modal ── */}
      <Modal open={modal} onClose={fecharModal} title={
        modalIntent === 'editar'             ? 'Editar procedimento sanitário' :
        modalIntent === 'editar-agendamento' ? 'Editar agendamento' :
        (criandoAgendamentoForm ? 'Novo agendamento' : 'Novo procedimento sanitário')
      } width={540}>
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
              {TIPOS.map(t => <option key={t} value={t}>{labelTipoSanidade(t)}</option>)}
            </select>
          </Field>
          <Field label="Procedimento" required><input value={form.procedimento||''} onChange={e=>setForm(p=>({...p,procedimento:e.target.value}))} placeholder="ex: Ivermectina 1%"/></Field>
          {mostrarSelecaoAnimais && (
            <Field label={autoQtd !== null ? `Quantidade (auto: ${autoQtd} animais)` : 'Quantidade de animais'}>
              {autoQtd !== null
                ? <input type="number" value={autoQtd} readOnly style={{ background:'#F0F9EC', color:'#1E55B0', fontWeight:600, cursor:'default' }} />
                : <input type="number" value={form.quantidade||''} onChange={e=>setForm(p=>({...p,quantidade:e.target.value}))} placeholder="0"/>
              }
            </Field>
          )}
          {mostrarSelecaoAnimais && (
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
          {/* Bloco D6 / Fase 7 — seção de estoque, em dois modos: baixa
              IMEDIATA (criar um registro já REALIZADO, data hoje/passada —
              baixa de verdade ao salvar) ou PREVISTO (criar/editar um
              agendamento — só grava em itens_previstos, nunca baixa; a baixa
              de verdade só acontece na confirmação de "Marcar como
              concluído" — ver confirmarConclusao). Nunca aparece ao editar um
              REALIZADO (mesmo motivo de não reabrir a seleção de animais
              acima). Só pra quem tem permissão de estoque também. */}
          {mostrarEstoqueForm && (
            <div style={{ gridColumn:'1 / -1' }}>
              <label style={{ fontSize:'.78rem', fontWeight:500, color:'#374151', display:'block', marginBottom:6 }}>
                {modoEstoquePrevisto ? 'Itens de estoque previstos' : 'Itens do estoque utilizados'}{' '}
                <span style={{ fontWeight:400, color:'#9CA3AF' }}>(opcional)</span>
              </label>
              {modoEstoquePrevisto && (
                <div style={{ fontSize:'.72rem', color:'#9CA3AF', marginBottom:8 }}>
                  Isto não baixa nada agora — é só planejamento. A baixa de estoque acontece quando você marcar como concluído.
                </div>
              )}
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
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : <><i className="ti ti-check"/>{criandoAgendamentoForm ? 'Agendar' : 'Salvar'}</>}
          </button>
          <button className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
        </div>
      </Modal>
    </div>
  )
}
