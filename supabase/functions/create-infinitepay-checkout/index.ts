import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { brazilPhone, createInfinitePayLink, requiredEnv, toCents } from "../_shared/infinitepay.ts";

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
