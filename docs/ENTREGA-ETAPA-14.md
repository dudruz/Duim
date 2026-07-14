# Etapa 14 — Perfil e limite da mensalidade

## Correções

- O perfil salva nome, telefone, apelido, nascimento e preferência sem erro de coluna `email` ambígua.
- O número é normalizado para DDD + telefone, sem `55` no banco.
- Contas antigas sem registro em `customers` são vinculadas ao salvar ou ao iniciar o agendamento.
- A mensalidade considera horários futuros já reservados. Um plano de quatro cortes não permite uma quinta reserva no mesmo ciclo.
- Cancelar um horário futuro libera novamente aquele uso.
- O saldo mostrado em Minha conta e no agendamento já desconta as reservas futuras.

## Atualização

Execute `supabase/ATUALIZACAO-ETAPA-14.sql` no SQL Editor e publique os arquivos do front com cache `v14`.
