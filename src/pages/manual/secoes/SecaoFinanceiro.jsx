import { useState } from 'react'
import { AlertBox } from '../../../components/UI'
import { fmtMoeda } from '../../../lib/helpers'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }
const OL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }
const UL_DISC = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20, listStyle: 'disc' }

// ── Recriação do rateio por proprietário (Financeiro.jsx) — % e R$ ligados,
// mais o botão "Dividir igualmente". Estado 100% local, não grava nada.
function DemoRateio() {
  const total = 1000
  const [linhas, setLinhas] = useState([
    { nome: 'João', pct: '', valor: '' },
    { nome: 'Maria', pct: '', valor: '' },
  ])

  const dividirIgualmente = () => {
    const cada = +(total / linhas.length).toFixed(2)
    setLinhas(linhas.map(l => ({ ...l, pct: (100 / linhas.length).toFixed(1), valor: cada.toFixed(2) })))
  }

  const setPct = (i, v) => {
    const novo = [...linhas]
    novo[i] = { ...novo[i], pct: v, valor: v ? (total * (parseFloat(v) / 100)).toFixed(2) : '' }
    setLinhas(novo)
  }
  const setValor = (i, v) => {
    const novo = [...linhas]
    novo[i] = { ...novo[i], valor: v, pct: v ? ((parseFloat(v) / total) * 100).toFixed(1) : '' }
    setLinhas(novo)
  }

  return (
    <div data-pdf-shot="true" style={{
      border: '1.5px dashed #C7D2E8', borderRadius: 12, padding: 18,
      background: '#F8FAFD', marginTop: 10, marginBottom: 18,
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
        background: '#EEEDFE', color: '#3C3489', borderRadius: 8,
        padding: '3px 10px', fontSize: '.72rem', fontWeight: 700,
      }}>
        <i className="ti ti-flask" /> MODO DEMONSTRAÇÃO — não salva dados reais (lançamento de {fmtMoeda(total)})
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: '.82rem', fontWeight: 600 }}>Rateio por proprietário</span>
        <button className="btn btn-secondary btn-sm" onClick={dividirIgualmente}>Dividir igualmente</button>
      </div>
      {linhas.map((l, i) => (
        <div key={l.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 60, fontSize: '.82rem' }}>{l.nome}</span>
          <input type="number" placeholder="%" value={l.pct} onChange={e => setPct(i, e.target.value)} style={{ width: 70 }} />
          <span style={{ fontSize: '.78rem', color: '#9CA3AF' }}>%</span>
          <input type="number" placeholder="0,00" value={l.valor} onChange={e => setValor(i, e.target.value)} style={{ width: 90 }} />
          <span style={{ fontSize: '.78rem', color: '#9CA3AF' }}>R$</span>
        </div>
      ))}
    </div>
  )
}

