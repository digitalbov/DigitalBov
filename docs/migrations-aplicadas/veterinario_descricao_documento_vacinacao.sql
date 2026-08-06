-- ================================================================
-- Mesma migracao de veterinario_descricao_documento.sql, agora para
-- vacinacao_brucelose (decisao: terneiras vacinadas sao lote homogeneo,
-- descricao unica no documento, igual prenhez/brucelose). Roda sem efeito
-- se ainda nao existir nenhum atestado desse tipo gravado.
--
-- Idempotente: a segunda UPDATE so acha linha pra mexer na primeira vez.
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
  AND a.tipo = 'vacinacao_brucelose';

UPDATE public.veterinario_atestado_animais x
SET descricao_animal = NULL
FROM public.veterinario_atestados a
WHERE a.id = x.atestado_id
  AND a.tipo = 'vacinacao_brucelose'
  AND x.descricao_animal IS NOT NULL;

-- ── Verificacao ────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.veterinario_atestados WHERE tipo = 'vacinacao_brucelose') AS total_vacinacao_brucelose,
  (SELECT COUNT(*) FROM public.veterinario_atestados WHERE tipo = 'vacinacao_brucelose' AND dados_documento ? 'descricao') AS com_descricao_no_documento,
  (
    SELECT COUNT(*) FROM public.veterinario_atestado_animais x
    JOIN public.veterinario_atestados a ON a.id = x.atestado_id
    WHERE a.tipo = 'vacinacao_brucelose' AND x.descricao_animal IS NOT NULL
  ) AS animais_com_descricao_residual;

COMMIT;
