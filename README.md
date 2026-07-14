# Barbearia du Amigo

Sistema mobile-first em HTML, CSS e JavaScript puro para a **Barbearia du Amigo**, com atendimento do barbeiro **Duin**.

**Endereço:** R. Santa Clara de Assis, nº 20 - Minaslândia, Belo Horizonte - MG, 31810-340.

## Recursos desta versão

- Site público responsivo, com navegação inferior no celular.
- Cadastro e login de clientes.
- Recuperação e redefinição de senha.
- Agendamento disponível somente para clientes autenticados.
- Área **Minha conta** personalizada para cada cliente.
- Próximo atendimento, histórico de serviços e cancelamento dentro do prazo.
- Perfil com apelido, data de nascimento e preferência de corte.
- Catálogo de produtos sem checkout.
- Política de privacidade e página 404 no mesmo design.
- Painel privado do Duin responsivo para celular.
- Agenda, encaixes, clientes, serviços, produtos, financeiro, planos e horários.
- Banco Supabase com RLS separando os dados de cada cliente.
- Nenhum serviço, produto, horário, preço ou cliente fictício.

## Estrutura

```text
barbearia-du-amigo/
├── admin/
├── assets/
├── css/
│   └── customer.css
├── data/
├── docs/
├── js/
│   ├── customer-auth.js
│   └── customer-account.js
├── pages/
│   ├── login.html
│   ├── cadastro.html
│   ├── recuperar-senha.html
│   ├── redefinir-senha.html
│   ├── minha-conta.html
│   └── agendamento.html
├── supabase/
├── 404.html
├── index.html
└── manifest.webmanifest
```

## Configuração rápida

1. Execute os SQLs de `supabase/migrations/` na ordem, do `001` ao `006`.
2. Crie o usuário administrador.
3. Execute `supabase/bootstrap-admin.sql.example` com o UUID.
4. Preencha `js/env.js`.
5. Configure no Supabase a URL pública e os redirecionamentos de autenticação.
6. Abra `admin/login.html`.

Veja `docs/INSTALACAO.md` para o passo a passo completo.

## Segurança

O navegador usa somente a anon key. A service role não deve ser colocada no front. Clientes só conseguem ler os próprios dados por meio das políticas RLS e das funções autenticadas do banco.
