import { useState } from 'react'
import { Field, toast, AlertBox, Badge } from '../../../components/UI'

// Mesma lista de tipos que o formulário real oferece pra registro manual —
// 'compra'/'venda' ficam de fora porque só são gerados automaticamente pelas
// transações financeiras (Bloco D3 do Financeiro), nunca digitados aqui.
const TIPOS_MANUAIS_DEMO = ['nascimento', 'desmama', 'sobreano', 'intermediaria']
const TIPO_LABEL_DEMO = { nascimento: 'Nascimento', desmama: 'Desmama', sobreano: 'Sobreano', intermediaria: 'Intermediária' }

// ── Recriação do formulário real de "Registrar pesagem" (Pesagens.jsx) ─────
// Usa o mesmo componente <Field> e as mesmas classes (.grid-form, .btn) da
// tela real, com estado 100% local — não grava nada no banco. Serve pra quem
// está aprendendo ver o formulário exatamente como ele aparece no sistema,
// sem risco de mexer em dado de verdade.
function DemoFormularioPesagem() {
  const [demo, setDemo] = useState({ animal: '', data: '', tipo: 'intermediaria', peso: '', obs: '' })

  const salvarDemo = () => {
    if (!demo.animal || !demo.data || !demo.peso) {
      toast('Preencha animal, data e peso (isto é uma demonstração).', 'error')
      return
    }
    toast('Demonstração: nenhum dado foi salvo de verdade.')
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
        <i className="ti ti-flask" /> MODO DEMONSTRAÇÃO — não salva dados reais
      </div>

      <div className="grid-form">
        <Field label="Animal (brinco)" required>
          <select value={demo.animal} onChange={e => setDemo(p => ({ ...p, animal: e.target.value }))}>
            <option value="">— selecione —</option>
            <option value="demo1">0231</option>
            <option value="demo2">0198</option>
          </select>
        </Field>
        <Field label="Data" required>
          <input type="date" value={demo.data} onChange={e => setDemo(p => ({ ...p, data: e.target.value }))} />
        </Field>
        <Field label="Tipo" required>
          <select value={demo.tipo} onChange={e => setDemo(p => ({ ...p, tipo: e.target.value }))}>
            {TIPOS_MANUAIS_DEMO.map(t => <option key={t} value={t}>{TIPO_LABEL_DEMO[t]}</option>)}
          </select>
        </Field>
        <Field label="Peso (kg)" required>
          <input type="number" step="0.1" value={demo.peso} onChange={e => setDemo(p => ({ ...p, peso: e.target.value }))} placeholder="0,0" />
        </Field>
      </div>
      <Field label="Observações" hint='No sistema real, este formulário também aceita preenchimento por voz (botão de microfone), ex: "brinco zero três — quatrocentos quilos — intermediária".'>
        <input value={demo.obs} onChange={e => setDemo(p => ({ ...p, obs: e.target.value }))} placeholder="opcional" />
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button className="btn btn-primary" onClick={salvarDemo}><i className="ti ti-check" /> Salvar</button>
        <button className="btn btn-secondary" onClick={() => setDemo({ animal: '', data: '', tipo: 'intermediaria', peso: '', obs: '' })}>Limpar</button>
      </div>
    </div>
  )
}

