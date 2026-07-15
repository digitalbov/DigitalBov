import { format, differenceInMonths, differenceInDays, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

// ── Datas ────────────────────────────────────────────────────────────────────
export const mesesDeVida = (dataNasc, dataRef = new Date()) => {
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
  return Math.abs(differenceInDays(new Date(), parseISO(dt)))
}

// ── Matriz (fêmea ativa apta à reprodução) ─────────────────────────────────
// Definição única: fêmea ativa com mais de 24 meses. dataRef permite calcular
// a idade numa data passada (ex: a data de uma monta), não apenas hoje.
export function ehMatriz(animal, dataRef = new Date()) {
  if (animal.sexo !== 'F' || animal.situacao !== 'ativo' || !animal.data_nascimento) return false
  return mesesDeVida(animal.data_nascimento, dataRef) > 24
}

export function contarMatrizes(animais, dataRef = new Date()) {
  return (animais || []).filter(a => ehMatriz(a, dataRef)).length
}

// ── Categoria automática ──────────────────────────────────────────────────────
export const calcCategoria = (dataNasc, sexo) => {
  const m = mesesDeVida(dataNasc)
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
export const dataNaoFutura = (d) => !!d && d <= new Date().toISOString().slice(0, 10)

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
export function diasAteValidade(validade, hoje = new Date()) {
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
  nao_se_aplica: { bg: '#F3F4F6', text: '#9CA3AF' }
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
  'Remédios', 'Suplementos', 'Mão de Obra', 'Combustível',
  'Ferramentas', 'Manutenção', 'Estrutura',
  'Máquinas e Equipamentos', 'Investimentos',
  'Realização de Lucro', 'Inseminação'
]

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
