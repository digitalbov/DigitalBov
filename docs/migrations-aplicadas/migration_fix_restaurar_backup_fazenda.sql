-- ================================================================
-- Correcao de restaurar_backup_fazenda — dois problemas, achados ao
-- revisar o texto verbatim (via pg_get_functiondef) depois da migracao de
-- vinculo de touro por id.
--
-- 1) touros_externos nao entrava nem no DELETE em cascata nem no INSERT —
--    ficaria sem ser restaurada. DELETE adicionado logo apos animais
--    (espelho exato do INSERT, adicionado logo antes de animais: e assim
--    que a ordem de DELETE ja e documentada no arquivo original — "inverso
--    exato de ORDEM_GENERICA"). animais.pai_externo_id e lotes_inseminacao/
--    lote_touros.touro_externo_id todos com ON DELETE SET NULL, entao a
--    ordem exata do DELETE nao evita violacao de FK — mas mantida
--    simetrica ao INSERT de proposito, pra nunca divergir visualmente do
--    resto da funcao.
--
-- 2) INSERT INTO animais e um unico statement, e pai_animal_id e
--    AUTO-REFERENCIA (aponta pra outra linha da MESMA tabela sendo
--    inserida). Com a FK padrao (NOT DEFERRABLE), uma linha cujo "pai"
--    aparece DEPOIS dela no mesmo conjunto falha — e como a funcao inteira
--    e um bloco BEGIN/EXCEPTION so, isso aborta a restauracao completa (25+
--    tabelas), nao so animais. Resolvido tornando a constraint
--    DEFERRABLE INITIALLY DEFERRED: a checagem da FK passa a rodar no
--    COMMIT da transacao, quando todas as linhas de animais ja existem —
--    funciona pra qualquer profundidade de linhagem (touro cujo pai
--    tambem e touro cadastrado, avo, etc.), sem precisar ordenar nem
--    laçar o insert em camadas. Nao afeta nenhum insert de 1 linha por vez
--    do app (Reprodutivo.jsx) — ordem nunca foi o problema ali.
--
-- Nada alem disso mudou: mesmas mensagens de erro, mesma ordem de todo o
-- resto, mesmos nomes de variaveis.
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- ── PASSO 1: tornar animais.pai_animal_id DEFERRABLE ────────────────

DO $fn$
DECLARE v_constraint text;
BEGIN
  SELECT tc.constraint_name INTO v_constraint
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'animais' AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'pai_animal_id';
  IF v_constraint IS NULL THEN
    RAISE EXCEPTION 'Constraint de FK para animais.pai_animal_id nao encontrada';
  END IF;
  EXECUTE 'ALTER TABLE public.animais ALTER CONSTRAINT ' || quote_ident(v_constraint) || ' DEFERRABLE INITIALLY DEFERRED';
END $fn$;

-- ── PASSO 2: restaurar_backup_fazenda com touros_externos ───────────

