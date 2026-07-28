-- ================================================================
-- SIMULACOES DE TRANSACOES (venda/compra) — Bloco D, etapa D3
-- Revisao final do SQL do D1 (nunca executado ate agora). Execute no SQL
-- Editor do Supabase. NAO afeta lancamentos, animais nem rateios — e so
-- consulta.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.simulacoes_transacoes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid        NOT NULL,
  fazenda_id    uuid        NOT NULL REFERENCES public.fazendas(id),
  ciclo_id      uuid        REFERENCES public.ciclos_financeiros(id),
  tipo          text        NOT NULL CHECK (tipo IN ('venda_sim', 'compra_sim')),
  data          date        NOT NULL,
  valor_total   numeric(12,2),
  detalhes      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  observacoes   text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.simulacoes_transacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acesso_total_autenticados" ON public.simulacoes_transacoes;

DO $pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'simulacoes_transacoes' AND policyname = 'simulacoes_transacoes_select'
  ) THEN
    CREATE POLICY "simulacoes_transacoes_select" ON public.simulacoes_transacoes
      FOR SELECT USING (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'simulacoes_transacoes' AND policyname = 'simulacoes_transacoes_insert'
  ) THEN
    CREATE POLICY "simulacoes_transacoes_insert" ON public.simulacoes_transacoes
      FOR INSERT WITH CHECK (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'simulacoes_transacoes' AND policyname = 'simulacoes_transacoes_update'
  ) THEN
    CREATE POLICY "simulacoes_transacoes_update" ON public.simulacoes_transacoes
      FOR UPDATE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'simulacoes_transacoes' AND policyname = 'simulacoes_transacoes_delete'
  ) THEN
    CREATE POLICY "simulacoes_transacoes_delete" ON public.simulacoes_transacoes
      FOR DELETE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'financeiro'));
  END IF;
END $pol$;

CREATE INDEX IF NOT EXISTS idx_simulacoes_fid   ON public.simulacoes_transacoes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_ciclo ON public.simulacoes_transacoes(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_simulacoes_tipo  ON public.simulacoes_transacoes(tipo);

SELECT 'simulacoes_transacoes criada/atualizada com sucesso!' as resultado;
