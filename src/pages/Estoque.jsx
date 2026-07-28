import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../lib/PermissoesContext'
import { useConta } from '../lib/ContaContext'
import { useFazenda } from '../lib/FazendaContext'
import { useCiclo, statusCiclo } from '../lib/CicloContext'
import { useCicloLocal } from '../lib/useCicloLocal'
import { fmtData, fmtMoeda, numeroPositivo, algumErro, calcLotesFEFO, diasAteValidade, CATS_ESTOQUE, GRUPO_SUGERIDO_POR_CATEGORIA, capitalizarPrimeira, capitalizarNome } from '../lib/helpers'
import { hojeISO } from '../lib/hoje'
import { Loading, Modal, Field, MicButton, Badge, toast, EmptyState, AlertBox, BotaoPDF, Confirm, ErroCarregamento, BannerCicloEncerrado, SeletorCicloLocal } from '../components/UI'
import { validarSaldoEstoque, aplicarMovimentacaoEstoque, reverterCascata, criarLancamentoRateado, carregarGruposExtras, gruposDisponiveis, comGrupoExtra } from '../lib/estoqueFinanceiro'
import RateioProprietarios from '../components/RateioProprietarios'
import GrupoSelect from '../components/GrupoSelect'

const TABS = ['Inventário','Movimentar','Alertas']
const CATS = CATS_ESTOQUE
const LIMITE_VENCENDO_DIAS = 30

