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
// ── Estava no rebanho numa data passada (Fase 8 — conciliação de rebanho) ──
// Generalização da mesma lógica de entrada/saída que ehMatriz já usava (só
// pra fêmeas >24 meses): aqui vale para QUALQUER animal, de qualquer sexo/
// idade/categoria — "eu tinha esse animal no rebanho na data X?". Mesmas
// regras: sem data_baixa (ou baixa DEPOIS de dataRef) = ainda não tinha
// saído; sem data_entrada (nascido na fazenda) ou entrada ATÉ dataRef = já
// tinha entrado. animal.data_entrada só existe se o chamador enriqueceu a
// lista via db.transacaoAnimaisItens.listDataEntradaCompras() (mesmo padrão
// de ehMatriz) — sem enriquecer, todo animal é tratado como "nascido na
// fazenda" (nunca subtrai retroativamente um comprado antes da compra).
export function estavaNoRebanho(animal, dataRef = hojeAgora()) {
  if (!animal.data_nascimento) return false
  const dataRefISO = typeof dataRef === 'string' ? dataRef : format(dataRef, 'yyyy-MM-dd')
  if (animal.data_nascimento > dataRefISO) return false
  const aindaNaoSaiu = animal.situacao === 'ativo' || !animal.data_baixa || animal.data_baixa > dataRefISO
  if (!aindaNaoSaiu) return false
  if (animal.data_entrada && animal.data_entrada > dataRefISO) return false
  return true
}

export function ehMatriz(animal, dataRef = hojeAgora()) {
  if (animal.sexo !== 'F') return false
  if (!estavaNoRebanho(animal, dataRef)) return false
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

// Agrupa pesagens de um CONJUNTO de animais por data, tirando a média do peso
// em cada data — vira a "curva do grupo" (mesmo formato {data,peso} do
// gráfico individual, só que cada ponto é uma média em vez de um valor
// único). Movida de Pesagens.jsx (Fase 13) pra ser reaproveitada também na
// ficha do animal (linha de comparação com contemporâneos). `dataISO` vai
// junto pra quem precisar mesclar duas séries por data real (a formatada
// não ordena certo entre anos diferentes).
export function agruparPesoPorData(pesagensGrupo) {
  const porData = new Map()
  pesagensGrupo.forEach(p => {
    const peso = parseFloat(p.peso_kg)
    if (!Number.isFinite(peso)) return
    if (!porData.has(p.data)) porData.set(p.data, { soma: 0, qtd: 0 })
    const e = porData.get(p.data)
    e.soma += peso; e.qtd += 1
  })
  return [...porData.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, e]) => ({ dataISO: data, data: fmtData(data), peso: +(e.soma / e.qtd).toFixed(1) }))
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

