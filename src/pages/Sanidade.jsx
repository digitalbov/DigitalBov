import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { fmtData, diasDesde, calcCategoriaRebanho, algumErro, capitalizarPrimeira, sanidadeRealizada, sanidadeAgendada, sanidadeCancelada, labelTipoSanidade } from '../lib/helpers'
import { hoje as hojeAgora, hojeISO } from '../lib/hoje'
import { validarSaldoEstoque, aplicarMovimentacaoEstoque, reverterCascata } from '../lib/estoqueFinanceiro'
import { useSubmitGuard } from '../lib/useSubmitGuard'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento, BadgeSomenteLeitura } from '../components/UI'
import Filtros from '../components/Filtros'
import ModalAnimaisSanidade, { BotaoQtdAnimais, qtdAnimaisTexto } from '../components/ModalAnimaisSanidade'

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
  // Modal de lista de animais de um procedimento (substitui a célula que
  // despejava todos os brincos) — mesmo componente em Registros/Calendário de
  // vacinação/Alertas/Histórico, uma instância só, aberta com o procedimento
  // clicado. Vale pra desktop e celular (é dado/funcionalidade, não layout).
  const [procAnimaisModal, setProcAnimaisModal] = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  // Bloco D16 — ação sobre um alerta de reaplicação (Editar/Concluir/Não
  // realizado): gera o agendamento na hora se ainda não existir (ver
  // agirSobreAlerta abaixo), então aplica a ação nele. Guarda por item
  // (chave = d.id) — ações em alertas diferentes podem rodar em paralelo,
  // só bloqueia repetição no MESMO item.
  const guard = useSubmitGuard()
  const [reaplicacaoEmAndamentoId, setReaplicacaoEmAndamentoId] = useState(null)

  const [selAnimais,     setSelAnimais]     = useState([])
  const [filtroCategSan, setFiltroCategSan] = useState('')
  const [filtroPropSan,  setFiltroPropSan]  = useState('')
  const [filtroLoteSan,  setFiltroLoteSan]  = useState('')

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

  const togAnimal = (id) => setSelAnimais(prev =>
    prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
  )

  const resetFormSelecao = () => {
    setSelAnimais([])
    setFiltroCategSan(''); setFiltroPropSan(''); setFiltroLoteSan('')
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
  // Bloco D15 — cancelar MARCA (nunca apaga, mesmo raciocínio de
  // proximo_concluido_em). confirmCancelar guarda o registro pro resumo do
  // <Confirm>, mesmo padrão de confirmConcluir acima.
  const [confirmCancelar,  setConfirmCancelar]  = useState(null)
  const [canceladosAberto, setCanceladosAberto] = useState(false)

  // Bloco D15 — agendamento gerado automaticamente pela "Próxima aplicação"
  // de um procedimento JÁ REALIZADO. Mesma rotina de criação do "Novo
  // agendamento" manual (db.sanidade.insert com status='agendado') — só o
  // gatilho muda: aqui é o campo `proximo` de outro registro, lá é a data
  // escolhida no form. Chamada depois de qualquer escrita que possa ter
  // mexido em `proximo` num realizado (editar registro, criar registro já
  // realizado, concluir um agendamento que já carregava sua própria
  // "próxima aplicação" — encadeando sozinho). Idempotente por design: só
  // garante o invariante "existe um agendamento vivo espelhando `proximo`,
  // ou não existe nenhum" — nunca precisa saber se o valor mudou desde a
  // última vez. gerado_de_id (auto-referência, DEFERRABLE — migração D15)
  // marca a origem.
  // Devolve o agendamento vivo espelhando pai.proximo — existente, recém-
  // criado, ou null quando não há nada pra sincronizar (proximo vazio, já
  // apagado o que existia). { erro } no lugar disso se a criação falhar —
  // quem chama decide o que fazer (fluxo automático só toasta e segue;
  // agirSobreAlerta, abaixo, aborta a ação inteira). Usada tanto no gatilho
  // automático (salvar/concluir) quanto sob demanda (clique em Editar/
  // Concluir/Não realizado num alerta de reaplicação, Bloco D16).
  // Bloco D17 — apaga o agendamento gerado por um pai, mas só se ele ainda
  // estiver PENDENTE (status='agendado'). Já concluído ou cancelado é
  // história — apagar um registro de algo que aconteceu (ou que foi
  // explicitamente marcado como não realizado) é pior do que deixar sem o
  // vínculo com o pai. Nesses dois casos o próprio FK (gerado_de_id, ON
  // DELETE SET NULL) já cuida sozinho: o registro sobrevive, só perde a
  // referência ao pai que não existe mais — comportamento certo, não um bug.
  // Único lugar que apaga um agendamento gerado — chamado tanto ao limpar
  // "Próxima aplicação" (abaixo) quanto ao excluir o próprio pai (excluir,
  // mais abaixo). Antes, excluir() não sabia desse vínculo: o SET NULL
  // preservava o filho (efeito certo pros casos concluído/cancelado), mas
  // deixava um agendamento ainda pendente órfão no Calendário — nunca
  // apagado, porque nada nunca olhava pra ele de novo.
  const apagarAgendamentoGeradoPendente = async (paiId) => {
    const gerado = dados.find(d => d.gerado_de_id === paiId && d.status === 'agendado')
    if (!gerado) return
    const { error: errVincGerado } = await db.sanidadeAnimais.deletePorProcedimento(gerado.id)
    if (errVincGerado) { toast('Erro ao remover vínculos do agendamento gerado: ' + errVincGerado.message, 'error'); return }
    const { error: errGerado } = await db.sanidade.delete(gerado.id)
    if (errGerado) toast('Agendamento gerado por este procedimento não pôde ser removido: ' + errGerado.message, 'error')
  }

  const sincronizarAgendamentoGerado = async (pai) => {
    if (!pai.proximo) {
      await apagarAgendamentoGeradoPendente(pai.id)
      return null
    }
    const gerado = dados.find(d => d.gerado_de_id === pai.id && d.status === 'agendado')
    if (gerado) {
      if (gerado.data === pai.proximo) return gerado
      const { data, error } = await db.sanidade.update(gerado.id, { data: pai.proximo })
      if (error) { toast('Não foi possível atualizar o agendamento da próxima aplicação: ' + error.message, 'error'); return { erro: error } }
      return data
    }
    // Herda os animais do procedimento-pai, filtrados pelos ATIVOS agora —
    // vendido/morto entre o registro original e a geração do agendamento
    // fica de fora, mesmo filtro do seletor de animais da tela (animais
    // carregado em load() já é só situacao:'ativo').
    const { data: vincsPai } = await db.sanidadeAnimais.listPorProcedimento(pai.id)
    const idsAtivos = (vincsPai || []).map(v => v.animal_id).filter(id => animais.some(a => a.id === id))

    const { data: novoAgendamento, error } = await db.sanidade.insert({
      data:            pai.proximo,
      tipo:            pai.tipo,
      procedimento:    pai.procedimento,
      lote_descricao:  pai.lote_descricao || '',
      quantidade:      idsAtivos.length,
      proximo:         null,
      observacoes:     '',
      status:          'agendado',
      itens_previstos: [],
      gerado_de_id:    pai.id,
    })
    if (error) { toast('Não foi possível gerar o agendamento da próxima aplicação: ' + error.message, 'error'); return { erro: error } }
    if (idsAtivos.length > 0) {
      const { error: errVinc } = await db.sanidadeAnimais.inserirVarios(idsAtivos.map(animalId => ({
        conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, procedimento_id: novoAgendamento.id, animal_id: animalId,
      })))
      if (errVinc) { toast('Agendamento gerado, mas erro ao vincular animais: ' + errVinc.message, 'error'); return { erro: errVinc } }
    }
    return novoAgendamento
  }

  // Bloco D16 — unifica reaplicação e agendamento nos botões de Alertas:
  // clicar em Editar/Concluir/Não realizado num item de reaplicação gera o
  // agendamento na hora (mesma sincronizarAgendamentoGerado que já roda ao
  // salvar — não é caminho paralelo, é a MESMA função, só disparada pela
  // interação em vez de pelo save) e já aplica a ação nele, no mesmo
  // clique — do ponto de vista do usuário, ele só clicou numa ação, nunca
  // um toast avisando que algo foi criado por trás. Se a geração falhar, a
  // ação aborta inteira (nunca aplica ação sem o registro existir) — o erro
  // já vem toastado por sincronizarAgendamentoGerado. Reentrância travada
  // por item (chave = d.id, useSubmitGuard).
  const agirSobreAlerta = (d, aplicarAcao) => guard(async () => {
    setReaplicacaoEmAndamentoId(d.id)
    try {
      const alvo = d._origem === 'agendamento' ? d : await sincronizarAgendamentoGerado(d)
      if (!alvo || alvo.erro) return
      aplicarAcao(alvo)
    } finally {
      setReaplicacaoEmAndamentoId(null)
    }
  }, d.id)

  const cancelarAgendamento = async (d) => {
    if (!d || !podeEditarSanidadeCiclo) return
    const { error } = await db.sanidade.update(d.id, { status: 'cancelado', cancelado_em: hojeISO() })
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast('Agendamento marcado como não realizado.')
    load()
  }

  const reabrirAgendamento = async (d) => {
    if (!podeEditarSanidadeCiclo) return
    const { error } = await db.sanidade.update(d.id, { status: 'agendado', cancelado_em: null })
    if (error) { toast('Erro: ' + error.message, 'error'); return }
    toast('Agendamento reaberto.')
    load()
  }

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

    // Bloco D15 — re-filtra os animais vinculados pelos ATIVOS agora, não só
    // os que estavam ativos quando o agendamento foi criado/editado. Cobre
    // sobretudo o agendamento gerado automaticamente pela "próxima
    // aplicação", que herda a lista na hora da geração e pode nunca ser
    // reaberto por ninguém até a conclusão.
    const { data: vincsAtuais } = await db.sanidadeAnimais.listPorProcedimento(d.id)
    const idsAtivos = (vincsAtuais || []).map(v => v.animal_id).filter(id => animais.some(a => a.id === id))
    let quantidadeFinal = d.quantidade
    if (idsAtivos.length !== (vincsAtuais || []).length) {
      await db.sanidadeAnimais.deletePorProcedimento(d.id)
      if (idsAtivos.length > 0) {
        await db.sanidadeAnimais.inserirVarios(idsAtivos.map(animalId => ({
          conta_id: contaAtual.id, fazenda_id: fazendaAtual.id, procedimento_id: d.id, animal_id: animalId,
        })))
      }
      quantidadeFinal = idsAtivos.length
      toast(`${(vincsAtuais || []).length - idsAtivos.length} animal(is) removido(s) da conclusão por não estarem mais ativos.`, 'warning')
    }

    const { error } = await db.sanidade.update(d.id, { status: 'realizado', quantidade: quantidadeFinal })
    if (error) { toast('Erro: ' + error.message, 'error'); return }

    // A partir daqui itens_previstos deixa de valer — a movimentação real
    // (vinculada ao procedimento) é que passa a ser a fonte de verdade, é ela
    // que reverterCascata usa se o registro for excluído depois.
    if (podeEditarEstoque && previstos.length > 0) {
      await aplicarBaixaEstoque(d.id, d.data, d.procedimento, previstos.map(p => ({ item_id: p.item_id, quantidade: String(p.quantidade) })))
    }

    // Bloco D15 — se este realizado (recém-concluído) já carregava sua
    // própria "próxima aplicação" (editável em "Editar agendamento"), gera o
    // elo seguinte da cadeia agora — mesma rotina de sempre.
    await sincronizarAgendamentoGerado({ ...d, quantidade: quantidadeFinal })

    toast('Vacinação concluída!')
    load()
  }

  // Quantidade automática: soma de animais ativos dos lotes selecionados, ou seleção individual.
  // Mesmo filtro de data_nascimento usado em `salvar` (abaixo), pra não mostrar uma
  // contagem maior do que o que de fato vai ser vinculado em sanidade_animais.
  const autoQtd = selAnimais.length > 0 ? selAnimais.length : null

  const categoriasDisponiveis = [...new Set(animais.map(a =>
    calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
  ))].sort()

  // Item 7 — um único modo de seleção (não mais "Por lote" x "Individual"):
  // categoria/proprietário/lote são três filtros que compõem entre si pra
  // estreitar a lista de baixo, sempre marcada animal a animal. "Selecionar
  // todos do filtro" (abaixo) reproduz exatamente o que "Por lote" fazia
  // (marcar todo mundo de um lote de uma vez), sem perder a opção de marcar
  // só alguns — o modo antigo "Por lote" não permitia isso.
  const animaisFiltradosSan = animais.filter(a => {
    const cat = calcCategoriaRebanho(a.data_nascimento, a.sexo, a.sit_reprodutiva, a.is_touro)
    if (filtroCategSan && cat !== filtroCategSan) return false
    if (filtroPropSan && a.proprietario_id !== filtroPropSan) return false
    if (filtroLoteSan && a.lote_id !== filtroLoteSan) return false
    if (form.data && a.data_nascimento && a.data_nascimento > form.data) return false
    return true
  })

  // Fase 7 — mesmo filtro de data_nascimento, fatorado pra ser reusado em 3
  // lugares: criação, editar-agendamento e concluir. Uma função só, sem
  // caminho paralelo.
  const animaisParaVincularAtual = () => selAnimais.filter(id => {
    const a = animais.find(x => x.id === id)
    return !a?.data_nascimento || a.data_nascimento <= form.data
  })

  const descricaoSelecaoAtual = () => selAnimais.length > 0
    ? animais.filter(a => selAnimais.includes(a.id)).map(a => a.brinco).join(', ')
    : 'Geral'

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
    const motivo = `Manejo Sanitário: ${procedimentoNome} em ${fmtData(dataProced)}`
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
      const payloadRealizado = {
        data:         form.data,
        tipo:         form.tipo,
        procedimento: capitalizarPrimeira(form.procedimento),
        proximo:      form.proximo || null,
        observacoes:  capitalizarPrimeira(form.obs) || ''
      }
      const { error } = await db.sanidade.update(editandoId, payloadRealizado)
      setSaving(false)
      if (error) { toast('Erro: ' + error.message, 'error'); return }
      // Bloco D15 — reconcilia o agendamento gerado pela "próxima aplicação"
      // (cria/atualiza a data/apaga, conforme o novo valor de proximo).
      await sincronizarAgendamentoGerado({
        id: editandoId, ...payloadRealizado,
        lote_descricao: dados.find(d => d.id === editandoId)?.lote_descricao,
      })
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

    // Bloco D15 — só procedimento já REALIZADO pode gerar o espelho da
    // "próxima aplicação" (agendamento em si nunca gera, ver comentário na
    // definição da função).
    if (!criandoAgendamento) await sincronizarAgendamentoGerado(procData)

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

    // Bloco D17 — se este procedimento gerou um agendamento (via "Próxima
    // aplicação") que ainda está pendente, apaga junto — mesma rotina de
    // sincronizarAgendamentoGerado (ver acima), não um caminho paralelo.
    // Concluído/cancelado não é tocado (vira história, sobrevive ao pai).
    await apagarAgendamentoGeradoPendente(id)

    const { error } = await db.sanidade.delete(id)
    if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return }
    toast('Registro removido' + (rev.movs.length ? ' — estoque devolvido.' : '.'))
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
  // Bloco D16 — se a "próxima aplicação" já gerou UM agendamento pra este
  // pai, a "reaplicação" derivada nunca mais volta a aparecer — mesmo depois
  // que o agendamento gerado for concluído ou cancelado. Bug corrigido
  // (2026-08-09): a versão anterior só contava agendamentos ainda
  // status='agendado', então concluir ou cancelar tirava o gerado do
  // conjunto e o alerta derivado (que nunca tinha saído do pai, já que
  // proximo/proximo_concluido_em do pai não mudam nem ao concluir nem ao
  // cancelar) voltava a aparecer sozinho — cancelar parecia não fazer nada.
  // Não depende de status: um pai que já gerou um agendamento tem, a partir
  // daí, ESSE agendamento (em qualquer estado) como fonte de verdade — nunca
  // mais o texto solto. Reabrir/gerar de novo (ver sincronizarAgendamentoGerado)
  // continua funcionando normalmente por cima disso.
  const idsComAgendamentoGerado = new Set(dados.filter(d => d.gerado_de_id).map(d => d.gerado_de_id))
  const vencidos = [
    ...dados.filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em && !idsComAgendamentoGerado.has(d.id) && new Date(d.proximo + 'T12:00:00') < hoje)
      .map(d => ({ ...d, _origem: 'reaplicacao', _dataRef: d.proximo })),
    ...dados.filter(d => sanidadeAgendada(d) && new Date(d.data + 'T12:00:00') < hoje)
      .map(d => ({ ...d, _origem: 'agendamento', _dataRef: d.data })),
  ].sort((a, b) => a._dataRef.localeCompare(b._dataRef))
  const proximos = [
    ...dados.filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em && !idsComAgendamentoGerado.has(d.id) && new Date(d.proximo + 'T12:00:00') >= hoje && new Date(d.proximo + 'T12:00:00') <= em30)
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
  // Bloco D15 — cancelados vivem numa seção própria (recolhível) dentro da
  // aba Calendário de vacinação, mais recente primeiro; sem filtro de ciclo,
  // mesmo raciocínio de dadosAgendados (lista prospectiva/administrativa).
  const dadosCancelados = dados.filter(sanidadeCancelada).sort((a, b) => (b.cancelado_em || '').localeCompare(a.cancelado_em || ''))

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
  const pdfAtual = tab === 0 ? { ref: refReg,     filename:'sanidade-registros', titulo:'Manejo Sanitário: Registros' }
    : tab === 2 ? { ref: refAlertas, filename:'sanidade-alertas',   titulo:'Manejo Sanitário: Alertas' }
    : tab === 3 ? { ref: refHist,    filename:'sanidade-historico', titulo:'Manejo Sanitário: Histórico' }
    : null

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', flexWrap:'wrap', gap:8, marginBottom:14 }}>
        <BadgeSomenteLeitura ciclo={cicloLocal} />
      </div>

      {/* Abas + Gerar PDF: mesma linha no desktop (sempre foi assim); no
          celular, CSS (.tabs-actions-row, global.css) troca pra coluna com
          o botão em cima e as abas soltas — uma árvore só. */}
      <div className="tabs-actions-row">
        <div className="tabs-bar">
          {TABS.map((t, i) => (
            <button key={t} className={`tab-btn ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
        <div className="tabs-actions-btns">
          {pdfAtual && <BotaoPDF contentRef={pdfAtual.ref} filename={pdfAtual.filename} titulo={pdfAtual.titulo} />}
        </div>
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
                    <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Animais</th><th>Próximo</th><th></th></tr>
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
                          <td><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /></td>
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
                    <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Animais</th><th></th><th></th></tr>
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
                        <td><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /></td>
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
                              <button className="btn-icon" onClick={() => setConfirmCancelar(d)} title="Marcar como não realizado">
                                <i className="ti ti-x" style={{ fontSize:13, color:'#B45309' }} />
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

          {/* ── Cancelados (Bloco D15) — marcado como não realizado, nunca
              apagado. Recolhível porque é histórico administrativo, não
              trabalho pendente (diferente da lista acima). ── */}
          {dadosCancelados.length > 0 && (
            <div className="card" style={{ marginTop:16 }}>
              <div className="card-title" style={{ cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}
                onClick={() => setCanceladosAberto(o => !o)}>
                <span><i className="ti ti-ban" /> Cancelados ({dadosCancelados.length})</span>
                <i className={`ti ti-chevron-${canceladosAberto ? 'up' : 'down'}`} />
              </div>
              {canceladosAberto && (
                <div className="table-wrap" style={{ marginTop:10 }}>
                  <table>
                    <thead>
                      <tr><th>Data</th><th>Tipo</th><th>Procedimento</th><th>Cancelado em</th><th></th></tr>
                    </thead>
                    <tbody>
                      {dadosCancelados.map(d => (
                        <tr key={d.id}>
                          <td style={{ textDecoration:'line-through', color:'#9CA3AF' }}>{fmtData(d.data)}</td>
                          <td><Badge color={COR_TP[d.tipo] || 'gray'}>{labelTipoSanidade(d.tipo)}</Badge></td>
                          <td style={{ textDecoration:'line-through', color:'#9CA3AF' }}>{d.procedimento}</td>
                          <td style={{ fontSize:'.78rem', color:'#9CA3AF' }}>{d.cancelado_em ? fmtData(d.cancelado_em) : '—'}</td>
                          <td style={{ whiteSpace:'nowrap' }}>
                            {podeEditarSanidadeCiclo && (
                              <>
                                <button className="btn-icon" onClick={() => reabrirAgendamento(d)} title="Reabrir agendamento">
                                  <i className="ti ti-arrow-back-up" style={{ fontSize:13 }} />
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
              )}
            </div>
          )}
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
                ? <><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /> · Estava agendado para {fmtData(d.data)} · {diasDesde(d.data)} dias em atraso</>
                : <><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /> · Deveria ter sido aplicado em {fmtData(d.proximo)} · {diasDesde(d.proximo)} dias em atraso</>}
              action={podeEditarSanidadeCiclo && (
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, abrirEditarAgendamento)}><i className="ti ti-edit"/> Editar</button>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, setConfirmConcluir)}>
                    <i className="ti ti-check"/> {reaplicacaoEmAndamentoId === d.id ? '...' : 'Concluir'}
                  </button>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, setConfirmCancelar)}><i className="ti ti-x"/> Não realizado</button>
                </div>
              )}
            />
          ))}
          {proximos.map(d => (
            <AlertBox key={d.id} type="amber"
              title={d._origem === 'agendamento'
                ? <>{d.procedimento} — agendado <Badge color="amber">Agendado</Badge></>
                : `${d.procedimento} — próximo`}
              body={d._origem === 'agendamento'
                ? <><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /> · Agendado para {fmtData(d.data)}</>
                : <><BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /> · Previsto para {fmtData(d.proximo)}</>}
              action={podeEditarSanidadeCiclo && (
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, abrirEditarAgendamento)}><i className="ti ti-edit"/> Editar</button>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, setConfirmConcluir)}>
                    <i className="ti ti-check"/> {reaplicacaoEmAndamentoId === d.id ? '...' : 'Concluir'}
                  </button>
                  <button className="btn btn-secondary btn-xs" disabled={reaplicacaoEmAndamentoId === d.id} onClick={() => agirSobreAlerta(d, setConfirmCancelar)}><i className="ti ti-x"/> Não realizado</button>
                </div>
              )}
            />
          ))}
          <div className="card" style={{ marginTop:12 }}>
            <div className="card-title"><i className="ti ti-calendar-event" /> Calendário sanitário — próximos 90 dias</div>
            {dados
              .filter(d => sanidadeRealizada(d) && d.proximo && !d.proximo_concluido_em && !idsComAgendamentoGerado.has(d.id))
              .sort((a, b) => a.proximo.localeCompare(b.proximo))
              .slice(0, 8)
              .map(d => {
                const prx = new Date(d.proximo + 'T12:00:00')
                const dias = Math.ceil((prx - hoje) / 86400000)
                return (
                  <div key={d.id} className="row">
                    <span className="row-label"><strong>{d.procedimento}</strong> · <BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} /></span>
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
                      <BotaoQtdAnimais quantidade={d.quantidade} onClick={() => setProcAnimaisModal(d)} style={{ fontSize:'.75rem' }} />
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          </div>{/* end refHist */}
        </div>
      )}

      <ModalAnimaisSanidade procedimento={procAnimaisModal} onClose={() => setProcAnimaisModal(null)} />

      <Confirm
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => excluir(confirmDel.id)}
        title={confirmDel && (sanidadeAgendada(confirmDel) || sanidadeCancelada(confirmDel)) ? 'Excluir agendamento' : 'Excluir procedimento'}
        message={(() => {
          if (!confirmDel) return ''
          if (sanidadeAgendada(confirmDel) || sanidadeCancelada(confirmDel)) return 'Excluir este agendamento? Ele nunca baixou estoque nem afetou nada além da própria agenda — nada será revertido. Esta ação não pode ser desfeita.'
          const movs = movsPorProcedimento[confirmDel.id] || []
          if (movs.length === 0) return 'Excluir este procedimento? Esta ação não pode ser desfeita.'
          const efeito = movs.map(m => `${parseFloat(m.quantidade).toFixed(1)} ${m.item?.unidade || ''} de ${m.item?.item || 'item'}`).join(', ')
          return `Isto vai devolver ${efeito} ao estoque, e apagar o procedimento e seus vínculos. Esta ação não pode ser desfeita.`
        })()}
        danger
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
          return `${fmtData(confirmConcluir.data)} · ${labelTipoSanidade(confirmConcluir.tipo)} — ${confirmConcluir.procedimento} · ${qtdAnimaisTexto(confirmConcluir.quantidade || 0)}.${itensTxt} Confirma que esta vacinação foi realizada?`
        })() : ''}
      />

      {/* Bloco D15 — cancelar MARCA (status='cancelado'), nunca apaga; fica
          na seção "Cancelados" e pode ser reaberto depois. */}
      <Confirm
        open={!!confirmCancelar}
        onClose={() => setConfirmCancelar(null)}
        onConfirm={() => cancelarAgendamento(confirmCancelar)}
        title="Marcar agendamento como não realizado"
        message={confirmCancelar
          ? `${fmtData(confirmCancelar.data)} · ${labelTipoSanidade(confirmCancelar.tipo)} — ${confirmCancelar.procedimento}. O agendamento sai da agenda e fica marcado como não realizado, sem apagar o registro — você pode reabri-lo depois na seção "Cancelados" do Calendário de vacinação.`
          : ''}
        danger
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
              // Trocar a data DEPOIS de já ter selecionado animais pode
              // deixar a seleção inválida — revalida e desmarca, mesmo
              // padrão usado na venda (Financeiro.jsx) e nas pesagens.
              if (novaData) {
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
            {/* Item 7 — categoria/proprietário/lote como três filtros que
                compõem entre si (sem "modo" pra escolher antes), estreitando
                a lista marcável abaixo. "Selecionar todos do filtro" cobre o
                caso que antes era "Por lote": filtra por um lote e marca
                todos de uma vez, sem perder a opção de desmarcar alguns
                depois. */}
            <Filtros
              itens={[
                {
                  chave: 'categoria', label: 'Categoria', tipo: 'select',
                  opcoes: [{ valor: '', label: 'Todas as categorias' }, ...categoriasDisponiveis.map(c => ({ valor: c, label: c }))],
                },
                {
                  chave: 'proprietario', label: 'Proprietário', tipo: 'select',
                  opcoes: [{ valor: '', label: 'Todos os proprietários' }, ...props.map(p => ({ valor: p.id, label: p.nome }))],
                },
                {
                  chave: 'lote', label: 'Lote', tipo: 'select',
                  opcoes: [{ valor: '', label: 'Todos os lotes' }, ...lotes.map(l => ({ valor: l.id, label: l.nome }))],
                },
              ]}
              valores={{ categoria: filtroCategSan, proprietario: filtroPropSan, lote: filtroLoteSan }}
              onChange={(chave, valor) => {
                if (chave === 'categoria') setFiltroCategSan(valor)
                else if (chave === 'proprietario') setFiltroPropSan(valor)
                else if (chave === 'lote') setFiltroLoteSan(valor)
              }}
            />
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
