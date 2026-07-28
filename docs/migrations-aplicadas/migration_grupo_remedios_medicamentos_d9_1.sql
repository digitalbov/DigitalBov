-- ================================================================
-- BLOCO D9 -- Renomeia o grupo financeiro 'Remedios' para 'Medicamentos'
-- nos lancamentos ja existentes (o codigo (GRUPOS_DES em helpers.js) ja
-- foi trocado separadamente -- isto so corrige o dado historico, senao
-- os lancamentos antigos ficam com 'Remedios' e viram um grupo separado
-- de 'Medicamentos' nos relatorios, dois grupos pra mesma coisa).
-- Execute a QUERY 1 primeiro e confira o resultado antes de rodar a
-- QUERY 2. Nao precisa apagar nem recriar nada -- e so um UPDATE de texto.
-- ================================================================

-- QUERY 1 -- contagem por fazenda, para conferir ANTES de alterar qualquer coisa.
SELECT lf.fazenda_id, f.nome AS fazenda_nome, count(*) AS qtd_lancamentos, sum(lf.valor) AS valor_total FROM public.lancamentos_financeiros lf LEFT JOIN public.fazendas f ON f.id = lf.fazenda_id WHERE lf.grupo = 'Remédios' GROUP BY lf.fazenda_id, f.nome ORDER BY qtd_lancamentos DESC;

-- QUERY 2 -- so depois de conferir a contagem acima. NAO RODAR sem revisar a QUERY 1.
UPDATE public.lancamentos_financeiros SET grupo = 'Medicamentos' WHERE grupo = 'Remédios';

-- QUERY 3 -- conferencia final, deve retornar 0 linhas.
SELECT count(*) AS restantes_com_remedios FROM public.lancamentos_financeiros WHERE grupo = 'Remédios';
