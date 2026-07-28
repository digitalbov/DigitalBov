# Migrations aplicadas

Os arquivos `migration_*.sql` nesta pasta **já foram executados no banco de
produção (Supabase)**, com confirmação do usuário. **Não rode nenhum deles de
novo.**

## O repositório NÃO é fonte de verdade sobre o schema

Estes arquivos e os demais `docs/*.sql` documentam a intenção histórica de
cada mudança, mas **divergem da estrutura real do banco**. Para qualquer
fato sobre schema, colunas ou políticas de RLS, a fonte de verdade é o banco
Supabase ao vivo (`information_schema`, `pg_policies`, `pg_proc`) — nunca
os arquivos deste repositório.

Estruturas que existem no banco e **nunca tiveram migration correspondente**
neste repositório (criadas direto no Supabase):

- `lancamento_rateios`
- `lote_touros`
- `estacoes_monta`
- `sanidade_animais`
- `contas.testes`
- correção da RPC `excluir_fazenda` (ajuste de ordem de exclusão por FK,
  feito diretamente no banco)

## Fluxo daqui pra frente

1. Toda migration nova nasce na **raiz** do projeto.
2. Ela só é movida para `docs/migrations-aplicadas/` **depois** que o usuário
   confirmar que rodou no Supabase.
3. Se a raiz não tiver nenhum `migration_*.sql`, significa que não há
   nenhuma pendente de execução.
