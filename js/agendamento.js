"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    const config = window.DuAmigoConfig;

    if (!api || !utils || !config) return;

    const panels = [...document.querySelectorAll("[data-booking-step]")];
    const progressItems = [...document.querySelectorAll("[data-progress-item]")];
    const servicesContainer = document.querySelector("[data-booking-services]");
    const datesContainer = document.querySelector("[data-booking-dates]");
    const timesContainer = document.querySelector("[data-booking-times]");
    const form = document.querySelector("[data-booking-form]");
    const successPanel = document.querySelector("[data-booking-success]");
    const statusBox = document.querySelector("[data-booking-status]");
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!servicesContainer || !datesContainer || !timesContainer || !form || !successPanel) return;

    const summary = {
        service: document.querySelector("[data-summary-service]"),
        date: document.querySelector("[data-summary-date]"),
        time: document.querySelector("[data-summary-time]"),
        duration: document.querySelector("[data-summary-duration]"),
        price: document.querySelector("[data-summary-price]")
    };

    const state = {
        step: 1,
        services: [],
        settings: null,
        service: null,
        date: null,
        slot: null
    };

    const assetFromPage = (path) => {
        if (!path) return "../assets/icons/scissors.svg";
        if (/^(https?:)?\/\//.test(path)) return path;
        return path.startsWith("../") ? path : `../${path}`;
    };

    const formatDate = (date, options) => new Intl.DateTimeFormat("pt-BR", options).format(date);

    const setStatus = (message = "", type = "info") => {
        if (!statusBox) return;
        statusBox.textContent = message;
        statusBox.dataset.type = type;
        statusBox.hidden = !message;
    };

    const updateSummary = () => {
        summary.service.textContent = state.service?.name || "Não escolhido";
        summary.date.textContent = state.date
            ? formatDate(state.date, { weekday: "long", day: "2-digit", month: "long" })
            : "Não escolhida";
        summary.time.textContent = state.slot
            ? formatDate(new Date(state.slot.starts_at), { hour: "2-digit", minute: "2-digit" })
            : "Não escolhido";
        summary.duration.textContent = state.service
            ? utils.formatDuration(state.service.duration_minutes)
            : "—";
        summary.price.textContent = state.service
            ? utils.formatCurrency(state.service.price)
            : "—";
    };

    const updateProgress = () => {
        progressItems.forEach((item) => {
            const itemStep = Number(item.dataset.progressItem);
            item.classList.toggle("is-current", itemStep === state.step);
            item.classList.toggle("is-complete", itemStep < state.step);
        });
    };

    const setStep = (step) => {
        state.step = Math.min(Math.max(step, 1), 4);
        panels.forEach((panel) => {
            panel.hidden = Number(panel.dataset.bookingStep) !== state.step;
        });
        successPanel.hidden = true;
        updateProgress();
        enableCurrentNextButton();

        document.querySelector(`[data-booking-step="${state.step}"]`)?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "start"
        });
    };

    const enableCurrentNextButton = () => {
        const panel = document.querySelector(`[data-booking-step="${state.step}"]`);
        const button = panel?.querySelector("[data-next-step]");
        if (!button) return;

        const hasValue = state.step === 1 ? Boolean(state.service)
            : state.step === 2 ? Boolean(state.date)
            : state.step === 3 ? Boolean(state.slot)
            : true;

        button.disabled = !hasValue;
    };

    const renderServices = () => {
        servicesContainer.replaceChildren();

        if (!state.services.length) {
            const message = document.createElement("p");
            message.className = "empty-message";
            message.textContent = "Nenhum serviço está disponível para agendamento.";
            servicesContainer.append(message);
            return;
        }

        state.services.forEach((service) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "booking-option";
            button.dataset.serviceId = service.id;
            button.setAttribute("aria-pressed", "false");

            const top = document.createElement("span");
            top.className = "booking-option__top";

            const icon = document.createElement("span");
            icon.className = "booking-option__icon";
            const iconImage = document.createElement("img");
            iconImage.src = assetFromPage(service.icon_path);
            iconImage.alt = "";
            iconImage.width = 24;
            iconImage.height = 24;
            icon.append(iconImage);

            const check = document.createElement("span");
            check.className = "booking-option__check";
            check.textContent = "✓";
            check.setAttribute("aria-hidden", "true");
            top.append(icon, check);

            const content = document.createElement("span");
            const title = document.createElement("h3");
            title.textContent = service.name;
            const description = document.createElement("p");
            description.textContent = service.description || "Consulte os detalhes do atendimento.";
            content.append(title, description);

            const meta = document.createElement("span");
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
                enableCurrentNextButton();
                if (state.date) loadTimes();
            });

            servicesContainer.append(button);
        });

        const serviceParam = new URLSearchParams(location.search).get("servico");
        const preset = state.services.find((service) => service.id === serviceParam || service.slug === serviceParam);
        if (preset) {
            servicesContainer.querySelector(`[data-service-id="${preset.id}"]`)?.click();
        }
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
            button.setAttribute("aria-label", formatDate(date, {
                weekday: "long",
                day: "numeric",
                month: "long"
            }));

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
                enableCurrentNextButton();
                await loadTimes();
            });

            datesContainer.append(button);
        });
    };

    const loadTimes = async () => {
        timesContainer.replaceChildren();
        state.slot = null;
        updateSummary();
        enableCurrentNextButton();

        if (!state.service || !state.date) {
            timesContainer.innerHTML = '<p class="empty-message">Escolha primeiro o serviço e a data.</p>';
            return;
        }

        const loading = document.createElement("p");
        loading.className = "empty-message";
        loading.textContent = "Consultando a agenda real...";
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
                const message = document.createElement("p");
                message.className = "empty-message";
                message.textContent = "Não há horários livres nesta data. Escolha outro dia.";
                timesContainer.append(message);
                return;
            }

            slots.forEach((slot) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "time-option";
                button.textContent = formatDate(new Date(slot.starts_at), {
                    hour: "2-digit",
                    minute: "2-digit"
                });
                button.setAttribute("aria-pressed", "false");

                button.addEventListener("click", () => {
                    state.slot = slot;
                    timesContainer.querySelectorAll(".time-option").forEach((option) => {
                        const selected = option === button;
                        option.classList.toggle("is-selected", selected);
                        option.setAttribute("aria-pressed", String(selected));
                    });
                    updateSummary();
                    enableCurrentNextButton();
                });

                timesContainer.append(button);
            });
        } catch (error) {
            timesContainer.replaceChildren();
            const message = document.createElement("p");
            message.className = "empty-message";
            message.textContent = error?.name === "BackendNotConfiguredError"
                ? config.backend.missingMessage
                : "Não foi possível consultar os horários agora.";
            timesContainer.append(message);
            console.error(error);
        }
    };

    const formatPhoneInput = (input) => {
        input.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "").slice(0, 11);
            if (digits.length <= 2) input.value = digits;
            else if (digits.length <= 7) input.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
            else input.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        });
    };

    const setError = (fieldName, message) => {
        const field = form.elements[fieldName];
        const error = form.querySelector(`[data-error-for="${fieldName}"]`);
        if (field && field.type !== "checkbox") {
            field.setAttribute("aria-invalid", String(Boolean(message)));
        }
        if (error) error.textContent = message;
    };

    const validateForm = () => {
        const name = form.elements.name.value.trim();
        const phoneDigits = form.elements.phone.value.replace(/\D/g, "");
        const email = form.elements.email?.value.trim() || "";
        const acceptedPrivacy = form.elements.privacy.checked;
        const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        setError("name", name.length >= 3 ? "" : "Informe seu nome completo.");
        setError("phone", phoneDigits.length >= 10 ? "" : "Informe um WhatsApp válido com DDD.");
        setError("email", emailValid ? "" : "Informe um e-mail válido.");
        setError("privacy", acceptedPrivacy ? "" : "É necessário aceitar a Política de Privacidade.");

        return name.length >= 3 && phoneDigits.length >= 10 && emailValid && acceptedPrivacy;
    };

    const submit = async () => {
        if (!validateForm() || !state.service || !state.slot) return;

        submitButton.disabled = true;
        submitButton.textContent = "Confirmando...";
        setStatus("", "info");

        try {
            const result = await api.public.createAppointment({
                serviceId: state.service.id,
                startsAt: state.slot.starts_at,
                customerName: form.elements.name.value.trim(),
                customerPhone: form.elements.phone.value,
                customerEmail: form.elements.email?.value.trim() || null,
                notes: form.elements.note.value.trim()
            });

            panels.forEach((panel) => { panel.hidden = true; });
            successPanel.hidden = false;
            progressItems.forEach((item) => {
                item.classList.remove("is-current");
                item.classList.add("is-complete");
            });

            const protocol = successPanel.querySelector("[data-booking-protocol]");
            if (protocol) protocol.textContent = result?.appointment_id || "confirmado";
            successPanel.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (error) {
            const message = error?.name === "BackendNotConfiguredError"
                ? config.backend.missingMessage
                : (error?.message || "Não foi possível concluir o agendamento. O horário pode ter acabado de ser ocupado.");
            setStatus(message, "error");
            console.error(error);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Confirmar agendamento";
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

        formatPhoneInput(form.elements.phone);
    };

    const start = async () => {
        setStatus("Carregando serviços e configurações...", "info");

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
            bindEvents();
            setStatus("", "info");
        } catch (error) {
            renderServices();
            renderDates();
            bindEvents();
            setStatus(
                error?.name === "BackendNotConfiguredError"
                    ? config.backend.missingMessage
                    : config.backend.genericError,
                "error"
            );
            console.error(error);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
