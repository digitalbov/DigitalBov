-- ================================================================
-- Permissao de execucao para colunas_tabelas_publicas.
-- Rodar SOMENTE depois que colunas_tabela_publica.sql tiver sido criada
-- com sucesso.
-- ================================================================

GRANT EXECUTE ON FUNCTION public.colunas_tabelas_publicas(text[]) TO authenticated;

SELECT 'GRANT aplicado em colunas_tabelas_publicas!' as resultado;
