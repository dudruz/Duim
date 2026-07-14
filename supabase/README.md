# Backend Supabase

Projeto: `zglooskfheyjlcbpgbwh`

## Ordem das migrações

1. `migrations/001_schema.sql`
2. `migrations/002_rls.sql`
3. `migrations/003_booking_functions.sql`
4. `migrations/004_storage.sql`
5. `migrations/005_finance_automation.sql`
6. `migrations/006_customer_portal.sql`
7. `migrations/007_fix_booking_auth.sql`
8. `migrations/008_normalize_brazil_phone.sql`
9. `migrations/009_payments_subscriptions_mobile.sql`

Em uma instalação já atualizada até a v12, execute apenas a migração `009`.

## O que a migração 009 adiciona

- Cobrança do agendamento como `online`, `salon` ou `subscription`.
- Reserva temporária para checkout online.
- Solicitações de mensalidade online ou em dinheiro.
- Aprovação de mensalidade em dinheiro pelo Duin.
- Ativação automática da mensalidade por webhook.
- Pedidos de pagamento conciliados por `order_nsu`.
- Consumo de uso mensalista apenas quando o atendimento é concluído.
- Proteção contra receita duplicada em cortes mensalistas.

## Edge Functions

- `create-infinitepay-checkout`: autenticada; gera o link do atendimento ou plano.
- `verify-infinitepay-payment`: autenticada; valida o retorno do cliente.
- `infinitepay-webhook`: pública no gateway, mas valida a transação na InfinitePay antes de gravar.

Consulte `docs/INFINITEPAY.md` para configuração e deploy.

## Segurança

- Use somente a publishable/anon key no navegador.
- Nunca publique a service role.
- O painel depende de Auth, cargo e RLS.
- Cada cliente lê somente os próprios registros.
- Funções financeiras sensíveis são executadas apenas por admin ou service role.
