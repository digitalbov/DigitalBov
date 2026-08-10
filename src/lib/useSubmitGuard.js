import { useRef, useCallback } from 'react'
import { toast } from '../components/UI'

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
    } catch (e) {
      // Rede de segurança: uma exceção NÃO tratada dentro de fn() (bug de
      // código — não um erro de negócio, que já vem com seu próprio toast
      // específico e um `return` antes disso) antes só escapava daqui como
      // "Uncaught (in promise)" no console — nada avisava a tela. E como a
      // exceção interrompe fn() antes de chegar no setSaving(false) de quem
      // chamou, o botão fica "Salvando..." pra sempre — travado EM SILÊNCIO
      // (bug ao vivo, 2026-08-09: exatamente esse caso, ver Reprodutivo.jsx
      // salvarLote). Mostra um toast aqui, no ÚNICO ponto que toda gravação
      // já passa, em vez de confiar que cada uma das ~13 chamadas trate
      // todo erro imprevisto sozinha — não resolve o botão continuar
      // desabilitado (isso depende do `saving` de cada tela, fora do
      // alcance deste hook), mas garante que o usuário vê que algo quebrou,
      // em vez de achar que ainda está processando.
      console.error('[useSubmitGuard] erro não tratado:', e)
      toast('Erro inesperado ao salvar: ' + (e?.message || String(e)), 'error')
    } finally {
      emAndamento.current.delete(chave)
    }
  }, [])
}
