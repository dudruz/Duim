"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const esc = admin.escapeHTML;

    const grid = document.querySelector("[data-products-admin]");
    const modal = document.querySelector("[data-product-admin-modal]");
    const form = document.querySelector("[data-product-admin-form]");
    const imageInput = form.elements.image_file;
    let products = [];

    const slugify = (value) => value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const render = () => {
        grid.replaceChildren();

        if (!products.length) {
            grid.innerHTML = '<div class="admin-empty">Nenhum produto cadastrado.</div>';
            return;
        }

        products.forEach((product) => {
            const safeImage = /^https:\/\//i.test(product.image_url || "")
                ? product.image_url
                : "../assets/images/product-placeholder.svg";
            const card = document.createElement("article");
            card.className = "product-management-card";
            card.innerHTML = `
                <img src="${esc(safeImage)}" alt="${esc(product.name)}">
                <div class="product-management-card__content">
                    <div class="management-card__top">
                        <span class="status-badge ${product.stock_status === "available" ? "status-badge--confirmed" : "status-badge--pending"}">${product.stock_status === "available" ? "Disponível" : product.stock_status === "out_of_stock" ? "Em reposição" : "Oculto"}</span>
                        <strong>${admin.formatCurrency(product.price)}</strong>
                    </div>
                    <h3>${esc(product.name)}</h3>
                    <p>${esc(product.category)}</p>
                    <div class="management-card__actions">
                        <button class="button button--small button--secondary" type="button" data-edit-product="${product.id}">Editar</button>
                        <button class="danger-link" type="button" data-delete-product="${product.id}">Excluir</button>
                    </div>
                </div>
            `;
            grid.append(card);
        });

        grid.querySelectorAll("[data-edit-product]").forEach((button) => {
            button.addEventListener("click", () => edit(products.find((item) => item.id === button.dataset.editProduct)));
        });

        grid.querySelectorAll("[data-delete-product]").forEach((button) => {
            button.addEventListener("click", async () => {
                if (!confirm("Excluir este produto?")) return;
                try {
                    await api.admin.deleteProduct(button.dataset.deleteProduct);
                    admin.showToast("Produto excluído.");
                    load();
                } catch (error) {
                    admin.showToast(error.message, "error");
                }
            });
        });
    };

    const edit = (product = null) => {
        form.reset();
        form.elements.id.value = product?.id || "";
        form.elements.name.value = product?.name || "";
        form.elements.slug.value = product?.slug || "";
        form.elements.category.value = product?.category || "";
        form.elements.description.value = product?.description || "";
        form.elements.details.value = product?.details || "";
        form.elements.price.value = product?.price ?? "";
        form.elements.stock_status.value = product?.stock_status || "available";
        form.elements.position.value = product?.position || 0;
        form.elements.image_url.value = product?.image_url || "";
        form.elements.active.checked = product?.active ?? true;
        form.elements.featured.checked = product?.featured ?? false;
        admin.openModal(modal);
    };

    const load = async () => {
        try {
            products = await api.admin.getProducts();
            render();
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    document.querySelector("[data-new-product]")?.addEventListener("click", () => edit());

    form.elements.name.addEventListener("input", () => {
        if (!form.elements.id.value || !form.elements.slug.value) {
            form.elements.slug.value = slugify(form.elements.name.value);
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);

        try {
            let imageUrl = form.elements.image_url.value.trim();
            if (imageInput.files[0]) {
                const file = imageInput.files[0];
                const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
                if (!allowedTypes.includes(file.type)) {
                    throw new Error("Use uma imagem JPG, PNG ou WEBP.");
                }
                if (file.size > 5 * 1024 * 1024) {
                    throw new Error("A imagem deve ter no máximo 5 MB.");
                }

                submit.textContent = "Enviando imagem...";
                imageUrl = await api.admin.uploadProductImage(file);
            }

            const payload = Object.fromEntries(new FormData(form));
            payload.image_url = imageUrl;
            payload.active = form.elements.active.checked;
            payload.featured = form.elements.featured.checked;

            await api.admin.saveProduct(payload);
            admin.closeModal(modal);
            admin.showToast("Produto salvo.");
            load();
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    load();
})();
