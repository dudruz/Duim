"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    const config = window.DuAmigoConfig;
    const page = document.querySelector("[data-booking-page]");
    if (!api || !utils || !page) return;

    const state = {
        step: 1,
        services: [],
        settings: null,
        service: null,
        date: null,
        slot: null,
        account: null
    };

    const servicesContainer = document.querySelector("[data-booking-services]");
    const datesContainer = document.querySelector("[data-booking-dates]");
    const timesContainer = document.querySelector("[data-booking-times]");
    const panels = [...document.querySelectorAll("[data-booking-step]")];
    const progressItems = [...document.querySelectorAll("[data-progress-item]")];
    const form = document.querySelector("[data-booking-form]");
    const successPanel = document.querySelector("[data-booking-success]");
    const pageStatus = document.querySelector("[data-booking-page-status]");
    const customerStrip = document.querySelector("[data-booking-customer]");
    const authGate = document.querySelector("[data-booking-auth-gate]");
    const authenticatedArea = document.querySelector("[data-booking-authenticated]");
    const gateMessage = document.querySelector("[data-booking-gate-message]");

    const setStatus = (message = "", type = "info") => {
        pageStatus.hidden = !message;
        pageStatus.textContent = message;
        pageStatus.dataset.type = type;
    };

    const setText = (selector, value) => {
        document.querySelectorAll(selector).forEach((element) => {
            element.textContent = value;
        });
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

    const formatPhone = (value = "") => {
        const digits = String(value).replace(/\D/g, "").slice(-11);
        if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        return value || "Não informado";
    };

    const formatDate = (date, options) => new Intl.DateTimeFormat("pt-BR", options).format(date);

    const showAccount = () => {
        const customer = state.account.customer || {};
        const profile = state.account.profile || {};
        const user = state.account.user || {};
        const name = customer.nickname || customer.name || profile.full_name || "Cliente";
        const fullName = customer.name || profile.full_name || name;
        const initial = name.trim().charAt(0).toUpperCase() || "C";

        customerStrip.hidden = false;
        setText("[data-booking-customer-name]", name);
        setText("[data-booking-avatar], [data-confirm-avatar]", initial);
        setText("[data-confirm-name]", fullName);
        setText("[data-confirm-phone]", formatPhone(customer.phone || profile.phone));
        setText("[data-confirm-email]", customer.email || profile.email || user.email || "Não informado");
    };

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
        panels.forEach((panel) => {
            panel.hidden = Number(panel.dataset.bookingStep) !== state.step;
        });
        successPanel.hidden = true;
        updateProgress();
        updateNextButton();
        currentPanel()?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const serviceIcon = (service) => {
        if (service.icon_path) return service.icon_path;
        return service.name.toLowerCase().includes("barba")
            ? "../assets/icons/beard.svg"
            : "../assets/icons/scissors.svg";
    };

    const renderServices = () => {
        servicesContainer.replaceChildren();
        if (!state.services.length) {
            const empty = document.createElement("p");
            empty.className = "empty-message";
            empty.textContent = "Nenhum serviço ativo foi cadastrado no painel.";
            servicesContainer.append(empty);
            return;
        }

        state.services.forEach((service) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "booking-option";
            button.dataset.serviceId = service.id;
            button.setAttribute("aria-pressed", "false");

            const top = document.createElement("div");
            top.className = "booking-option__top";
            const iconWrap = document.createElement("span");
            iconWrap.className = "booking-option__icon";
            const icon = document.createElement("img");
            icon.src = serviceIcon(service);
            icon.alt = "";
            iconWrap.append(icon);
            const check = document.createElement("span");
            check.className = "booking-option__check";
            check.textContent = "✓";
            top.append(iconWrap, check);

            const content = document.createElement("div");
            content.className = "booking-option__content";
            const title = document.createElement("h3");
            title.textContent = service.name;
            const description = document.createElement("p");
            description.textContent = service.description || "Atendimento na Barbearia du Amigo.";
            content.append(title, description);

            const meta = document.createElement("div");
            meta.className = "booking-option__meta";
            const duration = document.createElement("span");
            duration.textContent = utils.formatDuration(service.duration_minutes);
            const price = document.createElement("strong");
            price.textContent = utils.formatCurrency(service.price);
            meta.append(duration, price);

            button.append(top, content, meta);
            button.addEventListener("click", () => {
                state.service = service;
                state.slot = null;
                servicesContainer.querySelectorAll(".booking-option").forEach((option) => {
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

            const weekday = document.createElement("span");
            weekday.className = "date-option__weekday";
            weekday.textContent = formatDate(date, { weekday: "short" }).replace(".", "");
            const day = document.createElement("span");
            day.className = "date-option__day";
            day.textContent = String(date.getDate()).padStart(2, "0");
            const month = document.createElement("span");
            month.className = "date-option__month";
            month.textContent = formatDate(date, { month: "short" }).replace(".", "");
            button.append(weekday, day, month);

            button.addEventListener("click", async () => {
                state.date = new Date(date);
                state.slot = null;
                datesContainer.querySelectorAll(".date-option").forEach((option) => {
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
        timesContainer.replaceChildren();
        state.slot = null;
        updateSummary();
        updateNextButton();
        if (!state.service || !state.date) return;

        const loading = document.createElement("p");
        loading.className = "empty-message";
        loading.textContent = "Consultando a agenda...";
        timesContainer.append(loading);

        try {
            const dateString = [
                state.date.getFullYear(),
                String(state.date.getMonth() + 1).padStart(2, "0"),
                String(state.date.getDate()).padStart(2, "0")
            ].join("-");
            const slots = await api.public.getAvailableSlots(state.service.id, dateString);
            timesContainer.replaceChildren();

            if (!slots?.length) {
                const empty = document.createElement("p");
                empty.className = "empty-message";
                empty.textContent = "Não há horários livres nesta data. Escolha outro dia.";
                timesContainer.append(empty);
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
                    timesContainer.querySelectorAll(".time-option").forEach((option) => {
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
            timesContainer.replaceChildren();
            const empty = document.createElement("p");
            empty.className = "empty-message";
            empty.textContent = error?.message || "Não foi possível consultar os horários agora.";
            timesContainer.append(empty);
        }
    };

    const validateForm = () => {
        const accepted = form.elements.privacy.checked;
        form.querySelector('[data-error-for="privacy"]').textContent = accepted
            ? ""
            : "Confirme os dados e a Política de Privacidade.";
        return accepted;
    };

    const submit = async () => {
        if (!validateForm() || !state.service || !state.slot) return;
        const button = form.querySelector('button[type="submit"]');
        const original = button.textContent;
        button.disabled = true;
        button.textContent = "Confirmando...";
        setStatus("");
        try {
            const result = await api.public.createAppointment({
                serviceId: state.service.id,
                startsAt: state.slot.starts_at,
                notes: form.elements.note.value.trim()
            });
            panels.forEach((panel) => { panel.hidden = true; });
            successPanel.hidden = false;
            progressItems.forEach((item) => {
                item.classList.remove("is-current");
                item.classList.add("is-complete");
            });
            setText("[data-booking-protocol]", result?.appointment_id || "confirmado");
            successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (error) {
            const message = String(error?.message || "");
            if (/create_public_appointment|permission denied for function/i.test(message)) {
                setStatus("O banco ainda está com a função antiga de agendamento. Execute a migração 007 no Supabase e tente novamente.", "error");
            } else if (/jwt|login|sessão|session|auth/i.test(message)) {
                window.location.replace("minha-conta.html?acao=agendar");
                return;
            } else {
                setStatus(message || "Não foi possível concluir o agendamento. O horário pode ter acabado de ser ocupado.", "error");
            }
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    };

    const bindEvents = () => {
        document.addEventListener("click", (event) => {
            if (event.target.closest("[data-next-step]")) setStep(state.step + 1);
            if (event.target.closest("[data-previous-step]")) setStep(state.step - 1);
            if (event.target.closest("[data-restart-booking]")) window.location.reload();
        });
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            submit();
        });
    };

    const requireLogin = async () => {
        try {
            const session = await api.auth.getSession();
            if (!session) {
                window.location.replace("minha-conta.html?acao=agendar");
                return false;
            }

            state.account = await api.customer.getOverview();
            const customer = state.account.customer || {};
            const profile = state.account.profile || {};
            const hasName = Boolean(String(customer.name || profile.full_name || "").trim());
            const hasPhone = String(customer.phone || profile.phone || "").replace(/\D/g, "").length >= 10;
            if (!state.account.customer || !hasName || !hasPhone) {
                window.location.replace("minha-conta.html?acao=agendar#perfil");
                return false;
            }

            showBooking();
            showAccount();
            return true;
        } catch (error) {
            if (error?.name === "BackendNotConfiguredError") {
                showAuthGate(config.backend.missingMessage);
                return false;
            }
            window.location.replace("minha-conta.html?acao=agendar");
            return false;
        }
    };

    const start = async () => {
        bindEvents();
        setStatus("Validando sua conta...", "info");
        if (!(await requireLogin())) return;

        try {
            const [services, settings] = await Promise.all([
                api.public.getServices(),
                api.public.getSettings()
            ]);
            state.services = services || [];
            state.settings = settings || null;
            renderServices();
            renderDates();
            updateSummary();
            updateProgress();
            updateNextButton();
            setStatus("");
        } catch (error) {
            renderServices();
            setStatus(error?.name === "BackendNotConfiguredError"
                ? config.backend.missingMessage
                : (error?.message || config.backend.genericError), "error");
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
