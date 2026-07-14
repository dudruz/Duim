"use strict";

(() => {
    class BackendNotConfiguredError extends Error {
        constructor() {
            super("Supabase não configurado.");
            this.name = "BackendNotConfiguredError";
        }
    }

    const env = window.DuAmigoEnv || {};
    let client = null;

    const isConfigured = () => Boolean(
        env.SUPABASE_URL
        && env.SUPABASE_ANON_KEY
        && /^https:\/\/.+\.supabase\.co$/i.test(env.SUPABASE_URL)
        && window.supabase?.createClient
    );

    const getClient = () => {
        if (!isConfigured()) {
            throw new BackendNotConfiguredError();
        }

        if (!client) {
            client = window.supabase.createClient(
                env.SUPABASE_URL,
                env.SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    },
                    global: {
                        headers: { "x-application-name": "barbearia-du-amigo" }
                    }
                }
            );
        }

        return client;
    };

    window.DuAmigoBackend = Object.freeze({
        BackendNotConfiguredError,
        isConfigured,
        getClient,
        storageBucket: env.STORAGE_BUCKET || "product-images"
    });
})();
