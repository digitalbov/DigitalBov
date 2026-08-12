-- ================================================================
-- DROP da coluna morta lotes_inseminacao.encerrado (P1, 2026-08-13)
-- Confirmado por busca no codigo inteiro (nao so telas): nenhum caminho
-- grava ou le essa coluna. O badge "Encerrado/Em andamento"
-- (Reprodutivo.jsx) usa loteEncerrado (helpers.js), 100% derivado, nunca
-- leu esta coluna. Export usa select('*') - some sozinho do proximo
-- backup, sem mudanca de codigo. Importacao (importarBackup.js) filtra
-- colunas reais via colunas_tabelas_publicas antes do insert - ignora a
-- chave se um backup antigo ainda trouxer. Restauracao sobre fazenda
-- existente (restaurar_backup_fazenda) usa jsonb_populate_recordset - chave
-- sem coluna correspondente e ignorada silenciosamente. Os dois caminhos de
-- restauracao aguentam um backup antigo com essa chave sem erro.
-- Ja executado no banco (confirmado pelo usuario via estrutura da tabela).
-- ================================================================

ALTER TABLE public.lotes_inseminacao
DROP COLUMN encerrado;

SELECT 'lotes_inseminacao.encerrado removida!' as resultado;
