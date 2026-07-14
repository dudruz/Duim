"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const hoursForm = document.querySelector("[data-hours-form]");
    const blockedList = document.querySelector("[data-blocked-list]");
    const blockedModal = document.querySelector("[data-blocked-modal]");
    const blockedForm = document.querySelector("[data-blocked-form]");
    const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    let hours = [];
    let blocked = [];

    const renderHours = () => {
        const container = hoursForm.querySelector("[data-hours-rows]");
        container.replaceChildren();

        weekdays.forEach((label, weekday) => {
            const row = hours.find((item) => Number(item.weekday) === weekday) || {
                weekday,
                is_open: false,
                opens_at: "",
                closes_at: "",
                break_start: "",
                break_end: ""
            };

            const article = document.createElement("div");
            article.className = "hours-row";
            article.dataset.weekday = weekday;
            article.innerHTML = `
                <label class="switch-field">
                    <input type="checkbox" name="open_${weekday}" ${row.is_open ? "checked" : ""}>
                    <span>${label}</span>
                </label>
                <label>Abre<input type="time" name="opens_${weekday}" value="${row.opens_at?.slice(0, 5) || ""}"></label>
                <label>Fecha<input type="time" name="closes_${weekday}" value="${row.closes_at?.slice(0, 5) || ""}"></label>
                <label>Pausa<input type="time" name="break_start_${weekday}" value="${row.break_start?.slice(0, 5) || ""}"></label>
                <label>Retorno<input type="time" name="break_end_${weekday}" value="${row.break_end?.slice(0, 5) || ""}"></label>
            `;
            container.append(article);
        });
    };

    const renderBlocked = () => {
        blockedList.replaceChildren();
        if (!blocked.length) {
            blockedList.innerHTML = '<div class="admin-empty">Nenhuma folga ou bloqueio futuro.</div>';
            return;
        }

        blocked.forEach((period) => {
            const item = document.createElement("article");
            item.className = "blocked-card";
            item.innerHTML = `
                <div>
                    <strong>${esc(period.reason || "Agenda bloqueada")}</strong>
                    <span>${admin.formatDateTime(period.starts_at)} até ${admin.formatDateTime(period.ends_at)}</span>
                </div>
                <button class="danger-link" type="button" data-delete-blocked="${period.id}">Remover</button>
            `;
            blockedList.append(item);
        });

        blockedList.querySelectorAll("[data-delete-blocked]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (!confirm("Remover este bloqueio?")) return;
                try {
                    await api.admin.deleteBlockedPeriod(button.dataset.deleteBlocked);
                    admin.showToast("Bloqueio removido.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });
    };

    const load = async () => {
        try {
            [hours, blocked] = await Promise.all([
                api.admin.getBusinessHours(),
                api.admin.getBlockedPeriods()
            ]);
            renderHours();
            renderBlocked();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    hoursForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = hoursForm.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);

        const rows = weekdays.map((_, weekday) => ({
            weekday,
            is_open: hoursForm.elements[`open_${weekday}`].checked,
            opens_at: hoursForm.elements[`opens_${weekday}`].value || null,
            closes_at: hoursForm.elements[`closes_${weekday}`].value || null,
            break_start: hoursForm.elements[`break_start_${weekday}`].value || null,
            break_end: hoursForm.elements[`break_end_${weekday}`].value || null
        }));

        try {
            await api.admin.saveBusinessHours(rows);
            admin.showToast("Horários salvos.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    document.querySelector("[data-new-blocked]")?.addEventListener("click", () => {
        blockedForm.reset();
        admin.openModal(blockedModal);
    });

    blockedForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = blockedForm.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);
        try {
            await api.admin.saveBlockedPeriod({
                starts_at: new Date(blockedForm.elements.starts_at.value).toISOString(),
                ends_at: new Date(blockedForm.elements.ends_at.value).toISOString(),
                reason: blockedForm.elements.reason.value.trim(),
                all_day: blockedForm.elements.all_day.checked
            });
            admin.closeModal(blockedModal);
            admin.showToast("Bloqueio criado.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    load();
})();
