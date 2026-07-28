import { db } from './supabase'
import { rateioIgualCentavos, GRUPOS_REC, GRUPOS_DES, capitalizarPrimeira } from './helpers'

// ── estoqueFinanceiro.js — módulo ÚNICO para os 5 caminhos que cruzam
// Estoque, Financeiro e Sanidade:
//   1. Sanidade  -> baixa de estoque (saída)
//   2. Financeiro (despesa) -> entrada de estoque
//   3. Financeiro (receita) -> saída de estoque
//   4. Estoque (entrada) -> lançamento de despesa
//   5. Estoque (saída)   -> lançamento de receita
// Nenhuma tela (Sanidade.jsx, Financeiro.jsx, Estoque.jsx) deve ter sua
// própria cópia de nenhuma destas regras — todas chamam as funções daqui.
//
// Vínculo: estoque_movimentacoes.procedimento_id (caminho 1) ou
// .lancamento_id (caminhos 2-5), ambos ON DELETE SET NULL — a reversão de
// verdade é sempre feita em código (2 passadas: valida tudo, só então
// grava tudo), nunca por trigger.
//
// Assimetria INTENCIONAL entre os grupos (não é bug, ver manual): uma
// movimentação ligada a um procedimento de Sanidade só pode ser revertida
// PELA Sanidade (Estoque bloqueia e redireciona) — Sanidade é quem baixa
// vários itens de uma vez e é dona da regra. Já uma movimentação ligada a um
// lançamento financeiro pode ser revertida pelos dois lados (Estoque reverte
// e apaga o lançamento; Financeiro exclui o lançamento e reverte o estoque)
// — é sempre 1-pra-1, nenhum dos dois lados "manda" mais que o outro.

// 1. Validação de saldo — pedidos: [{ item_id, quantidade }] (pode repetir
// item_id; soma tudo antes de comparar, pro caso de um procedimento usar o
// mesmo item em mais de uma linha). Retorna a mensagem pronta ou null.
export function validarSaldoEstoque(itensEstoque, pedidos) {
  const totais = {}
  for (const p of pedidos) {
    if (!p.item_id) continue
    totais[p.item_id] = (totais[p.item_id] || 0) + (parseFloat(p.quantidade) || 0)
  }
  for (const [itemId, total] of Object.entries(totais)) {
    const item = itensEstoque.find(i => i.id === itemId)
    if (!item) continue
    if (total > parseFloat(item.quantidade)) {
      return `Saldo insuficiente de "${item.item}": disponível ${parseFloat(item.quantidade).toFixed(1)} ${item.unidade}, solicitado ${total.toFixed(1)} ${item.unidade}.`
    }
  }
  return null
}

// 2. Aplica UMA movimentação nova (entrada ou saída) com vínculo opcional —
// insere a linha em estoque_movimentacoes e SÓ DEPOIS ajusta
// estoque_itens.quantidade (nunca em paralelo). Ordem proposital, já usada
// em Sanidade.jsx antes desta consolidação: se algo falhar no meio, é
// preferível ficar com uma movimentação SEM o saldo ajustado ainda (visível
// em Estoque → Movimentar, auditável e corrigível manualmente) do que um
// saldo ajustado sem nenhuma movimentação explicando a diferença (invisível,
// indetectável). vinculo: { procedimento_id } | { lancamento_id } | {}
// (avulsa, sem vínculo). precoUnitNovo só deve ser passado nos caminhos que
// representam uma COMPRA de verdade (2 e 4) — nunca em saída (1, 3, 5): é a
// ÚNICA regra que decide se preco_unit muda, centralizada aqui, não em cada tela.
export async function aplicarMovimentacaoEstoque({ itemId, tipo, quantidade, data, motivo, validade, vinculo = {}, precoUnitNovo, itensEstoque }) {
  const item = itensEstoque.find(i => i.id === itemId)
  if (!item) return { error: { message: 'Item de estoque não encontrado.' } }
  const qt = parseFloat(quantidade)
  const novaQt = tipo === 'E' ? parseFloat(item.quantidade) + qt : parseFloat(item.quantidade) - qt

  const { data: movData, error: errMov } = await db.movEstoque.insert({
    item_id: itemId, data, tipo, quantidade: qt, motivo,
    validade: tipo === 'E' ? (validade || null) : null,
    ...vinculo,
  })
  if (errMov) return { error: errMov }

  const updatePayload = { quantidade: novaQt }
  if (precoUnitNovo != null) updatePayload.preco_unit = precoUnitNovo
  const { error: errSaldo } = await db.estoque.update(itemId, updatePayload)
  if (errSaldo) return { data: movData, novaQt, error: errSaldo, movJaGravada: true }

  return { data: movData, novaQt, error: null }
}

