-- ================================================================
-- Modulo Veterinario - Etapa 2, passo 1: TABELAS + INDICES + RLS.
-- Escopo: conta_id em tudo, NUNCA fazenda_id como coluna obrigatoria
-- (unica excecao: veterinario_clientes.fazenda_id, nullable, link
-- opcional pra fazenda de origem quando o cliente veio de uma fazenda
-- cadastrada - ON DELETE SET NULL, historico sobrevive a hard-delete
-- de fazenda).
--
-- RLS: mesmo padrao ja usado em simulacoes_transacoes/transacao_animais_itens
-- (leitura = so acesso; escrita = acesso E permissao do modulo), trocando
-- tem_acesso_fazenda(fazenda_id) por tem_acesso_conta(conta_id), confirmado
-- via pg_policies de 'fazendas' - tem_acesso_conta ja existe no banco.
-- pode_editar_modulo(conta_id, 'veterinario') idem, mesma funcao usada
-- pelos outros modulos, so troca o nome do modulo.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_config (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id       uuid        NOT NULL UNIQUE REFERENCES public.contas(id),
  nome           text,
  crv            text,
  slogan         text,
  telefone       text,
  email          text,
  banco          text,
  agencia        text,
  conta_bancaria text,
  pix            text,
  logo_url       text,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_categorias (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id    uuid        NOT NULL REFERENCES public.contas(id),
  nome        text        NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_veterinario_categorias_conta ON public.veterinario_categorias(conta_id);

-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_clientes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id      uuid        NOT NULL REFERENCES public.contas(id),
  fazenda_id    uuid        REFERENCES public.fazendas(id) ON DELETE SET NULL,
  nome          text        NOT NULL,
  telefone      text,
  observacao_1  text,
  observacao_2  text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veterinario_clientes_conta ON public.veterinario_clientes(conta_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_veterinario_clientes_fazenda
  ON public.veterinario_clientes(conta_id, fazenda_id)
  WHERE fazenda_id IS NOT NULL;

-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_ciclos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id    uuid        NOT NULL REFERENCES public.contas(id),
  nome        text        NOT NULL,
  inicio      date        NOT NULL,
  fim         date        NOT NULL,
  atual       boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_veterinario_ciclos_conta ON public.veterinario_ciclos(conta_id);

-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_lancamentos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id     uuid        NOT NULL REFERENCES public.contas(id),
  ciclo_id     uuid        NOT NULL REFERENCES public.veterinario_ciclos(id),
  cliente_id   uuid        REFERENCES public.veterinario_clientes(id) ON DELETE SET NULL,
  categoria_id uuid        REFERENCES public.veterinario_categorias(id) ON DELETE SET NULL,
  tipo         char(1)     NOT NULL CHECK (tipo IN ('R', 'D')),
  descricao    text,
  valor        numeric(12,2) NOT NULL,
  data         date        NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veterinario_lancamentos_conta     ON public.veterinario_lancamentos(conta_id);
CREATE INDEX IF NOT EXISTS idx_veterinario_lancamentos_ciclo     ON public.veterinario_lancamentos(conta_id, ciclo_id);
CREATE INDEX IF NOT EXISTS idx_veterinario_lancamentos_cliente   ON public.veterinario_lancamentos(conta_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_veterinario_lancamentos_categoria ON public.veterinario_lancamentos(conta_id, categoria_id);

-- ================================================================
-- Historico de atestados emitidos (prenhez/brucelose) - Item 10 aprovado.
-- Guarda copia dos dados digitados no modal na hora da emissao (inclusive
-- nome/CRV do veterinario), nunca uma referencia a veterinario_config -
-- mesmo principio do item 2: documento ja emitido nao muda retroativamente
-- se o cadastro do veterinario mudar depois. Serve pra tela de consulta e
-- pra reemitir sem redigitar.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.veterinario_atestados (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id           uuid        NOT NULL REFERENCES public.contas(id),
  tipo               text        NOT NULL CHECK (tipo IN ('prenhez', 'brucelose')),
  brinco             text,
  descricao_animal   text,
  data_diagnostico   date,
  local_diagnostico  text,
  proprietario_nome  text,
  veterinario_nome   text,
  veterinario_crv    text,
  criado_em          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veterinario_atestados_conta ON public.veterinario_atestados(conta_id, tipo);
CREATE INDEX IF NOT EXISTS idx_veterinario_atestados_data  ON public.veterinario_atestados(conta_id, criado_em);

-- ================================================================
-- RLS - veterinario_config
-- ================================================================

ALTER TABLE public.veterinario_config ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_config' AND policyname = 'veterinario_config_select'
  ) THEN
    CREATE POLICY "veterinario_config_select" ON public.veterinario_config
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_config' AND policyname = 'veterinario_config_insert'
  ) THEN
    CREATE POLICY "veterinario_config_insert" ON public.veterinario_config
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_config' AND policyname = 'veterinario_config_update'
  ) THEN
    CREATE POLICY "veterinario_config_update" ON public.veterinario_config
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_config' AND policyname = 'veterinario_config_delete'
  ) THEN
    CREATE POLICY "veterinario_config_delete" ON public.veterinario_config
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================
-- RLS - veterinario_categorias
-- ================================================================

ALTER TABLE public.veterinario_categorias ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_categorias' AND policyname = 'veterinario_categorias_select'
  ) THEN
    CREATE POLICY "veterinario_categorias_select" ON public.veterinario_categorias
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_categorias' AND policyname = 'veterinario_categorias_insert'
  ) THEN
    CREATE POLICY "veterinario_categorias_insert" ON public.veterinario_categorias
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_categorias' AND policyname = 'veterinario_categorias_update'
  ) THEN
    CREATE POLICY "veterinario_categorias_update" ON public.veterinario_categorias
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_categorias' AND policyname = 'veterinario_categorias_delete'
  ) THEN
    CREATE POLICY "veterinario_categorias_delete" ON public.veterinario_categorias
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================
-- RLS - veterinario_clientes
-- ================================================================

