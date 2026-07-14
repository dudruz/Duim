import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}


const CREATE_LINK_URL = "https://api.checkout.infinitepay.io/links";
const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";

type InfinitePayItem = {
  quantity: number;
  price: number;
  description: string;
};

type InfinitePayCustomer = {
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
};

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

function toCents(value: number | string): number {
  return Math.round(Number(value || 0) * 100);
}

function fromCents(value: number | string): number {
  return Number(value || 0) / 100;
}

function brazilPhone(value?: string | null): string | null {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  return digits.length === 10 || digits.length === 11 ? `+55${digits}` : null;
}

async function createInfinitePayLink(input: {
  handle: string;
  orderNsu: string;
  redirectUrl: string;
  webhookUrl: string;
  items: InfinitePayItem[];
  customer?: InfinitePayCustomer;
}): Promise<{ url: string; raw: Record<string, unknown> }> {
  const payload = {
    handle: input.handle,
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
    items: input.items,
    ...(input.customer ? { customer: input.customer } : {}),
  };

  const response = await fetch(CREATE_LINK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof raw.url !== "string") {
    throw new Error(String(raw.message || raw.error || "A InfinitePay não gerou o link de pagamento."));
  }
  return { url: raw.url, raw };
}

async function checkInfinitePayPayment(input: {
  handle: string;
  orderNsu: string;
  transactionNsu: string;
  slug: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch(PAYMENT_CHECK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: input.handle,
      order_nsu: input.orderNsu,
      transaction_nsu: input.transactionNsu,
      slug: input.slug,
    }),
  });
  const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || raw.success !== true) {
    throw new Error(String(raw.message || raw.error || "Não foi possível validar o pagamento."));
  }
  return raw;
}


Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);
  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const handle = requiredEnv("INFINITEPAY_HANDLE").replace(/^\$/, "");
    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Faça login para verificar o pagamento." }, 401);

    const body = await request.json().catch(() => ({}));
    const orderNsu = String(body.order_nsu || "");
    const transactionNsu = String(body.transaction_nsu || "");
    const slug = String(body.slug || "");
    if (!orderNsu || !transactionNsu || !slug) return jsonResponse({ error: "Dados do pagamento incompletos." }, 400);

    const { data: order, error: orderError } = await admin
      .from("payment_orders")
      .select("*, customers!inner(auth_user_id)")
      .eq("order_nsu", orderNsu)
      .single();
    const relation = Array.isArray(order?.customers) ? order.customers[0] : order?.customers;
    if (orderError || !order || relation?.auth_user_id !== userData.user.id) {
      return jsonResponse({ error: "Pagamento não encontrado." }, 404);
    }
    if (order.status === "paid") return jsonResponse({ paid: true, order });

    const checked = await checkInfinitePayPayment({ handle, orderNsu, transactionNsu, slug });
    if (checked.paid !== true) return jsonResponse({ paid: false, status: "pending" });

    const paidAmount = fromCents(Number(checked.paid_amount ?? checked.amount ?? 0));
    const { data: processed, error: processError } = await admin.rpc("process_infinitepay_payment", {
      p_order_nsu: orderNsu,
      p_transaction_nsu: transactionNsu,
      p_slug: slug,
      p_capture_method: String(checked.capture_method || body.capture_method || "infinitepay"),
      p_receipt_url: String(body.receipt_url || "") || null,
      p_paid_amount: paidAmount,
      p_payload: checked,
    });
    if (processError) throw processError;
    return jsonResponse({ paid: true, processed: Array.isArray(processed) ? processed[0] : processed });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao verificar pagamento." }, 500);
  }
});