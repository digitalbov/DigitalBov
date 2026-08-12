-- ================================================================
-- AVISOS DISPENSADOS NO LOGIN (Parte 3 aprovada) -- dispensa por CONTA,
-- por TIPO de aviso, por LOTE que motivou -- um lote novo nunca esta
-- nesta tabela, volta a avisar sozinho sem tocar em nada aqui.
-- Execute no SQL Editor do Supabase.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.avisos_dispensados (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id       uuid        NOT NULL,
  fazenda_id     uuid        NOT NULL REFERENCES public.fazendas(id),
  tipo_aviso     text        NOT NULL CHECK (tipo_aviso IN ('diagnostico_insem', 'diagnostico_natural', 'parto_pendente', 'desmame_pendente')),
  lote_id        uuid        NOT NULL REFERENCES public.lotes_inseminacao(id) ON DELETE CASCADE,
  dispensado_por uuid        REFERENCES auth.users(id),
  dispensado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_id, tipo_aviso, lote_id)
);

ALTER TABLE public.avisos_dispensados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acesso_total_autenticados" ON public.avisos_dispensados;

DO $pol$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'avisos_dispensados' AND policyname = 'avisos_dispensados_select'
  ) THEN
    CREATE POLICY "avisos_dispensados_select" ON public.avisos_dispensados
      FOR SELECT USING (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'avisos_dispensados' AND policyname = 'avisos_dispensados_insert'
  ) THEN
    CREATE POLICY "avisos_dispensados_insert" ON public.avisos_dispensados
      FOR INSERT WITH CHECK (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'avisos_dispensados' AND policyname = 'avisos_dispensados_delete'
  ) THEN
    CREATE POLICY "avisos_dispensados_delete" ON public.avisos_dispensados
      FOR DELETE USING (tem_acesso_fazenda(fazenda_id));
  END IF;
END $pol$;

CREATE INDEX IF NOT EXISTS idx_avisos_dispensados_conta_tipo ON public.avisos_dispensados(conta_id, tipo_aviso);

SELECT 'avisos_dispensados criada/atualizada com sucesso!' as resultado;
