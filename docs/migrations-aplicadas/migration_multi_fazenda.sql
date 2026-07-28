-- ================================================================
-- MIGRAÇÃO MULTI-FAZENDA — Ventos da Várzea
-- Execute no Supabase SQL Editor em PASSOS (1 a 16)
-- Se um passo falhar, corrija antes de prosseguir.
-- ================================================================

-- ── PASSO 1: Completar tabela fazendas ───────────────────────────
ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS ativo               boolean      NOT NULL DEFAULT true;
ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS onboarding_concluido boolean     NOT NULL DEFAULT false;
ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS criado_em           timestamptz  DEFAULT now();
ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS atualizado_em       timestamptz  DEFAULT now();

-- ── PASSO 2: Tabela de membros por fazenda ────────────────────────
CREATE TABLE IF NOT EXISTS fazenda_membros (
  fazenda_id  uuid REFERENCES fazendas(id) ON DELETE CASCADE,
  usuario_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  papel       text NOT NULL DEFAULT 'admin',
  PRIMARY KEY (fazenda_id, usuario_id)
);
ALTER TABLE fazenda_membros ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='fazenda_membros' AND policyname='membros_acesso'
  ) THEN
    CREATE POLICY "membros_acesso" ON fazenda_membros FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── PASSO 3: Função is_membro (evita recursão RLS) ───────────────
CREATE OR REPLACE FUNCTION is_membro(p_fazenda_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM fazenda_membros
    WHERE fazenda_id = p_fazenda_id AND usuario_id = auth.uid()
  );
$$;

-- ── PASSO 4: Adicionar fazenda_id (nullable) em todas as tabelas ─
ALTER TABLE proprietarios            ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE lotes                     ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE piquetes                  ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE animais                   ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE lotes_inseminacao         ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE partos                    ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE pesagens                  ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE procedimentos_sanitarios  ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE estoque_itens             ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE estoque_movimentacoes     ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE lancamentos_financeiros   ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE transacoes_animais        ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);
ALTER TABLE ciclos_financeiros        ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id);

-- ── PASSO 5: Inserir fazenda padrão (se não existir) ─────────────
INSERT INTO fazendas (nome, localizacao, area_total, area_util, ativo, onboarding_concluido)
SELECT 'Cabanha Ventos da Várzea', 'Viamão, RS', 92, 92, true, true
WHERE NOT EXISTS (SELECT 1 FROM fazendas LIMIT 1);

-- Marcar todas as fazendas existentes como concluídas no onboarding
UPDATE fazendas SET onboarding_concluido = true WHERE onboarding_concluido = false;

-- ── PASSO 6: Backfill — preencher fazenda_id nos dados existentes ─
DO $$
DECLARE v_fid uuid;
BEGIN
  SELECT id INTO v_fid FROM fazendas ORDER BY criado_em LIMIT 1;

  UPDATE proprietarios           SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE lotes                   SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE piquetes                SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE animais                 SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE lotes_inseminacao       SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE partos                  SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE pesagens                SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE procedimentos_sanitarios SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE estoque_itens           SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE estoque_movimentacoes   SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE lancamentos_financeiros SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE transacoes_animais      SET fazenda_id = v_fid WHERE fazenda_id IS NULL;
  UPDATE ciclos_financeiros      SET fazenda_id = v_fid WHERE fazenda_id IS NULL;

  -- Vincular todos os usuários à fazenda padrão
  INSERT INTO fazenda_membros (fazenda_id, usuario_id, papel)
  SELECT v_fid, id, 'admin' FROM auth.users ON CONFLICT DO NOTHING;
END $$;

-- ── PASSO 7: Tornar fazenda_id NOT NULL ──────────────────────────
ALTER TABLE proprietarios            ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE lotes                     ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE piquetes                  ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE animais                   ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE lotes_inseminacao         ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE partos                    ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE pesagens                  ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE procedimentos_sanitarios  ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE estoque_itens             ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE estoque_movimentacoes     ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE lancamentos_financeiros   ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE transacoes_animais        ALTER COLUMN fazenda_id SET NOT NULL;
ALTER TABLE ciclos_financeiros        ALTER COLUMN fazenda_id SET NOT NULL;

