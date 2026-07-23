-- ================================================================
-- BLOCO D4 — Comissao/imposto viram despesa automatica
-- Parte 1/5 — coluna de vinculo. Um lancamento "filho" (Comissao/Impostos
-- gerado automaticamente por uma venda/compra) aponta pro lancamento
-- "pai" (a receita da venda ou a despesa da compra) via esta coluna.
-- ON DELETE SET NULL (mesmo padrao ja usado em transacoes_animais.lancamento_id)
-- porque a remocao de verdade e feita explicitamente pelo trigger de reversao
-- (parte 5/5), nao pela FK sozinha.
-- ================================================================

ALTER TABLE public.lancamentos_financeiros
  ADD COLUMN IF NOT EXISTS lancamento_origem_id uuid
    REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL;

SELECT 'coluna lancamento_origem_id criada!' as resultado;
