# InfinitePay — integração da Barbearia du Amigo

## Fluxos implementados

### Atendimento pré-pago

1. Cliente escolhe serviço, data e horário.
2. Seleciona **Pagar agora pelo site**.
3. O Supabase cria uma reserva temporária do horário.
4. A Edge Function gera o checkout InfinitePay.
5. Após o pagamento, o webhook valida a transação e confirma o horário.
6. O financeiro recebe uma entrada automática.

### Mensalidade online

1. Cliente escolhe um plano em **Minha conta**.
2. Seleciona **Pagar no site**.
3. A Edge Function gera o checkout.
4. O webhook confirma o pagamento.
5. O plano é ativado ou renovado automaticamente, com os usos adicionados.
6. A receita de mensalidade entra no financeiro.

### Mensalidade em dinheiro

1. Cliente seleciona **Pagar em dinheiro**.
2. A solicitação aparece em `admin/planos.html`.
3. Duin confirma o recebimento ou recusa.
4. Ao aprovar, o plano é ativado e o valor entra no caixa.

## Arquivos principais

- `supabase/migrations/009_payments_subscriptions_mobile.sql`
- `supabase/functions/create-infinitepay-checkout/index.ts`
- `supabase/functions/verify-infinitepay-payment/index.ts`
- `supabase/functions/infinitepay-webhook/index.ts`
- `pages/pagamento.html`
- `js/pagamento.js`

## Segredos das Edge Functions

```bash
npx supabase secrets set \
  INFINITEPAY_HANDLE=SUA_INFINITETAG \
  PUBLIC_SITE_URL=https://dudruz.github.io \
  --project-ref zglooskfheyjlcbpgbwh
```

A InfiniteTag deve ser informada sem `$`. O `PUBLIC_SITE_URL` deve ser a raiz real em que o site está publicado.

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são disponibilizadas pelo ambiente das Edge Functions. A `service_role` nunca deve ser colocada nos arquivos do GitHub Pages.

## Deploy

```bash
npx supabase login
npx supabase link --project-ref zglooskfheyjlcbpgbwh
npx supabase functions deploy create-infinitepay-checkout --project-ref zglooskfheyjlcbpgbwh
npx supabase functions deploy verify-infinitepay-payment --project-ref zglooskfheyjlcbpgbwh
npx supabase functions deploy infinitepay-webhook --project-ref zglooskfheyjlcbpgbwh
```

O webhook está configurado com `verify_jwt = false` em `supabase/config.toml`, pois a chamada vem da InfinitePay. A função não confia apenas no corpo recebido: ela consulta `payment_check` antes de processar o pedido.

## Ativação no painel

Depois do deploy:

1. Abra `admin/configuracoes.html`.
2. Ative **Permitir pré-pagamento pela InfinitePay**.
3. Ative **Permitir contratação de mensalidade**.
4. Defina o tempo de reserva do pré-pago.

## Teste recomendado

Crie valores baixos de teste e verifique:

- retorno em `pages/pagamento.html`;
- `payment_orders.status = paid`;
- atendimento confirmado ou mensalidade ativa;
- entrada criada em `cash_movements`;
- nenhuma receita duplicada ao usar um corte mensalista.
