# JavaScript

Esta pasta contém toda a aplicação em JavaScript puro.

## Base

- `config.js`: identidade e rotas públicas.
- `env.js`: URL e anon key do Supabase.
- `env.example.js`: modelo de configuração.
- `supabase-client.js`: inicialização única do cliente.
- `api.js`: consultas, autenticação, CRUD e upload.
- `utils.js`: formatação e utilitários.
- `main.js`: navegação e informações públicas.

## Site público

- `home.js`
- `agendamento.js`
- `loja.js`

## Painel

- `admin-core.js`: autenticação, menu, modais e mensagens.
- `admin-login.js`
- `admin-dashboard.js`
- `admin-agenda.js`
- `admin-clientes.js`
- `admin-servicos.js`
- `admin-produtos.js`
- `admin-financeiro.js`
- `admin-planos.js`
- `admin-horarios.js`
- `admin-configuracoes.js`

Nunca coloque a `service_role` no navegador. O front usa apenas a anon key e depende das políticas RLS.
