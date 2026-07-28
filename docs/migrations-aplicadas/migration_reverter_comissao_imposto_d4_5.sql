-- ================================================================
-- BLOCO D4 — Comissao/imposto viram despesa automatica
-- Parte 5/5 — reverter_venda_ao_excluir_lancamento ganha 1 linha: ao excluir
-- o lancamento principal (venda ou compra), apaga tambem qualquer despesa
-- filha (Comissao/Impostos) vinculada via lancamento_origem_id. O trigger em
-- si (BEFORE DELETE, FOR EACH ROW) nao muda — so a funcao. Como e um DELETE
-- normal (nao FK CASCADE), ele dispara o MESMO trigger de novo pra cada linha
-- filha, que ja limpa os rateios dela sozinha (ultima linha da funcao) — sem
-- risco de recursao infinita, pois Comissao/Impostos nunca tem filhos.
-- Pre-requisito: partes 1/5 a 4/5 ja aplicadas.
-- ================================================================

CREATE OR REPLACE FUNCTION public.reverter_venda_ao_excluir_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_transacao_ids_compra uuid[];
  v_animais_da_compra    uuid[];
  v_animal               RECORD;
BEGIN
  -- ── NOVO: despesas automaticas de Comissao/Impostos vinculadas a este
  -- lancamento (venda ou compra) somem junto.
  DELETE FROM public.lancamentos_financeiros
  WHERE lancamento_origem_id = OLD.id;

  -- ── Reversao de VENDA (tipo='V') — sem mudanca ─────────────────────────
  UPDATE public.animais a
  SET situacao = 'ativo', data_baixa = NULL, atualizado_em = now()
  WHERE a.situacao = 'vendido'
    AND a.id IN (
      SELECT tai.animal_id
      FROM public.transacao_animais_itens tai
      JOIN public.transacoes_animais ta ON ta.id = tai.transacao_id
      WHERE ta.lancamento_id = OLD.id AND ta.tipo = 'V'
    );

  DELETE FROM public.transacoes_animais
  WHERE lancamento_id = OLD.id AND tipo = 'V';

  -- ── Reversao de COMPRA (tipo='C') — sem mudanca ─────────────────────────
  SELECT array_agg(id) INTO v_transacao_ids_compra
  FROM public.transacoes_animais
  WHERE lancamento_id = OLD.id AND tipo = 'C';

  IF v_transacao_ids_compra IS NOT NULL THEN
    SELECT array_agg(DISTINCT tai.animal_id) INTO v_animais_da_compra
    FROM public.transacao_animais_itens tai
    WHERE tai.transacao_id = ANY(v_transacao_ids_compra);

    FOR v_animal IN
      SELECT a.id, a.brinco, a.situacao
      FROM public.animais a
      WHERE a.id = ANY(v_animais_da_compra)
    LOOP
      IF v_animal.situacao <> 'ativo' THEN
        RAISE EXCEPTION 'Animal % nao pode ser removido - situacao ja foi alterada (%) desde a compra', v_animal.brinco, v_animal.situacao;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.pesagens
        WHERE animal_id = v_animal.id
          AND (transacao_id IS NULL OR transacao_id <> ALL(v_transacao_ids_compra))
      ) THEN
        RAISE EXCEPTION 'Animal % nao pode ser removido - tem pesagem de manejo registrada', v_animal.brinco;
      END IF;

      IF EXISTS (SELECT 1 FROM public.sanidade_animais WHERE animal_id = v_animal.id) THEN
        RAISE EXCEPTION 'Animal % nao pode ser removido - tem procedimento sanitario registrado', v_animal.brinco;
      END IF;

      IF EXISTS (SELECT 1 FROM public.inseminacoes WHERE animal_id = v_animal.id)
         OR EXISTS (SELECT 1 FROM public.partos WHERE mae_id = v_animal.id OR bezerro_id = v_animal.id)
         OR EXISTS (SELECT 1 FROM public.abortos WHERE animal_id = v_animal.id) THEN
        RAISE EXCEPTION 'Animal % nao pode ser removido - tem evento reprodutivo registrado', v_animal.brinco;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.transacao_animais_itens tai2
        WHERE tai2.animal_id = v_animal.id AND tai2.transacao_id <> ALL(v_transacao_ids_compra)
      ) THEN
        RAISE EXCEPTION 'Animal % nao pode ser removido - ja esta em outra transacao', v_animal.brinco;
      END IF;
    END LOOP;

    DELETE FROM public.transacoes_animais
    WHERE lancamento_id = OLD.id AND tipo = 'C';

    DELETE FROM public.animais WHERE id = ANY(v_animais_da_compra);
  END IF;

  -- ── Rateios (venda ou compra) ───────────────────────────────────────────
  DELETE FROM public.lancamento_rateios WHERE lancamento_id = OLD.id;

  RETURN OLD;
END;
$fn$;

SELECT 'reverter_venda_ao_excluir_lancamento atualizada (comissao/imposto inclusos)!' as resultado;
