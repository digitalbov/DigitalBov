import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calcCategoriaRebanho, labelProcedimentoSanidade, sortBrinco } from '../lib/helpers'
import { Modal, Loading, Badge } from './UI'

// "animal" no singular, "animais" no plural -- nunca "animalis" (typo de
// concatenar "animal"+"is") nem plural fixo pro singular. Único lugar que
// pluraliza isso; usado pelo botão abaixo e pelo título do modal.
const qtdAnimaisTexto = (qt) => `${qt} ${qt === 1 ? 'animal' : 'animais'}`

// Gatilho "62 animais" clicável — substitui a antiga célula que despejava
// todos os brincos (ilegível em procedimentos de rebanho inteiro). Usado nas
// mesmas telas que ModalAnimaisSanidade, sempre em par com ela. Preto e
// negrito (tipografia padrão do sistema, sem sublinhado/cor de link) — o
// peso já basta como pista de que é clicável, mesmo critério de outros
// botões-texto do app que não usam sublinhado.
export function BotaoQtdAnimais({ quantidade, onClick, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background:'none', border:'none', padding:0, margin:0,
        color:'var(--gray-900)', fontWeight:700, cursor:'pointer',
        fontSize:'inherit', whiteSpace:'nowrap', ...style,
      }}
    >
      {qtdAnimaisTexto(quantidade || 0)}
    </button>
  )
}

// Lista de animais de UM procedimento sanitário — aberta a partir da
// coluna "Grupo/Lote" (que antes despejava todos os brincos numa célula só,
// ilegível em procedimentos de rebanho inteiro). Único componente que faz
// isso: usado em Registros/Calendário de vacinação/Alertas/Histórico
// (Sanidade.jsx) e nos eventos de Manejo Sanitário do módulo Calendário
// (Calendario.jsx) — nenhuma das duas telas duplica esta busca/render.
//
// `procedimento` é o registro de procedimentos_sanitarios (precisa de id,
// tipo, procedimento, quantidade); null/undefined mantém o modal fechado.
// Categoria (calcCategoriaRebanho) e Lote (animal.lote.nome) são as MESMAS
// derivações já usadas no resto do app — nenhum critério novo.
export default function ModalAnimaisSanidade({ procedimento, onClose }) {
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState(false)
  const [linhas,     setLinhas]     = useState([])

  useEffect(() => {
    if (!procedimento) return
    let cancelado = false
    setCarregando(true)
    setErro(false)
    // Zera antes de buscar -- sem isso, trocar de procedimento rápido (fechar
    // um e abrir outro) mostraria por um instante a QUANTIDADE do anterior no
    // título (linhas.length ainda com o valor velho) por trás do spinner.
    setLinhas([])
    db.sanidadeAnimais.listPorProcedimento(procedimento.id).then(({ data, error }) => {
      if (cancelado) return
      if (error) { setErro(true); setCarregando(false); return }
      const ls = sortBrinco(
        (data || [])
          .filter(v => v.animal)
          .map(v => ({
            id:        v.animal.id,
            brinco:    v.animal.brinco,
            categoria: calcCategoriaRebanho(v.animal.data_nascimento, v.animal.sexo, v.animal.sit_reprodutiva, v.animal.is_touro),
            lote:      v.animal.lote?.nome || '—',
            situacao:  v.animal.situacao,
            termo:     labelProcedimentoSanidade(procedimento.tipo, v.animal.sexo),
          }))
      )
      setLinhas(ls)
      setCarregando(false)
    })
    return () => { cancelado = true }
  }, [procedimento?.id])

  return (
    <Modal open={!!procedimento} onClose={onClose} width={640}
      title={procedimento ? `${qtdAnimaisTexto(linhas.length || procedimento.quantidade || 0)} — ${procedimento.procedimento}` : ''}>
      {carregando ? <Loading text="Carregando animais..." />
        : erro ? <div style={{ padding:'8px 0', color:'#791F1F', fontSize:'.85rem' }}>Não foi possível carregar a lista de animais.</div>
        : linhas.length === 0 ? <div style={{ padding:'8px 0', color:'#9CA3AF', fontSize:'.85rem' }}>Nenhum animal vinculado a este procedimento.</div>
        : (
          // Cabeçalho e rodapé do <Modal> ficam parados; só esta área rola —
          // suporta 100+ linhas sem virar rolagem infinita da página inteira,
          // e sem paginação/virtualização (tabela HTML simples aguenta de
          // sobra até várias centenas de linhas).
          <div style={{ maxHeight:'55vh', overflowY:'auto', border:'.5px solid #E5E7EB', borderRadius:8 }}>
            <table style={{ width:'100%' }}>
              <thead style={{ position:'sticky', top:0, background:'#F9FAFB', zIndex:1 }}>
                <tr>
                  <th>Brinco</th>
                  <th>Categoria</th>
                  <th>Lote</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight:500 }}>{l.brinco}</td>
                    <td style={{ fontSize:'.82rem', color:'#4B5563' }}>{l.categoria}</td>
                    <td style={{ fontSize:'.82rem', color:'#4B5563' }}>{l.lote}</td>
                    <td style={{ fontSize:'.82rem', fontWeight:'normal' }}>
                      {l.termo}
                      {l.situacao === 'vendido' && <Badge color="amber" style={{ marginLeft:6 }}>Vendido</Badge>}
                      {l.situacao === 'morto'   && <Badge color="red"   style={{ marginLeft:6 }}>Morto</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </Modal>
  )
}
