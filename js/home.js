"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const config = window.DuAmigoConfig;
    const utils = window.DuAmigoUtils;

    if (!api || !config || !utils) return;

    const asset = (path, fallback) => path || fallback;

    const createServiceCard = (service) => {
        const article = utils.createElement("article", { className: "service-card" });
        const iconWrap = utils.createElement("div", { className: "service-card__icon" });
        const icon = utils.createElement("img", {
            attributes: {
                src: asset(service.icon_path, "assets/icons/scissors.svg"),
                alt: "",
                width: "26",
                height: "26",
                loading: "lazy"
            }
        });
        const title = utils.createElement("h3", { text: service.name });
        const description = utils.createElement("p", {
            className: "service-card__description",
            text: service.description || "Consulte os detalhes ao agendar."
        });
        const details = utils.createElement("div", { className: "service-card__details" });
        const duration = utils.createElement("span", {
            text: utils.formatDuration(service.duration_minutes)
        });
        const price = utils.createElement("strong", {
            text: utils.formatCurrency(service.price)
        });
        const action = utils.createElement("a", {
            className: "text-link",
            text: "Escolher serviço",
            attributes: { href: `${config.routes.booking}?servico=${encodeURIComponent(service.id)}` }
        });

        iconWrap.append(icon);
        details.append(duration, price);
        article.append(iconWrap, title, description, details, action);
        return article;
    };

    const createProductCard = (product) => {
        const article = utils.createElement("article", { className: "product-card" });
        const media = utils.createElement("div", { className: "product-card__media" });
        const image = utils.createElement("img", {
            attributes: {
                src: asset(product.image_url, "assets/images/product-placeholder.svg"),
                alt: product.name,
                width: "360",
                height: "260",
                loading: "lazy"
            }
        });
        const content = utils.createElement("div", { className: "product-card__content" });
        const status = utils.createElement("span", {
            className: "product-card__status",
            text: product.stock_status === "available" ? "Disponível" : "Em reposição"
        });
        const title = utils.createElement("h3", { text: product.name });
        const description = utils.createElement("p", {
            text: product.description || "Consulte mais detalhes no catálogo."
        });
        const footer = utils.createElement("div", { className: "product-card__footer" });
        const price = utils.createElement("strong", {
            text: utils.formatCurrency(product.price)
        });
        const link = utils.createElement("a", {
            className: "text-link",
            text: "Ver produto",
            attributes: { href: `${config.routes.store}?produto=${encodeURIComponent(product.id)}` }
        });

        media.append(image);
        footer.append(price, link);
        content.append(status, title, description, footer);
        article.append(media, content);
        return article;
    };

    const renderCollection = (selector, items, renderer, emptyMessage) => {
        const container = document.querySelector(selector);
        if (!container) return;

        container.replaceChildren();

        if (!items?.length) {
            container.append(utils.createElement("p", {
                className: "empty-message",
                text: emptyMessage
            }));
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach((item) => fragment.append(renderer(item)));
        container.append(fragment);
    };

    const load = async () => {
        try {
            let [services, products] = await Promise.all([
                api.public.getServices({ featuredOnly: true }),
                api.public.getProducts({ featuredOnly: true })
            ]);

            if (!services.length) services = (await api.public.getServices()).slice(0, 3);
            if (!products.length) products = (await api.public.getProducts()).slice(0, 3);

            renderCollection(
                "[data-services-list]",
                services,
                createServiceCard,
                "Nenhum serviço publicado no momento."
            );
            renderCollection(
                "[data-products-list]",
                products.slice(0, 3),
                createProductCard,
                "O catálogo ainda não possui produtos publicados."
            );
        } catch (error) {
            const message = error?.name === "BackendNotConfiguredError"
                ? config.backend.missingMessage
                : config.backend.genericError;

            renderCollection("[data-services-list]", [], createServiceCard, message);
            renderCollection("[data-products-list]", [], createProductCard, message);
            console.error(error);
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", load, { once: true });
    } else {
        load();
    }
})();