// 3. Calcula o efeito de reverter UMA movimentação já existente — NUNCA
// escreve nada sozinha, só calcula e valida (quem chama decide se aplica).
export function calcularReversaoMov(mov, itemAtual) {
  if (!itemAtual) return { ok: true, semItem: true } // item já foi excluído por outro caminho — nada a reverter, não é erro
  const qt = parseFloat(mov.quantidade)
  const atual = parseFloat(itemAtual.quantidade)
  const novaQt = mov.tipo === 'E' ? atual - qt : atual + qt
  if (mov.tipo === 'E' && novaQt < 0) {
    return {
      ok: false,
      erro: `Não é possível reverter: o estoque de "${itemAtual.item}" ficaria negativo (saldo atual: ${atual.toFixed(1)} ${itemAtual.unidade}, entrada: ${qt.toFixed(1)} ${itemAtual.unidade}).`,
    }
  }
  return { ok: true, novaQt, item: itemAtual }
}

// 4. Busca fresca (não confia em cache local) das movimentações vinculadas a
// UM procedimento OU UM lançamento — nunca os dois ao mesmo tempo.
export async function buscarMovsVinculadas({ procedimentoId, lancamentoId }) {
  if (procedimentoId) return db.movEstoque.listPorProcedimento(procedimentoId)
  if (lancamentoId) return db.movEstoque.listPorLancamento(lancamentoId)
  return { data: [], error: null }
}

// 5. Reverte TODAS as movimentações vinculadas a um procedimento OU
// lançamento — 2 passadas (valida tudo primeiro, só então grava tudo), nunca
// deixa reversão pela metade. checarCicloEditavel(dataDaMovimentacao) é
// opcional — quando passado, é checado do lado do ESTOQUE além do lado de
// quem chamou (os caminhos 2-5 precisam dos dois ciclos editáveis, não só
// do lado que iniciou a exclusão).
export async function reverterCascata({ procedimentoId, lancamentoId, itensEstoque, podeEditarEstoque, checarCicloEditavel }) {
  const { data: movs, error: errBusca } = await buscarMovsVinculadas({ procedimentoId, lancamentoId })
  if (errBusca) return { ok: false, erro: 'Erro ao consultar movimentações vinculadas: ' + errBusca.message }
  if (!movs?.length) return { ok: true, movs: [] }

  if (!podeEditarEstoque) {
    return {
      ok: false,
      erro: procedimentoId
        ? 'Este registro baixou itens do estoque. É necessária permissão de edição no módulo Estoque para excluí-lo.'
        : 'Este lançamento tem uma movimentação de estoque vinculada. É necessária permissão de edição no módulo Estoque para excluí-lo.',
    }
  }

  // 1ª passada: só valida (saldo negativo + ciclo editável do lado do
  // estoque) — nada é gravado ainda. saldosLocais acumula linha a linha:
  // um procedimento pode ter mais de uma movimentação do MESMO item (N
  // itens por procedimento é a multiplicidade normal do caminho 1), então
  // validar/aplicar contra um snapshot estático subestimaria o efeito
  // acumulado — precisa ser o mesmo saldo "andando" nas duas passadas.
  const saldosLocais = {}
  const saldoDoItem = (itemId) => {
    if (itemId in saldosLocais) return saldosLocais[itemId]
    const item = itensEstoque.find(i => i.id === itemId)
    return item ? parseFloat(item.quantidade) : null
  }
  for (const mov of movs) {
    const item = itensEstoque.find(i => i.id === mov.item_id)
    const atual = saldoDoItem(mov.item_id)
    const efeito = calcularReversaoMov(mov, item ? { ...item, quantidade: atual } : null)
    if (!efeito.ok) return { ok: false, erro: efeito.erro }
    if (!efeito.semItem) saldosLocais[mov.item_id] = efeito.novaQt
    if (checarCicloEditavel && !checarCicloEditavel(mov.data)) {
      return { ok: false, erro: `Não é possível reverter: a movimentação de "${item?.item || 'item'}" (${mov.data}) está fora do ciclo atual (ou em um ciclo já encerrado) do lado do Estoque.` }
    }
  }
  // 2ª passada: aplica de fato, com o mesmo acúmulo linha a linha da
  // validação acima. Saldo primeiro, movimentação depois (ao contrário da
  // criação) — se a exclusão da linha falhar no meio, fica um saldo já
  // corrigido com a movimentação AINDA visível em Estoque → Movimentar
  // (auditável), nunca o inverso (saldo intacto sem nada explicando por
  // quê). Pára no primeiro erro real de escrita — não continua pras
  // próximas linhas com uma já com problema.
  const saldosAplicados = {}
  const saldoAplicadoDoItem = (itemId) => {
    if (itemId in saldosAplicados) return saldosAplicados[itemId]
    const item = itensEstoque.find(i => i.id === itemId)
    return item ? parseFloat(item.quantidade) : null
  }
  for (const mov of movs) {
    const item = itensEstoque.find(i => i.id === mov.item_id)
    const atual = saldoAplicadoDoItem(mov.item_id)
    const efeito = calcularReversaoMov(mov, item ? { ...item, quantidade: atual } : null)
    if (!efeito.semItem) {
      saldosAplicados[mov.item_id] = efeito.novaQt
      const { error: errSaldo } = await db.estoque.update(mov.item_id, { quantidade: efeito.novaQt })
      if (errSaldo) return { ok: false, erro: `Erro ao devolver "${item?.item || 'item'}" ao estoque: ${errSaldo.message}. Interrompido — revise em Estoque antes de tentar de novo.` }
    }
    const { error: errDel } = await db.movEstoque.delete(mov.id)
    if (errDel) return { ok: false, erro: 'Erro ao remover movimentação de estoque: ' + errDel.message + '. Interrompido.' }
  }
  return { ok: true, movs }
}

