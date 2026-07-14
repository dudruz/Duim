"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;
    const config = window.DuAmigoConfig;

    if (!api || !utils || !config) return;

    const elements = {
        list: document.querySelector("[data-catalog-list]"),
        empty: document.querySelector("[data-catalog-empty]"),
        search: document.querySelector("[data-product-search]"),
        clearSearch: document.querySelector("[data-clear-search]"),
        filters: document.querySelector("[data-product-filters]"),
        count: document.querySelector("[data-product-count]"),
        countLabel: document.querySelector("[data-product-count-label]"),
        reset: document.querySelector("[data-reset-catalog]"),
        dialog: document.querySelector("[data-product-dialog]"),
        toast: document.querySelector("[data-site-toast]")
    };

    if (!elements.list) return;

    const state = {
        products: [],
        filtered: [],
        category: "Todos",
        search: "",
        settings: null
    };

    const showToast = (message) => {
        if (!elements.toast) return;
        elements.toast.textContent = message;
        elements.toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 4200);
    };

    const productImage = (product) => utils.resolveAssetUrl(
        product.image_url,
        "assets/images/product-placeholder.svg"
    );

    const createCard = (product) => {
        const article = document.createElement("article");
        article.className = "catalog-card";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "catalog-card__button";
        button.setAttribute("aria-label", `Ver detalhes de ${product.name}`);

        const media = document.createElement("span");
        media.className = "catalog-card__media";
        const image = document.createElement("img");
        image.src = productImage(product);
        image.alt = product.name;
        image.loading = "lazy";
        media.append(image);

        const content = document.createElement("span");
        content.className = "catalog-card__content";
        const category = document.createElement("span");
        category.className = "catalog-tag";
        category.textContent = product.category;
        const title = document.createElement("strong");
        title.className = "catalog-card__title";
        title.textContent = product.name;
        const description = document.createElement("span");
        description.className = "catalog-card__description";
        description.textContent = product.description || "Consulte os detalhes do produto.";
        const footer = document.createElement("span");
        footer.className = "catalog-card__footer";
        const price = document.createElement("strong");
        price.textContent = utils.formatCurrency(product.price);
        const availability = document.createElement("span");
        availability.className = `availability-badge${product.stock_status === "available" ? "" : " is-unavailable"}`;
        availability.textContent = product.stock_status === "available" ? "Disponível" : "Em reposição";
        footer.append(price, availability);
        content.append(category, title, description, footer);
        button.append(media, content);
        button.addEventListener("click", () => openDialog(product));
        article.append(button);
        return article;
    };

    const renderFilters = () => {
        const categories = ["Todos", ...new Set(state.products.map((product) => product.category).filter(Boolean))];
        elements.filters.replaceChildren();

        categories.forEach((category) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "filter-chip";
            button.textContent = category;
            button.classList.toggle("is-active", category === state.category);
            button.setAttribute("aria-pressed", String(category === state.category));
            button.addEventListener("click", () => {
                state.category = category;
                renderFilters();
                applyFilters();
            });
            elements.filters.append(button);
        });
    };

    const applyFilters = () => {
        const term = state.search.trim().toLowerCase();
        state.filtered = state.products.filter((product) => {
            const categoryMatches = state.category === "Todos" || product.category === state.category;
            const searchMatches = !term || [
                product.name,
                product.category,
                product.description,
                product.details
            ].filter(Boolean).some((value) => value.toLowerCase().includes(term));
            return categoryMatches && searchMatches;
        });
        renderProducts();
    };

    const renderProducts = () => {
        elements.list.replaceChildren();
        const count = state.filtered.length;
        elements.count.textContent = String(count);
        elements.countLabel.textContent = count === 1 ? "produto encontrado" : "produtos encontrados";
        elements.empty.hidden = count > 0;
        elements.list.hidden = count === 0;

        const fragment = document.createDocumentFragment();
        state.filtered.forEach((product) => fragment.append(createCard(product)));
        elements.list.append(fragment);
    };

    const fillDialog = (product) => {
        elements.dialog.querySelector("[data-dialog-image]").src = productImage(product);
        elements.dialog.querySelector("[data-dialog-image]").alt = product.name;
        elements.dialog.querySelector("[data-dialog-category]").textContent = product.category || "Produto";
        elements.dialog.querySelector("[data-dialog-badge]").textContent = product.featured ? "Destaque" : "";
        elements.dialog.querySelector("[data-dialog-title]").textContent = product.name;
        elements.dialog.querySelector("[data-dialog-description]").textContent = product.description || "";
        elements.dialog.querySelector("[data-dialog-details]").textContent = product.details || "";
        elements.dialog.querySelector("[data-dialog-price]").textContent = utils.formatCurrency(product.price);

        const availability = elements.dialog.querySelector("[data-dialog-availability]");
        availability.textContent = product.stock_status === "available" ? "Disponível" : "Em reposição";
        availability.classList.toggle("is-unavailable", product.stock_status !== "available");

        const whatsappButton = elements.dialog.querySelector("[data-dialog-whatsapp]");
        whatsappButton.disabled = product.stock_status !== "available";
        whatsappButton.onclick = () => contactProduct(product);
    };

    const openDialog = (product) => {
        fillDialog(product);
        elements.dialog.showModal();
        const url = new URL(window.location.href);
        url.searchParams.set("produto", product.id);
        history.replaceState({}, "", url);
    };

    const closeDialog = () => {
        elements.dialog.close();
        const url = new URL(window.location.href);
        url.searchParams.delete("produto");
        history.replaceState({}, "", url);
    };

    const contactProduct = (product) => {
        const digits = utils.toWhatsAppDigits(state.settings?.phone_digits || state.settings?.phone_display || config.business.phoneDigits);
        if (!digits) {
            showToast("Cadastre o WhatsApp da barbearia no painel para ativar esta consulta.");
            return;
        }

        const message = encodeURIComponent(`Olá! Tenho interesse no produto "${product.name}" da Barbearia du Amigo.`);
        window.open(`https://wa.me/${digits}?text=${message}`, "_blank", "noopener,noreferrer");
    };

    const load = async () => {
        try {
            const [products, settings] = await Promise.all([
                api.public.getProducts(),
                api.public.getSettings()
            ]);
            state.products = products || [];
            state.filtered = [...state.products];
            state.settings = settings;
            renderFilters();
            applyFilters();

            const selectedId = new URLSearchParams(location.search).get("produto");
            const selected = state.products.find((product) => product.id === selectedId || product.slug === selectedId);
            if (selected) openDialog(selected);
        } catch (error) {
            state.products = [];
            state.filtered = [];
            renderFilters();
            renderProducts();
            const message = error?.name === "BackendNotConfiguredError"
                ? config.backend.missingMessage
                : config.backend.genericError;
            elements.empty.hidden = false;
            elements.empty.querySelector("h3").textContent = "Catálogo indisponível.";
            elements.empty.querySelector("p").textContent = message;
            console.error(error);
        }
    };

    elements.search?.addEventListener("input", () => {
        state.search = elements.search.value;
        elements.clearSearch.hidden = !state.search;
        applyFilters();
    });

    elements.clearSearch?.addEventListener("click", () => {
        elements.search.value = "";
        state.search = "";
        elements.clearSearch.hidden = true;
        applyFilters();
        elements.search.focus();
    });

    elements.reset?.addEventListener("click", () => {
        state.category = "Todos";
        state.search = "";
        elements.search.value = "";
        renderFilters();
        applyFilters();
    });

    elements.dialog?.querySelectorAll("[data-close-product]").forEach((button) => {
        button.addEventListener("click", closeDialog);
    });
    elements.dialog?.addEventListener("click", (event) => {
        if (event.target === elements.dialog) closeDialog();
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", load, { once: true });
    } else {
        load();
    }
})();
