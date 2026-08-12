-- ================================================================
-- restaurar_backup_conta_veterinario -- restauracao DESTRUTIVA do backup
-- de CONTA do modulo Veterinario (P2 aprovado), clonando o mesmo padrao de
-- restaurar_backup_fazenda (verbatim ja fornecido pelo usuario):
--   - Identidade validada ANTES de qualquer DELETE: backup precisa ter
--     tipo='veterinario_conta' E conta.id = p_conta_id, senao aborta sem
--     tocar em nada. Restaurar backup de OUTRA conta por cima seria perda
--     total -- por isso a checagem vem logo no topo, antes do bloco
--     BEGIN...EXCEPTION que faz DELETE/INSERT.
--   - Permissao: so dono/admin da conta (mesmo padrao de
--     restaurar_backup_fazenda, nao pode_editar_modulo -- restaurar e mais
--     privilegiado que editar).
--   - Escopo por conta_id (as tabelas do modulo NAO tem fazenda_id de
--     escopo -- so veterinario_clientes.fazenda_id, que e um link
--     OPCIONAL/nullable pra fazenda de origem, nunca um filtro de escopo).
--   - DELETE filho antes de pai, INSERT pai antes de filho:
--       veterinario_atestado_animais -> veterinario_atestados ->
--       veterinario_lancamentos -> veterinario_ciclos ->
--       veterinario_clientes -> veterinario_categorias -> veterinario_config
--   - EXCEPTION WHEN OTHERS relanca sem alterar nada (nao ha trigger
--     nenhuma pra desabilitar/reabilitar neste modulo, ao contrario da
--     reversao de venda em lancamentos_financeiros).
--   - logo_url (Storage, bucket 'veterinario') NAO faz parte deste backup
--     -- mesmo motivo da foto da fazenda: e um binario fora do banco.
--     Restaurar aqui nunca traz a logo antiga de volta.
-- Execute no SQL Editor do Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION public.restaurar_backup_conta_veterinario(p_conta_id uuid, p_backup jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tipo text;
  v_formato text;
  v_backup_conta_id uuid;
  v_dados jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conta_membros WHERE conta_id = p_conta_id AND usuario_id = auth.uid() AND papel IN ('dono', 'admin')) THEN RAISE EXCEPTION 'Sem permissao de administrador nesta conta'; END IF;
  v_tipo := p_backup->>'tipo';
  IF v_tipo IS DISTINCT FROM 'veterinario_conta' THEN RAISE EXCEPTION 'Arquivo nao e um backup do modulo Veterinario'; END IF;
  v_formato := p_backup->>'formato_versao';
  IF v_formato IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Formato de backup nao reconhecido: %', COALESCE(v_formato, '(ausente)'); END IF;
  v_backup_conta_id := NULLIF(p_backup->'conta'->>'id', '')::uuid;
  IF v_backup_conta_id IS DISTINCT FROM p_conta_id THEN RAISE EXCEPTION 'Backup pertence a outra conta - restauracao abortada'; END IF;
  v_dados := p_backup->'dados';
  IF v_dados IS NULL THEN RAISE EXCEPTION 'Arquivo sem secao dados'; END IF;
  BEGIN
    DELETE FROM public.veterinario_atestado_animais WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_atestados WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_lancamentos WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_ciclos WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_clientes WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_categorias WHERE conta_id = p_conta_id;
    DELETE FROM public.veterinario_config WHERE conta_id = p_conta_id;
    INSERT INTO public.veterinario_config SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_config, v_dados->'veterinario_config');
    INSERT INTO public.veterinario_categorias SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_categorias, v_dados->'veterinario_categorias');
    INSERT INTO public.veterinario_clientes SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_clientes, v_dados->'veterinario_clientes');
    INSERT INTO public.veterinario_ciclos SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_ciclos, v_dados->'veterinario_ciclos');
    INSERT INTO public.veterinario_lancamentos SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_lancamentos, v_dados->'veterinario_lancamentos');
    INSERT INTO public.veterinario_atestados SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_atestados, v_dados->'veterinario_atestados');
    INSERT INTO public.veterinario_atestado_animais SELECT * FROM jsonb_populate_recordset(NULL::public.veterinario_atestado_animais, v_dados->'veterinario_atestado_animais');
  EXCEPTION WHEN OTHERS THEN
    RAISE;
  END;
  RETURN jsonb_build_object('sucesso', true, 'conta_id', p_conta_id, 'restaurado_em', now());
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.restaurar_backup_conta_veterinario(uuid, jsonb) TO authenticated;

SELECT 'restaurar_backup_conta_veterinario criada com sucesso!' as resultado;
