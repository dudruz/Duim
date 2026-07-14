"use strict";

(() => {
    const page = document.querySelector("[data-payment-result]");
    const api = window.DuAmigoAPI;
    if (!page || !api) return;

    const card = document.querySelector("[data-payment-card]");
    const icon = document.querySelector("[data-payment-icon]");
    const title = document.querySelector("[data-payment-title]");
    const message = document.querySelector("[data-payment-message]");
    const actions = document.querySelector("[data-payment-actions]");
    const retry = document.querySelector("[data-payment-retry]");
    const params = new URLSearchParams(window.location.search);

    const payload = {
        order_nsu: params.get("order_nsu") || "",
        transaction_nsu: params.get("transaction_nsu") || "",
        slug: params.get("slug") || "",
        capture_method: params.get("capture_method") || "",
        receipt_url: params.get("receipt_url") || ""
    };

    const render = (state, heading, text, symbol) => {
        card.dataset.state = state;
        title.textContent = heading;
        message.textContent = text;
        icon.textContent = symbol;
        actions.hidden = state !== "success";
        retry.hidden = state === "success" || state === "loading";
    };

    const verify = async () => {
        render("loading", "Confirmando pagamento.", "Estamos conferindo a transação e atualizando sua conta.", "…");
        try {
            const session = await api.auth.getSession();
            if (!session) {
                const redirect = `pagamento.html?${params.toString()}`;
                window.location.replace(`login.html?redirect=${encodeURIComponent(redirect)}`);
                return;
            }
            if (!payload.order_nsu || !payload.transaction_nsu || !payload.slug) {
                throw new Error("A InfinitePay não retornou todos os dados da transação. Aguarde alguns segundos e tente novamente.");
            }
            const result = await api.public.verifyPayment(payload);
            if (result?.paid) {
                render("success", "Pagamento confirmado!", "Sua conta e o financeiro do Duin já foram atualizados automaticamente.", "✓");
                return;
            }
            render("pending", "Pagamento em processamento.", "Ainda não recebemos a confirmação. Aguarde alguns segundos e verifique novamente.", "↻");
        } catch (error) {
            render("error", "Não conseguimos confirmar agora.", error?.message || "O pagamento pode continuar em processamento. Tente novamente.", "!");
        }
    };

    retry.addEventListener("click", verify);
    verify();
})();
