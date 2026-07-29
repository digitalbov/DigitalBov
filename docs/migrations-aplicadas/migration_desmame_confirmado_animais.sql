-- ================================================================
-- FASE 10 -- Estacao de Monta como Ambiente Unico -- desmame_confirmado.
-- Coluna desmame_confirmado em animais: nasceu para sustentar um fluxo de
-- desmame em duas etapas (registrar -> confirmar) que foi implementado e
-- depois simplificado de volta para um clique so, a pedido do usuario (ver
-- reprodutivoDesmame.js). A coluna ficou no banco, mas o app PAROU DE
-- ESCREVER NELA -- fica sempre no valor do DEFAULT (true), sem uso pratico
-- hoje. Nao foi dropada porque o usuario nao pediu; pode ser removida no
-- futuro sem risco, ja que nada le nem escreve nela.
-- DEFAULT true preserva 100% do historico existente (todo desmame ja
-- gravado antes desta coluna existir "nasce" confirmado/travado).
-- Texto exato aplicado diretamente no Supabase (fora deste arquivo).
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS desmame_confirmado boolean NOT NULL DEFAULT true;

SELECT 'animais.desmame_confirmado criada!' as resultado;
