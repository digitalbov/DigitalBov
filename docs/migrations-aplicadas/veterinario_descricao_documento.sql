-- ================================================================
-- Move a descricao de prenhez/brucelose do nivel ANIMAL para o nivel
-- DOCUMENTO (dados_documento.descricao) - so para tipo IN ('prenhez',
-- 'brucelose'). andrologico/vacinacao_brucelose NAO sao tocados: a
-- descricao continua por animal nesses dois.
--
-- Idempotente: a segunda UPDATE so acha linha pra mexer na primeira vez
-- (descricao_animal ainda nao nulo) - rodar de novo nao faz nada.
-- ================================================================

BEGIN;

UPDATE public.veterinario_atestados a
SET dados_documento = a.dados_documento || jsonb_build_object('descricao', x.descricao_animal)
FROM (
  SELECT DISTINCT ON (atestado_id) atestado_id, descricao_animal
  FROM public.veterinario_atestado_animais
  WHERE descricao_animal IS NOT NULL AND descricao_animal <> ''
  ORDER BY atestado_id, ordem
) x
WHERE a.id = x.atestado_id
  AND a.tipo IN ('prenhez', 'brucelose');

UPDATE public.veterinario_atestado_animais x
SET descricao_animal = NULL
FROM public.veterinario_atestados a
WHERE a.id = x.atestado_id
  AND a.tipo IN ('prenhez', 'brucelose')
  AND x.descricao_animal IS NOT NULL;

-- ── Verificacao ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.veterinario_atestados WHERE tipo IN ('prenhez', 'brucelose')) AS total_prenhez_brucelose,
  (SELECT COUNT(*) FROM public.veterinario_atestados WHERE tipo IN ('prenhez', 'brucelose') AND dados_documento ? 'descricao') AS com_descricao_no_documento,
  (
    SELECT COUNT(*) FROM public.veterinario_atestado_animais x
    JOIN public.veterinario_atestados a ON a.id = x.atestado_id
    WHERE a.tipo IN ('prenhez', 'brucelose') AND x.descricao_animal IS NOT NULL
  ) AS animais_com_descricao_residual;

COMMIT;
