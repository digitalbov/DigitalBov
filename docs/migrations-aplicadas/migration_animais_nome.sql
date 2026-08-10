-- ================================================================
-- Campo "Nome" no cadastro de animais -- animais.nome.
-- Coluna nome em animais: identificacao complementar e OPCIONAL do animal
-- (ex: "Estrela", "Big Boy") -- o brinco continua sendo a identificacao
-- PRINCIPAL em todo o sistema (listas, buscas, documentos, PDFs). O campo
-- nome nao substitui o brinco em nenhum lugar, a menos que seja pedido
-- depois -- por enquanto e so um dado a mais na ficha do animal.
--
-- Nullable, sem DEFAULT: e um dado complementar puro (diferente de
-- animais.observacoes, que usa DEFAULT '' porque o codigo concatena texto
-- nela) -- todo animal ja cadastrado "nasce" com nome NULL, sem historico
-- nenhum pra preservar (campo nunca existiu antes, nao ha valor anterior
-- pra migrar).
--
-- Efeito automatico, sem nenhuma mudanca de codigo alem desta migration:
-- - Backup (src/lib/exportarBackup.js, safeQ): usa "select('*')" na tabela
--   animais -- a nova coluna entra sozinha no proximo backup gerado.
-- - Restauracao sobre fazenda existente (RPC restaurar_backup_fazenda,
--   docs/migrations-aplicadas/restaurar_backup_fazenda.sql): usa
--   jsonb_populate_recordset(NULL::public.animais, ...), que le o tipo de
--   linha REAL da tabela no momento da chamada -- a coluna nova e populada
--   sozinha se estiver no arquivo, e fica NULL se o arquivo for de um
--   backup antigo (sem quebrar nada).
-- - Restauracao para fazenda nova (Fase 1, src/lib/importarBackup.js + RPC
--   colunas_tabelas_publicas, docs/migrations-aplicadas/
--   colunas_tabela_publica.sql): a RPC consulta information_schema.columns
--   ao vivo -- a coluna nova passa a ser aceita automaticamente, sem
--   precisar atualizar a RPC nem o filtro de colunas obsoletas.
--
-- Texto exato aplicado diretamente no Supabase (fora deste arquivo).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS nome text;

SELECT 'animais.nome criada!' as resultado;
