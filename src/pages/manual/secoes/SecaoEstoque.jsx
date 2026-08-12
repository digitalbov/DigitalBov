import { AlertBox, Badge } from '../../../components/UI'

export default function SecaoEstoque({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Estoque</strong> controla medicamentos, vacinas, sêmen, suplementos e ração: quanto
        você tem, quando vence e alertas de reposição.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Abas do módulo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Inventário</strong> — lista de itens cadastrados, saldo atual, barra de mínimo e alerta de vencimento.</li>
        <li><strong>Movimentar</strong> — lançar entradas (compras) e saídas (uso), e excluir/reverter movimentações.</li>
        <li><strong>Alertas</strong> — itens abaixo do mínimo e lotes vencidos/a vencer, tudo num só lugar.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: cadastrar um item novo</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo item"</strong> e informe o nome (ex: "Ivermectina 1%").</li>
        <li>Escolha a <strong>categoria</strong>: Medicamento, Vacina, Sêmen, Suplemento, Ração ou Outro.</li>
        <li>Informe a <strong>unidade</strong> (texto livre: ml, kg, dose, L...), preço unitário e estoque mínimo — todos opcionais.</li>
        <li>Se já tiver uma quantidade em mãos, preencha <strong>"Quantidade inicial"</strong> — isso vira automaticamente uma entrada de estoque de verdade, com sua própria data e validade, não é só um número solto no cadastro.</li>
        <li>Com quantidade inicial preenchida e permissão nos dois módulos, aparece o mesmo checkbox
          <strong> "Lançar também como despesa no financeiro"</strong> do "Movimentar" (veja abaixo) — é
          <strong> opcional</strong>: se este estoque já existia antes do sistema (não foi uma compra de
          verdade), simplesmente não marque.</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: lançar entrada ou saída</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Na aba <strong>Movimentar</strong>, clique em "Nova movimentação".</li>
        <li>Escolha o <strong>tipo</strong>: "Entrada (compra)" ou "Saída (uso)".</li>
        <li>Escolha o <strong>item</strong> (o saldo atual aparece do lado do nome) e a <strong>quantidade</strong>.</li>
        <li>Só em entrada: informe a <strong>validade</strong>, se o item tiver — cada entrada forma um lote com sua própria validade.</li>
        <li>Descreva o <strong>motivo</strong>, se quiser (ex: "Vermifugação geral"), e clique em <strong>Salvar</strong>.</li>
      </ol>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Gerar despesa ou receita junto (opcional)</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Ao lançar uma <strong>entrada</strong>, se você também tem permissão em Financeiro, aparece o checkbox
        <strong> "Lançar também como despesa no financeiro"</strong> — marque, informe o <strong>valor
        unitário</strong> e o <strong>grupo</strong> (já vem sugerido pela categoria do item, mas você pode
        trocar, ou digitar um grupo novo em <strong>"+ Novo grupo..."</strong>). Ao lançar uma
        <strong> saída</strong>, o checkbox equivalente é <strong>"Lançar também como receita no
        financeiro"</strong> — informe o valor da venda (não tem relação com o preço cadastrado do item) e o
        grupo. Nos dois casos é <strong>opcional</strong>: registrar a movimentação sem tocar no financeiro
        continua funcionando exatamente como sempre. O mesmo checkbox (com os mesmos campos) também aparece
        ao cadastrar um item novo com quantidade inicial — é a mesma mecânica, só que na criação do item em
        vez de numa movimentação avulsa.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Marcando o checkbox aparece também o <strong>rateio por proprietário</strong> — a mesma grade de
        <strong> %</strong> e <strong>R$</strong> por proprietário do "Novo lançamento" do Financeiro, com o
        botão <strong>"Dividir igualmente"</strong>. Em despesa o rateio é <strong>obrigatório</strong>: se
        você deixar em branco, o sistema divide igualmente entre os proprietários sozinho ao salvar; em
        receita é opcional.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        A lista de grupos é sempre a lista pronta do Financeiro somada aos grupos já usados em qualquer
        lançamento da fazenda — inclusive um grupo digitado à mão na tela Financeiro aparece aqui, e
        vice-versa, assim que você salva (sem precisar recarregar a página).
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Validade e FEFO</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Cada entrada forma um "lote" com sua própria validade. Você <strong>não escolhe de qual lote uma
        saída sai</strong> — o sistema calcula sozinho, seguindo a regra <strong>FEFO</strong> (primeiro a
        vencer, primeiro a sair): as saídas são descontadas primeiro do lote que vence mais cedo, depois do
        próximo, e assim por diante. É por isso que o saldo por lote e os avisos de vencimento aparecem
        prontos no Inventário e nos Alertas, sem nenhuma seleção manual na hora de lançar a saída.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Alerta de estoque mínimo</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Um item abaixo do estoque mínimo aparece com uma barra vermelha e um selo <Badge color="amber">Baixo</Badge> no
        Inventário, soma no contador do cabeçalho ("N abaixo do mínimo") e ganha uma entrada própria na aba
        Alertas, mostrando quanto tem, qual o mínimo e quanto falta repor.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Reversão de movimentações</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Na aba Movimentar, toda linha tem o mesmo ícone de ação — <strong>↩️ "Reverter lançamento"</strong>
        (seta circular) — porque é sempre a mesma ação, só o efeito é oposto dependendo do tipo:
      </p>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Numa saída</strong> — reverter <strong>devolve</strong> a quantidade ao estoque.</li>
        <li><strong>Numa entrada</strong> — reverter <strong>remove</strong> a quantidade do estoque. Se isso deixaria o saldo negativo, o sistema recusa e avisa o saldo atual e o tamanho da entrada.</li>
      </ul>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Antes de confirmar, a tela sempre mostra o efeito exato (quanto entra ou sai, saldo antes e depois) —
        e "Esta ação não pode ser desfeita" depois de confirmada.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Badges de origem</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Uma movimentação criada automaticamente por outro módulo mostra um selo na coluna Motivo, ao lado do
        texto:
      </p>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14, paddingLeft: 20 }}>
        <li><Badge color="purple">Manejo Sanitário</Badge> — baixa automática de um procedimento sanitário.</li>
        <li><Badge color="red">Despesa</Badge> — entrada criada junto de uma despesa no Financeiro (pelo lançamento, por "Movimentar" ou pela criação de um item novo, aqui em Estoque).</li>
        <li><Badge color="green">Receita</Badge> — saída criada junto de uma receita no Financeiro.</li>
      </ul>
      <AlertBox type="amber" icon="ti-swords"
        title="Manejo Sanitário só se desfaz pelo Manejo Sanitário — Despesa/Receita se desfazem pelos dois lados"
        body='Uma movimentação com o selo "Manejo Sanitário" não pode ser excluída nem revertida direto por aqui — clicar no ícone mostra o aviso pra ir excluir o procedimento na tela Manejo Sanitário, que devolve o estoque de lá. Já uma movimentação com o selo "Despesa" ou "Receita" PODE ser revertida direto por aqui: reverter também apaga o lançamento financeiro vinculado (exige permissão de Financeiro além de Estoque). Essa diferença é proposital — Manejo Sanitário pode baixar vários itens de uma vez só e por isso "é dono" da baixa; despesa/receita ligam sempre 1 movimentação a 1 lançamento, então qualquer um dos dois lados pode desfazer com segurança.' />
    </div>
  )
}
