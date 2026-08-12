import { useState } from 'react'
import { Field, AlertBox } from '../../../components/UI'

// ── Recriação do formulário real de "Novo animal" (Animais.jsx) — mesmos
// campos e componente <Field>, estado 100% local, não grava nada. Mesma
// convenção de demonstração usada nas outras seções do manual.
function DemoNovoAnimal() {
  const [demo, setDemo] = useState({ brinco: '', sisbov: '', sexo: 'F', data_nascimento: '', numero_registro: '', nome: '', classificacao: '', pai: '', mae_brinco: '' })

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
      <div className="grid-form">
        <Field label="Brinco" required>
          <input value={demo.brinco} onChange={e => setDemo(p => ({ ...p, brinco: e.target.value }))} placeholder="ex: 0231" />
        </Field>
        <Field label="SISBOV" hint="Opcional — só números, 15 dígitos no padrão brasileiro (avisa se for diferente, não bloqueia).">
          <input value={demo.sisbov} inputMode="numeric" placeholder="15 dígitos"
            onChange={e => setDemo(p => ({ ...p, sisbov: e.target.value.replace(/\D/g, '') }))} />
        </Field>
        <Field label="Número do Registro" hint="Opcional — texto livre.">
          <input value={demo.numero_registro} onChange={e => setDemo(p => ({ ...p, numero_registro: e.target.value }))} placeholder="ex: PO-12345" />
        </Field>
        <Field label="Nome" hint="Opcional — o brinco continua sendo a identificação principal.">
          <input value={demo.nome} onChange={e => setDemo(p => ({ ...p, nome: e.target.value }))} placeholder="ex: Estrela" />
        </Field>
        <Field label="Sexo" required>
          <select value={demo.sexo} onChange={e => setDemo(p => ({ ...p, sexo: e.target.value }))}>
            <option value="F">Fêmea</option>
            <option value="M">Macho</option>
          </select>
        </Field>
        <Field label="Data de nascimento" required>
          <input type="date" value={demo.data_nascimento} onChange={e => setDemo(p => ({ ...p, data_nascimento: e.target.value }))} />
        </Field>
        <Field label="Categoria" hint="Calculada automaticamente" hintInline>
          <input type="text" readOnly value="—" style={{ background: '#F3F4F6', color: '#9CA3AF', cursor: 'default' }} />
        </Field>
        <Field label="Classificação" hint="Opcional.">
          <select value={demo.classificacao} onChange={e => setDemo(p => ({ ...p, classificacao: e.target.value }))}>
            <option value="">—</option>
            <option value="PO">PO — Puro de Origem</option>
            <option value="PA">PA — Puro por Cruzamento</option>
            <option value="CO">CO — Controlado por Ascendência</option>
            <option value="NA">N/A</option>
          </select>
        </Field>
        <Field label="Pai" hint="Digite o nome — o sistema mostra ao vivo se bate com um touro cadastrado ou externo já usado, e há um seletor de atalho com os dois.">
          <input value={demo.pai} onChange={e => setDemo(p => ({ ...p, pai: e.target.value }))} placeholder="Nome do touro" />
        </Field>
        <Field label="Mãe (brinco)" hint="Digite o brinco — o sistema avisa ao vivo se encontrou um animal cadastrado com esse brinco, e há um seletor de atalho com as fêmeas da fazenda.">
          <input value={demo.mae_brinco} onChange={e => setDemo(p => ({ ...p, mae_brinco: e.target.value }))} placeholder="ex: 03" />
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" disabled><i className="ti ti-check" /> Salvar</button>
      </div>
    </div>
  )
}