CREATE OR REPLACE FUNCTION public.restaurar_backup_fazenda(p_fazenda_id uuid, p_backup jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_id uuid;
  v_backup_conta_id uuid;
  v_backup_fazenda_id uuid;
  v_formato text;
  v_dados jsonb;
  v_lanc_pendentes jsonb;
  v_lanc_pass jsonb;
  v_ids_prontos uuid[] := ARRAY[]::uuid[];
  v_qtd_pass int;
BEGIN
  SELECT conta_id INTO v_conta_id FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_conta_id IS NULL THEN RAISE EXCEPTION 'Fazenda alvo nao encontrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conta_membros WHERE conta_id = v_conta_id AND usuario_id = auth.uid() AND papel IN ('dono','admin')) THEN RAISE EXCEPTION 'Sem permissao de administrador nesta conta'; END IF;
  v_formato := p_backup->>'formato_versao';
  IF v_formato IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'Formato de backup nao reconhecido: %', COALESCE(v_formato, '(ausente)'); END IF;
  v_backup_conta_id := NULLIF(p_backup->'conta'->>'id', '')::uuid;
  v_backup_fazenda_id := NULLIF(p_backup->'fazenda'->>'id', '')::uuid;
  IF v_backup_conta_id IS DISTINCT FROM v_conta_id THEN RAISE EXCEPTION 'Backup pertence a outra conta - restauracao abortada'; END IF;
  IF v_backup_fazenda_id IS DISTINCT FROM p_fazenda_id THEN RAISE EXCEPTION 'Backup pertence a outra fazenda - restauracao abortada'; END IF;
  v_dados := p_backup->'dados';
  IF v_dados IS NULL THEN RAISE EXCEPTION 'Arquivo sem secao dados'; END IF;
  BEGIN
    DELETE FROM public.simulacoes_transacoes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.planejamento_acoes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.planejamentos WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.metas WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.estoque_movimentacoes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.estoque_itens WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.sanidade_animais WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.procedimentos_sanitarios WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.pesagens WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.transacao_animais_itens WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.transacoes_animais WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.lancamento_rateios WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    ALTER TABLE public.lancamentos_financeiros DISABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
    DELETE FROM public.lancamentos_financeiros WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    ALTER TABLE public.lancamentos_financeiros ENABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
    DELETE FROM public.abortos WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.partos WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.inseminacoes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.lote_touros WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.lotes_inseminacao WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.animais WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.touros_externos WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.estacoes_monta WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.categorias_preco WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.ciclos_financeiros WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.lotes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.piquetes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    DELETE FROM public.proprietarios WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
    INSERT INTO public.proprietarios SELECT * FROM jsonb_populate_recordset(NULL::public.proprietarios, v_dados->'proprietarios');
    INSERT INTO public.piquetes SELECT * FROM jsonb_populate_recordset(NULL::public.piquetes, v_dados->'piquetes');
    INSERT INTO public.lotes SELECT * FROM jsonb_populate_recordset(NULL::public.lotes, v_dados->'lotes');
    INSERT INTO public.ciclos_financeiros SELECT * FROM jsonb_populate_recordset(NULL::public.ciclos_financeiros, v_dados->'ciclos_financeiros');
    INSERT INTO public.categorias_preco SELECT * FROM jsonb_populate_recordset(NULL::public.categorias_preco, v_dados->'categorias_preco');
    INSERT INTO public.estacoes_monta SELECT * FROM jsonb_populate_recordset(NULL::public.estacoes_monta, v_dados->'estacoes_monta');
    INSERT INTO public.touros_externos SELECT * FROM jsonb_populate_recordset(NULL::public.touros_externos, v_dados->'touros_externos');
    INSERT INTO public.animais SELECT * FROM jsonb_populate_recordset(NULL::public.animais, v_dados->'animais');
    INSERT INTO public.lotes_inseminacao SELECT * FROM jsonb_populate_recordset(NULL::public.lotes_inseminacao, v_dados->'lotes_inseminacao');
    INSERT INTO public.lote_touros SELECT * FROM jsonb_populate_recordset(NULL::public.lote_touros, v_dados->'lote_touros');
    INSERT INTO public.inseminacoes SELECT * FROM jsonb_populate_recordset(NULL::public.inseminacoes, v_dados->'inseminacoes');
    INSERT INTO public.partos SELECT * FROM jsonb_populate_recordset(NULL::public.partos, v_dados->'partos');
    INSERT INTO public.abortos SELECT * FROM jsonb_populate_recordset(NULL::public.abortos, v_dados->'abortos');
    v_lanc_pendentes := v_dados->'lancamentos_financeiros';
    LOOP
      SELECT jsonb_agg(r), count(*) INTO v_lanc_pass, v_qtd_pass FROM jsonb_array_elements(COALESCE(v_lanc_pendentes, '[]'::jsonb)) r WHERE NULLIF(r->>'lancamento_origem_id', '') IS NULL OR (r->>'lancamento_origem_id')::uuid = ANY(v_ids_prontos);
      EXIT WHEN COALESCE(v_qtd_pass, 0) = 0;
      INSERT INTO public.lancamentos_financeiros SELECT * FROM jsonb_populate_recordset(NULL::public.lancamentos_financeiros, v_lanc_pass);
      SELECT v_ids_prontos || COALESCE(array_agg((r->>'id')::uuid), ARRAY[]::uuid[]) INTO v_ids_prontos FROM jsonb_array_elements(v_lanc_pass) r;
      SELECT jsonb_agg(r) INTO v_lanc_pendentes FROM jsonb_array_elements(COALESCE(v_lanc_pendentes, '[]'::jsonb)) r WHERE NOT ((r->>'id')::uuid = ANY(v_ids_prontos));
    END LOOP;
    IF v_lanc_pendentes IS NOT NULL AND jsonb_array_length(v_lanc_pendentes) > 0 THEN RAISE EXCEPTION 'lancamentos_financeiros com referencia orfa ou circular - restauracao abortada'; END IF;
    INSERT INTO public.lancamento_rateios SELECT * FROM jsonb_populate_recordset(NULL::public.lancamento_rateios, v_dados->'lancamento_rateios');
    INSERT INTO public.transacoes_animais SELECT * FROM jsonb_populate_recordset(NULL::public.transacoes_animais, v_dados->'transacoes_animais');
    INSERT INTO public.transacao_animais_itens SELECT * FROM jsonb_populate_recordset(NULL::public.transacao_animais_itens, v_dados->'transacao_animais_itens');
    INSERT INTO public.pesagens SELECT * FROM jsonb_populate_recordset(NULL::public.pesagens, v_dados->'pesagens');
    INSERT INTO public.procedimentos_sanitarios SELECT * FROM jsonb_populate_recordset(NULL::public.procedimentos_sanitarios, v_dados->'procedimentos_sanitarios');
    INSERT INTO public.sanidade_animais SELECT * FROM jsonb_populate_recordset(NULL::public.sanidade_animais, v_dados->'sanidade_animais');
    INSERT INTO public.estoque_itens SELECT * FROM jsonb_populate_recordset(NULL::public.estoque_itens, v_dados->'estoque_itens');
    INSERT INTO public.estoque_movimentacoes SELECT * FROM jsonb_populate_recordset(NULL::public.estoque_movimentacoes, v_dados->'estoque_movimentacoes');
    INSERT INTO public.metas SELECT * FROM jsonb_populate_recordset(NULL::public.metas, v_dados->'metas');
    INSERT INTO public.planejamentos SELECT * FROM jsonb_populate_recordset(NULL::public.planejamentos, v_dados->'planejamentos');
    INSERT INTO public.planejamento_acoes SELECT * FROM jsonb_populate_recordset(NULL::public.planejamento_acoes, v_dados->'planejamento_acoes');
    INSERT INTO public.simulacoes_transacoes SELECT * FROM jsonb_populate_recordset(NULL::public.simulacoes_transacoes, v_dados->'simulacoes_transacoes');
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      ALTER TABLE public.lancamentos_financeiros ENABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE;
  END;
  RETURN jsonb_build_object('sucesso', true, 'fazenda_id', p_fazenda_id, 'restaurado_em', now());
END;
$function$
;
