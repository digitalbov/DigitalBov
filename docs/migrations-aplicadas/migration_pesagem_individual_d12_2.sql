-- ================================================================
-- BLOCO D12 -- Pesagem individual em compra/venda -- Parte 2/3
-- registrar_venda_animais: p_detalhes[].animal_ids muda de array de uuid
-- simples para array de {id, peso} (peso nulo = usa o peso_medio da
-- categoria, que continua existindo como fallback). Peso individual
-- validado: > 0 e <= 1500 kg. transacao_animais_itens.valor passa a ser
-- peso REAL de cada animal x preco_kg (nao mais o mesmo peso medio repetido
-- em toda linha da categoria) -- o rateio proporcional por proprietario
-- continua igual, so fica mais preciso. transacoes_animais.peso_medio passa
-- a gravar o peso medio RESULTANTE (soma dos pesos reais / quantidade), via
-- UPDATE apos o loop de animais de cada categoria. pesagens.peso_individual
-- marca true quando o peso daquele animal foi digitado, false quando veio do
-- peso medio da categoria.
-- Mesma ASSINATURA de antes (12 parametros) -- so o corpo muda.
-- Cada statement em 1 linha so. Sem CTE (WITH) antes de INSERT.
-- Pre-requisito: Parte 1/3 (coluna peso_individual) ja aplicada.
-- Execute no SQL Editor do Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION public.registrar_venda_animais(p_conta_id uuid, p_fazenda_id uuid, p_ciclo_id uuid, p_data date, p_valor_total numeric, p_descricao text, p_contraparte text, p_comissao numeric, p_imposto numeric, p_frete numeric, p_detalhes jsonb, p_animal_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lancamento_id      uuid;
  v_transacao_id       uuid;
  v_transacao_ids      uuid[] := ARRAY[]::uuid[];
  v_item               jsonb;
  v_animal_item        jsonb;
  v_animal_id          uuid;
  v_peso_individual    numeric;
  v_peso_resolvido     numeric;
  v_peso_total         numeric;
  v_primeiro           boolean := true;
  v_brinco_sem_dono    text;
  v_brinco_nasc_futuro text;
  v_total_centavos     bigint;
BEGIN
  IF NOT tem_acesso_fazenda(p_fazenda_id) THEN RAISE EXCEPTION 'Sem acesso a esta fazenda'; END IF;
  IF NOT pode_editar_modulo(p_conta_id, 'financeiro') THEN RAISE EXCEPTION 'Sem permissao para editar o modulo financeiro'; END IF;
  IF p_detalhes IS NULL OR jsonb_array_length(p_detalhes) = 0 THEN RAISE EXCEPTION 'Nenhuma categoria informada'; END IF;
  IF p_animal_ids IS NULL OR array_length(p_animal_ids, 1) IS NULL THEN RAISE EXCEPTION 'Nenhum animal selecionado'; END IF;

  SELECT brinco INTO v_brinco_sem_dono FROM public.animais WHERE id = ANY(p_animal_ids) AND proprietario_id IS NULL LIMIT 1;
  IF v_brinco_sem_dono IS NOT NULL THEN RAISE EXCEPTION 'Animal % nao tem proprietario cadastrado - rateio automatico exige proprietario em todos os animais da venda', v_brinco_sem_dono; END IF;

  SELECT brinco INTO v_brinco_nasc_futuro FROM public.animais WHERE id = ANY(p_animal_ids) AND data_nascimento > p_data LIMIT 1;
  IF v_brinco_nasc_futuro IS NOT NULL THEN RAISE EXCEPTION 'Animal % tem data de nascimento posterior a data da venda', v_brinco_nasc_futuro; END IF;

  INSERT INTO public.lancamentos_financeiros (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor) VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'R', 'Venda de Animais', p_descricao, p_valor_total) RETURNING id INTO v_lancamento_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalhes)
  LOOP
    INSERT INTO public.transacoes_animais (conta_id, fazenda_id, ciclo_id, data, tipo, categoria, quantidade, peso_medio, preco_kg, valor_total, contraparte, comissao, imposto, frete, lancamento_id) VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'V', v_item->>'categoria', (v_item->>'quantidade')::int, (v_item->>'peso_medio')::numeric, (v_item->>'preco_kg')::numeric, (v_item->>'valor_total')::numeric, p_contraparte, CASE WHEN v_primeiro THEN p_comissao ELSE 0 END, CASE WHEN v_primeiro THEN p_imposto ELSE 0 END, CASE WHEN v_primeiro THEN p_frete ELSE 0 END, v_lancamento_id) RETURNING id INTO v_transacao_id;
    v_primeiro := false;
    v_transacao_ids := array_append(v_transacao_ids, v_transacao_id);
    v_peso_total := 0;

    FOR v_animal_item IN SELECT * FROM jsonb_array_elements(v_item->'animal_ids')
    LOOP
      v_animal_id := (v_animal_item->>'id')::uuid;
      v_peso_individual := NULLIF(v_animal_item->>'peso', '')::numeric;
      IF v_peso_individual IS NOT NULL AND (v_peso_individual <= 0 OR v_peso_individual > 1500) THEN RAISE EXCEPTION 'Peso individual invalido para o animal %', v_animal_id; END IF;
      v_peso_resolvido := COALESCE(v_peso_individual, (v_item->>'peso_medio')::numeric);
      v_peso_total := v_peso_total + v_peso_resolvido;

      INSERT INTO public.transacao_animais_itens (conta_id, fazenda_id, transacao_id, animal_id, categoria_venda, proprietario_id, peso_medio, preco_kg, valor) SELECT p_conta_id, p_fazenda_id, v_transacao_id, v_animal_id, v_item->>'categoria', a.proprietario_id, v_peso_resolvido, (v_item->>'preco_kg')::numeric, v_peso_resolvido * (v_item->>'preco_kg')::numeric FROM public.animais a WHERE a.id = v_animal_id;

      INSERT INTO public.pesagens (conta_id, fazenda_id, animal_id, data, tipo, peso_kg, peso_individual, transacao_id) VALUES (p_conta_id, p_fazenda_id, v_animal_id, p_data, 'venda', v_peso_resolvido, (v_peso_individual IS NOT NULL), v_transacao_id);
    END LOOP;

    UPDATE public.transacoes_animais SET peso_medio = round(v_peso_total / NULLIF((v_item->>'quantidade')::int, 0), 2) WHERE id = v_transacao_id;
  END LOOP;

  v_total_centavos := round(p_valor_total * 100);

  INSERT INTO public.lancamento_rateios (conta_id, fazenda_id, lancamento_id, proprietario_id, valor, percentual) SELECT p_conta_id, p_fazenda_id, v_lancamento_id, proprietario_id, (centavos + ajuste) / 100.0 AS valor, round(valor_prop / p_valor_total * 100, 2) AS percentual FROM (SELECT proprietario_id, valor_prop, centavos, CASE WHEN proprietario_id = (SELECT proprietario_id FROM (SELECT proprietario_id, SUM(valor) AS vp FROM public.transacao_animais_itens WHERE transacao_id = ANY(v_transacao_ids) GROUP BY proprietario_id) ranking ORDER BY vp DESC LIMIT 1) THEN v_total_centavos - SUM(centavos) OVER () ELSE 0 END AS ajuste FROM (SELECT proprietario_id, SUM(valor) AS valor_prop, round(SUM(valor) * 100) AS centavos FROM public.transacao_animais_itens WHERE transacao_id = ANY(v_transacao_ids) GROUP BY proprietario_id) agg) final;

  IF p_comissao > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Comissão', 'Comissão sobre venda: ' || p_descricao, p_comissao, v_lancamento_id, v_transacao_ids); END IF;

  IF p_imposto > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Impostos', 'Imposto sobre venda: ' || p_descricao, p_imposto, v_lancamento_id, v_transacao_ids); END IF;

  IF p_frete > 0 THEN PERFORM public.criar_lancamento_rateado_proporcional(p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'D', 'Frete', 'Frete sobre venda: ' || p_descricao, p_frete, v_lancamento_id, v_transacao_ids); END IF;

  UPDATE public.animais SET situacao = 'vendido', data_baixa = p_data, atualizado_em = now() WHERE id = ANY(p_animal_ids) AND conta_id = p_conta_id AND fazenda_id = p_fazenda_id AND situacao = 'ativo';

  RETURN v_lancamento_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_venda_animais(uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, numeric, jsonb, uuid[]) TO authenticated;

SELECT 'registrar_venda_animais (peso individual) pronta!' as resultado;
