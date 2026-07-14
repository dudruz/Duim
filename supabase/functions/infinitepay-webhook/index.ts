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
  if (request.method !== "POST") return jsonResponse({ success: false, message: "Método não permitido." }, 405);
  try {
    const payload = await request.json().catch(() => ({}));
    const orderNsu = String(payload.order_nsu || "");
    const transactionNsu = String(payload.transaction_nsu || "");
    const slug = String(payload.invoice_slug || payload.slug || "");
    if (!orderNsu || !transactionNsu || !slug) return jsonResponse({ success: false, message: "Webhook incompleto." }, 400);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const handle = requiredEnv("INFINITEPAY_HANDLE").replace(/^\$/, "");
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    const { data: order, error: orderError } = await admin.from("payment_orders").select("id, status, amount").eq("order_nsu", orderNsu).single();
    if (orderError || !order) return jsonResponse({ success: false, message: "Pedido não encontrado." }, 400);
    if (order.status === "paid") return jsonResponse({ success: true, message: null, already_processed: true });

    const checked = await checkInfinitePayPayment({ handle, orderNsu, transactionNsu, slug });
    if (checked.paid !== true) return jsonResponse({ success: false, message: "Pagamento ainda não aprovado." }, 400);
    const paidAmount = fromCents(Number(checked.paid_amount ?? checked.amount ?? payload.paid_amount ?? 0));

    const { error: processError } = await admin.rpc("process_infinitepay_payment", {
      p_order_nsu: orderNsu,
      p_transaction_nsu: transactionNsu,
      p_slug: slug,
      p_capture_method: String(checked.capture_method || payload.capture_method || "infinitepay"),
      p_receipt_url: String(payload.receipt_url || "") || null,
      p_paid_amount: paidAmount,
      p_payload: { webhook: payload, verification: checked },
    });
    if (processError) throw processError;
    return jsonResponse({ success: true, message: null });
  } catch (error) {
    console.error(error);
    return jsonResponse({ success: false, message: error instanceof Error ? error.message : "Falha no webhook." }, 400);
  }
});