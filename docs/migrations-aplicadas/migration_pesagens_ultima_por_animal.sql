-- ================================================================
-- Pesagens > Por Animal (tela em lista) -- ultima pesagem de cada
-- animal, sem trazer o historico inteiro.
--
-- Cria a funcao public.pesagens_ultima_por_animal(p_animal_ids uuid[]),
-- que devolve 1 linha por animal (a pesagem mais recente dele -- maior
-- data, empate resolvido por criado_em mais recente), usando
-- DISTINCT ON. E' um valor CALCULADO NA LEITURA, nao existe (nem vai
-- existir) nenhuma coluna de "ultimo peso" em animais -- mesmo
-- principio de public.saldo_anterior_ciclo (Bloco D11).
--
-- Por que isso precisou de uma funcao nova: a tela lista TODOS os
-- animais ativos (pode ser milhares numa fazenda grande), e pra cada
-- um mostra so a ultima pesagem. Buscar isso trazendo o historico
-- completo (como db.pesagens.listAll() ja faz hoje, com limite de
-- 10.000 linhas -- ver comentario em src/lib/supabase.js) nao escala:
-- o tamanho da resposta cresce com o historico acumulado, nao com o
-- tamanho do rebanho. Esta funcao devolve exatamente 1 linha por
-- animal_id pedido, entao o payload e' proporcional ao rebanho, nao ao
-- historico.
--
-- STABLE, sem SECURITY DEFINER: roda com os privilegios de quem chama,
-- entao a RLS de pesagens continua valendo normalmente dentro da
-- funcao -- ninguem enxerga pesagem fora do que ja enxergaria numa
-- query direta (mesmo raciocinio do comentario em
-- migration_saldo_anterior_ciclo_d11_1.sql).
--
-- Indice usado: idx_pesagens_animal (ja existe, ver 01_supabase_schema.sql).
--
-- Execute no SQL Editor do Supabase.
-- ================================================================

CREATE OR REPLACE FUNCTION public.pesagens_ultima_por_animal(p_animal_ids uuid[])
RETURNS TABLE (animal_id uuid, pesagem_id uuid, data date, peso_kg numeric, tipo text)
LANGUAGE sql STABLE AS $fn$
  SELECT DISTINCT ON (p.animal_id) p.animal_id, p.id AS pesagem_id, p.data, p.peso_kg, p.tipo
  FROM public.pesagens p
  WHERE p.animal_id = ANY(p_animal_ids)
  ORDER BY p.animal_id, p.data DESC, p.criado_em DESC
$fn$;

GRANT EXECUTE ON FUNCTION public.pesagens_ultima_por_animal(uuid[]) TO authenticated;

-- QUERY DE CONFERENCIA -- troque pelos uuids de 2-3 animais que voce sabe
-- a ultima pesagem de cabeca, e compare com o que a funcao devolve.
-- SELECT * FROM public.pesagens_ultima_por_animal(ARRAY['00000000-0000-0000-0000-000000000000']::uuid[]);