// ── Taxa de Parição (Fase 8 — oficial: partos ÷ matrizes EXPOSTAS, nunca
// prenhas) — consolidada aqui depois de um levantamento achar 4
// reimplementações divergentes (Reprodutivo.jsx x2, Metas.jsx, Relatorios.jsx)
// no tratamento do caso "expostas > 0 e 0 partos":
//   - Reprodutivo.jsx/Relatorios.jsx sempre mostravam 0% nesse caso, MESMO
//     com a safra ainda dentro da janela de gestação (matrizes ainda
//     "gestando", sem desfecho) — 0% prematuro pode parecer "parição ruim"
//     quando na verdade é "ainda não tem o que medir".
//   - Metas.jsx nunca mostrava 0% nesse caso (guarda explícita por
//     nPartos > 0, comentário: "a safra só está em andamento") — mas essa
//     guarda não expirava nunca: mesmo uma safra JÁ CONCLUÍDA (janela de
//     gestação encerrada) com zero partos ficava escondida atrás de "—"
//     pra sempre, quando na verdade é um resultado real (0%).
// Reconciliação: só é 0% quando não há mais NENHUMA matriz "gestando" (ver
// calcGestacaoLote, mesma fonte em todos os pontos de consumo) — enquanto
// houver gestação em andamento sem desfecho, fica null ("—"), porque ainda
// não há o que medir; quando a janela se encerra sem partos, essa é uma
// parição de 0% de verdade, não ausência de dado.
export function calcTaxaParicao(expostas, partos, gestando = 0) {
  if (!expostas) return null
  if (partos === 0 && gestando > 0) return null
  return Math.round(partos / expostas * 100)
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
    // Peso ao nascer entra independente de já ter desmame ou não (ao
    // contrário de pesosDesmame/p205s abaixo, que exigem pesoDesm) — senão
    // "Kg ao nascer" ficaria vazio até o primeiro desmame da safra.
    if (pesoNasc) {
      const pn0 = parseFloat(pesoNasc.peso_kg)
      if (Number.isFinite(pn0)) pesosNascimento.push(pn0)
    }
    // Peso é opcional no desmame — animal desmamado sem peso não tem pesagem
    // tipo 'desmama' nenhuma, então nunca entra aqui (sai do numerador E do
    // denominador de pesoMedioDesmame/p205Medio, não vira zero). Se depois
    // for VENDIDO, registrar_venda_animais grava uma pesagem tipo 'venda' —
    // usamos ela como peso de desmame equivalente (só quando o animal já
    // está com data_desmame preenchida; sem isso um bezerro vendido ainda
    // mamando entraria como se tivesse desmamado). P205 fica de fora desse
    // fallback: seu cálculo depende da DATA real do desmame pra extrapolar a
    // curva aos 205 dias, e a data da venda pode ser bem depois — usá-la
    // distorceria o ajuste.
    if (!p.bezerro?.data_desmame) return
    const pesoDesmReal = pesagensB.find(ps => ps.tipo === 'desmama')
    const pesoVenda = pesagensB.find(ps => ps.tipo === 'venda')
    const pesoDesm = pesoDesmReal || pesoVenda
    if (!pesoDesm) return
    const pd = parseFloat(pesoDesm.peso_kg)
    if (Number.isFinite(pd)) pesosDesmame.push(pd)
    if (pesoDesmReal && pesoNasc && p.data_parto && pesoDesmReal.data) {
      const pn = parseFloat(pesoNasc.peso_kg)
      const diasDesmame = Math.round((new Date(pesoDesmReal.data) - new Date(p.data_parto)) / 86400000)
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
    // Contagens pra UI deixar claro que o índice considera só quem tem peso
    // (ex.: "8 de 10 com peso") — não confundir com `desmamados` (todo mundo
    // com data_desmame, com ou sem peso).
    comPesoDesmame: pesosDesmame.length,
    comPesoP205: p205s.length,
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

// ── Desempenho reprodutivo NA VIDA de uma fêmea (Fase 13 — Ficha do Animal) ──
// Agrega o histórico completo (partos como mãe, inseminações e abortos DELA)
// num só objeto de cards pra ficha. Reaproveita calcIntervaloPartos,
// calcDesmameMetrics e calcGMD pro que já está resolvido — só soma/divide
// contagens novas em cima dos MESMOS campos já usados no resto do app
// (diagnostico==='P', natimorto, bezerro.situacao, bezerro.pesagens).
// Cada campo é `null` (nunca 0) quando não há dado suficiente pra calcular —
// quem exibe decide o texto "sem dados".
export function calcDesempenhoVidaFemea(animal, { partos = [], inseminacoes = [], abortos = [] } = {}) {
  const round1 = v => Math.round(v * 10) / 10

  // 1) Intervalo entre partos (dias) — reaproveita calcIntervaloPartos.
  const intervaloPartosDias = calcIntervaloPartos(partos).media

  // 2) Taxa de fecundidade = fecundações (diagnóstico "P") ÷ inseminações na vida.
  const fecundacoes = inseminacoes.filter(i => i.diagnostico === 'P').length
  const taxaFecundidade = inseminacoes.length > 0 ? Math.round(fecundacoes / inseminacoes.length * 100) : null

  // 3) Taxa de perda gestacional = abortos ÷ prenhezes (mesmas prenhezes do item 2).
  const taxaPerdaGestacional = fecundacoes > 0 ? Math.round(abortos.length / fecundacoes * 100) : null

  // 4) Taxa de perda pós-parto = filhos nascidos vivos que depois morreram ÷
  // nascidos vivos (natimorto é perda NO parto, não pós-parto — fica de fora
  // dos dois lados da conta).
  const nascidosVivos = partos.filter(p => !p.natimorto)
  const perdasPosParto = nascidosVivos.filter(p => p.bezerro?.situacao === 'morto').length
  const taxaPerdaPosParto = nascidosVivos.length > 0 ? Math.round(perdasPosParto / nascidosVivos.length * 100) : null

  // 5) GMD médio dos filhos — calcGMD por filho (precisa 2+ pesagens), depois média.
  const gmdsFilhos = partos
    .map(p => calcGMD(p.bezerro?.pesagens))
    .filter(g => g !== null)
    .map(g => parseFloat(g))
  const gmdMedioFilhos = gmdsFilhos.length > 0 ? round1(gmdsFilhos.reduce((s, v) => s + v, 0) / gmdsFilhos.length * 1000) / 1000 : null

  // 6) Fêmeas × machos entre os filhos.
  const filhosComSexo = partos.filter(p => p.bezerro?.sexo)
  const filhasF = filhosComSexo.filter(p => p.bezerro.sexo === 'F').length
  const filhosM = filhosComSexo.filter(p => p.bezerro.sexo === 'M').length

  // 7/8/11/13) Peso ao nascer/desmame, kg acumulado e taxa de desmame —
  // reaproveita calcDesmameMetrics (o 2º argumento, totalInseminadas, só
  // afeta os campos txDesmama/kgPorMatrizExposta DELE, que a ficha não usa:
  // aqui a taxa de desmame e o kg acumulado são ÷ partos, formato pedido
  // para o histórico individual, não ÷ matrizes expostas do rebanho).
  const desmame = calcDesmameMetrics(partos, inseminacoes.length)
  const taxaDesmame = partos.length > 0 ? Math.round(desmame.desmamados / partos.length * 100) : null
  const kgDesmamadosBrutos = partos
    .map(p => p.bezerro?.pesagens?.find(ps => ps.tipo === 'desmama'))
    .filter(Boolean)
    .map(ps => parseFloat(ps.peso_kg))
    .filter(Number.isFinite)
  const kgDesmamadoAcumulado = kgDesmamadosBrutos.length > 0 ? round1(kgDesmamadosBrutos.reduce((s, v) => s + v, 0)) : null

  // 9) Idade ao primeiro parto (meses) — reaproveita mesesDeVida.
  const partosOrdenados = [...partos].filter(p => p.data_parto).sort((a, b) => a.data_parto.localeCompare(b.data_parto))
  const idadePrimeiroPartoMeses = (partosOrdenados[0] && animal?.data_nascimento)
    ? mesesDeVida(animal.data_nascimento, parseISO(partosOrdenados[0].data_parto))
    : null

  // 10) Número de partos na vida — contagem direta, 0 é uma resposta real
  // (nunca "sem dados" quando o histórico já foi carregado).
  const numeroPartosVida = partos.length

  // 12) Kg desmamado por ano de vida — normaliza pela idade atual, senão vaca
  // velha sempre parece "melhor" que novilha só por ter tido mais partos.
  const idadeAnosAtual = animal?.data_nascimento ? mesesDeVida(animal.data_nascimento) / 12 : null
  const kgDesmamadoPorAno = (kgDesmamadoAcumulado !== null && idadeAnosAtual > 0)
    ? round1(kgDesmamadoAcumulado / idadeAnosAtual) : null

  // 14) Partos por ano exposta — "exposta" começa na 1ª inseminação/monta
  // registrada; sem nenhuma inseminação registrada (só partos órfãos/legados),
  // não dá pra saber quando ela começou a ser exposta — fica "sem dados" (não
  // inventa uma data).
  const datasExposicao = inseminacoes.map(i => i.lote?.data).filter(Boolean).sort()
  const anosExposta = datasExposicao[0] ? differenceInDays(hojeAgora(), parseISO(datasExposicao[0])) / 365 : null
  const partosPorAnoExposta = (anosExposta > 0) ? round1(partos.length / anosExposta) : null

  return {
    intervaloPartosDias,
    taxaFecundidade,
    taxaPerdaGestacional,
    taxaPerdaPosParto,
    gmdMedioFilhos,
    filhasF, filhosM,
    pesoMedioNascimento: desmame.pesoMedioNascimento,
    pesoMedioDesmame: desmame.pesoMedioDesmame,
    idadePrimeiroPartoMeses,
    numeroPartosVida,
    kgDesmamadoAcumulado,
    kgDesmamadoPorAno,
    taxaDesmame,
    partosPorAnoExposta,
  }
}

// Cores por desfecho de safra — usadas tanto no gráfico "Linha do tempo
// produtiva" (ficha do animal) quanto no selo de "Último desfecho" do Ranking
// de Matrizes, pra nunca ter duas paletas diferentes pro mesmo conceito.
export const CORES_DESFECHO = {
  pariu: '#27A838', pariu_aguardando: '#1BA89C', abortou: '#E24B4A',
  prenha: '#2B6CD9', falhou: '#D97706', nao_exposta: '#9CA3AF',
}
export const ROTULOS_DESFECHO = {
  pariu: 'Pariu', pariu_aguardando: 'Pariu (aguard. desmame)', abortou: 'Abortou',
  prenha: 'Prenha (aguardando)', falhou: 'Falhou', nao_exposta: 'Não exposta',
}

// Classifica, safra a safra (do primeiro ciclo em que a fêmea era matriz até
// hoje), o desfecho reprodutivo dela — reaproveita statusReprodutivoCiclo
// (já resolvido: pariu/gestacao_aberta/em_andamento/nao_exposta/falhada+motivo).
// Usada pelo gráfico "Linha do tempo produtiva" (Animais.jsx) e pelo Ranking
// de Matrizes (Rebanho.jsx) — extraída pra cá (Fase 14) pra nunca divergir
// entre os dois lugares. Motivo 'aborto' vira desfecho 'abortou' (vermelho);
// os outros dois motivos de falha ('nao_emprenhou'/'perda_gestacional') caem
// no mesmo 'falhou' genérico (laranja) — o gráfico não distingue motivo, só a
// ficha (tabela "Por ciclo") e a sequência do lote mostram o motivo explícito.
// `ciclosFazenda` = TODOS os ciclos da fazenda (mesmo array já carregado em
// CicloContext/Rebanho/Animais); `reprodutivoBruto` = { partos, inseminacoes,
// abortos } DESTA fêmea. 'em_andamento' (ciclo ainda não fechou) nunca entra
// no resultado — não há desfecho pra mostrar ainda.
export function classificarDesfechosPorSafra(animal, ciclosFazenda, reprodutivoBruto) {
  if (animal?.sexo !== 'F') return []
  const historicoCiclos = [...(ciclosFazenda || [])]
    .filter(c => c.inicio && c.inicio <= hojeISO())
    .sort((x, y) => (x.inicio || '').localeCompare(y.inicio || ''))
    .map(c => ({ ciclo: c, ...statusReprodutivoCiclo(animal, c, reprodutivoBruto) }))
  const primeiraMatrizIdx = historicoCiclos.findIndex(h => h.status !== 'nao_era_matriz')
  if (primeiraMatrizIdx === -1) return []
  return historicoCiclos.slice(primeiraMatrizIdx)
    .filter(h => h.status !== 'em_andamento')
    .map(h => {
      if (h.status === 'pariu') {
        const parto = (reprodutivoBruto.partos || []).find(p => p.data_parto === h.data)
        const pesoDesmame = parto?.bezerro?.pesagens?.find(ps => ps.tipo === 'desmama')
        const peso = pesoDesmame ? parseFloat(pesoDesmame.peso_kg) : null
        return { ciclo: h.ciclo, safra: h.ciclo.nome, valor: peso ?? 8, peso, desfecho: peso !== null ? 'pariu' : 'pariu_aguardando' }
      }
      if (h.status === 'gestacao_aberta') return { ciclo: h.ciclo, safra: h.ciclo.nome, valor: 8, peso: null, desfecho: 'prenha' }
      if (h.status === 'falhada') return { ciclo: h.ciclo, safra: h.ciclo.nome, valor: 8, peso: null, desfecho: h.motivo === 'aborto' ? 'abortou' : 'falhou' }
      return { ciclo: h.ciclo, safra: h.ciclo.nome, valor: 8, peso: null, desfecho: 'nao_exposta' }
    })
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
  'Com cria ao pé': { bg: '#EEEDFE', text: '#3C3489' },
  Falhada: { bg: '#FCEBEB', text: '#791F1F' },
}

// ── Predicado ÚNICO de "cria ao pé" — usado por statusReprodutivoExibicao,
// statusReprodutivoDetalhado e desfechoReprodutivo (helpers.js), pra nunca
// ter 3 cópias divergentes do mesmo critério. Um parto conta como "cria ao
// pé" quando: não foi natimorto, o bezerro está VIVO E ATIVO no rebanho
// (situacao === 'ativo' — positivo, não "!== 'morto'") e ainda não foi
// desmamado (data_desmame vazio).
//
// Checagem POSITIVA (situacao === 'ativo'), não negativa (situacao !==
// 'morto'): achado ao vivo — um bezerro VENDIDO ainda mamando (situacao
// 'vendido', data_desmame nunca preenchida, porque venda não grava esse
// campo, só empresta o peso da venda pros cálculos agregados de desmame —
// ver calcDesmameMetrics) passava pela checagem negativa antiga e ficava
// "Com cria ao pé"/"lactante" PARA SEMPRE, mesmo já fora do rebanho. A
// checagem positiva fecha isso: só 'ativo' conta.
//
// `parto` precisa ter natimorto e bezerro.{situacao,data_desmame} (ex:
// db.partos.listAll(), selLote.partos no detalhe do lote, ou o parto mais
// recente vindo de todosPartos em desfechoReprodutivo).
export function bezerroAindaComCriaAoPe(parto) {
  if (!parto || parto.natimorto) return false
  const b = parto.bezerro
  return !!b && b.situacao === 'ativo' && !b.data_desmame
}

// ── Situação reprodutiva de EXIBIÇÃO (não é um valor do banco) ────────────────
// "Com cria ao pé" (antigo rótulo "Lactante" — só o texto mudou, nada no dado
// gravado) é só uma camada visual sobre sit_reprodutiva === 'vazia': aparece
// quando a vaca tem um parto registrado e o terneiro daquele parto ainda não foi
// desmamado (bezerro.data_desmame vazio). Nunca grava nada — os cálculos de
// matriz/prenhez/etc. continuam usando o sit_reprodutiva real ('vazia'). Some
// assim que o terneiro é desmamado (data_desmame preenchida) ou se a vaca for
// reinseminada e diagnosticada prenha de novo (sit_reprodutiva vira 'prenha',
// que tem prioridade — é a informação mais relevante nessa hora).
// `partos` precisa ter mae_id, natimorto e bezerro.{data_desmame,situacao}
// (ex: db.partos.listAll(), ou selLote.partos no detalhe do lote).
export function statusReprodutivoExibicao(animal, partos) {
  if (!animal || animal.sit_reprodutiva !== 'vazia') return animal?.sit_reprodutiva ?? null
  const partosDaMae = (partos || [])
    .filter(p => p.mae_id === animal.id)
    .sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''))
  const ultimoParto = partosDaMae[0]
  if (ultimoParto && bezerroAindaComCriaAoPe(ultimoParto)) return 'Com cria ao pé'
  return animal.sit_reprodutiva
}

