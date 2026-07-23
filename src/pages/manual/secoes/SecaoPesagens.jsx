import { useState } from 'react'
import { Field, toast } from '../../../components/UI'

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
    <div style={{
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
        A tela <strong>Pesagens</strong> (menu Gestão Operacional) é onde você registra o peso dos animais ao
        longo do tempo. Cada pesagem fica associada a um <strong>tipo</strong> (nascimento, desmama, sobreano
        ou intermediária) e é a partir do histórico de pesagens de um animal que o sistema calcula o
        <strong> GMD</strong> (Ganho Médio Diário) em todo o app — inclusive nos indicadores de Metas e no
        Controle de Rebanho.
      </p>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Abas do módulo</h4>
      <ul style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.8, marginBottom: 18, paddingLeft: 20 }}>
        <li><strong>Registrar</strong> — formulário de lançamento manual de uma pesagem (ver demonstração abaixo).</li>
        <li><strong>Por Animal</strong> — histórico de pesagens de um animal específico, com gráfico de evolução do peso e o GMD calculado.</li>
        <li><strong>Desempenho</strong> — ranking de GMD de todos os animais com pesagem, do maior para o menor.</li>
        <li><strong>Projeção</strong> — estima em quantos dias cada animal atinge um peso-alvo configurável (padrão 480 kg), com base no GMD atual.</li>
        <li><strong>Desmame</strong> — registra o desmame de vários terneiros de uma vez, selecionando por lote e informando o peso de cada um.</li>
      </ul>

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Passo a passo: registrar uma pesagem</h4>
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

      <h4 style={{ fontSize: '.88rem', fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>Como o GMD é calculado</h4>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        O GMD usa sempre a <strong>primeira e a última pesagem</strong> do animal (por data), com no mínimo
        2 pesagens registradas:
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontFamily: 'monospace', fontSize: '.82rem', color: '#111827', marginBottom: 10,
      }}>
        GMD (kg/dia) = (peso da última pesagem − peso da primeira pesagem) ÷ dias entre as duas
      </div>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6, marginBottom: 10 }}>
        Esse é o mesmo cálculo usado na aba <strong>Por Animal</strong> (gráfico individual), no ranking da
        aba <strong>Desempenho</strong> e nos indicadores "GMD Terneiros" de Metas e Indicadores e Controle
        de Rebanho — só muda quais pesagens entram na conta em cada tela (ex: em Metas, um animal vendido só
        entra no GMD do ciclo em que a venda aconteceu).
      </p>
      <p style={{ color: '#374151', fontSize: '.85rem', lineHeight: 1.6 }}>
        Na aba <strong>Projeção</strong>, o sistema usa o GMD atual do animal para estimar quantos dias faltam
        até ele atingir o peso-alvo definido (padrão 480 kg, editável na própria tela):
      </p>
      <div style={{
        background: '#F3F4F6', borderRadius: 8, padding: '10px 14px',
        fontFamily: 'monospace', fontSize: '.82rem', color: '#111827', marginTop: 10,
      }}>
        Dias até o peso-alvo = (peso-alvo − último peso registrado) ÷ GMD
      </div>
    </div>
  )
}
