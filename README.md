# Barbearia du Amigo

Sistema em HTML, CSS e JavaScript puro para a **Barbearia du Amigo**, com atendimento do barbeiro **Duin**.

**Endereço:** R. Santa Clara de Assis, nº 20 - Minaslândia, Belo Horizonte - MG, 31810-340.

## Entregue nesta versão

- Site público responsivo.
- Página de agendamento conectável ao Supabase.
- Catálogo de produtos sem checkout.
- Política de privacidade e página 404 no mesmo design.
- Login privado.
- Dashboard do Duin.
- Agenda, encaixes e alteração de status.
- Clientes.
- Serviços.
- Produtos e upload de imagens.
- Financeiro.
- Planos e mensalistas.
- Horários, pausas, folgas e bloqueios.
- Configurações públicas.
- Banco SQL completo, funções de agendamento e RLS.
- Nenhum serviço, produto, horário, preço ou cliente fictício.

## Estrutura

```text
barbearia-du-amigo/
├── admin/
├── assets/
├── css/
├── data/
├── docs/
├── js/
├── pages/
├── supabase/
├── 404.html
├── index.html
└── manifest.webmanifest
```

## Configuração rápida

1. Execute os SQLs de `supabase/migrations/` na ordem.
2. Crie o usuário administrador.
3. Execute `supabase/bootstrap-admin.sql.example` com o UUID.
4. Preencha `js/env.js`.
5. Abra `admin/login.html`.

Veja `docs/INSTALACAO.md` para o passo a passo completo.

## Segurança

O navegador usa somente a anon key. A service role não deve ser colocada em nenhum arquivo do front. O controle de acesso é feito por autenticação e RLS.
