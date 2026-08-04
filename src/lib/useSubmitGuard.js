import { useRef, useCallback } from 'react'

const CHAVE_PADRAO = '__unica__'

// Guarda de reentrância para ações assíncronas disparadas por clique (duplo
// clique, clique + Enter no botão ainda focado, clique repetido enquanto a
// resposta não voltou). Usa uma ref, não state: precisa travar de forma
// SÍNCRONA no exato instante da chamada — um setState (ex.: setSaving(true))
// só reflete no DOM (disabled) no próximo render, e duas chamadas do mesmo
// tick passam pela checagem juntas antes disso. `finally` garante destravar
// tanto em sucesso quanto em erro.
//
// `chave` (opcional) permite guardas independentes dentro do MESMO hook: por
// padrão todo `run(fn)` compartilha uma única trava (equivalente a um botão
// de cada vez); passe uma chave (ex. `${loteId}:${animalId}`) quando ações
// para alvos diferentes devem poder rodar em paralelo — só bloqueia repetição
// no MESMO alvo, sem precisar de uma segunda cópia deste hook.
export function useSubmitGuard() {
  const emAndamento = useRef(new Set())
  return useCallback(async (fn, chave = CHAVE_PADRAO) => {
    if (emAndamento.current.has(chave)) return
    emAndamento.current.add(chave)
    try {
      return await fn()
    } finally {
      emAndamento.current.delete(chave)
    }
  }, [])
}
