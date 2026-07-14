"use strict";

(() => {
    const api = window.DuAmigoAPI;
    const backend = window.DuAmigoBackend;
    const page = document.body.dataset.customerAuthPage;

    if (!api || !backend || !page) return;

    const status = document.querySelector("[data-auth-status]");
    const params = new URLSearchParams(window.location.search);

    const safeRedirect = () => {
        const requested = params.get("redirect");
        if (!requested) return "minha-conta.html";

        try {
            const target = new URL(requested, window.location.href);
            if (target.origin !== window.location.origin) return "minha-conta.html";
            if (!target.pathname.includes("/pages/")) return "minha-conta.html";
            return `${target.pathname.split("/").pop()}${target.search}${target.hash}`;
        } catch {
            return "minha-conta.html";
        }
    };

    const setStatus = (message = "", type = "info") => {
        if (!status) return;
        status.hidden = !message;
        status.textContent = message;
        status.dataset.type = type;
    };

    const setLoading = (button, loading, loadingText = "Aguarde...") => {
        if (!button) return;
        if (loading) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    };

    const setError = (form, name, message = "") => {
        const field = form.elements[name];
        const element = form.querySelector(`[data-error-for="${name}"]`);
        if (field && field.type !== "checkbox") {
            field.setAttribute("aria-invalid", String(Boolean(message)));
        }
        if (element) element.textContent = message;
    };

    const formatPhone = (input) => {
        input?.addEventListener("input", () => {
            const digits = input.value.replace(/\D/g, "").slice(0, 11);
            if (digits.length <= 2) input.value = digits;
            else if (digits.length <= 7) input.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
            else input.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
        });
    };

    const friendlyError = (error) => {
        const message = String(error?.message || "");
        if (error?.name === "BackendNotConfiguredError") return window.DuAmigoConfig.backend.missingMessage;
        if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
        if (/email not confirmed/i.test(message)) return "Confirme seu e-mail antes de entrar.";
        if (/user already registered/i.test(message)) return "Este e-mail já possui cadastro. Tente entrar.";
        if (/password should be at least/i.test(message)) return "A senha precisa ter pelo menos 6 caracteres.";
        if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
        return message || "Não foi possível concluir agora. Tente novamente.";
    };

    const configurePasswordToggles = () => {
        document.querySelectorAll("[data-password-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                const input = button.closest(".password-field")?.querySelector("input");
                if (!input) return;
                const visible = input.type === "text";
                input.type = visible ? "password" : "text";
                button.textContent = visible ? "Mostrar" : "Ocultar";
                button.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
            });
        });
    };

    const keepRedirectInLinks = () => {
        const redirect = safeRedirect();
        document.querySelectorAll("[data-register-link], [data-login-link]").forEach((link) => {
            const url = new URL(link.getAttribute("href"), window.location.href);
            url.searchParams.set("redirect", redirect);
            link.setAttribute("href", `${url.pathname.split("/").pop()}${url.search}`);
        });
    };

    const handleLogin = () => {
        const form = document.querySelector("[data-login-form]");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = form.elements.email.value.trim();
            const password = form.elements.password.value;
            const button = form.querySelector('button[type="submit"]');

            setError(form, "email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Informe um e-mail válido.");
            setError(form, "password", password.length >= 6 ? "" : "Informe sua senha.");
            if (!email || password.length < 6) return;

            setStatus("");
            setLoading(button, true, "Entrando...");
            try {
                await api.auth.signIn(email, password);
                window.location.replace(safeRedirect());
            } catch (error) {
                setStatus(friendlyError(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    };

    const handleRegister = () => {
        const form = document.querySelector("[data-register-form]");
        if (!form) return;
        formatPhone(form.elements.phone);

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(form));
            const phone = String(values.phone || "").replace(/\D/g, "");
            const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email || ""));
            const valid = {
                fullName: String(values.fullName || "").trim().length >= 3,
                phone: phone.length >= 10,
                email: emailValid,
                password: String(values.password || "").length >= 6,
                passwordConfirm: values.password === values.passwordConfirm,
                privacy: Boolean(values.privacy)
            };

            setError(form, "fullName", valid.fullName ? "" : "Informe seu nome completo.");
            setError(form, "phone", valid.phone ? "" : "Informe um WhatsApp válido com DDD.");
            setError(form, "email", valid.email ? "" : "Informe um e-mail válido.");
            setError(form, "password", valid.password ? "" : "Use pelo menos 6 caracteres.");
            setError(form, "passwordConfirm", valid.passwordConfirm ? "" : "As senhas não são iguais.");
            setError(form, "privacy", valid.privacy ? "" : "Você precisa aceitar a Política de Privacidade.");
            if (!Object.values(valid).every(Boolean)) return;

            const button = form.querySelector('button[type="submit"]');
            setStatus("");
            setLoading(button, true, "Criando conta...");

            try {
                const result = await api.auth.signUp({
                    email: String(values.email).trim(),
                    password: String(values.password),
                    fullName: String(values.fullName).trim(),
                    phone
                });

                if (result.session) {
                    await api.customer.syncProfile({
                        fullName: String(values.fullName).trim(),
                        phone
                    });
                    window.location.replace(safeRedirect());
                    return;
                }

                form.reset();
                setStatus("Cadastro criado. Confira seu e-mail para confirmar a conta antes de entrar.", "success");
            } catch (error) {
                setStatus(friendlyError(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    };

    const handleRecovery = () => {
        const form = document.querySelector("[data-recovery-form]");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = form.elements.email.value.trim();
            const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            setError(form, "email", valid ? "" : "Informe um e-mail válido.");
            if (!valid) return;

            const button = form.querySelector('button[type="submit"]');
            setLoading(button, true, "Enviando...");
            setStatus("");
            try {
                const redirectTo = new URL("redefinir-senha.html", window.location.href).href;
                await api.auth.resetPassword(email, redirectTo);
                form.reset();
                setStatus("Link enviado. Verifique a caixa de entrada e também o spam.", "success");
            } catch (error) {
                setStatus(friendlyError(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    };

    const handleReset = () => {
        const form = document.querySelector("[data-reset-form]");
        if (!form) return;

        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = form.elements.password.value;
            const confirm = form.elements.passwordConfirm.value;
            setError(form, "password", password.length >= 6 ? "" : "Use pelo menos 6 caracteres.");
            setError(form, "passwordConfirm", password === confirm ? "" : "As senhas não são iguais.");
            if (password.length < 6 || password !== confirm) return;

            const button = form.querySelector('button[type="submit"]');
            setLoading(button, true, "Salvando...");
            setStatus("");
            try {
                await api.auth.updatePassword(password);
                setStatus("Senha alterada com sucesso. Redirecionando...", "success");
                window.setTimeout(() => window.location.replace("minha-conta.html"), 900);
            } catch (error) {
                setStatus(friendlyError(error), "error");
            } finally {
                setLoading(button, false);
            }
        });
    };

    const redirectExistingSession = async () => {
        if (["recovery", "reset"].includes(page)) return;
        try {
            const session = await api.auth.getSession();
            if (session) window.location.replace(safeRedirect());
        } catch {
            // A própria tela exibirá o erro ao tentar enviar.
        }
    };

    const start = () => {
        configurePasswordToggles();
        keepRedirectInLinks();
        redirectExistingSession();
        handleLogin();
        handleRegister();
        handleRecovery();
        handleReset();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
