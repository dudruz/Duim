"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const utils = window.DuAmigoUtils;

    const page = document.body.dataset.adminPage;
    const isLogin = page === "login";

    const formatDateTime = (value) => value
        ? new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short"
        }).format(new Date(value))
        : "—";

    const formatTime = (value) => value
        ? new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        }).format(new Date(value))
        : "—";

    const formatDate = (value) => value
        ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value))
        : "—";

    const statusLabels = {
        pending: "Pendente",
        confirmed: "Confirmado",
        completed: "Concluído",
        cancelled: "Cancelado",
        no_show: "Não compareceu",
        unpaid: "Pendente",
        paid: "Pago",
        refunded: "Estornado",
        active: "Ativo",
        paused: "Pausado",
        cancelled_subscription: "Cancelado"
    };


    const escapeHTML = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

    const showToast = (message, type = "success") => {
        let toast = document.querySelector("[data-admin-toast]");
        if (!toast) {
            toast = document.createElement("div");
            toast.className = "admin-toast";
            toast.dataset.adminToast = "";
            toast.setAttribute("role", "status");
            document.body.append(toast);
        }

        toast.textContent = message;
        toast.dataset.type = type;
        toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.hidden = true; }, 4500);
    };

    const setLoading = (element, loading, text = "Salvando...") => {
        if (!element) return;
        if (loading) {
            element.dataset.originalText = element.textContent;
            element.textContent = text;
            element.disabled = true;
        } else {
            element.textContent = element.dataset.originalText || element.textContent;
            element.disabled = false;
        }
    };

    const openModal = (selectorOrElement) => {
        const dialog = typeof selectorOrElement === "string"
            ? document.querySelector(selectorOrElement)
            : selectorOrElement;
        dialog?.showModal();
        return dialog;
    };

    const closeModal = (selectorOrElement) => {
        const dialog = typeof selectorOrElement === "string"
            ? document.querySelector(selectorOrElement)
            : selectorOrElement;
        dialog?.close();
    };

    const bindShell = () => {
        const shell = document.querySelector("[data-admin-shell]");
        const menuButton = document.querySelector("[data-admin-menu]");
        const backdrop = document.querySelector("[data-admin-backdrop]");

        const closeMenu = () => shell?.classList.remove("is-menu-open");
        menuButton?.addEventListener("click", () => shell?.classList.toggle("is-menu-open"));
        backdrop?.addEventListener("click", closeMenu);

        document.querySelectorAll("[data-close-modal]").forEach((button) => {
            button.addEventListener("click", () => closeModal(button.closest("dialog")));
        });

        document.querySelectorAll("dialog").forEach((dialog) => {
            dialog.addEventListener("click", (event) => {
                if (event.target === dialog) closeModal(dialog);
            });
        });
    };

    const markCurrentNavigation = () => {
        document.querySelectorAll("[data-admin-nav]").forEach((link) => {
            if (link.dataset.adminNav === page) link.setAttribute("aria-current", "page");
        });
    };

    const guard = async () => {
        if (isLogin) return null;
        try {
            const auth = await api.auth.requireAdmin();
            document.querySelectorAll("[data-admin-name]").forEach((element) => {
                element.textContent = auth.profile.full_name || auth.user.email || "Duin";
            });
            document.querySelectorAll("[data-admin-email]").forEach((element) => {
                element.textContent = auth.user.email || "";
            });
            document.documentElement.classList.add("admin-ready");
            return auth;
        } catch (error) {
            const destination = new URL("login.html", window.location.href);
            destination.searchParams.set("redirect", window.location.pathname.split("/").pop() || "dashboard.html");
            window.location.replace(destination);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await api.auth.signOut();
        } finally {
            window.location.replace("login.html");
        }
    };

    const init = async () => {
        bindShell();
        markCurrentNavigation();
        document.querySelector("[data-admin-logout]")?.addEventListener("click", logout);
        if (!isLogin) await guard();
    };

    window.DuAmigoAdmin = Object.freeze({
        initPromise: init(),
        formatCurrency: utils?.formatCurrency || ((value) => String(value)),
        formatDateTime,
        formatTime,
        formatDate,
        statusLabel: (status) => statusLabels[status] || status || "—",
        escapeHTML,
        showToast,
        setLoading,
        openModal,
        closeModal
    });
})();
