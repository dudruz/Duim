import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { checkInfinitePayPayment, fromCents, requiredEnv } from "../_shared/infinitepay.ts";

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
