"use strict";

(() => {
    const page = document.querySelector("[data-payment-result]");
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    if (!page || !api) return;

    const card = document.querySelector("[data-payment-card]");
    const icon = document.querySelector("[data-payment-icon]");
    const title = document.querySelector("[data-payment-title]");
    const message = document.querySelector("[data-payment-message]");
    const startActions = document.querySelector("[data-payment-start-actions]");
    const successActions = document.querySelector("[data-payment-success-actions]");
    const openButton = document.querySelector("[data-payment-open]");
    const retryButton = document.querySelector("[data-payment-retry]");
    const summary = document.querySelector("[data-payment-summary]");
    const summaryLabel = document.querySelector("[data-payment-summary-label]");
    const summaryName = document.querySelector("[data-payment-summary-name]");
    const summaryAmount = document.querySelector("[data-payment-summary-amount]");
    const params = new URLSearchParams(window.location.search);

    const CALLBACK_FIELDS = ["order_nsu", "transaction_nsu", "slug"];
    const isPaymentReturn = CALLBACK_FIELDS.every((field) => Boolean(params.get(field)));
    const isStart = params.get("iniciar") === "1";
    const kind = params.get("tipo") || "";
    const targetId = params.get("id") || "";
    const contextKey = "duamigo_payment_context";
    const checkoutKey = "duamigo_checkout_ready";

    const readStoredJson = (key) => {
        try {
            return JSON.parse(sessionStorage.getItem(key) || "null");
        } catch (_) {
            return null;
        }
    };

    const context = readStoredJson(contextKey) || {};

    const render = (state, heading, text, symbol) => {
        card.dataset.state = state;
        title.textContent = heading;
        message.textContent = text;
        icon.textContent = symbol;
        startActions.hidden = true;
        successActions.hidden = true;
        retryButton.hidden = true;
    };

    const renderSummary = () => {
        const isSubscription = kind === "subscription";
        const name = context.planName || context.serviceName || (isSubscription ? "Mensalidade" : "Atendimento");
        const amount = Number(context.amount || 0);

        summary.hidden = false;
        summaryLabel.textContent = isSubscription ? "Plano mensal" : "Agendamento";
        summaryName.textContent = name;
        summaryAmount.textContent = amount > 0 && utils?.formatCurrency
            ? utils.formatCurrency(amount)
            : "";
    };

    const isSafeCheckoutUrl = (value) => {
        try {
            const url = new URL(value);
            const hostname = url.hostname.toLowerCase();
            return url.protocol === "https:"
                && (
                    hostname === "checkout.infinitepay.com.br"
                    || hostname.endsWith(".infinitepay.com.br")
                    || hostname === "checkout.infinitepay.io"
                    || hostname.endsWith(".infinitepay.io")
                );
        } catch (_) {
            return false;
        }
    };

    const saveCheckout = (url) => {
        sessionStorage.setItem(checkoutKey, JSON.stringify({
            kind,
            targetId,
            url,
            createdAt: new Date().toISOString()
        }));

        sessionStorage.setItem(contextKey, JSON.stringify({
            ...context,
            kind,
            targetId,
            checkoutUrl: url,
            createdAt: context.createdAt || new Date().toISOString()
        }));
    };

    const readReadyCheckout = () => {
        const ready = readStoredJson(checkoutKey);
        if (
            ready?.kind === kind
            && ready?.targetId === targetId
            && isSafeCheckoutUrl(ready?.url)
        ) {
            return ready.url;
        }

        if (
            context?.kind === kind
            && context?.targetId === targetId
            && isSafeCheckoutUrl(context?.checkoutUrl)
        ) {
            return context.checkoutUrl;
        }

        return "";
    };

    const showCheckoutReady = (url) => {
        saveCheckout(url);
        render("ready", "Seu pagamento está pronto.", "Toque no botão abaixo para abrir o checkout seguro.", "✓");
        renderSummary();
        openButton.href = url;
        startActions.hidden = false;
        retryButton.hidden = true;
        window.setTimeout(() => openButton.focus({ preventScroll: true }), 50);
    };

    const getSessionOrRedirect = async () => {
        const session = await api.auth.getSession();
        if (session) return session;

        const redirect = `pagamento.html?${params.toString()}`;
        window.location.replace(`login.html?redirect=${encodeURIComponent(redirect)}`);
        return null;
    };

    const createCheckout = async () => {
        render("loading", "Preparando seu pagamento.", "Estamos gerando o checkout da InfinitePay.", "…");
        renderSummary();

        try {
            const session = await getSessionOrRedirect();
            if (!session) return;

            if (!["appointment", "subscription"].includes(kind) || !targetId) {
                throw new Error("Não encontramos os dados deste pagamento. Volte para Minha conta e tente novamente.");
            }

            const existingUrl = readReadyCheckout();
            if (existingUrl) {
                showCheckoutReady(existingUrl);
                return;
            }

            const payload = kind === "appointment"
                ? { kind, appointmentId: targetId }
                : { kind, subscriptionRequestId: targetId };

            const checkout = await api.public.createCheckout(payload);
            const checkoutUrl = String(checkout?.url || "").trim();

            if (!isSafeCheckoutUrl(checkoutUrl)) {
                console.error("[Barbearia du Amigo · checkout inválido]", checkout);
                throw new Error("A InfinitePay não retornou um link de pagamento válido.");
            }

            showCheckoutReady(checkoutUrl);
        } catch (error) {
            render("error", "Não foi possível abrir o pagamento.", error?.message || "Tente novamente em alguns instantes.", "!");
            renderSummary();
            retryButton.hidden = false;
        }
    };

    const verifyPayment = async () => {
        render("loading", "Confirmando pagamento.", "Estamos conferindo a transação e atualizando sua conta.", "…");
        try {
            const session = await getSessionOrRedirect();
            if (!session) return;

            const payload = {
                order_nsu: params.get("order_nsu") || "",
                transaction_nsu: params.get("transaction_nsu") || "",
                slug: params.get("slug") || "",
                capture_method: params.get("capture_method") || "",
                receipt_url: params.get("receipt_url") || ""
            };

            const result = await api.public.verifyPayment(payload);
            if (result?.paid) {
                sessionStorage.removeItem(contextKey);
                sessionStorage.removeItem(checkoutKey);
                render("success", "Pagamento confirmado!", "Sua conta e o financeiro do Duin já foram atualizados.", "✓");
                successActions.hidden = false;
                summary.hidden = true;
                return;
            }

            render("pending", "Pagamento em processamento.", "Ainda não recebemos a confirmação. Aguarde alguns segundos e verifique novamente.", "↻");
            retryButton.hidden = false;
        } catch (error) {
            render("error", "Não conseguimos confirmar agora.", error?.message || "O pagamento pode continuar em processamento. Tente novamente.", "!");
            retryButton.hidden = false;
        }
    };

    retryButton.addEventListener("click", () => {
        if (isPaymentReturn) verifyPayment();
        else createCheckout();
    });

    if (isPaymentReturn) {
        verifyPayment();
        return;
    }

    if (isStart) {
        createCheckout();
        return;
    }

    render("error", "Pagamento não identificado.", "Volte para Minha conta e inicie o pagamento novamente.", "!");
    summary.hidden = true;
})();
