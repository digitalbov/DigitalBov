import { format, differenceInMonths, differenceInDays, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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
export const mesesDeVida = (dataNasc) => {
  if (!dataNasc) return 0
  return Math.max(0, differenceInMonths(new Date(), parseISO(dataNasc)))
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

// ── Ciclo financeiro ──────────────────────────────────────────────────────────
export const getCicloNome = (dt) => {
  const d = dt ? parseISO(dt) : new Date()
  const m = d.getMonth(), y = d.getFullYear()
  if (m >= 6) return `${y}/${String(y + 1).slice(2)}`
  return `${y - 1}/${String(y).slice(2)}`
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
// Padrão oficial: prenhas / total de inseminações do ciclo (inclui pendentes,
// sem diagnóstico ainda). Passe { incluirPendentes: false } para calcular sobre
// apenas as inseminações já diagnosticadas (prenha ou vazia).
export function calcTaxaPrenhez(inseminacoes, { incluirPendentes = true } = {}) {
  const lista = inseminacoes || []
  const prenhas = lista.filter(i => i.diagnostico === 'P').length
  const denominador = incluirPendentes
    ? lista.length
    : lista.filter(i => i.diagnostico === 'P' || i.diagnostico === 'V').length
  return denominador > 0 ? Math.round((prenhas / denominador) * 100) : null
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

// ── Valor de lançamentos por proprietário (via rateio) ─────────────────────────
export const valorPropLanc = (lancamentos, tipo, propId) => {
  if (!propId) return lancamentos.filter(l=>l.tipo===tipo).reduce((s,l)=>s+Number(l.valor),0)
  return lancamentos.filter(l=>l.tipo===tipo).reduce((s,l) => {
    const rateio = l.rateios?.find(r => r.proprietario_id === propId)
    return s + (rateio ? Number(rateio.valor) : 0)
  }, 0)
}

// ── Debounce ─────────────────────────────────────────────────────────────────
export const debounce = (fn, ms) => {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}
