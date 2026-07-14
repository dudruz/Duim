"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    const root = document.querySelector("[data-customer-account]");
    if (!api || !utils || !root) return;

    const status = document.querySelector("[data-account-status]");
    const list = document.querySelector("[data-appointment-list]");
    const nextContainer = document.querySelector("[data-next-appointment]");
    const planContainer = document.querySelector("[data-customer-plan]");
    const form = document.querySelector("[data-profile-form]");
    const params = new URLSearchParams(window.location.search);
    const bookingRequested = params.get("acao") === "agendar";
    const bookingGateway = document.querySelector("[data-account-booking-gateway]");
    const bookingGatewayTitle = document.querySelector("[data-booking-gateway-title]");
    const bookingGatewayText = document.querySelector("[data-booking-gateway-text]");
    const bookingContinue = document.querySelector("[data-account-booking-continue]");
    let overview = null;
    let currentFilter = "all";

    const statusLabels = {
        pending: "Pendente",
        confirmed: "Confirmado",
        completed: "Concluído",
        cancelled: "Cancelado",
        no_show: "Não compareceu"
    };

    const setStatus = (message = "", type = "info") => {
        status.hidden = !message;
        status.textContent = message;
        status.dataset.type = type;
    };

    const formatPhoneDisplay = (value = "") => {
        const digits = String(value).replace(/\D/g, "").slice(-11);
        if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        return value;
    };

    const bindPhoneMask = (input) => {
        input?.addEventListener("input", () => {
            input.value = formatPhoneDisplay(input.value);
        });
    };

    const dateParts = (dateValue) => {
        const date = new Date(dateValue);
        return {
            day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date),
            month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
            long: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(date),
            time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date),
            short: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date)
        };
    };

    const createStatusBadge = (appointmentStatus) => {
        const badge = document.createElement("span");
        badge.className = "status-badge";
        badge.dataset.status = appointmentStatus;
        badge.textContent = statusLabels[appointmentStatus] || appointmentStatus;
        return badge;
    };

    const isUpcoming = (appointment) => {
        return ["pending", "confirmed"].includes(appointment.status)
            && new Date(appointment.starts_at).getTime() > Date.now();
    };

    const getUpcoming = () => (overview?.appointments || [])
        .filter(isUpcoming)
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

    const renderMetrics = () => {
        const appointments = overview.appointments || [];
        const completed = appointments.filter((item) => item.status === "completed").length;
        const next = getUpcoming()[0];
        const activePlan = (overview.subscriptions || []).find((item) => item.status === "active");

        document.querySelector("[data-account-completed]").textContent = String(completed);
        document.querySelector("[data-account-next-short]").textContent = next ? dateParts(next.starts_at).short : "—";
        document.querySelector("[data-account-plan-uses]").textContent = activePlan ? String(activePlan.remaining_uses) : "—";
    };

    const renderNext = () => {
        nextContainer.replaceChildren();
        const appointment = getUpcoming()[0];

        if (!appointment) {
            const empty = document.createElement("div");
            empty.className = "account-empty";
            const strong = document.createElement("strong");
            strong.textContent = "Nenhum horário marcado.";
            const text = document.createElement("p");
            text.textContent = "Quando você agendar, o próximo atendimento aparecerá aqui.";
            const link = document.createElement("a");
            link.className = "button button--primary";
            link.href = "agendamento.html";
            link.textContent = "Agendar agora";
            empty.append(strong, text, link);
            nextContainer.append(empty);
            return;
        }

        const parts = dateParts(appointment.starts_at);
        const card = document.createElement("article");
        card.className = "next-appointment-card";

        const top = document.createElement("div");
        top.className = "next-appointment-card__top";
        const heading = document.createElement("div");
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = "Seu próximo horário";
        const title = document.createElement("h3");
        title.textContent = appointment.services?.name || "Atendimento";
        heading.append(eyebrow, title);
        top.append(heading, createStatusBadge(appointment.status));

        const meta = document.createElement("div");
        meta.className = "next-appointment-card__meta";
        [
            ["Data", parts.long],
            ["Horário", parts.time],
            ["Duração", utils.formatDuration(appointment.services?.duration_minutes)]
        ].forEach(([label, value]) => {
            const item = document.createElement("div");
            item.className = "account-meta";
            const span = document.createElement("span");
            span.textContent = label;
            const strong = document.createElement("strong");
            strong.textContent = value;
            item.append(span, strong);
            meta.append(item);
        });

        const actions = document.createElement("div");
        actions.className = "account-hero__actions";
        const newBooking = document.createElement("a");
        newBooking.className = "button button--secondary";
        newBooking.href = "agendamento.html";
        newBooking.textContent = "Marcar outro";
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "button button--secondary";
        cancel.textContent = "Cancelar horário";
        cancel.dataset.cancelAppointment = appointment.id;
        actions.append(newBooking, cancel);

        card.append(top, meta, actions);
        nextContainer.append(card);
    };

    const filteredAppointments = () => {
        const appointments = overview?.appointments || [];
        if (currentFilter === "upcoming") return appointments.filter(isUpcoming);
        if (currentFilter === "completed") return appointments.filter((item) => item.status === "completed");
        if (currentFilter === "cancelled") return appointments.filter((item) => ["cancelled", "no_show"].includes(item.status));
        return appointments;
    };

    const renderAppointments = () => {
        list.replaceChildren();
        const appointments = filteredAppointments();

        if (!appointments.length) {
            const empty = document.createElement("div");
            empty.className = "account-empty";
            empty.textContent = "Nenhum atendimento nesta categoria.";
            list.append(empty);
            return;
        }

        appointments.forEach((appointment) => {
            const parts = dateParts(appointment.starts_at);
            const card = document.createElement("article");
            card.className = "customer-appointment";

            const date = document.createElement("div");
            date.className = "customer-appointment__date";
            const day = document.createElement("strong");
            day.textContent = parts.day;
            const month = document.createElement("span");
            month.textContent = parts.month;
            date.append(day, month);

            const content = document.createElement("div");
            content.className = "customer-appointment__content";
            const title = document.createElement("h3");
            title.textContent = appointment.services?.name || "Atendimento";
            const detail = document.createElement("p");
            detail.textContent = `${parts.long} às ${parts.time} · ${utils.formatCurrency(appointment.total_amount)}`;
            content.append(title, detail);

            const actions = document.createElement("div");
            actions.className = "customer-appointment__actions";
            actions.append(createStatusBadge(appointment.status));
            if (isUpcoming(appointment)) {
                const cancel = document.createElement("button");
                cancel.type = "button";
                cancel.className = "link-button is-danger";
                cancel.dataset.cancelAppointment = appointment.id;
                cancel.textContent = "Cancelar";
                actions.append(cancel);
            }

            card.append(date, content, actions);
            list.append(card);
        });
    };

    const renderPlan = () => {
        planContainer.replaceChildren();
        const plan = (overview.subscriptions || []).find((item) => item.status === "active");

        if (!plan) {
            const empty = document.createElement("div");
            empty.className = "account-empty";
            const strong = document.createElement("strong");
            strong.textContent = "Você não possui plano ativo.";
            const text = document.createElement("p");
            text.textContent = "Os planos cadastrados pelo Duin aparecerão aqui.";
            empty.append(strong, text);
            planContainer.append(empty);
            return;
        }

        const card = document.createElement("article");
        card.className = "account-plan";
        const badge = createStatusBadge(plan.status);
        const title = document.createElement("h3");
        title.textContent = plan.plans?.name || "Plano";
        const description = document.createElement("p");
        description.textContent = plan.plans?.description || "Plano ativo na Barbearia du Amigo.";
        const uses = document.createElement("div");
        uses.className = "account-plan__uses";
        const label = document.createElement("span");
        label.textContent = "Usos restantes";
        const value = document.createElement("strong");
        value.textContent = String(plan.remaining_uses);
        uses.append(label, value);
        card.append(badge, title, description, uses);
        planContainer.append(card);
    };

    const fillProfile = () => {
        const customer = overview.customer || {};
        const profile = overview.profile || {};
        const user = overview.user || {};
        const displayName = customer.nickname || customer.name || profile.full_name || "cliente";
        document.querySelector("[data-customer-greeting]").textContent = displayName.split(" ")[0];

        form.elements.fullName.value = customer.name || profile.full_name || "";
        form.elements.nickname.value = customer.nickname || "";
        form.elements.phone.value = formatPhoneDisplay(customer.phone || profile.phone || "");
        form.elements.email.value = customer.email || profile.email || user.email || "";
        form.elements.birthDate.value = customer.birth_date || "";
        form.elements.stylePreferences.value = customer.style_preferences || "";
    };

    const renderAll = () => {
        fillProfile();
        renderMetrics();
        renderNext();
        renderAppointments();
        renderPlan();
    };

    const hasCompleteBookingProfile = () => {
        const customer = overview?.customer || {};
        const profile = overview?.profile || {};
        const name = String(customer.name || profile.full_name || "").trim();
        const phone = String(customer.phone || profile.phone || "").replace(/\D/g, "");
        return Boolean(overview?.customer) && name.length >= 3 && phone.length >= 10;
    };

    const handleBookingRequest = () => {
        if (!bookingRequested || !bookingGateway) return;
        bookingGateway.hidden = false;

        if (hasCompleteBookingProfile()) {
            bookingGateway.dataset.state = "ready";
            bookingGatewayTitle.textContent = "Conta verificada. Abrindo a agenda...";
            bookingGatewayText.textContent = "Agora você poderá escolher o serviço, o dia e o horário disponível.";
            bookingContinue.hidden = false;
            window.setTimeout(() => window.location.replace("agendamento.html"), 650);
            return;
        }

        bookingGateway.dataset.state = "profile";
        bookingGatewayTitle.textContent = "Complete nome e WhatsApp antes de agendar.";
        bookingGatewayText.textContent = "Esses dados identificam seu horário para o Duin. Depois de salvar, a agenda abre automaticamente.";
        bookingContinue.hidden = true;
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) submitButton.textContent = "Salvar e escolher horário";
        window.setTimeout(() => document.getElementById("perfil")?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    };

    const load = async () => {
        setStatus("Carregando sua conta...", "info");
        try {
            overview = await api.customer.getOverview();
            renderAll();
            setStatus("");
            handleBookingRequest();
        } catch (error) {
            if (/login|sessão|session|auth/i.test(error?.message || "")) {
                const redirect = bookingRequested ? "minha-conta.html?acao=agendar" : "minha-conta.html";
                window.location.replace(`login.html?redirect=${encodeURIComponent(redirect)}`);
                return;
            }
            setStatus(error?.name === "BackendNotConfiguredError"
                ? window.DuAmigoConfig.backend.missingMessage
                : (error?.message || window.DuAmigoConfig.backend.genericError), "error");
        }
    };

    const handleCancel = async (id, button) => {
        if (!window.confirm("Cancelar este horário? O horário voltará a ficar disponível na agenda.")) return;
        button.disabled = true;
        const original = button.textContent;
        button.textContent = "Cancelando...";
        try {
            await api.customer.cancelAppointment(id);
            await load();
            setStatus("Agendamento cancelado.", "success");
        } catch (error) {
            setStatus(error?.message || "Não foi possível cancelar o horário.", "error");
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    };

    const bindEvents = () => {
        bindPhoneMask(form.elements.phone);

        document.querySelectorAll("[data-appointment-filter]").forEach((button) => {
            button.addEventListener("click", () => {
                currentFilter = button.dataset.appointmentFilter;
                document.querySelectorAll("[data-appointment-filter]").forEach((item) => {
                    item.classList.toggle("is-active", item === button);
                });
                renderAppointments();
            });
        });

        document.addEventListener("click", (event) => {
            const cancel = event.target.closest("[data-cancel-appointment]");
            if (cancel) handleCancel(cancel.dataset.cancelAppointment, cancel);
        });

        document.querySelector("[data-scroll-profile]")?.addEventListener("click", () => {
            document.getElementById("perfil")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        document.querySelector("[data-customer-logout]")?.addEventListener("click", async () => {
            await api.auth.signOut();
            window.location.replace("login.html");
        });

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(form));
            const phone = String(values.phone || "").replace(/\D/g, "");
            const fullName = String(values.fullName || "").trim();
            const nameError = fullName.length >= 3 ? "" : "Informe seu nome completo.";
            const phoneError = phone.length >= 10 ? "" : "Informe um WhatsApp válido com DDD.";
            form.querySelector('[data-error-for="fullName"]').textContent = nameError;
            form.querySelector('[data-error-for="phone"]').textContent = phoneError;
            if (nameError || phoneError) return;

            const button = form.querySelector('button[type="submit"]');
            const original = button.textContent;
            button.disabled = true;
            button.textContent = "Salvando...";
            try {
                await api.customer.syncProfile({
                    fullName,
                    phone,
                    nickname: values.nickname,
                    birthDate: values.birthDate,
                    stylePreferences: values.stylePreferences
                });
                if (bookingRequested) {
                    window.location.replace("agendamento.html");
                    return;
                }
                await load();
                setStatus("Perfil atualizado. Suas preferências já estão disponíveis para o Duin.", "success");
            } catch (error) {
                setStatus(error?.message || "Não foi possível salvar seu perfil.", "error");
            } finally {
                button.disabled = false;
                button.textContent = original;
            }
        });
    };

    const start = () => {
        bindEvents();
        load();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
