"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const backend = window.DuAmigoBackend;
    const form = document.querySelector("[data-login-form]");
    const message = document.querySelector("[data-login-message]");
    const submit = form?.querySelector('button[type="submit"]');

    if (!form) return;

    const setMessage = (text, type = "error") => {
        message.textContent = text;
        message.dataset.type = type;
        message.hidden = !text;
    };

    const redirectTarget = () => {
        const target = new URLSearchParams(location.search).get("redirect");
        return target && /^[a-z0-9-]+\.html$/i.test(target) ? target : "dashboard.html";
    };

    const checkSession = async () => {
        if (!backend.isConfigured()) {
            setMessage("Preencha js/env.js com a URL e a anon key do Supabase antes de acessar o painel.");
            submit.disabled = true;
            return;
        }

        try {
            await api.auth.requireAdmin();
            window.location.replace(redirectTarget());
        } catch {
            // O formulário permanece disponível para login.
        }
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("");
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;

        if (!email || !password) {
            setMessage("Informe e-mail e senha.");
            return;
        }

        submit.disabled = true;
        submit.textContent = "Entrando...";

        try {
            await api.auth.signIn(email, password);
            await api.auth.requireAdmin();
            window.location.replace(redirectTarget());
        } catch (error) {
            await api.auth.signOut().catch(() => {});
            setMessage(error?.message || "E-mail ou senha inválidos.");
        } finally {
            submit.disabled = false;
            submit.textContent = "Entrar no painel";
        }
    });

    checkSession();
})();
