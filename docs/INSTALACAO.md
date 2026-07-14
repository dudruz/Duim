# Instalação final — GitHub Pages + Supabase

## 1. Executar o banco

No **SQL Editor** do Supabase, execute os arquivos de `supabase/migrations/` nesta ordem:

1. `001_schema.sql`
2. `002_rls.sql`
3. `003_booking_functions.sql`
4. `004_storage.sql`
5. `005_finance_automation.sql`
6. `006_customer_portal.sql`
7. `007_fix_booking_auth.sql`

A migração 007 libera a função autenticada usada pelo cliente e corrige o erro de permissão ao agendar.

## 2. Desativar a confirmação de e-mail

No painel do Supabase, abra:

`Authentication > Providers > Email`

Desative **Confirm email** e salve. O fluxo final depende disso:

`Criar conta → login automático → Minha conta → escolher serviço, dia e horário`

Cadastros feitos enquanto a confirmação estava ativada podem permanecer pendentes. Para testar corretamente, exclua os usuários de teste antigos em **Authentication > Users** e faça um cadastro novo pelo site.

## 3. Configurar as URLs

Em `Authentication > URL Configuration`:

- **Site URL:** coloque a URL publicada no GitHub Pages.
- **Redirect URLs:** adicione a URL do site com `/**` e a página `pages/redefinir-senha.html`.

Exemplo:

```text
https://SEU-USUARIO.github.io/SEU-REPOSITORIO/
https://SEU-USUARIO.github.io/SEU-REPOSITORIO/**
https://SEU-USUARIO.github.io/SEU-REPOSITORIO/pages/redefinir-senha.html
```

A confirmação de cadastro não usa mais e-mail. Essas URLs continuam necessárias para recuperação de senha.

## 4. Conectar o frontend

A URL do projeto já está preenchida em `js/env.js`:

```js
SUPABASE_URL: "https://zglooskfheyjlcbpgbwh.supabase.co"
```

Preencha somente a chave pública:

```js
window.DuAmigoEnv = Object.freeze({
    SUPABASE_URL: "https://zglooskfheyjlcbpgbwh.supabase.co",
    SUPABASE_ANON_KEY: "COLE_A_ANON_KEY_OU_PUBLISHABLE_KEY",
    STORAGE_BUCKET: "product-images"
});
```

Nunca coloque a `service_role` no GitHub.

## 5. Criar o acesso do Duin

1. Crie o usuário do Duin em **Authentication > Users**.
2. Copie o UUID dele.
3. Edite uma cópia de `supabase/bootstrap-admin.sql.example`.
4. Execute o SQL no Supabase.

## 6. Publicar no GitHub Pages

No repositório:

`Settings > Pages > Deploy from a branch > main > /root`

O arquivo `.nojekyll` já está incluído. Todos os caminhos do site são relativos e compatíveis com um repositório publicado em subpasta.

## 7. Testar o fluxo do cliente

1. Abra o site em aba anônima.
2. Toque em **Agendar**.
3. A página **Minha conta** verificará a sessão e encaminhará para o login.
4. Toque em **Não tenho conta — criar agora**.
5. Informe nome, WhatsApp, e-mail e senha.
6. O sistema cria a conta, entra automaticamente e volta para **Minha conta**.
7. A conta valida nome e WhatsApp e abre a agenda.
8. Escolha serviço, dia e horário.
9. Confira o atendimento em **Minha conta** e no painel do Duin.

## 8. Teste local

Use Live Server no VS Code. Não abra os arquivos diretamente por `file://`.
