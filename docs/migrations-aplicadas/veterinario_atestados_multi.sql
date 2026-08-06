-- ================================================================
-- Modulo Veterinario - atestados com N animais + arquitetura extensivel
-- por tipo (prenhez, brucelose, andrologico, vacinacao_brucelose, e
-- futuros sem precisar de migracao nova).
--
-- Existem hoje 2 atestados gravados (confirmado via SELECT COUNT(*) antes
-- desta migracao) - o backfill abaixo preserva os 2, migrando brinco/
-- descricao_animal de cada um para 1 linha filha (ordem 1).
--
-- Script inteiro dentro de UMA transacao: se qualquer passo falhar no meio
-- (ex: backfill encontrar dado inesperado), nada fica aplicado - Postgres
-- reverte tudo, nunca deixa coluna renomeada sem o backfill correspondente
-- ou vice-versa.
--
-- Idempotente: pode ser rodado de novo com seguranca (toda etapa guarda
-- por IF NOT EXISTS/IF EXISTS ou checagem em information_schema/pg_policies
-- antes de agir).
-- ================================================================

BEGIN;

-- ── 1) Tabela filha: N animais por atestado ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.veterinario_atestado_animais (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id          uuid        NOT NULL REFERENCES public.contas(id),
  atestado_id       uuid        NOT NULL REFERENCES public.veterinario_atestados(id) ON DELETE CASCADE,
  ordem             int         NOT NULL DEFAULT 1,
  brinco            text,
  descricao_animal  text,
  dados             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veterinario_atestado_animais_atestado ON public.veterinario_atestado_animais(atestado_id);
CREATE INDEX IF NOT EXISTS idx_veterinario_atestado_animais_conta    ON public.veterinario_atestado_animais(conta_id);

-- ── 2) RLS da tabela nova - mesmo padrao das demais do modulo ────────────
ALTER TABLE public.veterinario_atestado_animais ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestado_animais' AND policyname = 'veterinario_atestado_animais_select'
  ) THEN
    CREATE POLICY "veterinario_atestado_animais_select" ON public.veterinario_atestado_animais
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestado_animais' AND policyname = 'veterinario_atestado_animais_insert'
  ) THEN
    CREATE POLICY "veterinario_atestado_animais_insert" ON public.veterinario_atestado_animais
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestado_animais' AND policyname = 'veterinario_atestado_animais_update'
  ) THEN
    CREATE POLICY "veterinario_atestado_animais_update" ON public.veterinario_atestado_animais
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestado_animais' AND policyname = 'veterinario_atestado_animais_delete'
  ) THEN
    CREATE POLICY "veterinario_atestado_animais_delete" ON public.veterinario_atestado_animais
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ── 3) Renomeia data_diagnostico/local_diagnostico -> data_evento/local_evento ──
-- Nome generico: vacinacao nao e diagnostico. Guardado por checagem em
-- information_schema (idempotente - se ja foi renomeado numa rodada
-- anterior deste script, pula sem erro).
DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'veterinario_atestados' AND column_name = 'data_diagnostico'
  ) THEN
    ALTER TABLE public.veterinario_atestados RENAME COLUMN data_diagnostico TO data_evento;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'veterinario_atestados' AND column_name = 'local_diagnostico'
  ) THEN
    ALTER TABLE public.veterinario_atestados RENAME COLUMN local_diagnostico TO local_evento;
  END IF;
END $fn$;

-- ── 4) Campo especifico do tipo, a nivel de DOCUMENTO (ex: dados da vacina) ──
ALTER TABLE public.veterinario_atestados ADD COLUMN IF NOT EXISTS dados_documento jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 5) Backfill dos atestados existentes para a tabela filha, DEPOIS ──
-- remove brinco/descricao_animal do pai - nessa ordem, dentro do mesmo
-- bloco, pra nunca dropar a coluna sem ter copiado o dado antes. Guardado
-- pela existencia da coluna 'brinco' no pai (idempotente - numa segunda
-- rodada a coluna ja nao existe mais, o bloco inteiro e pulado).
DO $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'veterinario_atestados' AND column_name = 'brinco'
  ) THEN
    INSERT INTO public.veterinario_atestado_animais (conta_id, atestado_id, ordem, brinco, descricao_animal)
    SELECT a.conta_id, a.id, 1, a.brinco, a.descricao_animal
    FROM public.veterinario_atestados a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.veterinario_atestado_animais x WHERE x.atestado_id = a.id
    );

    ALTER TABLE public.veterinario_atestados DROP COLUMN brinco;
    ALTER TABLE public.veterinario_atestados DROP COLUMN descricao_animal;
  END IF;
END $fn$;

-- ── 6) Amplia o CHECK de tipo para os 2 tipos novos ───────────────────────
ALTER TABLE public.veterinario_atestados DROP CONSTRAINT IF EXISTS veterinario_atestados_tipo_check;

ALTER TABLE public.veterinario_atestados ADD CONSTRAINT veterinario_atestados_tipo_check
  CHECK (tipo IN ('prenhez', 'brucelose', 'andrologico', 'vacinacao_brucelose'));

-- ── 7) Verificacao - confira antes de considerar concluido ───────────────
SELECT
  (SELECT COUNT(*) FROM public.veterinario_atestados) AS total_atestados,
  (SELECT COUNT(*) FROM public.veterinario_atestado_animais) AS total_animais,
  (
    SELECT COUNT(*) FROM public.veterinario_atestados a
    WHERE NOT EXISTS (SELECT 1 FROM public.veterinario_atestado_animais x WHERE x.atestado_id = a.id)
  ) AS atestados_sem_nenhum_animal;

COMMIT;
