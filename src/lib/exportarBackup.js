import { supabase } from './supabase'

// Dispara download de um Blob no browser — usado tanto pelo botão "Baixar
// Backup Completo" (Backup.jsx) quanto pelo "backup de segurança" oferecido
// antes de uma restauração total (RestaurarBackup.jsx).
export function baixarBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

export function baixarBackupJSON(payload, filename) {
  baixarBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename)
}

// Busca segura e escopada: retorna [] se a tabela não existir ou houver erro.
// Sempre filtra por conta_id; filtra também por fazenda_id, exceto quando
// { semFazenda: true } (tabela não tem essa coluna) ou { porId: fazendaId }
// (a própria tabela "fazendas": queremos só a linha da fazenda atual, não
// todas as fazendas da conta). Extraído de Backup.jsx (Bloco Restore) — é a
// MESMA função usada tanto pelo botão "Baixar Backup Completo" quanto pelo
// "backup de segurança" oferecido antes de uma restauração total, para as
// duas nunca divergirem em quais tabelas/colunas entram no arquivo.
const safeQ = async (table, contaId, fazendaId, opts = {}) => {
  let q = supabase.from(table).select('*')
  if (contaId) q = q.eq('conta_id', contaId)
  if (opts.porId) {
    q = q.eq('id', fazendaId)
  } else if (!opts.semFazenda && fazendaId) {
    q = q.eq('fazenda_id', fazendaId)
  }
  const { data, error } = await q
  if (error) {
    console.warn(`[exportarBackup] tabela "${table}":`, error.message)
    return []
  }
  return data || []
}

// Monta o payload completo do backup (formato_versao '2', 26 tabelas) — não
// dispara download nenhum, só busca e monta o objeto. Quem chama decide o
// que fazer com o resultado (Backup.jsx baixa um .json; RestaurarBackup.jsx
// usa o mesmo payload como "backup de segurança" antes de uma restauração
// total, e também pode baixá-lo).
export async function gerarBackupPayload({ contaId, fazendaId, contaNome, fazendaNome }) {
  const [
    proprietarios, fazendas, piquetes, lotes,
    animais, lotes_inseminacao, inseminacoes, partos, abortos,
    pesagens, procedimentos_sanitarios,
    estoque_itens, estoque_movimentacoes,
    lancamentos_financeiros, transacoes_animais,
    ciclos_financeiros, categorias_preco, metas,
    lancamento_rateios, transacao_animais_itens, sanidade_animais,
    lote_touros, estacoes_monta,
    planejamentos, planejamento_acoes, simulacoes_transacoes,
  ] = await Promise.all([
    safeQ('proprietarios', contaId, fazendaId),
    safeQ('fazendas', contaId, fazendaId, { porId: true }),
    safeQ('piquetes', contaId, fazendaId),
    safeQ('lotes', contaId, fazendaId),
    safeQ('animais', contaId, fazendaId),
    safeQ('lotes_inseminacao', contaId, fazendaId),
    safeQ('inseminacoes', contaId, fazendaId),
    safeQ('partos', contaId, fazendaId),
    safeQ('abortos', contaId, fazendaId),
    safeQ('pesagens', contaId, fazendaId),
    safeQ('procedimentos_sanitarios', contaId, fazendaId),
    safeQ('estoque_itens', contaId, fazendaId),
    safeQ('estoque_movimentacoes', contaId, fazendaId),
    safeQ('lancamentos_financeiros', contaId, fazendaId),
    safeQ('transacoes_animais', contaId, fazendaId),
    safeQ('ciclos_financeiros', contaId, fazendaId),
    safeQ('categorias_preco', contaId, fazendaId),
    safeQ('metas', contaId, fazendaId),
    safeQ('lancamento_rateios', contaId, fazendaId),
    safeQ('transacao_animais_itens', contaId, fazendaId),
    safeQ('sanidade_animais', contaId, fazendaId),
    safeQ('lote_touros', contaId, fazendaId),
    safeQ('estacoes_monta', contaId, fazendaId),
    safeQ('planejamentos', contaId, fazendaId),
    safeQ('planejamento_acoes', contaId, fazendaId),
    safeQ('simulacoes_transacoes', contaId, fazendaId),
  ])

  const dados = {
    proprietarios, fazendas, piquetes, lotes,
    animais, lotes_inseminacao, inseminacoes, partos, abortos,
    pesagens, procedimentos_sanitarios,
    estoque_itens, estoque_movimentacoes,
    lancamentos_financeiros, transacoes_animais,
    ciclos_financeiros, categorias_preco, metas,
    lancamento_rateios, transacao_animais_itens, sanidade_animais,
    lote_touros, estacoes_monta,
    planejamentos, planejamento_acoes, simulacoes_transacoes,
  }

  return {
    formato_versao: '2',
    data_backup:    new Date().toISOString(),
    sistema:        'DigitalBov',
    conta:          { id: contaId, nome: contaNome || '' },
    fazenda:        { id: fazendaId, nome: fazendaNome || '' },
    contagens:      Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.length])),
    dados,
  }
}
