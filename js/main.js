"use strict";

(() => {
    const config = window.DuAmigoConfig;
    const utils = window.DuAmigoUtils;

    if (!config || !utils) {
        console.error("A configuração principal do site não foi carregada.");
        return;
    }

    const body = document.body;
    const header = document.querySelector("[data-header]");
    const menu = document.querySelector("[data-menu]");
    const menuToggle = document.querySelector("[data-menu-toggle]");
    const navigationLinks = [...document.querySelectorAll('.main-nav a[href^="#"]')];

    const setText = (selector, value, fallback = "") => {
        document.querySelectorAll(selector).forEach((element) => {
            element.textContent = value || fallback;
        });
    };

    const applyBusinessInformation = (business) => {
        setText("[data-business-name]", business.name, config.business.name);
        setText("[data-barber-name]", business.barberName, config.business.barberName);
        setText("[data-business-address]", business.address, config.business.address);
        setText("[data-business-phone]", business.phoneDisplay, "Ainda não informado");
        setText("[data-business-hours]", business.openingHours, "Consulte a agenda online");
        setText("[data-current-year]", String(new Date().getFullYear()));

        document.querySelectorAll("[data-business-map]").forEach((link) => {
            link.href = business.mapUrl || config.business.mapUrl;
        });

        document.querySelectorAll("[data-business-phone-link]").forEach((link) => {
            if (!business.phoneDigits) {
                link.removeAttribute("href");
                link.setAttribute("aria-disabled", "true");
                link.classList.add("is-disabled");
                return;
            }

            link.href = `https://wa.me/55${business.phoneDigits}`;
            link.removeAttribute("aria-disabled");
            link.classList.remove("is-disabled");
        });
    };

    const loadRemoteBusinessInformation = async () => {
        applyBusinessInformation(config.business);

        if (!window.DuAmigoBackend?.isConfigured() || !window.DuAmigoAPI) return;

        try {
            const settings = await window.DuAmigoAPI.public.getSettings();
            if (!settings) return;

            applyBusinessInformation({
                name: settings.business_name,
                barberName: settings.barber_name,
                address: settings.address,
                phoneDisplay: settings.phone_display,
                phoneDigits: settings.phone_digits,
                openingHours: settings.opening_hours_text,
                mapUrl: settings.map_url,
                instagramUrl: settings.instagram_url
            });
        } catch (error) {
            console.warn("Não foi possível atualizar as informações públicas.", error);
        }
    };


    const configureCustomerEntry = async () => {
        const links = [...document.querySelectorAll("[data-customer-entry]")];
        if (!links.length) return;

        links.forEach((link) => {
            link.textContent = "Entrar";
        });

        if (!window.DuAmigoBackend?.isConfigured() || !window.DuAmigoAPI) return;

        try {
            const session = await window.DuAmigoAPI.auth.getSession();
            links.forEach((link) => {
                link.textContent = session ? "Minha conta" : "Entrar";
                const inPagesDirectory = /\/pages\/[^/]+$/i.test(window.location.pathname);
                const prefix = inPagesDirectory ? "" : "pages/";
                link.href = session ? `${prefix}minha-conta.html` : `${prefix}login.html`;
            });
        } catch (error) {
            console.warn("Não foi possível verificar a sessão do cliente.", error);
        }
    };

    const setMenuState = (isOpen) => {
        if (!menu || !menuToggle) return;

        menuToggle.setAttribute("aria-expanded", String(isOpen));
        menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
        menu.classList.toggle("is-open", isOpen);
        body.classList.toggle("menu-is-open", isOpen);
    };

    const closeMenu = () => setMenuState(false);

    const configureNavigation = () => {
        if (!menu || !menuToggle) return;

        menuToggle.addEventListener("click", () => {
            setMenuState(menuToggle.getAttribute("aria-expanded") !== "true");
        });

        menu.addEventListener("click", (event) => {
            if (event.target.closest("a")) closeMenu();
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closeMenu();
                menuToggle.focus();
            }
        });

        document.addEventListener("click", (event) => {
            if (
                menuToggle.getAttribute("aria-expanded") === "true"
                && !menu.contains(event.target)
                && !menuToggle.contains(event.target)
            ) {
                closeMenu();
            }
        });

        window.addEventListener("resize", utils.debounce(() => {
            if (window.innerWidth > 900) closeMenu();
        }));
    };

    const updateHeader = () => {
        if (!header) return;
        header.classList.toggle("is-scrolled", window.scrollY > 12);
    };

    const configureHeader = () => {
        updateHeader();
        window.addEventListener("scroll", updateHeader, { passive: true });
    };

    const configureSectionObserver = () => {
        if (!("IntersectionObserver" in window) || navigationLinks.length === 0) return;

        const linksBySection = new Map(
            navigationLinks.map((link) => [link.getAttribute("href").slice(1), link])
        );

        const sections = [...linksBySection.keys()]
            .map((id) => document.getElementById(id))
            .filter(Boolean);

        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

            if (!visible) return;

            navigationLinks.forEach((link) => link.classList.remove("is-active"));
            linksBySection.get(visible.target.id)?.classList.add("is-active");
        }, {
            rootMargin: "-30% 0px -55%",
            threshold: [0.1, 0.35, 0.6]
        });

        sections.forEach((section) => observer.observe(section));
    };

    const configureInternalAnchors = () => {
        document.addEventListener("click", (event) => {
            const link = event.target.closest('a[href^="#"]');
            if (!link) return;

            const target = document.querySelector(link.getAttribute("href"));
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start"
            });
        });
    };

    const start = () => {
        loadRemoteBusinessInformation();
        configureCustomerEntry();
        configureNavigation();
        configureHeader();
        configureSectionObserver();
        configureInternalAnchors();
        document.documentElement.classList.add("js-ready");
        document.dispatchEvent(new CustomEvent("duamigo:ready"));
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
