"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    const page = document.querySelector("[data-booking-page]");
    if (!api || !utils || !page) return;

    const state = {
        step: 1,
        services: [],
        settings: null,
        service: null,
        date: null,
        slot: null,
        account: null,
        billingMode: "salon"
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const servicesContainer = $("[data-booking-services]");
    const datesContainer = $("[data-booking-dates]");
    const timesContainer = $("[data-booking-times]");
    const panels = $$("[data-booking-step]");
    const progressItems = $$("[data-progress-item]");
    const form = $("[data-booking-form]");
    const successPanel = $("[data-booking-success]");
    const pageStatus = $("[data-booking-page-status]");
    const customerStrip = $("[data-booking-customer]");
    const authGate = $("[data-booking-auth-gate]");
    const authenticatedArea = $("[data-booking-authenticated]");
    const gateMessage = $("[data-booking-gate-message]");
    const paymentOptions = $("[data-booking-payment-options]");
    const submitButton = form?.querySelector('button[type="submit"]');

    const setStatus = (message = "", type = "info") => {
        if (!pageStatus) return;
        pageStatus.hidden = !message;
        pageStatus.textContent = message;
        pageStatus.dataset.type = type;
    };

    const setText = (selector, value) => {
        $$(selector).forEach((element) => { element.textContent = value; });
    };

    const showAuthGate = (message = "") => {
        if (authGate) authGate.hidden = false;
        if (authenticatedArea) authenticatedArea.hidden = true;
        if (gateMessage) {
            gateMessage.hidden = !message;
            gateMessage.textContent = message;
        }
        setStatus("");
    };

    const showBooking = () => {
        if (authGate) authGate.hidden = true;
        if (authenticatedArea) authenticatedArea.hidden = false;
    };

    const formatDate = (date, options) => new Intl.DateTimeFormat("pt-BR", options).format(date);
    const formatPhone = (value = "") => utils.formatBrazilPhone(value, "Não informado");
    const reservedSubscriptionUses = (subscriptionId) => (state.account?.appointments || []).filter((appointment) => (
        appointment.subscription_id === subscriptionId
        && appointment.billing_mode === "subscription"
        && ["pending", "confirmed"].includes(appointment.status)
        && appointment.subscription_use_consumed !== true
    )).length;

    const availableSubscriptionUses = (subscription) => {
        const planLimit = Number(subscription?.plans?.cuts_included || subscription?.remaining_uses || 0);
        const remaining = Math.min(Number(subscription?.remaining_uses || 0), planLimit);
        return Math.max(remaining - reservedSubscriptionUses(subscription?.id), 0);
    };

    const activeSubscription = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return (state.account?.subscriptions || []).find((item) => (
            item.status === "active"
            && availableSubscriptionUses(item) > 0
            && (!item.ends_on || new Date(`${item.ends_on}T23:59:59`).getTime() >= today.getTime())
        ));
    };

    const showAccount = () => {
        const customer = state.account?.customer || {};
        const profile = state.account?.profile || {};
        const user = state.account?.user || {};
        const name = customer.nickname || customer.name || profile.full_name || "Cliente";
        const fullName = customer.name || profile.full_name || name;
        const initial = name.trim().charAt(0).toUpperCase() || "C";

        if (customerStrip) customerStrip.hidden = false;
        setText("[data-booking-customer-name]", name);
        setText("[data-booking-avatar], [data-confirm-avatar]", initial);
        setText("[data-confirm-name]", fullName);
        setText("[data-confirm-phone]", formatPhone(customer.phone || profile.phone));
        setText("[data-confirm-email]", customer.email || profile.email || user.email || "Não informado");
    };

    const paymentLabel = () => ({
        online: "Pré-pago pelo site",
        salon: "Pagar no salão",
        subscription: "Usar mensalidade"
    }[state.billingMode] || "Pagar no salão");

    const updateSummary = () => {
        setText("[data-summary-service]", state.service?.name || "Não escolhido");
        setText("[data-summary-date]", state.date
            ? formatDate(state.date, { weekday: "short", day: "2-digit", month: "short" })
            : "Não escolhida");
        setText("[data-summary-time]", state.slot
            ? formatDate(new Date(state.slot.starts_at), { hour: "2-digit", minute: "2-digit" })
            : "Não escolhido");
        setText("[data-summary-duration]", state.service ? utils.formatDuration(state.service.duration_minutes) : "—");
        setText("[data-summary-price]", state.service ? utils.formatCurrency(state.service.price) : "—");
        setText("[data-summary-payment]", paymentLabel());

        const noticeTitle = $("[data-payment-notice-title]");
        const noticeText = $("[data-payment-notice-text]");
        if (noticeTitle && noticeText) {
            if (state.billingMode === "online") {
                noticeTitle.textContent = "Pré-pago com InfinitePay";
                noticeText.textContent = "Ao confirmar, você será direcionado ao checkout seguro para pagar por Pix ou cartão.";
            } else if (state.billingMode === "subscription") {
                const plan = activeSubscription();
                noticeTitle.textContent = "Atendimento mensalista";
                noticeText.textContent = plan
                    ? `${plan.plans?.name || "Plano ativo"}: ${availableSubscriptionUses(plan)} uso(s) disponível(is) para agendar.`
                    : "É necessário possuir um plano ativo com uso disponível.";
            } else {
                noticeTitle.textContent = "A cobrar no salão";
                noticeText.textContent = "O horário fica confirmado e o pagamento é registrado pelo Duin no atendimento.";
            }
        }
    };

    const renderPaymentOptions = () => {
        if (!paymentOptions) return;
        paymentOptions.replaceChildren();
        const plan = activeSubscription();
        const options = [];

        if (state.settings?.online_payments_enabled) {
            options.push({
                value: "online",
                title: "Pagar agora pelo site",
                badge: "Pré-pago",
                description: "Pix ou cartão pelo checkout da InfinitePay. O horário confirma após o pagamento."
            });
        }
        if (plan) {
            options.push({
                value: "subscription",
                title: "Usar minha mensalidade",
                badge: "Mensalista",
                description: `${plan.plans?.name || "Plano ativo"} · ${availableSubscriptionUses(plan)} uso(s) disponível(is) para agendar.`
            });
        }
        options.push({
            value: "salon",
            title: "Pagar no salão",
            badge: "A cobrar",
            description: "Pague em dinheiro, Pix ou cartão diretamente com o Duin."
        });

        if (!options.some((option) => option.value === state.billingMode)) {
            state.billingMode = plan ? "subscription" : (state.settings?.online_payments_enabled ? "online" : "salon");
        }

        options.forEach((option) => {
            const label = document.createElement("label");
            label.className = "booking-payment-option";
            label.dataset.paymentMode = option.value;
            label.innerHTML = `
                <input type="radio" name="billingMode" value="${option.value}" ${state.billingMode === option.value ? "checked" : ""}>
                <span class="booking-payment-option__check" aria-hidden="true"></span>
                <span class="booking-payment-option__content">
                    <span class="booking-payment-option__top"><strong>${option.title}</strong><em>${option.badge}</em></span>
                    <span>${option.description}</span>
                </span>
            `;
            paymentOptions.append(label);
        });
        updateSummary();
        updateSubmitLabel();
    };

    const updateSubmitLabel = () => {
        if (!submitButton) return;
        submitButton.textContent = state.billingMode === "online" ? "Ir para pagamento" : "Confirmar agendamento";
    };

    const updateProgress = () => {
        progressItems.forEach((item, index) => {
            const number = index + 1;
            item.classList.toggle("is-current", number === state.step);
            item.classList.toggle("is-complete", number < state.step);
        });
    };

    const currentPanel = () => panels.find((panel) => Number(panel.dataset.bookingStep) === state.step);
    const canContinue = () => {
        if (state.step === 1) return Boolean(state.service);
        if (state.step === 2) return Boolean(state.date);
        if (state.step === 3) return Boolean(state.slot);
        return true;
    };
    const updateNextButton = () => {
        const button = currentPanel()?.querySelector("[data-next-step]");
        if (button) button.disabled = !canContinue();
    };

    const setStep = (nextStep) => {
        if (nextStep > state.step && !canContinue()) return;
        state.step = Math.min(4, Math.max(1, nextStep));
        panels.forEach((panel) => { panel.hidden = Number(panel.dataset.bookingStep) !== state.step; });
        if (successPanel) successPanel.hidden = true;
        if (state.step === 4) renderPaymentOptions();
        updateProgress();
        updateNextButton();
        currentPanel()?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const serviceIcon = (service) => utils.resolveAssetUrl(
        service.icon_path,
        service.name.toLowerCase().includes("barba")
            ? "assets/icons/beard.svg"
            : "assets/icons/scissors.svg"
    );

    const renderServices = () => {
        servicesContainer.replaceChildren();
        if (!state.services.length) {
            servicesContainer.innerHTML = '<p class="empty-message">Nenhum serviço ativo foi cadastrado no painel.</p>';
            return;
        }
        state.services.forEach((service) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "booking-option";
            button.setAttribute("aria-pressed", "false");
            button.innerHTML = `
                <span class="booking-option__top"><span class="booking-option__icon"><img src="${serviceIcon(service)}" alt=""></span><span class="booking-option__check">✓</span></span>
                <span class="booking-option__content"><h3></h3><p></p></span>
                <span class="booking-option__meta"><span>${utils.formatDuration(service.duration_minutes)}</span><strong>${utils.formatCurrency(service.price)}</strong></span>
            `;
            button.querySelector("h3").textContent = service.name;
            button.querySelector("p").textContent = service.description || "Atendimento na Barbearia du Amigo.";
            button.addEventListener("click", () => {
                state.service = service;
                state.slot = null;
                $$(".booking-option", servicesContainer).forEach((option) => {
                    const selected = option === button;
                    option.classList.toggle("is-selected", selected);
                    option.setAttribute("aria-pressed", String(selected));
                });
                updateSummary();
                updateNextButton();
                if (state.date) loadTimes();
            });
            servicesContainer.append(button);
        });
    };

    const createAvailableDates = () => {
        const dates = [];
        const totalDays = Math.min(Math.max(Number(state.settings?.booking_window_days || 30), 7), 90);
        const cursor = new Date();
        cursor.setHours(12, 0, 0, 0);
        cursor.setDate(cursor.getDate() + 1);
        while (dates.length < totalDays) {
            dates.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    };

    const renderDates = () => {
        datesContainer.replaceChildren();
        createAvailableDates().forEach((date) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "date-option";
            button.setAttribute("aria-pressed", "false");
            button.innerHTML = `
                <span class="date-option__weekday">${formatDate(date, { weekday: "short" }).replace(".", "")}</span>
                <span class="date-option__day">${String(date.getDate()).padStart(2, "0")}</span>
                <span class="date-option__month">${formatDate(date, { month: "short" }).replace(".", "")}</span>
            `;
            button.addEventListener("click", async () => {
                state.date = new Date(date);
                state.slot = null;
                $$(".date-option", datesContainer).forEach((option) => {
                    const selected = option === button;
                    option.classList.toggle("is-selected", selected);
                    option.setAttribute("aria-pressed", String(selected));
                });
                updateSummary();
                updateNextButton();
                await loadTimes();
            });
            datesContainer.append(button);
        });
    };

    const loadTimes = async () => {
        timesContainer.innerHTML = '<p class="empty-message">Consultando a agenda...</p>';
        state.slot = null;
        updateSummary();
        updateNextButton();
        if (!state.service || !state.date) return;
        try {
            const dateString = `${state.date.getFullYear()}-${String(state.date.getMonth() + 1).padStart(2, "0")}-${String(state.date.getDate()).padStart(2, "0")}`;
            const slots = await api.public.getAvailableSlots(state.service.id, dateString);
            timesContainer.replaceChildren();
            if (!slots?.length) {
                timesContainer.innerHTML = '<p class="empty-message">Não há horários livres nesta data. Escolha outro dia.</p>';
                return;
            }
            slots.forEach((slot) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "time-option";
                button.textContent = formatDate(new Date(slot.starts_at), { hour: "2-digit", minute: "2-digit" });
                button.setAttribute("aria-pressed", "false");
                button.addEventListener("click", () => {
                    state.slot = slot;
                    $$(".time-option", timesContainer).forEach((option) => {
                        const selected = option === button;
                        option.classList.toggle("is-selected", selected);
                        option.setAttribute("aria-pressed", String(selected));
                    });
                    updateSummary();
                    updateNextButton();
                });
                timesContainer.append(button);
            });
        } catch (error) {
            timesContainer.innerHTML = `<p class="empty-message"></p>`;
            timesContainer.firstElementChild.textContent = error?.message || "Não foi possível consultar os horários agora.";
        }
    };

    const validateForm = () => {
        const accepted = form.elements.privacy.checked;
        const error = form.querySelector('[data-error-for="privacy"]');
        if (error) error.textContent = accepted ? "" : "Confirme os dados e a Política de Privacidade.";
        return accepted;
    };

    const submit = async () => {
        if (!validateForm() || !state.service || !state.slot) return;
        const original = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = state.billingMode === "online" ? "Abrindo pagamento..." : "Confirmando...";
        setStatus("");
        try {
            const result = await api.public.createAppointment({
                serviceId: state.service.id,
                startsAt: state.slot.starts_at,
                notes: form.elements.note.value.trim(),
                billingMode: state.billingMode
            });

            if (result?.requires_checkout) {
                const paymentUrl = new URL("pagamento.html", window.location.href);
                paymentUrl.searchParams.set("iniciar", "1");
                paymentUrl.searchParams.set("tipo", "appointment");
                paymentUrl.searchParams.set("id", result.appointment_id);

                sessionStorage.setItem("duamigo_payment_context", JSON.stringify({
                    kind: "appointment",
                    targetId: result.appointment_id,
                    serviceName: state.service?.name || "Atendimento",
                    amount: Number(state.service?.price || 0),
                    startsAt: state.slot?.starts_at || null,
                    createdAt: new Date().toISOString()
                }));

                window.location.assign(paymentUrl.href);
                return;
            }

            panels.forEach((panel) => { panel.hidden = true; });
            successPanel.hidden = false;
            progressItems.forEach((item) => { item.classList.remove("is-current"); item.classList.add("is-complete"); });
            setText("[data-booking-protocol]", result?.appointment_id || "confirmado");
            setText("[data-booking-success-title]", state.billingMode === "subscription" ? "Uso do plano reservado." : "Seu horário está reservado.");
            setText("[data-booking-success-text]", state.billingMode === "subscription"
                ? "O atendimento aparece na sua conta como mensalista. O uso será descontado quando o serviço for concluído."
                : "O atendimento aparece na sua conta como valor a cobrar no salão.");
            successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (error) {
            const message = String(error?.message || "");
            if (/jwt|login|sessão|session|auth/i.test(message)) {
                window.location.replace("minha-conta.html?acao=agendar");
                return;
            }
            if (/complete.*dados|nome e whatsapp|whatsapp.*conta/i.test(message)) {
                window.location.replace("minha-conta.html?acao=agendar&motivo=perfil");
                return;
            }
            setStatus(message || "Não foi possível concluir o agendamento. O horário pode ter acabado de ser ocupado.", "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = original;
            updateSubmitLabel();
        }
    };

    const bindEvents = () => {
        document.addEventListener("click", (event) => {
            if (event.target.closest("[data-next-step]")) setStep(state.step + 1);
            if (event.target.closest("[data-previous-step]")) setStep(state.step - 1);
            if (event.target.closest("[data-restart-booking]")) window.location.reload();
        });
        form.addEventListener("submit", (event) => { event.preventDefault(); submit(); });
        paymentOptions?.addEventListener("change", (event) => {
            const input = event.target.closest('input[name="billingMode"]');
            if (!input) return;
            state.billingMode = input.value;
            updateSummary();
            updateSubmitLabel();
        });
    };

    const init = async () => {
        showAuthGate("Verificando sua sessão...");
        try {
            const [account, settings, services] = await Promise.all([
                api.customer.getOverview(),
                api.public.getSettings(),
                api.public.getServices()
            ]);
            state.account = account;
            state.settings = settings || {};
            state.services = services || [];
            const customer = account.customer || {};
            const profile = account.profile || {};
            const phone = utils.normalizeBrazilPhone(customer.phone || profile.phone || "");
            if (!account.customer || String(customer.name || profile.full_name || "").trim().length < 3 || !utils.isValidBrazilPhone(phone)) {
                window.location.replace("minha-conta.html?acao=agendar&motivo=perfil");
                return;
            }
            state.billingMode = activeSubscription() ? "subscription" : (state.settings.online_payments_enabled ? "online" : "salon");
            showBooking();
            showAccount();
            renderServices();
            renderDates();
            updateSummary();
            bindEvents();
        } catch (error) {
            if (/login|sessão|session|auth/i.test(String(error?.message || ""))) {
                window.location.replace(`login.html?redirect=${encodeURIComponent("minha-conta.html?acao=agendar")}`);
                return;
            }
            showAuthGate(error?.message || "Não foi possível carregar sua conta.");
        }
    };

    init();
})();
