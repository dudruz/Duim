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
        createElement,
        debounce
    });
})();
