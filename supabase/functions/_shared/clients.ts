import Stripe from "npm:stripe@17.7.0";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

/** Клиент с правами сервиса — обходит RLS, использовать только на сервере. */
export const adminClient: SupabaseClient = createClient(
  SUPABASE_URL,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

/** Клиент от имени пользователя, вызвавшего функцию (auth.uid() работает в SQL). */
export function userClient(req: Request): SupabaseClient {
  return createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
  });
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Достаёт Stripe customer клиента или создаёт нового и сохраняет в профиль. */
export async function getOrCreateCustomer(userId: string, email?: string): Promise<string> {
  const { data: profile, error } = await adminClient
    .from("profiles")
    .select("stripe_customer_id, full_name, phone")
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (profile.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    name: profile.full_name || undefined,
    phone: profile.phone || undefined,
    metadata: { supabase_user_id: userId },
  });
  await adminClient.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  return customer.id;
}
