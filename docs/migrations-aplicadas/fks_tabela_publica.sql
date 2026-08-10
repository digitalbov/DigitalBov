-- ================================================================
-- Foreign keys reais do schema public, para RestaurarBackup.jsx auditar em
-- best-effort (ao abrir a tela) se a lista estatica REFERENCIAS ainda bate
-- com o banco de verdade.
--
-- A validacao de arquivo em si (Fase 0, RestaurarBackup.jsx) continua 100%
-- offline e usando a lista REFERENCIAS hardcoded no componente - essa RPC
-- NAO substitui isso, so serve de segunda fonte pra detectar quando a
-- lista ficou desatualizada em relacao a um schema que mudou (coluna nova,
-- FK removida etc), sem depender de alguem lembrar de atualizar o
-- comentario a mao. Mesmo raciocinio/padrao de colunas_tabelas_publicas
-- nesta mesma pasta.
--
-- SECURITY DEFINER: information_schema.* aqui tambem so expoe metadado
-- estrutural (nomes de tabela/coluna), nenhum dado de fazenda - mesma
-- superficie de colunas_tabelas_publicas.
-- ================================================================

CREATE OR REPLACE FUNCTION public.fks_tabelas_publicas()
RETURNS TABLE(tabela text, coluna text, tabela_alvo text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    tc.table_name::text AS tabela,
    kcu.column_name::text AS coluna,
    ccu.table_name::text AS tabela_alvo
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.constraint_schema = tc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.constraint_schema = tc.constraint_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
$$;
