# Backend Supabase

## Ordem de execução

No SQL Editor do Supabase, execute os arquivos nesta ordem:

1. `migrations/001_schema.sql`
2. `migrations/002_rls.sql`
3. `migrations/003_booking_functions.sql`
4. `migrations/004_storage.sql`
5. `migrations/005_finance_automation.sql`

Depois:

1. Crie o usuário do Duin em **Authentication > Users**.
2. Copie `bootstrap-admin.sql.example`, substitua o UUID e execute.
3. Preencha `js/env.js` com a URL e a anon key do projeto.
4. Entre em `admin/login.html`.
5. Configure horários, serviços, WhatsApp e produtos pelo painel.

## Segurança

- A `anon key` pode ficar no navegador.
- A `service_role key` nunca pode ser usada no front.
- O painel depende de autenticação e RLS.
- Agendamentos públicos são criados somente pela função `create_public_appointment`.
- A restrição de sobreposição impede dois horários ativos no mesmo período.
