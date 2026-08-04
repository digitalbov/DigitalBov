-- ================================================================
-- Restauracao TOTAL de backup sobre fazenda existente (Bloco Restore).
-- Apaga todo o conteudo de UMA fazenda (25 tabelas, fazenda_id mantido) e
-- reinsere exatamente o que esta no arquivo de backup (formato_versao '2'),
-- preservando os ids originais. A propria linha de "fazendas" (nome,
-- localizacao, foto) NAO e tocada - so o conteudo das 25 tabelas.
--
-- Pre-requisito: rodar a query de confirmacao de dono ANTES deste bloco
-- (ver mensagem da sessao que gerou este arquivo) - se o dono de
-- lancamentos_financeiros nao for o mesmo usuario que roda este CREATE
-- FUNCTION, o ALTER TABLE DISABLE TRIGGER falha em runtime (seguro, mas a
-- restauracao nao funciona ate isso ser corrigido).
--
-- Trigger tratado: trg_reverter_venda_ao_excluir_lancamento (BEFORE DELETE
-- em lancamentos_financeiros) - e o UNICO trigger no banco (confirmado via
-- information_schema.triggers) que interfere num DELETE em massa: ele reativa
-- animal vendido e pode lancar RAISE EXCEPTION se um animal comprado tiver
-- pesagem/sanidade/evento reprodutivo registrado depois - o que bloquearia
-- a restauracao de qualquer fazenda com historico real. E desabilitado so
-- ao redor do DELETE desta tabela, dentro da mesma transacao da funcao -
-- se qualquer coisa falhar depois (em outro DELETE ou INSERT), o Postgres
-- reverte a transacao inteira, o que desfaz o DISABLE junto (DDL e
-- transacional). O ENABLE explicito no fim do bloco de DELETE, e o ENABLE
-- defensivo dentro do EXCEPTION (isolado em seu proprio BEGIN/EXCEPTION para
-- nunca mascarar o erro original), sao reforco - a garantia real e a
-- transacao unica.
--
-- Ordem de DELETE = inverso exato de ORDEM_GENERICA (src/lib/importarBackup.js).
-- Ordem de INSERT = ORDEM_GENERICA, sem alteracao - nao ha segunda lista.
--
-- lancamentos_financeiros tem auto-referencia (lancamento_origem_id) sem
-- profundidade conhecida - em vez de assumir 2 niveis, insere camada por
-- camada (raiz, filhos, netos...) ate nao sobrar nada; se sobrar algo apos o
-- laco, e referencia quebrada/circular e aborta.
--
-- IDs originais preservados: jsonb_populate_recordset(NULL::public.<tabela>,
-- ...) usa o tipo de linha real de cada tabela vindo do catalogo - nao
-- precisa (nem arrisca) listar nome de coluna nenhum a mao.
-- ================================================================

CREATE OR REPLACE FUNCTION public.restaurar_backup_fazenda(p_fazenda_id uuid, p_backup jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

SELECT 'restaurar_backup_fazenda criada!' as resultado;
