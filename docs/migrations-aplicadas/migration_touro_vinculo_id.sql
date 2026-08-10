-- ================================================================
-- Vinculo real de touro por ID (Gestao Reprodutiva).
-- Duas pontas, no mesmo pacote (fazer so metade daria aparencia de
-- confiabilidade sem ter):
--
-- 1) touros_externos: tabela LEVE (nao e cadastro de animal - sem brinco,
--    sem sexo, sem data_nascimento) para dar identidade estavel a touro
--    emprestado ou semen de IA. UNIQUE por fazenda em nome_normalizado
--    (maiusculas/sem acento/espacos colapsados, calculado no JavaScript
--    antes de gravar) - a normalizacao e a REGRA DE ENTRADA da tabela,
--    nao um calculo a parte: e assim que "Insano69"/"INSANO 69"/
--    "Insano 69 " viram o MESMO registro, sem depender da grafia.
--
-- 2) touro_animal_id / touro_externo_id em lotes_inseminacao e
--    lote_touros: dois campos MUTUAMENTE EXCLUSIVOS, cada um com FK real
--    (ON DELETE SET NULL - excluir o touro cadastrado ou o externo nunca
--    apaga o lote, so solta o vinculo). CHECK garante a exclusividade no
--    proprio banco, nao so na aplicacao.
--
-- 3) pai_animal_id / pai_externo_id em animais: mesma ideia, do lado do
--    bezerro - populados em salvarParto (Reprodutivo.jsx) a partir do
--    touro_animal_id/touro_externo_id do lote, so quando o lote tem
--    touro UNICO (paternidade indefinida em lote com varios touros
--    continua sem nenhum dos dois, igual hoje). O campo `pai` (texto)
--    NAO muda - continua existindo pra exibicao e pros casos sem vinculo.
--
-- MIGRACAO: nenhuma. Decisao do usuario - dados atuais sao de teste,
-- as colunas novas nascem NULL e so passam a valer para lotes/partos
-- salvos DAQUI PRA FRENTE, pelo seletor novo (proxima fase, ainda nao
-- implementada por este arquivo).
--
-- RLS/indices seguem exatamente o padrao ja aplicado ao modulo
-- Veterinario (docs/migrations-aplicadas/veterinario_schema.sql):
-- tem_acesso_conta(conta_id) pra leitura, tem_acesso_conta(conta_id) AND
-- pode_editar_modulo(conta_id, 'reprodutivo') pra escrita - as duas
-- funcoes ja existem no banco, reaproveitadas, nao redefinidas aqui.
--
-- NAO incluso nesta migracao (fica para a fase de implementacao, nao e
-- schema): exportarBackup.js/importarBackup.js (adicionar touros_externos
-- e as colunas novas na lista de tabelas/colunas do backup) e a RPC
-- restaurar_backup_fazenda (incluir touros_externos na ordem de
-- DELETE/INSERT). Nao alterei excluir_fazenda por nao ter a definicao
-- atual dela neste repositorio (drift ja conhecido) - avaliar separado.
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- ── PASSO 1: tabela touros_externos ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.touros_externos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid        NOT NULL REFERENCES public.contas(id),
  fazenda_id       uuid        NOT NULL REFERENCES public.fazendas(id),
  nome             text        NOT NULL,
  nome_normalizado text        NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_id, fazenda_id, nome_normalizado)
);

-- ── PASSO 2: RLS touros_externos (mesmo padrao do modulo Veterinario) ──

ALTER TABLE public.touros_externos ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'touros_externos' AND policyname = 'touros_externos_select'
  ) THEN
    CREATE POLICY "touros_externos_select" ON public.touros_externos
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'touros_externos' AND policyname = 'touros_externos_insert'
  ) THEN
    CREATE POLICY "touros_externos_insert" ON public.touros_externos
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'reprodutivo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'touros_externos' AND policyname = 'touros_externos_update'
  ) THEN
    CREATE POLICY "touros_externos_update" ON public.touros_externos
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'reprodutivo'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'touros_externos' AND policyname = 'touros_externos_delete'
  ) THEN
    CREATE POLICY "touros_externos_delete" ON public.touros_externos
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'reprodutivo'));
  END IF;
END $fn$;

-- ── PASSO 3: touro_animal_id / touro_externo_id em lotes_inseminacao ──

ALTER TABLE public.lotes_inseminacao ADD COLUMN IF NOT EXISTS touro_animal_id uuid REFERENCES public.animais(id) ON DELETE SET NULL;
ALTER TABLE public.lotes_inseminacao ADD COLUMN IF NOT EXISTS touro_externo_id uuid REFERENCES public.touros_externos(id) ON DELETE SET NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'lotes_inseminacao' AND constraint_name = 'lotes_inseminacao_touro_excl'
  ) THEN
    ALTER TABLE public.lotes_inseminacao ADD CONSTRAINT lotes_inseminacao_touro_excl
      CHECK (touro_animal_id IS NULL OR touro_externo_id IS NULL);
  END IF;
END $fn$;

CREATE INDEX IF NOT EXISTS idx_lotes_inseminacao_touro_animal  ON public.lotes_inseminacao(touro_animal_id);
CREATE INDEX IF NOT EXISTS idx_lotes_inseminacao_touro_externo ON public.lotes_inseminacao(touro_externo_id);

-- ── PASSO 4: touro_animal_id / touro_externo_id em lote_touros ──────

ALTER TABLE public.lote_touros ADD COLUMN IF NOT EXISTS touro_animal_id uuid REFERENCES public.animais(id) ON DELETE SET NULL;
ALTER TABLE public.lote_touros ADD COLUMN IF NOT EXISTS touro_externo_id uuid REFERENCES public.touros_externos(id) ON DELETE SET NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'lote_touros' AND constraint_name = 'lote_touros_touro_excl'
  ) THEN
    ALTER TABLE public.lote_touros ADD CONSTRAINT lote_touros_touro_excl
      CHECK (touro_animal_id IS NULL OR touro_externo_id IS NULL);
  END IF;
END $fn$;

CREATE INDEX IF NOT EXISTS idx_lote_touros_touro_animal  ON public.lote_touros(touro_animal_id);
CREATE INDEX IF NOT EXISTS idx_lote_touros_touro_externo ON public.lote_touros(touro_externo_id);

-- ── PASSO 5: pai_animal_id / pai_externo_id em animais ──────────────

ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS pai_animal_id uuid REFERENCES public.animais(id) ON DELETE SET NULL;
ALTER TABLE public.animais ADD COLUMN IF NOT EXISTS pai_externo_id uuid REFERENCES public.touros_externos(id) ON DELETE SET NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'animais' AND constraint_name = 'animais_pai_excl'
  ) THEN
    ALTER TABLE public.animais ADD CONSTRAINT animais_pai_excl
      CHECK (pai_animal_id IS NULL OR pai_externo_id IS NULL);
  END IF;
END $fn$;

CREATE INDEX IF NOT EXISTS idx_animais_pai_animal  ON public.animais(pai_animal_id);
CREATE INDEX IF NOT EXISTS idx_animais_pai_externo ON public.animais(pai_externo_id);

-- ── FIM ──────────────────────────────────────────────────────────

SELECT 'vinculo de touro por id: tabela + colunas + RLS criados com sucesso!' as resultado;
