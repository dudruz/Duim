# Correção Etapa 17 — fluxo de pagamento

O pagamento online agora usa uma tela intermediária própria:

1. O cliente confirma o agendamento ou escolhe uma mensalidade.
2. O site abre `pages/pagamento.html`.
3. A página chama a Edge Function e gera o link da InfinitePay.
4. O botão **Abrir pagamento na InfinitePay** fica visível.
5. O cliente toca no botão e escolhe Pix ou cartão.
6. Após pagar, a InfinitePay retorna para a mesma página, que verifica a transação.

Essa alteração evita que o fluxo pareça apenas recarregar a agenda e também deixa qualquer erro da Edge Function visível na tela.

Não há SQL novo e não é necessário republicar as Edge Functions da V16.
