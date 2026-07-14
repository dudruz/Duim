# Etapa 13 — InfinitePay, mensalidades e mobile-first

## Entregue

- Agendamento com três formas de cobrança: pré-pago no site, mensalista e a cobrar no salão.
- Checkout InfinitePay criado por Edge Function, sem expor credenciais no navegador.
- Confirmação de pagamento por retorno do checkout e webhook.
- Mensalidade online ativada automaticamente após pagamento confirmado.
- Mensalidade em dinheiro enviada ao painel do Duin para aprovação ou recusa.
- Consumo de uso do plano somente quando o atendimento é concluído.
- Financeiro com recebido, a receber no salão, pré-pago online, valor mensalista ativo e projeção.
- Agenda administrativa com etiquetas de cobrança e proteção contra alteração manual de pagamentos online/mensalistas.
- Ajustes mobile-first para datas, botões, formulários, menu inferior, cards financeiros e painel.

## Arquivos principais desta etapa

- `css/mobile-v13.css`
- `pages/pagamento.html`
- `js/pagamento.js`
- `supabase/migrations/009_payments_subscriptions_mobile.sql`
- `supabase/ATUALIZACAO-ETAPA-13.sql`
- `supabase/functions/create-infinitepay-checkout/index.ts`
- `supabase/functions/verify-infinitepay-payment/index.ts`
- `supabase/functions/infinitepay-webhook/index.ts`
- `supabase/config.toml`
- `docs/INFINITEPAY.md`

## Antes de publicar

1. Preserve a chave pública já usada no `js/env.js`.
2. Execute `supabase/ATUALIZACAO-ETAPA-13.sql` no SQL Editor.
3. Configure `INFINITEPAY_HANDLE` e `PUBLIC_SITE_URL` como secrets das Edge Functions.
4. Publique as três Edge Functions.
5. No painel do Duin, ative pagamento online e venda de mensalidades.
6. Teste um agendamento de cada tipo e uma mensalidade de cada forma de pagamento.

A integração só fica operacional depois da configuração da InfiniteTag e da publicação das Edge Functions no projeto Supabase.
