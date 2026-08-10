import { AlertBox } from '../../../components/UI'

export default function SecaoPropriedade({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Propriedade</strong> reúne a gestão do dia a dia da fazenda: piquetes (pastagens),
        lotes (agrupamentos de animais) e o planejamento estratégico. Para cadastrar uma fazenda nova ou
        editar os dados dela, veja a seção <strong>Primeiros Passos</strong> — aqui o foco é o uso contínuo.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Piquetes</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Cada piquete tem nome, qualidade e tipo de pastagem, finalidade (ex: "matrizes", "bezerros") e um
        <strong> status</strong>: <strong>Em uso</strong> (verde) ou <strong>Em descanso</strong> (amarelo). O
        card de cada piquete mostra há quantos dias ele está naquele status, e um botão troca entre os dois.
      </p>
      <h4 style={{ fontSize: '.85rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: cadastrar um piquete com área no mapa</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo piquete"</strong> e preencha nome, pastagem e finalidade.</li>
        <li>Em <strong>"Definição da área"</strong>, escolha um dos 3 modos: <strong>Manual</strong> (digita a área em hectares direto), <strong>Arquivo KML</strong> (importa um arquivo de mapa e a área é calculada sozinha) ou <strong>Desenhar no mapa</strong>.</li>
        <li>No modo "Desenhar no mapa", clique em <strong>"Abrir mapa para desenhar"</strong> — a tela mostra uma imagem de satélite da região. Clique no ícone de polígono (canto superior esquerdo do mapa) e marque os cantos da área do piquete.</li>
        <li>Clique em <strong>"Confirmar área"</strong> — a área em hectares é calculada sozinha a partir do desenho (dá para ajustar o número manualmente depois, se precisar).</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 18 }}>
        A soma da área de todos os piquetes cadastrados é a <strong>"Área útil"</strong> da fazenda, mostrada
        em Primeiros Passos e usada nos indicadores do Painel — ela é sempre recalculada sozinha, você nunca
        digita a área útil total diretamente.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Lotes</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Um "lote" aqui é um <strong>agrupamento de animais</strong> — por exemplo, para organizar o manejo ou
        saber rapidamente quantas cabeças de cada categoria estão num grupo. Cada lote tem nome, finalidade,
        descrição e a lista de animais que pertencem a ele.
      </p>
      <h4 style={{ fontSize: '.85rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: criar um lote e adicionar animais</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li>Clique em <strong>"Novo lote"</strong> e informe o nome (único campo obrigatório).</li>
        <li>Na lista de animais, use os filtros de <strong>categoria</strong> e <strong>proprietário</strong> para achar mais rápido, e marque as caixinhas dos animais que devem entrar no lote — ou use <strong>"Selecionar todos do filtro"</strong>.</li>
        <li>Um animal que já está em outro lote mostra um aviso "(em outro lote: nome)", mas você ainda pode movê-lo — ele sai do lote antigo automaticamente ao entrar no novo.</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Planejamento</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8 }}>
        A aba <strong>Planejamento</strong> organiza a estratégia da fazenda em 3 partes: <strong>"Por quê?"</strong>
        (propósito da fazenda), <strong>"O quê?"</strong> (valor da terra, do rebanho e das benfeitorias, usados
        para calcular a rentabilidade do ciclo) e <strong>"Como?"</strong> (lista de ações com prazo e ciclo-alvo).
        Se ainda não existe planejamento cadastrado, um botão <strong>"Criar planejamento"</strong> começa o processo.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10, marginTop: 14 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="green" icon="ti-info-circle"
          title="Excluir piquete ou lote não apaga animal nenhum"
          body='Excluir um piquete ou um lote só desvincula os animais dele (ele "fica vazio") — o histórico e o cadastro dos animais são preservados.' />
        <AlertBox type="amber" icon="ti-swords"
          title='"Lote" tem dois sentidos diferentes no sistema'
          body='O "lote" desta tela é um agrupamento de animais (manejo geral). Já o "lote de inseminação/monta" — usado para IATF, repasse e monta natural, com sua "estação de monta" — é outra coisa, cadastrado dentro do módulo Gestão Reprodutiva. Veja a seção Gestão Reprodutiva.' />
      </div>
    </div>
  )
}
