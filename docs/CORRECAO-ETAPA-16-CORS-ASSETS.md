# Correção Etapa 16 — CORS e caminhos do GitHub Pages

## Edge Functions

As três funções devem ser publicadas novamente. O cabeçalho CORS agora aceita
`x-application-name`, enviado pelo Supabase JS.

No painel web, substitua o código das funções pelos arquivos do pacote
`edge-functions-supabase-web-v16.zip`.

## PUBLIC_SITE_URL

Para este repositório, use preferencialmente:

```text
https://dudruz.github.io/Duim
```

O frontend também envia a URL exata da página de retorno, preservando a subpasta
`/Duim/`.

## Assets

Caminhos como `assets/icons/scissors.svg` agora são resolvidos pela raiz real do
projeto e não por `/pages/assets/`.
