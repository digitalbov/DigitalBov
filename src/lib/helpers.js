import { format, differenceInMonths, differenceInDays, parseISO, isValid, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { hoje as hojeAgora, hojeISO } from './hoje'

// ── Erros de query ───────────────────────────────────────────────────────────
// O Supabase retorna {data:null, error:{...}} em falha — NÃO lança exceção, então
// um try/catch em volta de um Promise.all não pega isso, e a tela trata como "sem
// dados" silenciosamente. Chame após todo Promise.all de queries: loga cada erro
// individualmente e devolve true se alguma falhou, pra tela decidir mostrar um
// estado de erro visível em vez de renderizar vazio.
export function algumErro(tag, resultados) {
  let houveErro = false
  resultados.forEach((r, i) => {
    if (r?.error) { console.error(`${tag} erro na query ${i}:`, r.error); houveErro = true }
  })
  return houveErro
}

// ── Formatação ────────────────────────────────────────────────────────────────
export const fmtData = (dt) => {
  if (!dt) return '—'
  try {
    const d = typeof dt === 'string' ? parseISO(dt) : dt
    return isValid(d) ? format(d, 'dd/MM/yyyy', { locale: ptBR }) : '—'
  } catch { return '—' }
}

export const fmtMoeda = (v) => {
  if (v === null || v === undefined) return '—'
  return 'R$ ' + parseFloat(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const fmtPeso = (v) => v ? `${parseFloat(v).toFixed(1)} kg` : '—'

// Capitaliza só o primeiro caractere de um texto livre, mantendo o resto
// exatamente como foi digitado (não mexe em siglas nem em maiúsculas no meio
// da frase) — aplicado ao SALVAR campos de texto livre (nome, descrição,
// motivo, observações etc.), pra padronizar sem reformatar o conteúdo.
export const capitalizarPrimeira = (s) => {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Capitaliza CADA PALAVRA de um nome próprio (proprietário, fazenda, touro,
// estação de monta, lote, piquete, item de estoque, contraparte, raça,
// pelagem) — aplicado ao SALVAR, diferente de capitalizarPrimeira (que só
// maiúscula a 1ª letra e serve pros textos livres: descrição, observações,
// motivo, grupo financeiro etc.).
// Preposições (de/da/do/das/dos/e) ficam minúsculas quando não são a 1ª
// palavra, ex: "Fazenda Santa Rita do Sul".
// Palavra com dígito é tratada como código, não nome (ex: brinco "SN-01") —
// preservada exatamente como digitada, sem mexer em maiúscula/minúscula.
// Sigla curta já em maiúscula (até 3 letras, ex: "JR", "II", "MG") é
// preservada como digitada — só palavras mais longas em CAPS (ex: alguém
// digitou com Caps Lock ligado) são normalizadas para Cada Palavra Maiúscula.
const PREPOSICOES_NOME_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
export const capitalizarNome = (s) => {
  if (!s) return s
  return s
    .split(' ')
    .map((palavra, i) => {
      if (!palavra) return palavra
      if (/\d/.test(palavra)) return palavra
      if (palavra.length <= 3 && palavra === palavra.toUpperCase() && palavra !== palavra.toLowerCase()) return palavra
      const minuscula = palavra.toLowerCase()
      if (i > 0 && PREPOSICOES_NOME_MINUSCULAS.has(minuscula)) return minuscula
      return palavra.charAt(0).toUpperCase() + minuscula.slice(1)
    })
    .join(' ')
}

// ── Datas ────────────────────────────────────────────────────────────────────
export const mesesDeVida = (dataNasc, dataRef = hojeAgora()) => {
  if (!dataNasc) return 0
  const ref = typeof dataRef === 'string' ? parseISO(dataRef) : dataRef
  return Math.max(0, differenceInMonths(ref, parseISO(dataNasc)))
}

export const idadeFormatada = (dataNasc) => {
  if (!dataNasc) return '—'
  const m = mesesDeVida(dataNasc)
  if (m < 12) return `${m}m`
  const a = Math.floor(m / 12), r = m % 12
  return `${a}a${r ? ` ${r}m` : ''}`
}

export const diasDesde = (dt) => {
  if (!dt) return 0
  return Math.abs(differenceInDays(hojeAgora(), parseISO(dt)))
}

// ── Matriz (fêmea ativa apta à reprodução) ─────────────────────────────────
// Definição única: fêmea ATIVA NA DATA dataRef, com mais de 24 meses nessa
// data. "Ativa na data" não é a situação de HOJE — índices são históricos:
// vender ou perder uma matriz depois não pode fazê-la desaparecer
// retroativamente das matrizes aptas/expostas de uma safra passada. Ela conta
// como ativa na data se nunca saiu do plantel, ou se saiu (vendida/morta)
// DEPOIS de dataRef; se já tinha saído ANTES, continua corretamente excluída
// (ela de fato não estava mais no rebanho naquela época). Sem `data_baixa`
// registrada (dado legado), assume que ainda contava, pra não subcontar por
// falta de dado. Com dataRef = hoje (padrão), o resultado é idêntico ao
// comportamento anterior — só muda pra datas passadas.
// `animal.data_entrada` (opcional, só existe se o chamador enriqueceu a lista
// via db.transacaoAnimaisItens.listDataEntradaCompras — ver Metas.jsx/
// Reprodutivo.jsx): data em que um animal COMPRADO passou a fazer parte do
// rebanho (transacoes_animais.data, tipo='C'). Simétrico ao data_baixa acima,
// do lado da entrada — sem ela, uma fêmea comprada entraria retroativamente
// nas matrizes aptas de ciclos ANTERIORES à compra. Nascido na fazenda nunca
// tem data_entrada (fica undefined/null) — comportamento idêntico ao de hoje.
export function ehMatriz(animal, dataRef = hojeAgora()) {
  if (animal.sexo !== 'F' || !animal.data_nascimento) return false
  const dataRefISO = typeof dataRef === 'string' ? dataRef : format(dataRef, 'yyyy-MM-dd')
  const ativaNaData = animal.situacao === 'ativo' || !animal.data_baixa || animal.data_baixa > dataRefISO
  if (!ativaNaData) return false
  if (animal.data_entrada && animal.data_entrada > dataRefISO) return false
  return mesesDeVida(animal.data_nascimento, dataRef) > 24
}

export function contarMatrizes(animais, dataRef = hojeAgora()) {
  return (animais || []).filter(a => ehMatriz(a, dataRef)).length
}

// ── Categoria automática ──────────────────────────────────────────────────────
// dataRef opcional: idade calculada nessa data em vez de hoje — usado para
// classificar um animal pela categoria que ele TINHA num momento passado (ex:
// na data da última pesagem), não pela idade atual. Todos os chamadores
// existentes omitem o 3º argumento e continuam usando hoje, sem mudança de
// comportamento.
export const calcCategoria = (dataNasc, sexo, dataRef = hojeAgora()) => {
  const m = mesesDeVida(dataNasc, dataRef)
  if (sexo === 'F') {
    if (m <= 12) return 'Terneira'
    if (m <= 36) return 'Novilha'
    if (m <= 84) return 'Vaca'
    return 'Vaca Madura'
  } else {
    if (m <= 12) return 'Terneiro'
    if (m <= 36) return 'Novilho'
    return 'Boi'
  }
}

export const calcCategoriaRebanho = (dataNasc, sexo, sitReprodutiva, isTouro) => {
  if (isTouro) return 'Touro'
  const m = mesesDeVida(dataNasc)
  const prenha = sitReprodutiva === 'prenha'
  if (sexo === 'F') {
    if (m <= 12) return 'Terneira'
    if (m <= 24) return prenha ? 'Novilha Prenha 13-24m' : 'Novilha 13-24m'
    if (m <= 36) return prenha ? 'Novilha Prenha 25-36m' : 'Novilha 25-36m'
    if (m <= 84) return prenha ? 'Vaca Prenha' : 'Vaca Vazia'
    return prenha ? 'Vaca Madura Prenha' : 'Vaca Madura Vazia'
  } else {
    if (m <= 12) return 'Terneiro'
    if (m <= 24) return 'Novilho 13-24m'
    if (m <= 36) return 'Novilho 25-36m'
    return 'Boi'
  }
}

// ── Lista oficial de categorias comerciais (categorias_preco / Valor de
// Mercado do Rebanho) — as 14 saídas possíveis de calcCategoriaRebanho, na
// mesma ordem/nomenclatura já usada em Rebanho/Dashboard/Relatorios.
export const CATEGORIAS_VALOR = [
  'Terneira','Novilha 13-24m','Novilha Prenha 13-24m',
  'Novilha 25-36m','Novilha Prenha 25-36m',
  'Vaca Vazia','Vaca Prenha','Vaca Madura Vazia','Vaca Madura Prenha',
  'Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro'
]

// Sexo implícito na categoria — usado na Compra (D3) pra travar o campo sexo
// assim que a categoria é escolhida, já que categoria e sexo não podem divergir.
const CATEGORIAS_MACHO = ['Terneiro', 'Novilho 13-24m', 'Novilho 25-36m', 'Boi', 'Touro']
export const sexoDaCategoria = (categoria) => CATEGORIAS_MACHO.includes(categoria) ? 'M' : 'F'

// Idade média (em meses) de cada categoria de compra — usada só pra pré-preencher
// a data de nascimento estimada (o usuário pode sobrescrever). Categorias acima de
// 36 meses (Boi/Touro/Vaca*) usam todas o mesmo valor (42m), pois a categoria não
// distingue a idade exata acima desse patamar.
const MESES_ESTIMADOS_POR_CATEGORIA = {
  'Terneira': 6, 'Terneiro': 6,
  'Novilha 13-24m': 18, 'Novilha Prenha 13-24m': 18, 'Novilho 13-24m': 18,
  'Novilha 25-36m': 30, 'Novilha Prenha 25-36m': 30, 'Novilho 25-36m': 30,
  'Vaca Vazia': 42, 'Vaca Prenha': 42, 'Vaca Madura Vazia': 42, 'Vaca Madura Prenha': 42,
  'Boi': 42, 'Touro': 42,
}
export function estimarDataNascimentoPorCategoria(categoria, dataRefISO) {
  const meses = MESES_ESTIMADOS_POR_CATEGORIA[categoria]
  if (!meses || !dataRefISO) return ''
  return format(subMonths(parseISO(dataRefISO), meses), 'yyyy-MM-dd')
}

// ── Sanidade: agendado × realizado (Fase 7 — Calendário de vacinação) ──────
// Procedimento sanitário com status='agendado' (data futura, ainda não
// concluído pelo usuário) não deve contar em NADA até a confirmação: nem
// ficha do animal, nem Registros/Alertas/Histórico, nem indicadores de
// Relatórios, nem contexto do Assistente IA — só aparece na aba "Calendário
// de vacinação" e no módulo Calendário. status ausente/undefined (linha
// gravada antes da coluna existir, ou algum select que não trouxe a coluna)
// é tratado como 'realizado' — a coluna nova nunca esconde histórico
// existente. Uma função só, usada em todos os pontos de leitura, pra nunca
// um deles esquecer o filtro (ver Sanidade.jsx/Animais.jsx/Calendario.jsx/
// Relatorios.jsx/contextoIA.js).
export const sanidadeRealizada = (p) => (p?.status || 'realizado') === 'realizado'
export const sanidadeAgendada  = (p) => p?.status === 'agendado'

// ── Sanidade: rótulo de exibição por tipo (Fase 11) ─────────────────────────
// procedimentos_sanitarios.tipo continua gravando um dos 5 valores originais
// (Vacina, Vermifugação, Ectoparasita, Medicação, Exame) — decisão explícita
// de não migrar dado nenhum. Este mapa é SÓ EXIBIÇÃO: troca o texto mostrado
// na tela, nunca o valor gravado nem o que filtros/comparações usam (esses
// sempre comparam o valor cru — ver TIPOS em Sanidade.jsx). Um tipo fora do
// mapa (dado antigo de antes de algum rótulo mudar, ou digitado por fora do
// <select>) cai no fallback do valor original — nunca vira string vazia.
// Único lugar com este de-para; usado em Sanidade.jsx, Calendario.jsx e
// contextoIA.js — nenhum deles deve ter cópia própria.
export const LABEL_TIPO_SANIDADE = {
  'Vacina':        'Vacinação',
  'Vermifugação':  'Vermífugos',
  'Ectoparasita':  'Ectoparasitas',
  'Medicação':     'Medicação',
  'Exame':         'Exames',
}
export const labelTipoSanidade = (tipo) => LABEL_TIPO_SANIDADE[tipo] || tipo

// ── GMD ──────────────────────────────────────────────────────────────────────
export const calcGMD = (pesagens) => {
  if (!pesagens || pesagens.length < 2) return null
  const sorted = [...pesagens].sort((a, b) => a.data.localeCompare(b.data))
  const first = sorted[0], last = sorted[sorted.length - 1]
  const dias = Math.max(1, differenceInDays(parseISO(last.data), parseISO(first.data)))
  return ((last.peso_kg - first.peso_kg) / dias).toFixed(3)
}

// ── Percentual ───────────────────────────────────────────────────────────────
export const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) + '%' : '—'

// ── Validação de input ─────────────────────────────────────────────────────
// Retorna o número se for finito e > 0; caso contrário null (bloqueia negativo,
// zero, NaN e valores não numéricos digitados por engano).
export const numeroPositivo = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Data (string 'AAAA-MM-DD') não pode ser posterior a hoje.
export const dataNaoFutura = (d) => !!d && d <= hojeISO()

// ── Peso individual em compra/venda (Bloco D12) ─────────────────────────────
// Limite superior de 1500 kg: cobre folgado até touro/boi grande (a categoria
// mais pesada do rebanho), sem deixar passar erro de digitação absurdo (ex:
// vírgula/ponto trocado). Mesmo limite usado no client (Financeiro.jsx) e nas
// RPCs registrar_venda_animais/registrar_compra_animais no banco — dois
// lugares, mesmo número, pra nunca divergir.
export const PESO_INDIVIDUAL_MAX_KG = 1500
// Vazio = null (sem override — o animal usa o peso médio da categoria).
// Preenchido mas fora do intervalo válido também vira null aqui (uso
// silencioso em cálculo ao vivo, tipo "peso médio resultante" enquanto o
// usuário ainda está digitando) — quem precisa BLOQUEAR o salvamento usa
// pesoIndividualInvalido abaixo, que distingue "vazio" de "inválido".
export const parsePesoIndividual = (v) => {
  if (v === undefined || v === null || v === '') return null
  const n = parseFloat(v)
  return (Number.isFinite(n) && n > 0 && n <= PESO_INDIVIDUAL_MAX_KG) ? n : null
}
// true só quando o usuário digitou algo E esse algo não é um peso válido —
// vazio nunca é inválido (é só "sem peso individual, usa o médio").
export const pesoIndividualInvalido = (v) => {
  if (v === undefined || v === null || v === '') return false
  const n = parseFloat(v)
  return !(Number.isFinite(n) && n > 0 && n <= PESO_INDIVIDUAL_MAX_KG)
}

// ── Taxa de prenhez (fórmula única e oficial, usada em todas as telas) ────────
// Padrão oficial: fêmeas DISTINTAS prenhas / fêmeas DISTINTAS expostas —
// nunca conta linhas de inseminação. Um ciclo costuma ter vários lotes (IATF +
// repasses); a mesma vaca que entra em mais de um lote não pode ser contada
// mais de uma vez nem no numerador nem no denominador. Uma vaca vazia na IATF
// e prenha no repasse conta como 1 exposta e 1 prenha — é a "prenhez acumulada"
// da estação/ciclo, o número que o pecuarista quer ver.
export function calcTaxaPrenhez(inseminacoes) {
  if (!inseminacoes?.length) return null
  const expostas = new Set(inseminacoes.map(i => i.animal_id))
  const prenhas  = new Set(inseminacoes.filter(i => i.diagnostico === 'P').map(i => i.animal_id))
  return expostas.size > 0 ? Math.round((prenhas.size / expostas.size) * 100) : null
}

// Contagens distintas por animal_id que acompanham calcTaxaPrenhez — os
// contadores exibidos na tela (ex: "Prenhas: X", "Inseminadas: Y") devem usar
// estas funções, nunca `.length`, senão o número mostrado não bate com a taxa
// ao lado (que já deduplica). O total de LINHAS de inseminação (serviços) é uma
// métrica diferente — mostre-o separadamente, nunca como denominador de taxa.
export const contarExpostas = (inseminacoes) => new Set((inseminacoes || []).map(i => i.animal_id)).size
export const contarPrenhas  = (inseminacoes) => new Set((inseminacoes || []).filter(i => i.diagnostico === 'P').map(i => i.animal_id)).size

// ── Perda gestacional — UMA escala de confiança em dois estágios, não dois
// conceitos concorrentes. As duas constantes abaixo são ancoradas na MESMA
// data (a da monta) e alimentam ações de peso bem diferente:
//
// Estágio 1 — GESTACAO_MAX_DIAS (300 dias da monta, ~17 dias após o parto
// previsto): sinal FRACO e só AGREGADO. Usado em calcGestacaoLote pra somar
// quantas prenhas de um lote ainda não têm desfecho — vira % de "Perda
// Gestacional" em Reprodutivo/Metas. NUNCA identifica uma vaca específica,
// nunca grava nada. Um atraso de 2-3 semanas é comum (erro de diagnóstico,
// gestação um pouco mais longa) — não é motivo pra mexer no cadastro de
// ninguém.
//
// Estágio 2 — GESTACAO_ANGUS_DIAS + PERDA_PRESUMIDA_DIAS_APOS_PREVISTO (283 +
// 180 = 463 dias da monta): sinal FORTE, no nível INDIVIDUAL da vaca — ver
// statusReprodutivoDetalhado, mais abaixo. Só nesse ponto (quase 6 meses
// depois da data prevista de parto, sem parto nem aborto registrado) é que
// vale a pena marcar "perda gestacional presumida" pra uma vaca específica,
// e mesmo assim SÓ como sinal visual — a gravação de sit_reprodutiva='vazia'
// só acontece se o usuário confirmar num clique (ver
// lib/perdaGestacionalPresumida.js). Nunca escrita automática por navegação.
export const GESTACAO_MAX_DIAS = 300

// Gestação padrão (raça Angus) usada pra PREVER a data de parto de uma monta
// (monta + 283 dias). Movida pra cá (antes só existia em Reprodutivo.jsx) pra
// statusReprodutivoDetalhado, abaixo, poder calcular dataPrevistaParto sem
// duplicar o número.
export const GESTACAO_ANGUS_DIAS = 283

// Estágio 2 da escala acima — dias APÓS a data prevista de parto (não desde a
// monta) pra presumir perda gestacional de uma vaca específica. 283 + 180 =
// 463 dias desde a monta.
export const PERDA_PRESUMIDA_DIAS_APOS_PREVISTO = 180

export function calcGestacaoLote(loteData, prenhas, nascimentos, nAbortos, hoje = hojeAgora()) {
  const diasDesdeMonta = loteData ? Math.round((hoje - new Date(loteData + 'T12:00:00')) / 86400000) : null
  const aindaDentroDaJanela = diasDesdeMonta !== null && diasDesdeMonta < GESTACAO_MAX_DIAS
  const semDesfecho = Math.max(0, prenhas - nascimentos - nAbortos)
  const gestando = aindaDentroDaJanela ? semDesfecho : 0
  const perdasNaoIdentificadas = aindaDentroDaJanela ? 0 : semDesfecho
  const perdaGestacional = prenhas > 0 ? Math.round((nAbortos + perdasNaoIdentificadas) / prenhas * 100) : null
  return { gestando, perdasNaoIdentificadas, perdaGestacional }
}

// Desmame + peso ajustado 205 dias (padrão Embrapa) para um conjunto de partos.
// totalInseminadas = "matrizes expostas" — denominador oficial da taxa de
// desmama e do kg desmamado por matriz exposta (não usa nascidos).
export function calcDesmameMetrics(partosArr, totalInseminadas) {
  const desmamados = (partosArr || []).filter(p => p.bezerro?.data_desmame).length
  // Guardado por desmamados > 0, não só por totalInseminadas > 0: sem nenhum
  // desmame registrado ainda, "0%"/"0 kg" pareceriam resultado real (ruim) em
  // vez de "ainda não há desmames" — a safra pode estar só em andamento.
  const txDesmama = (totalInseminadas > 0 && desmamados > 0) ? Math.round(desmamados / totalInseminadas * 100) : null
  const pesosDesmame = []
  const pesosNascimento = []
  const p205s = []
  ;(partosArr || []).forEach(p => {
    const pesagensB = p.bezerro?.pesagens || []
    const pesoNasc = pesagensB.find(ps => ps.tipo === 'nascimento')
    const pesoDesm = pesagensB.find(ps => ps.tipo === 'desmama')
    // Peso ao nascer entra independente de já ter desmame ou não (ao
    // contrário de pesosDesmame/p205s abaixo, que exigem pesoDesm) — senão
    // "Kg ao nascer" ficaria vazio até o primeiro desmame da safra.
    if (pesoNasc) {
      const pn0 = parseFloat(pesoNasc.peso_kg)
      if (Number.isFinite(pn0)) pesosNascimento.push(pn0)
    }
    if (!pesoDesm) return
    const pd = parseFloat(pesoDesm.peso_kg)
    if (Number.isFinite(pd)) pesosDesmame.push(pd)
    if (pesoNasc && p.data_parto && pesoDesm.data) {
      const pn = parseFloat(pesoNasc.peso_kg)
      const diasDesmame = Math.round((new Date(pesoDesm.data) - new Date(p.data_parto)) / 86400000)
      if (Number.isFinite(pn) && diasDesmame > 0) {
        p205s.push(((pd - pn) / diasDesmame) * 205 + pn)
      }
    }
  })
  const media = arr => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10 : null
  return {
    desmamados, txDesmama,
    pesoMedioDesmame: media(pesosDesmame),
    pesoMedioNascimento: media(pesosNascimento),
    p205Medio: media(p205s),
    kgPorMatrizExposta: (totalInseminadas > 0 && pesosDesmame.length > 0) ? Math.round(pesosDesmame.reduce((s, v) => s + v, 0) / totalInseminadas * 10) / 10 : null,
  }
}

// Intervalo entre partos consecutivos da MESMA mãe — só considera intervalos
// plausíveis para bovinos (padrão 300–700 dias); mães com só 1 parto não entram
// (não há intervalo pra medir).
export function calcIntervaloPartos(partosArr, minDias = 300, maxDias = 700) {
  const partosPorMae = {}
  ;(partosArr || []).forEach(p => {
    if (!p.mae_id || !p.data_parto) return
    partosPorMae[p.mae_id] = partosPorMae[p.mae_id] || []
    partosPorMae[p.mae_id].push(p.data_parto)
  })
  const intervalos = []
  Object.values(partosPorMae).forEach(datas => {
    const ordenadas = datas.slice().sort()
    for (let i = 1; i < ordenadas.length; i++) {
      const dias = Math.round((new Date(ordenadas[i]) - new Date(ordenadas[i - 1])) / 86400000)
      if (Number.isFinite(dias) && dias >= minDias && dias <= maxDias) intervalos.push(dias)
    }
  })
  const media = intervalos.length > 0 ? Math.round(intervalos.reduce((s, d) => s + d, 0) / intervalos.length) : null
  return { intervalos, media }
}

// ── Estoque: saldo por lote (FEFO) ─────────────────────────────────────────────
// Recebe as movimentações de UM item (tipo 'E'/'S') e devolve o saldo por lote de
// validade, consumindo primeiro os lotes que vencem antes (First Expired, First
// Out). Como as saídas hoje não são vinculadas a um lote de entrada específico,
// a saída total do item é "consumida" começando pelos lotes de validade mais
// próxima — lotes sem validade ficam por último (nunca vencem, então não são
// prioridade no FEFO). Retorna só lotes com saldo > 0, ordenados por validade
// (mais próxima primeiro; sem validade por último).
export function calcLotesFEFO(movsDoItem) {
  const porValidade = new Map()
  ;(movsDoItem || []).filter(m => m.tipo === 'E').forEach(m => {
    const key = m.validade || null
    porValidade.set(key, (porValidade.get(key) || 0) + (parseFloat(m.quantidade) || 0))
  })
  const entradas = [...porValidade.entries()]
    .map(([validade, qtd]) => ({ validade, qtd }))
    .sort((a, b) => {
      if (a.validade === b.validade) return 0
      if (!a.validade) return 1
      if (!b.validade) return -1
      return a.validade.localeCompare(b.validade)
    })
  let saidaRestante = (movsDoItem || [])
    .filter(m => m.tipo === 'S')
    .reduce((s, m) => s + (parseFloat(m.quantidade) || 0), 0)
  const lotes = []
  for (const e of entradas) {
    const consumido = Math.min(e.qtd, saidaRestante)
    const saldo = e.qtd - consumido
    saidaRestante -= consumido
    if (saldo > 0) lotes.push({ validade: e.validade, saldo })
  }
  return lotes
}

// Dias até a validade (negativo = já venceu, null = sem validade)
export function diasAteValidade(validade, hoje = hojeAgora()) {
  if (!validade) return null
  const h = new Date(hoje); h.setHours(0, 0, 0, 0)
  const venc = new Date(validade + 'T00:00:00')
  return Math.round((venc - h) / 86400000)
}

// ── Cores por categoria ───────────────────────────────────────────────────────
export const catCor = {
  Terneira: { bg: '#EEEDFE', text: '#3C3489' },
  Terneiro: { bg: '#EEEDFE', text: '#3C3489' },
  Novilha:  { bg: '#E6F1FB', text: '#0C447C' },
  Novilho:  { bg: '#E6F1FB', text: '#0C447C' },
  Vaca:     { bg: '#EAF3DE', text: '#27500A' },
  Boi:      { bg: '#EAF3DE', text: '#27500A' },
  'Vaca Madura': { bg: '#FAEEDA', text: '#633806' },
  'Novilha 13-24m':        { bg: '#E6F1FB', text: '#0C447C' },
  'Novilha Prenha 13-24m': { bg: '#E6F1FB', text: '#0C447C' },
  'Novilha 25-36m':        { bg: '#E6F1FB', text: '#0C447C' },
  'Novilha Prenha 25-36m': { bg: '#E6F1FB', text: '#0C447C' },
  'Novilho 13-24m': { bg: '#E6F1FB', text: '#0C447C' },
  'Novilho 25-36m': { bg: '#E6F1FB', text: '#0C447C' },
  'Vaca Vazia':  { bg: '#EAF3DE', text: '#27500A' },
  'Vaca Prenha': { bg: '#EAF3DE', text: '#27500A' },
  'Vaca Madura Vazia':  { bg: '#FAEEDA', text: '#633806' },
  'Vaca Madura Prenha': { bg: '#FAEEDA', text: '#633806' },
  Touro: { bg: '#EDE9FE', text: '#7C3AED' },
}

export const sitCor = {
  ativo:   { bg: '#EAF3DE', text: '#27500A' },
  vendido: { bg: '#FAEEDA', text: '#633806' },
  morto:   { bg: '#FCEBEB', text: '#791F1F' }
}

export const repCor = {
  prenha:  { bg: '#EAF3DE', text: '#27500A' },
  vazia:   { bg: '#FCEBEB', text: '#791F1F' },
  nao_se_aplica: { bg: '#F3F4F6', text: '#9CA3AF' },
  Lactante: { bg: '#EEEDFE', text: '#3C3489' },
}

// ── Situação reprodutiva de EXIBIÇÃO (não é um valor do banco) ────────────────
// "Lactante" é só uma camada visual sobre sit_reprodutiva === 'vazia': aparece
// quando a vaca tem um parto registrado e o terneiro daquele parto ainda não foi
// desmamado (bezerro.data_desmame vazio). Nunca grava nada — os cálculos de
// matriz/prenhez/etc. continuam usando o sit_reprodutiva real ('vazia'). Some
// assim que o terneiro é desmamado (data_desmame preenchida) ou se a vaca for
// reinseminada e diagnosticada prenha de novo (sit_reprodutiva vira 'prenha',
// que tem prioridade sobre "lactante" — é a informação mais relevante nessa hora).
// `partos` precisa ter mae_id e bezerro.data_desmame (ex: db.partos.listAll(),
// ou selLote.partos no detalhe do lote).
export function statusReprodutivoExibicao(animal, partos) {
  if (!animal || animal.sit_reprodutiva !== 'vazia') return animal?.sit_reprodutiva ?? null
  const partosDaMae = (partos || [])
    .filter(p => p.mae_id === animal.id)
    .sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''))
  const ultimoParto = partosDaMae[0]
  if (ultimoParto && !ultimoParto.bezerro?.data_desmame) return 'Lactante'
  return animal.sit_reprodutiva
}

// ── Linha do tempo por vaca dentro de um lote (Fase 10 — Reprodutivo.jsx,
// detalhe do lote) — NÃO mexe em statusReprodutivoExibicao (intocada,
// continua exatamente como usada hoje); esta é mais rica: devolve um objeto
// estruturado com a ETAPA atual da vaca NESTE lote e os dados prontos pra
// próxima ação (botão) da linha do tempo.
//
// `partos` = partos DESTE lote (ex: selLote.partos), cada item precisa de
// mae_id, data_parto, natimorto e bezerro:{id,brinco,sexo,situacao,
// data_desmame,pesagens:[{tipo,peso_kg}]}. `dataMonta` = selLote.data (usada
// pra calcular dataPrevistaParto = monta + GESTACAO_ANGUS_DIAS e, a partir
// dela, perdaPresumida — ver PERDA_PRESUMIDA_DIAS_APOS_PREVISTO acima).
//
// IMPORTANTE pra quem chamar isto fora do contexto de um lote específico
// (ex: ficha do animal): `partos` precisa estar filtrado pra conter só
// partos DESTA gestação em diante (data_parto >= dataMonta), senão uma
// gestação anterior já resolvida (parto/desmame antigos) é confundida com a
// gestação atual — no detalhe do lote isso já vem de graça (partos vêm
// filtrados pelo FK do lote).
//
// etapa possíveis: 'prenha_sem_parto' | 'pariu_morto' | 'lactante' |
// 'desmamado' | null (vazia, ou qualquer outra situação sem linha do tempo
// própria — a tela mantém o badge de sempre nesses casos, sem usar isto).
export function statusReprodutivoDetalhado(animal, partos, dataMonta) {
  const vazio = { etapa: null, dataParto: null, bezerro: null, dataDesmame: null, pesoDesmame: null, dataPrevistaParto: null, perdaPresumida: false }
  if (!animal) return vazio

  const partosDaMae = (partos || [])
    .filter(p => p.mae_id === animal.id)
    .sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''))
  const ultimoParto = partosDaMae[0]

  if (!ultimoParto) {
    if (animal.sit_reprodutiva !== 'prenha') return vazio
    let dataPrevistaParto = null
    let perdaPresumida = false
    if (dataMonta) {
      const d = new Date(dataMonta + 'T12:00:00')
      d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS)
      dataPrevistaParto = d.toISOString().slice(0, 10)
      const dLimite = new Date(d)
      dLimite.setDate(dLimite.getDate() + PERDA_PRESUMIDA_DIAS_APOS_PREVISTO)
      perdaPresumida = hojeISO() >= dLimite.toISOString().slice(0, 10)
    }
    return { ...vazio, etapa: 'prenha_sem_parto', dataPrevistaParto, perdaPresumida }
  }

  const b = ultimoParto.bezerro
  const bezerro = b ? { id: b.id, brinco: b.brinco, sexo: b.sexo, situacao: b.situacao } : null
  const morto = !!ultimoParto.natimorto || b?.situacao === 'morto'

  if (morto) {
    return { ...vazio, etapa: 'pariu_morto', dataParto: ultimoParto.data_parto, bezerro }
  }
  if (!b?.data_desmame) {
    return { ...vazio, etapa: 'lactante', dataParto: ultimoParto.data_parto, bezerro }
  }
  const pesoDesm = (b.pesagens || []).find(ps => ps.tipo === 'desmama')
  return {
    ...vazio, etapa: 'desmamado', dataParto: ultimoParto.data_parto, bezerro,
    dataDesmame: b.data_desmame,
    pesoDesmame: pesoDesm ? parseFloat(pesoDesm.peso_kg) : null,
  }
}

