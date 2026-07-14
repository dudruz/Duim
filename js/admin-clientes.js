"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;
    const utils = window.DuAmigoUtils;

    const tbody = document.querySelector("[data-customers-body]");
    const search = document.querySelector("[data-customer-search]");
    const modal = document.querySelector("[data-customer-modal]");
    const form = document.querySelector("[data-customer-form]");
    let customers = [];

    const render = () => {
        tbody.replaceChildren();

        if (!customers.length) {
            tbody.innerHTML = '<tr><td colspan="5"><div class="admin-empty">Nenhum cliente encontrado.</div></td></tr>';
            return;
        }

        customers.forEach((customer) => {
            const completed = (customer.appointments || []).filter((item) => item.status === "completed");
            const latest = [...(customer.appointments || [])].sort((a, b) =>
                new Date(b.starts_at) - new Date(a.starts_at)
            )[0];

            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${esc(customer.nickname || customer.name)}</strong><span>${esc(customer.name)} · ${esc(customer.email || "Sem e-mail")}</span></td>
                <td>${esc(utils.formatBrazilPhone(customer.phone, "Sem telefone"))}</td>
                <td>${completed.length}</td>
                <td>${latest ? admin.formatDateTime(latest.starts_at) : "Nunca"}</td>
                <td><button class="table-action" type="button" data-edit-customer="${customer.id}">Editar</button></td>
            `;
            tbody.append(row);
        });

        tbody.querySelectorAll("[data-edit-customer]").forEach((button) => {
            button.addEventListener("click", () => {
                const customer = customers.find((item) => item.id === button.dataset.editCustomer);
                form.elements.id.value = customer.id;
                form.elements.name.value = customer.name || "";
                form.elements.nickname.value = customer.nickname || "";
                form.elements.phone.value = utils.formatBrazilPhone(customer.phone);
                form.elements.birth_date.value = customer.birth_date || "";
                form.elements.email.value = customer.email || "";
                form.elements.style_preferences.value = customer.style_preferences || "";
                form.elements.notes.value = customer.notes || "";
                admin.openModal(modal);
            });
        });
    };

    const load = async () => {
        try {
            customers = await api.admin.getCustomers(search.value.trim());
            render();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    document.querySelector("[data-new-customer]")?.addEventListener("click", () => {
        form.reset();
        form.elements.id.value = "";
        admin.openModal(modal);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);

        try {
            await api.admin.saveCustomer(Object.fromEntries(new FormData(form)));
            admin.closeModal(modal);
            admin.showToast("Cliente salvo.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    search.addEventListener("input", () => {
        clearTimeout(search.timer);
        search.timer = setTimeout(load, 300);
    });

    load();
})();
