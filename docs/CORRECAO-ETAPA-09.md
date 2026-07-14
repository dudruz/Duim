> **Documento histórico:** substituído por `ENTREGA-FINAL.md` e pela configuração sem confirmação de e-mail.

# Correção do cadastro e agendamento — Etapa 09

## Motivo do erro

A versão antiga do JavaScript chamava `create_public_appointment`. A migração 006 desativou o uso público dessa função para exigir conta, mas o GitHub Pages ou o navegador podia continuar entregando o JavaScript antigo.

## Aplicação

1. Supabase → **SQL Editor**.
2. Execute `supabase/CORRECAO-RAPIDA-AGENDAMENTO.sql`.
3. Substitua os arquivos antigos no GitHub pelos desta etapa.
4. Aguarde o Pages publicar e use `Ctrl + F5`.

## Novo fluxo

1. A pessoa abre Agendar.
2. Sem sessão, vê **Já tenho conta** e **Criar minha conta**.
3. O cadastro pede nome, WhatsApp, e-mail e senha.
4. Após confirmar o e-mail e entrar, a pessoa volta ao agendamento.
5. O front usa `create_customer_appointment`, que identifica o cliente pela sessão autenticada.

## URL do Supabase

O `js/env.js` já contém `https://zglooskfheyjlcbpgbwh.supabase.co`. Preencha somente a chave pública anon/publishable.
