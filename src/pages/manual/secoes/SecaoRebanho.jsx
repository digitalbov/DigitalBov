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
        composição, índices do ciclo, comparação entre ciclos, valor de mercado e decisão de descarte. Tem 6
        abas: <strong>Visão Geral</strong>, <strong>Índices</strong>, <strong>Comparativo</strong>,
        <strong> Histórico</strong>, <strong>Valor de Mercado do Rebanho</strong> e
        <strong> Ranking de Matrizes</strong>. Um filtro de proprietário no topo se aplica a todas.
      </p>

      <h4 style={H4}>Visão Geral</h4>
      <p style={P}>
        KPIs de animais ativos, matrizes, fêmeas/machos e área útil, mais dois gráficos: composição do
        rebanho por categoria, e distribuição por proprietário.
      </p>

      <h4 style={H4}>Índices</h4>
      <p style={P}>
        Usa o ciclo selecionado no seletor global (topo da tela). Mostra taxa de prenhez, matrizes
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

      <h4 style={H4}>Ranking de Matrizes</h4>
      <p style={P}>
        Transforma os cards de desempenho individual da ficha do animal (Cadastro de Animais) numa lista de
        trabalho: uma linha por matriz ativa da fazenda, para decidir descarte olhando o rebanho inteiro de
        uma vez, em vez de vaca por vaca. Só carrega os dados na primeira vez que você abre esta aba (não pesa
        nas outras 5) — pode levar alguns segundos num rebanho grande.
      </p>
      <p style={P}>
        Colunas: brinco (clicável — abre a ficha completa do animal), idade, categoria, número de partos na
        vida, kg de terneiro desmamado acumulado, <strong>kg desmamado por ano de vida</strong>, taxa de
        desmame (desmamados ÷ partos), safras seguidas sem cria e último desfecho (pariu / abortou / falhou /
        não exposta). Clique em qualquer cabeçalho de coluna pra reordenar por ela.
      </p>
      <AlertBox type="purple" icon="ti-scale"
        title='"Kg desmamado por ano de vida" é a coluna principal — e o critério de ordenação padrão'
        body="É ela que normaliza vacas de idades diferentes: sem dividir pela idade, uma vaca mais velha sempre pareceria melhor só por ter tido mais partos ao longo da vida, mesmo produzindo no mesmo ritmo (ou pior) que uma novilha mais jovem. A lista abre ordenada por essa coluna, da maior para a menor." />
      <p style={P}>
        Matrizes já aptas mas que ainda não tiveram nenhum parto (1ª safra) não entram nessa lista ordenada —
        sem parto nenhum, não haveria denominador pra calcular kg/ano ou taxa de desmame, e elas apareceriam
        como "as piores" só por falta de histórico. Ficam listadas separadamente, num quadro "Sem histórico
        suficiente", só pra você saber que existem.
      </p>
      <AlertBox type="amber" icon="ti-alert-triangle"
        title='Selo de atenção: 2 safras seguidas sem cria'
        body='É só um SINAL VISUAL pra olhar com mais cuidado — não é uma recomendação de descarte. Uma vaca pode estar em 2 safras sem cria por vários motivos (doença, venda de embrião, decisão proposital de descanso) que só quem conhece o rebanho sabe avaliar. A decisão final é sempre do produtor.' />
    </div>
  )
}
