// Edge Function : confirmation de paiement Mobile Money côté SERVEUR.
// Déploiement : supabase functions deploy paiement-webhook --no-verify-jwt
// Secrets : supabase secrets set WEBHOOK_SECRET=xxxxx   (SUPABASE_URL et SERVICE_ROLE_KEY sont fournis par Supabase)
// ⚠ Exemple générique (HMAC-SHA256 du corps). ADAPTEZ-LE à la documentation de votre prestataire
//   (CinetPay, PayDunya, etc.) : nom des champs, méthode de signature, et idéalement re-vérification via leur API.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function hmac(secret: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const body = await req.text();
  const sig = req.headers.get('x-signature') ?? '';
  if (sig !== await hmac(Deno.env.get('WEBHOOK_SECRET')!, body)) return new Response('Signature invalide', { status: 401 });
  const { reference, status } = JSON.parse(body);            // ex: { reference: "MP240101.1234", status: "SUCCESS" }
  if (!reference) return new Response('Bad request', { status: 400 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SERVICE_ROLE_KEY')!);
  const statut = status === 'SUCCESS' ? 'Payé (Confirmé)' : 'Paiement échoué';
  const { error } = await admin.from('billets').update({ statut }).eq('reference', reference).eq('annule', false);
  return new Response(error ? error.message : 'ok', { status: error ? 500 : 200 });
});
