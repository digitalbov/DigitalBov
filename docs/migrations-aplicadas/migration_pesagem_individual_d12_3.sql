-- ================================================================
-- BLOCO D12 -- Pesagem individual em compra/venda -- Parte 3/3
-- registrar_compra_animais: cada item de p_detalhes ganha um novo campo
-- opcional "pesos_individuais" (array paralelo de numeros/null, indexado por
-- POSICAO -- pesos_individuais[i] e o peso do i-esimo animal criado daquela
-- categoria; ausente ou null = usa peso_medio da categoria). Mesma validacao
-- e mesmo mecanismo de peso medio RESULTANTE da Parte 2/3 (venda).
-- Mesma ASSINATURA de antes (11 parametros) -- so o corpo muda.
-- Cada statement em 1 linha so. Sem CTE (WITH) antes de INSERT.
-- Pre-requisito: Parte 1/3 (coluna peso_individual) ja aplicada.
-- Execute no SQL Editor do Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION public.registrar_compra_animais(p_conta_id uuid, p_fazenda_id uuid, p_ciclo_id uuid, p_data date, p_valor_total numeric, p_descricao text, p_contraparte text, p_comissao numeric, p_imposto numeric, p_frete numeric, p_detalhes jsonb)
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
  v_peso_individual numeric;
  v_peso_resolvido  numeric;
  v_peso_total      numeric;
  v_total_centavos  bigint;
