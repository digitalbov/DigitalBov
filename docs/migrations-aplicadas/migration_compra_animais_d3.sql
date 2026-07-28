-- ================================================================
-- BLOCO D3 — Compra real
-- Sequencia pra brinco provisorio + RPC registrar_compra_animais.
-- Pre-requisito: migration_venda_animais_d2.sql e
-- migration_transacao_animais_itens_d2_3.sql ja aplicadas.
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- Sequencia dedicada, global (nao por fazenda) — nextval() e atomico mesmo
-- sob concorrencia, entao dois cadastros simultaneos (em fazendas iguais ou
-- diferentes) NUNCA tiram o mesmo numero. Isso resolve o requisito de brinco
-- provisorio unico independente de "brinco" ser UNIQUE global ou por fazenda
-- no banco hoje (nao ha isso documentado em SQL versionado, foi criado
-- manualmente como outras colunas do projeto).
CREATE SEQUENCE IF NOT EXISTS public.provisorio_brinco_seq START 1;

CREATE OR REPLACE FUNCTION public.registrar_compra_animais(
  p_conta_id    uuid,
  p_fazenda_id  uuid,
  p_ciclo_id    uuid,
  p_data        date,
  p_valor_total numeric,
  p_descricao   text,
  p_contraparte text,
  p_comissao    numeric,
  p_imposto     numeric,
  p_detalhes    jsonb  -- [{categoria, quantidade, peso_medio, preco_kg, valor_total, proprietario_id, data_nascimento_estimada}, ...]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lancamento_id   uuid;
  v_transacao_id    uuid;
  v_transacao_ids   uuid[] := ARRAY[]::uuid[];
  v_item            jsonb;
  v_primeiro        boolean := true;
  v_i               int;
  v_brinco          text;
  v_animal_id       uuid;
  v_categoria       text;
  v_sexo            char(1);
  v_sit_reprodutiva text;
  v_is_touro        boolean;
  v_proprietario_id uuid;
  v_data_nasc       date;
  v_total_centavos  bigint;
BEGIN
  IF NOT tem_acesso_fazenda(p_fazenda_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta fazenda';
  END IF;
  IF NOT pode_editar_modulo(p_conta_id, 'financeiro') THEN
    RAISE EXCEPTION 'Sem permissao para editar o modulo financeiro';
  END IF;
  IF p_detalhes IS NULL OR jsonb_array_length(p_detalhes) = 0 THEN
    RAISE EXCEPTION 'Nenhuma categoria informada';
  END IF;

  -- Validacao antecipada: toda categoria precisa de proprietario (o rateio
  -- depende dele) - falha cedo em vez de cadastrar animais pela metade.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    IF v_item->>'proprietario_id' IS NULL OR v_item->>'proprietario_id' = '' THEN
      RAISE EXCEPTION 'Categoria % sem proprietario informado', v_item->>'categoria';
    END IF;
  END LOOP;

  INSERT INTO public.lancamentos_financeiros (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor)
  VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Compra de Animais', p_descricao, p_valor_total)
  RETURNING id INTO v_lancamento_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    v_categoria       := v_item->>'categoria';
    v_proprietario_id := (v_item->>'proprietario_id')::uuid;
    v_data_nasc       := (v_item->>'data_nascimento_estimada')::date;

    -- Sexo/situacao reprodutiva/is_touro derivados da categoria no proprio
    -- servidor (nunca confia no que o cliente mandaria) — a categoria e a
    -- unica fonte, mesma regra usada em calcCategoriaRebanho no front-end.
    v_sexo := CASE
      WHEN v_categoria IN ('Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro') THEN 'M'
      ELSE 'F'
    END;
    v_sit_reprodutiva := CASE
      WHEN v_sexo = 'M' THEN 'nao_se_aplica'
      WHEN v_categoria LIKE '%Prenha%' THEN 'prenha'
      ELSE 'vazia'
    END;
    v_is_touro := (v_categoria = 'Touro');

    INSERT INTO public.transacoes_animais (
      conta_id, fazenda_id, ciclo_id, data, tipo, categoria, quantidade,
      peso_medio, preco_kg, valor_total, contraparte, comissao, imposto, lancamento_id
    ) VALUES (
      p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'C',
      v_categoria,
      (v_item->>'quantidade')::int,
      (v_item->>'peso_medio')::numeric,
      (v_item->>'preco_kg')::numeric,
      (v_item->>'valor_total')::numeric,
      p_contraparte,
      CASE WHEN v_primeiro THEN p_comissao ELSE 0 END,
      CASE WHEN v_primeiro THEN p_imposto  ELSE 0 END,
      v_lancamento_id
    )
    RETURNING id INTO v_transacao_id;
    v_primeiro := false;
    v_transacao_ids := array_append(v_transacao_ids, v_transacao_id);

    FOR v_i IN 1..(v_item->>'quantidade')::int
    LOOP
      v_brinco := 'PROV-' || lpad(nextval('public.provisorio_brinco_seq')::text, 4, '0');

      INSERT INTO public.animais (
        conta_id, fazenda_id, brinco, sexo, data_nascimento, proprietario_id,
        situacao, sit_reprodutiva, is_touro
      ) VALUES (
        p_conta_id, p_fazenda_id, v_brinco, v_sexo, v_data_nasc, v_proprietario_id,
        'ativo', v_sit_reprodutiva, v_is_touro
      )
      RETURNING id INTO v_animal_id;

      INSERT INTO public.transacao_animais_itens (
        conta_id, fazenda_id, transacao_id, animal_id, categoria_venda,
        proprietario_id, peso_medio, preco_kg, valor
      ) VALUES (
        p_conta_id, p_fazenda_id, v_transacao_id, v_animal_id, v_categoria,
        v_proprietario_id,
        (v_item->>'peso_medio')::numeric,
        (v_item->>'preco_kg')::numeric,
        (v_item->>'peso_medio')::numeric * (v_item->>'preco_kg')::numeric
      );

      -- Pesagem de entrada: o peso medio da categoria vira a primeira pesagem
      -- real do animal (fonte unica de peso — nao ha coluna de peso em
      -- animais). transacao_id marca a origem e liga o CASCADE de exclusao;
      -- tipo='compra' e so gerado aqui, nunca pelo formulario manual.
      INSERT INTO public.pesagens (
        conta_id, fazenda_id, animal_id, data, tipo, peso_kg, transacao_id
      ) VALUES (
        p_conta_id, p_fazenda_id, v_animal_id, p_data, 'compra',
        (v_item->>'peso_medio')::numeric, v_transacao_id
      );
    END LOOP;
  END LOOP;

  -- Rateio automatico proporcional ao valor — mesma regra da venda: soma o
  -- valor dos animais de cada proprietario, arredonda em centavos, e a sobra
  -- do arredondamento vai pro proprietario de maior valor nesta compra.
  v_total_centavos := round(p_valor_total * 100);

  INSERT INTO public.lancamento_rateios (conta_id, fazenda_id, lancamento_id, proprietario_id, valor, percentual)
  SELECT
    p_conta_id, p_fazenda_id, v_lancamento_id, proprietario_id,
    (centavos + ajuste) / 100.0 AS valor,
    round(valor_prop / p_valor_total * 100, 2) AS percentual
  FROM (
    SELECT
      proprietario_id, valor_prop, centavos,
      CASE
        WHEN proprietario_id = (
          SELECT proprietario_id FROM (
            SELECT proprietario_id, SUM(valor) AS vp
            FROM public.transacao_animais_itens
            WHERE transacao_id = ANY(v_transacao_ids)
            GROUP BY proprietario_id
          ) ranking ORDER BY vp DESC LIMIT 1
        )
        THEN v_total_centavos - SUM(centavos) OVER ()
        ELSE 0
      END AS ajuste
    FROM (
      SELECT proprietario_id, SUM(valor) AS valor_prop, round(SUM(valor) * 100) AS centavos
      FROM public.transacao_animais_itens
      WHERE transacao_id = ANY(v_transacao_ids)
      GROUP BY proprietario_id
    ) agg
  ) final;

  RETURN v_lancamento_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_compra_animais(
  uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, jsonb
) TO authenticated;

SELECT 'registrar_compra_animais criada com sucesso!' as resultado;
