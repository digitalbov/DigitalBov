const ITEM = { borderBottom: '.5px solid #F3F4F6', padding: '12px 0' }
const Q = { fontSize: '.87rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 6, display: 'flex', gap: 8 }
const A = { fontSize: '.85rem', color: '#374151', lineHeight: 1.75, margin: 0, paddingLeft: 24 }

const FAQ = [
  {
    q: 'Vendi animais e um índice de safra não mudou — está errado?',
    a: 'Não. Os índices de Metas são históricos: pertencem à safra (o ciclo da monta) em que aconteceram, e não são recalculados quando você vende, compra ou muda a situação de um animal depois. É assim de propósito — senão o histórico da fazenda mudaria toda vez que você vendesse gado.',
  },
  {
    q: 'O peso da venda/compra não entrou no cálculo de GMD, por quê?',
    a: 'Porque a pesagem gerada por uma venda ou compra registra o peso MÉDIO da categoria negociada, não o peso individual real do animal. O GMD (em Pesagens, Rebanho e Metas) usa só pesagens de manejo (nascimento, desmama, sobreano, intermediária) — exceto se o animal nunca foi pesado por manejo, aí ela é usada como último recurso.',
  },
  {
    q: 'Por que preciso ratear uma despesa entre proprietários?',
    a: 'Porque o sistema calcula receita, despesa e resultado por proprietário (relatórios, comparativos), e isso só funciona se cada lançamento disser quanto é de cada um. Em despesa, o rateio é obrigatório — se você deixar em branco, o sistema divide igualmente sozinho ao salvar. Em receita, é opcional.',
  },
  {
    q: 'Não consigo lançar uma data — por quê?',
    a: 'Três causas possíveis: (1) a data é anterior ao nascimento do animal envolvido — o sistema nunca aceita isso; (2) a data cai num ciclo já encerrado (mais de 180 dias após o fim dele) — esse ciclo virou só leitura; (3) você não tem permissão de edição no módulo — peça para o administrador da conta checar em Usuários.',
  },
  {
    q: 'Excluí uma venda — o que acontece com os animais?',
    a: 'Eles voltam automaticamente para "ativo" (a menos que já tenham sido vendidos de novo ou marcados como mortos desde então). As despesas de comissão, imposto e frete ligadas àquela venda também são excluídas junto.',
  },
  {
    q: 'Não consigo excluir uma compra — por quê?',
    a: 'Excluir uma compra apaga os animais que ela cadastrou — mas só consegue se nenhum deles tiver ganhado pesagem de manejo, procedimento sanitário, evento reprodutivo ou outra transação desde então. Se algum tiver, a exclusão inteira é recusada, e o aviso diz exatamente qual animal e qual histórico está travando.',
  },
  {
    q: 'A Taxa de Prenhez (ou outro indicador) aparece "Aguardando" — é erro?',
    a: 'Não. "Aguardando..." (ex: "Aguardando partos", "Aguardando desmames") aparece quando ainda não existe nenhum evento daquele tipo na safra em andamento — é bem diferente de 0%, que pareceria "deu errado". Já a Taxa de Prenhez em si mostra "Sem dados suficientes" quando ainda não há nenhuma inseminação lançada no ciclo — mesma ideia, texto genérico.',
  },
  {
    q: 'Qual a diferença entre os 3 modos (Inseminação / Monta Natural / Consolidado)?',
    a: 'Inseminação e Monta Natural filtram os indicadores só pelos lotes daquele tipo. Consolidado NÃO é a média dos dois — ele recalcula cada fórmula do zero usando todos os lotes juntos, o que pode dar um número diferente de uma média simples.',
  },
  {
    q: 'Qual a diferença entre "lote" de manejo e "lote" de monta?',
    a: 'O lote em Propriedade é só um agrupamento de animais para organizar o dia a dia (sem relação com reprodução). O lote de inseminação/monta, em Gestão Reprodutiva, é o registro de uma monta (IA ou touro solto) que alimenta os índices de safra. Um mesmo animal pode estar nos dois ao mesmo tempo, sem nenhuma ligação entre eles.',
  },
  {
    q: 'Por que o valor do rebanho no Painel não bate com a produção em Metas?',
    a: 'São coisas diferentes por definição. O Painel mostra "o que eu tenho hoje" — só animais com situação ativa neste exato momento. Os indicadores de Produção em Metas são históricos de uma safra específica, e incluem bezerros daquela safra mesmo que já tenham sido vendidos, mortos ou trocado de categoria depois. Não é inconsistência: um mede o patrimônio atual, o outro mede o que aconteceu num período fechado.',
  },
  {
    q: 'Meu operador não vê um botão que eu vejo — por quê?',
    a: 'Permissões são por módulo e por fazenda. Se o nível dele num módulo é "Ver", os botões de criar/editar/excluir ficam escondidos — só quem tem "Ver e editar" naquele módulo, naquela fazenda, os vê. Ajuste em Usuários → Gerenciar.',
  },
  {
    q: 'Não consigo mais editar um lançamento/ciclo antigo — por quê?',
    a: 'Cada ciclo tem 180 dias de carência depois do fim (30/06) para ajustes. Depois disso ele vira "encerrado — leitura": consulta continua liberada, mas nenhum lançamento ou edição é aceito nele.',
  },
]

export default function SecaoFAQ({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>
      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 14 }}>
        Dúvidas que costumam aparecer no dia a dia — respostas curtas, com a seção do manual que explica o
        assunto com mais detalhe entre parênteses quando fizer sentido conferir.
      </p>
      <div>
        {FAQ.map((f, i) => (
          <div key={i} style={ITEM}>
            <p style={Q}>❓ {f.q}</p>
            <p style={A}>{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
