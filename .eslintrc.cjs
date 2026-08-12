// Config mínima, deliberadamente sem regra de estilo (2026-08-12) — só o que
// pega erro real, pra saída nunca virar ruído que treina a ignorar:
// - no-undef: identificador usado sem existir no escopo (a causa do bug real
//   da aba Índices em Reprodutivo.jsx — useMemo com return/destructure
//   duplicados, ver comentário lá).
// - react-hooks/rules-of-hooks: hook chamado fora de componente/hook, ou
//   dentro de condicional/loop — quebra o React de verdade, não estilo.
// - react-hooks/exhaustive-deps: aviso (não erro) — dependência de
//   useEffect/useMemo/useCallback faltando na lista. Fica como aviso porque
//   este projeto tem casos deliberados de dependência omitida (comentados no
//   próprio código); virar erro quebraria build por decisão intencional já
//   tomada, não por bug.
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  rules: {
    'no-undef': 'error',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  ignorePatterns: ['dist', 'node_modules'],
}
