-- ================================================================
-- Storage: bucket 'veterinario' (logo do veterinário) -- policies.
--
-- Já aplicado direto no painel do Supabase (bucket criado + as 4 policies
-- abaixo) -- este arquivo é só o registro/versionamento do que já está em
-- produção, pra reaplicar em outro ambiente se precisar.
--
-- PRÉ-REQUISITO -- bucket não se cria por SQL de policy, só pelo Dashboard
-- (Storage > New bucket) ou pela Management API:
--   1. Storage > New bucket > nome "veterinario" > Public bucket: ON.
--   2. Só depois disso, rode os CREATE POLICY abaixo no SQL Editor.
--
-- Idempotente: DROP POLICY IF EXISTS antes de cada CREATE, pode rodar de novo
-- sem erro. Mesmo padrão de nomes/formato do bucket 'fazendas' (ver
-- fazendas_storage_policies.sql) -- só troca "fotos_fazenda"/"fazendas" por
-- "logo_veterinario"/"veterinario".
--
-- Execute no SQL Editor do Supabase, DEPOIS de criar o bucket.
-- ================================================================

DROP POLICY IF EXISTS "logo_veterinario_select" ON storage.objects;
CREATE POLICY "logo_veterinario_select" ON storage.objects FOR SELECT USING (bucket_id = 'veterinario');
DROP POLICY IF EXISTS "logo_veterinario_insert" ON storage.objects;
CREATE POLICY "logo_veterinario_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'veterinario');
DROP POLICY IF EXISTS "logo_veterinario_update" ON storage.objects;
CREATE POLICY "logo_veterinario_update" ON storage.objects FOR UPDATE USING (bucket_id = 'veterinario');
DROP POLICY IF EXISTS "logo_veterinario_delete" ON storage.objects;
CREATE POLICY "logo_veterinario_delete" ON storage.objects FOR DELETE USING (bucket_id = 'veterinario');

-- QUERY DE CONFERÊNCIA -- confirma as 4 policies do bucket:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname LIKE 'logo_veterinario_%';
