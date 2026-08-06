import { fmtData } from './helpers'

// ── Config ÚNICA de tudo que muda por tipo de atestado ──────────────────────
// Único arquivo que um 5º tipo precisa tocar: um item novo em TIPOS_ATESTADO
// + as entradas correspondentes em CAMPOS_DOCUMENTO_POR_TIPO/
// CAMPOS_ANIMAL_POR_TIPO/TEXTO_ATESTADO (e, se o tipo exigir tabela sempre,
// em SEMPRE_TABELA). Nem Veterinario.jsx (formulário) nem veterinarioPdf.js
// (PDF) têm `if (tipo === ...)` — os dois leem só este arquivo. A ÚNICA
// coisa fora daqui que um tipo novo de verdade (não coberto pelos 4 já
// aprovados) ainda exige é ampliar o CHECK de `tipo` no banco — schema,
// não código de app, e é uma linha só.
//
// Campos COMUNS a todo atestado (documento inteiro): data_evento,
// local_evento, proprietario_nome, veterinario_nome, veterinario_crv — não
// entram nos mapas abaixo, são sempre os mesmos, tratados à parte.
// Campos COMUNS a todo animal: brinco, descricao_animal — idem.

// descricaoNivel: 'animal' (padrão, campo `descricao_animal` na linha do
// animal — cada um pode ter a sua) ou 'documento' (uma só descrição vale
// pro atestado inteiro, ex: "vacas Nelore, 3 anos" pra um lote inteiro, em
// vez de repetir a mesma frase em cada linha). É a ÚNICA coisa que muda pra
// alternar isso num tipo — o campo "Descrição dos animais" (documento) ou a
// coluna "Descrição" (animal) aparecem/somem sozinhos em Veterinario.jsx e
// veterinarioPdf.js, os dois só leem esta flag, nenhum tem `if (tipo===)`.
// Ver docs/migrations-aplicadas/veterinario_descricao_documento.sql e
// veterinario_descricao_documento_vacinacao.sql pra migração de dado já
// gravado no formato antigo, quando algum tipo troca de nível.
export const TIPOS_ATESTADO = [
  { valor: 'prenhez', label: 'Atestado de Prenhez', descricaoNivel: 'documento' },
  { valor: 'brucelose', label: 'Atestado de Brucelose', descricaoNivel: 'documento' },
  { valor: 'andrologico', label: 'Exame Andrológico', descricaoNivel: 'animal' },
  { valor: 'vacinacao_brucelose', label: 'Comprovante de Vacinação — Brucelose', labelCamposDocumento: 'Dados da vacina', descricaoNivel: 'documento' },
]

// Campos extras a nível de DOCUMENTO (além dos comuns E de `descricao`, que
// é tratada à parte via descricaoNivel — ver acima), por tipo.
export const CAMPOS_DOCUMENTO_POR_TIPO = {
  prenhez: [],
  brucelose: [],
  andrologico: [],
  vacinacao_brucelose: [
    { chave: 'vacina_fabricante', label: 'Fabricante', tipo: 'text' },
    { chave: 'vacina_nome_comercial', label: 'Nome comercial', tipo: 'text' },
    { chave: 'vacina_lote', label: 'Lote', tipo: 'text' },
    { chave: 'vacina_validade', label: 'Validade', tipo: 'date' },
  ],
}

// true se este tipo usa descrição por ANIMAL (padrão); false se usa
// descrição única no DOCUMENTO. Única função que Veterinario.jsx e
// veterinarioPdf.js chamam pra decidir — nenhum dos dois olha `tipo` direto.
export function descricaoPorAnimal(tipo) {
  const meta = TIPOS_ATESTADO.find(t => t.valor === tipo)
  return (meta?.descricaoNivel || 'animal') === 'animal'
}

// Campos extras POR ANIMAL (além dos comuns), por tipo. `largura` é só
// dica de layout pro editor de linhas (Veterinario.jsx) e pra coluna no PDF.
export const CAMPOS_ANIMAL_POR_TIPO = {
  prenhez: [],
  brucelose: [],
  andrologico: [
    { chave: 'circunferencia_escrotal', label: 'Circ. escrotal (cm)', tipo: 'number', step: '0.1', largura: 92 },
    { chave: 'motilidade', label: 'Motilidade (%)', tipo: 'number', step: '1', largura: 88 },
    { chave: 'vigor', label: 'Vigor (0-5)', tipo: 'number', step: '1', largura: 80 },
    { chave: 'defeitos_maiores', label: 'Def. maiores (%)', tipo: 'number', step: '1', largura: 96 },
    { chave: 'defeitos_menores', label: 'Def. menores (%)', tipo: 'number', step: '1', largura: 96 },
    { chave: 'classificacao', label: 'Classificação', tipo: 'select', opcoes: ['Apto', 'Questionável', 'Inapto'], largura: 128 },
  ],
  vacinacao_brucelose: [
    { chave: 'data_nascimento', label: 'Nascimento', tipo: 'date', largura: 128 },
    { chave: 'marcacao_aplicada', label: 'Marcação', tipo: 'text', largura: 110 },
  ],
}

// Tipos em que a tabela de animais sai SEMPRE no PDF, mesmo com 1 só animal
// — aprovado pro andrológico: 6 valores por animal em texto corrido ficaria
// ilegível. prenhez/brucelose/vacinacao continuam com texto corrido quando
// há só 1 animal (regra padrão).
export const SEMPRE_TABELA = new Set(['andrologico'])