ALTER TABLE public.veterinario_clientes ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_clientes' AND policyname = 'veterinario_clientes_select'
  ) THEN
    CREATE POLICY "veterinario_clientes_select" ON public.veterinario_clientes
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_clientes' AND policyname = 'veterinario_clientes_insert'
  ) THEN
    CREATE POLICY "veterinario_clientes_insert" ON public.veterinario_clientes
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_clientes' AND policyname = 'veterinario_clientes_update'
  ) THEN
    CREATE POLICY "veterinario_clientes_update" ON public.veterinario_clientes
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_clientes' AND policyname = 'veterinario_clientes_delete'
  ) THEN
    CREATE POLICY "veterinario_clientes_delete" ON public.veterinario_clientes
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================
-- RLS - veterinario_ciclos
-- ================================================================

ALTER TABLE public.veterinario_ciclos ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_ciclos' AND policyname = 'veterinario_ciclos_select'
  ) THEN
    CREATE POLICY "veterinario_ciclos_select" ON public.veterinario_ciclos
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_ciclos' AND policyname = 'veterinario_ciclos_insert'
  ) THEN
    CREATE POLICY "veterinario_ciclos_insert" ON public.veterinario_ciclos
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_ciclos' AND policyname = 'veterinario_ciclos_update'
  ) THEN
    CREATE POLICY "veterinario_ciclos_update" ON public.veterinario_ciclos
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_ciclos' AND policyname = 'veterinario_ciclos_delete'
  ) THEN
    CREATE POLICY "veterinario_ciclos_delete" ON public.veterinario_ciclos
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================
-- RLS - veterinario_lancamentos
-- ================================================================

ALTER TABLE public.veterinario_lancamentos ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_lancamentos' AND policyname = 'veterinario_lancamentos_select'
  ) THEN
    CREATE POLICY "veterinario_lancamentos_select" ON public.veterinario_lancamentos
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_lancamentos' AND policyname = 'veterinario_lancamentos_insert'
  ) THEN
    CREATE POLICY "veterinario_lancamentos_insert" ON public.veterinario_lancamentos
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_lancamentos' AND policyname = 'veterinario_lancamentos_update'
  ) THEN
    CREATE POLICY "veterinario_lancamentos_update" ON public.veterinario_lancamentos
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_lancamentos' AND policyname = 'veterinario_lancamentos_delete'
  ) THEN
    CREATE POLICY "veterinario_lancamentos_delete" ON public.veterinario_lancamentos
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================
-- RLS - veterinario_atestados
-- ================================================================

ALTER TABLE public.veterinario_atestados ENABLE ROW LEVEL SECURITY;

DO $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestados' AND policyname = 'veterinario_atestados_select'
  ) THEN
    CREATE POLICY "veterinario_atestados_select" ON public.veterinario_atestados
      FOR SELECT USING (tem_acesso_conta(conta_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestados' AND policyname = 'veterinario_atestados_insert'
  ) THEN
    CREATE POLICY "veterinario_atestados_insert" ON public.veterinario_atestados
      FOR INSERT WITH CHECK (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestados' AND policyname = 'veterinario_atestados_update'
  ) THEN
    CREATE POLICY "veterinario_atestados_update" ON public.veterinario_atestados
      FOR UPDATE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'veterinario_atestados' AND policyname = 'veterinario_atestados_delete'
  ) THEN
    CREATE POLICY "veterinario_atestados_delete" ON public.veterinario_atestados
      FOR DELETE USING (tem_acesso_conta(conta_id) AND pode_editar_modulo(conta_id, 'veterinario'));
  END IF;
END $fn$;

-- ================================================================

SELECT 'modulo Veterinario: tabelas + indices + RLS criados com sucesso!' as resultado;
