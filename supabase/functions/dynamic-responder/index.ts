// Cria o acesso de um usuario a uma conta.
//
// Fluxo por CONVITE (nao por senha): o administrador informa apenas o e-mail
// e o Supabase envia um convite; quem define a senha e o proprio usuario, ao
// aceitar. Isso resolve tres coisas de uma vez:
//   1. comprova o e-mail — se estiver errado, o convite nao chega e o
//      problema aparece agora, nao no dia em que o cliente esquecer a senha;
//   2. o administrador nunca conhece a senha do cliente;
//   3. dispensa senha provisoria trafegando por WhatsApp ou papel.
//
// Copie este arquivo inteiro no editor da Edge Function `dynamic-responder`
// no painel do Supabase. Ele fica versionado aqui para nao se perder.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL   = 'https://wagwtkzztbftshstrnfh.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_EpR-qOL98OqoK6Jfgopvcg_BFnD1eVx'

// Enderecos autorizados a receber o retorno do convite. Nao aceitamos a
// origem crua do pedido: isso permitiria a um site qualquer disparar
// convites que voltam para o dominio dele, sequestrando o token.
const ORIGENS_OK = [
  'https://digitalbov.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
]

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { email, conta_id, papel, origem } = await req.json()
    if (!email || !conta_id) return json({ error: 'Informe o e-mail.' }, 400)

    const emailLimpo = String(email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(emailLimpo)) {
      return json({ error: 'E-mail invalido. Confira a digitacao.' }, 400)
    }

    const base = ORIGENS_OK.includes(origem) ? origem : ORIGENS_OK[0]

    const serviceKey = Deno.env.get('MINHA_SERVICE_KEY')!
    const authHeader = req.headers.get('Authorization')!

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Nao autenticado' }, 401)

    // quem chama precisa ser dono/admin da conta alvo
    const { data: membro } = await userClient
      .from('conta_membros').select('papel')
      .eq('conta_id', conta_id).eq('usuario_id', user.id).maybeSingle()
    if (!membro || !['dono', 'admin'].includes(membro.papel)) {
      return json({ error: 'Sem permissao' }, 403)
    }

    const admin = createClient(SUPABASE_URL, serviceKey)

    // 1. Usuario ja existe? (pode participar de outra conta)
    let usuarioId: string | null = null
    let convidado = false
    const { data: lista } = await admin.auth.admin.listUsers()
    const existente = lista?.users?.find(
      u => (u.email || '').toLowerCase() === emailLimpo
    )

    if (existente) {
      usuarioId = existente.id
    } else {
      // 2. Cria por CONVITE — sem senha. O e-mail so e dado como valido
      //    quando a pessoa clica no link.
      const { data: novo, error: errConvite } =
        await admin.auth.admin.inviteUserByEmail(emailLimpo, {
          redirectTo: `${base}/nova-senha`,
        })
      if (errConvite) {
        const m = errConvite.message || ''
        if (/rate|limit|too many/i.test(m)) {
          return json({ error: 'Limite de envio de e-mails atingido. Aguarde alguns minutos e tente de novo.' }, 429)
        }
        return json({ error: `Nao foi possivel enviar o convite: ${m}` }, 400)
      }
      usuarioId = novo.user.id
      convidado = true
    }

    // 3. Ja e membro DESTA conta? (evita duplicar)
    const { data: jaMembro } = await admin
      .from('conta_membros').select('id')
      .eq('conta_id', conta_id).eq('usuario_id', usuarioId).maybeSingle()
    if (jaMembro) {
      return json({ error: 'Este usuario ja faz parte desta conta.' }, 400)
    }

    // 4. Vincula a conta
    const { error: errMembro } = await admin.from('conta_membros').insert({
      conta_id, usuario_id: usuarioId, papel: papel || 'operador', status: 'ativo',
    })
    if (errMembro) return json({ error: errMembro.message }, 400)

    return json({ ok: true, usuario_id: usuarioId, convidado })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