// Texto padrão de cada tipo, com concordância correta no singular (1
// animal, embutido na própria frase) e no plural (N animais, "identificados
// na tabela abaixo"). `documento` = {data_evento, local_evento,
// proprietario_nome}; `animal` (só no singular) = {brinco, descricao_animal}.
// Tipos com descricaoNivel:'documento' (prenhez/brucelose) NÃO embutem
// descrição na frase — ela sai à parte, no bloco de campos do documento
// (mesmo mecanismo dos dados da vacina), então a frase só cita o brinco.
const dataFmt = (d) => fmtData(d?.data_evento)
const localTxt = (d) => d?.local_evento || '—'
const propTxt = (d) => d?.proprietario_nome || '—'
const animalTxt = (a) => `${a?.brinco || '—'}${a?.descricao_animal ? `, ${a.descricao_animal}` : ''}`

export const TEXTO_ATESTADO = {
  prenhez: {
    singular: (d, a) =>
      `Atesto, para os devidos fins, que examinei o animal identificado com o brinco ${a?.brinco || '—'}, ` +
      `de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, através de exame de diagnóstico ` +
      `de gestação, constatando-se que o referido animal encontra-se GESTANTE (PRENHE) na data do exame.`,
    plural: (d) =>
      `Atesto, para os devidos fins, que examinei os animais identificados na tabela abaixo, de propriedade ` +
      `de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, através de exame de diagnóstico de gestação, ` +
      `constatando-se que os referidos animais encontram-se GESTANTES (PRENHES) na data do exame.`,
  },
  brucelose: {
    singular: (d, a) =>
      `Atesto, para os devidos fins, que examinei o animal identificado com o brinco ${a?.brinco || '—'}, ` +
      `de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, através de exame sorológico para ` +
      `diagnóstico de Brucelose, constatando-se resultado NEGATIVO na data do exame.`,
    plural: (d) =>
      `Atesto, para os devidos fins, que examinei os animais identificados na tabela abaixo, de propriedade ` +
      `de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, através de exame sorológico para diagnóstico de ` +
      `Brucelose, constatando-se resultado NEGATIVO em todos os animais examinados na data do exame.`,
  },
  andrologico: {
    singular: (d, a) =>
      `Atesto, para os devidos fins, que realizei exame andrológico no animal identificado com o brinco ${animalTxt(a)}, ` +
      `de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, compreendendo exame clínico geral ` +
      `e do aparelho reprodutor, com avaliação da qualidade seminal, obtendo o resultado apresentado a seguir.`,
    plural: (d) =>
      `Atesto, para os devidos fins, que realizei exame andrológico nos animais identificados na tabela abaixo, ` +
      `de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, compreendendo exame clínico geral ` +
      `e do aparelho reprodutor, com avaliação da qualidade seminal, obtendo os resultados apresentados a seguir.`,
  },
  vacinacao_brucelose: {
    singular: (d, a) =>
      `Atesto, para os devidos fins, que apliquei a vacina contra Brucelose (cepa B19) no animal identificado ` +
      `com o brinco ${a?.brinco || '—'}, de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, sob ` +
      `minha responsabilidade técnica, em conformidade com o Programa Nacional de Controle e Erradicação da ` +
      `Brucelose e Tuberculose Animal (PNCEBT).`,
    plural: (d) =>
      `Atesto, para os devidos fins, que apliquei a vacina contra Brucelose (cepa B19) nos animais identificados ` +
      `na tabela abaixo, de propriedade de ${propTxt(d)}, em ${dataFmt(d)}, em ${localTxt(d)}, sob minha ` +
      `responsabilidade técnica, em conformidade com o Programa Nacional de Controle e Erradicação da Brucelose ` +
      `e Tuberculose Animal (PNCEBT).`,
  },
}

// Valor de um campo (documento ou animal) formatado pra exibição — mesma
// função usada no PDF (tabela/linha) e, se precisar, em qualquer outro lugar
// que só vá LER o dado (nunca no <input>, que usa o valor bruto).
export function formatarValorCampo(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (campo.tipo === 'date') return fmtData(valor)
  return String(valor)
}

// Linha em branco pra um animal novo no editor (Veterinario.jsx) — já inclui
// todas as chaves específicas do tipo, vazias, pra os inputs controlados
// nunca ficarem undefined. `descricao_animal` só entra quando o tipo usa
// descrição por animal — em descricaoNivel:'documento' nem existe essa
// chave no estado da linha (a descrição mora no documento, não aqui).
export function linhaAnimalVazia(tipo) {
  const campos = CAMPOS_ANIMAL_POR_TIPO[tipo] || []
  const base = { _id: crypto.randomUUID(), brinco: '' }
  if (descricaoPorAnimal(tipo)) base.descricao_animal = ''
  return { ...base, ...Object.fromEntries(campos.map(c => [c.chave, ''])) }
}

// Nome de arquivo do PDF — 1 animal usa o brinco, N animais usa a contagem
// (evita nome gigante ou ambíguo com lote de 30 terneiras).
export function nomeArquivoAtestado(tipo, animais) {
  const base = `atestado-${tipo}`
  if (!animais || animais.length === 0) return base
  if (animais.length === 1) return `${base}-${slugSimples(animais[0].brinco || 'animal')}`
  return `${base}-${animais.length}-animais`
}

function slugSimples(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '')
}
