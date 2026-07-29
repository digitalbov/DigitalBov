-- ================================================================
-- BLOCO D12 -- Pesagem individual em compra/venda -- Parte 1/3
-- Coluna peso_individual: true quando o peso da pesagem foi digitado pelo
-- usuario para aquele animal especifico (compra/venda), false quando herdado
-- do peso medio da categoria. Pesagens antigas ficam false pelo DEFAULT --
-- nenhum GMD historico muda (pesagensParaGmd so passa a incluir venda/compra
-- quando peso_individual=true).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.pesagens ADD COLUMN IF NOT EXISTS peso_individual boolean NOT NULL DEFAULT false;

SELECT 'pesagens.peso_individual criada!' as resultado;