-- ── PASSO 8: Colunas snapshot em históricos ──────────────────────
ALTER TABLE pesagens                 ADD COLUMN IF NOT EXISTS lote_nome text;
ALTER TABLE procedimentos_sanitarios ADD COLUMN IF NOT EXISTS lote_nome text;
ALTER TABLE procedimentos_sanitarios ADD COLUMN IF NOT EXISTS piquete_nome text;

-- ── PASSO 9: FK SET NULL para lote/piquete em animais ────────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'animais' AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('lote_id','piquete_id')
  LOOP
    EXECUTE 'ALTER TABLE animais DROP CONSTRAINT ' || c;
  END LOOP;
END $$;

ALTER TABLE animais ADD CONSTRAINT animais_lote_id_fkey
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE SET NULL;

ALTER TABLE animais ADD CONSTRAINT animais_piquete_id_fkey
  FOREIGN KEY (piquete_id) REFERENCES piquetes(id) ON DELETE SET NULL;

-- ── PASSO 10: Geometria nos piquetes ─────────────────────────────
ALTER TABLE piquetes ADD COLUMN IF NOT EXISTS geometria jsonb;

-- ── PASSO 11: Tabelas de planejamento ────────────────────────────
CREATE TABLE IF NOT EXISTS planejamentos (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id            uuid        NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  proposito             text,
  objetivos_longo_prazo text,
  valor_terra           numeric,
  valor_ha              numeric,
  valor_rebanho         numeric,
  valor_benfeitorias    numeric,
  resultado_liquido_meta numeric,
  ano_ciclo             int,
  ativo                 boolean     NOT NULL DEFAULT true,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fazenda_id, ano_ciclo)
);
ALTER TABLE planejamentos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='planejamentos' AND policyname='acesso_autenticado') THEN
    CREATE POLICY "acesso_autenticado" ON planejamentos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS planejamento_acoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  planejamento_id uuid        NOT NULL REFERENCES planejamentos(id) ON DELETE CASCADE,
  descricao       text        NOT NULL,
  ciclo_alvo      int,
  status          text        NOT NULL DEFAULT 'pendente',
  concluida_em    timestamptz,
  prazo           date,
  criado_em       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE planejamento_acoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='planejamento_acoes' AND policyname='acesso_autenticado') THEN
    CREATE POLICY "acesso_autenticado" ON planejamento_acoes FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── PASSO 12: Benchmarks de rentabilidade ────────────────────────
CREATE TABLE IF NOT EXISTS benchmarks_rentabilidade (
  cenario        text    PRIMARY KEY,
  rotulo         text    NOT NULL,
  rentab_terra   numeric NOT NULL,
  rentab_rebanho numeric NOT NULL
);
ALTER TABLE benchmarks_rentabilidade ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='benchmarks_rentabilidade' AND policyname='acesso_autenticado') THEN
    CREATE POLICY "acesso_autenticado" ON benchmarks_rentabilidade FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

INSERT INTO benchmarks_rentabilidade (cenario, rotulo, rentab_terra, rentab_rebanho) VALUES
  ('ideal',       'Cenário ideal', 4.0, 20.0),
  ('media_rs',    'Média RS',      1.3,  2.9),
  ('melhores_rs', 'Melhores RS',   2.2, 19.0)
ON CONFLICT DO NOTHING;

-- ── PASSO 13: Triggers de vínculo automático ─────────────────────
CREATE OR REPLACE FUNCTION add_all_users_to_new_fazenda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO fazenda_membros (fazenda_id, usuario_id, papel)
  SELECT NEW.id, id, 'admin' FROM auth.users ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_new_fazenda_add_users ON fazendas;
