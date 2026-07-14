# Correção do código do país 55

Esta versão aceita o WhatsApp das seguintes formas:

- `31999999999`
- `(31) 99999-9999`
- `5531999999999`
- `+55 (31) 99999-9999`
- `+55 (31) 3333-4444`

O banco passa a salvar somente `DDD + número`, sem o `55`. O prefixo `55` é colocado apenas ao abrir um link do WhatsApp.

## Atualização do Supabase existente

Execute no SQL Editor:

```text
supabase/migrations/008_normalize_brazil_phone.sql
```

O mesmo conteúdo também está no arquivo `supabase/CORRECAO-TELEFONE-55.sql` para facilitar.

Depois publique os arquivos atualizados no GitHub Pages e faça uma recarga forçada com `Ctrl + F5`.
