import { AlertBox, Badge } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const H5 = { fontSize: '.85rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 6, marginTop: 12 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }
const UL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }
const FORMULA = { background: '#F3F4F6', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', color: '#111827', marginBottom: 10, lineHeight: 1.6 }

export default function SecaoMetas({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        <strong>Metas e Indicadores</strong> é onde você confere se a fazenda está indo bem: cada indicador
        mostra um número atual, a meta que você definiu, e um semáforo (verde/amarelo/vermelho). É este bloco
        do manual que explica exatamente o que entra na conta de cada um — porque um indicador só é útil se
        você confia no que ele está medindo.
      </p>

      <AlertBox type="green" icon="ti-chevron-down"
        title="Os contêineres são recolhíveis"
        body='Ao entrar na tela, todos os contêineres (Reprodução, Perdas, GMD, Produção, Custos e Comparação entre ciclos) começam recolhidos, mostrando só o título — clique para abrir um de cada vez. O "Gerar PDF" ignora o que está aberto/fechado na tela: o arquivo sempre sai com os 5 primeiros contêineres expandidos, cada um inteiro numa única página (dois só dividem a mesma página se os dois couberem inteiros nela). Comparação entre ciclos fica FORA do PDF — os números dela só existem depois de você abrir o contêiner na tela.' />

      <div id="metas-comparacao" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Comparação entre ciclos</h4>
        <p style={P}>
          Uma tabela com todos os 23 índices (das linhas, agrupados pelos mesmos 5 contêineres) contra todos
          os ciclos cadastrados (nas colunas, do mais antigo ao mais recente) — sempre no modo
          <strong> Consolidado</strong>, sem mostrar metas, só os números em si. A 1ª coluna (nome do índice)
          fica fixa mesmo rolando a tabela pros lados, pra você nunca perder de vista o que cada linha
          significa. A coluna do ciclo em foco na tela aparece destacada. Uma seta ao lado do número mostra se
          o índice melhorou (verde) ou piorou (vermelho) em relação ao ciclo anterior na tabela — a cor
          respeita se o indicador é "maior é melhor" ou "menor é melhor", mesmo critério do semáforo dos
          cards; passe o mouse sobre a seta pra ver a variação em %. Um traço (—) significa que não havia dado
          suficiente pra calcular aquele índice naquele ciclo — nunca aparece 0% ali, que seria enganoso.
        </p>
        <AlertBox type="amber" icon="ti-clock-hour-4"
          title="Os números só são calculados quando você abre o contêiner"
          body="Comparar todos os ciclos de uma vez é uma conta mais pesada que os outros contêineres (recalcula os índices de CADA ciclo cadastrado) — por isso ela só roda quando você efetivamente abre este contêiner pela primeira vez, nunca ao carregar a tela. Depois de calculada, fica guardada enquanto você estiver nesta tela; trocar o ciclo em foco ou o filtro de proprietário recalcula de novo na próxima vez que você abrir o contêiner." />
      </div>

      <div id="metas-modos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Os 3 modos: Inseminação, Monta Natural e Consolidado</h4>
        <p style={P}>
          Cada contêiner de indicadores (Reprodução, Perdas, GMD, Produção, Custos) tem um seletor de 3
          posições: <strong>Inseminação</strong> (lotes de IA/IATF), <strong>Monta Natural</strong> (lotes de
          touro solto) ou <strong>Consolidado</strong> (os dois juntos). Existe também um seletor
          <strong> "Ver por"</strong> no topo da tela que aplica o mesmo modo aos 5 contêineres de uma vez —
          mas é um "empurrão" único, não um controle mestre travado: depois de usar o "Ver por", você ainda
          pode trocar o modo de um contêiner específico sozinho (ex: deixar Reprodução em Consolidado mas
          olhar Custos só da Monta Natural), sem que isso mude o resto.
        </p>
        <AlertBox type="green" icon="ti-calculator"
          title="Consolidado NUNCA é a média dos outros dois"
          body="Consolidado roda a MESMA fórmula de cada indicador, só que sobre todos os lotes juntos (inseminação + monta natural) — não é (valor da IA + valor da Monta Natural) ÷ 2. Um exemplo: se você teve 10 matrizes na IA com 80% de prenhez e 5 na monta natural com 100%, o Consolidado não vai mostrar 90% — ele recalcula do zero com as 15 matrizes e todos os diagnósticos juntos, o que pode dar um número diferente de uma média simples." />
      </div>

      <div id="metas-reproducao" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Contêiner Reprodução</h4>

        <h5 style={H5}>Taxa de Prenhez</h5>
        <div style={FORMULA}>Prenhas (diagnóstico "P") ÷ Total de inseminadas/expostas no ciclo × 100</div>
        <p style={P}>Cada animal conta uma vez só — uma vaca que entrou na IATF e depois no repasse não é contada duas vezes.</p>

        <h5 style={H5}>Taxa de Aproveitamento</h5>
        <div style={FORMULA}>Matrizes expostas ÷ Matrizes aptas × 100</div>
        <p style={P}>
          "Matriz apta" = fêmea com mais de 24 meses de idade, presente na fazenda, <strong>na data de PELO
          MENOS UM lote do ciclo</strong> — não mais uma foto única da 1ª monta (2026-08-12, correção de bug:
          uma matriz comprada depois da 1ª monta, mas exposta só num lote/repasse posterior do mesmo ciclo,
          entrava no numerador sem nunca entrar no denominador, e a taxa passava de 100% por engano). "Matrizes
          expostas" exclui prenhez adquirida na compra (ver abaixo).
        </p>
        <p style={P}>
          <strong>Acima de 100% continua sendo normal</strong>, não um bug: acontece quando novilhas com menos
          de 24 meses (fora da definição de "matriz apta") são expostas à reprodução. O card mostra um aviso
          discreto quando isso acontece, pra ninguém desconfiar do número à toa.
        </p>
        <p style={P}>
          <strong>Prenhez adquirida na compra</strong> (vaca comprada já prenha, sem monta registrada nesta
          fazenda) sai de Taxa de Prenhez, Taxa de Aproveitamento, Taxa de Parição, Eficiência Gestacional,
          Perda Gestacional e Custo de Monta / Matriz Exposta — ela não foi exposta nem teve a gestação
          conduzida aqui, então não diz nada sobre o manejo reprodutivo desta fazenda. Continua contando
          normalmente em tudo que é produção: desmame, kg produzido, GMD, mortalidade — o terneiro dela nasceu
          e foi criado aqui. O card mostra quantas foram excluídas quando isso muda o número.
        </p>

        <h5 style={H5}>Taxa de Parição</h5>
        <div style={FORMULA}>Partos ÷ Matrizes expostas no ciclo × 100</div>
        <p style={P}>
          Padrão do setor: inclui todas as matrizes que entraram na monta, mesmo as que nunca prenharam. Só é
          calculada quando já existe pelo menos 1 parto registrado na safra — antes disso, o card mostra
          "Aguardando partos" em vez de um 0% enganoso (veja o aviso mais abaixo).
        </p>

        <h5 style={H5}>Eficiência Gestacional</h5>
        <div style={FORMULA}>Partos ÷ Prenhas confirmadas × 100</div>
        <p style={P}>
          Mede quantas gestações CONFIRMADAS realmente resultaram em parto — diferente da Taxa de Parição
          acima, que divide pelo total de expostas (inclui quem nunca prenhou). Até a virada da Fase 8 este
          indicador se chamava "Taxa de Parição"; a fórmula não mudou, só o nome — metas já configuradas
          continuam valendo para o mesmo número de antes.
        </p>
        <p style={P}>
          <strong>Vaca vendida ainda prenha</strong> sai do denominador dos dois indicadores acima (Taxa de
          Parição e Eficiência Gestacional): o parto dela deixa de ser observável pela fazenda a partir da
          venda, e mantê-la no cálculo sem poder confirmar o desfecho faria o índice parecer melhor do que é.
          Ela continua contando normalmente em Taxa de Prenhez (isso já aconteceu antes da venda). Quando isso
          acontece, o card mostra quantas foram excluídas num texto discreto abaixo do valor.
        </p>

        <h5 style={H5}>Intervalo entre Partos <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(menor é melhor)</span></h5>
        <div style={FORMULA}>Média de dias entre partos consecutivos da MESMA matriz</div>
        <p style={P}>
          Só entram intervalos entre 300 e 700 dias (fora disso é tratado como dado ruim/atípico, não conta).
          Matrizes com só 1 parto no histórico não contribuem — precisam de pelo menos 2 partos para gerar um
          intervalo.
        </p>
      </div>

      <div id="metas-perdas" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Contêiner Perdas</h4>

        <h5 style={H5}>Perda Gestacional <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(menor é melhor)</span></h5>
        <div style={FORMULA}>(Abortos registrados + Perdas não identificadas) ÷ Prenhas × 100</div>
        <p style={P}>
          <strong>Aborto</strong> é um evento que você registrou explicitamente na tela Gestão Reprodutiva.
          <strong> Perda não identificada</strong> é diferente: é uma vaca diagnosticada prenha cuja janela de
          gestação (300 dias desde a monta) já fechou, sem parto NEM aborto lançado — o sistema entende que
          algo deu errado e ninguém registrou. Enquanto ainda está dentro dos 300 dias, ela conta como
          "gestando" (em andamento), não como perda.
        </p>
        <p style={P}>
          Vaca vendida ainda prenha sai do denominador (Prenhas) deste indicador — parto/aborto não são
          observáveis depois da venda. <strong>Prenhez adquirida na compra também sai</strong> (2026-08-12):
          a gestação não foi conduzida aqui desde a concepção, então uma perda dela diz pouco sobre o manejo
          local. O Kg Desmamado / Matriz sai apenas para vendida ainda prenha — prenhez adquirida NÃO sai dali
          (o terneiro dela desmama normalmente aqui). O card avisa quantas foram excluídas quando isso muda o
          número.
        </p>

        <h5 style={H5}>Mortalidade de Terneiros <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(menor é melhor)</span></h5>
        <div style={FORMULA}>Bezerros mortos ÷ Partos da safra × 100</div>
      </div>

      <div id="metas-gmd" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Contêiner GMD</h4>
        <p style={P}>
          Todos os indicadores deste contêiner usam o mesmo grupo de bezerros: os <strong>nascidos na
          safra</strong> (veja o aviso sobre safra da monta, mais abaixo), ainda <strong>vivos</strong>, com
          pelo menos <strong>2 pesagens de manejo</strong> registradas (nascimento, desmama, sobreano ou
          intermediária — pesagem de compra/venda nunca entra, mesma regra da tela Pesagens) e ainda
          classificados como Terneiro/Terneira na data da última pesagem dele.
        </p>
        <h5 style={H5}>GMD Terneiros / GMD Terneiras / GMD Terneiros (machos)</h5>
        <div style={FORMULA}>Média do GMD individual de cada bezerro do grupo acima (veja a fórmula do GMD na seção Pesagens)</div>
        <h5 style={H5}>Kg Desmamado / Matriz Exposta</h5>
        <div style={FORMULA}>Soma dos pesos de desmame ÷ Matrizes expostas</div>
        <h5 style={H5}>Kg ao Nascer</h5>
        <div style={FORMULA}>Média simples dos pesos de nascimento</div>
        <h5 style={H5}>Kg ao Desmame</h5>
        <div style={FORMULA}>Média simples dos pesos de desmame</div>
        <p style={P}>
          Esses três exigem uma pesagem do tipo específico — <strong>"Nascimento"</strong> para Kg ao Nascer,
          <strong> "Desmama"</strong> para os outros dois — um bezerro que só tem pesagens de sobreano/
          intermediária não entra neles, mesmo que já apareça no GMD Terneiros. Kg ao Nascer também não exige
          o bezerro estar vivo nem ter 2+ pesagens (ao contrário do resto do contêiner): basta ter sido pesado
          ao nascer.
        </p>
      </div>

      <div id="metas-producao" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Contêiner Produção da Safra × Hectare Útil</h4>
        <p style={P}>
          Os títulos deste contêiner usam <strong>♂♀</strong> em negrito pra deixar explícito que "Terneiros"
          aqui inclui os dois sexos (machos e fêmeas).
        </p>
        <h5 style={H5}>Kg de Terneiros ♂♀</h5>
        <div style={FORMULA}>Soma da última pesagem de manejo de cada bezerro da safra</div>
        <h5 style={H5}>Kg de Terneiros ♂♀ / ha</h5>
        <div style={FORMULA}>Kg de terneiros produzidos ÷ Hectare útil total da fazenda</div>
        <p style={P}>O hectare útil aqui é a soma de TODOS os piquetes cadastrados na fazenda — não é filtrado por safra nem por modo.</p>
        <h5 style={H5}>Valor de Terneiros ♂♀ <Badge color="gray">Estimado</Badge></h5>
        <div style={FORMULA}>(Nº de machos × preço médio da categoria "Terneiro") + (Nº de fêmeas × preço médio da categoria "Terneira")</div>
        <p style={P}>
          Este é um valor <strong>ESTIMADO</strong>, não a receita real de venda — repare que ele NÃO usa o peso
          real pesado de cada bezerro nem o preço de nenhuma venda efetiva: é contagem de cabeças × o peso médio
          e preço/kg cadastrados em <strong>Financeiro → Parâmetros</strong> para as categorias Terneiro e
          Terneira, aplicado a TODOS os terneiros da safra (vendidos ou não) — valor estimado com base no valor
          de referência definido pelo usuário em Parâmetros do sistema. Se essas categorias não tiverem
          peso/preço cadastrado, o card avisa e fica sem valor. O selo "Estimado" ao lado do título marca os
          dois cards que usam este cálculo (este e o próximo, por hectare) — antes ficava escrito por extenso no
          título, mas não cabia em duas linhas.
        </p>
        <h5 style={H5}>Valor de Terneiros ♂♀ / ha <Badge color="gray">Estimado</Badge></h5>
        <div style={FORMULA}>Valor produzido (estimado) ÷ Hectare útil total</div>
        <p style={P}>Mesmo valor estimado com base no valor de referência definido pelo usuário em Parâmetros do sistema, dividido pelo hectare útil.</p>
        <h5 style={H5}>Receita Real de Terneiros ♂♀</h5>
        <div style={FORMULA}>Soma do valor de venda (transacao_animais_itens) dos terneiros/terneiras NASCIDOS nesta safra</div>
        <h5 style={H5}>Receita Real de Terneiros ♂♀ / ha</h5>
        <div style={FORMULA}>Receita real de terneiros/as ÷ Hectare útil total</div>
        <p style={P}>
          Os dois cards de <strong>Receita Real</strong> ficam ao lado dos seus equivalentes estimados de
          propósito, pra comparar direto: um é preço de referência aplicado a TODOS os terneiros da safra
          (estimado), o outro é o que já foi efetivamente vendido deles (real). A população é a MESMA nos dois
          — todo terneiro/terneira nascido nesta safra — mas a Receita Real não filtra por categoria de venda:
          um animal vendido bem depois, já reclassificado como Novilho/Novilha, ou vendido sob uma categoria com
          override (ex: "Vaca Gorda"), ainda entra na conta, porque a receita dele é resultado desta safra
          independente de como foi rotulado na hora da venda.
        </p>
        <AlertBox type="blue" icon="ti-clock"
          title="Receita Real vai preenchendo com o tempo — pode ficar abaixo do Estimado"
          body='Diferente do valor Estimado (calculado na hora, pra TODOS os terneiros da safra), a Receita Real só soma o que já foi vendido de fato. Enquanto houver terneiros da safra ainda ativos (não vendidos), a Receita Real fica menor que o Estimado — isso não é um problema, é esperado: ela vai subindo conforme as vendas acontecem, mesmo que isso atravesse um ou mais ciclos depois da safra em si (o sistema busca a venda onde quer que ela esteja, sem prender à data do ciclo selecionado). Sem nenhuma venda ainda, o card mostra "Sem vendas no período", nunca R$ 0,00 — zero seria lido como prejuízo.' />
      </div>

      <div id="metas-custos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Contêiner Custos</h4>
        <p style={P}>
          A fonte é sempre <strong>Financeiro → Lançamentos</strong>: despesas com o grupo financeiro exato
          <strong> "Inseminação"</strong> (modo Inseminação) ou <strong>"Monta Natural"</strong> (modo Monta
          Natural) — o Consolidado soma os dois grupos. O que decide se uma despesa entra é a
          <strong> data do lançamento cair dentro do ciclo selecionado</strong>, não o ciclo em que ela foi
          tecnicamente registrada — porque um custo pode ser lançado já no ciclo seguinte e ainda pertencer à
          monta deste ciclo.
        </p>
        <div style={FORMULA}>
          Custo por Terneiro = Custo total ÷ Partos da safra<br />
          % do Valor Produzido = Custo total ÷ Valor Produzido × 100<br />
          Custo por Matriz = Custo total ÷ Matrizes expostas
        </div>
        <p style={P}>
          <strong>Custo por Matriz exclui prenhez adquirida na compra</strong> (2026-08-12): ela não gerou
          nenhum custo de monta nesta fazenda (não foi inseminada/coberta aqui) — mantê-la no denominador
          diluiria o custo médio pra baixo, fazendo o manejo parecer mais barato do que foi de verdade.
        </p>
        <AlertBox type="amber" icon="ti-receipt-off"
          title='Por que "Monta Natural" costuma aparecer sem despesas'
          body='Nem "Inseminação" nem "Monta Natural" são grupos financeiros criados automaticamente pelo sistema — os dois são só opções na lista de grupos em Financeiro, que só ganham número se VOCÊ lançar uma despesa manualmente com esse grupo exato (ex: nota de sêmen, protocolo, ou o custo de manter o touro). Não é uma limitação do modo Monta Natural: se ninguém lançou nada com o grupo "Monta Natural", o card mostra "Sem despesas lançadas no período" mesmo que a monta tenha custado dinheiro de verdade — o sistema não tem como adivinhar isso sozinho.' />
      </div>

      <div id="metas-metas" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Como definir metas e ler o semáforo</h4>
        <p style={P}>
          Clique em <strong>"Editar metas"</strong> — abre uma lista com TODOS os indicadores de uma vez,
          cada um com um campo numérico (mesmo os que ainda não têm meta salva). Preencha os que quiser e
          salve; indicadores não alterados continuam como estavam.
        </p>
        <p style={P}>
          A cor do semáforo depende de o indicador ser "maior é melhor" ou "menor é melhor" (marcados
          "menor é melhor" no próprio nome do card):
        </p>
        <ul style={UL}>
          <li><strong>Maior é melhor</strong> (prenhez, aproveitamento, parição, GMDs, produção...): 🟢 atingiu 100% ou mais da meta · 🟡 entre 90% e 99,9% · 🔴 abaixo de 90%.</li>
          <li><strong>Menor é melhor</strong> (intervalo entre partos, perda gestacional, mortalidade, os 4 de Custos): 🟢 igual ou abaixo da meta · 🟡 até 10% acima da meta · 🔴 mais de 10% acima.</li>
          <li><strong>Cinza, sem cor</strong>: quando ainda não há número calculável (ex: "Aguardando partos") OU quando não existe meta salva ainda.</li>
        </ul>
        <p style={P}>
          Alguns indicadores já vêm com uma meta sugerida na primeira vez que você abre a tela (ex: taxa de
          aproveitamento 100%, perda gestacional 5%, GMD fêmeas/machos 0,80 kg/dia). Os 4 de Produção e os 4
          de Custos não têm sugestão — variam demais de fazenda para fazenda — e ficam "Sem meta" até você
          preencher.
        </p>
      </div>

      <div id="metas-graficos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Gráficos</h4>
        <ul style={UL}>
          <li><strong>Curva de parição</strong> — nascimentos ao longo do tempo. Sempre mostra Consolidado, não muda com o seletor de modo do contêiner Reprodução.</li>
          <li><strong>Desfechos da safra</strong> (rosca) — vivos, mortos, abortos, perdas não identificadas, gestando. Este muda com o modo escolhido em Perdas.</li>
          <li><strong>Histograma e comparativo de GMD</strong> — a linha de referência em 0,80 kg/dia no gráfico é fixa, não é a sua meta salva.</li>
          <li><strong>Produção por sexo</strong> — kg e R$ produzidos, machos × fêmeas.</li>
          <li><strong>Custo por ciclo</strong> — sempre soma Inseminação + Monta Natural juntos, não muda com o modo de Custos.</li>
          <li><strong>Comparativo Inseminação × Monta Natural</strong> — só aparece quando aquele contêiner específico está no modo Consolidado (some se você trocar para só um dos dois).</li>
          <li><strong>Nascimentos do ciclo</strong> (proporção de sexo, GMD por sexo, por touro) — sempre Consolidado, não tem seletor de modo.</li>
          <li>
            <strong>Preço de venda por categoria</strong> — histórico completo de todas as vendas, uma linha
            por categoria (Terneira, Boi, Vaca Prenha...), com <strong>data</strong> no eixo horizontal e
            <strong> preço por kg</strong> no eixo vertical — o gráfico mostra a variação do PREÇO no tempo,
            não os quilos vendidos. Categorias diferentes têm faixas de preço estruturalmente diferentes, por
            isso cada uma tem sua própria linha em vez de uma média só — misturar tudo numa linha única faria
            parecer que o preço caiu num dia em que só se vendeu a categoria mais barata, mesmo com cada
            categoria estável. Clique numa categoria da legenda para isolar/ocultar a linha dela. Um seletor
            <strong> kg / @ (arroba)</strong> troca só o número mostrado nos eixos e no tooltip:
            <div style={{ ...FORMULA, marginTop: 6, marginBottom: 6 }}>Preço por arroba = Preço por kg × 15</div>
            É só uma conversão de unidade (a arroba "informal" de 15 kg) aplicada em cima do preço/kg que
            você mesmo cadastrou — o sistema não sabe (nem pergunta) se esse preço foi pensado como peso vivo
            ou de carcaça.
          </li>
        </ul>
      </div>

      <h4 style={{ ...H4, marginTop: 4 }}>Avisos críticos</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="amber" icon="ti-history"
          title="Índice é histórico — vender ou comprar animal depois não muda o passado"
          body="Uma vez que a safra fecha, os índices dela ficam registrados. Vender ou comprar um animal hoje não recalcula o índice de um ciclo que já passou." />
        <AlertBox type="amber" icon="ti-shopping-cart"
          title="Animal comprado não entra em matrizes aptas de ciclo anterior à compra"
          body="Uma fêmea comprada só conta como matriz apta a partir da data em que ela entrou na fazenda — mesmo que a idade dela já desse mais de 24 meses antes disso." />
        <AlertBox type="amber" icon="ti-calendar-repeat"
          title="O cohort de terneiros é ancorado na safra da MONTA, não na data de nascimento"
          body="Um bezerro nascido em outubro (ciclo seguinte) ainda conta para os índices de GMD/Produção/Mortalidade do ciclo em que a monta que o gerou aconteceu — mesma regra já explicada na seção Gestão Reprodutiva." />
        <AlertBox type="amber" icon="ti-link-off"
          title="Terneiro de parto sem lote vinculado fica fora desses índices"
          body='Se o parto foi registrado sem nenhum lote de monta associado ("lote avulso"), esse bezerro não entra em nenhum indicador de safra (nem em Consolidado) — só o Intervalo entre Partos consegue considerar partos assim, e só no modo Consolidado.' />
        <AlertBox type="green" icon="ti-hourglass"
          title='"Aguardando..." não é erro'
          body='Textos como "Aguardando partos", "Aguardando desmames" ou "Aguardando nascimentos" aparecem quando ainda não existe nenhum evento daquele tipo na safra em andamento — é diferente de 0%, que pareceria "deu errado". É só o sistema avisando que ainda não há o que medir.' />
      </div>
    </div>
  )
}
