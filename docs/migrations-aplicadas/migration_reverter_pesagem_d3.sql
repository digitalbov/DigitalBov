-- ================================================================
-- BLOCO D3 — ajusta o guard de pesagem na reversao da compra.
-- Parte 4/4 — nova versao de reverter_venda_ao_excluir_lancamento. O trigger
-- em si nao muda, so a funcao. Unica diferenca desta versao pra anterior
-- (migration_reverter_compra_d3.sql): o guard de pesagem agora ignora a
-- propria pesagem de entrada da compra sendo revertida (senao bloquearia
-- SEMPRE, ja que toda compra passou a criar 1 pesagem). Pesagens de
-- entrada/saida somem sozinhas por CASCADE quando transacoes_animais e
-- apagada (pesagens.transacao_id -> transacoes_animais.id ON DELETE CASCADE),
-- entao nao precisa de nenhum DELETE FROM pesagens explicito aqui.
-- Pre-requisito: migration_pesagem_transacao_d3.sql ja aplicada.
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
  -- ── Reversao de VENDA (tipo='V') — sem mudanca ─────────────────────────
  -- Reativa so os animais que ainda estao 'vendido' hoje — se um animal ja
  -- foi revendido ou morreu depois, nao mexe nele. A pesagem de saida desta
  -- venda cai sozinha por CASCADE quando a transacao abaixo e apagada.
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

  -- ── Reversao de COMPRA (tipo='C') ───────────────────────────────────────
  -- So apaga os animais cadastrados por esta compra se NENHUM deles tiver
  -- movimento posterior: pesagem de MANEJO (nao a de entrada da propria
  -- compra), sanidade, evento reprodutivo, mudanca de situacao (ex: ja
  -- morreu) ou outra transacao (ex: ja foi vendido). Se algum tiver, aborta
  -- com uma mensagem dizendo qual animal impede — o RAISE EXCEPTION desfaz
  -- tambem a exclusao do proprio lancamento, entao nada fica pela metade.
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

      -- So bloqueia por pesagem de MANEJO — ignora a propria pesagem de
      -- entrada desta compra (transacao_id dela esta em v_transacao_ids_compra).
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

    -- Passou em todos os guards: apaga a transacao da compra primeiro (isso
    -- cascadeia transacao_animais_itens E a pesagem de entrada, ambas com
    -- ON DELETE CASCADE em transacao_id), so depois apaga os animais —
    -- nessa ordem porque transacao_animais_itens.animal_id referencia
    -- animais sem CASCADE (apagar animais antes quebraria essa FK).
    DELETE FROM public.transacoes_animais
    WHERE lancamento_id = OLD.id AND tipo = 'C';

    DELETE FROM public.animais WHERE id = ANY(v_animais_da_compra);
  END IF;

  -- ── Rateios (venda ou compra) ───────────────────────────────────────────
  DELETE FROM public.lancamento_rateios WHERE lancamento_id = OLD.id;

  RETURN OLD;
END;
$fn$;

SELECT 'reverter_venda_ao_excluir_lancamento atualizada (guard de pesagem ajustado)!' as resultado;
