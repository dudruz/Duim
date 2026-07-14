"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const list = document.querySelector("[data-agenda-list]");
    const dateInput = document.querySelector("[data-agenda-date]");
    const statusInput = document.querySelector("[data-agenda-status]");
    const searchInput = document.querySelector("[data-agenda-search]");
    const modal = document.querySelector("[data-appointment-modal]");
    const form = document.querySelector("[data-appointment-form]");
    const servicesSelect = form.elements.service_id;
    let appointments = [];

    dateInput.value = new Date().toISOString().slice(0, 10);

    const render = () => {
        list.replaceChildren();

        if (!appointments.length) {
            list.innerHTML = '<div class="admin-empty"><strong>Nenhum agendamento encontrado.</strong><span>Altere os filtros ou crie um encaixe.</span></div>';
            return;
        }

        appointments.forEach((appointment) => {
            const card = document.createElement("article");
            card.className = "agenda-card";
            card.innerHTML = `
                <div class="agenda-card__time">
                    <strong>${admin.formatTime(appointment.starts_at)}</strong>
                    <span>${appointment.services?.duration_minutes || 0} min</span>
                </div>
                <div class="agenda-card__main">
                    <div class="agenda-card__heading">
                        <div>
                            <strong>${esc(appointment.customers?.name || "Cliente")}</strong>
                            <span>${esc(appointment.services?.name || "Serviço")} · ${esc(appointment.customers?.phone || "Sem telefone")}</span>
                        </div>
                        <span class="status-badge status-badge--${appointment.status}">${admin.statusLabel(appointment.status)}</span>
                    </div>
                    ${appointment.notes ? `<p>${esc(appointment.notes)}</p>` : ""}
                    <div class="agenda-card__actions">
                        <select aria-label="Alterar status" data-status-id="${appointment.id}">
                            ${["pending", "confirmed", "completed", "cancelled", "no_show"].map((status) =>
                                `<option value="${status}" ${status === appointment.status ? "selected" : ""}>${admin.statusLabel(status)}</option>`
                            ).join("")}
                        </select>
                        <select aria-label="Situação do pagamento" data-payment-id="${appointment.id}">
                            ${["unpaid", "paid", "refunded"].map((status) =>
                                `<option value="${status}" ${status === appointment.payment_status ? "selected" : ""}>${admin.statusLabel(status)}</option>`
                            ).join("")}
                        </select>
                        <select aria-label="Forma de pagamento" data-method-id="${appointment.id}">
                            <option value="" ${!appointment.payment_method ? "selected" : ""}>Forma</option>
                            <option value="pix" ${appointment.payment_method === "pix" ? "selected" : ""}>Pix</option>
                            <option value="cash" ${appointment.payment_method === "cash" ? "selected" : ""}>Dinheiro</option>
                            <option value="card" ${appointment.payment_method === "card" ? "selected" : ""}>Cartão</option>
                            <option value="transfer" ${appointment.payment_method === "transfer" ? "selected" : ""}>Transferência</option>
                        </select>
                        <a class="admin-link" href="https://wa.me/55${appointment.customers?.phone || ""}" target="_blank" rel="noopener">WhatsApp</a>
                    </div>
                </div>
            `;
            list.append(card);
        });

        list.querySelectorAll("[data-status-id]").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await api.admin.updateAppointment(select.dataset.statusId, { status: select.value });
                    admin.showToast("Status atualizado.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });

        list.querySelectorAll("[data-payment-id]").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await api.admin.updateAppointment(select.dataset.paymentId, { payment_status: select.value });
                    admin.showToast("Pagamento atualizado.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });

        list.querySelectorAll("[data-method-id]").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await api.admin.updateAppointment(select.dataset.methodId, {
                        payment_method: select.value || null
                    });
                    admin.showToast("Forma de pagamento atualizada.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });
    };

    const load = async () => {
        list.innerHTML = '<div class="admin-empty"><span>Carregando agenda...</span></div>';
        try {
            appointments = await api.admin.getAppointments({
                date: dateInput.value,
                status: statusInput.value,
                search: searchInput.value.trim()
            });
            render();
        } catch (error) {
            list.innerHTML = `<div class="admin-empty"><strong>Erro ao carregar agenda.</strong><span>${esc(error.message)}</span></div>`;
        }
    };

    const loadServices = async () => {
        const services = (await api.admin.getServices()).filter((service) => service.active);
        servicesSelect.innerHTML = '<option value="">Selecione</option>';
        services.forEach((service) => {
            const option = document.createElement("option");
            option.value = service.id;
            option.textContent = `${service.name} · ${admin.formatCurrency(service.price)}`;
            servicesSelect.append(option);
        });
    };

    document.querySelector("[data-new-appointment]")?.addEventListener("click", async () => {
        form.reset();
        form.elements.date.value = dateInput.value;
        await loadServices();
        admin.openModal(modal);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true, "Criando...");

        try {
            const startsAt = new Date(`${form.elements.date.value}T${form.elements.time.value}:00`);
            await api.admin.createManualAppointment({
                customerName: form.elements.customer_name.value.trim(),
                customerPhone: form.elements.customer_phone.value,
                customerEmail: form.elements.customer_email.value.trim(),
                serviceId: form.elements.service_id.value,
                startsAt: startsAt.toISOString(),
                status: form.elements.status.value,
                notes: form.elements.notes.value.trim()
            });
            admin.closeModal(modal);
            admin.showToast("Agendamento criado.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    [dateInput, statusInput].forEach((element) => element.addEventListener("change", load));
    searchInput.addEventListener("input", () => {
        clearTimeout(searchInput.timer);
        searchInput.timer = setTimeout(load, 300);
    });

    load();
})();
