import { useState, useEffect } from 'react'
import { useCiclo } from './CicloContext'

// Seletor de ciclo LOCAL de uma tela — inicia (e só inicia) a partir do ciclo
// GLOBAL selecionado no menu lateral, mas depois pode ser trocado localmente
// pelo usuário (via SeletorCicloLocal) sem afetar o resto do app. Esse padrão
// estava duplicado em 9 telas; centralizado aqui.
export function useCicloLocal() {
  const { ciclos, cicloSelecionado, cicloAtual } = useCiclo()
  const [cicloLocal, setCicloLocal] = useState(null)
  useEffect(() => {
    if (cicloSelecionado && !cicloLocal) setCicloLocal(cicloSelecionado)
  }, [cicloSelecionado])
  return { cicloLocal, setCicloLocal, ciclos, cicloAtual }
}