// 6. Cria um lançamento financeiro já com rateio — despesa sempre exige
// rateio (auto-preenche igual entre proprietários ativos se vier vazio),
// receita não. Mesma regra que já existia só dentro de
// Financeiro.jsx::salvarLanc, agora reutilizável pelos caminhos 4/5
// (lançamento criado a partir da tela de Estoque).
export async function criarLancamentoRateado({ contaId, fazendaId, cicloId, tipo, grupo, descricao, valor, data, rateios, props }) {
  // Rateio é validado/calculado ANTES de inserir o lançamento — se falhar,
  // nada é gravado (nem o lançamento fica órfão sem rateio).
  let rateiosParaSalvar = (rateios || []).filter(r => parseFloat(r.valor) > 0)
  if (tipo === 'D') {
    if (rateiosParaSalvar.length === 0) {
      if (!props?.length) return { error: { message: 'Cadastre ao menos um proprietário para lançar despesas (o rateio é obrigatório).' } }
      rateiosParaSalvar = rateioIgualCentavos(valor, props)
    } else {
      const soma = rateiosParaSalvar.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0)
      if (Math.abs(soma - valor) > 0.01) {
        return { error: { message: `A soma do rateio (${soma.toFixed(2)}) precisa bater com o valor total do lançamento (${valor.toFixed(2)}).` } }
      }
    }
  }

  // Grupo/descrição capitalizados aqui, no único ponto de escrita de
  // lancamentos_financeiros usado por todos os caminhos (manual e Estoque
  // 2-6) — regra de formatação única, sem repetir em cada tela chamadora.
  const { data: lancData, error } = await db.lancamentos.insert({
    ciclo_id: cicloId, data, tipo,
    grupo: capitalizarPrimeira(grupo), descricao: capitalizarPrimeira(descricao), valor,
  })
  if (error || !lancData?.id) return { error: error || { message: 'Erro ao criar lançamento.' } }

  let avisoRateio = null
  if (rateiosParaSalvar.length > 0) {
    const payload = rateiosParaSalvar.map(r => ({
      conta_id: contaId, fazenda_id: fazendaId, lancamento_id: lancData.id,
      proprietario_id: r.proprietario_id, valor: parseFloat(r.valor) || 0, percentual: parseFloat(r.percentual) || 0,
    }))
    const { error: errRateio } = await db.lancamentoRateios.inserirVarios(payload)
    if (errRateio) avisoRateio = errRateio.message
  }
  return { data: lancData, error: null, avisoRateio, rateioAplicado: rateiosParaSalvar }
}

// 7. Grupos "personalizados" (digitados à mão, fora de GRUPOS_REC/GRUPOS_DES)
// que já foram usados em algum lançamento — usado pelas DUAS telas
// (Financeiro e Estoque) pra montar a mesma lista de opções nos dois
// lugares, sem precisar de uma tabela própria pra grupos. Busca sempre
// fresca (não cacheada) — quem chama decide quando recarregar.
export async function carregarGruposExtras() {
  const { data, error } = await db.lancamentos.listGrupos()
  if (error) return { extras: { R: [], D: [] }, error }
  const extrasDe = (tipo, fixos) => [...new Set(
    (data || []).filter(g => g.tipo === tipo && g.grupo).map(g => g.grupo)
  )].filter(g => !fixos.includes(g))
  return { extras: { R: extrasDe('R', GRUPOS_REC), D: extrasDe('D', GRUPOS_DES) }, error: null }
}

// 8. União da lista fixa com os extras já carregados, pro tipo pedido.
export function gruposDisponiveis(tipo, extras) {
  return tipo === 'R' ? [...GRUPOS_REC, ...(extras?.R || [])] : [...GRUPOS_DES, ...(extras?.D || [])]
}

// 9. Acrescenta um grupo novo ao estado local de extras logo após salvar um
// lançamento — assim ele já aparece nas próximas opções da MESMA sessão,
// sem esperar reload da página (recarregar a tela do zero também funciona,
// porque carregarGruposExtras busca direto do banco, mas não é preciso
// esperar isso: cada tela chama esta função certeira depois de salvar).
export function comGrupoExtra(extras, tipo, grupo) {
  const fixos = tipo === 'R' ? GRUPOS_REC : GRUPOS_DES
  if (!grupo || fixos.includes(grupo) || (extras[tipo] || []).includes(grupo)) return extras
  return { ...extras, [tipo]: [...(extras[tipo] || []), grupo] }
}