// ── "Vaca falhada" — status reprodutivo por ciclo, 100% DERIVADO na leitura ──
// Nunca grava nada (nenhuma coluna/linha nova) e não entra em nenhum índice do
// rebanho (esses continuam herd-level, ver Metas.jsx) — é só uma leitura sobre
// os mesmos eventos (partos/inseminações/abortos) já usados em outros lugares,
// exibida no histórico individual do animal (Animais.jsx). Reusa ehMatriz e
// GESTACAO_MAX_DIAS já existentes, sem alterá-los.
// `partos`/`inseminacoes`/`abortos` = eventos DESTE animal (ex: já carregados
// pela timeline em Animais.jsx: db.partos.byMae, db.inseminacoes.byAnimal,
// db.abortos.byAnimal). `inseminacoes[].lote.data` é a data da monta.
export const STATUS_CICLO_ANIMAL = {
  nao_era_matriz:   { label: 'Ainda não era matriz',   bg: '#F3F4F6', text: '#9CA3AF' },
  pariu:             { label: 'Pariu',                  bg: '#EAF3DE', text: '#27500A' },
  perda_gestacional: { label: 'Perda gestacional',       bg: '#FEF3C7', text: '#92620A' },
  gestacao_aberta:   { label: 'Gestação em aberto',      bg: '#E6F1FB', text: '#1E55B0' },
  em_andamento:      { label: 'Ciclo em andamento',      bg: '#F3F4F6', text: '#6B7280' },
  falhada:           { label: 'Falhada',                 bg: '#FCEBEB', text: '#791F1F' },
}
export function statusReprodutivoCiclo(animal, ciclo, { partos = [], inseminacoes = [], abortos = [] } = {}, hoje = hojeISO()) {
  // Elegibilidade: matriz apta durante o ciclo (avaliada no FIM do ciclo —
  // "ela existiu como matriz elegível ao longo de todo o ciclo").
  if (!ehMatriz(animal, ciclo.fim)) return { status: 'nao_era_matriz' }

  // Teve cria no ciclo? Data real do parto (não o vínculo por lote) — é o que
  // permite "falhada" funcionar mesmo SEM inseminação lançada no app (monta
  // natural não registrada).
  const parto = partos.find(p => p.data_parto && p.data_parto >= ciclo.inicio && p.data_parto <= ciclo.fim)
  if (parto) return { status: 'pariu', data: parto.data_parto }

  // Abortou no ciclo? Ela engravidou — não é "falha", é perda gestacional
  // (categoria diferente, já medida agregada em taxa_aborto).
  const aborto = abortos.find(a => a.data && a.data >= ciclo.inicio && a.data <= ciclo.fim)
  if (aborto) return { status: 'perda_gestacional', data: aborto.data }

  // Gestação em aberto: inseminação com diagnóstico Prenha, montada dentro do
  // ciclo, sem parto/aborto resolvido, ainda dentro da janela de gestação —
  // genuinamente indefinido, não marca nada ainda.
  const gestacaoAberta = inseminacoes.some(i => {
    if (i.diagnostico !== 'P' || !i.lote?.data) return false
    if (i.lote.data < ciclo.inicio || i.lote.data > ciclo.fim) return false
    const diasDesdeMonta = Math.round((new Date(hoje) - new Date(i.lote.data + 'T12:00:00')) / 86400000)
    return diasDesdeMonta < GESTACAO_MAX_DIAS
  })
  if (gestacaoAberta) return { status: 'gestacao_aberta' }

  // Ciclo ainda não fechou (não deu tempo de ter cria nele) — não marca falha.
  if (hoje <= ciclo.fim) return { status: 'em_andamento' }

  return { status: 'falhada' }
}

