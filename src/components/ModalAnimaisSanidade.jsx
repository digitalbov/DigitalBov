import { useState, useEffect } from 'react'
import { db } from '../lib/supabase'
import { calcCategoriaRebanho, labelProcedimentoSanidade, sortBrinco } from '../lib/helpers'
import { Modal, Loading, Badge } from './UI'
import Filtros from './Filtros'

const FILTROS_VAZIO = { categoria: '', lote: '', proprietario: '' }

// "animal" no singular, "animais" no plural -- nunca "animalis" (typo de
// concatenar "animal"+"is") nem plural fixo pro singular. Único lugar que
// pluraliza isso; usado pelo botão e pelo título do modal aqui embaixo, e
// por qualquer outro texto de quantidade de animais fora deste arquivo
// (ex: Sanidade.jsx::confirmarConclusao) -- exportada pra não duplicar.
export const qtdAnimaisTexto = (qt) => `${qt} ${qt === 1 ? 'animal' : 'animais'}`

// Gatilho "62 animais 🔍" clicável — substitui a antiga célula que despejava
// todos os brincos (ilegível em procedimentos de rebanho inteiro). Usado nas
// mesmas telas que ModalAnimaisSanidade, sempre em par com ela. Mesmo
// tamanho/fonte das outras colunas (herda da célula — ver `font: inherit`
// abaixo), sem negrito; cor cinza padrão (--gray-400, o mesmo tom da aba
// Histórico desta tela — ex: "N registros" -- nenhum tom novo). A pista de
// clicável é a lupa (ti-search, mesmo conjunto Tabler do resto do app),
// pequena e alinhada ao texto. Ícone é decorativo (aria-hidden) -- o botão
// inteiro (texto + lupa) é o alvo de clique e carrega o rótulo acessível.
export function BotaoQtdAnimais({ quantidade, onClick, style }) {
  const texto = qtdAnimaisTexto(quantidade || 0)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Ver lista de ${texto} deste procedimento`}
      style={{
        background:'none', border:'none', padding:0, margin:0,
        // `<button>` não herda tipografia da célula por padrão (regra do
        // navegador, não do app) -- `font-size: inherit` sozinho não é
        // suficiente em todo navegador (line-height/family ficam pra trás e
        // o texto ainda destoa). `font: inherit` (shorthand completo) puxa
        // tudo do <td>/<span> pai — inclusive o peso, que aqui fica normal.
        font:'inherit', color:'var(--gray-400)', cursor:'pointer',
        display:'inline-flex', alignItems:'center', gap:4, whiteSpace:'nowrap',
        ...style,
      }}
    >
      {texto}
      <i className="ti ti-search" aria-hidden="true" style={{ fontSize:'.85em' }} />
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
// Categoria (calcCategoriaRebanho), Lote e Proprietário (animal.lote/
// proprietario.nome) são as MESMAS derivações já usadas no resto do app —
// nenhum critério novo.
//
// Filtros (Categoria/Lote/Proprietário) são ESTADO LOCAL deste modal, nunca
// saem dele: filtram só a tabela aqui dentro, nunca a tela por trás, e
// voltam a vazio toda vez que o modal fecha/reabre (mesmo efeito que já
// zera `linhas` abaixo, mesmo gatilho — procedimento?.id). O número no botão
// que abre o modal (BotaoQtdAnimais, nas telas que chamam este componente)
// usa SEMPRE procedimento.quantidade, que este componente nunca toca — o
// total exibido lá fora nunca reflete o filtro local daqui.
//
// <Filtros compacto> — exceção deliberada (ver comentário de `compacto` em
// Filtros.jsx): dentro do modal não há largura pro formato desktop (todos
// os campos lado a lado), então força o formato botão+painel do celular
// mesmo aqui, não é decisão de largura de tela.
export default function ModalAnimaisSanidade({ procedimento, onClose }) {
  const [carregando, setCarregando] = useState(false)
  const [erro,       setErro]       = useState(false)
  const [linhas,     setLinhas]     = useState([])
  const [filtros,    setFiltros]    = useState(FILTROS_VAZIO)

  useEffect(() => {
    if (!procedimento) return
    let cancelado = false
    setCarregando(true)
    setErro(false)
    // Zera antes de buscar -- sem isso, trocar de procedimento rápido (fechar
    // um e abrir outro) mostraria por um instante a QUANTIDADE do anterior no
    // título (linhas.length ainda com o valor velho) por trás do spinner.
    setLinhas([])
    setFiltros(FILTROS_VAZIO)
    db.sanidadeAnimais.listPorProcedimento(procedimento.id).then(({ data, error }) => {
      if (cancelado) return
      if (error) { setErro(true); setCarregando(false); return }
      const ls = sortBrinco(
        (data || [])
          .filter(v => v.animal)
          .map(v => ({
            id:               v.animal.id,
            brinco:           v.animal.brinco,
            categoria:        calcCategoriaRebanho(v.animal.data_nascimento, v.animal.sexo, v.animal.sit_reprodutiva, v.animal.is_touro),
            loteId:           v.animal.lote?.id || '',
            lote:             v.animal.lote?.nome || '—',
            proprietarioId:   v.animal.proprietario?.id || '',
            proprietario:     v.animal.proprietario?.nome || '—',
            situacao:         v.animal.situacao,
            termo:            labelProcedimentoSanidade(procedimento.tipo, v.animal.sexo),
          }))
      )
      setLinhas(ls)
      setCarregando(false)
    })
    return () => { cancelado = true }
  }, [procedimento?.id])

  // Opções dos 3 filtros vêm só do que de fato aparece NESTA lista (não do
  // rebanho inteiro da fazenda) -- oferecer um lote/proprietário sem nenhum
  // animal neste procedimento resultaria sempre em "0 de N", inútil aqui.
  const opcoesDe = (chave, rotuloTodos) => {
    const vistos = new Map()
    linhas.forEach(l => {
      const valor = chave === 'categoria' ? l.categoria : chave === 'lote' ? l.loteId : l.proprietarioId
      const label = chave === 'categoria' ? l.categoria : chave === 'lote' ? l.lote : l.proprietario
      if (valor && !vistos.has(valor)) vistos.set(valor, label)
    })
    return [{ valor: '', label: rotuloTodos }, ...[...vistos.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([valor, label]) => ({ valor, label }))]
  }
  const itensFiltro = [
    { chave: 'categoria',    tipo: 'select', label: 'Categoria',    quick: true, opcoes: opcoesDe('categoria', 'Todas as categorias') },
    { chave: 'lote',         tipo: 'select', label: 'Lote',         quick: true, opcoes: opcoesDe('lote', 'Todos os lotes') },
    { chave: 'proprietario', tipo: 'select', label: 'Proprietário', quick: true, opcoes: opcoesDe('proprietario', 'Todos os proprietários') },
  ]

  const linhasFiltradas = linhas.filter(l =>
    (!filtros.categoria    || l.categoria      === filtros.categoria) &&
    (!filtros.lote         || l.loteId         === filtros.lote) &&
    (!filtros.proprietario || l.proprietarioId === filtros.proprietario)
  )

  return (
    <Modal open={!!procedimento} onClose={onClose} width={640}
      title={procedimento ? `${qtdAnimaisTexto(linhas.length || procedimento.quantidade || 0)} — ${procedimento.procedimento}` : ''}>
      {carregando ? <Loading text="Carregando animais..." />
        : erro ? <div style={{ padding:'8px 0', color:'#791F1F', fontSize:'.85rem' }}>Não foi possível carregar a lista de animais.</div>
        : linhas.length === 0 ? <div style={{ padding:'8px 0', color:'#9CA3AF', fontSize:'.85rem' }}>Nenhum animal vinculado a este procedimento.</div>
        : (
          <>
            <div style={{ marginBottom:10 }}>
              <Filtros compacto itens={itensFiltro} valores={filtros}
                onChange={(chave, valor) => setFiltros(prev => ({ ...prev, [chave]: valor }))} />
            </div>
            <div style={{ fontSize:'.78rem', color:'#6B7280', marginBottom:6 }}>
              {linhasFiltradas.length === linhas.length
                ? qtdAnimaisTexto(linhas.length)
                : `${linhasFiltradas.length} de ${qtdAnimaisTexto(linhas.length)}`}
            </div>
            {linhasFiltradas.length === 0
              ? <div style={{ padding:'8px 0', color:'#9CA3AF', fontSize:'.85rem' }}>Nenhum animal encontrado com esse filtro.</div>
              : (
                // Cabeçalho e rodapé do <Modal> ficam parados; só esta área
                // rola — suporta 100+ linhas sem virar rolagem infinita da
                // página inteira, e sem paginação/virtualização (tabela HTML
                // simples aguenta de sobra até várias centenas de linhas).
                <div style={{ maxHeight:'50vh', overflowY:'auto', border:'.5px solid #E5E7EB', borderRadius:8 }}>
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
                      {linhasFiltradas.map(l => (
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
          </>
        )
      }
    </Modal>
  )
}
