-- ================================================================
-- BLOCO D8 -- Correcao de dados: 2o parto duplicado (Cabanha Ranch Blue)
-- 3 vacas (5013, 5015, 5017) tem um 2o parto registrado 3-4 meses depois do
-- 1o (biologicamente impossivel), vinculado ao lote de repasse natural
-- (Lote 4 ou 5, 01/02/2027) que na verdade so confirmou a gestacao ja em
-- andamento do Lote 3 (IA, 01/11/2026). Nao existe lote alternativo valido
-- pra realocar -- decisao do usuario: apagar o 2o parto e o bezerro gerado
-- por ele. Checado antes: nenhum dos 3 bezerros tem venda, sanidade,
-- inseminacao, aborto ou filho proprio -- so a pesagem de nascimento listada
-- abaixo. Ordem por causa de FK: pesagens -> partos -> animais.
-- Cada statement em 1 linha, com os IDs explicitos (nao pega mais linha
-- que o previsto). Execute no SQL Editor do Supabase.
-- ================================================================

BEGIN;

-- 1. Pesagens de nascimento dos 3 bezerros
DELETE FROM public.pesagens WHERE id IN ('18d44299-652e-49b8-8876-68960e9e3fde', '88bdf738-b28b-4d7f-92a4-3fc41c75534e', 'db1ef8b3-0784-4496-a0f2-3f49fe47d6f6');

-- 2. Os 3 partos (2o parto de cada mae, o duplicado impossivel)
DELETE FROM public.partos WHERE id IN ('0d385473-a598-4747-818f-ed4ec9839221', 'a10e2a30-6cbd-45b2-a725-d9a3cba984aa', '98966a3a-3f6b-4dd9-b195-e599d63a32d1');

-- 3. Os 3 bezerros (SN-08, SN-09, SN-10)
DELETE FROM public.animais WHERE id IN ('380d1da7-ed14-4856-8e65-68756e6bc395', '561db7ae-4336-4709-b496-663f0f299a8f', '8b84768f-59e1-4ea5-b31d-54f06b771ba5');

COMMIT;

SELECT '3 partos duplicados e seus bezerros removidos (5013/5015/5017, Cabanha Ranch Blue)!' as resultado;
