"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const tbody = document.querySelector("[data-finance-body]");
    const startInput = document.querySelector("[data-finance-start]");
    const endInput = document.querySelector("[data-finance-end]");
    const modal = document.querySelector("[data-movement-modal]");
    const form = document.querySelector("[data-movement-form]");
    let movements = [];

    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    startInput.value = first.toISOString().slice(0, 10);
    endInput.value = today.toISOString().slice(0, 10);

    const render = () => {
        tbody.replaceChildren();

        let income = 0;
        let expense = 0;
        movements.forEach((movement) => {
            const value = Number(movement.amount);
            if (movement.type === "expense") expense += value;
            else income += value;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${admin.formatDate(movement.movement_date)}</td>
                <td><span class="status-badge ${movement.type === "expense" ? "status-badge--cancelled" : "status-badge--confirmed"}">${movement.type === "expense" ? "Saída" : "Entrada"}</span></td>
                <td><strong>${esc(movement.description)}</strong><span>${esc(movement.category || "Sem categoria")}</span></td>
                <td>${esc(movement.payment_method || "—")}</td>
                <td class="${movement.type === "expense" ? "amount-negative" : "amount-positive"}">${movement.type === "expense" ? "-" : "+"}${admin.formatCurrency(value)}</td>
                <td><button class="danger-link" type="button" data-delete-movement="${movement.id}">Excluir</button></td>
            `;
            tbody.append(row);
        });

        if (!movements.length) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty">Nenhum lançamento no período.</div></td></tr>';
        }

        document.querySelector("[data-finance-income]").textContent = admin.formatCurrency(income);
        document.querySelector("[data-finance-expense]").textContent = admin.formatCurrency(expense);
        document.querySelector("[data-finance-balance]").textContent = admin.formatCurrency(income - expense);

        tbody.querySelectorAll("[data-delete-movement]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (!confirm("Excluir este lançamento?")) return;
                try {
                    await api.admin.deleteCashMovement(button.dataset.deleteMovement);
                    admin.showToast("Lançamento excluído.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });
    };

    const load = async () => {
        try {
            movements = await api.admin.getCashMovements({
                startDate: startInput.value,
                endDate: endInput.value
            });
            render();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    document.querySelector("[data-new-movement]")?.addEventListener("click", () => {
        form.reset();
        form.elements.movement_date.value = new Date().toISOString().slice(0, 10);
        admin.openModal(modal);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);
        try {
            await api.admin.saveCashMovement(Object.fromEntries(new FormData(form)));
            admin.closeModal(modal);
            admin.showToast("Lançamento salvo.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    [startInput, endInput].forEach((input) => input.addEventListener("change", load));
    load();
})();
