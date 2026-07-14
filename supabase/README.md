# Backend Supabase

## Ordem de execução

Execute no SQL Editor:

1. `migrations/001_schema.sql`
2. `migrations/002_rls.sql`
3. `migrations/003_booking_functions.sql`
4. `migrations/004_storage.sql`
5. `migrations/005_finance_automation.sql`
6. `migrations/006_customer_portal.sql`

Depois:

1. Crie o usuário do Duin em **Authentication > Users**.
2. Execute `bootstrap-admin.sql.example` com o UUID.
3. Preencha `js/env.js`.
4. Configure Site URL e Redirect URLs no Authentication.
5. Entre em `admin/login.html` e cadastre os dados reais.

## Segurança

- A `anon key` pode ficar no navegador.
- A `service_role key` nunca pode ser usada no front.
- O painel depende de autenticação e RLS.
- O agendamento online exige login.
- Cada cliente lê somente o próprio cadastro, histórico, plano e pagamentos.
- A função `create_customer_appointment` usa o usuário autenticado e ignora dados de identidade enviados pelo navegador.
- A restrição de sobreposição impede dois horários ativos no mesmo período.
