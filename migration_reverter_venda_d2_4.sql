-- ================================================================
-- BLOCO D — Etapa D2.4 (NAO EXECUTADO)
-- Desfazer venda automaticamente ao excluir o lancamento (BEFORE DELETE em
-- lancamentos_financeiros), pra valer em qualquer caminho de exclusao —
-- inclusive delete manual no painel do Supabase, nao so pela UI.
-- Pre-requisito: migration_venda_animais_d2.sql e
-- migration_transacao_animais_itens_d2_3.sql ja aplicadas.
-- ================================================================

-- ================================================================
-- BLOCO 1 DE 2 — funcao do trigger
-- ================================================================
CREATE OR REPLACE FUNCTION public.reverter_venda_ao_excluir_lancamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Reativa so os animais que ainda estao 'vendido' hoje — se um animal ja
  -- foi revendido ou morreu depois desta venda, nao mexe nele.
  UPDATE public.animais a
  SET situacao = 'ativo', data_baixa = NULL, atualizado_em = now()
  WHERE a.situacao = 'vendido'
    AND a.id IN (
      SELECT tai.animal_id
      FROM public.transacao_animais_itens tai
      JOIN public.transacoes_animais ta ON ta.id = tai.transacao_id
      WHERE ta.lancamento_id = OLD.id AND ta.tipo = 'V'
    );

  -- Remove as transacoes_animais desta venda. Importante: a FK
  -- transacoes_animais.lancamento_id foi criada com ON DELETE SET NULL (ver
  -- migration_venda_animais_d2.sql) — sozinha ela so zeraria a coluna, nao
  -- apagaria a linha. Como este e um trigger BEFORE DELETE, o DELETE explicito
  -- abaixo roda antes dessa acao automatica da FK e remove a linha de fato;
  -- transacao_animais_itens cai junto via ON DELETE CASCADE (ja definida nela).
  DELETE FROM public.transacoes_animais
  WHERE lancamento_id = OLD.id AND tipo = 'V';

  -- Remove os rateios deste lancamento. Fica explicito aqui independente do
  -- ON DELETE da FK de lancamento_rateios.lancamento_id ser CASCADE ou nao —
  -- se ja for CASCADE isto e so redundante (0 linhas na hora do DELETE real);
  -- se nao for, evita ficarem orfaos.
  DELETE FROM public.lancamento_rateios
  WHERE lancamento_id = OLD.id;

  RETURN OLD;
END;
$fn$;

-- ================================================================
-- BLOCO 2 DE 2 — o trigger em si
-- ================================================================
DROP TRIGGER IF EXISTS trg_reverter_venda_ao_excluir_lancamento ON public.lancamentos_financeiros;

CREATE TRIGGER trg_reverter_venda_ao_excluir_lancamento
BEFORE DELETE ON public.lancamentos_financeiros
FOR EACH ROW
EXECUTE FUNCTION public.reverter_venda_ao_excluir_lancamento();

SELECT 'trigger reverter_venda_ao_excluir_lancamento pronto!' as resultado;
