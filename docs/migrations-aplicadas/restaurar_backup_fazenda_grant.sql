-- ================================================================
-- Permissao de execucao para restaurar_backup_fazenda.
-- Rodar SOMENTE depois que restaurar_backup_fazenda.sql tiver sido criada
-- com sucesso.
-- ================================================================

GRANT EXECUTE ON FUNCTION public.restaurar_backup_fazenda(uuid, jsonb) TO authenticated;

SELECT 'GRANT aplicado em restaurar_backup_fazenda!' as resultado;
