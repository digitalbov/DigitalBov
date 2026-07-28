-- ================================================================
-- BLOCO D4 — Comissao/imposto viram despesa automatica
-- Parte 2/5 — funcao auxiliar compartilhada por registrar_venda_animais e
-- registrar_compra_animais: cria 1 lancamento (Comissao ou Impostos) rateado
-- na MESMA proporcao de valor que cada proprietario ja tem na transacao de
-- origem (transacao_animais_itens.valor) — a mesma CTE de arredondamento em
-- centavos (sobra pro proprietario de maior valor) usada no rateio principal
-- da venda/compra, so extraida pra nao duplicar em 4 lugares.
-- ================================================================

CREATE OR REPLACE FUNCTION public.criar_lancamento_rateado_proporcional(
  p_conta_id             uuid,
  p_fazenda_id           uuid,
  p_ciclo_id             uuid,
  p_data                 date,
  p_tipo                 char(1),
  p_grupo                text,
  p_descricao            text,
  p_valor                numeric,
  p_lancamento_origem_id uuid,
  p_transacao_ids        uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lancamento_id  uuid;
  v_total_centavos bigint;
  v_valor_total_transacao numeric;
BEGIN
  INSERT INTO public.lancamentos_financeiros
    (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor, lancamento_origem_id)
  VALUES
    (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, p_tipo, p_grupo, p_descricao, p_valor, p_lancamento_origem_id)
  RETURNING id INTO v_lancamento_id;

  v_total_centavos := round(p_valor * 100);

  SELECT SUM(valor) INTO v_valor_total_transacao
  FROM public.transacao_animais_itens
  WHERE transacao_id = ANY(p_transacao_ids);

  INSERT INTO public.lancamento_rateios (conta_id, fazenda_id, lancamento_id, proprietario_id, valor, percentual)
  SELECT
    p_conta_id, p_fazenda_id, v_lancamento_id, proprietario_id,
    (centavos + ajuste) / 100.0 AS valor,
    round(valor_prop / v_valor_total_transacao * 100, 2) AS percentual
  FROM (
    SELECT
      proprietario_id, valor_prop, centavos,
      CASE
        WHEN proprietario_id = (
          SELECT proprietario_id FROM (
            SELECT proprietario_id, SUM(valor) AS vp
            FROM public.transacao_animais_itens
            WHERE transacao_id = ANY(p_transacao_ids)
            GROUP BY proprietario_id
          ) ranking ORDER BY vp DESC LIMIT 1
        )
        THEN v_total_centavos - SUM(centavos) OVER ()
        ELSE 0
      END AS ajuste
    FROM (
      SELECT proprietario_id, SUM(valor) AS valor_prop, round(SUM(valor) * 100) AS centavos
      FROM public.transacao_animais_itens
      WHERE transacao_id = ANY(p_transacao_ids)
      GROUP BY proprietario_id
    ) agg
  ) final;

  RETURN v_lancamento_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.criar_lancamento_rateado_proporcional(
  uuid, uuid, uuid, date, char(1), text, text, numeric, uuid, uuid[]
) TO authenticated;

SELECT 'criar_lancamento_rateado_proporcional pronta!' as resultado;
