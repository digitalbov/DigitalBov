// Proxy da API Gemini. A chave NUNCA vai para o navegador — fica só aqui,
// no servidor da Netlify, na variável de ambiente GEMINI_API_KEY.
// Exige um token válido do Supabase para não virar proxy aberto: sem isto,
// qualquer pessoa na internet gastaria a nossa cota do Google.

const MODELO = 'gemini-2.5-flash'

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Método não permitido', { status: 405 })
  }

  const API_KEY      = process.env.GEMINI_API_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY não configurada no Netlify.' }, { status: 500 })
  }

  // ── Autenticação: só usuário logado no DigitalBov ────────────────
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return Response.json({ error: 'Não autenticado.' }, { status: 401 })
  }
  if (SUPABASE_URL && SUPABASE_KEY) {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    })
    if (!u.ok) {
      return Response.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 })
    }
  }

  // ── Repasse para o Gemini ────────────────────────────────────────
  let body
  try { body = await req.json() } catch { 
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 })
  }

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )

  const texto = await r.text()
  return new Response(texto, {
    status: r.status,
    headers: { 'Content-Type': 'application/json' }
  })
}
