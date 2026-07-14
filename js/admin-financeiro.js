"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const tbody = document.querySelector("[data-finance-body]");
    const breakdown = document.querySelector("[data-finance-breakdown]");
    const startInput = document.querySelector("[data-finance-start]");
    const endInput = document.querySelector("[data-finance-end]");
    const modal = document.querySelector("[data-movement-modal]");
    const form = document.querySelector("[data-movement-form]");
    let overview = { movements: [], appointments: [], payments: [], subscriptions: [], requests: [] };

    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    startInput.value = first.toISOString().slice(0, 10);
    endInput.value = today.toISOString().slice(0, 10);

    const sum = (items, getValue = (item) => item.amount) => items.reduce((total, item) => total + Number(getValue(item) || 0), 0);
    const activeAppointment = (item) => !["cancelled", "no_show"].includes(item.status);

    const methodLabel = (method) => ({
        pix: "Pix",
        cash: "Dinheiro",
        card: "Cartão",
        credit_card: "Cartão online",
        transfer: "Transferência",
        infinitepay: "InfinitePay",
        subscription: "Mensalidade",
        salon: "No salão"
    }[method] || method || "—");

    const calculate = () => {
        const movements = overview.movements || [];
        const appointments = (overview.appointments || []).filter(activeAppointment);
        const subscriptions = (overview.subscriptions || []).filter((item) => item.status === "active");
        const requests = overview.requests || [];

        const income = sum(movements.filter((item) => item.type === "income"));
        const expense = sum(movements.filter((item) => item.type === "expense"));
        const salonPending = sum(appointments.filter((item) => item.billing_mode === "salon" && item.payment_status === "unpaid"), (item) => item.total_amount);
        const salonReceived = sum(appointments.filter((item) => item.billing_mode === "salon" && item.payment_status === "paid"), (item) => item.total_amount);
        const onlineReceived = sum((overview.payments || []).filter((item) => item.provider === "infinitepay" && item.appointment_id));
        const monthlyActive = sum(subscriptions, (item) => item.plans?.price);
        const appointmentProjection = sum(appointments.filter((item) => item.billing_mode !== "subscription"), (item) => item.total_amount);
        const projection = appointmentProjection + monthlyActive;
        const cashRequests = requests.filter((item) => item.status === "pending_approval");
        const onlineRequests = requests.filter((item) => item.status === "pending_payment");

        return {
            income,
            expense,
            balance: income - expense,
            salonPending,
            salonReceived,
            onlineReceived,
            monthlyActive,
            projection,
            activeMonthlyCount: subscriptions.length,
            cashRequestCount: cashRequests.length,
            cashRequestValue: sum(cashRequests),
            onlineRequestCount: onlineRequests.length,
            onlineRequestValue: sum(onlineRequests)
        };
    };

    const renderBreakdown = (metrics) => {
        const cards = [
            ["Saldo do caixa", admin.formatCurrency(metrics.balance), `${admin.formatCurrency(metrics.income)} em entradas · ${admin.formatCurrency(metrics.expense)} em saídas`],
            ["Mensalidades em dinheiro", admin.formatCurrency(metrics.cashRequestValue), `${metrics.cashRequestCount} aguardando aprovação do Duin`],
            ["Mensalidades online pendentes", admin.formatCurrency(metrics.onlineRequestValue), `${metrics.onlineRequestCount} aguardando pagamento/webhook`],
            ["Agendamentos no período", String((overview.appointments || []).filter(activeAppointment).length), "Inclui pré-pago, mensalista e a cobrar"]
        ];
        breakdown.replaceChildren();
        cards.forEach(([label, value, detail]) => {
            const card = document.createElement("article");
            card.className = "finance-breakdown-card";
            const span = document.createElement("span");
            span.textContent = label;
            const strong = document.createElement("strong");
            strong.textContent = value;
            const small = document.createElement("small");
            small.textContent = detail;
            card.append(span, strong, small);
            breakdown.append(card);
        });
    };

    const renderMovements = () => {
        tbody.replaceChildren();
        const movements = overview.movements || [];
        movements.forEach((movement) => {
            const value = Number(movement.amount || 0);
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${admin.formatDate(movement.movement_date)}</td>
                <td><span class="status-badge ${movement.type === "expense" ? "status-badge--cancelled" : "status-badge--confirmed"}">${movement.type === "expense" ? "Saída" : "Entrada"}</span></td>
                <td><strong>${esc(movement.description)}</strong><span>${esc(movement.category || "Sem categoria")}</span></td>
                <td>${esc(methodLabel(movement.payment_method))}</td>
                <td class="${movement.type === "expense" ? "amount-negative" : "amount-positive"}">${movement.type === "expense" ? "-" : "+"}${admin.formatCurrency(value)}</td>
                <td>${movement.origin === "manual" || !movement.origin ? `<button class="danger-link" type="button" data-delete-movement="${movement.id}">Excluir</button>` : '<span class="admin-muted">Automático</span>'}</td>
            `;
            tbody.append(row);
        });

        if (!movements.length) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty">Nenhuma movimentação no período.</div></td></tr>';
        }

        tbody.querySelectorAll("[data-delete-movement]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (!confirm("Excluir este lançamento manual?")) return;
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

    const render = () => {
        const metrics = calculate();
        document.querySelector("[data-finance-received]").textContent = admin.formatCurrency(metrics.income);
        document.querySelector("[data-finance-salon-pending]").textContent = admin.formatCurrency(metrics.salonPending);
        document.querySelector("[data-finance-salon-received]").textContent = admin.formatCurrency(metrics.salonReceived);
        document.querySelector("[data-finance-online-received]").textContent = admin.formatCurrency(metrics.onlineReceived);
        document.querySelector("[data-finance-monthly-active]").textContent = admin.formatCurrency(metrics.monthlyActive);
        document.querySelector("[data-finance-monthly-count]").textContent = `${metrics.activeMonthlyCount} cliente(s) ativo(s)`;
        document.querySelector("[data-finance-projection]").textContent = admin.formatCurrency(metrics.projection);
        renderBreakdown(metrics);
        renderMovements();
    };

    const load = async () => {
        try {
            overview = await api.admin.getFinanceOverview({
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
