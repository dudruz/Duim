"use strict";

/**
 * Duplique este arquivo como env.js e preencha com os dados públicos do projeto.
 * A anon key do Supabase é pública por design e deve ser protegida por RLS.
 * Nunca coloque a service_role key no navegador.
 */
window.DuAmigoEnv = Object.freeze({
    SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
    SUPABASE_ANON_KEY: "SUA_ANON_KEY_PUBLICA",
    STORAGE_BUCKET: "product-images"
});
