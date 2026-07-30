import { AlertBox } from '../../../components/UI'

export default function SecaoRelatorios({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        O <strong>Relatório de Fechamento</strong> reúne, em 3 abas exportáveis em PDF separadamente, um
        retrato completo e formal da fazenda para imprimir ou enviar — pensado para reuniões, banco,
        prestação de contas a sócios/proprietários ou fechamento de safra.
      </p>

      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Resumo Geral</strong> — animais ativos/inativos, matrizes, nascimentos, área útil, composição do rebanho, <strong>conciliação de rebanho</strong> (abertura + movimentações = fechamento), valor estimado do rebanho por categoria (mesma regra da tela Painel: só animais ativos) e índices principais do ciclo.</li>
        <li><strong>Reprodução</strong> — lotes de inseminação (agrupados por estação de monta quando o ciclo tem mais de uma), nascimentos e o conjunto completo de índices reprodutivos, com mais detalhe.</li>
        <li><strong>Financeiro</strong> — receitas, despesas, resultado, saldo anterior, caixa acumulado, resultado por proprietário, e um conjunto ampliado de indicadores de rentabilidade.</li>
      </ul>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Use as pílulas de proprietário no topo para filtrar qualquer uma das 3 abas por um proprietário
        específico — os números recalculam pelo rateio dele, não é uma simples divisão do total.
      </p>

      <div id="relatorios-conciliacao" style={{ scrollMarginTop: 90 }}>
        <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Conciliação de rebanho</h4>
        <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }}>
          É a conta central de um fechamento: <strong>inventário de abertura do ciclo + nascimentos + compras
          − mortes − vendas = inventário de fechamento</strong>. O período usado é sempre o início/fim do
          ciclo selecionado (nunca ano civil). O sistema mostra as duas pontas — o valor calculado somando as
          movimentações, e a contagem direta de animais na data de fechamento — e sinaliza visualmente se elas
          batem. Abaixo, a mesma conta é feita por categoria (Vaca, Novilha, Terneiro etc.) na data de
          abertura e na data de fechamento.
        </p>
        <AlertBox type="green" icon="ti-clipboard-list"
          title="Se a conciliação não fechar"
          body="Uma diferença entre o calculado e a contagem real quase sempre indica um lançamento de compra, venda ou morte fora do período do ciclo (data errada) — ou um animal com baixa registrada sem o motivo correto. Revise Rebanho e Estoque/Financeiro antes de considerar o fechamento válido." />
      </div>

      <div id="relatorios-reprodutivos" style={{ scrollMarginTop: 90 }}>
        <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Índices reprodutivos</h4>
        <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }}>
          Além de Taxa de Prenhez e Taxa de Aproveitamento, a aba Reprodução traz Taxa de Parição, Eficiência
          Gestacional, Abortos registrados, Perda gestacional, Mortalidade de terneiros, Taxa de desmama,
          Intervalo de partos, Peso médio ao nascer, GMD médio da safra e % de matrizes pendentes de
          diagnóstico — as mesmas fórmulas e a mesma âncora na <strong>safra da monta</strong> (nunca no ciclo
          do evento) já usadas em Metas e Indicadores e no painel Reprodutivo, para nunca haver dois números
          diferentes para o mesmo indicador em telas diferentes. Veja a seção <strong>Metas e
          Indicadores</strong> para o detalhe de cada fórmula, inclusive a diferença entre Taxa de Parição
          (÷ expostas) e Eficiência Gestacional (÷ prenhas).
        </p>
      </div>

      <div id="relatorios-estacoes" style={{ scrollMarginTop: 90 }}>
        <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Estação de monta × ciclo</h4>
        <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }}>
          Um ciclo (unidade financeira/fechamento) pode conter mais de uma estação de monta (unidade
          biológica). Quando isso acontece, a aba Reprodução detalha lotes e índices <strong>por
          estação</strong> — com subtotal de cada uma — além do <strong>consolidado do ciclo</strong>. Lotes
          nunca vinculados a uma estação formal aparecem agrupados como "Avulsos". Com uma única estação no
          ciclo, a tela mostra só o consolidado (o detalhe seria redundante).
        </p>
      </div>

      <div id="relatorios-financeiro" style={{ scrollMarginTop: 90 }}>
        <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Índices financeiros</h4>
        <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
          <li><strong>Saldo anterior</strong> e <strong>Caixa acumulado</strong> — mesmo cálculo já usado em Financeiro &gt; Resumo: soma de todos os ciclos anteriores da fazenda, e saldo anterior + resultado deste ciclo. Nunca entram no Resultado do ciclo em si.</li>
          <li><strong>Resultado por proprietário</strong> — receitas/despesas/resultado de cada proprietário, pelo mesmo rateio usado no resto do sistema (só aparece quando há mais de um proprietário e nenhum filtro está ativo).</li>
          <li><strong>Custo por matriz</strong> e <strong>Receita por matriz</strong> — despesa/receita do ciclo ÷ matrizes aptas na data da primeira monta do ciclo (não o rebanho de hoje — importante para ciclos encerrados no passado).</li>
          <li><strong>Custo por terneiro</strong> — despesa do ciclo ÷ terneiros nascidos na safra.</li>
          <li><strong>Ticket médio de venda/compra</strong> — valor total ÷ quantidade de animais das transações de compra/venda registradas no ciclo.</li>
        </ul>
      </div>

      <AlertBox type="green" icon="ti-list-check"
        title="Receitas/Despesas por grupo mostram TODOS os grupos que tiveram movimento"
        body='A lista de grupos não é uma lista fixa — ela é montada a partir dos lançamentos reais do período, incluindo grupos criados por você em Financeiro (mesmo os digitados à mão) e os grupos automáticos de Comissão/Impostos/Frete/Monta Natural. A soma de tudo que aparece nessa lista bate exatamente com o total de receitas/despesas mostrado acima — se um grupo não tiver nenhum lançamento no período, ele simplesmente não aparece na lista.' />

      <AlertBox type="purple" icon="ti-file-type-pdf"
        title="Estilo do PDF: capa e seções numeradas"
        body="Cada um dos 3 PDFs traz capa com fazenda/período/proprietários, seções numeradas e rodapé com paginação — pronto para imprimir ou enviar." />
    </div>
  )
}
