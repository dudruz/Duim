const CREATE_LINK_URL = "https://api.checkout.infinitepay.io/links";
const PAYMENT_CHECK_URL = "https://api.checkout.infinitepay.io/payment_check";

export type InfinitePayItem = {
  quantity: number;
  price: number;
  description: string;
};

export type InfinitePayCustomer = {
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
};

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Variável ${name} não configurada.`);
  return value;
}

export function toCents(value: number | string): number {
  return Math.round(Number(value || 0) * 100);
}

export function fromCents(value: number | string): number {
  return Number(value || 0) / 100;
}

export function brazilPhone(value?: string | null): string | null {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.length > 11) digits = digits.slice(-11);
  return digits.length === 10 || digits.length === 11 ? `+55${digits}` : null;
}

export async function createInfinitePayLink(input: {
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

export async function checkInfinitePayPayment(input: {
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
