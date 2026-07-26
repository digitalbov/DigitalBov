import { AlertBox } from '../../../components/UI'

export default function SecaoComparativo({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Comparativo</strong> só aparece (com dado de verdade) se você administra mais de uma
        fazenda na mesma conta — coloca todas lado a lado no mesmo ciclo, para você ver qual está indo melhor
        em quê.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Abas</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Financeiro</strong> — receitas, despesas e resultado de cada fazenda no ciclo selecionado.</li>
        <li><strong>Zootécnico</strong> — matrizes, taxa de prenhez e composição de rebanho de cada fazenda.</li>
        <li><strong>Por fazenda</strong> — um resumo lado a lado, uma coluna por fazenda.</li>
      </ul>

      <AlertBox type="amber" icon="ti-calendar-event"
        title='As fazendas são alinhadas pelo NOME do ciclo, não pela data exata'
        body='Cada fazenda tem seu próprio registro de ciclo no banco — o Comparativo junta os dados de todas usando o nome do ciclo (ex: "2025/26") como referência comum, já que os ciclos das duas costumam ter os mesmos períodos (01/07 a 30/06). Se uma fazenda não tiver um ciclo com aquele nome ainda criado, ela simplesmente aparece sem dado nessa comparação.' />
      <AlertBox type="green" icon="ti-info-circle"
        title="Mesmas regras das outras telas"
        body='Os números financeiros vêm só de lancamentos_financeiros (nunca de transações de compra/venda soltas), e a contagem de rebanho considera só animais ativos — as mesmas fontes e critérios usados no Painel e em Relatórios.' />
    </div>
  )
}
