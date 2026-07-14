"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const list = document.querySelector("[data-dashboard-agenda]");
    const dateLabel = document.querySelector("[data-dashboard-date]");

    const renderAppointments = (appointments) => {
        list.replaceChildren();

        if (!appointments.length) {
            list.innerHTML = '<div class="admin-empty"><strong>Agenda livre hoje.</strong><span>Novos agendamentos aparecerão aqui.</span></div>';
            return;
        }

        appointments.forEach((appointment) => {
            const row = document.createElement("article");
            row.className = "timeline-item";
            row.innerHTML = `
                <time>${admin.formatTime(appointment.starts_at)}</time>
                <div class="timeline-item__line"></div>
                <div class="timeline-item__content">
                    <div>
                        <strong>${esc(appointment.customers?.name || "Cliente")}</strong>
                        <span>${esc(appointment.services?.name || "Serviço")}</span>
                    </div>
                    <span class="status-badge status-badge--${appointment.status}">${admin.statusLabel(appointment.status)}</span>
                </div>
            `;
            list.append(row);
        });
    };

    const load = async () => {
        const today = new Date().toISOString().slice(0, 10);
        dateLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long"
        }).format(new Date(`${today}T12:00:00`));

        try {
            const data = await api.admin.getDashboard(today);
            document.querySelector("[data-metric-today]").textContent = data.todayCount;
            document.querySelector("[data-metric-customers]").textContent = data.customersCount;
            document.querySelector("[data-metric-balance]").textContent = admin.formatCurrency(data.monthBalance);
            document.querySelector("[data-metric-subscriptions]").textContent = String(data.pendingSubscriptionCount || 0);
            document.querySelector("[data-metric-subscriptions-value]").textContent = admin.formatCurrency(data.pendingSubscriptionValue || 0);
            document.querySelector("[data-metric-next]").textContent = data.appointments.find((item) =>
                ["pending", "confirmed"].includes(item.status) && new Date(item.starts_at) > new Date()
            ) ? admin.formatTime(data.appointments.find((item) =>
                ["pending", "confirmed"].includes(item.status) && new Date(item.starts_at) > new Date()
            ).starts_at) : "Livre";

            renderAppointments(data.appointments);
        } catch (error) {
            list.innerHTML = `<div class="admin-empty"><strong>Não foi possível carregar.</strong><span>${esc(error.message)}</span></div>`;
            admin.showToast(error.message, "error");
        }
    };

    load();
})();