// ── Desfecho reprodutivo consolidado (Falhada é GUARDA-CHUVA, não estado
// exclusivo) — ÚNICA fonte de verdade, reaproveitada em QUATRO escalas
// diferentes sem reescrever a lógica: por ESTAÇÃO (filtros de venda em
// Financeiro.jsx, sequência do lote e "última estação" da ficha em
// Reprodutivo.jsx/Animais.jsx) e por CICLO (tabela "Por ciclo" da ficha,
// via statusReprodutivoCiclo logo abaixo, que só filtra os eventos pela
// janela do ciclo antes de chamar isto). "Falhada" = a vaca foi exposta e
// NÃO entregou terneiro no escopo avaliado — quem pariu NUNCA é falhada,
// mesmo tendo falhado numa tentativa anterior dentro do mesmo escopo
// (lote→estação, ou estação→ciclo — mesmo princípio, dois níveis).
//
// Resultado sempre um destes 5 (mutuamente exclusivos por construção):
//   { resultado: 'pariu', data }          — teve parto no escopo, ponto final
//   { resultado: 'nao_exposta' }          — nunca teve inseminação no escopo
//   { resultado: 'em_aberto', dataPrevistaParto? } — prenha, ainda dentro do
//     prazo (até PERDA_PRESUMIDA_DIAS_APOS_PREVISTO dias do parto previsto),
//     sem parto nem aborto ainda — indefinido, não é falha. É o estado usado
//     como "Vacas prenhas" na venda (Financeiro.jsx) — o NOME interno não
//     muda (outros callers já comparam contra a string 'em_aberto'), só o
//     RÓTULO exibido no seletor da venda.
//   { resultado: 'em_repasse' } — a tentativa MAIS RECENTE dela no escopo
//     (maior lote.data entre as inseminações dela) ainda não foi
//     diagnosticada, E ela já foi Vazia antes — repasse em andamento,
//     "falhada" é conclusão de fim de estação, não isto; nunca gera esse
//     rótulo. Critério é SEMPRE a tentativa mais recente, não "existe alguma
//     linha sem diagnóstico" (bug corrigido — achado ao vivo: uma vaca
//     diagnosticada Vazia em 3 lotes sucessivos, sem NENHUMA linha pendente,
//     ficava presa em 'em_repasse' pra sempre se qualquer lote ANTIGO dela
//     tivesse ficado sem diagnóstico por engano — um erro de digitação
//     antigo não pode barrar a conclusão de hoje. Uma tentativa tentada e
//     descartada por engano, um lote NOVO onde ela foi incluída de novo:
//     esse sim é repasse de verdade, e é exatamente o que "a mais recente"
//     captura. Campo `lote.encerrado` NÃO é mais usado aqui — descoberto ao
//     vivo que nenhum caminho do app grava essa coluna como true, então
//     qualquer critério baseado nela era inerte na prática.
//   { resultado: 'falhou', motivo, data? } — motivo é um destes 3:
//     'nao_emprenhou'    — teve diagnóstico 'V' e NUNCA 'P' no escopo
//     'aborto'            — engravidou e a gestação mais recente terminou em
//                            aborto (aborto com data >= diagnóstico dessa
//                            gestação), sem gestação POSTERIOR no escopo
//     'perda_gestacional' — engravidou e o prazo (PERDA_PRESUMIDA_DIAS_
//                            APOS_PREVISTO dias após o parto previsto)
//                            passou sem parto nem aborto — hoje é a "perda
//                            gestacional presumida" descrita em
//                            perdaGestacionalPresumida.js, agora um MOTIVO de
//                            falha, não um conceito à parte
// O motivo mostrado é sempre o da TENTATIVA MAIS RECENTE (maior diagnóstico
// 'P') dentro do escopo — uma falha antiga (ex: não emprenhou numa estação
// anterior do ciclo) some assim que uma tentativa mais nova tem desfecho
// próprio, sucesso ou não.
//
// Além do `resultado` acima (sempre escopado a `inseminacoes`/`partos`/
// `abortos`, o que o chamador passou), o retorno sempre inclui um eixo
// INDEPENDENTE, não escopado à mesma janela:
//   comCriaAoPe: bool   — ela tem um bezerro vivo/ativo/não desmamado AGORA,
//   bezerroAtualId: uuid|null — o id desse bezerro (ou null)
// Calculado a partir do PARTO MAIS RECENTE da vaca em `todosPartos` (sem
// filtro de estação/ciclo) — de propósito diferente do `resultado`: uma vaca
// pode estar com cria ao pé de uma estação anterior E já prenha de novo na
// estação atual ao mesmo tempo (é o normal numa operação de cria bem
// tocada), então "tem cria ao pé" não pode depender de ela ter parido
// DENTRO do escopo sendo avaliado agora. Sem `todosPartos` (chamador não
// forneceu), comCriaAoPe fica sempre false — nenhum caller quebra (nenhum
// lia esses campos antes deles existirem).
//
// `inseminacoes` = eventos do escopo inteiro (todos os lotes da estação, ou
// todos os lotes do ciclo), cada item com animal_id/diagnostico/
// data_diagnostico e `lote.data` (data da MONTA, pro prazo de perda
// gestacional E pra achar a tentativa mais recente da guarda 'em_repasse').
// `partos`/`abortos` = idem, mae_id/data_parto e animal_id/data
// respectivamente. `todosPartos` (opcional, 4º parâmetro) = TODOS os partos
// da fazenda (sem escopo), cada item com mae_id/data_parto/natimorto/
// bezerro_id/bezerro.{situacao,data_desmame} — usado só pra comCriaAoPe.
export function desfechoReprodutivo(animalId, { inseminacoes = [], partos = [], abortos = [] } = {}, hoje = hojeISO(), todosPartos = null) {
  const resultadoBase = (() => {
    const partoAnimal = (partos || []).find(p => p.mae_id === animalId)
    if (partoAnimal) return { resultado: 'pariu', data: partoAnimal.data_parto }
    const insAnimal = (inseminacoes || []).filter(i => i.animal_id === animalId)
    const prenhezes = insAnimal.filter(i => i.diagnostico === 'P' && i.data_diagnostico)
    if (prenhezes.length === 0) {
      const temV = insAnimal.some(i => i.diagnostico === 'V')
      // Repasse em andamento = a tentativa MAIS RECENTE dela no escopo
      // (maior lote.data) ainda não tem diagnóstico — não "existe alguma
      // linha sem diagnóstico" (ver comentário do resultado 'em_repasse'
      // acima pro bug que isso corrige). Linhas sem lote.data (dado antigo
      // incompleto) ficam de fora dessa comparação — sem data não dá pra
      // saber se são "mais recentes" que nada.
      const insComData = insAnimal.filter(i => i.lote?.data)
      const maisRecente = insComData.reduce((max, i) => (!max || i.lote.data > max.lote.data) ? i : max, null)
      const temPendente = !!maisRecente && !maisRecente.diagnostico
      if (temV && temPendente) return { resultado: 'em_repasse' }
      return temV ? { resultado: 'falhou', motivo: 'nao_emprenhou' } : { resultado: 'nao_exposta' }
    }
    const ultimaPrenhez = prenhezes.reduce((max, p) => (!max || p.data_diagnostico > max.data_diagnostico) ? p : max, null)
    const abortosResolvendo = (abortos || [])
      .filter(a => a.animal_id === animalId && a.data && a.data >= ultimaPrenhez.data_diagnostico)
      .sort((a, b) => b.data.localeCompare(a.data))
    if (abortosResolvendo.length > 0) return { resultado: 'falhou', motivo: 'aborto', data: abortosResolvendo[0].data }
    if (!ultimaPrenhez.lote?.data) return { resultado: 'em_aberto' }
    const d = new Date(ultimaPrenhez.lote.data + 'T12:00:00')
    d.setDate(d.getDate() + GESTACAO_ANGUS_DIAS)
    const dataPrevistaParto = d.toISOString().slice(0, 10)
    const dLimite = new Date(d)
    dLimite.setDate(dLimite.getDate() + PERDA_PRESUMIDA_DIAS_APOS_PREVISTO)
    if (hoje >= dLimite.toISOString().slice(0, 10)) return { resultado: 'falhou', motivo: 'perda_gestacional', dataPrevistaParto }
    return { resultado: 'em_aberto', dataPrevistaParto }
  })()

  let comCriaAoPe = false
  let bezerroAtualId = null
  if (todosPartos) {
    const ultimoPartoVaca = (todosPartos || [])
      .filter(p => p.mae_id === animalId)
      .sort((a, b) => (b.data_parto || '').localeCompare(a.data_parto || ''))[0] || null
    if (ultimoPartoVaca && bezerroAindaComCriaAoPe(ultimoPartoVaca)) {
      comCriaAoPe = true
      bezerroAtualId = ultimoPartoVaca.bezerro_id ?? ultimoPartoVaca.bezerro?.id ?? null
    }
  }

  return { ...resultadoBase, comCriaAoPe, bezerroAtualId }
}
export const FALHA_MOTIVO_LABEL = {
  nao_emprenhou: 'não emprenhou',
  aborto: 'aborto',
  perda_gestacional: 'perda gestacional',
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
  // bezerroAindaComCriaAoPe (predicado único, ver acima) — checagem POSITIVA
  // (situacao === 'ativo'): um bezerro VENDIDO ainda sem desmame registrado
  // cai aqui embaixo (etapa 'desmamado', sem data/peso de desmame), não fica
  // "lactante" pra sempre.
  if (bezerroAindaComCriaAoPe(ultimoParto)) {
    return { ...vazio, etapa: 'lactante', dataParto: ultimoParto.data_parto, bezerro }
  }
  const pesoDesm = (b?.pesagens || []).find(ps => ps.tipo === 'desmama')
  return {
    ...vazio, etapa: 'desmamado', dataParto: ultimoParto.data_parto, bezerro,
    dataDesmame: b?.data_desmame || null,
    pesoDesmame: pesoDesm ? parseFloat(pesoDesm.peso_kg) : null,
  }
}

