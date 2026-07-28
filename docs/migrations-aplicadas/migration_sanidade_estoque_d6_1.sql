-- ================================================================
-- BLOCO D6 -- Sanidade da baixa automatica no estoque
-- Parte 1/1 -- coluna estoque_movimentacoes.procedimento_id, vinculo com o
-- procedimento sanitario que originou a baixa. ON DELETE SET NULL de proposito
-- (mesmo padrao de transacoes_animais.lancamento_id e lancamentos_financeiros.
-- lancamento_origem_id): a reversao de verdade (somar de volta o saldo, apagar
-- a movimentacao) e feita em codigo (Sanidade.jsx::excluir), nao por trigger --
-- o modulo de estoque inteiro ja e client-side, sem trigger nenhum. SET NULL
-- so evita que a movimentacao suma silenciosamente com o saldo ja ajustado se
-- o procedimento for apagado por fora desse fluxo.
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS procedimento_id uuid
    REFERENCES public.procedimentos_sanitarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_mov_procedimento
  ON public.estoque_movimentacoes(procedimento_id);

SELECT 'coluna estoque_movimentacoes.procedimento_id + indice criados!' as resultado;
