import { db } from './supabase'
import { hojeISO } from './hoje'
import { fmtData, PERDA_PRESUMIDA_DIAS_APOS_PREVISTO } from './helpers'

// ── Perda gestacional presumida (Fase 10) — confirmação em UM clique do
// usuário, nunca escrita automática por navegação (mesmo princípio de
// reprodutivoDesmame.js). Até este clique, o sinal "perda presumida" é 100%
// derivado na leitura (statusReprodutivoDetalhado, helpers.js) — nada
// gravado.
//
// A NOTA DE AUDITORIA (observacoes) está ATIVA: migration aplicada
// (ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS observacoes text NOT
// NULL DEFAULT '' — ver docs/migrations-aplicadas/migration_animais_observacoes.sql).
// SEMPRE concatena com `observacoesAtuais` (nunca sobrescreve) — a nota vira
// uma linha A MAIS no campo, preservando qualquer anotação que o usuário já
// tivesse escrito ali (ex: pela aba "Anotações" da ficha do animal).
//
// Se um parto atrasado for registrado depois (mesmo já confirmada): sem
// conflito — salvarParto (Reprodutivo.jsx) sempre grava sit_reprodutiva=
// 'vazia' na mãe de novo, incondicionalmente, então é só um no-op sobre o
// mesmo valor. A nota desta confirmação continua no histórico, como
// contexto de que a gestação demorou a ser resolvida — não é apagada.
export async function confirmarPerdaPresumida({ animalId, dataMonta, dataPrevistaParto, observacoesAtuais }) {
  const hoje = hojeISO()
  const nota = `Perda gestacional presumida confirmada em ${fmtData(hoje)} — sem parto/aborto registrado até ${PERDA_PRESUMIDA_DIAS_APOS_PREVISTO} dias após o parto previsto (${fmtData(dataPrevistaParto)}), da monta de ${fmtData(dataMonta)}.`
  const observacoesFinal = observacoesAtuais ? `${observacoesAtuais}\n${nota}` : nota
  const { error } = await db.animais.update(animalId, { sit_reprodutiva: 'vazia', observacoes: observacoesFinal })
  return { error: error ? error.message : null, nota, observacoesFinal }
}