// ── "Lote encerrado" — 100% DERIVADO, nunca lido de lotes_inseminacao.encerrado ──
// Essa coluna existe no schema (herdada do projeto anterior) mas nenhum
// caminho do app jamais grava true nela — confirmado por busca no código
// inteiro e por consulta direta no banco (nenhum lote, em nenhuma estação).
// Em vez de reviver a coluna, um lote é considerado encerrado quando QUALQUER
// uma das duas condições vale — o mesmo raciocínio já usado no critério de
// repasse "tentativa mais recente" de desfechoReprodutivo, só que aplicado ao
// lote em si em vez de à inseminação de uma vaca:
//   a) existe outro lote de data mais recente na MESMA estação (esse lote não
//      é mais a tentativa em andamento); ou
//   b) a estação em si já terminou por data (`estacao.fim <= hoje`) — cobre o
//      ÚLTIMO lote de uma estação encerrada, que não tem lote posterior mas
//      claramente não está mais "em andamento".
// As duas são necessárias: só (a) deixaria o último lote de toda estação
// encerrada eternamente "em andamento"; só (b) erraria em estações sem `fim`
// cadastrado ou ainda em curso, mesmo já tendo lote(s) posterior(es).
export function loteEncerrado(lote, lotesDaEstacao, estacaoFim, hoje = hojeISO()) {
  const existeLotePosterior = (lotesDaEstacao || []).some(l =>
    l.id !== lote.id && l.data && lote.data && l.data > lote.data
  )
  const estacaoTerminouPorData = !!estacaoFim && estacaoFim <= hoje
  return existeLotePosterior || estacaoTerminouPorData
}