// ── Pai derivado do lote (usado só na CRIAÇÃO do bezerro, em salvarParto) ────
// animais.pai é um único campo TEXT, sem flag de origem — a distinção entre
// "derivado do lote" e "informado manualmente" não precisa de coluna nova
// porque pai só é escrito 1x: nesta função (na hora de criar o bezerro via
// "Registrar nascimento") ou manualmente no formulário de Animais.jsx. Nada no
// app reescreve pai depois (editar nascimento só toca data_parto/observações/
// dados do bezerro — nunca pai; ver salvarEdicaoParto em Reprodutivo.jsx) —
// então um pai editado à mão em Animais.jsx nunca é sobrescrito, por
// construção: simplesmente não existe nenhum código que rode de novo e troque
// esse valor.
// lote.lote_touros = touros ADICIONAIS (2º em diante) de uma monta natural —
// vazio/ausente pra IA e pra monta natural de 1 touro só (ver supabase.js).
// Prefixo exportado (não hardcoded em outro lugar) pra Animais.jsx detectar
// esse caso e linkar pro lote de origem em vez de tentar achar um animal com
// esse "nome" — ver PAI_MONTA_NATURAL_PREFIX/paiEhMontaNaturalIndefinida abaixo.
export const PAI_MONTA_NATURAL_PREFIX = 'Monta natural — Lote'
export function paiEhMontaNaturalIndefinida(pai) {
  return typeof pai === 'string' && pai.startsWith(PAI_MONTA_NATURAL_PREFIX)
}
export function resolverPaiDerivado(lote) {
  if (!lote) return ''
  if (lote.tipo !== 'natural') return lote.touro || ''
  const extras = lote.lote_touros || []
  if (extras.length === 0) return lote.touro || ''
  // Vários touros na mesma monta natural = paternidade indefinida — não dá
  // pra saber qual touro efetivamente gerou o bezerro, então NUNCA escolhe um
  // nome entre eles: aponta pro lote (referência auditável) em vez disso.
  return `${PAI_MONTA_NATURAL_PREFIX} ${lote.numero}, Estação ${lote.estacao?.nome || '—'}`
}

