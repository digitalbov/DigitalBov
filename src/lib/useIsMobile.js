import { useEffect, useState } from 'react'

// Fonte única do breakpoint mobile (768px) usado em JS — o mesmo valor de
// @media (max-width: 768px) em global.css. Qualquer lugar do sistema que
// precise se comportar diferente em celular x desktop usa este hook, nunca
// um window.innerWidth avulso — é o que garante que "onde é mobile" nunca
// diverge entre CSS e lógica de componente.
export const MOBILE_MQ = '(max-width: 768px)'

export function useIsMobile() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_MQ).matches : false
  )
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ)
    const onChange = (e) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