// mm/yyyy — usado na exibição compacta dos lotes de validade
const fmtMesAno = (validade) => {
  if (!validade) return '—'
  const d = new Date(validade + 'T00:00:00')
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function Estoque() {
  const refInv     = useRef(null)
  const refMov     = useRef(null)
  const refAlertas = useRef(null)

  const { podeEditar } = usePermissoes()
  const podeEditarEstoque = podeEditar('estoque')
  // Bloco D10 — integração Estoque <-> Financeiro (caminhos 4/5) exige as
  // DUAS permissões: sem uma delas, nem o checkbox aparece no formulário.
  const podeEditarFinanceiro = podeEditar('financeiro')
  const { contaAtual } = useConta()
  const { fazendaAtual } = useFazenda()
  const { dentroDoCiclo, cicloDaData, dataEhEditavel } = useCiclo()

  // Seletor de ciclo LOCAL desta tela. Só afeta a listagem de MOVIMENTAÇÕES
  // (têm data); os itens são saldo atual e ficam sempre visíveis/editáveis
  // conforme a permissão do módulo.
  const { cicloLocal, setCicloLocal, ciclos } = useCicloLocal()
  const statusCicloLocal = statusCiclo(cicloLocal)
  const podeEditarMovCiclo = podeEditarEstoque && (statusCicloLocal === 'atual' || statusCicloLocal === 'carencia')

  const [tab,     setTab]    = useState(0)
  const [itens,   setItens]  = useState([])
  const [movs,    setMovs]   = useState([])
  const [props,   setProps]  = useState([]) // proprietários — só pro rateio dos caminhos 4/5 (Bloco D10)
  const [gruposExtras, setGruposExtras] = useState({ R: [], D: [] }) // grupos personalizados (Bloco D10, mesma função do Financeiro)
  const [loading, setLoading]= useState(true)
  const [modal,      setModal]      = useState(null)
  const [form,       setForm]       = useState({})
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [loadError,  setLoadError]  = useState(false)
  const [itemExpandido, setItemExpandido] = useState(null)
  // Exclusão de saída / reversão de entrada (ver reverterMov abaixo) —
  // confirmMov guarda a movimentação em questão pro Confirm mostrar o efeito
  // exato antes de executar.
  const [confirmMov,  setConfirmMov]  = useState(null)
  const [revertendo,  setRevertendo]  = useState(false)

  useEffect(() => { loadAll() }, [])

  // Rateio inicial (um item por proprietário, em branco) — usado tanto no
  // modal "Novo item" quanto no "Movimentar" (caminhos 3/4/5 do Bloco D10),
  // mesmo formato que Financeiro.jsx::abrirModalLanc já usa.
  const rateiosVazios = () => props.map(p => ({ proprietario_id: p.id, percentual: '', valor: '' }))

  const loadAll = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.all([
        db.estoque.list(), db.movEstoque.list(), db.proprietarios.list(),
        // Grupos personalizados já usados em lançamentos — mesma função que o
        // Financeiro usa, pra mostrar a MESMA lista nas duas telas.
        carregarGruposExtras(),
      ])
      if (algumErro('[Estoque]', results)) { setLoadError(true); return }
      const [ri, rm, rp, rGrupos] = results
      setItens(ri.data || [])
      setMovs(rm.data  || [])
      setProps(rp.data || [])
      setGruposExtras(rGrupos.extras)
    } catch (e) {
      console.error('[Estoque] erro ao carregar:', e)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  // Lacuna pré-existente corrigida no Bloco D10: excluir um item nunca checava
  // se ele tinha movimentações (histórico de entradas/saídas, possivelmente
  // vinculadas a um procedimento de Sanidade ou a um lançamento financeiro) —
  // a exclusão simplesmente seguia em frente, deixando as movimentações
  // órfãs (item_id apontando pra um item que não existe mais). `movs` já é
  // carregado por inteiro (até 500, sem filtro de ciclo) no loadAll, então dá
  // pra checar sem consulta nova.
  const excluirItem = async (item) => {
    if (movs.some(m => m.item_id === item.id)) {
      toast(`Não é possível excluir "${item.item}": ele tem movimentações registradas (histórico de entradas/saídas). Itens com histórico não podem ser apagados.`, 'error')
      return
    }
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
    const qtdInicial = parseFloat(form.quantidade) || 0
    const itemNome = capitalizarNome(form.item)

    if (form._edit && form.id) {
      const payload = {
        item: itemNome, categoria: form.categoria, unidade: form.unidade,
        quantidade: qtdInicial, minimo: parseFloat(form.minimo) || 0, preco_unit: parseFloat(form.preco_unit) || 0,
      }
      const { error } = await db.estoque.update(form.id, payload)
      setSaving(false)
      if (error) { toast('Erro: ' + error.message, 'error'); return }
      toast('Item atualizado!')
      setModal(null); setForm({}); loadAll()
      return
    }

    // Item novo, caminho 6 (Bloco D10, opcional): se "Lançar também como
    // despesa" estiver marcado, usa o MESMO mecanismo do "Movimentar" (caminho
    // 4) — criarLancamentoRateado + aplicarMovimentacaoEstoque, com vínculo
    // por lancamento_id, reversão pelos dois lados e permissão dos dois
    // módulos. É opcional: quem está cadastrando estoque que já possuía antes
    // do sistema simplesmente não marca, e nada financeiro é tocado.
    const podeVincularFin = podeEditarEstoque && podeEditarFinanceiro
    const criarDespesa = qtdInicial > 0 && podeVincularFin && form.lancarComoDespesaItem
    const dataEntrada = form.entrada_data || hojeISO()

    let unitDespesa = null
    if (criarDespesa) {
      unitDespesa = numeroPositivo(form.preco_unit)
      if (unitDespesa === null) { setSaving(false); toast('Informe o preço unitário para lançar a despesa.', 'error'); return }
      if (!form.itemMovGrupo) { setSaving(false); toast('Escolha o grupo da despesa.', 'error'); return }
      if (!dataEhEditavel(dataEntrada)) {
        setSaving(false)
        const c = cicloDaData(dataEntrada)
        toast(c
          ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
          : 'Data fora de qualquer ciclo cadastrado.', 'error')
        return
      }
    }

    // Item é criado com saldo 0 quando há quantidade inicial — quem ajusta o
    // saldo de verdade é aplicarMovimentacaoEstoque logo abaixo (mesmo padrão
    // já usado em Financeiro.jsx::salvarLanc pro item criado a partir de uma
    // despesa), pra nunca contar a quantidade duas vezes.
    const { data: novoItem, error: errItem } = await db.estoque.insert({
      item: itemNome, categoria: form.categoria, unidade: form.unidade,
      quantidade: 0, minimo: parseFloat(form.minimo) || 0, preco_unit: parseFloat(form.preco_unit) || 0,
    })
    if (errItem || !novoItem) {
      setSaving(false); toast('Erro: ' + (errItem?.message || ''), 'error'); return
    }
    if (qtdInicial === 0) {
      setSaving(false)
      toast('Item cadastrado!')
      setModal(null); setForm({}); loadAll()
      return
    }

    let lancData = null
    if (criarDespesa) {
      const ciclo = cicloDaData(dataEntrada)
      const { data: lanc, error: errLanc, avisoRateio } = await criarLancamentoRateado({
        contaId: contaAtual.id, fazendaId: fazendaAtual.id, cicloId: ciclo.id,
        tipo: 'D', grupo: form.itemMovGrupo, descricao: `Compra de ${itemNome}`,
        valor: +(qtdInicial * unitDespesa).toFixed(2), data: dataEntrada, rateios: form.rateios || [], props,
      })
      if (errLanc) {
        setSaving(false)
        toast('Item criado, mas houve erro ao lançar a despesa: ' + errLanc.message + ' — lance manualmente.', 'error')
        setModal(null); setForm({}); loadAll()
        return
      }
      if (avisoRateio) toast('Despesa criada, mas houve erro ao salvar o rateio: ' + avisoRateio, 'error')
      setGruposExtras(prev => comGrupoExtra(prev, 'D', capitalizarPrimeira(form.itemMovGrupo)))
      lancData = lanc
    }

    const r = await aplicarMovimentacaoEstoque({
      itemId: novoItem.id, tipo: 'E', quantidade: qtdInicial, data: dataEntrada,
      motivo: criarDespesa ? `Compra de ${itemNome}` : 'Quantidade inicial',
      validade: form.entrada_validade || null,
      vinculo: lancData ? { lancamento_id: lancData.id } : {},
      precoUnitNovo: criarDespesa ? unitDespesa : null,
      itensEstoque: [novoItem],
    })
    setSaving(false)
    if (r.error) {
      toast(`Item criado${criarDespesa ? ' e despesa lançada' : ''}, mas houve erro ao registrar a entrada inicial: ` + r.error.message, 'error')
    } else {
      toast(criarDespesa ? 'Item cadastrado e despesa lançada!' : 'Item cadastrado!')
    }
    setModal(null); setForm({}); loadAll()
  }

  const salvarMov = async () => {
    if (!podeEditarMovCiclo) return
    if (!form.item_id || !form.tipo || !form.quantidade || !form.data) {
      toast('Preencha todos os campos.', 'error'); return
    }
    const qt = numeroPositivo(form.quantidade)
    if (qt === null) { toast('Quantidade inválida: informe um número maior que zero.', 'error'); return }
    if (!dataEhEditavel(form.data)) {
      const c = cicloDaData(form.data)
      toast(c
        ? 'Não é possível lançar nesta data: ela está fora do ciclo atual (ou em um ciclo já encerrado).'
        : 'Data fora de qualquer ciclo cadastrado.', 'error')
      return
    }

    const item = itens.find(i => i.id === form.item_id)
    const motivo = capitalizarPrimeira(form.motivo)
    const podeVincularFin = podeEditarEstoque && podeEditarFinanceiro
    const criarDespesa = form.tipo === 'E' && podeVincularFin && form.lancarComoDespesa
    const criarReceita = form.tipo === 'S' && podeVincularFin && form.lancarComoReceita

    // Caminhos 4/5 (Bloco D10) — tudo validado ANTES de qualquer escrita: se
    // faltar algo do lado financeiro (ou saldo insuficiente pra gerar a
    // receita), nada é salvo, nem a movimentação.
    let unitDespesa = null
    if (criarDespesa) {
      unitDespesa = numeroPositivo(form.movUnitario)
      if (unitDespesa === null) { toast('Informe o valor unitário para lançar a despesa.', 'error'); return }
      if (!form.movGrupo) { toast('Escolha o grupo da despesa.', 'error'); return }
    }
    let valorReceita = null
    if (criarReceita) {
      valorReceita = numeroPositivo(form.movValorReceita)
      if (valorReceita === null) { toast('Informe o valor da venda para lançar a receita.', 'error'); return }
      if (!form.movGrupo) { toast('Escolha o grupo da receita.', 'error'); return }
      const erroSaldo = validarSaldoEstoque(itens, [{ item_id: form.item_id, quantidade: qt }])
      if (erroSaldo) { toast(erroSaldo, 'error'); return }
    }

    setSaving(true)

    // Sem vínculo financeiro pedido: comportamento 100% inalterado (mesmo
    // Promise.all de sempre) — não passa pelas funções novas, pra nunca
    // arriscar mudar o que já funciona hoje quando o checkbox está desmarcado.
    if (!criarDespesa && !criarReceita) {
      const novaQt = form.tipo === 'E'
        ? parseFloat(item.quantidade) + qt
        : Math.max(0, parseFloat(item.quantidade) - qt)
      const [r1, r2] = await Promise.all([
        db.estoque.update(form.item_id, { quantidade: novaQt }),
        db.movEstoque.insert({
          item_id: form.item_id, data: form.data, tipo: form.tipo, quantidade: qt,
          motivo: motivo || '—',
          validade: form.tipo === 'E' ? (form.validade || null) : null,
        })
      ])
      setSaving(false)
      if (r1.error || r2.error) { toast('Erro ao salvar.', 'error'); return }
      toast(form.tipo === 'E' ? 'Entrada registrada!' : 'Saída registrada!')
      setModal(null); setForm({}); loadAll()
      return
    }

    // Lançamento financeiro criado ANTES da movimentação — se falhar, nada
    // mais é gravado (mesmo princípio de "não deixar vínculo pela metade").
    const ciclo = cicloDaData(form.data)
    const { data: lancData, error: errLanc, avisoRateio } = await criarLancamentoRateado({
      contaId: contaAtual.id, fazendaId: fazendaAtual.id, cicloId: ciclo.id,
      tipo: criarDespesa ? 'D' : 'R', grupo: form.movGrupo,
      descricao: motivo || (criarDespesa ? `Compra de ${item.item}` : `Venda de ${item.item}`),
      valor: criarDespesa ? +(qt * unitDespesa).toFixed(2) : valorReceita,
      data: form.data, rateios: form.rateios || [], props,
    })
    if (errLanc) {
      setSaving(false)
      toast(`Erro ao criar a ${criarDespesa ? 'despesa' : 'receita'}: ` + errLanc.message, 'error')
      return
    }
    if (avisoRateio) toast(`${criarDespesa ? 'Despesa' : 'Receita'} criada, mas houve erro ao salvar o rateio: ` + avisoRateio, 'error')

    // Grupo personalizado: fica disponível na hora pros próximos lançamentos
    // desta mesma sessão — mesma função que o Financeiro usa depois de salvar.
    setGruposExtras(prev => comGrupoExtra(prev, criarDespesa ? 'D' : 'R', capitalizarPrimeira(form.movGrupo)))

    const r = await aplicarMovimentacaoEstoque({
      itemId: form.item_id, tipo: form.tipo, quantidade: qt, data: form.data,
      motivo: motivo || '—', validade: form.validade,
      vinculo: { lancamento_id: lancData.id },
      precoUnitNovo: criarDespesa ? unitDespesa : null,
      itensEstoque: itens,
    })
    setSaving(false)
    if (r.error) {
      toast(`${criarDespesa ? 'Despesa' : 'Receita'} lançada, mas a movimentação de estoque NÃO foi registrada: ` + r.error.message + ' — registre manualmente.', 'error')
    } else {
      toast(form.tipo === 'E' ? 'Entrada registrada e despesa lançada!' : 'Saída registrada e receita lançada!')
    }
    setModal(null); setForm({}); loadAll()
  }

  // ── Exclusão de saída / reversão de entrada ────────────────────────────
  // Desfaz o efeito de UMA movimentação: saída (tipo 'S') devolve a
  // quantidade ao saldo do item; entrada (tipo 'E') remove. Mesma mecânica de
  // salvarMov (2 chamadas: ajustar estoque_itens.quantidade + mexer na linha
  // de estoque_movimentacoes), só que ao contrário e terminando em DELETE em
  // vez de INSERT — não existe trigger no banco pra este módulo, então o
  // efeito tem que ser calculado aqui, igual já era na criação.
  const efeitoReversaoMov = (m) => {
    const item = itens.find(i => i.id === m.item_id)
    if (!item) return null
    const qt    = parseFloat(m.quantidade)
    const atual = parseFloat(item.quantidade)
    const novaQt = m.tipo === 'S' ? atual + qt : atual - qt
    return { item, qt, atual, novaQt }
  }

  const clicarReverterMov = (m) => {
    if (!podeEditarMovCiclo || !dataEhEditavel(m.data)) return
    // Baixa originada de um procedimento sanitário (badge "Sanidade") não
    // pode ser excluída/revertida direto por aqui — isso deixaria o
    // procedimento em Sanidade.jsx apontando para uma baixa inexistente.
    // O caminho certo é excluir o procedimento lá, que já reverte o estoque
    // e mantém os dois módulos consistentes (ver Sanidade.jsx: excluir()).
    // Assimetria INTENCIONAL (documentada no manual): diferente de um
    // vínculo com LANÇAMENTO financeiro (abaixo), que pode ser revertido
    // pelos dois lados.
    if (m.procedimento_id) {
      toast('Esta baixa veio de um registro de Sanidade — para revertê-la, exclua o procedimento correspondente na tela Sanidade.', 'error')
      return
    }
    // Movimentação vinculada a um lançamento (caminhos 2-5, Bloco D10) — pode
    // ser revertida por aqui, mas exige permissão de Financeiro também (vai
    // apagar o lançamento vinculado).
    if (m.lancamento_id && !podeEditarFinanceiro) {
      toast('Esta movimentação tem um lançamento financeiro vinculado. É necessária permissão de edição no módulo Financeiro para revertê-la.', 'error')
      return
    }
    const efeito = efeitoReversaoMov(m)
    if (!efeito) { toast('Item do estoque não encontrado (pode ter sido excluído).', 'error'); return }
    // Só entrada pode deixar o saldo negativo ao reverter (reverter uma saída
    // só soma) — bloqueia ANTES de abrir a confirmação, com o número exato.
    if (m.tipo === 'E' && efeito.novaQt < 0) {
      toast(
        `Não é possível reverter: o estoque de "${efeito.item.item}" ficaria negativo ` +
        `(saldo atual: ${efeito.atual.toFixed(1)} ${efeito.item.unidade}, entrada: ${efeito.qt.toFixed(1)} ${efeito.item.unidade}).`,
        'error'
      )
      return
    }
    setConfirmMov(m)
  }

  const reverterMov = async (m) => {
    if (revertendo) return // guarda contra duplo clique/duplo confirm em voo
    setRevertendo(true)

    // Vinculada a lançamento (caminhos 2-5) — usa reverterCascata (módulo
    // compartilhado) e depois apaga o lançamento também, mesma lógica que
    // Financeiro.jsx::excluirLanc usa do outro lado, só que na direção
    // oposta. Sem vínculo: comportamento 100% inalterado (mesmo Promise.all
    // de sempre), pra nunca arriscar mudar o que já funciona hoje.
    if (m.lancamento_id) {
      const rev = await reverterCascata({
        lancamentoId: m.lancamento_id, itensEstoque: itens, podeEditarEstoque,
        checarCicloEditavel: (data) => dataEhEditavel(data),
      })
      if (!rev.ok) { setRevertendo(false); toast(rev.erro, 'error'); return }
      const { error: errLanc } = await db.lancamentos.delete(m.lancamento_id)
      setRevertendo(false)
      if (errLanc) { toast('Estoque revertido, mas houve erro ao apagar o lançamento: ' + errLanc.message, 'error'); return }
      toast(m.tipo === 'S' ? 'Saída excluída — estoque devolvido e receita apagada.' : 'Entrada revertida — estoque atualizado e despesa apagada.')
      loadAll()
      return
    }

    const efeito = efeitoReversaoMov(m)
    if (!efeito) { setRevertendo(false); toast('Item do estoque não encontrado (pode ter sido excluído).', 'error'); return }
    const [r1, r2] = await Promise.all([
      db.estoque.update(m.item_id, { quantidade: efeito.novaQt }),
      db.movEstoque.delete(m.id),
    ])
    setRevertendo(false)
    if (r1.error || r2.error) { toast('Erro ao reverter: ' + (r1.error || r2.error).message, 'error'); return }
    toast(m.tipo === 'S' ? 'Saída excluída — estoque devolvido.' : 'Entrada revertida — estoque atualizado.')
    loadAll()
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

  // Saldo por lote de validade (FEFO): cada item pode ter vários lotes com
  // validades diferentes, calculados a partir das movimentações (entradas por
  // validade, menos as saídas consumidas dos lotes que vencem antes).
  const lotesPorItem = {}
  itens.forEach(item => {
    lotesPorItem[item.id] = calcLotesFEFO(movs.filter(m => m.item_id === item.id))
  })
  // Próxima validade com saldo > 0 (lotes já vêm ordenados, validade mais próxima primeiro)
  const proximaValidade = (itemId) => lotesPorItem[itemId]?.[0]?.validade || null

  // Alertas: lotes vencidos (validade < hoje) ou vencendo em até 30 dias, com saldo > 0
  const alertasValidade = itens
    .flatMap(item => (lotesPorItem[item.id] || [])
      .filter(l => l.validade)
      .map(l => ({ item, validade: l.validade, saldo: l.saldo, dias: diasAteValidade(l.validade) }))
    )
    .filter(a => a.dias !== null && a.dias <= LIMITE_VENCENDO_DIAS)
    .sort((a, b) => a.validade.localeCompare(b.validade))
  const itensComAlertaValidade = new Set(alertasValidade.map(a => a.item.id))

  const totalAlertas = baixo.length + alertasValidade.length
  const catList = [...new Set(itens.map(i => i.categoria))].sort()

  // Movimentações filtradas pelo ciclo local (itens de estoque não são filtrados: são saldo atual)
  const movsFiltrados = movs.filter(m => cicloLocal && dentroDoCiclo(m.data, cicloLocal))

  if (loading) return <Loading />
  if (loadError) return <ErroCarregamento onRetry={loadAll} />

  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <SeletorCicloLocal cicloLocal={cicloLocal} setCicloLocal={setCicloLocal} ciclos={ciclos} />
      </div>

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
              {alertasValidade.length > 0 && <span style={{ color: '#633806', fontWeight: 500 }}> · {alertasValidade.length} lote{alertasValidade.length !== 1 ? 's' : ''} vencendo</span>}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {podeEditarEstoque && (
                <button className="btn btn-primary btn-sm" onClick={() => { setForm({ categoria: 'Medicamento', itemMovGrupo: GRUPO_SUGERIDO_POR_CATEGORIA['Medicamento'], rateios: rateiosVazios() }); setModal('item') }}>
                  <i className="ti ti-plus" /> Novo item
                </button>
              )}
              <BotaoPDF contentRef={refInv} filename="estoque-inventario" titulo="Estoque: Inventário" />
            </div>
          </div>

          <div ref={refInv}>
            {itens.length === 0
              ? <EmptyState icon="📦" title="Estoque vazio" sub="Cadastre os itens do estoque."
                  action={podeEditarEstoque ? <button className="btn btn-primary btn-sm" onClick={() => { setForm({ categoria: 'Medicamento', itemMovGrupo: GRUPO_SUGERIDO_POR_CATEGORIA['Medicamento'], rateios: rateiosVazios() }); setModal('item') }}><i className="ti ti-plus" />Novo item</button> : undefined} />
              : catList.map(cat => (
                <div key={cat} className="card" style={{ marginBottom: 10 }}>
                  <div className="card-title"><i className="ti ti-tag" /> {cat}</div>
                  {itens.filter(i => i.categoria === cat).map(item => {
                    const pct    = item.minimo > 0 ? Math.min(100, Math.round(parseFloat(item.quantidade) / parseFloat(item.minimo) * 100)) : 100
                    const ok     = parseFloat(item.quantidade) >= parseFloat(item.minimo)
                    const lotes  = lotesPorItem[item.id] || []
                    const lotesComValidade = lotes.filter(l => l.validade)
                    const proxima = proximaValidade(item.id)
                    const dias    = diasAteValidade(proxima)
                    const temAlertaValidade = itensComAlertaValidade.has(item.id)
                    return (
                      <div key={item.id} style={{ padding: '8px 0', borderBottom: '.5px solid #F3F4F6' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '.88rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {item.item}
                            {temAlertaValidade && <i className="ti ti-alert-triangle-filled" style={{ color: '#E24B4A', fontSize: 14 }} title="Lote vencido ou vencendo" />}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <div style={{ flex: 1, maxWidth: 120 }}>
                              <div className="progress-bg">
                                <div className="progress-fill" style={{ width: `${pct}%`, background: ok ? '#7B2FBE' : '#E24B4A' }} />
                              </div>
                            </div>
                            <span style={{ fontSize: '.75rem', color: '#9CA3AF' }}>
                              {parseFloat(item.quantidade).toFixed(1)} {item.unidade} / mín {parseFloat(item.minimo).toFixed(1)}
                            </span>
                          </div>
                          {/* Próxima validade (calculada por lote, FEFO) */}
                          {proxima !== null && (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              {dias < 0
                                ? <Badge color="red">Vencido há {Math.abs(dias)} dia{Math.abs(dias) !== 1 ? 's' : ''}</Badge>
                                : dias <= LIMITE_VENCENDO_DIAS
                                  ? <Badge color="amber">Vence em {dias} dia{dias !== 1 ? 's' : ''}</Badge>
                                  : <span style={{ fontSize: '.72rem', color: '#9CA3AF' }}>Próx. validade: {fmtData(proxima)}</span>
                              }
                              {lotesComValidade.length > 0 && (
                                <button type="button" onClick={() => setItemExpandido(p => p === item.id ? null : item.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2B6CD9', fontSize: '.72rem', padding: 0 }}>
                                  {itemExpandido === item.id ? 'Ocultar lotes' : `Ver lotes (${lotesComValidade.length})`}
                                </button>
                              )}
                            </div>
                          )}
                          {itemExpandido === item.id && lotesComValidade.length > 0 && (
                            <div style={{ marginTop: 6, background: '#F9FAFB', border: '.5px solid #E5E7EB', borderRadius: 8, padding: '6px 10px' }}>
                              {lotesComValidade.map((l, i) => (
                                <div key={i} style={{ fontSize: '.75rem', color: '#374151', padding: '2px 0' }}>
                                  {parseFloat(l.saldo).toFixed(1)} {item.unidade} — vence {fmtMesAno(l.validade)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Badge color={ok ? 'green' : 'red'}>{ok ? 'OK' : '⚠ Baixo'}</Badge>
                        {podeEditarEstoque && (
                          <button className="btn btn-secondary btn-xs"
                            onClick={() => { setForm({ ...item, _edit: true }); setModal('item') }}>
                            <i className="ti ti-edit" />
                          </button>
                        )}
                        {podeEditarEstoque && (
                          <button className="btn-icon" title="Excluir item"
                            onClick={() => setConfirmDel(item)}
                            style={{ color: '#E24B4A', padding: '4px 6px' }}>
                            <i className="ti ti-trash" style={{ fontSize: 15 }} />
                          </button>
                        )}
                      </div>
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
          <BannerCicloEncerrado ciclo={cicloLocal} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: '.85rem', color: '#6B7280' }}>{movsFiltrados.length} movimentações neste ciclo</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {podeEditarMovCiclo && (
                <button className="btn btn-primary btn-sm" onClick={() => { setForm({ tipo: 'S', data: hojeISO(), rateios: rateiosVazios() }); setModal('mov') }}>
                  <i className="ti ti-plus" /> Movimentar
                </button>
              )}
              <BotaoPDF contentRef={refMov} filename="estoque-movimentacoes" titulo="Estoque: Movimentações" />
            </div>
          </div>
          <div ref={refMov}>
            {movsFiltrados.length === 0
              ? <EmptyState icon="📋" title="Nenhuma movimentação neste ciclo" />
              : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th style={{ textAlign: 'right' }}>Qtde</th><th>Motivo</th><th></th></tr></thead>
                    <tbody>
                      {movsFiltrados.map(m => (
                        <tr key={m.id}>
                          <td>{fmtData(m.data)}</td>
                          <td><Badge color={m.tipo === 'E' ? 'green' : 'amber'}>{m.tipo === 'E' ? 'Entrada' : 'Saída'}</Badge></td>
                          <td style={{ fontWeight: 500 }}>{m.item?.item || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500, color: m.tipo === 'E' ? '#1E55B0' : '#791F1F' }}>
                            {m.tipo === 'E' ? '+' : '-'}{parseFloat(m.quantidade).toFixed(1)} {m.item?.unidade}
                          </td>
                          <td style={{ color: '#9CA3AF', fontSize: '.78rem' }}>
                            {m.procedimento_id && <Badge color="purple">Sanidade</Badge>}
                            {m.lancamento_id && (m.tipo === 'E' ? <Badge color="red">Despesa</Badge> : <Badge color="green">Receita</Badge>)}
                            {' '}{m.motivo}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {podeEditarMovCiclo && dataEhEditavel(m.data) && (
                              // Mesmo ícone/rótulo nos dois tipos — é a MESMA ação (reverter),
                              // só o efeito é oposto (saída devolve, entrada remove); a lixeira
                              // na saída sugeria "apagar", quando na prática sempre é reversão.
                              <button className="btn-icon" title="Reverter lançamento"
                                onClick={() => clicarReverterMov(m)} style={{ color: m.tipo === 'S' ? '#E24B4A' : '#2B6CD9', padding: '4px 6px' }}>
                                <i className="ti ti-arrow-back-up" style={{ fontSize: 15 }} />
                              </button>
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
        </div>
      )}

      {/* ── Alertas ── */}
      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <BotaoPDF contentRef={refAlertas} filename="estoque-alertas" titulo="Estoque: Alertas" />
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

            {/* Vencimentos (por lote — um item pode ter mais de um lote vencendo) */}
            {alertasValidade.length > 0 ? (
              <div style={{ marginTop: baixo.length > 0 ? 16 : 0 }}>
                <div className="sl" style={{ marginBottom: 8 }}>Vencimentos</div>
                {alertasValidade.map((a, i) => {
                  const vencido = a.dias < 0
                  return (
                    <AlertBox key={`val-${a.item.id}-${i}`}
                      type={vencido ? 'red' : 'amber'}
                      title={`${a.item.item} — ${vencido ? 'lote vencido' : 'lote próximo do vencimento'}`}
                      body={`Validade: ${fmtData(a.validade)} · ${vencido
                        ? `Vencido há ${Math.abs(a.dias)} dia${Math.abs(a.dias) !== 1 ? 's' : ''}`
                        : `Vence em ${a.dias} dia${a.dias !== 1 ? 's' : ''}`
                      } · Saldo do lote: ${parseFloat(a.saldo).toFixed(1)} ${a.item.unidade}`}
                    />
                  )
                })}
              </div>
            ) : (
              totalAlertas === 0 && (
                <AlertBox type="green" title="Sem vencimentos próximos" body={`Nenhum lote vence nos próximos ${LIMITE_VENCENDO_DIAS} dias.`} />
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
                      <span style={{ color: ok ? '#1E55B0' : '#791F1F', fontWeight: 500 }}>
                        {parseFloat(item.quantidade).toFixed(1)} / {parseFloat(item.minimo).toFixed(1)} {item.unidade}
                      </span>
                    </div>
                    <div className="progress-bg">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: ok ? '#7B2FBE' : '#E24B4A' }} />
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
            <select value={form.categoria || 'Medicamento'} onChange={e => setForm(p => ({
              ...p, categoria: e.target.value,
              itemMovGrupo: GRUPO_SUGERIDO_POR_CATEGORIA[e.target.value] || p.itemMovGrupo,
            }))}>
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
        {!form._edit && parseFloat(form.quantidade) > 0 && (
          <div className="grid-form">
            <Field label="Data da entrada" hint="A quantidade inicial vira uma entrada de estoque, com data e validade próprias.">
              <input type="date" value={form.entrada_data || hojeISO()}
                onChange={e => setForm(p => ({ ...p, entrada_data: e.target.value }))} />
            </Field>
            <Field label="Validade" hint="Opcional — nem todo item tem (ex: ferramentas).">
              <input type="date" value={form.entrada_validade || ''} onChange={e => setForm(p => ({ ...p, entrada_validade: e.target.value }))} />
            </Field>
          </div>
        )}

        {/* ── Bloco D10 — caminho 6: quantidade inicial -> despesa (opcional). MESMO
            mecanismo do caminho 4 (Movimentar): criarLancamentoRateado + aplicarMovimentacaoEstoque. ── */}
        {!form._edit && parseFloat(form.quantidade) > 0 && podeEditarEstoque && podeEditarFinanceiro && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.lancarComoDespesaItem}
                onChange={e => setForm(p => ({ ...p, lancarComoDespesaItem: e.target.checked }))} />
              Lançar também como despesa no financeiro
            </label>
            <p style={{ fontSize: '.75rem', color: '#9CA3AF', margin: '4px 0 0' }}>
              Opcional — se este estoque já existia antes do sistema (não foi uma compra de verdade), não marque.
            </p>
            {form.lancarComoDespesaItem && (
              <>
                <div className="grid-form" style={{ marginTop: 10 }}>
                  <Field label="Grupo" required>
                    <GrupoSelect value={form.itemMovGrupo} opcoes={gruposDisponiveis('D', gruposExtras)}
                      onChange={g => setForm(p => ({ ...p, itemMovGrupo: g }))} />
                  </Field>
                </div>
                {numeroPositivo(form.quantidade) && numeroPositivo(form.preco_unit) && (
                  <p style={{ fontSize: '.78rem', color: '#6B7280', marginTop: 4 }}>
                    Total da despesa: {fmtMoeda(numeroPositivo(form.quantidade) * numeroPositivo(form.preco_unit))} (quantidade inicial × preço unitário acima)
                  </p>
                )}
                <RateioProprietarios tipo="D" valorTotal={(numeroPositivo(form.quantidade) || 0) * (numeroPositivo(form.preco_unit) || 0)}
                  props={props} rateios={form.rateios} onChange={r => setForm(p => ({ ...p, rateios: r }))} />
              </>
            )}
          </div>
        )}

        {form._edit && (
          <div style={{ fontSize: '.75rem', color: '#9CA3AF', marginTop: -4, marginBottom: 4 }}>
            A validade é registrada por lote, na entrada de estoque (aba Movimentar), não aqui.
          </div>
        )}
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

      {/* ── Confirm reverter movimentação (saída ou entrada) — mesmo título nos
          dois tipos (é a mesma ação); a mensagem diz o efeito exato ANTES de
          executar (quanto volta ou sai do saldo), que é oposto em cada caso. ── */}
      <Confirm
        open={!!confirmMov}
        onClose={() => setConfirmMov(null)}
        onConfirm={() => reverterMov(confirmMov)}
        title="Reverter lançamento"
        message={(() => {
          if (!confirmMov) return ''
          const efeito = efeitoReversaoMov(confirmMov)
          if (!efeito) return ''
          const efeitoTxt = confirmMov.tipo === 'S'
            ? `devolver ${efeito.qt.toFixed(1)} ${efeito.item.unidade} ao estoque de "${efeito.item.item}" (saldo passa de ${efeito.atual.toFixed(1)} para ${efeito.novaQt.toFixed(1)} ${efeito.item.unidade})`
            : `remover ${efeito.qt.toFixed(1)} ${efeito.item.unidade} do estoque de "${efeito.item.item}" (saldo passa de ${efeito.atual.toFixed(1)} para ${efeito.novaQt.toFixed(1)} ${efeito.item.unidade})`
          const vinculoTxt = confirmMov.lancamento_id
            ? ` e apagar ${confirmMov.tipo === 'S' ? 'a receita' : 'a despesa'} vinculada`
            : ''
          return `Isto vai ${efeitoTxt}${vinculoTxt}. Esta ação não pode ser desfeita.`
        })()}
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
            <select value={form.tipo || 'S'} onChange={e => setForm(p => ({
              ...p, tipo: e.target.value,
              lancarComoDespesa: false, lancarComoReceita: false, movGrupo: '', movUnitario: '', movValorReceita: '',
            }))}>
              <option value="S">Saída (uso)</option>
              <option value="E">Entrada (compra)</option>
            </select>
          </Field>
          <Field label="Data">
            <input type="date" value={form.data || ''} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
          </Field>
          <Field label="Item" required>
            <select value={form.item_id || ''} onChange={e => {
              const id = e.target.value
              const item = itens.find(i => i.id === id)
              setForm(p => ({
                ...p, item_id: id,
                movUnitario: item ? String(item.preco_unit ?? '') : p.movUnitario,
                movGrupo: item ? (GRUPO_SUGERIDO_POR_CATEGORIA[item.categoria] || p.movGrupo) : p.movGrupo,
              }))
            }}>
              <option value="">— selecione —</option>
              {itens.map(i => <option key={i.id} value={i.id}>{i.item} ({parseFloat(i.quantidade).toFixed(1)} {i.unidade})</option>)}
            </select>
          </Field>
          <Field label="Quantidade" required>
            <input type="number" step="0.1" value={form.quantidade || ''} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} placeholder="0" />
          </Field>
          {form.tipo === 'E' && (
            <Field label="Validade" hint="Opcional — nem todo item tem (ex: ferramentas). Cada entrada forma um lote com sua própria validade.">
              <input type="date" value={form.validade || ''} onChange={e => setForm(p => ({ ...p, validade: e.target.value }))} />
            </Field>
          )}
        </div>
        <Field label="Motivo">
          <input value={form.motivo || ''} onChange={e => setForm(p => ({ ...p, motivo: e.target.value }))} placeholder="ex: Vermifugação geral" />
        </Field>

        {/* ── Bloco D10 — caminho 4: entrada -> despesa (opcional) ── */}
        {form.tipo === 'E' && podeEditarEstoque && podeEditarFinanceiro && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.lancarComoDespesa}
                onChange={e => setForm(p => ({ ...p, lancarComoDespesa: e.target.checked }))} />
              Lançar também como despesa no financeiro
            </label>
            {form.lancarComoDespesa && (
              <>
                <div className="grid-form" style={{ marginTop: 10 }}>
                  <Field label="Valor unitário (R$)" required hint="Preço de UMA unidade — o total vai pro lançamento (quantidade × unitário).">
                    <input type="number" step="0.01" value={form.movUnitario || ''} onChange={e => setForm(p => ({ ...p, movUnitario: e.target.value }))} placeholder="0,00" />
                  </Field>
                  <Field label="Grupo" required>
                    <GrupoSelect value={form.movGrupo} opcoes={gruposDisponiveis('D', gruposExtras)}
                      onChange={g => setForm(p => ({ ...p, movGrupo: g }))} />
                  </Field>
                </div>
                {numeroPositivo(form.quantidade) && numeroPositivo(form.movUnitario) && (
                  <p style={{ fontSize: '.78rem', color: '#6B7280', marginTop: 4 }}>
                    Total da despesa: {fmtMoeda(numeroPositivo(form.quantidade) * numeroPositivo(form.movUnitario))}
                  </p>
                )}
                <RateioProprietarios tipo="D" valorTotal={(numeroPositivo(form.quantidade) || 0) * (numeroPositivo(form.movUnitario) || 0)}
                  props={props} rateios={form.rateios} onChange={r => setForm(p => ({ ...p, rateios: r }))} />
              </>
            )}
          </div>
        )}

        {/* ── Bloco D10 — caminho 5: saída -> receita (opcional) ── */}
        {form.tipo === 'S' && podeEditarEstoque && podeEditarFinanceiro && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '.5px solid #E5E7EB' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form.lancarComoReceita}
                onChange={e => setForm(p => ({ ...p, lancarComoReceita: e.target.checked }))} />
              Lançar também como receita no financeiro
            </label>
            {form.lancarComoReceita && (
              <>
                <div className="grid-form" style={{ marginTop: 10 }}>
                  <Field label="Valor da venda (R$)" required hint="Valor de venda informado por você — não tem relação com o preço cadastrado do item.">
                    <input type="number" step="0.01" value={form.movValorReceita || ''} onChange={e => setForm(p => ({ ...p, movValorReceita: e.target.value }))} placeholder="0,00" />
                  </Field>
                  <Field label="Grupo" required>
                    <GrupoSelect value={form.movGrupo} opcoes={gruposDisponiveis('R', gruposExtras)}
                      onChange={g => setForm(p => ({ ...p, movGrupo: g }))} />
                  </Field>
                </div>
                <RateioProprietarios tipo="R" valorTotal={numeroPositivo(form.movValorReceita) || 0}
                  props={props} rateios={form.rateios} onChange={r => setForm(p => ({ ...p, rateios: r }))} />
              </>
            )}
          </div>
        )}

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
