import { db } from './supabase'

// ── Desmame — módulo ÚNICO usado pelos DOIS pontos de entrada: aba Desmame
// de Pesagens.jsx (em lote) e o card "Desmame dos terneiros deste lote" no
// detalhe do lote em Reprodutivo.jsx (Fase 10). Antes cada tela tinha sua
// própria cópia da gravação (mesmas 2 tabelas, mesmas colunas: animais.
// data_desmame + pesagens tipo='desmama'), com peso OBRIGATÓRIO num lado e
// OPCIONAL no outro — os desmames sem peso ficavam fora de kg_desmame/
// kg_bezerro_matriz (calcDesmameMetrics, helpers.js) sem nenhum aviso pro
// usuário.
//
// Um ciclo de duas etapas (registrar → confirmar, com edição no meio) chegou
// a existir aqui e foi removido a pedido do usuário: simples demais pra
// precisar de trava — um único clique em "Registrar desmame" já confirma
// (com aviso de que isso entra no cálculo dos indicadores, mostrado pela
// tela ANTES de chamar esta função), e "Desfazer" cobre o caso de correção.
// animais.desmame_confirmado ainda existe no banco (default true) mas não é
// mais escrita por este módulo — ver decisão registrada no manual/changelog,
// não há mais estado "pendente" que ela precise representar.

// Grava um desmame — digitar/confirmar já é definitivo (sem etapa de
// confirmação separada). peso é opcional: sem peso, grava só data_desmame,
// sem inserir pesagem — mas a UI de cada tela só chega aqui com peso
// preenchido (peso digitado é o que seleciona o animal pro desmame).
export async function registrarDesmame({ animalId, data, pesoKg }) {
  const { error: errAnimal } = await db.animais.update(animalId, { data_desmame: data })
  if (errAnimal) return { error: errAnimal.message }

  const peso = pesoKg === '' || pesoKg === null || pesoKg === undefined ? null : parseFloat(pesoKg)
  if (Number.isFinite(peso) && peso > 0) {
    const { error: errPesagem } = await db.pesagens.insert({
      animal_id: animalId, data, tipo: 'desmama', peso_kg: peso, observacoes: 'Peso ao desmame',
    })
    if (errPesagem) return { error: `data de desmame gravada, mas o peso falhou: ${errPesagem.message}` }
  }
  return { error: null }
}

// Desfaz um desmame já registrado (corrige lançamento por engano) — limpa
// data_desmame e apaga a pesagem de desmame associada, se houver. A tela
// avisa ANTES de chamar isto que isso também muda os indicadores.
export async function desfazerDesmame({ animalId, pesagemId }) {
  const { error: errAnimal } = await db.animais.update(animalId, { data_desmame: null })
  if (errAnimal) return { error: errAnimal.message }
  if (pesagemId) {
    const { error } = await db.pesagens.delete(pesagemId)
    if (error) return { error: `desmame desfeito, mas não foi possível apagar o peso: ${error.message}` }
  }
  return { error: null }
}
