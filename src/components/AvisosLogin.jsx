import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { db } from '../lib/supabase'
import { Modal, toast } from './UI'
import { calcularPendenciasLogin, textoAvisoLogin, TITULO_AVISO_LOGIN } from '../lib/helpers'

// Limite de tempo pra buscar as 4 pendências (Parte 3, decisão do usuário —
// 2026-08-12): se não voltar em 4s, a caixa simplesmente não aparece NAQUELE
// login — sem mensagem de erro (é informação útil, não crítica) e sem
// aparecer atrasada por cima de alguém que já começou a trabalhar.
const LIMITE_MS = 4000

// Monta uma única vez por sessão (este componente vive em Layout.jsx, que
// nunca desmonta entre navegações — só recarrega a página inteira o
// desmonta, o que já conta como "novo login" pro propósito deste aviso).
// Reaproveita 100% os critérios já usados no balão de pendências do ciclo
// anterior (Reprodutivo.jsx) e em desfechoReprodutivo — nenhum critério novo,
// só o recorte por dias de atraso e a varredura sem escopo de ciclo (ver
// calcularPendenciasLogin, helpers.js).
export default function AvisosLogin() {
  const [secoes, setSecoes] = useState([])
  const [aberto, setAberto] = useState(false)
  const location = useLocation()
  // "Já navegou ou interagiu desde o login" — checado só no MOMENTO em que a
  // busca termina (não continuamente): clique/tecla em qualquer lugar da
  // tela, ou troca de rota, contam como "já começou a trabalhar". Interromper
  // isso com uma caixa por cima é pior que simplesmente não avisar.
  const interagiuRef = useRef(false)
  const pathnameInicialRef = useRef(location.pathname)

  useEffect(() => {
    const marcar = () => { interagiuRef.current = true }
    document.addEventListener('click', marcar, { capture: true })
    document.addEventListener('keydown', marcar, { capture: true })
    return () => {
      document.removeEventListener('click', marcar, { capture: true })
      document.removeEventListener('keydown', marcar, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== pathnameInicialRef.current) interagiuRef.current = true
  }, [location.pathname])

  // Busca única, no mount (= login) — nunca refaz em troca de rota/ciclo,
  // isto não é uma tela normal com loadAll ligado a filtros.
  useEffect(() => {
    let estourou = false
    const timeoutId = setTimeout(() => { estourou = true }, LIMITE_MS)
    Promise.all([
      db.lotesInseminacao.listPendenciasLogin(),
      db.avisosDispensados.list(),
    ]).then(([rLotes, rDisp]) => {
      clearTimeout(timeoutId)
      // Estourou o limite: some sem rastro, sem toast, sem console.error —
      // decisão explícita do usuário (informação útil, não crítica).
      if (estourou) return
      if (interagiuRef.current) return
      if (rLotes.error || rDisp.error) {
        console.error('[AvisosLogin] erro ao buscar pendências de login:', rLotes.error || rDisp.error)
        return
      }
      const dispensadosPorTipo = new Map()
      ;(rDisp.data || []).forEach(d => {
        if (!dispensadosPorTipo.has(d.tipo_aviso)) dispensadosPorTipo.set(d.tipo_aviso, new Set())
        dispensadosPorTipo.get(d.tipo_aviso).add(d.lote_id)
      })
      const sec = calcularPendenciasLogin(rLotes.data || [], dispensadosPorTipo)
      if (sec.length === 0) return
      if (interagiuRef.current) return // checagem final — a computação acima não é instantânea
      setSecoes(sec)
      setAberto(true)
    })
    return () => { estourou = true; clearTimeout(timeoutId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [dispensandoTipo, setDispensandoTipo] = useState(null)
  const dispensarSecao = async (tipo, loteIds) => {
    if (dispensandoTipo) return
    setDispensandoTipo(tipo)
    const { error } = await db.avisosDispensados.dispensar(tipo, loteIds)
    setDispensandoTipo(null)
    if (error) { toast('Erro ao dispensar aviso: ' + error.message, 'error'); return }
    // Grava na hora e vale imediatamente — próxima busca (próximo login) já
    // lê do banco, nunca de cache local. Aqui, só tira da tela: se essa era
    // a última seção, a caixa fecha sozinha.
    setSecoes(prev => {
      const restante = prev.filter(s => s.tipo !== tipo)
      if (restante.length === 0) setAberto(false)
      return restante
    })
  }

  if (secoes.length === 0) return null

  return (
    <Modal open={aberto} onClose={() => setAberto(false)} title="Pendências" width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {secoes.map(s => (
          <div key={s.tipo} style={{
            border: '.5px solid #F3D5A3', background: '#FEF3C7', borderRadius: 10, padding: '12px 14px',
          }}>
            <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#633806', marginBottom: 4 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: 14 }} /> {TITULO_AVISO_LOGIN[s.tipo]}
            </div>
            <div style={{ fontSize: '.82rem', color: '#374151', lineHeight: 1.6, marginBottom: 8 }}>
              {textoAvisoLogin(s)}
            </div>
            <button className="btn btn-secondary btn-xs" disabled={dispensandoTipo === s.tipo}
              onClick={() => dispensarSecao(s.tipo, s.loteIds)}>
              {dispensandoTipo === s.tipo ? 'Salvando...' : 'Não mostrar mais este aviso'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  )
}
