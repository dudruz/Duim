"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const plansGrid = document.querySelector("[data-plans-grid]");
    const subscriptionsBody = document.querySelector("[data-subscriptions-body]");
    const planModal = document.querySelector("[data-plan-modal]");
    const planForm = document.querySelector("[data-plan-form]");
    const subscriptionModal = document.querySelector("[data-subscription-modal]");
    const subscriptionForm = document.querySelector("[data-subscription-form]");
    let plans = [];
    let subscriptions = [];
    let customers = [];

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
                <div class="management-card__meta">
                    <span>${plan.cuts_included} usos</span>
                    <span>${esc(plan.billing_cycle)}</span>
                </div>
                <div class="management-card__actions">
                    <button class="button button--small button--secondary" type="button" data-edit-plan="${plan.id}">Editar</button>
                </div>
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
                <td><strong>${esc(subscription.customers?.name || "Cliente")}</strong><span>${esc(subscription.customers?.phone || "")}</span></td>
                <td>${esc(subscription.plans?.name || "Plano")}</td>
                <td>${admin.formatDate(subscription.starts_on)}</td>
                <td>${subscription.ends_on ? admin.formatDate(subscription.ends_on) : "Sem fim"}</td>
                <td><input class="table-number-input" type="number" min="0" value="${subscription.remaining_uses}" data-uses-id="${subscription.id}" aria-label="Usos restantes"></td>
                <td>
                    <select data-subscription-status="${subscription.id}" aria-label="Status da assinatura">
                        <option value="active" ${subscription.status === "active" ? "selected" : ""}>Ativo</option>
                        <option value="paused" ${subscription.status === "paused" ? "selected" : ""}>Pausado</option>
                        <option value="cancelled" ${subscription.status === "cancelled" ? "selected" : ""}>Cancelado</option>
                    </select>
                </td>
            `;
            subscriptionsBody.append(row);
        });

        subscriptionsBody.querySelectorAll("[data-subscription-status]").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await api.admin.updateSubscription(select.dataset.subscriptionStatus, {
                        status: select.value
                    });
                    admin.showToast("Status do mensalista atualizado.");
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });

        subscriptionsBody.querySelectorAll("[data-uses-id]").forEach((input) => {
            input.addEventListener("change", async () => {
                try {
                    await api.admin.updateSubscription(input.dataset.usesId, {
                        remaining_uses: Math.max(0, Number(input.value || 0))
                    });
                    admin.showToast("Quantidade de usos atualizada.");
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
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

        customers.forEach((customer) => {
            customerSelect.insertAdjacentHTML("beforeend", `<option value="${customer.id}">${customer.name} · ${customer.phone}</option>`);
        });
        plans.filter((plan) => plan.active).forEach((plan) => {
            planSelect.insertAdjacentHTML("beforeend", `<option value="${plan.id}">${esc(plan.name)}</option>`);
        });
    };

    const load = async () => {
        try {
            [plans, subscriptions, customers] = await Promise.all([
                api.admin.getPlans(),
                api.admin.getSubscriptions(),
                api.admin.getCustomers()
            ]);
            renderPlans();
            renderSubscriptions();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

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
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
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
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    load();
})();
