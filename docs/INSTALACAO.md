# Instalação do projeto

## 1. Abrir localmente

Abra a pasta no VS Code e use o Live Server. Não abra os HTMLs diretamente pelo `file://`, pois autenticação e redirecionamentos funcionam melhor em um servidor local.

## 2. Criar o projeto Supabase

Crie um projeto e execute os arquivos da pasta `supabase/migrations/` na ordem:

1. `001_schema.sql`
2. `002_rls.sql`
3. `003_booking_functions.sql`
4. `004_storage.sql`
5. `005_finance_automation.sql`
6. `006_customer_portal.sql`

A migração 006 adiciona cadastro de clientes, área personalizada, histórico, cancelamento e agendamento autenticado.

## 3. Configurar autenticação

No Supabase, configure em **Authentication > URL Configuration**:

- **Site URL:** endereço final do site ou URL do Live Server.
- **Redirect URLs:** inclua o endereço de `pages/redefinir-senha.html`.

Exemplos locais:

```text
http://127.0.0.1:5500/barbearia-du-amigo/
http://127.0.0.1:5500/barbearia-du-amigo/pages/redefinir-senha.html
```

Caso a confirmação de e-mail esteja ativada, o cliente precisará confirmar a conta antes do primeiro login.

## 4. Criar o administrador

Crie o usuário do Duin em **Authentication > Users**. Depois execute uma cópia de `supabase/bootstrap-admin.sql.example` com o UUID correto.

## 5. Conectar o front

Abra `js/env.js` e preencha:

```js
window.DuAmigoEnv = Object.freeze({
    SUPABASE_URL: "https://SEU-PROJETO.supabase.co",
    SUPABASE_ANON_KEY: "SUA_ANON_KEY_PUBLICA",
    STORAGE_BUCKET: "product-images"
});
```

## 6. Configurar o negócio

Entre em `admin/login.html` e cadastre:

- WhatsApp;
- horários de funcionamento;
- serviços e valores;
- produtos;
- regras da agenda;
- planos, quando forem utilizados.

## 7. Testar o fluxo do cliente

1. Abra `pages/cadastro.html`.
2. Crie uma conta com nome, WhatsApp, e-mail e senha.
3. Entre em `pages/login.html`.
4. Atualize preferências em `pages/minha-conta.html`.
5. Agende em `pages/agendamento.html`.
6. Confirme se o atendimento aparece na conta e no painel do Duin.

## 8. Publicar no GitHub Pages

O front é estático. Confirme que os caminhos relativos, `js/env.js`, Site URL e Redirect URLs do Supabase apontam para o endereço publicado.
