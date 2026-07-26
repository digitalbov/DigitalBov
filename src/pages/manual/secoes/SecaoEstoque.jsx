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

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Exclusão e reversão de movimentações</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Na aba Movimentar, cada lançamento tem um ícone de ação:
      </p>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>🗑️ Lixeira, numa saída</strong> — exclui a saída e <strong>devolve</strong> a quantidade ao estoque.</li>
        <li><strong>↩️ Seta circular, numa entrada</strong> — reverte a entrada, removendo a quantidade do estoque. Se isso deixaria o saldo negativo, o sistema recusa e avisa o saldo atual e o tamanho da entrada.</li>
      </ul>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Os dois avisam antes de confirmar, informando o saldo antes e depois — e "Esta ação não pode ser
        desfeita" depois de confirmada.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Badge "Sanidade"</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8 }}>
        Movimentações de saída geradas pela baixa automática de um procedimento sanitário aparecem com o selo{' '}
        <Badge color="purple">Sanidade</Badge> na coluna Motivo. Essas linhas <strong>não podem ser excluídas
        nem revertidas direto por aqui</strong> — clicar no ícone mostra o aviso "Esta baixa veio de um
        registro de Sanidade — para revertê-la, exclua o procedimento correspondente na tela Sanidade." O
        caminho certo é excluir o procedimento na tela Sanidade, que devolve o estoque e mantém os dois
        módulos consistentes.
      </p>
    </div>
  )
}
