import { AlertBox } from '../../../components/UI'

export default function SecaoBackup({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Backup e Dados</strong> tem 3 botões de exportação, todos da fazenda que você está
        vendo no momento:
      </p>

      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Backup Completo (.json)</strong> — todos os dados da fazenda num arquivo só: animais, proprietários, lotes, piquetes, reprodutivo (estações de monta, lotes de inseminação com os touros da monta natural, inseminações, partos, abortos), pesagens, sanidade (com o vínculo de cada procedimento aos animais tratados), estoque e movimentações, financeiro completo (com o rateio por proprietário de cada lançamento e o detalhe por animal de cada compra/venda) e ciclos, categorias de preço, metas, planejamento e simulações.</li>
        <li><strong>Exportar Animais (.xlsx)</strong> — planilha com o cadastro completo do rebanho (inclusive vendidos e mortos), com categoria calculada, genealogia, proprietário, lote e situação.</li>
        <li><strong>Exportar Financeiro (.xlsx)</strong> — lançamentos do ciclo atual, em planilha.</li>
      </ul>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        O arquivo .json começa com um cabeçalho de metadados — versão do formato, data em que foi gerado,
        conta e fazenda de origem, e a contagem de linhas de cada tabela — pensado para uma futura
        restauração conferir se o arquivo está íntegro antes de tocar em qualquer dado.
      </p>

      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Recomendação do próprio sistema: baixe o Backup Completo pelo menos uma vez por mês e guarde em local
        seguro (Google Drive, e-mail, pen drive).
      </p>

      <AlertBox type="amber" icon="ti-upload-off"
        title="Hoje não existe botão de importar/restaurar dentro do sistema"
        body='O arquivo .json do Backup Completo é pensado para guarda e, se um dia for realmente necessário, uma restauração feita pela equipe do DigitalBov direto no banco de dados — não existe, hoje, uma tela no aplicativo onde você faz upload desse arquivo e ele volta a virar dados. A planilha (.xlsx) de Animais/Financeiro é só para consulta, impressão e envio a terceiros (contador, banco): o próprio sistema avisa que ela "não pode ser reimportada automaticamente". A única importação real que existe no sistema é a de cadastro de animais em lote (planilha modelo, na tela Cadastro de Animais) — isso é diferente de um backup e não recupera nada além de fichas de animais novas.' />
    </div>
  )
}
