-- ================================================================
-- BLOCO D3 — pesagem de entrada (compra) / saida (venda)
-- Parte 1/4 — coluna pesagens.transacao_id + indice + CHECK de tipo ampliado.
-- Execute no SQL Editor do Supabase.
-- ================================================================

ALTER TABLE public.pesagens
  ADD COLUMN IF NOT EXISTS transacao_id uuid REFERENCES public.transacoes_animais(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pesagens_transacao ON public.pesagens(transacao_id);

-- Nome padrao que o Postgres da a um CHECK inline sem nome explicito
-- (<tabela>_<coluna>_check) — e como a tabela foi criada no schema original.
-- Se o nome real no banco for outro (editado manualmente), o DROP IF EXISTS
-- nao falha, mas o ADD CONSTRAINT abaixo pode entrar em conflito com o
-- antigo — nesse caso me avise que investigamos o nome real.
ALTER TABLE public.pesagens DROP CONSTRAINT IF EXISTS pesagens_tipo_check;

ALTER TABLE public.pesagens ADD CONSTRAINT pesagens_tipo_check
  CHECK (tipo IN ('nascimento','desmama','sobreano','intermediaria','compra','venda'));

SELECT 'pesagens.transacao_id + CHECK ampliado prontos!' as resultado;
