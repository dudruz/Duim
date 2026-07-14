"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const grid = document.querySelector("[data-services-admin]");
    const modal = document.querySelector("[data-service-modal]");
    const form = document.querySelector("[data-service-form]");
    let services = [];

    const slugify = (value) => value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const render = () => {
        grid.replaceChildren();

        if (!services.length) {
            grid.innerHTML = '<div class="admin-empty">Nenhum serviço cadastrado.</div>';
            return;
        }

        services.forEach((service) => {
            const card = document.createElement("article");
            card.className = "management-card";
            card.innerHTML = `
                <div class="management-card__top">
                    <div>
                        <span class="status-badge ${service.active ? "status-badge--confirmed" : "status-badge--cancelled"}">${service.active ? "Ativo" : "Inativo"}</span>
                        ${service.featured ? '<span class="status-badge status-badge--pending">Destaque</span>' : ""}
                    </div>
                    <strong>${admin.formatCurrency(service.price)}</strong>
                </div>
                <h3>${esc(service.name)}</h3>
                <p>${esc(service.description || "Sem descrição.")}</p>
                <div class="management-card__meta">
                    <span>${service.duration_minutes} min</span>
                    <span>Ordem ${service.position}</span>
                </div>
                <div class="management-card__actions">
                    <button class="button button--small button--secondary" type="button" data-edit-service="${service.id}">Editar</button>
                    <button class="danger-link" type="button" data-delete-service="${service.id}">Excluir</button>
                </div>
            `;
            grid.append(card);
        });

        grid.querySelectorAll("[data-edit-service]").forEach((button) => {
            button.addEventListener("click", () => edit(services.find((item) => item.id === button.dataset.editService)));
        });

        grid.querySelectorAll("[data-delete-service]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (!confirm("Excluir este serviço? Agendamentos existentes continuarão preservados.")) return;
                try {
                    await api.admin.deleteService(button.dataset.deleteService);
                    admin.showToast("Serviço excluído.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });
    };

    const edit = (service = null) => {
        form.reset();
        form.elements.id.value = service?.id || "";
        form.elements.name.value = service?.name || "";
        form.elements.slug.value = service?.slug || "";
        form.elements.description.value = service?.description || "";
        form.elements.duration_minutes.value = service?.duration_minutes || 40;
        form.elements.price.value = service?.price ?? "";
        form.elements.position.value = service?.position || 0;
        form.elements.icon_path.value = service?.icon_path || "assets/icons/scissors.svg";
        form.elements.active.checked = service?.active ?? true;
        form.elements.featured.checked = service?.featured ?? false;
        admin.openModal(modal);
    };

    const load = async () => {
        try {
            services = await api.admin.getServices();
            render();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    document.querySelector("[data-new-service]")?.addEventListener("click", () => edit());
    form.elements.name.addEventListener("input", () => {
        if (!form.elements.id.value || !form.elements.slug.value) {
            form.elements.slug.value = slugify(form.elements.name.value);
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);

        const payload = Object.fromEntries(new FormData(form));
        payload.active = form.elements.active.checked;
        payload.featured = form.elements.featured.checked;

        try {
            await api.admin.saveService(payload);
            admin.closeModal(modal);
            admin.showToast("Serviço salvo.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    load();
})();