CREATE TRIGGER on_new_fazenda_add_users
  AFTER INSERT ON fazendas FOR EACH ROW EXECUTE FUNCTION add_all_users_to_new_fazenda();

CREATE OR REPLACE FUNCTION add_new_user_to_all_fazendas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO fazenda_membros (fazenda_id, usuario_id, papel)
  SELECT id, NEW.id, 'admin' FROM fazendas ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_new_user_add_to_fazendas ON auth.users;
CREATE TRIGGER on_new_user_add_to_fazendas
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION add_new_user_to_all_fazendas();

-- ── PASSO 14: Índices de performance ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_animais_fid         ON animais(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fid           ON lotes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_piquetes_fid        ON piquetes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_props_fid           ON proprietarios(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_lanc_fid            ON lancamentos_financeiros(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_transac_fid         ON transacoes_animais(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_pesagens_fid        ON pesagens(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_san_fid             ON procedimentos_sanitarios(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_estoque_fid         ON estoque_itens(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_ciclos_fid          ON ciclos_financeiros(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_plan_fid            ON planejamentos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_acoes_plan          ON planejamento_acoes(planejamento_id);

-- ── PASSO 15: Habilitar RLS nas tabelas que podem não ter ─────────
ALTER TABLE fazendas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fazendas' AND policyname='fazendas_auth') THEN
    CREATE POLICY "fazendas_auth" ON fazendas FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── PASSO 16: Preencher geometrias dos piquetes existentes ────────
-- (coordenadas GeoJSON = [lng, lat], diferente do Leaflet que usa [lat, lng])
UPDATE piquetes SET geometria = '{
  "type":"Polygon","coordinates":[[
    [-50.86536050338567,-30.28423954275702],
    [-50.86658555394333,-30.28467507683909],
    [-50.86266190474740,-30.29560720500282],
    [-50.86058945749334,-30.29369047691660],
    [-50.86536050338567,-30.28423954275702]
  ]]}'::jsonb
WHERE nome='Piquete 01' AND geometria IS NULL;

UPDATE piquetes SET geometria = '{
  "type":"Polygon","coordinates":[[
    [-50.86658306159772,-30.28468775736099],
    [-50.86536220179035,-30.28424025783657],
    [-50.86559447664600,-30.28379483023635],
    [-50.86139042834903,-30.28376511445055],
    [-50.86312262207579,-30.27911855082784],
    [-50.86664989805777,-30.27963772729722],
    [-50.86609632474864,-30.28133018231213],
    [-50.86714656326782,-30.28311504634946],
    [-50.86658306159772,-30.28468775736099]
  ]]}'::jsonb
WHERE nome='Piquete 02' AND geometria IS NULL;

UPDATE piquetes SET geometria = '{
  "type":"Polygon","coordinates":[[
    [-50.86664784937114,-30.27962922020293],
    [-50.86312493432622,-30.27911882769070],
    [-50.86851421658794,-30.26448480572315],
    [-50.87077515185583,-30.26463372143795],
    [-50.86900485272858,-30.26745907003997],
    [-50.86979880827271,-30.26981869357100],
    [-50.86664784937114,-30.27962922020293]
  ]]}'::jsonb
WHERE nome='Piquete 03' AND geometria IS NULL;

UPDATE piquetes SET geometria = '{
  "type":"Polygon","coordinates":[[
    [-50.86979554534850,-30.26982482428651],
    [-50.86900250872746,-30.26743944813594],
    [-50.87076252330942,-30.26464849790992],
    [-50.87139413274560,-30.26473717439274],
    [-50.86979554534850,-30.26982482428651]
  ]]}'::jsonb
WHERE nome='Piquete 05' AND geometria IS NULL;

-- ── FIM ──────────────────────────────────────────────────────────
SELECT 'Migração concluída com sucesso!' as resultado;
