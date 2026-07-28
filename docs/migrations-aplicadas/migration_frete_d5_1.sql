-- ================================================================
-- BLOCO D5 -- Frete em compra e venda
-- Parte 1/3 -- coluna transacoes_animais.frete, mesmo padrao de
-- comissao/imposto (informativo/auditoria -- o lancamento de despesa
-- automatico e feito por registrar_venda_animais/registrar_compra_animais,
-- partes 2/3 e 3/3 -- ver criar_lancamento_rateado_proporcional, ja existente
-- desde o Bloco D4, reaproveitada sem mudanca).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.transacoes_animais
  ADD COLUMN IF NOT EXISTS frete numeric(10,2) DEFAULT 0;

SELECT 'coluna transacoes_animais.frete criada!' as resultado;
