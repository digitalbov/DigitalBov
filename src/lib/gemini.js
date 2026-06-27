const API_KEY  = import.meta.env.VITE_GEMINI_API_KEY
// gemini-2.5-flash é o modelo estável mais recente disponível nesta chave
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`

const SISTEMA = `Você é o assistente de gestão pecuária da Cabanha Ventos da Várzea, uma propriedade de criação de bovinos.
Responda sempre em português brasileiro, de forma clara e objetiva.
Use os dados fornecidos para responder com precisão. Se não tiver a informação nos dados, diga que não encontrou.
Quando calcular taxas ou percentuais, mostre o raciocínio brevemente.
Não invente dados que não estejam no contexto fornecido.`

export async function perguntarIA(pergunta, contextoDados) {
  if (!API_KEY) {
    throw new Error('Chave da API Gemini não configurada. Adicione VITE_GEMINI_API_KEY no painel do Netlify.')
  }

  const prompt = `${SISTEMA}

--- DADOS ATUAIS DO SISTEMA (${new Date().toLocaleDateString('pt-BR')}) ---
${JSON.stringify(contextoDados, null, 2)}
--- FIM DOS DADOS ---

Pergunta do usuário: ${pergunta}`

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  }

  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error('Requisição inválida para a API Gemini. Verifique a chave no Netlify.')
    }
    if (res.status === 403) {
      throw new Error('Chave de API inválida ou sem permissão. Verifique a variável VITE_GEMINI_API_KEY no Netlify.')
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