// ── Ordenação de brincos ──────────────────────────────────────────────────────
export const sortBrinco = (arr) =>
  [...arr].sort((a, b) => a.brinco.localeCompare(b.brinco, undefined, { numeric: true }))

// ── Grupos financeiros ────────────────────────────────────────────────────────
export const GRUPOS_REC = [
  'Venda de Animais', 'Valores a Receber', 'Aporte',
  'Empréstimos', 'Juros', 'Outras Receitas'
]
export const GRUPOS_DES = [
  'Compra de Animais', 'Medicamentos', 'Suplementos', 'Mão de Obra', 'Combustível',
  'Ferramentas', 'Manutenção', 'Estrutura',
  'Máquinas e Equipamentos', 'Investimentos',
  'Realização de Lucro', 'Inseminação', 'Monta Natural', 'Frete'
]

// ── Categorias de estoque e sugestão de grupo financeiro (Bloco D10) ────────
// Compartilhado entre Financeiro.jsx (caminhos 2/3) e Estoque.jsx (caminhos
// 4/5) — antes cada tela tinha sua própria cópia da lista de categorias;
// agora uma só, pra nunca divergir. O grupo é só SUGESTÃO (sempre editável
// depois); 'Outro' fica sem entrada de propósito, o usuário escolhe.
export const CATS_ESTOQUE = ['Medicamento', 'Vacina', 'Sêmen', 'Suplemento', 'Ração', 'Outro']
export const GRUPO_SUGERIDO_POR_CATEGORIA = {
  Medicamento: 'Medicamentos', Vacina: 'Medicamentos',
  Suplemento: 'Suplementos', Ração: 'Suplementos',
  Sêmen: 'Inseminação',
}

