-- ================================================================
-- BLOCO D10 -- Adiciona estoque_movimentacoes.lancamento_id, vinculo entre
-- uma movimentacao de estoque e o lancamento financeiro que a originou
-- (despesa de compra -> entrada; receita de venda -> saida). Mesmo padrao
-- ja usado em estoque_movimentacoes.procedimento_id (nullable, ON DELETE
-- SET NULL, sem CASCADE -- a reversao de verdade fica por conta do
-- codigo da aplicacao, nao do banco).
-- Isto so cria a coluna, com o codigo (Financeiro.jsx, Estoque.jsx,
-- estoqueFinanceiro.js) ja pronto pra usa-la nos 4 caminhos (despesa->
-- entrada, receita->saida, entrada->despesa, saida->receita). IMPORTANTE:
-- os checkboxes "Lancar tambem como despesa/receita"/"Dar baixa no estoque"
-- ja aparecem na tela mesmo sem esta migration rodada -- se forem usados
-- antes, o insert em estoque_movimentacoes vai falhar com erro de coluna
-- inexistente (nao ha tolerancia no codigo pra coluna ausente). Rode esta
-- migration ANTES de usar qualquer um dos 4 caminhos novos.
-- Execute no SQL Editor do Supabase.
-- ================================================================

BEGIN;

ALTER TABLE public.estoque_movimentacoes ADD COLUMN IF NOT EXISTS lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_mov_lancamento ON public.estoque_movimentacoes(lancamento_id);

COMMIT;

-- Conferencia -- deve mostrar a coluna nova.
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'estoque_movimentacoes' AND column_name = 'lancamento_id';
