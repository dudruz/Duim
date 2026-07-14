# Entrega final — cadastro sem confirmação de e-mail

## Alterações desta versão

- Removido `emailRedirectTo` do cadastro.
- Removida a tela que mandava o cliente confirmar e-mail.
- Cadastro inicia sessão automaticamente.
- Após criar conta, o cliente volta para **Minha conta** e segue para o agendamento.
- Mensagem específica para usuários antigos que ainda estejam pendentes de confirmação.
- Cache dos arquivos atualizado para `v=11`, evitando que o GitHub Pages carregue JavaScript antigo.
- URL do Supabase mantida em `js/env.js`.

## Configuração obrigatória

Desative **Confirm email** em:

`Supabase > Authentication > Providers > Email`

Depois exclua cadastros de teste antigos e crie uma conta nova pelo site.

## Fluxo final

`Agendar → Minha conta → Entrar ou criar conta → login automático → Minha conta → agenda`


## Atualização v12

Telefones brasileiros agora são aceitos com ou sem `+55`. O banco salva apenas DDD + número, a confirmação do agendamento exibe a máscara correta e os links do WhatsApp recebem exatamente um código do país.
