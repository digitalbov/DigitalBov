-- ================================================================
-- Storage: bucket 'fazendas' (foto/logo da fazenda, usado em Dashboard.jsx)
-- -- policies.
--
-- Já aplicado direto no painel do Supabase (bucket criado + as 4 policies
-- abaixo) -- não havia registro em nenhum arquivo até agora; este arquivo é
-- o versionamento do que já está em produção, pra reaplicar em outro
-- ambiente se precisar.
--
-- PRÉ-REQUISITO -- bucket não se cria por SQL de policy, só pelo Dashboard
-- (Storage > New bucket) ou pela Management API. Se o bucket 'fazendas'
-- ainda não existir no ambiente onde você for rodar isto:
--   1. Storage > New bucket > nome "fazendas" > Public bucket: ON.
--   2. Só depois disso, rode os CREATE POLICY abaixo no SQL Editor.
-- Na conta de produção atual o bucket já existe (é de onde as fotos de
-- Dashboard.jsx são servidas via getPublicUrl) -- neste caso pule o passo 1
-- e só reaplique as policies.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE, pode rodar de novo
-- sem erro. Mesmo padrão de nomes/formato do bucket 'veterinario' (ver
-- veterinario_storage_policies.sql).
--
-- Execute no SQL Editor do Supabase.
-- ================================================================

DROP POLICY IF EXISTS "fotos_fazenda_select" ON storage.objects;
CREATE POLICY "fotos_fazenda_select" ON storage.objects FOR SELECT USING (bucket_id = 'fazendas');
DROP POLICY IF EXISTS "fotos_fazenda_insert" ON storage.objects;
CREATE POLICY "fotos_fazenda_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fazendas');
DROP POLICY IF EXISTS "fotos_fazenda_update" ON storage.objects;
CREATE POLICY "fotos_fazenda_update" ON storage.objects FOR UPDATE USING (bucket_id = 'fazendas');
DROP POLICY IF EXISTS "fotos_fazenda_delete" ON storage.objects;
CREATE POLICY "fotos_fazenda_delete" ON storage.objects FOR DELETE USING (bucket_id = 'fazendas');

-- QUERY DE CONFERÊNCIA -- confirma as 4 policies do bucket:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname LIKE 'fotos_fazenda_%';
