# Arquitetura

## Front público

- `index.html`: home.
- `pages/agendamento.html`: consulta horários e cria agendamentos reais.
- `pages/loja.html`: catálogo alimentado por produtos ativos.
- `pages/privacidade.html`: política de privacidade.
- `404.html`: página de erro.

## Painel privado

- `admin/dashboard.html`: indicadores e agenda do dia.
- `admin/agenda.html`: agenda completa e encaixes.
- `admin/clientes.html`: clientes e histórico.
- `admin/servicos.html`: preços e duração.
- `admin/produtos.html`: catálogo e upload.
- `admin/financeiro.html`: entradas e saídas.
- `admin/planos.html`: planos e mensalistas.
- `admin/horarios.html`: funcionamento, pausas e folgas.
- `admin/configuracoes.html`: dados públicos e regras.

## JavaScript

- `env.js`: URL e anon key.
- `supabase-client.js`: cliente único do Supabase.
- `api.js`: camada de acesso ao banco.
- `admin-core.js`: autenticação, shell e utilitários do painel.
- scripts específicos: comportamento de cada tela.

## Banco

O front público tem somente leitura das informações publicadas. A criação de agendamentos passa por RPC protegida. O painel usa autenticação e a função `is_admin()` nas políticas RLS.
