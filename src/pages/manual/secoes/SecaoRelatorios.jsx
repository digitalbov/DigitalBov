import { AlertBox } from '../../../components/UI'

export default function SecaoRelatorios({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Relatórios</strong> reúne, em 3 abas exportáveis em PDF separadamente, um retrato
        completo da fazenda para imprimir ou enviar — bom para reuniões, banco ou prestação de contas.
      </p>

      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Resumo Geral</strong> — animais ativos/inativos, matrizes, nascimentos, área útil, composição do rebanho, valor estimado do rebanho por categoria (mesma regra da tela Painel: só animais ativos) e índices reprodutivos do ciclo.</li>
        <li><strong>Reprodução</strong> — os mesmos índices reprodutivos, com mais detalhe.</li>
        <li><strong>Financeiro</strong> — receitas, despesas, resultado, indicadores de rentabilidade (ROI, margem), e as tabelas <strong>Receitas por grupo</strong> e <strong>Despesas por grupo</strong>.</li>
      </ul>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Use as pílulas de proprietário no topo para filtrar qualquer uma das 3 abas por um proprietário
        específico — os números recalculam pelo rateio dele, não é uma simples divisão do total.
      </p>

      <AlertBox type="green" icon="ti-list-check"
        title="Receitas/Despesas por grupo mostram TODOS os grupos que tiveram movimento"
        body='A lista de grupos não é uma lista fixa — ela é montada a partir dos lançamentos reais do período, incluindo grupos criados por você em Financeiro (mesmo os digitados à mão) e os grupos automáticos de Comissão/Impostos/Frete/Monta Natural. A soma de tudo que aparece nessa lista bate exatamente com o total de receitas/despesas mostrado acima — se um grupo não tiver nenhum lançamento no período, ele simplesmente não aparece na lista.' />
    </div>
  )
}
