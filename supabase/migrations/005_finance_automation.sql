begin;

alter table public.cash_movements
    add column if not exists origin text not null default 'manual'
    check (origin in ('manual', 'appointment'));

create unique index if not exists cash_movements_appointment_income_unique
on public.cash_movements(appointment_id)
where appointment_id is not null
  and type = 'income'
  and origin = 'appointment';

create or replace function public.sync_appointment_payment_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_timezone text;
begin
    select timezone into v_timezone
    from public.settings
    limit 1;

    if new.payment_status = 'paid' then
        insert into public.cash_movements (
            type,
            category,
            description,
            amount,
            movement_date,
            payment_method,
            appointment_id,
            created_by,
            origin
        )
        values (
            'income',
            'Atendimento',
            'Atendimento pago',
            new.total_amount,
            (coalesce(new.starts_at, now()) at time zone coalesce(v_timezone, 'America/Sao_Paulo'))::date,
            new.payment_method,
            new.id,
            auth.uid(),
            'appointment'
        )
        on conflict (appointment_id)
        where appointment_id is not null
          and type = 'income'
          and origin = 'appointment'
        do update set
            amount = excluded.amount,
            movement_date = excluded.movement_date,
            payment_method = excluded.payment_method;
    elsif tg_op = 'UPDATE' then
        if old.payment_status = 'paid' and new.payment_status <> 'paid' then
            delete from public.cash_movements
            where appointment_id = new.id
              and type = 'income'
              and origin = 'appointment';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists appointments_sync_cash on public.appointments;
create trigger appointments_sync_cash
after insert or update of payment_status, payment_method, total_amount
on public.appointments
for each row
execute function public.sync_appointment_payment_to_cash();

commit;
