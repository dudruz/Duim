"use strict";

(async () => {
    const api = window.DuAmigoAPI;
    const admin = window.DuAmigoAdmin;
    await admin.initPromise;
    const utils = window.DuAmigoUtils;

    const form = document.querySelector("[data-settings-form]");
    let settings = null;

    const load = async () => {
        try {
            settings = await api.admin.getSettings();
            Object.entries(settings).forEach(([key, value]) => {
                const field = form.elements[key];
                if (!field) return;
                if (field.type === "checkbox") field.checked = Boolean(value);
                else field.value = value ?? "";
            });
        } catch (error) {
            admin.showToast(error.message, "error");
        }
    };

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        admin.setLoading(submit, true);

        const payload = Object.fromEntries(new FormData(form));
        payload.id = settings.id;
        payload.accepting_bookings = form.elements.accepting_bookings.checked;
        payload.store_enabled = form.elements.store_enabled.checked;
        payload.online_payments_enabled = form.elements.online_payments_enabled.checked;
        payload.subscription_sales_enabled = form.elements.subscription_sales_enabled.checked;
        payload.booking_window_days = Number(payload.booking_window_days || 30);
        payload.booking_notice_minutes = Number(payload.booking_notice_minutes || 0);
        payload.cancellation_notice_hours = Number(payload.cancellation_notice_hours || 0);
        payload.slot_interval_minutes = Number(payload.slot_interval_minutes || 10);
        payload.online_payment_hold_minutes = Number(payload.online_payment_hold_minutes || 15);
        payload.phone_digits = utils.normalizeBrazilPhone(payload.phone_digits || payload.phone_display);
        if (payload.phone_digits && !utils.isValidBrazilPhone(payload.phone_digits)) {
            admin.showToast("Informe um WhatsApp válido com DDD.", "error");
            admin.setLoading(submit, false);
            return;
        }
        payload.phone_display = utils.formatBrazilPhone(payload.phone_digits);

        try {
            settings = await api.admin.saveSettings(payload);
            admin.showToast("Configurações salvas.");
        } catch (error) {
            admin.showToast(error.message, "error");
        } finally {
            admin.setLoading(submit, false);
        }
    });

    load();
})();