// ── Rateio igual em centavos exatos ──────────────────────────────────────────
// Divisão inteira de centavos primeiro, e a sobra (sempre < N centavos, por
// causa do arredondamento) é distribuída 1 centavo por vez para os primeiros
// da lista. Garante soma(valor) === valorTotal sempre, mesmo que valorTotal/n
// não seja exato (ex: R$100 ÷ 3 = R$33,33+33,33+33,34, nunca R$99,99). Numa
// divisão IGUAL não existe um "proprietário de maior valor" pra levar toda a
// sobra (como no rateio proporcional das RPCs de venda/compra) — por isso
// aqui a sobra é espalhada 1 centavo por proprietário em vez de concentrada.
// Movida de Financeiro.jsx (Bloco D10) para ser reutilizável por
// criarLancamentoRateado (estoqueFinanceiro.js), usada pelos caminhos 4/5.
export const rateioIgualCentavos = (valorTotal, proprietarios) => {
  const n = proprietarios.length
  if (n === 0) return []
  const totalCentavos = Math.round(valorTotal * 100)
  const base = Math.floor(totalCentavos / n)
  const resto = totalCentavos - base * n
  return proprietarios.map((p, i) => {
    const centavos = base + (i < resto ? 1 : 0)
    return {
      proprietario_id: p.id,
      valor: (centavos / 100).toFixed(2),
      percentual: totalCentavos > 0 ? ((centavos / totalCentavos) * 100).toFixed(2) : '0.00',
    }
  })
}

