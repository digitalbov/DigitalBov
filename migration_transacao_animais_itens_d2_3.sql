-- ================================================================
-- BLOCO D — Etapa D2.3 (FINAL — NAO EXECUTADO)
-- transacao_animais_itens (1 linha por animal da transacao) + nova versao de
-- registrar_venda_animais com rateio automatico por proprietario, proporcional
-- ao valor. Pre-requisito: ja ter rodado migration_venda_animais_d2.sql
-- (lancamento_id em transacoes_animais + a versao anterior da RPC).
-- Confirmado: 0 animais ativos sem proprietario_id (de 347) — sem caso orfao
-- hoje, mas a RPC abaixo tem um guard pra nunca deixar isso passar em silencio.
-- ================================================================

-- 1) Tabela de ligacao transacao -> animais individuais ----------------------
CREATE TABLE IF NOT EXISTS public.transacao_animais_itens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id        uuid        NOT NULL,
  fazenda_id      uuid        NOT NULL REFERENCES public.fazendas(id),
  transacao_id    uuid        NOT NULL REFERENCES public.transacoes_animais(id) ON DELETE CASCADE,
  animal_id       uuid        NOT NULL REFERENCES public.animais(id),
  categoria_venda text        NOT NULL,   -- categoria efetiva usada na precificacao (inclui override "Vaca Gorda")
  proprietario_id uuid        REFERENCES public.proprietarios(id), -- snapshot: dono do animal NO MOMENTO da venda
  peso_medio      numeric(8,2),
  preco_kg        numeric(8,2),
  valor           numeric(12,2),          -- valor deste animal especifico (peso_medio * preco_kg)
  criado_em       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transacao_animais_itens ENABLE ROW LEVEL SECURITY;

DO $pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transacao_animais_itens' AND policyname = 'transacao_animais_itens_select'
  ) THEN
    CREATE POLICY "transacao_animais_itens_select" ON public.transacao_animais_itens
      FOR SELECT USING (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transacao_animais_itens' AND policyname = 'transacao_animais_itens_insert'
  ) THEN
    CREATE POLICY "transacao_animais_itens_insert" ON public.transacao_animais_itens
      FOR INSERT WITH CHECK (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transacao_animais_itens' AND policyname = 'transacao_animais_itens_update'
  ) THEN
    CREATE POLICY "transacao_animais_itens_update" ON public.transacao_animais_itens
      FOR UPDATE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transacao_animais_itens' AND policyname = 'transacao_animais_itens_delete'
  ) THEN
    CREATE POLICY "transacao_animais_itens_delete" ON public.transacao_animais_itens
      FOR DELETE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;
END $pol$;

