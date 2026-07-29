import { useMemo, useRef, useState } from 'react'
import { toast } from '../../components/UI'
import { useFazenda } from '../../lib/FazendaContext'
import { MANUAL_INDICE } from './indice'
import { CONTEUDOS } from './conteudos'

// ── Placeholder das seções ainda sem conteúdo escrito ───────────────────────
// Fase 1 só preenche Pesagens (ver conteudos.js) — todo o resto cai aqui até
// ser escrito nas próximas fases. Mantém a página inteira navegável desde já.
function SecaoPlaceholder({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>
      <p style={{ color: '#6B7280', fontSize: '.85rem', lineHeight: 1.6 }}>{item.resumo}</p>
      {item.subsecoes?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 }}>
          {item.subsecoes.map(sub => (
            <span key={sub.id} id={sub.id} style={{
              fontSize: '.74rem', color: '#6B7280', background: '#F3F4F6',
              borderRadius: 6, padding: '3px 9px', scrollMarginTop: 90,
            }}>{sub.titulo}</span>
          ))}
        </div>
      )}
      <div style={{
        marginTop: 12, padding: '10px 14px', background: '#F9FAFB',
        border: '1px dashed #E5E7EB', borderRadius: 8, fontSize: '.8rem', color: '#9CA3AF',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <i className="ti ti-clock" /> Conteúdo detalhado em breve.
      </div>
    </div>
  )
}

export default function Manual() {
  const contentRef = useRef(null)
  const [busca, setBusca] = useState('')
  const [gerando, setGerando] = useState(false)
  const { fazendaAtual } = useFazenda()

  // PDF com texto real (não captura de tela) — ver pdfManual.js. Import
  // dinâmico só pra não engordar o bundle inicial com jsPDF/html2canvas.
  // Logo da fazenda (Fase 9) carregada ANTES de gerar — precisa estar pronta
  // (dataURL) antes do PdfWriter desenhar a capa, que é síncrono.
  const gerarPDF = async () => {
    setGerando(true)
    try {
      const { gerarPDFManualTexto } = await import('../../lib/pdfManual')
      const { carregarLogoFazenda } = await import('../../lib/pdfWriter')
      const logoDataURL = await carregarLogoFazenda(fazendaAtual?.foto_url || '')
      await gerarPDFManualTexto(contentRef, 'manual-digitalbov', fazendaAtual?.nome || '', logoDataURL, MANUAL_INDICE)
    } catch (e) {
      console.error(e)
      toast('Erro ao gerar PDF: ' + e.message, 'error')
    }
    setGerando(false)
  }

  // Filtra só o ÍNDICE (navegação/busca lateral) — o conteúdo continua
  // renderizando todas as seções sempre, pra exportação em PDF nunca ficar
  // incompleta por causa de um termo de busca esquecido no campo.
  const indiceFiltrado = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return MANUAL_INDICE
    return MANUAL_INDICE
      .map(sec => {
        const bateSecao = sec.titulo.toLowerCase().includes(q) || sec.resumo.toLowerCase().includes(q)
        const subsBatem = (sec.subsecoes || []).filter(sub => sub.titulo.toLowerCase().includes(q))
        if (bateSecao) return sec
        if (subsBatem.length > 0) return { ...sec, subsecoes: subsBatem }
        return null
      })
      .filter(Boolean)
  }, [busca])

  const irPara = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <style>{`
        .manual-toc-item, .manual-toc-subitem {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
          border: none; background: transparent; cursor: pointer; font-family: inherit;
          border-radius: 8px; color: #374151;
        }
        .manual-toc-item { padding: 8px 10px; font-size: .82rem; font-weight: 600; }
        .manual-toc-subitem { padding: 5px 10px 5px 30px; font-size: .78rem; color: #6B7280; }
        .manual-toc-item:hover, .manual-toc-subitem:hover { background: #F3F4F6; }
        @media (max-width: 900px) {
          .manual-layout { flex-direction: column !important; }
          .manual-toc { position: static !important; width: 100% !important; }
        }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ color: '#6B7280', fontSize: '.85rem', margin: 0, maxWidth: 620 }}>
          Guia completo de uso do DigitalBov: como registrar cada lançamento e como cada card/índice do
          sistema é calculado. Use o índice ao lado (ou a busca) para navegar direto até um módulo.
        </p>
        <button className="btn btn-secondary btn-sm" onClick={gerarPDF} disabled={gerando}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className={`ti ti-${gerando ? 'loader' : 'file-type-pdf'}`} style={{ color: '#C0392B' }} />
          {gerando ? 'Gerando...' : 'Exportar PDF'}
        </button>
      </div>

      <div className="manual-layout" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Índice lateral */}
        <aside className="manual-toc" style={{ width: 270, flexShrink: 0, position: 'sticky', top: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <i className="ti ti-search" style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF', fontSize: 14 }} />
              <input
                className="input" placeholder="Buscar no manual..."
                value={busca} onChange={e => setBusca(e.target.value)}
                style={{ width: '100%', paddingLeft: 30 }}
              />
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: '72vh', overflowY: 'auto' }}>
              {indiceFiltrado.map(sec => (
                <div key={sec.id}>
                  <button className="manual-toc-item" onClick={() => irPara(sec.id)}>
                    <i className={`ti ${sec.icone}`} /> {sec.titulo}
                  </button>
                  {sec.subsecoes?.map(sub => (
                    <button key={sub.id} className="manual-toc-subitem" onClick={() => irPara(sub.id)}>
                      {sub.titulo}
                    </button>
                  ))}
                </div>
              ))}
              {indiceFiltrado.length === 0 && (
                <div style={{ fontSize: '.8rem', color: '#9CA3AF', padding: '8px 4px' }}>Nada encontrado para "{busca}".</div>
              )}
            </nav>
          </div>
        </aside>

        {/* Conteúdo — sempre completo (não filtra pela busca), pra exportação em PDF nunca vir cortada. */}
        <div ref={contentRef} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {MANUAL_INDICE.map(item => {
            const Conteudo = CONTEUDOS[item.id]
            return (
              <section key={item.id} id={item.id} style={{ scrollMarginTop: 12 }}>
                {Conteudo ? <Conteudo item={item} /> : <SecaoPlaceholder item={item} />}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