export default function SecaoFinanceiro({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        A <strong>Gestão Financeira</strong> reúne lançamentos de receita e despesa, compra e venda de
        animais, resultado por ciclo, os preços usados para estimar o valor do rebanho, e um modo de
        simulação para testar cenários sem afetar nada real. As abas, na ordem: <strong>Resumo</strong>,
        <strong> Lançamentos</strong>, <strong>Compra & Venda</strong>, <strong>Resultados</strong>,
        <strong> Parâmetros</strong>, <strong>Ciclos</strong> e <strong>Simulações</strong>.
      </p>

      <div id="financeiro-resumo" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Resumo</h4>
        <p style={P}>
          No topo, os cards de <strong>Receitas</strong>, <strong>Despesas</strong>, <strong>Resultado</strong>,{' '}
          <strong>Caixa disponível</strong> e <strong>Vendas de animais</strong> do ciclo. Logo abaixo, uma
          faixa compacta com o <strong>ciclo selecionado</strong> (início, encerramento, status e saldo
          anterior). Depois, lado a lado, <strong>Despesas por grupo</strong> e <strong>Receitas por
          grupo</strong> — barras derivadas direto dos lançamentos reais (nunca uma lista fixa: um grupo
          criado pela venda/compra de animais, como "Comissão" ou "Frete", ou digitado à mão em "+ Novo
          grupo...", aparece igual), com o nome do grupo por inteiro, quebrando linha se for longo — nunca
          cortado com reticências, mesmo em nomes que você mesmo digitou. Em tela estreita os dois gráficos
          empilham em vez de espremer. Por fim, o card <strong>Vendas no ciclo</strong>, com a lista de cada
          venda de animais do período.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Resultado × Caixa disponível — não é a mesma coisa</h4>
        <p style={P}>
          <strong>Resultado</strong> é só receitas menos despesas <em>deste ciclo</em> — o desempenho do
          período, isolado. <strong>Caixa disponível</strong> (e a coluna "Caixa acumulado" na aba
          Resultados) é o resultado deste ciclo <strong>somado ao saldo que sobrou dos ciclos
          anteriores</strong> — quanto você realmente tem acumulado, olhando pra trás. Um ciclo pode fechar
          no negativo (Resultado ruim) e ainda assim a fazenda ter Caixa disponível positivo, se sobrou saldo
          de safras passadas — e o contrário também: um ciclo com Resultado ótimo pode conviver com Caixa
          baixo, se ciclos anteriores fecharam no vermelho.
        </p>
        <AlertBox type="purple" icon="ti-wallet"
          title="O saldo anterior nunca vira lançamento, nunca entra no Resultado"
          body='O saldo anterior é calculado só pra exibição — somando o resultado de TODOS os ciclos anteriores da fazenda, direto no banco, toda vez que a tela abre (nunca fica guardado em nenhum lugar). Ele nunca é criado como um lançamento de receita/despesa: se fosse, contaminaria as Receitas/Despesas do ciclo novo e distorceria todos os indicadores (Resultado, custo por terneiro, os gráficos por grupo). Por isso ele aparece sempre em roxo, numa cor diferente de Receita (azul) e Despesa (vermelho) — pra deixar claro que é um número "de fora" deste ciclo. Se você editar ou excluir um lançamento retroativo de um ciclo anterior (dentro da carência de 180 dias), o saldo anterior dos ciclos seguintes já sai corrigido na próxima vez que a tela for aberta — sem precisar recalcular nada manualmente.' />
      </div>

      <div id="financeiro-lancamentos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Lançamentos</h4>
        <p style={P}>
          Clique em <strong>"Novo lançamento"</strong>. Escolha <strong>Tipo</strong> (Despesa ou Receita),
          <strong> Data</strong>, um <strong>Grupo</strong> (uma lista pronta — em Despesa: Medicamentos,
          Suplementos, Mão de Obra, Combustível, Ferramentas, Manutenção, Estrutura, Máquinas e
          Equipamentos, Investimentos, Inseminação, Monta Natural, Frete, entre outros; em Receita: Venda de
          Animais, Valores a Receber, Aporte, Empréstimos, Juros, Outras Receitas — ou crie um grupo novo
          digitando o nome em <strong>"+ Novo grupo..."</strong>), o <strong>Valor</strong> e uma
          <strong> Descrição</strong>. Um grupo digitado à mão aparece nas opções assim que você salva —
          inclusive nas telas de lançamento feito a partir do <strong>Estoque</strong> (e vice-versa): a
          lista de grupos é sempre a lista pronta somada aos grupos já usados em qualquer lançamento da
          fazenda, dos dois módulos.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Vínculo opcional com o Estoque</h4>
        <p style={P}>
          Se você também tem permissão em Estoque, em uma <strong>despesa</strong> aparece o checkbox
          <strong> "Lançar também como entrada no estoque"</strong>: escolha um item existente ou crie um novo
          ali mesmo (com categoria, unidade e <strong>estoque mínimo</strong> — o item fica idêntico a um
          criado pela tela Estoque), informe <strong>quantidade</strong> e <strong>valor unitário</strong> — o
          campo <strong>"Valor total"</strong> no topo do formulário é recalculado sozinho (quantidade ×
          unitário), e vice-versa: se você editar o total direto (por exemplo, copiando de uma nota fiscal), o
          unitário é que se ajusta. O grupo já vem sugerido pela categoria do item (Medicamento/Vacina →
          Medicamentos, Suplemento/Ração → Suplementos, Sêmen → Inseminação), mas continua editável. Numa
          <strong> receita</strong>, o checkbox equivalente é <strong>"Dar baixa no estoque"</strong>: escolha
          o item (só aparecem os com saldo) e a quantidade vendida — o valor da receita continua sendo o valor
          da venda que você digitou, sem relação com o preço cadastrado do item. Os dois são opcionais:
          lançar sem tocar no estoque continua funcionando normalmente.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Rateio por proprietário</h4>
        <p style={P}>
          Se você tem mais de um proprietário cadastrado, aparece um bloco de rateio. Cada proprietário tem
          um campo de <strong>%</strong> e um de <strong>R$</strong> — preencher um calcula o outro sozinho.
          O botão <strong>"Dividir igualmente"</strong> reparte o valor em partes iguais entre todos (até o
          centavo, sem sobrar nem faltar). Em <strong>despesa o rateio é obrigatório</strong>: se você deixar
          em branco e salvar, o sistema aplica a divisão igual sozinho. Em receita é opcional.
        </p>
        <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
          Experimente o rateio abaixo — é uma recriação exata da tela real, mas não grava nada:
        </p>
        <DemoRateio />
        <p style={P}>
          Voz: <em>"Fale nesta ordem: [dia] do [mês] [despesa/receita] [grupo] [valor em reais]
          [descrição]"</em> — ex: "dezoito do sete despesa medicamentos trinta reais vacina aftosa".
        </p>
      </div>

      <div id="financeiro-compra-venda" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Compra & Venda</h4>
        <p style={P}>
          Clique em <strong>"Registrar transação"</strong> e escolha o tipo: <strong>Venda</strong>,
          <strong> Compra</strong>, <strong>Simular venda</strong> ou <strong>Simular compra</strong>.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Venda</h4>
        <ol style={OL}>
          <li>Informe a <strong>data</strong> — animais nascidos depois dela nem aparecem para seleção.</li>
          <li>Filtre por categoria, proprietário e/ou lote, e marque os animais (ou "Selecionar todos do filtro").</li>
          <li>Para cada categoria selecionada, informe <strong>peso médio</strong> e <strong>preço/kg</strong> — pré-preenchidos a partir de Parâmetros na primeira vez.</li>
          <li>Preencha contraparte, comissão, imposto e frete, se houver.</li>
          <li>Clique em <strong>Registrar</strong>.</li>
        </ol>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Compra</h4>
        <ol style={OL}>
          <li>Informe a <strong>data</strong>.</li>
          <li>Para cada categoria comprada, clique em <strong>"+ Adicionar categoria"</strong> e preencha quantidade, peso médio, preço/kg, proprietário e a data de nascimento estimada (pré-preenchida pela categoria, ajustável).</li>
          <li>Preencha contraparte, comissão, imposto e frete, se houver.</li>
          <li>Clique em <strong>Registrar</strong>.</li>
        </ol>
        <p style={P}>
          Ao salvar, o sistema cria sozinho: o lançamento financeiro (grupo "Venda de Animais" ou "Compra de
          Animais"), uma despesa separada para cada um de <strong>Comissão</strong>, <strong>Impostos</strong> e
          <strong> Frete</strong> informados (cada uma já rateada entre os proprietários), e uma
          <strong> pesagem automática</strong> de entrada ou saída por animal (com o peso médio da
          categoria — veja o aviso na seção Pesagens sobre isso não contar no GMD). Na compra, os animais
          novos entram com um brinco provisório (PROV-0001, PROV-0002...) até você editar com o brinco
          definitivo.
        </p>
      </div>

      <div id="financeiro-resultados" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Resultados</h4>
        <p style={P}>
          Mostra uma tabela com receita, despesa, resultado e margem de cada ciclo já lançado (o ciclo atual
          vem destacado), mais uma análise automática resumindo o resultado do ciclo selecionado em uma
          frase. Duas colunas extras, em cinza pra não confundir com receita/despesa: <strong>Saldo
          anterior</strong> (soma do resultado de todos os ciclos anteriores daquele) e <strong>Caixa
          acumulado</strong> (saldo anterior + resultado daquele ciclo) — ver "Resultado × Caixa disponível"
          na seção Resumo acima.
        </p>
      </div>

      <div id="financeiro-parametros" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Parâmetros</h4>
        <p style={P}>
          Uma tabela com o <strong>peso médio</strong> e o <strong>preço por kg</strong> de cada categoria do
          rebanho — esses valores alimentam o "Total estimado" desta tela e o valor de mercado estimado
          mostrado em outras partes do sistema (Dashboard, Relatórios), além de pré-preencher peso/preço na
          primeira vez que uma categoria entra numa venda. Edite direto na tabela — salva sozinho ao sair do
          campo.
        </p>
      </div>

      <div id="financeiro-ciclos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Ciclos</h4>
        <p style={P}>
          Tela só de consulta: lista todos os ciclos da fazenda com início, fim e status (atual, carência,
          encerrado — leitura, ou futuro). Não existe um botão para criar ciclo manualmente — um ciclo novo
          nasce sozinho assim que a data vira 1º de julho, encerrando automaticamente o anterior. Um ciclo
          fora do período atual/carência fica só para consulta: qualquer tela mostra o aviso "Somente
          leitura" e recusa qualquer lançamento/edição nele.
        </p>
      </div>

      <div id="financeiro-simulacoes" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Simulações</h4>
        <p style={P}>
          "Simular venda" e "Simular compra" usam exatamente a mesma tela e os mesmos campos da transação
          real, mas <strong>não geram lançamento financeiro, não dão baixa nem cadastram animais, não
          rateiam e não afetam a apuração</strong> — servem só para testar um cenário ("e se eu vendesse
          esse lote agora?"). A aba <strong>Simulações</strong> lista tudo que já foi simulado (data, tipo,
          categorias, valor total) e permite excluir — excluir uma simulação não afeta nenhum dado real.
        </p>
      </div>

      <h4 style={{ ...H4, marginTop: 4 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="amber" icon="ti-arrow-back-up"
          title="Excluir uma venda reativa os animais"
          body='Excluir o lançamento de uma venda reverte tudo: os animais voltam a "ativo" (a menos que já tenham sido vendidos de novo ou marcados como mortos desde então), e as despesas de comissão/imposto/frete ligadas a ela também são excluídas.' />
        <AlertBox type="amber" icon="ti-lock"
          title="Excluir uma compra pode ser bloqueado"
          body='Excluir o lançamento de uma compra tenta apagar os animais cadastrados por ela — mas só consegue se nenhum deles tiver ganhado pesagem de manejo, procedimento sanitário, evento reprodutivo ou outra transação desde a compra. Se algum tiver, a exclusão inteira é recusada, com o aviso de qual animal e qual histórico está travando.' />
        <AlertBox type="green" icon="ti-info-circle"
          title="Despesa exige rateio, receita não"
          body='Se você não preencher o rateio numa despesa, o sistema divide igualmente entre os proprietários sozinho ao salvar. Numa receita, pode deixar em branco sem problema.' />
        <AlertBox type="amber" icon="ti-arrow-back-up"
          title="Excluir um lançamento ligado ao estoque também reverte o estoque"
          body='Se o lançamento tem uma entrada ou saída de estoque vinculada (veja Estoque → Movimentar), excluí-lo também reverte essa movimentação — devolvendo ou removendo a quantidade, conforme o caso — antes de apagar o lançamento. Se reverter deixaria o estoque negativo, a exclusão inteira é bloqueada. Exige permissão de edição em Estoque além de Financeiro.' />
      </div>
    </div>
  )
}
