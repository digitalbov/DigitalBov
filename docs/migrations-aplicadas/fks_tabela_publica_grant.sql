-- ================================================================
-- Permissao de execucao para fks_tabelas_publicas.
-- Rodar SOMENTE depois que fks_tabela_publica.sql tiver sido criada
-- com sucesso.
-- ================================================================

GRANT EXECUTE ON FUNCTION public.fks_tabelas_publicas() TO authenticated;

SELECT 'GRANT aplicado em fks_tabelas_publicas!' as resultado;