export default function SecaoAnimais({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Cadastro de Animais</strong> é a ficha individual de cada animal do rebanho: dados
        básicos, genealogia (pai/mãe) e uma linha do tempo automática com tudo que já aconteceu com aquele
        animal em outros módulos (pesagem, inseminação, parto, aborto).
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: cadastrar um animal</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo animal"</strong>.</li>
        <li>Preencha <strong>brinco</strong>, <strong>sexo</strong> e <strong>data de nascimento</strong> — a <strong>categoria</strong> é calculada sozinha a partir da data de nascimento, você não escolhe.</li>
        <li><strong>SISBOV</strong>, <strong>Número do Registro</strong>, <strong>Nome</strong> e <strong>Classificação</strong> (PO/PA/CO/N-A) são opcionais. O SISBOV só aceita números; o padrão brasileiro tem 15 dígitos — se você digitar um número diferente disso, o sistema avisa mas deixa salvar do mesmo jeito (útil para registros em formato antigo). O <strong>Nome</strong> é só um dado complementar — o brinco continua sendo a identificação principal em listas, buscas e documentos, o nome nunca substitui ele.</li>
        <li>Se for um macho reprodutor, marque <strong>"É touro"</strong> — isso faz ele contar como Touro para sempre, não importa a idade, e passa a mostrar o card <strong>"Histórico reprodutivo do touro"</strong> na ficha dele (veja mais abaixo).</li>
        <li>Preencha raça, pelagem, proprietário e, se já existir, o lote.</li>
        <li><strong>Pai</strong> e <strong>Mãe (brinco)</strong> continuam sendo campos de texto (você pode digitar o nome/brinco de um touro ou mãe que nunca foi cadastrado no sistema), mas agora com resolução ao vivo: se o texto bate com um animal já cadastrado — ou, no caso do Pai, com um touro externo já usado antes —, o sistema mostra a confirmação e grava o vínculo por cadastro, não só o texto. Cada campo também tem um seletor de atalho para escolher direto, sem digitar. Sem vínculo (animal não encontrado), o texto continua sendo salvo do jeito de sempre.</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o formulário abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoNovoAnimal />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Cadastro em lote pela planilha</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Para cadastrar muitos animais de uma vez: clique em <strong>"Plan. cadastro lote"</strong> para baixar
        a planilha modelo, preencha uma linha por animal (as mesmas colunas do formulário: brinco, sexo, data
        de nascimento, proprietário, raça, pelagem, pai, mãe, lote, situação, e opcionalmente número do
        registro, classificação e SISBOV), e depois clique em
        <strong> "Importar plan. cad. lote"</strong> e escolha o arquivo preenchido. O sistema mostra uma
        prévia com quantas linhas estão certas e quais têm erro (proprietário ou lote com nome que não bate
        com o cadastro, data em formato errado, sexo/situação/classificação inválidos, etc.) antes de
        importar — linhas com erro são ignoradas, o resto entra normalmente.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        <strong>Pai</strong> e <strong>mãe (brinco)</strong> também são resolvidos por cadastro na importação,
        mesma ideia do formulário manual: "pai" que bate com um touro já cadastrado ou já usado como externo
        vira vínculo de verdade; a mãe é procurada pelo brinco entre os animais já existentes <em>e</em> entre
        os que estão sendo importados na mesma planilha (uma mãe pode estar na linha de cima do próprio
        arquivo). Quem não bate com nada fica só como texto, do jeito de sempre — nunca cria um touro externo
        novo automaticamente a partir da planilha (evita lixo em massa se houver erro de digitação em várias
        linhas). Ao final, o aviso mostra quantos vínculos de pai e de mãe foram resolvidos por cadastro e
        quantos ficaram só como texto.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Genealogia e monta natural com vários touros</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Quando um bezerro nasce de um lote de <strong>monta natural com mais de um touro</strong> junto
        (Gestão Reprodutiva), o sistema não sabe qual touro é o pai de verdade — nesse caso o campo Pai é preenchido
        sozinho com algo como "Monta natural — Lote 4, Estação Repasse 26/27" em vez de um nome. Na ficha do
        animal e na árvore genealógica, esse "pai" aparece como um link clicável que leva direto ao lote de
        monta em Gestão Reprodutiva, para você conferir quais touros estavam juntos naquele período — em vez de um
        nome de touro comum, que não é clicável por não haver como confirmar de qual animal cadastrado
        aquele nome se refere.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Linha do tempo</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Mostra automaticamente, do mais recente para o mais antigo: nascimento, cada pesagem, cada
        inseminação (com o lote e o touro/sêmen usado), cada diagnóstico de gestação (prenha ou vazia), cada
        parto (tanto os que ela teve quanto o próprio nascimento dela, se foi registrado como bezerro) e cada
        aborto. Você não lança nada aqui — a linha do tempo só reúne o que já foi registrado nas telas
        Pesagens, Gestão Reprodutiva e no próprio Cadastro de Animais.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Gráfico de evolução de peso</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Ao lado da linha do tempo, a ficha mostra o mesmo gráfico de evolução de peso da consulta "Por Animal"
        em Pesagens — todas as pesagens do animal, na ordem em que aconteceram. Sem pesagem registrada, o
        espaço mostra "Nenhuma pesagem registrada para este animal" em vez de um gráfico vazio.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Quando existem pelo menos <strong>3 contemporâneos</strong> — animais da mesma fazenda, do mesmo sexo,
        nascidos numa janela de ±3 meses ao redor da data de nascimento dele — o gráfico ganha uma 2ª linha,
        tracejada e discreta, com a média de peso desses contemporâneos na mesma data. Com menos de 3
        contemporâneos (a média de 1 ou 2 animais não representa nada), a linha não aparece e um aviso discreto
        explica o motivo.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Linha do tempo produtiva (só fêmeas com histórico)</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Um gráfico de barras com uma safra por coluna, mostrando o desfecho de cada uma — pariu (com o peso do
        terneiro ao desmame, quando já desmamado), abortou, prenha aguardando desfecho, falhou (foi exposta mas
        não teve resultado) ou não foi exposta naquela safra. É a resposta rápida para "esta matriz é regular?":
        barras altas e verdes seguidas mostram uma vaca que pare e desmama todo ano; barras baixas e de outras
        cores mostram as falhas. Só aparece com pelo menos 2 safras no histórico — com 1 só, não haveria o que
        comparar.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Desempenho dos filhos, GMD (só fêmeas com histórico)</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Um gráfico de barras com o GMD de cada cria (mesmo cálculo de Pesagens), na ordem em que nasceram — dá
        pra ver se os filhos dela vêm melhorando ou piorando ao longo das safras. Só entram filhos com peso
        suficiente pra calcular o GMD (2 ou mais pesagens); com menos de 2 filhos calculáveis, o gráfico não
        aparece.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Desempenho reprodutivo (histórico de vida)</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Só aparece na ficha de <strong>fêmeas com algum histórico reprodutivo</strong> (pelo menos um parto,
        inseminação ou aborto registrado). São 14 indicadores calculados sobre a vida inteira da matriz, não
        só o ciclo atual: intervalo entre partos, taxa de fecundidade, taxa de perda gestacional, taxa de
        perda pós-parto, GMD médio dos filhos, fêmeas × machos entre os filhos, peso médio dos filhos ao
        nascer e ao desmame, idade ao primeiro parto, número de partos na vida, kg de terneiro desmamado
        acumulado na vida, kg desmamado por ano de vida (normaliza pela idade — sem isso uma vaca mais velha
        sempre pareceria "melhor" só por ter tido mais partos), taxa de desmame e partos por ano exposta.
      </p>
      <AlertBox type="green" icon="ti-info-circle"
        title='Cartão mostra "sem dados", nunca zero'
        body="Quando não há histórico suficiente para calcular um indicador específico (ex: só um parto registrado, sem intervalo pra medir), o cartão mostra “sem dados” em vez de 0 — um zero ali poderia ser lido como resultado ruim de verdade, e não é isso." />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Histórico reprodutivo do touro (só machos marcados "É touro")</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Card próprio na ficha do touro, com: <strong>nº de filhos</strong>, <strong>machos × fêmeas</strong>
        entre eles, <strong>GMD médio dos filhos</strong> (mesma fórmula da "GMD Terneiros" de Metas — só
        pesagens enquanto o filho ainda era Terneiro/Terneira), <strong>peso médio ao nascer</strong>,
        <strong> efetividade de cobertura</strong> (% de fêmeas distintas diagnosticadas Prenha entre as
        expostas a este touro — mesma fórmula oficial de "Taxa de Prenhez" usada no resto do sistema) e o
        <strong> nº de safras</strong> em que ele atuou, além de 3 gráficos: machos × fêmeas, GMD deste touro
        comparado à média da fazenda <strong>nas mesmas safras</strong> (nunca a fazenda inteira — senão um
        touro antigo seria comparado com bezerros de hoje, com nutrição/manejo diferentes) e efetividade de
        cobertura por safra.
      </p>
      <AlertBox type="amber" icon="ti-alert-triangle"
        title='Lote com mais de um touro fica fora dos números'
        body='Numa monta natural com MAIS DE UM touro, o sistema não tem como saber qual touro cobriu qual vaca — paternidade indefinida não gera estatística individual pra nenhum dos dois. Esses lotes nunca entram nos números/gráficos deste card, só numa contagem à parte avisando quantas coberturas ficaram de fora por esse motivo.' />
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        O vínculo entre o touro e cada filho/lote é por <strong>cadastro</strong> (não por texto): ao criar um
        lote com este touro selecionado no seletor "Touros da fazenda", o sistema grava um id, não só o nome —
        e esse mesmo id é herdado pelo bezerro na hora do nascimento. Isso significa que só entram no histórico
        os filhos/lotes vinculados <strong>a partir de quando essa vinculação passou a existir</strong>. Um
        filho ou lote de antes disso, com só o texto batendo com o brinco do touro, aparece <strong>à parte</strong>,
        numa contagem própria de "sem vínculo" — nunca somado aos números principais.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Amostras pequenas (menos de 5 filhos, ou menos de 5 diagnósticos, dependendo do indicador) ganham um
        selo <strong>"amostra pequena"</strong> ao lado do número — ele não some, só avisa que aquele
        percentual ainda não é estatisticamente confiável. O carregamento é sob demanda: só busca os dados
        desse touro específico quando a ficha dele é aberta, nunca ao carregar a lista geral de animais.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como a categoria é calculada</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        Sempre pela <strong>idade atual</strong> (data de hoje − data de nascimento), mais o sexo e — nas
        fêmeas — se está prenha:
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontSize: '.82rem', color: '#111827', marginBottom: 10, lineHeight: 1.9,
      }}>
        <strong>Fêmeas</strong> — até 12 meses: Terneira · 13 a 24 meses: Novilha 13-24m (ou "Prenha" se
        estiver prenha) · 25 a 36 meses: Novilha 25-36m (ou Prenha) · 37 a 84 meses: Vaca Vazia ou Vaca Prenha
        · acima de 84 meses (7 anos): Vaca Madura Vazia ou Prenha.<br /><br />
        <strong>Machos</strong> — até 12 meses: Terneiro · 13 a 24 meses: Novilho 13-24m · 25 a 36 meses:
        Novilho 25-36m · acima de 36 meses: Boi. Marcado como "É touro": sempre <strong>Touro</strong>, não
        importa a idade.
      </div>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6 }}>
        Essa é a categoria "oficial" usada em filtros, no valor de mercado estimado e nos lotes — é diferente
        de uma marcação manual: se a situação reprodutiva da fêmea mudar (engravidar, parir, abortar), a
        categoria dela muda sozinha na próxima vez que a tela recalcular.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10, marginTop: 14 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="amber" icon="ti-calendar-x"
          title="Data de nascimento não pode ser futura"
          body="O sistema recusa salvar um animal com data de nascimento depois de hoje." />
        <AlertBox type="amber" icon="ti-lock"
          title="Animal com histórico não pode ser excluído"
          body='Se o animal já tem pesagem, inseminação ou parto registrado, o botão Excluir não funciona — use "Vender" ou marque como "Morto" para dar baixa nele sem perder o histórico.' />
        <AlertBox type="green" icon="ti-info-circle"
          title="Pai e mãe com resolução ao vivo, mas ainda aceitam texto livre"
          body='Se o brinco/nome digitado não bate com nenhum animal cadastrado (ou, no caso do Pai, com um touro externo já usado), o sistema mostra que vai salvar só como texto e segue normalmente — a árvore genealógica só encontra o vínculo de verdade quando o texto bate com um cadastro existente no momento de salvar. Renomear o brinco da mãe depois não quebra mais vínculos já resolvidos por cadastro; só quem ficou como texto solto precisa de correção manual, e o sistema avisa quando isso acontece.' />
        <AlertBox type="amber" icon="ti-alert-circle"
          title="Ícone de aviso no nó do touro (2026-08-12)"
          body='Na árvore genealógica e no campo "Pai" da ficha, um touro sem vínculo por id (nem cadastro, nem externo) aparece com um ícone de alerta discreto: esse nome é texto congelado no momento em que foi lançado — se você renomear o touro cadastrado depois, esse texto específico NÃO acompanha (ao contrário dos vinculados por id, que sempre mostram o nome atual). O mesmo aviso aparece no cabeçalho do lote em Gestão Reprodutiva, para o touro daquela monta.' />
      </div>
    </div>
  )
}
