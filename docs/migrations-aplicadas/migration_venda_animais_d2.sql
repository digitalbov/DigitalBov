-- ================================================================
-- BLOCO D — Compra/Venda, ETAPA D2
-- Fonte única de dinheiro (lancamentos_financeiros) + fluxo de VENDA real.
-- Execute no Supabase SQL Editor. NÃO faz backfill: transações antigas ficam
-- com lancamento_id NULL e não entram em nenhum KPI (são dados de teste).
-- ================================================================

-- 1a) Ligação transacoes_animais -> lancamentos_financeiros ------------------
ALTER TABLE public.transacoes_animais
  ADD COLUMN IF NOT EXISTS lancamento_id uuid REFERENCES public.lancamentos_financeiros(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transac_lancamento ON public.transacoes_animais(lancamento_id);

-- 1b) Grupo do lançamento -----------------------------------------------------
-- 'Venda de Animais' JÁ existe em GRUPOS_REC (src/lib/helpers.js) e é o grupo
-- usado abaixo na RPC. Para a Compra (D3), o valor a usar em GRUPOS_DES será
-- 'Compra de Animais' — ainda não adicionado à lista (D3 implementa a compra).
-- `grupo` é TEXT livre (sem CHECK na tabela), então nenhuma migração de schema
-- é necessária para isso, só a constante no front-end quando D3 chegar.

-- ================================================================
-- 2) RPC SECURITY DEFINER — registra a venda atomicamente:
--    1. cria 1 lancamentos_financeiros (receita)
--    2. cria 1 transacoes_animais POR CATEGORIA vendida, todas apontando pro
--       mesmo lancamento_id
--    3. dá baixa (situacao='vendido', data_baixa=data da venda) nos animais
--       selecionados
-- Se qualquer passo falhar, a função inteira é revertida (é uma única
-- chamada/transação do Postgres) — sem necessidade de BEGIN/EXCEPTION manual.
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
  p_detalhes    jsonb,     -- [{categoria, quantidade, peso_medio, preco_kg, valor_total}, ...]
  p_animal_ids  uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lancamento_id uuid;
  v_item          jsonb;
  v_primeiro      boolean := true;
BEGIN
  IF NOT tem_acesso_fazenda(p_fazenda_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta fazenda';
  END IF;
  IF NOT pode_editar_modulo(p_conta_id, 'financeiro') THEN
    RAISE EXCEPTION 'Sem permissão para editar o módulo financeiro';
  END IF;
  IF p_detalhes IS NULL OR jsonb_array_length(p_detalhes) = 0 THEN
    RAISE EXCEPTION 'Nenhuma categoria informada';
  END IF;
  IF p_animal_ids IS NULL OR array_length(p_animal_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Nenhum animal selecionado';
  END IF;

  INSERT INTO public.lancamentos_financeiros (conta_id, fazenda_id, ciclo_id, data, tipo, grupo, descricao, valor)
  VALUES (p_conta_id, p_fazenda_id, p_ciclo_id, p_data, 'R', 'Venda de Animais', p_descricao, p_valor_total)
  RETURNING id INTO v_lancamento_id;

  -- Uma linha de transacoes_animais por categoria vendida. contraparte é
  -- repetida em todas (é a mesma venda); comissão/imposto (informativos, não
  -- entram no valor_total) ficam só na primeira linha pra não duplicar o total
  -- informado no modal quando a venda tem mais de uma categoria.
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
    );
    v_primeiro := false;
  END LOOP;

  UPDATE public.animais
  SET situacao = 'vendido', data_baixa = p_data, atualizado_em = now()
  WHERE id = ANY(p_animal_ids)
    AND conta_id = p_conta_id AND fazenda_id = p_fazenda_id AND situacao = 'ativo';

  RETURN v_lancamento_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_venda_animais(
  uuid, uuid, uuid, date, numeric, text, text, numeric, numeric, jsonb, uuid[]
) TO authenticated;

SELECT 'registrar_venda_animais criada com sucesso!' as resultado;
