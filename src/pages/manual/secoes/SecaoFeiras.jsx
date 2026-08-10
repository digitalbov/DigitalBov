import { AlertBox } from '../../../components/UI'

const H4 = { fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }
const P  = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 14 }
const UL = { color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }

export default function SecaoFeiras({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ ...P, marginBottom: 16 }}>
        A tela <strong>Feiras e Premiações</strong> registra a participação de animais em feiras/exposições e
        os resultados obtidos, com filtros por categoria, proprietário, lote e feira, e um painel próprio na
        ficha de cada animal. O brinco de cada participação é clicável e abre a ficha do animal.
      </p>

      <h4 style={H4}>Feira x participação</h4>
      <p style={P}>
        A <strong>feira</strong> (só o nome — ex.: "Expofeira") é cadastrada uma vez só — ao digitar o nome no
        formulário, o sistema reaproveita automaticamente uma feira já existente nesta fazenda (mesmo
        mecanismo de resolução ao vivo usado para touro externo em Gestão Reprodutiva: mostra embaixo do
        campo se vai reaproveitar uma feira já cadastrada ou criar uma nova, com sugestões de nomes
        parecidos). Isso evita que "Expofeira" e "EXPOFEIRA" virem dois cadastros diferentes. Cada
        <strong> participação</strong> liga um animal a uma feira NUM ANO — não precisa digitar o ano no
        nome, é só preencher a <strong>Data de início</strong> ao lado: o sistema já entende que "Expofeira"
        em 2028 e "Expofeira" em 2029 são a mesma feira, em anos diferentes.
      </p>

      <h4 style={H4}>A mesma feira, todo ano</h4>
      <p style={P}>
        Uma feira como a Expofeira acontece todo ano, com data (e às vezes local) diferentes. Ao preencher a
        data de uma feira já cadastrada, a tela mostra se aquele ano já tem participação registrada
        ("Expofeira — 2028 já cadastrada — Parque de Exposições · 12/09 a 15/09", local/datas só pra
        conferência) ou se vai ser a primeira vez ("Expofeira — 2029 ainda não tem registro"), com local
        pré-preenchido a partir do ano mais recente (a data nunca é copiada de outro ano — sempre em branco,
        pra evitar confundir uma data velha com a de agora). Em nenhum dos dois casos registrar uma
        participação altera um cadastro já existente: se um ano já está cadastrado, a participação nova só se
        liga a ele; se não está, cria um registro novo sem tocar nos anteriores. A única forma de corrigir
        local/data de um ano já cadastrado é o botão "Corrigir local/datas desta feira" (ver abaixo) —
        explícito, nunca automático.
      </p>

      <h4 style={H4}>Agendar x registrar resultado</h4>
      <p style={P}>
        Não existem duas telas ou dois passos separados: é o <strong>mesmo registro</strong> em dois momentos.
        Ao lançar a participação, deixe <strong>Colocação</strong> e <strong>Título</strong> em branco para
        agendar — ela aparece no <strong>Calendário</strong> como uma feira futura. Quando o resultado sair,
        edite essa mesma participação e preencha Colocação/Título; se a feira já tiver terminado e o resultado
        ainda não foi lançado, o Calendário mostra um alerta de "resultado pendente" na área de
        Atrasados/Vencidos.
      </p>

      <h4 style={H4}>Campos da participação</h4>
      <ul style={UL}>
        <li><strong>Categoria de julgamento</strong> — a categoria do RINGUE (ex.: "Novilha Júnior", "Touro Sênior"), digitada livremente. Não é a categoria zootécnica que o sistema calcula sozinho (idade/sexo/situação) — as duas aparecem separadas na lista, nunca confundidas.</li>
        <li><strong>Colocação</strong> (ex.: 1º lugar, Reservado) e <strong>Título</strong> (ex.: Grande Campeão) — campos separados, ambos opcionais.</li>
        <li><strong>Julgador</strong> e <strong>Raça/associação</strong> — sob a qual o animal foi julgado.</li>
      </ul>

      <h4 style={H4}>Na ficha do animal</h4>
      <p style={P}>
        Um card <strong>"Feiras e Premiações"</strong> aparece logo abaixo do Histórico Sanitário, com um
        resumo no topo ("X participações, Y premiações" — premiação é qualquer participação com Colocação
        preenchida) e a lista completa. Participações cuja feira já começou também entram na
        <strong> linha do tempo</strong> do animal; agendamentos totalmente futuros ficam só no Calendário.
      </p>

      <h4 style={H4}>Filtros</h4>
      <p style={P}>
        Categoria, proprietário e lote usam exatamente a mesma categoria/proprietário/lote já calculados para
        o animal em todo o resto do sistema — não é um critério novo. O filtro por feira lista todas as feiras
        já cadastradas nesta fazenda (mesmo as sem participação ainda) e traz participações de{' '}
        <strong>todos os anos</strong> daquela feira — para restringir a um ano específico, use o filtro de
        Ano ao lado, separado (os dois combinam entre si, como os demais filtros).
      </p>

      <AlertBox type="green" icon="ti-info-circle"
        title="Corrigir local/datas de uma feira já cadastrada"
        body='No formulário de participação, ao digitar o nome de uma feira já existente e a data de um ano já registrado, aparece um botão "Corrigir local/datas desta feira" — corrige local/data DAQUELE ANO específico (usado por todas as participações dele), sem precisar editar cada participação uma a uma. Outros anos da mesma feira não são afetados.' />
    </div>
  )
}
