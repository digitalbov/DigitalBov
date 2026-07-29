-- ================================================================
-- BLOCO D13 -- Calendario de vacinacao (Fase 7) -- Parte 2/2
-- Coluna itens_previstos em procedimentos_sanitarios: itens de estoque
-- PLANEJADOS pra um agendamento (formato jsonb [{item_id, quantidade}]),
-- editaveis via Sanidade.jsx (Editar agendamento) sem nunca baixar estoque
-- de verdade. So vira baixa real (aplicarMovimentacaoEstoque,
-- estoqueFinanceiro.js) na confirmacao de "Marcar como concluido", depois
-- de validar saldo (validarSaldoEstoque) -- se faltar saldo em qualquer
-- item ou o item tiver sido excluido do estoque, a conclusao inteira e
-- recusada, nada e alterado. Apos a conclusao, itens_previstos deixa de ser
-- lido em qualquer parte do app -- a movimentacao real (vinculada por
-- procedimento_id) passa a ser a fonte usada por reverterCascata se o
-- registro for excluido depois.
-- DEFAULT '[]'::jsonb preserva 100% do historico existente.
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.procedimentos_sanitarios ADD COLUMN IF NOT EXISTS itens_previstos jsonb NOT NULL DEFAULT '[]'::jsonb;

SELECT 'procedimentos_sanitarios.itens_previstos criada!' as resultado;