export default function SecaoPesagens({ item }) {
  return (
    <div className="card">
      <div className="card-title"><i className={`ti ${item.icone}`} /> {item.titulo}</div>

      <p style={{ color: '#374151', fontSize: '.88rem', lineHeight: 1.6, marginBottom: 16 }}>
        A tela <strong>Pesagens</strong> é onde você registra o peso dos animais ao longo do tempo. Cada
        pesagem fica associada a um <strong>tipo</strong> (nascimento, desmama, sobreano ou intermediária), e é
        a partir do histórico de pesagens de um animal que o sistema calcula o <strong>GMD</strong> (Ganho
        Médio Diário).
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Abas do módulo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Registrar</strong> — formulário de lançamento manual de uma pesagem, um animal por vez (ver demonstração abaixo).</li>
        <li><strong>Por Animal</strong> — histórico de pesagens de um animal específico, com gráfico de evolução do peso e o GMD calculado. Escolha o animal digitando o brinco (com autocompletar) ou pelo seletor abaixo dele. Os cards mostram último peso, GMD, dias entre a 1ª e a última pesagem (o denominador do GMD) e o total de pesagens.</li>
        <li><strong>Por Lote</strong> — peso médio e GMD médio de um lote inteiro, com gráfico da curva média.</li>
        <li><strong>Por Categoria</strong> — mesma ideia, mas agrupando por categoria (Terneira, Novilha 13-24m, Vaca Prenha...) em vez de lote. O seletor mostra as 14 categorias oficiais do rebanho (mesmas de Animais/Rebanho/Metas — não a lista antiga de 7 categorias genéricas) e só lista as que têm pelo menos um animal ativo hoje; categoria sem animal não aparece.</li>
        <li><strong>Desempenho</strong> — ranking de GMD de todos os animais com pesagem, do maior para o menor.</li>
        <li><strong>Projeção</strong> — estima em quantos dias cada animal atinge um peso-alvo configurável (padrão 480 kg), com base no GMD atual.</li>
        <li><strong>Desmame</strong> — registra o desmame de vários terneiros de uma vez, selecionando por lote e informando o peso de cada um.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: registrar uma pesagem individual</h4>
      <ol style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 8, paddingLeft: 20 }}>
        <li>Na aba <strong>Registrar</strong>, clique em "Nova pesagem".</li>
        <li>Selecione o <strong>animal</strong> pelo brinco.</li>
        <li>Informe a <strong>data</strong> da pesagem — precisa cair dentro do ciclo atual (ou período de carência).</li>
        <li>Escolha o <strong>tipo</strong>: nascimento (peso ao nascer), desmama (peso ao desmamar), sobreano (~12-24 meses) ou intermediária (qualquer outra pesagem de rotina).</li>
        <li>Digite o <strong>peso em kg</strong> e, se quiser, uma observação.</li>
        <li>Clique em <strong>Salvar</strong>.</li>
      </ol>
      <p style={{ color: '#9CA3AF', fontSize: '.78rem', marginBottom: 4 }}>
        Experimente o formulário abaixo — é uma recriação exata da tela real, mas não grava nada:
      </p>
      <DemoFormularioPesagem />

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Registro em lote</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Não existe uma tela genérica de "pesar vários animais de uma vez" fora do contexto de desmame — para
        pesagens de rotina (intermediária, sobreano), cada animal é lançado separadamente na aba Registrar. A
        única pesagem em lote de verdade é a de <strong>desmame</strong>: na aba Desmame, escolha a data e,
        opcionalmente, filtre por lote — aparecem só terneiros/terneiras ativos que ainda não têm desmame
        registrado. Digitar o peso na linha do animal já o seleciona para o desmame — não há caixa de seleção
        separada. Preenchidos os pesos desejados, clique em <strong>"Registrar desmame"</strong>: o sistema avisa
        quantos animais serão desmamados e que isso entra imediatamente no cálculo de Kg ao Desmame e Kg
        Desmamado/Matriz em Metas; confirmando, grava a data de desmame de cada um mais uma pesagem tipo
        "Desmama" — já é definitivo, não existe rascunho ou etapa de confirmação separada. Quem ficar sem peso
        simplesmente não é desmamado e continua na lista para depois. O mesmo atalho de desmame também existe
        direto no detalhe do lote de inseminação, na aba Reprodutivo, com a mesma regra (peso digitado = gatilho
        do desmame, com o mesmo aviso antes de gravar). Em ambos os pontos, o desmame pode ser registrado mesmo
        com o ciclo do lote/monta encerrado — é a data do próprio desmame que precisa estar dentro do ciclo atual
        (ou carência), não a monta que originou o terneiro.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        Um animal já desmamado aparece com o selo verde de sempre ("Desmamado em dd/mm · Xkg") e um botão
        <strong> ✕ Desfazer desmame</strong>, disponível nos dois pontos de entrada — corrige um lançamento por
        engano apagando a data de desmame e a pesagem "Desmama" associada. O sistema avisa, antes de desfazer,
        que isso também muda o cálculo de Kg ao Desmame e Kg Desmamado/Matriz.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Badges de origem da pesagem</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 10 }}>
        Nas tabelas de pesagens (Registrar e Por Animal), cada linha mostra um selo colorido com o tipo:
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Badge color="blue">Compra</Badge>
        <Badge color="green">Venda</Badge>
        <Badge color="gray">Nascimento / Desmama / Sobreano / Intermediária</Badge>
      </div>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18 }}>
        <strong>Compra</strong> (azul) e <strong>Venda</strong> (verde) são geradas automaticamente pelo
        sistema quando você registra a compra ou venda do animal em Financeiro — você nunca lança esse tipo
        manualmente aqui. Se na hora da transação você digitou o peso individual daquele animal (em vez de
        usar o peso médio da categoria), a pesagem fica marcada como peso individual — isso não muda se ela
        entra no GMD (toda pesagem entra, veja o aviso abaixo), é só uma informação de origem do dado. Todas
        as pesagens feitas por você mesmo (manejo) aparecem com o mesmo selo cinza, só mudando o texto do tipo.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como o GMD é calculado</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        O GMD usa sempre a <strong>primeira e a última pesagem</strong> do animal (por data), com no mínimo 2
        pesagens registradas — <strong>toda pesagem conta</strong>, inclusive compra e venda (veja o aviso
        abaixo). Se a última pesagem for menor que a primeira, o GMD dá negativo — é um resultado real (o
        animal perdeu peso no período), não um erro do sistema:
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontFamily: 'monospace', fontSize: '.82rem', color: '#111827', marginBottom: 10,
      }}>
        GMD (kg/dia) = (peso da última pesagem − peso da primeira pesagem) ÷ dias entre as duas
      </div>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        Esse é o mesmo cálculo usado nas abas <strong>Por Animal</strong>, <strong>Por Lote</strong>,
        <strong> Por Categoria</strong>, <strong>Desempenho</strong> e <strong>Projeção</strong> desta tela.
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6 }}>
        Na aba <strong>Projeção</strong>, o sistema usa o GMD atual do animal para estimar quantos dias faltam
        até ele atingir o peso-alvo definido (padrão 480 kg, editável na própria tela):
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontFamily: 'monospace', fontSize: '.82rem', color: '#111827', marginTop: 10, marginBottom: 4,
      }}>
        Dias até o peso-alvo = (peso-alvo − último peso registrado) ÷ GMD
      </div>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 10, marginTop: 18 }}>Avisos importantes</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AlertBox type="green" icon="ti-scale"
          title="Toda pesagem conta no GMD, inclusive compra e venda"
          body='O peso registrado numa compra ou venda é o peso REAL do lote — ele foi pesado de verdade, na balança do negócio. Quando você não digita o peso individual de um animal, ele recebe o peso médio da categoria: isso erra pra mais ou pra menos por indivíduo, mas acerta a média do lote, e esses desvios se compensam no GMD do grupo. Por isso a pesagem "Compra"/"Venda" entra no cálculo de GMD em qualquer aba (Por Animal, Por Lote, Por Categoria, Desempenho ou Projeção), tenha peso individual ou não — excluí-la descartaria a única medição real que existe no fim da vida do animal na fazenda. O selo de peso individual (quando você digitou) segue aparecendo só como informação de origem do dado, sem afetar se ele entra no GMD.' />
        <AlertBox type="amber" icon="ti-calendar-x"
          title="Não é possível pesar um animal antes dele nascer"
          body="Se a data da pesagem for anterior à data de nascimento do animal, o sistema recusa salvar." />
      </div>
    </div>
  )
}
