-- ================================================================
-- Integra feiras/feira_participacoes (migration_feiras_premiacoes.sql) ao
-- backup: excluir_fazenda e restaurar_backup_fazenda. Texto verbatim das
-- duas funcoes reaproveitado das ultimas correcoes aplicadas nesta sessao
-- (migration_fix_excluir_fazenda.sql / migration_fix_restaurar_backup_
-- fazenda.sql) — nada alem das linhas de feiras/feira_participacoes foi
-- tocado: mesmas mensagens de erro, mesma ordem do resto, mesmos nomes de
-- variaveis. Import (importarBackup.js) e export (exportarBackup.js) ja
-- foram atualizados no mesmo padrao — esta migracao so fecha o lado do
-- banco, pra nunca repetir o esquecimento que ja quebrou excluir_fazenda
-- uma vez nesta sessao (touros_externos sem DELETE).
--
-- 1) excluir_fazenda — DELETE de feira_participacoes e feiras adicionados
--    logo apos sanidade_animais, antes de lote_touros (mesma regiao dos
--    outros DELETEs ligados a dados por animal). feira_participacoes antes
--    de feiras (FK), ambos antes de animais.
--
-- 2) restaurar_backup_fazenda:
--    - DELETE: feira_participacoes logo apos sanidade_animais; feiras logo
--      apos touros_externos — mesma posicao relativa do INSERT, so invertida
--      (documentado no arquivo original como "inverso exato de ORDEM_GENERICA").
--    - INSERT: feiras logo apos touros_externos, antes de animais; feira_
--      participacoes logo apos sanidade_animais, antes de estoque_itens —
--      mesma posicao usada em ORDEM_GENERICA (importarBackup.js).
--
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- ── PASSO 1: excluir_fazenda ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.excluir_fazenda(p_fazenda_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conta_id uuid;
  v_papel    text;
BEGIN
  SELECT conta_id INTO v_conta_id FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_conta_id IS NULL THEN
    RAISE EXCEPTION 'Fazenda nao encontrada';
  END IF;
  SELECT papel INTO v_papel FROM public.conta_membros WHERE conta_id = v_conta_id AND usuario_id = auth.uid();
  IF v_papel IS NULL OR v_papel NOT IN ('dono','admin') THEN
    RAISE EXCEPTION 'Sem permissao para excluir esta fazenda';
  END IF;
  BEGIN
    ALTER TABLE public.lancamentos_financeiros DISABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
    DELETE FROM public.lancamento_rateios       WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.transacao_animais_itens  WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.sanidade_animais         WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.feira_participacoes      WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.feiras                   WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.lote_touros              WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.abortos                  WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.pesagens                 WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.inseminacoes             WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.partos                   WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.transacoes_animais       WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.lotes_inseminacao        WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.touros_externos          WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.estacoes_monta           WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.animais                  WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.estoque_movimentacoes    WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.procedimentos_sanitarios WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.estoque_itens            WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.simulacoes_transacoes    WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.lancamentos_financeiros  WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.categorias_preco         WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.metas                    WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.planejamento_acoes       WHERE planejamento_id IN (SELECT id FROM public.planejamentos WHERE fazenda_id = p_fazenda_id);
    DELETE FROM public.planejamentos            WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.benchmarks_rentabilidade WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.ciclos_financeiros       WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.piquetes                 WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.lotes                    WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.proprietarios            WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.usuario_permissoes       WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.usuario_fazendas         WHERE fazenda_id = p_fazenda_id;
    DELETE FROM public.fazendas                 WHERE id = p_fazenda_id;
    ALTER TABLE public.lancamentos_financeiros ENABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      ALTER TABLE public.lancamentos_financeiros ENABLE TRIGGER trg_reverter_venda_ao_excluir_lancamento;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE;
  END;
END;
$function$
;

-- ── PASSO 2: restaurar_backup_fazenda ────────────────────────────

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
    DELETE FROM public.feira_participacoes WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
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
    DELETE FROM public.feiras WHERE fazenda_id = p_fazenda_id AND conta_id = v_conta_id;
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
    INSERT INTO public.feiras SELECT * FROM jsonb_populate_recordset(NULL::public.feiras, v_dados->'feiras');
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
    INSERT INTO public.feira_participacoes SELECT * FROM jsonb_populate_recordset(NULL::public.feira_participacoes, v_dados->'feira_participacoes');
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

SELECT 'excluir_fazenda e restaurar_backup_fazenda atualizadas com feiras/feira_participacoes com sucesso!' as resultado;
