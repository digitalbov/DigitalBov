-- ================================================================
-- Correcao de excluir_fazenda — dois problemas, achados ao vivo depois
-- de rodar migration_touro_vinculo_id.sql (texto verbatim confirmado via
-- pg_get_functiondef antes desta correcao).
--
-- 1) touros_externos.fazenda_id referencia fazendas(id) sem ON DELETE, e
--    a funcao nao apagava touros_externos. O DELETE final em fazendas
--    passou a falhar (violacao de FK) sempre que a fazenda tivesse pelo
--    menos um touro externo — a migracao anterior quebrou a exclusao de
--    fazenda. Corrigido com um DELETE novo, logo depois de
--    lotes_inseminacao e antes de estacoes_monta (mesma regiao dos
--    outros DELETEs ligados a Gestao Reprodutiva).
--
-- 2) O bloco inteiro de DELETEs (entre o DISABLE e o ENABLE do trigger
--    trg_reverter_venda_ao_excluir_lancamento) nao tinha nenhuma
--    protecao contra excecao. Qualquer erro no meio do caminho — o do
--    item 1 incluso, mas nao so ele — pulava direto o ENABLE TRIGGER do
--    final, deixando esse trigger desabilitado PRA SEMPRE (silenciosamente,
--    ate alguem religar manualmente na mao). Mesmo padrao ja usado em
--    restaurar_backup_fazenda (docs/migrations-aplicadas/
--    restaurar_backup_fazenda.sql): bloco BEGIN/EXCEPTION em volta dos
--    DELETEs, que tenta reabilitar o trigger dentro de um bloco proprio
--    (protegido contra falhar de novo) e so depois repropaga o erro
--    original com RAISE — nunca mascara a excecao real por causa de uma
--    falha ao tentar reabilitar.
--
-- Nada além disso mudou: mesmas mensagens de erro, mesma ordem dos
-- outros DELETEs, mesmos nomes de variaveis (v_conta_id, v_papel).
-- Execute no SQL Editor do Supabase.
-- ================================================================

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