CREATE INDEX IF NOT EXISTS idx_transac_itens_transacao ON public.transacao_animais_itens(transacao_id);
CREATE INDEX IF NOT EXISTS idx_transac_itens_animal     ON public.transacao_animais_itens(animal_id);
CREATE INDEX IF NOT EXISTS idx_transac_itens_fazenda     ON public.transacao_animais_itens(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_transac_itens_prop        ON public.transacao_animais_itens(proprietario_id);

-- ================================================================
-- 2) registrar_venda_animais — versao final:
--    1. valida acesso/permissao
--    2. GUARD: aborta se algum animal selecionado nao tiver proprietario_id
--       (rateio automatico exige dono conhecido em todo animal da venda)
--    3. cria o lancamento de receita (grupo 'Venda de Animais')
--    4. cria 1 transacoes_animais por categoria + 1 transacao_animais_itens
--       por animal (com proprietario_id snapshot)
--    5. calcula o rateio por proprietario PROPORCIONAL AO VALOR (soma do valor
--       dos animais de cada proprietario) e grava em lancamento_rateios —
--       arredondamento em centavos, com a sobra indo pro proprietario de maior
--       valor na venda, garantindo soma(rateios.valor) = lancamento.valor
--       exatamente
--    6. da baixa (situacao='vendido') nos animais
-- Uma unica chamada/transacao: erro em qualquer parte reverte tudo.
-- ================================================================
CREATE OR REPLACE FUNCTION public.registrar_venda_animais(
  p_conta_id    uuid,
  p_fazenda_id  uuid,
  p_ciclo_id    uuid,
  p_data        date,
  p_valor_total numeric,
  p_descricao   text,
  p_contraparte text,
  p_comissao    numeric,
  p_imposto     numeric,
  p_detalhes    jsonb,     -- [{categoria, quantidade, peso_medio, preco_kg, valor_total, animal_ids}, ...]
  p_animal_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lancamento_id     uuid;
  v_transacao_id      uuid;
  v_transacao_ids     uuid[] := ARRAY[]::uuid[];
  v_item              jsonb;
  v_animal_id         uuid;
  v_primeiro          boolean := true;
  v_brinco_sem_dono   text;
  v_total_centavos    bigint;
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
  IF p_animal_ids IS NULL OR array_length(p_animal_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum animal selecionado';
  END IF;

  -- GUARD: rateio automatico e proporcional ao valor de cada proprietario —
  -- sem dono conhecido em TODOS os animais, o rateio ficaria incompleto em
  -- silencio. Aborta a venda inteira e aponta o brinco do primeiro animal
  -- sem proprietario encontrado.
  SELECT brinco INTO v_brinco_sem_dono
  FROM public.animais
  WHERE id = ANY(p_animal_ids) AND proprietario_id IS NULL
  LIMIT 1;

  IF v_brinco_sem_dono IS NOT NULL THEN
    RAISE EXCEPTION 'Animal % nao tem proprietario cadastrado - rateio automatico exige proprietario em todos os animais da venda', v_brinco_sem_dono;
  END IF;

  INSERT INTO public.lancamentos_financeiros (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor)
  VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'R', 'Venda de Animais', p_descricao, p_valor_total)
  RETURNING id INTO v_lancamento_id;

  -- Uma linha de transacoes_animais por categoria vendida, e dentro dela uma
  -- linha de transacao_animais_itens por animal daquela categoria.
  -- contraparte e repetida em todas as categorias (e a mesma venda);
  -- comissao/imposto (informativos, nao entram no valor_total nem no rateio)
  -- ficam so na primeira categoria pra nao duplicar o total do modal.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    INSERT INTO public.transacoes_animais (
      conta_id, fazenda_id, ciclo_id, data, tipo, categoria, quantidade,
      peso_medio, preco_kg, valor_total, contraparte, comissao, imposto, lancamento_id
    ) VALUES (
      p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'V',
      v_item->>'categoria',
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

    FOR v_animal_id IN SELECT jsonb_array_elements_text(v_item->'animal_ids')::uuid
    LOOP
      INSERT INTO public.transacao_animais_itens (
        conta_id, fazenda_id, transacao_id, animal_id, categoria_venda,
        proprietario_id, peso_medio, preco_kg, valor
      )
      SELECT
        p_conta_id, p_fazenda_id, v_transacao_id, v_animal_id, v_item->>'categoria',
        a.proprietario_id,
        (v_item->>'peso_medio')::numeric,
        (v_item->>'preco_kg')::numeric,
        (v_item->>'peso_medio')::numeric * (v_item->>'preco_kg')::numeric
      FROM public.animais a WHERE a.id = v_animal_id;
    END LOOP;
  END LOOP;

  -- Rateio automatico proporcional ao valor, arredondado em centavos. A sobra
  -- (positiva ou negativa, sempre 1 centavo por causa de arredondamento) vai
  -- pro proprietario de maior valor na venda, via SUM(...) OVER () numa unica
  -- consulta — garante soma(valor) = p_valor_total exatamente, sem laco manual.
  v_total_centavos := round(p_valor_total * 100);

  INSERT INTO public.lancamento_rateios (conta_id, fazenda_id, lancamento_id, proprietario_id, valor, percentual)
  SELECT
    p_conta_id, p_fazenda_id, v_lancamento_id, proprietario_id,
    (centavos + ajuste) / 100.0 AS valor,
    round(valor_prop / p_valor_total * 100, 2) AS percentual
  FROM (
    SELECT
      proprietario_id,
      valor_prop,
      centavos,
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
      SELECT
        proprietario_id,
        SUM(valor) AS valor_prop,
        round(SUM(valor) * 100) AS centavos
      FROM public.transacao_animais_itens
      WHERE transacao_id = ANY(v_transacao_ids)
      GROUP BY proprietario_id
    ) agg
  ) final;

  UPDATE public.animais
  SET situacao = 'vendido', data_baixa = p_data, atualizado_em = now()
  WHERE id = ANY(p_animal_ids)
    AND conta_id = p_conta_id AND fazenda_id = p_fazenda_id AND situacao = 'ativo';

  RETURN v_lancamento_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_venda_animais(
  uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, jsonb, uuid[]
) TO authenticated;

SELECT 'transacao_animais_itens + registrar_venda_animais (com rateio automatico) prontos!' as resultado;
