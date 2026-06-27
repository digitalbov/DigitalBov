-- ============================================================
--  VENTOS DA VÁRZEA — GESTÃO PECUÁRIA
--  Supabase Schema v1.0
--  Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: usuarios (gerenciado pelo Supabase Auth)
-- Os usuários são criados via Supabase Dashboard
-- Esta tabela armazena perfil e configurações
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  email       TEXT NOT NULL,
  avatar_cor  TEXT DEFAULT '#1E4D35',
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: proprietarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.proprietarios (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  inscricao_estadual TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Dados iniciais
INSERT INTO public.proprietarios (nome, inscricao_estadual) VALUES
  ('Vitorugo Avila Gonçalves', '111111111111111111'),
  ('Veridiana Avila Gonçalves', '2222222222222222');

-- ============================================================
-- TABELA: fazendas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fazendas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome          TEXT NOT NULL,
  localizacao   TEXT,
  area_total    NUMERIC(10,2),
  area_util     NUMERIC(10,2),
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.fazendas (nome, localizacao, area_total, area_util) VALUES
  ('Cabanha Ventos da Várzea',
   'Estrada da Varzinha, nº 18.500, Rincão do São Braz, Viamão/RS',
   140.00, 92.60);

-- ============================================================
-- TABELA: fazenda_proprietarios (N:N)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.fazenda_proprietarios (
  fazenda_id     UUID REFERENCES public.fazendas(id) ON DELETE CASCADE,
  proprietario_id UUID REFERENCES public.proprietarios(id) ON DELETE CASCADE,
  PRIMARY KEY (fazenda_id, proprietario_id)
);

-- ============================================================
-- TABELA: piquetes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.piquetes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fazenda_id      UUID REFERENCES public.fazendas(id),
  nome            TEXT NOT NULL,
  area_ha         NUMERIC(10,2),
  status          TEXT DEFAULT 'em_uso' CHECK (status IN ('em_uso','em_descanso')),
  status_desde    DATE DEFAULT CURRENT_DATE,
  qualidade_past  TEXT,
  tipo_pastagem   TEXT,
  finalidade      TEXT,
  geojson         JSONB,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: lotes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lotes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,
  finalidade  TEXT,
  descricao   TEXT,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Lotes iniciais
INSERT INTO public.lotes (nome, finalidade, descricao) VALUES
  ('Matrizes', 'Cria', 'Matrizes em produção — Piquete 03'),
  ('Terneiras', 'Cria', 'Terneiras nascidas em 2025 — Piquetes 01 e 02');

-- ============================================================
-- TABELA: lote_piquetes (N:N)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lote_piquetes (
  lote_id    UUID REFERENCES public.lotes(id) ON DELETE CASCADE,
  piquete_id UUID REFERENCES public.piquetes(id) ON DELETE CASCADE,
  PRIMARY KEY (lote_id, piquete_id)
);

-- ============================================================
-- TABELA: animais
-- ============================================================
CREATE TABLE IF NOT EXISTS public.animais (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brinco          TEXT NOT NULL,
  nome            TEXT,
  sexo            CHAR(1) NOT NULL CHECK (sexo IN ('M','F')),
  data_nascimento DATE,
  raca            TEXT DEFAULT 'Angus',
  pelagem         TEXT DEFAULT 'Preto',
  pai             TEXT,
  mae_brinco      TEXT,
  mae_id          UUID REFERENCES public.animais(id),
  proprietario_id UUID REFERENCES public.proprietarios(id),
  lote_id         UUID REFERENCES public.lotes(id),
  situacao        TEXT DEFAULT 'ativo' CHECK (situacao IN ('ativo','vendido','morto')),
  data_baixa      DATE,
  sit_reprodutiva TEXT DEFAULT 'nao_se_aplica' CHECK (sit_reprodutiva IN ('prenha','vazia','nao_se_aplica')),
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brinco)
);

