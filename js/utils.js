"use strict";

window.DuAmigoUtils = (() => {
    const currencyFormatter = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

    const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

    const formatDuration = (minutes) => {
        const total = Number(minutes) || 0;
        const hours = Math.floor(total / 60);
        const remainingMinutes = total % 60;

        if (hours && remainingMinutes) return `${hours}h${String(remainingMinutes).padStart(2, "0")}`;
        if (hours) return `${hours}h`;
        return `${remainingMinutes} min`;
    };

    /**
     * Converte telefones brasileiros para o formato salvo no banco: DDD + número,
     * sem +55. Aceita entradas como 31999999999, 5531999999999 e +55 (31) 3333-4444.
     */
    const normalizeBrazilPhone = (value = "") => {
        let digits = String(value ?? "").replace(/\D/g, "");

        // Prefixo internacional discado como 00 55.
        if (digits.startsWith("0055") && digits.length >= 14) {
            digits = digits.slice(4);
        }

        // Remove o código do Brasil somente quando há um telefone completo depois dele.
        if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
            digits = digits.slice(2);
        }

        // Remove zero de longa distância eventualmente colado antes do DDD.
        if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
            digits = digits.replace(/^0+/, "");
        }

        // Proteção para valores antigos com prefixos extras.
        if (digits.length > 11) digits = digits.slice(-11);

        return digits;
    };

    const isValidBrazilPhone = (value = "") => {
        const digits = normalizeBrazilPhone(value);
        return digits.length === 10 || digits.length === 11;
    };

    const formatBrazilPhone = (value = "", fallback = "") => {
        const digits = normalizeBrazilPhone(value);
        if (!digits) return fallback;
        if (digits.length <= 2) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
        if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    };

    const toWhatsAppDigits = (value = "") => {
        const digits = normalizeBrazilPhone(value);
        return isValidBrazilPhone(digits) ? `55${digits}` : "";
    };

    const createElement = (tagName, options = {}) => {
        const element = document.createElement(tagName);
        const { className, text, attributes = {} } = options;

        if (className) element.className = className;
        if (text !== undefined) element.textContent = String(text);

        Object.entries(attributes).forEach(([name, value]) => {
            if (value !== null && value !== undefined && value !== false) {
                element.setAttribute(name, String(value));
            }
        });

        return element;
    };

    const debounce = (callback, delay = 120) => {
        let timeoutId;

        return (...args) => {
            window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => callback(...args), delay);
        };
    };

    return Object.freeze({
        formatCurrency,
        formatDuration,
        normalizeBrazilPhone,
        isValidBrazilPhone,
        formatBrazilPhone,
        toWhatsAppDigits,
        createElement,
        debounce
    });
})();
