-- ================================================================
-- Modulo Feiras e Premiacoes — Etapa 1: schema (tabelas + indices + RLS).
-- Nenhuma tela ainda — so esta migracao.
--
-- ESCOPO (ver plano): as duas tabelas sao POR FAZENDA (conta_id + fazenda_id
-- obrigatorios), nao por conta. Motivo registrado no plano em prosa: uma
-- feira "compartilhada" entre fazendas da mesma conta exigiria backup/
-- restauracao/exclusao de fazenda saberem tratar uma tabela SEM particao por
-- fazenda — e restaurar_backup_fazenda/excluir_fazenda sao 100% desenhadas
-- em torno de "apagar/reinserir a fatia de UMA fazenda" por tabela. Nao ha
-- fatia nenhuma pra uma tabela sem fazenda_id. Duplicar o cadastro da feira
-- por fazenda (custo real, mas pequeno) foi preferido a criar uma excecao
-- estrutural no mecanismo de backup logo depois de terminar de conserta-lo
-- nesta sessao.
--
-- RLS: mesmo padrao ja usado em tabelas por fazenda (migration_transacao_
-- animais_itens_d2_3.sql, migration_simulacoes_transacoes.sql) —
-- tem_acesso_fazenda(fazenda_id) pra leitura, tem_acesso_fazenda(fazenda_id)
-- AND pode_editar_modulo(conta_id, 'feiras') pra escrita. 'feiras' e modulo
-- NOVO (nao reaproveita 'animais') — mesma granularidade que reprodutivo/
-- sanidade/pesagens ja tem hoje, cada um com permissao independente; nao
-- precisa de nenhuma migracao de schema pra existir, so entrar na lista de
-- modulos configuraveis no codigo (Usuarios.jsx/Sidebar.jsx — fase de
-- implementacao, nao aqui).
--
-- nome_normalizado / find-or-create: MESMO mecanismo de touros_externos
-- (migration_touro_vinculo_id.sql) — normalizacao como regra de entrada,
-- UNIQUE por fazenda em nome_normalizado. Nao um segundo mecanismo.
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- ── PASSO 1: tabela feiras ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feiras (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id         uuid        NOT NULL REFERENCES public.contas(id),
  fazenda_id       uuid        NOT NULL REFERENCES public.fazendas(id),
  nome             text        NOT NULL,
  nome_normalizado text        NOT NULL,
  local            text,
  data_inicio      date,
  data_fim         date,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_id, fazenda_id, nome_normalizado)
);

CREATE INDEX IF NOT EXISTS idx_feiras_fazenda ON public.feiras(conta_id, fazenda_id);

-- ── PASSO 2: RLS feiras ──────────────────────────────────────────

ALTER TABLE public.feiras ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feiras' AND policyname = 'feiras_select'
  ) THEN
    CREATE POLICY "feiras_select" ON public.feiras
      FOR SELECT USING (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feiras' AND policyname = 'feiras_insert'
  ) THEN
    CREATE POLICY "feiras_insert" ON public.feiras
      FOR INSERT WITH CHECK (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feiras' AND policyname = 'feiras_update'
  ) THEN
    CREATE POLICY "feiras_update" ON public.feiras
      FOR UPDATE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feiras' AND policyname = 'feiras_delete'
  ) THEN
    CREATE POLICY "feiras_delete" ON public.feiras
      FOR DELETE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;
END $fn$;

-- ── PASSO 3: tabela feira_participacoes ──────────────────────────
-- Uma linha por (animal, feira) — agendamento e resultado sao a MESMA
-- linha em estados diferentes (ver plano, item 3): colocacao/titulo/
-- julgador/raca_associacao nascem NULL no agendamento e sao preenchidos
-- depois, quando o resultado sai. Nenhuma coluna de status: "agendada" x
-- "aguardando resultado" x "com resultado" e tudo DERIVADO (colocacao IS
-- NULL + datas da feira), nunca gravado.

CREATE TABLE IF NOT EXISTS public.feira_participacoes (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id             uuid        NOT NULL REFERENCES public.contas(id),
  fazenda_id           uuid        NOT NULL REFERENCES public.fazendas(id),
  feira_id             uuid        NOT NULL REFERENCES public.feiras(id) ON DELETE CASCADE,
  animal_id            uuid        NOT NULL REFERENCES public.animais(id) ON DELETE CASCADE,
  categoria_julgamento text,
  colocacao            text,
  titulo               text,
  julgador             text,
  raca_associacao      text,
  observacoes          text,
  criado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feira_participacoes_fazenda ON public.feira_participacoes(conta_id, fazenda_id);
CREATE INDEX IF NOT EXISTS idx_feira_participacoes_feira   ON public.feira_participacoes(feira_id);
CREATE INDEX IF NOT EXISTS idx_feira_participacoes_animal  ON public.feira_participacoes(animal_id);

-- ── PASSO 4: RLS feira_participacoes ─────────────────────────────

ALTER TABLE public.feira_participacoes ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feira_participacoes' AND policyname = 'feira_participacoes_select'
  ) THEN
    CREATE POLICY "feira_participacoes_select" ON public.feira_participacoes
      FOR SELECT USING (tem_acesso_fazenda(fazenda_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feira_participacoes' AND policyname = 'feira_participacoes_insert'
  ) THEN
    CREATE POLICY "feira_participacoes_insert" ON public.feira_participacoes
      FOR INSERT WITH CHECK (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feira_participacoes' AND policyname = 'feira_participacoes_update'
  ) THEN
    CREATE POLICY "feira_participacoes_update" ON public.feira_participacoes
      FOR UPDATE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'feira_participacoes' AND policyname = 'feira_participacoes_delete'
  ) THEN
    CREATE POLICY "feira_participacoes_delete" ON public.feira_participacoes
      FOR DELETE USING (tem_acesso_fazenda(fazenda_id) AND pode_editar_modulo(conta_id, 'feiras'));
  END IF;
END $fn$;

-- ── FIM ──────────────────────────────────────────────────────────
-- NAO alterei excluir_fazenda nem restaurar_backup_fazenda nesta migracao —
-- ambas exigem o texto verbatim (pg_get_functiondef) antes de qualquer
-- edicao, e essa e a Etapa 2 (depois desta rodar). Ver plano, item 6, pra
-- posicao exata onde as duas tabelas entram em cada uma.

SELECT 'modulo Feiras e Premiacoes: tabelas + indices + RLS criados com sucesso!' as resultado;
