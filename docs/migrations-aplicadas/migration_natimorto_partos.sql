-- ================================================================
-- FASE 10 -- Estacao de Monta como Ambiente Unico -- natimorto.
-- Coluna natimorto em partos: marca um parto como natimorto (bezerro
-- nascido morto), sem exigir cadastro de um animal "morto" so pra
-- representar isso -- ate esta coluna, um parto natimorto nao tinha como
-- ser registrado sem criar um animal fantasma. DEFAULT false preserva 100%
-- do historico existente (nenhum parto antigo passa a ser natimorto).
-- Coluna aplicada no banco; uso na interface ainda pendente (ver Fase 10 --
-- itens em aberto).
-- Texto exato aplicado diretamente no Supabase (fora deste arquivo).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.partos ADD COLUMN IF NOT EXISTS natimorto boolean NOT NULL DEFAULT false;

SELECT 'partos.natimorto criada!' as resultado;
