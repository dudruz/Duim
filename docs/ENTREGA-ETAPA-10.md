> **Documento histórico:** substituído por `ENTREGA-FINAL.md` e pela configuração sem confirmação de e-mail.

# Etapa 10 — fluxo simples de conta antes do agendamento

## Fluxo final

1. O visitante toca em **Agendar**.
2. O site abre `minha-conta.html?acao=agendar` para verificar a sessão.
3. Sem sessão, o cliente é encaminhado para o login.
4. No login existem duas ações visíveis:
   - **Entrar e escolher horário**;
   - **Não tenho conta — criar agora**.
5. Se o login falhar, o site mostra botões para criar conta com o e-mail digitado ou recuperar a senha.
6. O cadastro pede somente nome, WhatsApp, e-mail e senha.
7. Depois do login/cadastro, a área Minha conta verifica nome e WhatsApp.
8. Com o perfil completo, o site abre a agenda automaticamente.
9. Sem dados completos, o cliente salva o perfil e segue para a agenda.

## Observação sobre a verificação de e-mail

O Supabase não revela de forma segura se uma conta existe quando o login falha. Por isso o site não informa “este e-mail não existe”. Ele oferece de forma clara as opções **Criar conta** e **Recuperar senha**.

Para o fluxo mais rápido, desative a confirmação obrigatória de e-mail em:

`Supabase > Authentication > Providers > Email > Confirm email`

Com essa opção desativada, o cliente cria a conta, recebe uma sessão e segue direto para o agendamento. Se a confirmação continuar ativada, ele precisará confirmar o e-mail e entrar depois.

## Arquivos principais alterados

- `index.html`
- `404.html`
- `pages/login.html`
- `pages/cadastro.html`
- `pages/minha-conta.html`
- `pages/agendamento.html`
- `pages/loja.html`
- `pages/privacidade.html`
- `js/customer-auth.js`
- `js/customer-account.js`
- `js/agendamento.js`
- `js/config.js`
- `css/customer.css`
