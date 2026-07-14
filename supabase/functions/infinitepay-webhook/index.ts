import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonResponse } from "../_shared/cors.ts";
import { checkInfinitePayPayment, fromCents, requiredEnv } from "../_shared/infinitepay.ts";

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
