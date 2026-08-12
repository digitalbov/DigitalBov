-- ================================================================
-- BLOCO D15 -- Cancelar agendamento + agendamento gerado por "proxima
-- vacinacao" (Manejo Sanitario / Sanidade.jsx)
--
-- Duas mudancas, no mesmo pacote:
--
-- 1) status ganha um terceiro valor, 'cancelado' -- ao lado de 'realizado'
--    e 'agendado' (migration_sanidade_status_d13_1.sql). Cancelar um
--    agendamento MARCA, nunca apaga -- mesmo raciocinio de
--    proximo_concluido_em (que ja existe, marca sem apagar). cancelado_em
--    grava QUANDO foi cancelado, no MESMO TIPO de coluna que
--    proximo_concluido_em -- descoberto ao vivo por information_schema,
--    nao suposto, porque proximo_concluido_em nao tem migracao salva neste
--    repositorio (foi aplicada direto no banco, mesmo caso ja conhecido de
--    excluir_fazenda).
--    Todo ponto de leitura do app (Alertas, Calendario de vacinacao,
--    Registros, Historico, Relatorios, contexto do Assistente IA, PDF,
--    baixa de estoque) ja passa pelas duas funcoes helper sanidadeRealizada/
--    sanidadeAgendada (helpers.js) -- nenhum deles compara status cru. Com
--    'cancelado', as duas retornam false automaticamente (nao e realizado,
--    nao esta mais agendado) -- ja sai sozinho de Alertas, do Calendario de
--    vacinacao ativo, de Registros/Historico e dos indicadores. Passa a
--    aparecer so na secao nova "Cancelados" da aba Calendario de vacinacao
--    (implementacao em JS, nao neste arquivo). Baixa de estoque nunca roda
--    para 'cancelado' porque so acontece em confirmarConclusao (flow
--    separado, nunca chamado por quem cancela) -- nao ha baixa de insumo
--    para reverter.
--
-- 2) gerado_de_id: agendamento criado automaticamente ao preencher "Proxima
--    aplicacao" num procedimento REALIZADO aponta, por este campo, para o
--    procedimento que o originou -- AUTO-REFERENCIA na mesma tabela, mesmo
--    padrao de animais.pai_animal_id (migration_touro_vinculo_id.sql +
--    migration_fix_restaurar_backup_fazenda.sql). Criada JA como
--    DEFERRABLE INITIALLY DEFERRED (pai_animal_id precisou de uma migracao
--    de correcao depois porque nasceu NOT DEFERRABLE -- aqui nasce certa):
--    restaurar_backup_fazenda faz um unico INSERT por tabela, e uma cadeia
--    concluir->gera outro->concluir->gera outro pode colocar o "pai" depois
--    do "filho" no mesmo lote: com a FK deferravel, a checagem so roda no
--    COMMIT da funcao, quando todas as linhas ja existem, para qualquer
--    profundidade de cadeia.
--    NAO incluso nesta migracao (fica para a fase de implementacao, nao e
--    schema): RestaurarBackup.jsx (REFERENCIAS), importarBackup.js
--    (FKS_POR_TABELA + ordenar procedimentos_sanitarios por criado_em antes
--    do insert em chunks, mesmo principio do sort de touros primeiro em
--    animais) e o texto do dialogo de exclusao em Sanidade.jsx.
--
-- Execute no SQL Editor do Supabase.
-- ================================================================

-- ── PASSO 1: cancelado_em no MESMO TIPO de proximo_concluido_em ────

DO $fn$
DECLARE v_tipo text;
BEGIN
  SELECT data_type INTO v_tipo
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'procedimentos_sanitarios'
    AND column_name = 'proximo_concluido_em';
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'coluna procedimentos_sanitarios.proximo_concluido_em nao encontrada -- nao foi possivel espelhar o tipo para cancelado_em';
  END IF;
  EXECUTE format('ALTER TABLE public.procedimentos_sanitarios ADD COLUMN IF NOT EXISTS cancelado_em %s', v_tipo);
END $fn$;

-- ── PASSO 2: status aceita 'cancelado' ──────────────────────────────

ALTER TABLE public.procedimentos_sanitarios
  DROP CONSTRAINT IF EXISTS procedimentos_sanitarios_status_check;

ALTER TABLE public.procedimentos_sanitarios
  ADD CONSTRAINT procedimentos_sanitarios_status_check
  CHECK (status IN ('realizado','agendado','cancelado'));

-- ── PASSO 3: gerado_de_id (auto-referencia, ja deferravel) ──────────

ALTER TABLE public.procedimentos_sanitarios
  ADD COLUMN IF NOT EXISTS gerado_de_id uuid
  REFERENCES public.procedimentos_sanitarios(id) ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_procedimentos_sanitarios_gerado_de
  ON public.procedimentos_sanitarios(gerado_de_id);

-- ── FIM ──────────────────────────────────────────────────────────

SELECT 'D15: cancelado_em + status cancelado + gerado_de_id criados com sucesso!' as resultado;