// ── Soma financeira segura ──────────────────────────────────────────────────
// lancamentos_financeiros usa a coluna `valor`; transacoes_animais usa
// `valor_total` — cada origem tem que somar o campo certo. Number.isFinite
// evita que um campo errado (ex: `valor` num registro que só tem `valor_total`)
// vire NaN e contamine a soma inteira.
export const somaFinita = (lista, campo) => (lista || []).reduce((s, item) => {
  const v = Number(item[campo])
  return s + (Number.isFinite(v) ? v : 0)
}, 0)

// ── Valor de lançamentos por proprietário (via rateio) ─────────────────────────
export const valorPropLanc = (lancamentos, tipo, propId) => {
  if (!propId) return somaFinita(lancamentos.filter(l=>l.tipo===tipo), 'valor')
  return lancamentos.filter(l=>l.tipo===tipo).reduce((s,l) => {
    const rateio = l.rateios?.find(r => r.proprietario_id === propId)
    const v = rateio ? Number(rateio.valor) : 0
    return s + (Number.isFinite(v) ? v : 0)
  }, 0)
}

// ── Grupos "por valor" (receita/despesa), DERIVADOS dos lançamentos reais ────
// Nunca usa lista fixa (GRUPOS_REC/GRUPOS_DES) — uma lista fixa deixa de fora
// qualquer grupo criado depois (ex: 'Comissão'/'Impostos'/'Frete'/'Monta
// Natural', criados automático pelas RPCs de compra/venda) ou digitado à mão
// pelo usuário (grupo é texto livre em Financeiro), e a soma dos grupos
// exibidos ficaria menor que o total sem nenhuma explicação. Mesmo critério de
// valor por lançamento que valorPropLanc usa — sem grupo (nulo/vazio) cai em
// "Sem grupo" em vez de sumir, e a soma dos grupos bate exatamente com o total
// (mesmo filtro, mesma extração de valor, só agrupada). Compartilhada entre
// Relatorios.jsx e Financeiro.jsx (Resumo) pra nunca divergir.
export function gruposPorValor(lancamentos, tipo, propId = null) {
  const porGrupo = {}
  ;(lancamentos || []).filter(l => l.tipo === tipo).forEach(l => {
    const grupo = l.grupo || 'Sem grupo'
    let v = propId
      ? Number(l.rateios?.find(r => r.proprietario_id === propId)?.valor)
      : Number(l.valor)
    if (!Number.isFinite(v)) v = 0
    porGrupo[grupo] = (porGrupo[grupo] || 0) + v
  })
  return Object.entries(porGrupo)
    .map(([grupo, valor]) => ({ grupo, valor }))
    .filter(g => g.valor > 0)
    .sort((a, b) => b.valor - a.valor)
}
