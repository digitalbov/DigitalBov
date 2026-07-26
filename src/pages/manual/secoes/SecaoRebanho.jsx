import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }
const UL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }

export default function SecaoRebanho({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        <strong>Controle de Rebanho</strong> é uma visão mais detalhada do rebanho do que o Painel — com
        composição, índices do ciclo, comparação entre ciclos e valor de mercado. Tem 5 abas:
        <strong> Visão Geral</strong>, <strong>Índices</strong>, <strong>Comparativo</strong>,
        <strong> Histórico</strong> e <strong>Valor de Mercado do Rebanho</strong>. Um filtro de proprietário
        no topo se aplica a todas.
      </p>

      <h4 style={H4}>Visão Geral</h4>
      <p style={P}>
        KPIs de animais ativos, matrizes, fêmeas/machos e área útil, mais dois gráficos: composição do
        rebanho por categoria, e distribuição por proprietário.
      </p>

      <h4 style={H4}>Índices</h4>
      <p style={P}>
        Tem seletor de ciclo próprio (independente do resto da tela). Mostra taxa de prenhez, matrizes
        expostas e prenhas no ciclo, nascimentos no ciclo, inseminações (serviços) e o <strong>GMD de
        terneiros (0-12 meses)</strong> — total, fêmeas e machos.
      </p>
      <AlertBox type="green" icon="ti-arrows-diff"
        title="O GMD aqui é o MESMO cálculo e cohort de Metas e Indicadores"
        body='Mesma fórmula, mesmo filtro de pesagens de manejo (compra/venda não conta) e mesma âncora de safra: um bezerro nascido no ciclo seguinte, mas gerado por uma monta deste ciclo, ainda entra na conta daqui. Partos sem nenhum lote de monta vinculado (avulsos) ficam de fora, igual em Metas. Selecionando o mesmo ciclo nas duas telas, os números devem bater — se não baterem, é um bom sinal de que algo está cadastrado errado.' />

      <h4 style={H4}>Comparativo</h4>
      <p style={P}>
        Uma tabela com todos os ciclos já cadastrados lado a lado: matrizes expostas, inseminações, prenhas,
        taxa de prenhez, nascimentos, receitas, despesas e resultado.
      </p>
      <p style={P}>
        Com o filtro de proprietário ativo, vendas e compras de animais não entram nos números de
        receita/despesa — essas transações não têm um proprietário definido no sistema, só nascimentos e
        lançamentos com rateio conseguem ser filtrados por proprietário.
      </p>

      <h4 style={H4}>Histórico</h4>
      <p style={P}>
        Gráfico e tabela de nascimentos, vendas e compras por ciclo, com uma coluna "Variação líquida"
        (nascimentos − vendas). É uma estimativa de crescimento do plantel — o sistema não guarda uma foto do
        total de animais em cada ciclo passado, então esse número é calculado, não armazenado.
      </p>

      <h4 style={H4}>Valor de Mercado do Rebanho</h4>
      <p style={P}>
        A mesma tabela do Painel (categoria × peso médio × preço/kg de Financeiro → Parâmetros), aqui também
        quebrada por proprietário. O botão <strong>"Ajustar preços (Parâmetros)"</strong> leva direto para lá.
      </p>
      <AlertBox type="amber" icon="ti-report-money"
        title="Considera só animais ativos — é 'o que tenho hoje'"
        body="Mesmo aviso do Painel: essa tabela muda a cada venda/compra registrada, porque reflete o plantel no momento em que você abre a tela — não é um índice histórico de safra como os de Metas e Indicadores." />
    </div>
  )
}
