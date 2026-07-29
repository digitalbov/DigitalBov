-- ================================================================
-- FASE 10 -- Perda gestacional presumida -- animais.observacoes.
-- Coluna observacoes em animais: campo de texto livre pra notas do usuario
-- (aba "Anotacoes" na ficha do animal, Animais.jsx/salvarNotas) e pra notas
-- de auditoria automaticas (ex: confirmacao de perda gestacional presumida,
-- ver lib/perdaGestacionalPresumida.js).
--
-- ACHADO AO IMPLEMENTAR: o codigo de "Anotacoes" (salvarNotas, Animais.jsx)
-- ja gravava nesta coluna ha tempos, mas a coluna NUNCA EXISTIU em producao
-- -- bug pre-existente, silencioso (o update falhava, mas nada no fluxo
-- avisava o usuario de forma clara). Corrigido junto com a criacao desta
-- coluna: o campo "Anotacoes" passa a funcionar de verdade a partir de
-- agora, sem nenhuma mudanca de codigo alem desta migration.
--
-- DEFAULT '' preserva 100% do historico existente (nenhum animal antigo
-- fica com observacoes NULL -- sempre string vazia se nunca foi escrita).
-- Texto exato aplicado diretamente no Supabase (fora deste arquivo).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS observacoes text NOT NULL DEFAULT '';

SELECT 'animais.observacoes criada!' as resultado;
