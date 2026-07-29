-- ================================================================
-- BLOCO D13 -- Calendario de vacinacao (Fase 7) -- Parte 1/2
-- Coluna status em procedimentos_sanitarios: distingue agendamento (data
-- futura, ainda nao concluido pelo usuario) de procedimento REALIZADO.
-- DEFAULT 'realizado' preserva 100% do historico existente sem migracao de
-- dados -- nenhuma linha antiga muda de sentido. Enquanto status='agendado':
-- nao aparece em Registros, na ficha do animal, em Alertas de reaplicacao,
-- em Historico, nos indicadores de Relatorios nem no Assistente IA -- so na
-- aba Calendario de vacinacao (Sanidade.jsx) e no modulo Calendario, ate o
-- usuario confirmar via "Marcar como concluido" (ver
-- pesagensParaGmd/sanidadeRealizada/sanidadeAgendada em helpers.js).
-- Aplicada diretamente no Supabase (fora deste arquivo) -- ver
-- docs/migrations-aplicadas/README.md sobre divergencia entre este repo e o
-- schema real; confira a definicao exata (incluindo o CHECK) no banco ao
-- vivo antes de reaplicar em outro ambiente.
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.procedimentos_sanitarios ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'realizado' CHECK (status IN ('realizado','agendado'));

SELECT 'procedimentos_sanitarios.status criada!' as resultado;
