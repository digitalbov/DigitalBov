// ── Data simulada (ferramenta de TESTE) ─────────────────────────────────────
// Fonte única de "hoje" para todo o app. Por padrão é a data real; um admin/dono
// pode configurar uma data simulada (tela Configurações) para testar simulação
// temporal (vencimentos, ciclos, prenhez, etc.) sem esperar o tempo passar de
// verdade. As validações continuam ativas — elas só passam a julgar "hoje" pela
// data simulada em vez da real.
//
// NUNCA use isto para timestamps de auditoria (criado_em/atualizado_em) — esses
// devem sempre refletir o momento real em que a ação aconteceu no banco. Use
// hoje()/hojeISO() apenas para datas de EVENTO informadas pelo usuário e para
// cálculos/validações que dependem de "que dia é hoje".
const CHAVE_DATA_SIMULADA = 'digitalbov_data_simulada'

export function getDataSimulada() {
  try {
    return localStorage.getItem(CHAVE_DATA_SIMULADA) || null
  } catch {
    return null
  }
}

export function setDataSimulada(dateStr) {
  try {
    localStorage.setItem(CHAVE_DATA_SIMULADA, dateStr)
  } catch {}
}

export function limparDataSimulada() {
  try {
    localStorage.removeItem(CHAVE_DATA_SIMULADA)
  } catch {}
}

export function estaSimulado() {
  return !!getDataSimulada()
}

// Retorna a data de referência atual: a simulada (se configurada e válida) ou a
// real. T12:00:00 evita que fusos negativos (ex: Brasil) empurrem a data
// simulada um dia para trás/frente em conversões UTC feitas em outros pontos do código.
export function hoje() {
  const sim = getDataSimulada()
  if (sim) {
    const d = new Date(sim + 'T12:00:00')
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// 'AAAA-MM-DD' de hoje() — usa componentes locais (não toISOString, que é UTC e
// pode virar o dia perto da meia-noite em fusos negativos).
export function hojeISO() {
  const d = hoje()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}
