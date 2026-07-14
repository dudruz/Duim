"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;
    const utils = window.DuAmigoUtils;

    const plansGrid = document.querySelector("[data-plans-grid]");
    const subscriptionsBody = document.querySelector("[data-subscriptions-body]");
    const requestsContainer = document.querySelector("[data-subscription-requests]");
    const planModal = document.querySelector("[data-plan-modal]");
    const planForm = document.querySelector("[data-plan-form]");
    const subscriptionModal = document.querySelector("[data-subscription-modal]");
    const subscriptionForm = document.querySelector("[data-subscription-form]");
    let plans = [];
    let subscriptions = [];
    let requests = [];
    let customers = [];

    const requestLabels = {
        pending_approval: "Aguardando aprovação",
        pending_payment: "Aguardando pagamento online",
        approved: "Aprovado",
        rejected: "Recusado",
        cancelled: "Cancelado",
        expired: "Expirado"
    };

    const renderMetrics = () => {
        const active = subscriptions.filter((item) => item.status === "active" && (!item.ends_on || new Date(`${item.ends_on}T23:59:59`).getTime() >= Date.now()));
        const recurring = active.reduce((total, item) => total + Number(item.plans?.price || 0), 0);
        const pending = requests.filter((item) => item.status === "pending_approval");
        const pendingValue = pending.reduce((total, item) => total + Number(item.amount || 0), 0);
        document.querySelector("[data-plan-recurring]").textContent = admin.formatCurrency(recurring);
        document.querySelector("[data-plan-active-count]").textContent = String(active.length);
        document.querySelector("[data-plan-pending-count]").textContent = String(pending.length);
        document.querySelector("[data-plan-pending-value]").textContent = admin.formatCurrency(pendingValue);
    };

    const renderRequests = () => {
        requestsContainer.replaceChildren();
        const visible = requests.filter((item) => ["pending_approval", "pending_payment"].includes(item.status));
        if (!visible.length) {
            requestsContainer.innerHTML = '<div class="admin-empty">Nenhuma solicitação pendente.</div>';
            return;
        }

        visible.forEach((request) => {
            const card = document.createElement("article");
            card.className = "subscription-approval-card";
            card.dataset.status = request.status;
            const customerName = request.customers?.nickname || request.customers?.name || "Cliente";
            card.innerHTML = `
                <div class="subscription-approval-card__top">
                    <div>
                        <span class="status-badge" data-status="${esc(request.status)}">${esc(requestLabels[request.status] || request.status)}</span>
                        <h3>${esc(customerName)}</h3>
                        <p>${esc(request.plans?.name || "Plano")} · ${esc(utils.formatBrazilPhone(request.customers?.phone || ""))}</p>
                    </div>
                    <strong class="plan-offer__price">${admin.formatCurrency(request.amount)}</strong>
                </div>
                <div class="management-card__meta">
                    <span>${request.payment_choice === "cash" ? "Pagamento em dinheiro" : "Checkout InfinitePay"}</span>
                    <span>${admin.formatDate(request.requested_at)}</span>
                </div>
                <div class="subscription-approval-card__actions"></div>
            `;
            const actions = card.querySelector(".subscription-approval-card__actions");
            if (request.status === "pending_approval") {
                const reject = document.createElement("button");
                reject.type = "button";
                reject.className = "button button--small button--secondary";
                reject.dataset.rejectSubscriptionRequest = request.id;
                reject.textContent = "Recusar";
                const approve = document.createElement("button");
                approve.type = "button";
                approve.className = "button button--small button--primary";
                approve.dataset.approveSubscriptionRequest = request.id;
                approve.textContent = "Aprovar e marcar recebido";
                actions.append(reject, approve);
            } else {
                const waiting = document.createElement("p");
                waiting.className = "admin-muted";
                waiting.textContent = "O plano será ativado automaticamente quando o webhook confirmar o pagamento.";
                actions.append(waiting);
            }
            requestsContainer.append(card);
        });
    };

    const renderPlans = () => {
        plansGrid.replaceChildren();
        if (!plans.length) {
            plansGrid.innerHTML = '<div class="admin-empty">Nenhum plano cadastrado.</div>';
            return;
        }
        plans.forEach((plan) => {
            const card = document.createElement("article");
            card.className = "management-card";
            card.innerHTML = `
                <div class="management-card__top">
                    <span class="status-badge ${plan.active ? "status-badge--confirmed" : "status-badge--cancelled"}">${plan.active ? "Ativo" : "Inativo"}</span>
                    <strong>${admin.formatCurrency(plan.price)}</strong>
                </div>
                <h3>${esc(plan.name)}</h3>
                <p>${esc(plan.description || "Sem descrição.")}</p>
                <div class="management-card__meta"><span>${plan.cuts_included} usos</span><span>${plan.billing_cycle === "monthly" ? "Mensal" : esc(plan.billing_cycle)}</span></div>
                <div class="management-card__actions"><button class="button button--small button--secondary" type="button" data-edit-plan="${plan.id}">Editar</button></div>
            `;
            plansGrid.append(card);
        });
        plansGrid.querySelectorAll("[data-edit-plan]").forEach((button) => {
            button.addEventListener("click", () => openPlan(plans.find((item) => item.id === button.dataset.editPlan)));
        });
    };

    const renderSubscriptions = () => {
        subscriptionsBody.replaceChildren();
        if (!subscriptions.length) {
            subscriptionsBody.innerHTML = '<tr><td colspan="6"><div class="admin-empty">Nenhum mensalista cadastrado.</div></td></tr>';
            return;
        }
        subscriptions.forEach((subscription) => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${esc(subscription.customers?.name || "Cliente")}</strong><span>${esc(utils.formatBrazilPhone(subscription.customers?.phone || ""))}</span></td>
                <td>${esc(subscription.plans?.name || "Plano")}<span>${admin.formatCurrency(subscription.plans?.price || 0)}/mês</span></td>
                <td>${admin.formatDate(subscription.starts_on)}</td>
                <td>${subscription.ends_on ? admin.formatDate(subscription.ends_on) : "Sem fim"}</td>
                <td><input class="table-number-input" type="number" min="0" value="${subscription.remaining_uses}" data-uses-id="${subscription.id}" aria-label="Usos restantes"></td>
                <td><select data-subscription-status="${subscription.id}" aria-label="Status da assinatura"><option value="active" ${subscription.status === "active" ? "selected" : ""}>Ativo</option><option value="paused" ${subscription.status === "paused" ? "selected" : ""}>Pausado</option><option value="cancelled" ${subscription.status === "cancelled" ? "selected" : ""}>Cancelado</option></select></td>
            `;
            subscriptionsBody.append(row);
        });
        subscriptionsBody.querySelectorAll("[data-subscription-status]").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await api.admin.updateSubscription(select.dataset.subscriptionStatus, { status: select.value });
                    admin.showToast("Status do mensalista atualizado.");
                    load();
                } catch (error) { admin.showToast(error.message, "error"); }
            });
        });
        subscriptionsBody.querySelectorAll("[data-uses-id]").forEach((input) => {
            input.addEventListener("change", async () => {
                try {
                    await api.admin.updateSubscription(input.dataset.usesId, { remaining_uses: Math.max(0, Number(input.value || 0)) });
                    admin.showToast("Quantidade de usos atualizada.");
                } catch (error) { admin.showToast(error.message, "error"); }
            });
        });
    };

    const openPlan = (plan = null) => {
        planForm.reset();
        planForm.elements.id.value = plan?.id || "";
        planForm.elements.name.value = plan?.name || "";
        planForm.elements.description.value = plan?.description || "";
        planForm.elements.price.value = plan?.price ?? "";
        planForm.elements.billing_cycle.value = plan?.billing_cycle || "monthly";
        planForm.elements.cuts_included.value = plan?.cuts_included || 4;
        planForm.elements.active.checked = plan?.active ?? true;
        admin.openModal(planModal);
    };

    const loadSubscriptionOptions = () => {
        const customerSelect = subscriptionForm.elements.customer_id;
        const planSelect = subscriptionForm.elements.plan_id;
        customerSelect.innerHTML = '<option value="">Selecione</option>';
        planSelect.innerHTML = '<option value="">Selecione</option>';
        customers.forEach((customer) => customerSelect.insertAdjacentHTML("beforeend", `<option value="${customer.id}">${esc(customer.name)} · ${esc(utils.formatBrazilPhone(customer.phone))}</option>`));
        plans.filter((plan) => plan.active).forEach((plan) => planSelect.insertAdjacentHTML("beforeend", `<option value="${plan.id}">${esc(plan.name)}</option>`));
    };

    const load = async () => {
        try {
            [plans, subscriptions, requests, customers] = await Promise.all([
                api.admin.getPlans(),
                api.admin.getSubscriptions(),
                api.admin.getSubscriptionRequests(),
                api.admin.getCustomers()
            ]);
            renderMetrics();
            renderRequests();
            renderPlans();
            renderSubscriptions();
        } catch (error) { admin.showToast(error.message, "error"); }
    };

    document.addEventListener("click", async (event) => {
        const approve = event.target.closest("[data-approve-subscription-request]");
        const reject = event.target.closest("[data-reject-subscription-request]");
        const button = approve || reject;
        if (!button) return;
        const isApprove = Boolean(approve);
        if (isApprove && !window.confirm("Confirmar que o pagamento em dinheiro foi recebido e ativar o mensalista?")) return;
        if (!isApprove && !window.confirm("Recusar esta solicitação de mensalidade?")) return;
        const original = button.textContent;
        button.disabled = true;
        button.textContent = isApprove ? "Aprovando..." : "Recusando...";
        try {
            await api.admin.reviewSubscriptionRequest(button.dataset.approveSubscriptionRequest || button.dataset.rejectSubscriptionRequest, isApprove);
            admin.showToast(isApprove ? "Mensalidade aprovada e recebimento lançado." : "Solicitação recusada.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    });

    document.querySelector("[data-new-plan]")?.addEventListener("click", () => openPlan());
    document.querySelector("[data-new-subscription]")?.addEventListener("click", () => {
        subscriptionForm.reset();
        subscriptionForm.elements.starts_on.value = new Date().toISOString().slice(0, 10);
        subscriptionForm.elements.status.value = "active";
        loadSubscriptionOptions();
        admin.openModal(subscriptionModal);
    });

    planForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = planForm.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);
        const payload = Object.fromEntries(new FormData(planForm));
        payload.active = planForm.elements.active.checked;
        try {
            await api.admin.savePlan(payload);
            admin.closeModal(planModal);
            admin.showToast("Plano salvo.");
            load();
        } catch (error) { admin.showToast(error.message, "error"); }
        finally { admin.setLoading(submit, false); }
    });

    subscriptionForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = subscriptionForm.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);
        try {
            await api.admin.saveSubscription(Object.fromEntries(new FormData(subscriptionForm)));
            admin.closeModal(subscriptionModal);
            admin.showToast("Mensalista salvo.");
            load();
        } catch (error) { admin.showToast(error.message, "error"); }
        finally { admin.setLoading(submit, false); }
    });

    load();
})();
