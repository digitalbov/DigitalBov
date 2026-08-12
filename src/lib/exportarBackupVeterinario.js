import { supabase } from './supabase'

// Espelha exportarBackup.js, mas escopado por CONTA (não por fazenda) — o
// módulo Veterinário inteiro é dado de conta (ver SecaoVeterinario.jsx no
// manual). NÃO reaproveita safeQ de exportarBackup.js porque lá o filtro é
// sempre por conta_id + fazenda_id; aqui é só conta_id, e nunca há um
// "opts.semFazenda" pra confundir os dois. baixarBlob/baixarBackupJSON
// continuam vindo de exportarBackup.js — essas duas são genéricas de
// verdade, não fazem sentido duplicar.
const safeQ = async (table, contaId) => {
  const { data, error } = await supabase.from(table).select('*').eq('conta_id', contaId)
  if (error) {
    console.warn(`[exportarBackupVeterinario] tabela "${table}":`, error.message)
    return []
  }
  return data || []
}

// Monta o payload do backup do módulo Veterinário (formato_versao '1',
// tipo 'veterinario_conta' — checado pela RPC restaurar_backup_conta_
// veterinario antes de apagar qualquer coisa). Ordem de pai->filho é a
// mesma usada na restauração (ver migration_restaurar_backup_conta_
// veterinario.sql): config, categorias, clientes, ciclos, lancamentos,
// atestados, atestado_animais.
export async function gerarBackupVeterinarioPayload({ contaId, contaNome }) {
  const [
    veterinario_config, veterinario_categorias, veterinario_clientes,
    veterinario_ciclos, veterinario_lancamentos, veterinario_atestados,
    veterinario_atestado_animais,
  ] = await Promise.all([
    safeQ('veterinario_config', contaId),
    safeQ('veterinario_categorias', contaId),
    safeQ('veterinario_clientes', contaId),
    safeQ('veterinario_ciclos', contaId),
    safeQ('veterinario_lancamentos', contaId),
    safeQ('veterinario_atestados', contaId),
    safeQ('veterinario_atestado_animais', contaId),
  ])

  const dados = {
    veterinario_config, veterinario_categorias, veterinario_clientes,
    veterinario_ciclos, veterinario_lancamentos, veterinario_atestados,
    veterinario_atestado_animais,
  }

  return {
    tipo:           'veterinario_conta',
    formato_versao: '1',
    data_backup:    new Date().toISOString(),
    sistema:        'DigitalBov',
    conta:          { id: contaId, nome: contaNome || '' },
    contagens:      Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, v.length])),
    dados,
  }
}
