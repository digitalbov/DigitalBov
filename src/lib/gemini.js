import { hoje as hojeAgora } from './hoje'
import { supabase } from './supabase'

// A chave do Gemini NÃO vive mais no navegador. As chamadas passam por uma
// função serverless da Netlify (netlify/functions/gemini.js), que guarda a
// chave no servidor e só atende usuário autenticado.
const ENDPOINT = '/.netlify/functions/gemini'

const SISTEMA = `Você é o assistente de gestão pecuária do DigitalBov, um sistema de gestão de bovinos.
Responda sempre em português brasileiro, de forma clara e objetiva.
Use os dados fornecidos para responder com precisão. Se não tiver a informação nos dados, diga que não encontrou.
Quando calcular taxas ou percentuais, mostre o raciocínio brevemente.
Não invente dados que não estejam no contexto fornecido.`

export async function perguntarIA(pergunta, contextoDados) {
  const prompt = `${SISTEMA}

--- DADOS ATUAIS DO SISTEMA (${hojeAgora().toLocaleDateString('pt-BR')}) ---
${JSON.stringify(contextoDados, null, 2)}
--- FIM DOS DADOS ---

Pergunta do usuário: ${pergunta}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  }

  let res
  try {
    const { data: sess } = await supabase.auth.getSession()
    const token = sess?.session?.access_token
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(body)
    })
  } catch {
    throw new Error('Sem conexão com a internet. Verifique sua rede e tente novamente.')
  }

  if (!res.ok) {
    let errBody = {}
    try { errBody = await res.json() } catch { /* ignora */ }
    const msg = errBody?.error?.message || ''
    console.error('[Gemini] erro', res.status, errBody)

    if (res.status === 429) {
      if (msg.toLowerCase().includes('quota')) {
        throw new Error('Cota diária da API Gemini atingida. O limite gratuito foi alcançado. Tente novamente amanhã.')
      }
      throw new Error('Muitas requisições em pouco tempo. Aguarde alguns segundos e tente novamente.')
    }
    if (res.status === 400) {
      throw new Error('Requisição inválida para a API Gemini. Tente novamente.')
    }
    if (res.status === 401) {
      throw new Error('Sessão expirada. Faça login novamente para usar o assistente.')
    }
    if (res.status === 403) {
      throw new Error('Sem permissão para usar o assistente. Faça login novamente.')
    }
    throw new Error(`Erro na API Gemini (${res.status}): ${msg || 'tente novamente em instantes.'}`)
  }

  const data = await res.json()
  const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!texto) {
    console.error('[Gemini] resposta sem texto:', data)
    throw new Error('Resposta inesperada da IA. Tente novamente.')
  }
  return texto
}
