import { useState } from 'react'
import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }
const OL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }
const CODE = { background: '#F3F4F6', borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: '#111827', marginBottom: 18, lineHeight: 1.7 }

// ── Recriação do seletor de touros da monta natural (Reprodutivo.jsx) — chips
// adicionados por texto, estado 100% local, não grava nada. Mesma convenção
// de demonstração usada nas outras seções do manual.
function DemoTouros() {
  const [touros, setTouros] = useState(['Angus 12'])
  const [novo, setNovo] = useState('')

  const add = () => { if (novo.trim()) { setTouros(p => [...p, novo.trim()]); setNovo('') } }

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
        <i className="ti ti-flask" /> MODO DEMONSTRAÇÃO — não salva dados reais
      </div>
      <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 6 }}>
        Touros (pelo menos 1 — o 1º da lista é o principal)
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {touros.map((t, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#EFF6FF', color: '#1E55B0', borderRadius: 999,
            padding: '4px 10px', fontSize: '.8rem', fontWeight: 600,
          }}>
            {t}
            <span style={{ cursor: 'pointer', color: '#9CA3AF' }} onClick={() => setTouros(p => p.filter((_, j) => j !== i))}>×</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nome do touro"
          onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={add}>Adicionar</button>
      </div>
      {touros.length > 1 && (
        <div style={{ marginTop: 10, fontSize: '.78rem', color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 10px' }}>
          Com mais de um touro, a paternidade dos bezerros deste lote fica indefinida — o pai é registrado
          como "Monta natural — Lote", não um touro específico.
        </div>
      )}
    </div>
  )
}

export default function SecaoReprodutivo({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        A <strong>Gestão Reprodutiva</strong> acompanha o ciclo reprodutivo completo do rebanho: monta
        (inseminação artificial ou touro solto), diagnóstico de gestação, parto e, quando acontece, aborto —
        e calcula sozinha os índices de cada safra a partir desses lançamentos.
      </p>

      <div id="reprodutivo-estacoes" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Estação de monta</h4>
        <p style={P}>
          A estação de monta é um "guarda-chuva" que agrupa vários lotes (IATF, repasses, montas naturais) do
          mesmo período reprodutivo — ela tem só um nome e um período (início e, opcionalmente, fim). Não
          existe uma tela separada para criar uma estação do zero: ela nasce <strong>dentro do formulário de
          um lote</strong>, escolhendo "+ Criar nova estação de monta…" no campo Estação de monta. Depois de
          criada, ela pode ser editada ou excluída na lista de estações da aba Lotes/Montas.
        </p>
        <p style={P}>
          Ao editar o período de uma estação, o sistema não deixa você encolher as datas a ponto de deixar
          algum lote já vinculado para fora do intervalo — mostra exatamente quais lotes ficariam de fora e
          pede para ajustar as datas primeiro. Excluir uma estação não apaga os lotes dela: eles só ficam sem
          estação (viram "avulsos").
        </p>
      </div>

      <div id="reprodutivo-lotes" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Lotes de inseminação e monta natural</h4>
        <p style={P}>
          Existem dois botões separados — <strong>"+ Novo lote de inseminação"</strong> (IATF ou repasse por
          IA) e <strong>"+ Nova monta natural"</strong> (touro solto) — e é o botão que você clica que decide o
          tipo do lote, não uma escolha dentro do formulário. Um repasse não é um tipo à parte: é só um novo
          lote do mesmo tipo, criado mais tarde, que pode (ou não) apontar para a mesma estação de monta.
        </p>
        <ol style={OL}>
          <li>Informe a <strong>data</strong> da monta.</li>
          <li>Na inseminação: informe o <strong>touro/sêmen</strong> (texto livre) e, se usar, o <strong>protocolo</strong> (ex: "IATF P4").</li>
          <li>Na monta natural: adicione um ou mais <strong>touros</strong> (veja a demonstração abaixo).</li>
          <li>Escolha a <strong>estação de monta</strong>, se for o caso.</li>
          <li>Selecione as <strong>fêmeas</strong> — use os filtros de lote de origem, proprietário e categoria para achar mais rápido, ou "Selecionar todos do filtro". O botão <strong>"Limpar seleção"</strong>, ao lado do contador, desmarca todas de uma vez sem fechar o formulário nem apagar touro/data/protocolo já preenchidos — vale também no "Adicionar animais ao lote".</li>
          <li>Clique em <strong>Salvar</strong>.</li>
        </ol>
        <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
          Experimente o seletor de touros abaixo — é uma recriação exata da tela real, mas não grava nada:
        </p>
        <DemoTouros />
        <p style={P}>
          Depois de criado, um lote também aceita <strong>"Adicionar animais ao lote"</strong> a qualquer
          momento, com a mesma lista de filtros — não precisa recriar o lote para incluir mais fêmeas depois.
        </p>
        <AlertBox type="amber" icon="ti-swords"
          title='"Lote" de novo tem dois sentidos diferentes'
          body='Este é o lote de inseminação/monta (aqui em Reprodutivo) — reúne animais expostos numa mesma monta e alimenta os índices de safra. É diferente do lote de manejo (tela Propriedade), que é só um agrupamento livre de animais para organizar o dia a dia. Um mesmo animal pode estar num lote de manejo e, ao mesmo tempo, num lote de monta — não têm relação um com o outro.' />
        <p style={P}>
          Ao abrir um lote, o card <strong>"Resumo do lote"</strong> mostra Matrizes expostas, Prenhas, Vazias
          e Pendentes, e logo abaixo <strong>Machos nascidos</strong> e <strong>Fêmeas nascidas</strong>,
          contados pelos partos já vinculados a este lote (vale para IA e monta natural). Um bezerro sem sexo
          registrado — não deveria acontecer, o formulário de nascimento exige o sexo, mas pode ocorrer com
          dado antigo/importado — não entra em nenhuma das duas contagens; se isso acontecer, um aviso aparece
          abaixo dos cards avisando quantos bezerros da safra estão sem sexo, em vez de sumir sem explicação.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Prenhez adquirida (vaca comprada já prenha)</h4>
        <p style={P}>
          Uma vaca comprada já prenha nunca teve nenhuma monta registrada neste sistema — sem um lote com
          diagnóstico Prenha, ela não aparece como opção de mãe no registro de nascimento, e o parto do terneiro
          dela fica bloqueado (toda safra é obrigatória). O botão <strong>"+ Vincular prenhez adquirida"</strong>,
          ao lado de "Novo lote"/"Nova monta natural", resolve isso: lista as fêmeas prenhas (no cadastro) sem
          nenhum lote com diagnóstico Prenha — normalmente compradas, mas serve para qualquer prenhez órfã.
          Use <strong>"Selecionar tudo"</strong>/<strong>"Limpar seleção"</strong>, no topo da lista, para marcar
          ou desmarcar todas de uma vez (o contador ao lado mostra quantas estão selecionadas), ou selecione uma
          a uma. Informe a <strong>data prevista de parto</strong> ou a <strong>data da
          monta</strong> (o sistema calcula a outra, gestação de 283 dias), escolha ou crie uma <strong>estação
          de monta</strong>, e confirme. O sistema cria um lote rotulado <strong>"Prenhez adquirida na
          compra"</strong> (nunca se confunde com uma monta de verdade) já com diagnóstico Prenha confirmado
          para as vacas selecionadas — a partir daí elas aparecem normalmente em "Registrar nascimento" e os
          terneiros delas entram nos índices da safra.
        </p>
        <p style={P}>
          O mesmo fluxo também aparece <strong>dentro do formulário de Compra</strong> (Financeiro → Compra &
          Venda), como um passo opcional na hora de comprar uma categoria "Prenha" — veja a seção Financeiro.
          Se você não fizer isso na hora da compra, pode vincular depois, a qualquer momento, por aqui.
        </p>
      </div>

      <div id="reprodutivo-diagnostico" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Diagnóstico de gestação (DG)</h4>
        <p style={P}>
          Abra o lote e use o card <strong>"Diagnóstico de gestação"</strong>. Primeiro defina a <strong>data
          do diagnóstico</strong> uma vez, no topo do card — todo clique (ou comando de voz, ex: "zero três
          prenha") feito depois usa essa data, não a de hoje. Para cada fêmea do lote, clique em
          <strong> Prenha</strong> ou <strong>Vazia</strong>. Não existe um terceiro botão "não observado" — se
          ainda não foi conferida, ela simplesmente continua sem diagnóstico. Uma fêmea diagnosticada Prenha
          mostra a data prevista de parto, calculada sozinha a partir da data da monta (não é algo que você
          digita).
        </p>
        <p style={P}>
          Depois que uma fêmea já tem parto ou aborto registrado <em>naquele lote</em>, o diagnóstico dela
          trava — o sistema avisa e não deixa mudar, para não desalinhar um evento já lançado.
        </p>
        <p style={P}>
          Para aplicar o <strong>mesmo resultado a várias vacas de uma vez</strong>, marque a caixinha de cada
          uma (ou "Marcar/desmarcar todos", que respeita o filtro por proprietário ativo) e use os botões
          <strong> "Marcar Prenha"</strong> / <strong>"Marcar Vazia"</strong> que aparecem na barra de seleção.
          Uma confirmação mostra quantas vacas serão de fato afetadas — vacas selecionadas que já têm parto ou
          aborto registrado neste lote são automaticamente excluídas da contagem (o diagnóstico delas continua
          travado, mesma regra do clique individual). Todas usam a mesma <strong>data do diagnóstico</strong>
          definida no topo do card.
        </p>
      </div>

      <div id="reprodutivo-linha-tempo" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Linha do tempo por vaca e progresso da safra</h4>
        <p style={P}>
          No detalhe do lote, logo abaixo do badge de situação (Prenha/Vazia/Com cria ao pé), cada fêmea mostra
          sua etapa atual dentro da safra:
        </p>
        <ul style={{ ...OL, listStyle: 'disc' }}>
          <li><strong>Prenha, sem parto ainda</strong> — "Prevista para dd/mm/aaaa" (data da monta + 283
            dias). Se essa data já passou e a vaca ainda não pariu nem tem aborto registrado, o texto aparece em
            vermelho e negrito, como aviso de atraso. Se um aborto já foi registrado para essa gestação, a
            previsão de parto some — aborto encerra a gestação, então não há mais parto previsto (só o aviso de
            "Aborto registrado em dd/mm/aaaa" continua aparecendo).</li>
          <li><strong>Pariu, bezerro vivo, ainda não desmamado</strong> — "Pariu em dd/mm/aaaa · BRINCO · Com
            cria ao pé", com o brinco do terneiro clicável: abre o cadastro dele direto na tela Animais, e um
            botão pequeno de <strong>"Desfazer nascimento"</strong> ao lado, para corrigir um lançamento por
            engano (mesmo padrão do desfazer desmame — só funciona se o bezerro ainda não tiver histórico
            próprio: pesagem além da de nascimento, procedimento sanitário ou venda; se tiver, o sistema explica
            e bloqueia). Ao lado, na mesma linha das ações de diagnóstico/nascimento/aborto, aparece a próxima
            ação: um campo de peso (kg, <strong>opcional</strong>) e o botão <strong>"Registrar desmame"</strong>
            — o botão já vem disponível com ou sem peso digitado, e o clique registra direto, sem confirmação.</li>
          <li><strong>Pariu, bezerro morto (inclusive natimorto)</strong> — "Pariu em dd/mm/aaaa · Bezerro
            morto", sem oferecer desmame — não faz sentido desmamar um bezerro que não sobreviveu.</li>
          <li><strong>Desmamado</strong> — "Desmamado em dd/mm/aaaa · Xkg" (o peso some se não foi
            informado), com um botão pequeno de desfazer ao lado, pra corrigir um lançamento por engano. Um
            desmame <strong>sem peso</strong> conta normalmente em "Desmamados"/"Taxa de desmama", mas fica de
            fora do numerador <strong>e</strong> do denominador de "Peso médio ao desmame", "P205 médio" e "Kg
            desmamado/matriz exposta" (nunca entra como zero) — os cards mostram "X de Y com peso" pra deixar
            isso visível. Se esse terneiro for depois <strong>vendido</strong>, o peso da venda passa a valer
            como peso de desmame (volta a entrar em "Peso médio ao desmame"/"Kg desmamado por matriz"; P205
            continua de fora, porque depende da data real do desmame, que nesse caso não existe).</li>
          <li><strong>Falhada</strong> — "Falhada — [motivo] (nome da estação)", quando a vaca foi exposta na
            estação de monta e <strong>não entregou terneiro nela</strong>, qualquer que seja o motivo. Ver a
            seção seguinte para os 3 motivos e como marcar manualmente.</li>
        </ul>
        <p style={P}>
          O topo do card "Diagnóstico de gestação" tem <strong>um único campo de data</strong>, usado tanto
          para o diagnóstico (clique ou voz) quanto para o desmame lançados nas linhas abaixo (não a data de
          hoje). O rótulo do campo muda sozinho conforme o que está pendente no lote: só diagnóstico pendente
          → "Data do diagnóstico"; só desmame pendente → "Data do desmame"; os dois ao mesmo tempo → "Data do
          diagnóstico / desmame"; e o campo some quando não há mais nada pendente (lote 100% diagnosticado e
          desmamado). Não existe mais um card separado "Desmame dos terneiros deste lote": o desmame virou uma
          etapa na própria sequência da vaca, no mesmo lugar de diagnóstico/nascimento/aborto — uma vaca, uma
          sequência, sem precisar procurar o bezerro de novo lá embaixo.
        </p>
        <p style={P}>
          Logo abaixo de <strong>"Resultados do lote"</strong>, o <strong>"Progresso da safra"</strong> resume o
          funil completo num único lugar: Expostas → Prenhas → Paridas → Desmamadas — os mesmos números já
          usados no Resumo do lote e nos Resultados do lote acima, só reorganizados como sequência.
        </p>
        <p style={P}>
          Pra desmamar <strong>várias vacas de uma vez</strong> com o mesmo peso médio, marque a caixinha de
          cada uma na lista abaixo (mesma seleção usada por "Marcar Prenha"/"Marcar Vazia") — quando pelo menos
          uma das selecionadas tiver terneiro vivo ainda não desmamado, aparece um campo de peso médio (kg,
          também opcional) e o botão <strong>"Desmamar N selecionado(s)"</strong>, que registra o desmame de
          todos os elegíveis de uma vez com esse peso, direto, sem confirmação.
        </p>
      </div>

      <div id="reprodutivo-falhada" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Falhada — guarda-chuva, não estado exclusivo</h4>
        <p style={P}>
          <strong>Vaca Falhada</strong> = vaca que não entregou terneiro na estação de monta, qualquer que seja
          o motivo. É assim que se usa no campo, e é o que importa pra decisão de descarte — abortar também é
          falhar. "Falhada" não é um estado a mais que compete com os outros: é um GUARDA-CHUVA sobre 3 motivos
          diferentes, sempre exibido com o motivo junto:
        </p>
        <ul style={{ ...OL, listStyle: 'disc' }}>
          <li><strong>Falhada — não emprenhou</strong> — foi exposta e <strong>nunca ficou prenha em nenhum
            lote da estação</strong> (nem na IATF, nem num repasse). Não existe diagnóstico "Prenha" nenhum pra
            ela nessa estação.</li>
          <li><strong>Falhada — aborto</strong> — engravidou e a gestação mais recente terminou em aborto, sem
            uma gestação posterior na mesma estação que substitua esse resultado.</li>
          <li><strong>Falhada — perda gestacional</strong> — engravidou e o prazo esperado passou sem parto nem
            aborto registrado (descrito em detalhe na seção seguinte — é a "perda gestacional presumida").</li>
        </ul>
        <p style={P}>
          <strong>Quem pariu não é falhada</strong>, mesmo tendo falhado numa tentativa anterior da mesma
          estação — o status olha sempre o resultado consolidado da ESTAÇÃO inteira, não do lote isolado: uma
          vaca vazia na IATF que engravidou e pariu no repasse <strong>não</strong> é "Falhada". Se ela
          engravidou de novo depois de abortar, o aborto deixa de ser o motivo (o motivo mostrado é sempre o da
          tentativa mais recente).
        </p>
        <p style={P}>
          <strong>Repasse dentro da mesma estação</strong> — "Falhada" é uma CONCLUSÃO de fim de estação, nunca um
          estado que trava um novo diagnóstico. Ao incluir a vaca num lote novo (repasse) da mesma estação, ela
          fica apta a receber Prenha/Vazia nesse lote, sempre — mesmo que esteja marcada "Falhada" num lote
          anterior. Enquanto esse lote novo ainda está sem diagnóstico, a sequência mostra <strong>"Vazia — 1º
          repasse"</strong> (2º lote da estação para ela), <strong>"Vazia — 2º repasse"</strong> (3º lote), e
          assim por diante, no lugar do "Pendente" genérico — só pra deixar claro que ela vem de uma tentativa
          anterior sem sucesso. "Falhada" só reaparece se essa nova tentativa também for diagnosticada Vazia
          <strong>e</strong> não houver nenhum lote posterior dela na mesma estação.
        </p>
        <p style={P}>
          O status aparece na sequência do lote (mesmo lugar de Prenha/Pariu/Com cria ao pé/Desmamado/Abortou) e
          na ficha do animal (Cadastro de Animais → Histórico reprodutivo). É <strong>derivado</strong>
          (recalculado toda vez que a tela abre, a partir dos diagnósticos/partos/abortos já lançados) — não
          existe uma coluna "falhada" separada no banco, então a exibição nunca diverge do que foi realmente
          registrado. O botão <strong>"Marcar Falhada"</strong>, na sequência do lote, aparece numa linha ainda
          sem diagnóstico (Pendente) de uma vaca que não tem nenhum "Prenha" em outro lote da mesma estação —
          serve pra fechar o resultado ("não emprenhou") antes do fim da estação (ex: um repasse que não vai
          mais ser testado), e grava exatamente o mesmo que o botão "Vazia" já grava. Pra desfazer, use o "x" ao
          lado do rótulo "Falhada" — volta o diagnóstico daquela linha para Pendente. Os outros dois motivos se
          desfazem pelos próprios fluxos: excluir o aborto, ou simplesmente não confirmar a perda presumida.
        </p>
        <p style={P}>
          Na tela de <strong>Compra & Venda</strong> (Gestão Financeira), o formulário de venda tem os 3 motivos
          como filtros separados — úteis pra decidir separadamente (quem não emprenha é um problema diferente
          de quem aborta) — mais um atalho <strong>"Todas as falhadas na última estação"</strong> pra pegar as
          3 de uma vez, sem marcar uma por uma.
        </p>
        <p style={P}>
          A tabela <strong>"Por ciclo"</strong>, mais abaixo na ficha do animal, usa a MESMA classificação, só
          que consolidando ESTAÇÕES dentro do ciclo (um ciclo pode ter 2 ou mais: ex. IA em out/nov + repasse
          com touro em jan/fev) — mesmo princípio de "quem pariu não é falhada" aplicado um nível acima:
        </p>
        <ul style={{ ...OL, listStyle: 'disc' }}>
          <li>Pariu em <strong>qualquer</strong> estação do ciclo → não é falhada, mesmo tendo falhado numa
            estação anterior.</li>
          <li>Falhou na única estação em que foi exposta (mesmo que o ciclo tenha tido outra estação em que ela
            não participou) → falhada.</li>
          <li>Exposta só numa estação do meio do ciclo (ex: comprada depois da 1ª) e falhou → falhada, sem
            penalizar por não ter participado da estação anterior.</li>
          <li><strong>Não exposta em nenhuma estação do ciclo</strong> → status próprio "Não exposta", nunca
            confundido com falha: quem não participou não fracassou.</li>
          <li>Falhou numa estação e está prenha noutra, ainda sem desfecho → "Gestação em aberto", não falhada
            ainda — só vira falhada se essa gestação se resolver sem terneiro.</li>
        </ul>
      </div>

      <div id="reprodutivo-perda-presumida" style={{ scrollMarginTop: 90, marginTop: 18 }}>
        <h4 style={H4}>Perda gestacional presumida (motivo "perda gestacional" de Falhada)</h4>
        <p style={P}>
          O sistema tem <strong>duas réguas</strong> pra uma vaca prenha sem desfecho — uma escala em dois
          estágios, ancorados na mesma data (a da monta), não dois conceitos concorrentes:
        </p>
        <ul style={{ ...OL, listStyle: 'disc' }}>
          <li><strong>Estágio 1 — sinal fraco, só agregado</strong> (300 dias da monta, ~17 dias após o parto
            previsto): entra na % de "Perda Gestacional" mostrada em Reprodutivo/Metas. Não identifica nenhuma
            vaca específica, não muda nenhum cadastro — um atraso de 2-3 semanas é comum (erro de diagnóstico,
            gestação um pouco mais longa) e não justifica mexer em nada.</li>
          <li><strong>Estágio 2 — sinal forte, individual</strong> (180 dias APÓS o parto previsto = 463 dias
            da monta): essa é a "perda gestacional presumida" descrita aqui. Só depois de quase 6 meses de
            atraso, sem parto nem aborto registrado, a vaca específica ganha um aviso mais forte que o simples
            "atrasada" (vermelho) da linha do tempo — com fundo e botão de confirmação — na linha dela no
            detalhe do lote <strong>e</strong> na ficha do animal (Cadastro de Animais → Histórico
            reprodutivo).</li>
        </ul>
        <p style={P}>
          Até você clicar em <strong>"Confirmar perda"</strong>, nada é gravado — o aviso é só um sinal
          calculado na hora de exibir a tela (mesmo princípio do "Com cria ao pé": nunca mexe no cadastro
          sozinho).
          Confirmando, o sistema mostra um resumo do que vai mudar e só grava depois desse clique:
        </p>
        <div style={{ background:'#F3F4F6', borderRadius:8, padding:'10px 14px', fontSize:'.82rem', color:'#111827', marginBottom:18, lineHeight:1.7 }}>
          Situação reprodutiva da vaca: prenha → vazia
        </div>
        <AlertBox type="amber" icon="ti-tag"
          title='Por que confirmar importa: muda a CATEGORIA da vaca, não os índices reprodutivos'
          body='Taxa de prenhez, taxa de parição, taxa de aproveitamento e kg desmamado por matriz NÃO mudam com isso — são calculados a partir do diagnóstico da inseminação e dos partos/abortos, nunca da situação reprodutiva atual do animal. O que muda de verdade é a CATEGORIA dela (calcCategoriaRebanho): enquanto ficar "prenha" sem confirmação, ela continua contando como "Vaca Prenha" (ou "Vaca Prenha 13-24m" etc.) no Valor de Mercado do Rebanho (Dashboard, Relatórios) e nos filtros por categoria (Animais, Pesagens, Sanidade) — superavaliada, e na categoria errada — mesmo já fazendo mais de um ano que a gestação deveria ter terminado. Confirmar corrige isso.' />
        <p style={P}>
          Se um parto atrasado for registrado depois — mesmo já tendo confirmado a perda presumida — não há
          conflito: registrar um nascimento sempre marca a mãe como "vazia" de novo, então é só uma gravação
          repetida sobre o mesmo valor.
        </p>
      </div>

      <div id="reprodutivo-partos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Partos</h4>
        <p style={P}>
          O botão <strong>"Registrar nascimento"</strong> aparece ao lado de qualquer fêmea diagnosticada
          Prenha. O formulário pede: <strong>data do nascimento</strong>, <strong>mãe</strong> (só aparecem
          aqui fêmeas com diagnóstico de prenhez confirmado em algum lote), <strong>sexo do bezerro</strong> e,
          opcionalmente, <strong>peso ao nascer</strong> e observações. Pai, proprietário e lote são
          preenchidos sozinhos a partir da mãe e do lote. Se você informar o peso ao nascer, o sistema já cria
          uma pesagem do tipo "nascimento" automaticamente — você não precisa lançar essa pesagem de novo na
          tela Pesagens.
        </p>
        <p style={P}>
          Ao abrir esse formulário <strong>pelo detalhe do lote</strong> (clicando em "Registrar nascimento" na
          linha de uma vaca), a <strong>mãe</strong> e a <strong>safra (lote de origem)</strong> já vêm
          fixadas pela linha em que você clicou — os dois campos aparecem travados (somente leitura), sem
          seletor pra trocar. Isso evita reabrir a escolha e acabar vinculando o nascimento à mãe ou à safra
          erradas por engano. Aberto pela aba <strong>Nascimentos</strong> (botão "+ Registrar nascimento" no
          topo da lista), os dois campos continuam livres — é o fluxo pra quando você não está navegando a
          partir de um lote específico.
        </p>
        <AlertBox type="red" icon="ti-lock"
          title='Uma vaca não pode ter dois partos na mesma safra'
          body='O sistema bloqueia o registro de um 2º nascimento para a mesma mãe na mesma safra (mesmo lote de origem) — mensagem clara na hora do clique. Gêmeos existem em corte, mas são raros o bastante para não merecerem essa opção na tela; um caso real de gêmeos precisa ser lançado com ajuda do suporte. A vaca some da lista de "Registrar nascimento" assim que o primeiro parto dela naquela safra é salvo, sem precisar recarregar a página.' />
        <p style={P}>
          O <strong>brinco do bezerro</strong> pode ser digitado na hora do registro — deixe em branco e o
          sistema gera um automático (SN-01, SN-02...), mostrando antes de salvar exatamente qual número vai
          usar. Se você digitar um brinco já usado por outro animal <strong>desta fazenda</strong> (brinco é
          único por fazenda, não por conta nem entre fazendas diferentes), aparece um aviso vermelho na hora e o
          botão de salvar fica bloqueado até você trocar o brinco. A mesma checagem de duplicidade vale na
          edição do nascimento.
        </p>
        <p style={P}>
          Marque <strong>"Natimorto"</strong> quando o bezerro nasceu morto: o animal é criado normalmente
          (mantém genealogia — mãe, pai, brinco, sexo), mas já com situação "morto" e data de baixa igual à
          data do parto, e o parto fica marcado internamente como natimorto. Um bezerro natimorto entra na{' '}
          <strong>mortalidade de terneiros</strong> (Metas → Perdas) e nunca aparece na oferta de desmame nem
          conta no kg de desmame — ele nunca teve a chance de ser desmamado.
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Toda safra é obrigatória — e a janela de gestação bloqueia</h4>
        <p style={P}>
          Uma gestação dura cerca de 9 meses, então é normal o parto cair no ciclo seguinte ao da monta que o
          originou. Você <strong>não precisa escolher um ciclo</strong> na hora de registrar o parto: basta
          escolher a mãe e a data do parto — o sistema procura sozinho, entre todos os lotes onde aquela mãe
          está com diagnóstico Prenha, qual monta bate com essa data (dentro da janela de gestação válida, 260
          a 300 dias). O quadro <strong>"Safra (lote de origem)"</strong> mostra o resultado dessa busca e traz
          um seletor manual — com todos os lotes onde a mãe tem diagnóstico Prenha — pra você trocar se o
          automático escolheu errado.
        </p>
        <AlertBox type="red" icon="ti-lock"
          title='Todo nascimento PRECISA de uma safra vinculada — o botão de salvar fica bloqueado até isso acontecer'
          body='Não é mais possível registrar um parto sem lote de origem (nem escolhendo "sem lote" de propósito). Se nenhum lote da mãe cair na janela de gestação para a data informada, o quadro "Safra" fica vermelho e o salvamento é bloqueado, com a orientação: vincule a um lote existente da mãe, ou — se ainda não existe — registre primeiro a inseminação ou monta (IA ou monta natural, na aba "Lotes / Montas") que originou essa gestação. O mesmo vale se você escolher manualmente um lote cuja data de monta não bate com o parto: o sistema mostra os dias calculados, a janela válida (260 a 300) e a data da monta, e bloqueia — isto é biologia, não uma preferência sua.' />
        <p style={P}>
          Isso é diferente de <strong>quando</strong> você está preenchendo a tela. Lançar hoje um parto que
          aconteceu meses atrás é normal e sempre funciona — o sistema nunca restringe pela data de hoje, só
          pela data real do parto (e pela janela de gestação dela com a monta). Se o lançamento estiver muito
          atrasado (mais de 180 dias entre o parto e hoje), aparece um aviso <strong>informativo</strong> — nunca
          bloqueia.
        </p>
        <div style={CODE}>
          O parto em si conta para o ciclo em que ele aconteceu de verdade (para relatórios/lançamentos por
          data). Mas os <strong>índices de parição e perdas</strong> contam sempre para a safra da <strong>monta</strong> —
          veja "Índices e funil da safra" abaixo.
        </div>
        <AlertBox type="amber" icon="ti-calendar-repeat"
          title='Registrar um nascimento atrasado troca o ciclo exibido na tela'
          body='O parto sempre grava certo, no ciclo da SUA data real — mas se você está revisando um lote de uma safra antiga (seletor de ciclo no topo apontando pra ela) e registra um nascimento com a data de hoje, esse parto pertence ao ciclo de hoje, não ao ciclo que você estava vendo. Nesse caso o sistema troca sozinho o ciclo selecionado para o do parto (com aviso no toast), pra você já ver o registro novo direto na aba Nascimentos — sem isso, o parto ficaria certo no banco mas pareceria "sumido" da tela.' />

        <h4 style={{ ...H4, fontSize: '.85rem' }}>Partos sem lote vinculado (órfãos legados)</h4>
        <p style={P}>
          Antes desta trava existir, alguns partos foram salvos sem lote de origem — hoje isso não é mais
          possível na criação, mas os registros antigos continuam no banco. Um parto <strong>sem lote
          vinculado</strong> some dos índices de parição, mortalidade de terneiros, GMD Terneiros e todo o
          funil da safra, porque esses índices são ancorados no lote (a monta), não na mãe. Isso era{' '}
          <strong>invisível</strong> — hoje um{' '}
          <span style={{ background:'#FEF3C7', border:'.5px solid #F3D5A3', borderRadius:12, padding:'1px 8px', fontSize:'.78rem', fontWeight:600, color:'#92620A' }}>⚠ Sem lote vinculado — fora dos índices da safra</span>{' '}
          aparece tanto na coluna "Touro" da aba Nascimentos quanto na Linha do tempo da ficha do animal (mãe e
          terneiro), sempre com essa explicação completa.
        </p>
        <p style={P}>
          Para corrigir: abra o nascimento pela aba Nascimentos (<i className="ti ti-edit" /> Editar) e escolha
          o lote certo no quadro "Safra (lote de origem)" — o mesmo seletor do registro, agora também
          disponível na edição, com a mesma trava biológica: se o lote escolhido não bater com a janela de
          gestação (260-300 dias), o salvamento é bloqueado. Diferente do registro, a edição ainda permite
          deixar "— nenhum (sem lote) —" — é a única forma de mexer nesses registros antigos sem forçar um
          vínculo que talvez não exista (dados legados às vezes têm datas imprecisas).
        </p>
        <h4 style={{ ...H4, fontSize: '.85rem' }}>Aba Nascimentos</h4>
        <p style={P}>
          Além das pills de proprietário, a lista tem <strong>quatro filtros combináveis</strong> (em conjunto
          entre si e com a pill de proprietário ativa): sexo, touro, lote de inseminação e estação de monta.
          As opções de cada filtro vêm de todos os nascimentos do ciclo — escolher um não faz as opções dos
          outros desaparecerem. Os cards de resumo mostram só o <strong>total</strong> e a contagem de{' '}
          <strong>machos/fêmeas</strong>; os cards por proprietário foram removidos por serem redundantes com as
          pills de filtro logo acima, que já separam por proprietário.
        </p>
        <p style={P}>
          O <strong>brinco da mãe e do terneiro</strong>, na tabela, são clicáveis — abrem o cadastro do animal
          direto na tela Animais, mesmo atalho já usado na linha do tempo do lote.
        </p>
      </div>

      <div id="reprodutivo-abortos" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Abortos</h4>
        <p style={P}>
          Disponível como <strong>"Registrar aborto"</strong> ao lado de uma fêmea Prenha que ainda não pariu.
          Pede data do aborto, <strong>causa</strong> (Infeccioso, Nutricional, Traumático, Desconhecido ou
          Outro) e observações opcionais. Ao salvar, a situação reprodutiva da fêmea volta para "vazia" — mas
          o diagnóstico de prenhez original continua no histórico, o aborto é só um evento novo em cima dele,
          nada é apagado ou reescrito.
        </p>
      </div>

      <div id="reprodutivo-indices" style={{ scrollMarginTop: 90 }}>
        <h4 style={H4}>Índices e funil da safra</h4>
        <p style={P}>
          Cada safra (lote, ou o conjunto de lotes de um ciclo) mostra um funil: matrizes aptas → taxa de
          aproveitamento → expostas/inseminadas → prenhas → taxa de prenhez → gestando (ainda dentro do prazo,
          sem diagnóstico definitivo de parto ainda) → abortos → perdas não identificadas → perda gestacional
          → partos → taxa de parição → peso médio ao nascer → mortalidade de terneiros → desmamados → taxa de
          desmama → peso médio ao desmame → kg de bezerro desmamado por matriz exposta. Peso ao desmame é
          opcional (ver seção anterior) — "peso médio ao desmame", "P205 médio" e "kg por matriz exposta" contam
          só quem tem peso (real ou, na falta dele, o peso da venda), nunca os sem peso como zero; o card mostra
          "X de Y com peso" quando a contagem é parcial.
        </p>
        <AlertBox type="amber" icon="ti-calendar-repeat"
          title="Os índices pertencem ao ciclo da MONTA, não ao ciclo do parto"
          body="Um parto que acontece em outubro de 2026 (ciclo 2026/27) pode contar para os índices do ciclo 2025/26, se a monta que o gerou foi lançada nesse ciclo anterior — porque a gestação atravessa a virada do ciclo. É por isso que, ao vender ou excluir um animal, o índice histórico da safra em que ele nasceu não muda: ele já está fechado na safra da monta, não recalcula pela data de hoje." />
      </div>

      <h4 style={{ ...H4, marginTop: 4 }}>Validações de data e idade</h4>
      <ul style={{ ...OL, listStyle: 'disc' }}>
        <li><strong>Fêmea nascida depois da monta</strong> — nem aparece na lista para selecionar; se por algum caminho for enviada mesmo assim, o sistema recusa salvar.</li>
        <li><strong>Idade mínima para exposição: 24 meses</strong> (na data da monta, não hoje) — o mesmo corte usado para contar uma fêmea como "matriz apta" em Metas. Fêmeas mais novas nem aparecem na lista de seleção do lote.</li>
        <li><strong>Idade mínima para parto: 20 meses</strong> (na data do parto) — abaixo disso, o sistema recusa salvar por ser biologicamente implausível.</li>
        <li><strong>Gestação fora de 260-300 dias</strong> entre a monta e o parto — isto é só um <strong>aviso</strong>, não bloqueia: o sistema salva mesmo assim e pede para você conferir se escolheu o lote certo.</li>
      </ul>
    </div>
  )
}
