# Etapa 15 — perfil, mensalidade e checkout

## Ordem

1. Execute `supabase/ATUALIZACAO-ETAPA-15.sql`.
2. Substitua os arquivos do GitHub pelo pacote da Etapa 15.
3. Preserve o seu `js/env.js`.
4. Recarregue o site sem cache.

## Correções

- Novas RPCs JSONB para evitar erro HTTP 400 por incompatibilidade de retorno.
- Solicitação online repetida é reutilizada em vez de gerar outra cobrança.
- Perfil cria ou repara automaticamente o vínculo com `customers`.
- Agendamento usa o cadastro reparado e não acusa perfil incompleto indevidamente.
- Erros de Edge Functions agora mostram a mensagem real retornada pelo servidor.
