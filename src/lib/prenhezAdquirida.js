import { db } from './supabase'
import { GESTACAO_ANGUS_DIAS, PRENHEZ_ADQUIRIDA_LABEL } from './helpers'

// ── Prenhez adquirida (Item 8) — vaca comprada já prenha, sem nenhuma
// inseminação/monta registrada NESTE sistema. Sem um lote com diagnóstico
// 'P', ela nunca aparece em maesElegiveis (Reprodutivo.jsx) e o nascimento do
// terneiro dela é bloqueado pela regra "todo parto precisa de safra
// vinculada" (Fase 12). Este módulo cria o lote que representa a monta
// ocorrida na fazenda de ORIGEM — mesmo raciocínio de uma monta normal, só
// que o diagnóstico já é um fato conhecido na compra, não uma etapa futura.
// Usado tanto na hora da compra (Financeiro.jsx) quanto no vínculo
// retroativo (Reprodutivo.jsx, aba Lotes/Montas) — mesmo helper, pra nunca
// divergir entre os dois pontos de entrada.

// PRENHEZ_ADQUIRIDA_LABEL agora mora em helpers.js (2026-08-11) — virou
// critério de exclusão de índices reprodutivos (Metas/Relatorios/
// Reprodutivo), que não importam mais nada deste arquivo. Reexportado aqui
// pra nenhum import existente (Reprodutivo.jsx) precisar mudar.
export { PRENHEZ_ADQUIRIDA_LABEL }

function addDias(dataISO, dias) {
  const d = new Date(dataISO + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

// O usuário informa UMA das duas datas — normalmente a previsão de parto
// (o dado mais confiável na prática, geralmente passado pelo vendedor),
// às vezes a data da monta em si — a outra é sempre derivada pela gestação
// padrão Angus (283 dias). Informar a previsão de parto e derivar a monta a
// partir dela é o caminho mais seguro: a monta cai exatamente no centro da
// janela de gestação válida (260-300 dias, ver erroJanelaGestacao em
// Reprodutivo.jsx), então uma estimativa errada não bloqueia o parto real
// depois.
export function derivarDatasGestacao({ dataMonta, dataPartoPrevisto }) {
  if (dataMonta) return { dataMonta, dataPartoPrevisto: addDias(dataMonta, GESTACAO_ANGUS_DIAS) }
  if (dataPartoPrevisto) return { dataMonta: addDias(dataPartoPrevisto, -GESTACAO_ANGUS_DIAS), dataPartoPrevisto }
  return { dataMonta: null, dataPartoPrevisto: null }
}

// Cria (ou usa) uma estação de monta + um lote representando a monta de
// origem + uma inseminação por animal, já com diagnóstico 'P' confirmado
// (a gestação é um FATO conhecido na compra — não faz sentido reabrir uma
// etapa de "aguardando diagnóstico" pra algo que já se sabe). O campo touro
// é o rótulo fixo PRENHEZ_ADQUIRIDA_LABEL, pra nunca se confundir com uma
// monta de verdade feita na fazenda ao navegar pela aba Lotes/Montas.
//
// `tipo` ('ia'|'natural') é OBRIGATÓRIO e vem de quem chama — nunca
// assumido aqui. Antes esta função fixava 'natural' sempre (o touro real
// é desconhecido na maioria dos casos), mas a origem pode ter sido IA —
// quem está registrando a compra/vínculo sabe, e é quem deve dizer.
//
// numeroLote não é passado por quem chama — é recalculado aqui (lotes do
// mesmo ciclo + 1) igual ao padrão já usado em salvarLote (Reprodutivo.jsx),
// evitando que cada tela precise carregar a lista de lotes só pra isso.
export async function criarPrenhezAdquirida({
  cicloId, dataMonta, dataDiagnostico, estacaoMontaId, novaEstacao, animalIds, tipo,
}) {
  if (!cicloId || !dataMonta || !animalIds?.length || !tipo) {
    return { error: 'Dados incompletos para criar o lote de prenhez adquirida.' }
  }

  let estacaoId = estacaoMontaId || null
  if (!estacaoId && novaEstacao?.nome && novaEstacao?.inicio) {
    const { data: es, error: errEs } = await db.estacoesMonta.insert({
      ciclo_id: cicloId, nome: novaEstacao.nome, inicio: novaEstacao.inicio, fim: novaEstacao.fim || null,
    })
    if (errEs || !es) return { error: errEs?.message || 'Erro ao criar a estação de monta.' }
    estacaoId = es.id
  }

  // listInseminacoesResumo (mais leve que list — sem os joins pesados de
  // pesagens/estação) só pra saber quantos lotes este ciclo já tem, e assim
  // calcular o próximo número.
  const { data: lotesDoCiclo, error: errLotes } = await db.lotesInseminacao.listInseminacoesResumo(cicloId)
  if (errLotes) return { error: errLotes.message }

  const { data: lote, error: errLote } = await db.lotesInseminacao.insert({
    ciclo_id: cicloId, numero: (lotesDoCiclo?.length || 0) + 1, data: dataMonta,
    touro: PRENHEZ_ADQUIRIDA_LABEL, protocolo: '', estacao_monta_id: estacaoId, tipo,
  })
  if (errLote || !lote) return { error: errLote?.message || 'Erro ao criar o lote.' }

  const resultadosIns = await Promise.all(animalIds.map(id => db.inseminacoes.insert({
    lote_inseminacao_id: lote.id, animal_id: id,
    diagnostico: 'P', data_diagnostico: dataDiagnostico,
  })))
  const erroIns = resultadosIns.find(r => r.error)
  if (erroIns) return { error: `Lote criado, mas houve erro ao vincular algum animal: ${erroIns.error.message}`, lote }
  return { error: null, lote }
}
