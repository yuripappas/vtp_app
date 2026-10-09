// Mesmo padrão de client usado nas outras Edge Functions do projeto
// (ver supabase/functions/mkt-otp-verificar/index.ts) — SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pelo runtime,
// não precisam ser configuradas manualmente. Esta function só faz .select()
// (nunca .insert()/.update()/.delete()) — é o código, não a key, que garante
// leitura-somente.
import { createClient } from 'jsr:@supabase/supabase-js@2';

export function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}
