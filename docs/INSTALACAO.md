# Instalação do projeto

## 1. Publicação local

Abra a pasta no VS Code e use o Live Server. O projeto usa caminhos relativos e não exige build.

## 2. Criar o projeto Supabase

Crie um projeto e execute as migrações da pasta `supabase/migrations/` na ordem numérica, incluindo a automação financeira da migração 005.

## 3. Criar o administrador

Crie um usuário com e-mail e senha no Supabase Authentication. Depois execute uma cópia de `supabase/bootstrap-admin.sql.example` com o UUID correto.

## 4. Conectar o front

Abra `js/env.js` e preencha:

```js
window.DuAmigoEnv = Object.freeze({
    SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
    SUPABASE_ANON_KEY: "SUA_ANON_KEY_PUBLICA",
    STORAGE_BUCKET: "product-images"
});
```

## 5. Primeiro acesso

Abra `admin/login.html`, entre com o usuário criado e configure:

- WhatsApp;
- horários de funcionamento;
- serviços;
- produtos;
- regras da agenda;
- planos, quando forem usados.

## 6. Publicação no GitHub Pages

O front é estático e pode ser publicado no GitHub Pages. Antes de publicar, confirme que `js/env.js` está preenchido e que o RLS foi aplicado.