-- ============================================================
-- TABELA: categorias_preco (parâmetros financeiros)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias_preco (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  categoria   TEXT NOT NULL UNIQUE,
  peso_medio  NUMERIC(8,2) DEFAULT 0,
  preco_kg    NUMERIC(8,2) DEFAULT 0,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.categorias_preco (categoria, peso_medio, preco_kg) VALUES
  ('Vaca Gorda',    480, 7.80),
  ('Vaca Magra',    380, 4.00),
  ('Vaca Prenha',   450, 0),
  ('Vaca com Cria', 420, 0),
  ('Boi Gordo',     520, 8.90),
  ('Boi Magro',     380, 0),
  ('Novilho',       280, 0),
  ('Novilha',       260, 0),
  ('Terneiro',      180, 9.30),
  ('Terneira',      170, 9.30);

-- ============================================================
-- TABELA: ciclos_financeiros
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ciclos_financeiros (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome        TEXT NOT NULL,  -- ex: '2025/26'
  inicio      DATE NOT NULL,  -- 01/07/YYYY
  fim         DATE NOT NULL,  -- 30/06/YYYY+1
  atual       BOOLEAN DEFAULT FALSE
);

INSERT INTO public.ciclos_financeiros (nome, inicio, fim, atual) VALUES
  ('2022/23', '2022-07-01', '2023-06-30', FALSE),
  ('2023/24', '2023-07-01', '2024-06-30', FALSE),
  ('2024/25', '2024-07-01', '2025-06-30', FALSE),
  ('2025/26', '2025-07-01', '2026-06-30', TRUE);

-- ============================================================
-- TABELA: lancamentos_financeiros
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lancamentos_financeiros (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ciclo_id      UUID REFERENCES public.ciclos_financeiros(id),
  data          DATE NOT NULL,
  tipo          CHAR(1) NOT NULL CHECK (tipo IN ('R','D')),
  grupo         TEXT NOT NULL,
  descricao     TEXT,
  valor         NUMERIC(12,2) NOT NULL,
  proprietario_id UUID REFERENCES public.proprietarios(id),
  usuario_id    UUID REFERENCES public.usuarios(id),
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: transacoes_animais (compra e venda)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.transacoes_animais (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ciclo_id        UUID REFERENCES public.ciclos_financeiros(id),
  data            DATE NOT NULL,
  tipo            CHAR(1) NOT NULL CHECK (tipo IN ('V','C')),
  categoria       TEXT NOT NULL,
  quantidade      INT NOT NULL DEFAULT 1,
  peso_medio      NUMERIC(8,2),
  preco_kg        NUMERIC(8,2),
  valor_total     NUMERIC(12,2),
  contraparte     TEXT,
  comissao        NUMERIC(10,2) DEFAULT 0,
  imposto         NUMERIC(10,2) DEFAULT 0,
  usuario_id      UUID REFERENCES public.usuarios(id),
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: lotes_inseminacao
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lotes_inseminacao (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ciclo_id    UUID REFERENCES public.ciclos_financeiros(id),
  numero      INT NOT NULL,
  data        DATE NOT NULL,
  touro       TEXT NOT NULL,
  protocolo   TEXT,
  encerrado   BOOLEAN DEFAULT FALSE,
  data_diag   DATE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: inseminacoes (animal x lote)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inseminacoes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_inseminacao_id UUID REFERENCES public.lotes_inseminacao(id),
  animal_id           UUID REFERENCES public.animais(id),
  diagnostico         TEXT CHECK (diagnostico IN ('P','V',NULL)),
  data_diagnostico    DATE,
  criado_em           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lote_inseminacao_id, animal_id)
);

-- ============================================================
-- TABELA: partos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.partos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mae_id          UUID REFERENCES public.animais(id),
  bezerro_id      UUID REFERENCES public.animais(id),
  data_parto      DATE NOT NULL,
  facilidade      TEXT DEFAULT 'normal' CHECK (facilidade IN ('normal','distocico','cesarea')),
  ciclo_id        UUID REFERENCES public.ciclos_financeiros(id),
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: abortos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.abortos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id   UUID REFERENCES public.animais(id),
  data        DATE NOT NULL,
  ciclo_id    UUID REFERENCES public.ciclos_financeiros(id),
  causa       TEXT,
  observacoes TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: pesagens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pesagens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id   UUID REFERENCES public.animais(id),
  data        DATE NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('nascimento','desmama','sobreano','intermediaria')),
  peso_kg     NUMERIC(8,2) NOT NULL,
  observacoes TEXT,
  usuario_id  UUID REFERENCES public.usuarios(id),
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: procedimentos_sanitarios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.procedimentos_sanitarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data            DATE NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('Vacina','Vermifugação','Ectoparasita','Medicação','Exame')),
  procedimento    TEXT NOT NULL,
  lote_descricao  TEXT,
  quantidade      INT,
  proximo         DATE,
  custo           NUMERIC(10,2) DEFAULT 0,
  observacoes     TEXT,
  usuario_id      UUID REFERENCES public.usuarios(id),
  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: estoque_itens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estoque_itens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item        TEXT NOT NULL,
  categoria   TEXT NOT NULL,
  unidade     TEXT NOT NULL,
  quantidade  NUMERIC(10,3) DEFAULT 0,
  minimo      NUMERIC(10,3) DEFAULT 0,
  preco_unit  NUMERIC(10,2) DEFAULT 0,
  ativo       BOOLEAN DEFAULT TRUE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: estoque_movimentacoes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estoque_movimentacoes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID REFERENCES public.estoque_itens(id),
  data        DATE NOT NULL,
  tipo        CHAR(1) NOT NULL CHECK (tipo IN ('E','S')),
  quantidade  NUMERIC(10,3) NOT NULL,
  motivo      TEXT,
  usuario_id  UUID REFERENCES public.usuarios(id),
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — todos os usuários autenticados
-- veem tudo (conforme solicitado: 4 usuários com acesso total)
-- ============================================================
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pesagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimentos_sanitarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acesso_total_autenticados" ON public.usuarios
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "acesso_total_autenticados" ON public.animais
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "acesso_total_autenticados" ON public.lancamentos_financeiros
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "acesso_total_autenticados" ON public.pesagens
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "acesso_total_autenticados" ON public.procedimentos_sanitarios
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- INDEXES para performance
-- ============================================================
CREATE INDEX idx_animais_brinco ON public.animais(brinco);
CREATE INDEX idx_animais_situacao ON public.animais(situacao);
CREATE INDEX idx_animais_proprietario ON public.animais(proprietario_id);
CREATE INDEX idx_animais_lote ON public.animais(lote_id);
CREATE INDEX idx_lancamentos_ciclo ON public.lancamentos_financeiros(ciclo_id);
CREATE INDEX idx_lancamentos_tipo ON public.lancamentos_financeiros(tipo);
CREATE INDEX idx_pesagens_animal ON public.pesagens(animal_id);
CREATE INDEX idx_inseminacoes_lote ON public.inseminacoes(lote_inseminacao_id);
CREATE INDEX idx_procedimentos_data ON public.procedimentos_sanitarios(data);

-- ============================================================
-- FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.atualizado_em = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_animais_updated
  BEFORE UPDATE ON public.animais
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
