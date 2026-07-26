-- ================================================================
-- BLOCO D9 -- Remove a policy aberta de RLS na tabela animais.
-- Hoje a tabela tem 1 policy so, "acesso_total_autenticados", FOR ALL
-- USING (auth.role() = 'authenticated') -- ou seja, QUALQUER usuario
-- autenticado do sistema inteiro (de qualquer conta) pode ler e
-- escrever em QUALQUER linha de animais, sem checar conta_id nem
-- fazenda_id nem permissao de modulo. O isolamento entre contas hoje
-- so existe porque o app sempre filtra por conta_id/fazenda_id (T()
-- em supabase.js) -- o banco em si nao impede nada.
-- Troca por 4 policies (select/insert/update/delete) usando as MESMAS
-- funcoes ja em producao para transacao_animais_itens (ver
-- migration_transacao_animais_itens_d2_3.sql): tem_acesso_fazenda()
-- para leitura, mais pode_editar_modulo(conta_id,'animais') para
-- qualquer escrita -- 'animais' e a mesma chave de modulo usada em
-- Usuarios.jsx (MODULOS), entao bate com a granularidade de permissao
-- que ja existe hoje na tela de usuarios.
-- ATENCAO -- teste antes de aplicar em producao: confirme numa conta
-- de teste (contas.testes = true) que animais continuam aparecendo
-- normalmente para dono/admin/operador com permissao, antes de rodar
-- isto na conta real. Se travar acesso de alguem, o sintoma e a tela
-- de Animais aparecer vazia mesmo com bicho cadastrado.
-- Execute no SQL Editor do Supabase.
-- ================================================================

BEGIN;

DROP POLICY IF EXISTS "acesso_total_autenticados" ON public.animais;

CREATE POLICY "animais_select" ON public.animais FOR SELECT USING (public.tem_acesso_fazenda(fazenda_id));
CREATE POLICY "animais_insert" ON public.animais FOR INSERT WITH CHECK (public.tem_acesso_fazenda(fazenda_id) AND public.pode_editar_modulo(conta_id, 'animais'));
CREATE POLICY "animais_update" ON public.animais FOR UPDATE USING (public.tem_acesso_fazenda(fazenda_id) AND public.pode_editar_modulo(conta_id, 'animais'));
CREATE POLICY "animais_delete" ON public.animais FOR DELETE USING (public.tem_acesso_fazenda(fazenda_id) AND public.pode_editar_modulo(conta_id, 'animais'));

COMMIT;

-- Conferencia -- deve mostrar as 4 policies novas, nenhuma "acesso_total_autenticados".
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'animais' AND schemaname = 'public';