BEGIN
  IF NOT tem_acesso_fazenda(p_fazenda_id) THEN RAISE EXCEPTION 'Sem acesso a esta fazenda'; END IF;
  IF NOT pode_editar_modulo(p_conta_id, 'financeiro') THEN RAISE EXCEPTION 'Sem permissao para editar o modulo financeiro'; END IF;
  IF p_detalhes IS NULL OR jsonb_array_length(p_detalhes) = 0 THEN RAISE EXCEPTION 'Nenhuma categoria informada'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    IF v_item->>'proprietario_id' IS NULL OR v_item->>'proprietario_id' = '' THEN RAISE EXCEPTION 'Categoria % sem proprietario informado', v_item->>'categoria'; END IF;
    IF (v_item->>'data_nascimento_estimada')::date > p_data THEN RAISE EXCEPTION 'Categoria % tem data de nascimento estimada posterior a data da compra', v_item->>'categoria'; END IF;
  END LOOP;

  INSERT INTO public.lancamentos_financeiros (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor) VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Compra de Animais', p_descricao, p_valor_total) RETURNING id INTO v_lancamento_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    v_categoria       := v_item->>'categoria';
    v_proprietario_id := (v_item->>'proprietario_id')::uuid;
    v_data_nasc       := (v_item->>'data_nascimento_estimada')::date;

    v_sexo := CASE WHEN v_categoria IN ('Terneiro','Novilho 13-24m','Novilho 25-36m','Boi','Touro') THEN 'M' ELSE 'F' END;
    v_sit_reprodutiva := CASE WHEN v_sexo = 'M' THEN 'nao_se_aplica' WHEN v_categoria LIKE '%Prenha%' THEN 'prenha' ELSE 'vazia' END;
    v_is_touro := (v_categoria = 'Touro');

    INSERT INTO public.transacoes_animais (conta_id, fazenda_id, ciclo_id, data, tipo, categoria, quantidade, peso_medio, preco_kg, valor_total, contraparte, comissao, imposto, frete, lancamento_id) VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'C', v_categoria, (v_item->>'quantidade')::int, (v_item->>'peso_medio')::numeric, (v_item->>'preco_kg')::numeric, (v_item->>'valor_total')::numeric, p_contraparte, CASE WHEN v_primeiro THEN p_comissao ELSE 0 END, CASE WHEN v_primeiro THEN p_imposto ELSE 0 END, CASE WHEN v_primeiro THEN p_frete ELSE 0 END, v_lancamento_id) RETURNING id INTO v_transacao_id;
    v_primeiro := false;
    v_transacao_ids := array_append(v_transacao_ids, v_transacao_id);
    v_peso_total := 0;

    FOR v_i IN 1..(v_item->>'quantidade')::int
    LOOP
      v_brinco := 'PROV-' || lpad(nextval('public.provisorio_brinco_seq')::text, 4, '0');
      v_peso_individual := NULLIF(v_item->'pesos_individuais'->>(v_i-1), '')::numeric;
      IF v_peso_individual IS NOT NULL AND (v_peso_individual <= 0 OR v_peso_individual > 1500) THEN RAISE EXCEPTION 'Peso individual invalido na categoria % (posicao %)', v_categoria, v_i; END IF;
      v_peso_resolvido := COALESCE(v_peso_individual, (v_item->>'peso_medio')::numeric);
      v_peso_total := v_peso_total + v_peso_resolvido;

      INSERT INTO public.animais (conta_id, fazenda_id, brinco, sexo, data_nascimento, proprietario_id, situacao, sit_reprodutiva, is_touro) VALUES (p_conta_id, p_fazenda_id, v_brinco, v_sexo, v_data_nasc, v_proprietario_id, 'ativo', v_sit_reprodutiva, v_is_touro) RETURNING id INTO v_animal_id;

      INSERT INTO public.transacao_animais_itens (conta_id, fazenda_id, transacao_id, animal_id, categoria_venda, proprietario_id, peso_medio, preco_kg, valor) VALUES (p_conta_id, p_fazenda_id, v_transacao_id, v_animal_id, v_categoria, v_proprietario_id, v_peso_resolvido, (v_item->>'preco_kg')::numeric, v_peso_resolvido * (v_item->>'preco_kg')::numeric);

      INSERT INTO public.pesagens (conta_id, fazenda_id, animal_id, data, tipo, peso_kg, peso_individual, transacao_id) VALUES (p_conta_id, p_fazenda_id, v_animal_id, p_data, 'compra', v_peso_resolvido, (v_peso_individual IS NOT NULL), v_transacao_id);
    END LOOP;

    UPDATE public.transacoes_animais SET peso_medio = round(v_peso_total / NULLIF((v_item->>'quantidade')::int, 0), 2) WHERE id = v_transacao_id;
  END LOOP;

  v_total_centavos := round(p_valor_total * 100);

  INSERT INTO public.lancamento_rateios (conta_id, fazenda_id, lancamento_id, proprietario_id, valor, percentual) SELECT p_conta_id, p_fazenda_id, v_lancamento_id, proprietario_id, (centavos + ajuste) / 100.0 AS valor, round(valor_prop / p_valor_total * 100, 2) AS percentual FROM (SELECT proprietario_id, valor_prop, centavos, CASE WHEN proprietario_id = (SELECT proprietario_id FROM (SELECT proprietario_id, SUM(valor) AS vp FROM public.transacao_animais_itens WHERE transacao_id = ANY(v_transacao_ids) GROUP BY proprietario_id) ranking ORDER BY vp DESC LIMIT 1) THEN v_total_centavos - SUM(centavos) OVER () ELSE 0 END AS ajuste FROM (SELECT proprietario_id, SUM(valor) AS valor_prop, round(SUM(valor) * 100) AS centavos FROM public.transacao_animais_itens WHERE transacao_id = ANY(v_transacao_ids) GROUP BY proprietario_id) agg) final;

  IF p_comissao > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Comissão', 'Comissão sobre compra: ' || p_descricao, p_comissao, v_lancamento_id, v_transacao_ids); END IF;

  IF p_imposto > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Impostos', 'Imposto sobre compra: ' || p_descricao, p_imposto, v_lancamento_id, v_transacao_ids); END IF;

  IF p_frete > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Frete', 'Frete sobre compra: ' || p_descricao, p_frete, v_lancamento_id, v_transacao_ids); END IF;

  RETURN v_lancamento_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_compra_animais(uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, numeric, jsonb) TO authenticated;

SELECT 'registrar_compra_animais (peso individual) pronta!' as resultado;
