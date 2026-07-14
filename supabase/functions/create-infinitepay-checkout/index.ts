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
    const siteUrl = requiredEnv("PUBLIC_SITE_URL").replace(/\/$/, "");
    const authorization = request.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Faça login para pagar." }, 401);

    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || "");
    if (!['appointment', 'subscription'].includes(kind)) {
      return jsonResponse({ error: "Tipo de pagamento inválido." }, 400);
    }

    const { data: customer, error: customerError } = await admin
      .from("customers")
      .select("id, name, email, phone")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (customerError || !customer) return jsonResponse({ error: "Cadastro do cliente não encontrado." }, 404);

    let targetId = "";
    let amount = 0;
    let description = "";
    let orderNsu = "";
    let expiresAt: string | null = null;
    let subscriptionRequestId: string | null = null;
    let appointmentId: string | null = null;

    if (kind === "appointment") {
      appointmentId = String(body.appointmentId || "");
      const { data: appointment, error } = await admin
        .from("appointments")
        .select("id, customer_id, total_amount, status, billing_mode, reservation_expires_at, services(name)")
        .eq("id", appointmentId)
        .eq("customer_id", customer.id)
        .single();
      if (error || !appointment) return jsonResponse({ error: "Agendamento não encontrado." }, 404);
      if (appointment.billing_mode !== "online") return jsonResponse({ error: "Este agendamento não usa pagamento online." }, 409);
      if (!['pending', 'confirmed'].includes(appointment.status)) return jsonResponse({ error: "Este agendamento não pode mais ser pago." }, 409);
      if (appointment.reservation_expires_at && new Date(appointment.reservation_expires_at) <= new Date()) {
        return jsonResponse({ error: "A reserva deste horário expirou. Escolha o horário novamente." }, 409);
      }
      targetId = appointment.id;
      amount = Number(appointment.total_amount);
      description = String((appointment.services as { name?: string } | null)?.name || "Atendimento Barbearia du Amigo");
      orderNsu = `appt-${appointment.id}`;
      expiresAt = appointment.reservation_expires_at;
    } else {
      subscriptionRequestId = String(body.subscriptionRequestId || "");
      const { data: subscriptionRequest, error } = await admin
        .from("subscription_requests")
        .select("id, customer_id, amount, status, order_nsu, plans(name)")
        .eq("id", subscriptionRequestId)
        .eq("customer_id", customer.id)
        .single();
      if (error || !subscriptionRequest) return jsonResponse({ error: "Solicitação de mensalidade não encontrada." }, 404);
      if (subscriptionRequest.status !== "pending_payment") return jsonResponse({ error: "Esta mensalidade não está aguardando pagamento online." }, 409);
      targetId = subscriptionRequest.id;
      amount = Number(subscriptionRequest.amount);
      description = `Mensalidade ${(subscriptionRequest.plans as { name?: string } | null)?.name || "Barbearia du Amigo"}`;
      orderNsu = subscriptionRequest.order_nsu || `sub-${subscriptionRequest.id}`;
    }

    const { data: existing } = await admin
      .from("payment_orders")
      .select("id, checkout_url, status, order_nsu")
      .eq("order_nsu", orderNsu)
      .maybeSingle();
    if (existing?.checkout_url && ['created', 'pending'].includes(existing.status)) {
      return jsonResponse({ url: existing.checkout_url, order_nsu: existing.order_nsu, reused: true });
    }
    if (existing?.status === 'paid') {
      return jsonResponse({ error: "Este pagamento já foi confirmado.", paid: true }, 409);
    }

    const redirectUrl = `${siteUrl}/pages/pagamento.html`;
    const webhookUrl = `${supabaseUrl}/functions/v1/infinitepay-webhook`;
    const link = await createInfinitePayLink({
      handle,
      orderNsu,
      redirectUrl,
      webhookUrl,
      items: [{ quantity: 1, price: toCents(amount), description }],
      customer: {
        name: customer.name,
        email: customer.email || userData.user.email,
        phone_number: brazilPhone(customer.phone),
      },
    });

    const orderValues = {
      customer_id: customer.id,
      appointment_id: appointmentId,
      subscription_request_id: subscriptionRequestId,
      kind,
      provider: "infinitepay",
      order_nsu: orderNsu,
      amount,
      status: "pending",
      checkout_url: link.url,
      expires_at: expiresAt,
      provider_payload: link.raw,
    };
    const { error: orderError } = await admin.from("payment_orders").upsert(orderValues, { onConflict: "order_nsu" });
    if (orderError) throw orderError;

    if (appointmentId) {
      await admin.from("payments").update({ provider: "infinitepay", provider_order_nsu: orderNsu })
        .eq("appointment_id", appointmentId);
    }
    if (subscriptionRequestId) {
      await admin.from("subscription_requests").update({ order_nsu: orderNsu, checkout_url: link.url })
        .eq("id", subscriptionRequestId);
    }

    return jsonResponse({ url: link.url, order_nsu: orderNsu, target_id: targetId });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Falha ao gerar pagamento." }, 500);
  }
});