// ── "Vaca falhada" — status reprodutivo por ciclo, 100% DERIVADO na leitura ──
// Nunca grava nada (nenhuma coluna/linha nova) e não entra em nenhum índice do
// rebanho (esses continuam herd-level, ver Metas.jsx) — é só uma leitura sobre
// os mesmos eventos (partos/inseminações/abortos) já usados em outros lugares,
// exibida no histórico individual do animal (Animais.jsx).
//
// Sobe um nível a MESMA regra de consolidação de lote→estação (Reprodutivo.jsx):
// aqui é estação→ciclo. Um ciclo pode ter 2+ estações (ex: IA em out/nov +
// repasse com touro em jan/fev) — a vaca só é "falhada" no ciclo se falhou em
// TODAS as estações em que foi exposta. Se pariu em QUALQUER estação do ciclo,
// cumpriu — não é falhada, mesmo tendo falhado numa estação anterior. Isso sai
// de graça de desfechoReprodutivo: como ele já pega SEMPRE a tentativa
// ('prenhez') mais recente do escopo inteiro, uma vaca vazia na estação 1 e
// prenha/parida na estação 2 do mesmo ciclo naturalmente reflete o desfecho da
// estação 2, sem precisar tratar as estações uma a uma aqui.
//
// Casos de fronteira (decididos):
//   a) exposta só na estação 1 (falhou), não exposta na 2 → falhada (falhou na
//      única em que participou).
//   b) exposta só na estação 2 (comprada no meio do ciclo), falhou → falhada,
//      sem penalizar por não ter participado da 1.
//   c) não exposta em NENHUMA estação do ciclo → não é falhada, é "não
//      exposta" (status próprio, nunca confundido com falha).
//   d) falhou na estação 1, prenha na estação 2 sem desfecho ainda → status em
//      aberto (gestacao_aberta), não falhada — só vira falhada se essa
//      gestação se resolver sem terneiro.
//
// `partos`/`inseminacoes`/`abortos` = eventos DESTE animal (ex: já carregados
// pela timeline em Animais.jsx: db.partos.byMae, db.inseminacoes.byAnimal,
// db.abortos.byAnimal). `inseminacoes[].lote.data` é a data da monta.
export const STATUS_CICLO_ANIMAL = {
  nao_era_matriz: { label: 'Ainda não era matriz', bg: '#F3F4F6', text: '#9CA3AF' },
  pariu:          { label: 'Pariu',                bg: '#EAF3DE', text: '#27500A' },
  gestacao_aberta:{ label: 'Gestação em aberto',   bg: '#E6F1FB', text: '#1E55B0' },
  em_andamento:   { label: 'Ciclo em andamento',   bg: '#F3F4F6', text: '#6B7280' },
  nao_exposta:    { label: 'Não exposta',          bg: '#F3F4F6', text: '#9CA3AF' },
  falhada:        { label: 'Falhada',              bg: '#FCEBEB', text: '#791F1F' },
}
export function statusReprodutivoCiclo(animal, ciclo, { partos = [], inseminacoes = [], abortos = [] } = {}, hoje = hojeISO()) {
  // Elegibilidade: matriz apta durante o ciclo (avaliada no FIM do ciclo —
  // "ela existiu como matriz elegível ao longo de todo o ciclo").
  if (!ehMatriz(animal, ciclo.fim)) return { status: 'nao_era_matriz' }

  const partosCiclo = (partos || []).filter(p => p.data_parto && p.data_parto >= ciclo.inicio && p.data_parto <= ciclo.fim)
  const insCiclo     = (inseminacoes || []).filter(i => i.lote?.data && i.lote.data >= ciclo.inicio && i.lote.data <= ciclo.fim)
  const abortosCiclo = (abortos || []).filter(a => a.data && a.data >= ciclo.inicio && a.data <= ciclo.fim)
  const desfecho = desfechoReprodutivo(animal.id, { inseminacoes: insCiclo, partos: partosCiclo, abortos: abortosCiclo }, hoje)

  if (desfecho.resultado === 'pariu')      return { status: 'pariu', data: desfecho.data }
  if (desfecho.resultado === 'em_aberto')  return { status: 'gestacao_aberta' }
  // Repasse em andamento (ver resultado 'em_repasse', desfechoReprodutivo
  // acima) — mesmo se o ciclo já encerrou no calendário, ela ainda não fechou
  // desfecho: não é falhada nem "em andamento" por acaso, é literalmente um
  // repasse pendente.
  if (desfecho.resultado === 'em_repasse') return { status: 'em_andamento' }

  // Ciclo ainda não fechou — não assume falha nem "não exposta" ainda: pode
  // vir mais uma estação (repasse) dentro do próprio ciclo antes dele fechar.
  if (hoje <= ciclo.fim) return { status: 'em_andamento' }

  if (desfecho.resultado === 'falhou') return { status: 'falhada', motivo: desfecho.motivo, data: desfecho.data }
  return { status: 'nao_exposta' }
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

// ── Resultado financeiro (receita − despesa) — consolidado aqui depois de um
// levantamento achar a mesma fórmula reimplementada em 6 telas (Financeiro
// Resumo/Resultados, Relatorios, Dashboard, Rebanho, Comparativo). Nenhuma
// delas tinha particularidade real: valorPropLanc já reduz sozinho a
// somaFinita quando propId é vazio/null, então os "filtroProp ? valorPropLanc
// (...) : somaFinita(...)" espalhados por Rebanho.jsx/Relatorios.jsx eram só
// redundantes (nunca produziam número diferente). Comparativo.jsx nunca
// filtra por proprietário (compara fazendas inteiras) — chamar com
// propId=null reproduz exatamente o total de hoje.
export function calcResultadoFinanceiro(lancamentos, propId = null) {
  const receita = valorPropLanc(lancamentos, 'R', propId)
  const despesa = valorPropLanc(lancamentos, 'D', propId)
  return { receita, despesa, resultado: receita - despesa }
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
