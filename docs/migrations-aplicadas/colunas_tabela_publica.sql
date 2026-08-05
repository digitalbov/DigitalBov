-- ================================================================
-- Colunas reais de uma ou mais tabelas do schema public, para
-- importarBackup.js (Fase 1 - importacao para fazenda nova) filtrar cada
-- linha do JSON de backup antes do insert - evita que uma coluna removida
-- do schema (ex: um futuro DROP COLUMN em lotes_inseminacao.encerrado)
-- quebre a importacao de backups antigos que ainda trazem essa chave.
--
-- Consulta information_schema.columns em vez de manter uma lista de colunas
-- a mao no codigo - reflete o schema real no momento da chamada, nunca fica
-- desatualizada quando o schema muda.
--
-- Chamada uma unica vez por importacao (nao uma vez por tabela) - recebe o
-- array com o nome de TODAS as tabelas da importacao e devolve, numa unica
-- ida ao banco, cada par (tabela, coluna) de todas elas.
--
-- SECURITY DEFINER: mesmo padrao de criar_fazenda/restaurar_backup_fazenda
-- neste arquivo de migracoes - information_schema.columns por si so nao
-- expoe dado de fazenda nenhuma (so nomes de coluna, metadado estrutural),
-- entao nao ha superficie sensivel adicional aqui.
-- ================================================================

CREATE OR REPLACE FUNCTION public.colunas_tabelas_publicas(p_tabelas text[])
RETURNS TABLE(tabela text, coluna text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT c.table_name::text, c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = ANY(p_tabelas)
$$;
