-- V13.1 CORRIGIDA: removido caractere acidental após capture_method text;
-- Execute este arquivo inteiro no SQL Editor do Supabase.

begin;

-- Etapa 13: formas de cobrança no agendamento, mensalistas e conciliação InfinitePay.
alter table public.settings
    add column if not exists online_payments_enabled boolean not null default false,
    add column if not exists subscription_sales_enabled boolean not null default true,
    add column if not exists online_payment_hold_minutes integer not null default 15
        check (online_payment_hold_minutes between 5 and 60);

alter table public.appointments
    add column if not exists billing_mode text not null default 'salon',
    add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
    add column if not exists reservation_expires_at timestamptz,
    add column if not exists subscription_use_consumed boolean not null default false;

alter table public.appointments
    drop constraint if exists appointments_billing_mode_check;
alter table public.appointments
    add constraint appointments_billing_mode_check
    check (billing_mode in ('online', 'salon', 'subscription'));

alter table public.payments
    add column if not exists provider text,
    add column if not exists provider_order_nsu text,
    add column if not exists provider_transaction_nsu text,
    add column if not exists provider_slug text,
    add column if not exists receipt_url text,
    add column if not exists capture_method text;

create unique index if not exists payments_provider_order_nsu_unique
    on public.payments(provider_order_nsu)
    where provider_order_nsu is not null;

alter table public.cash_movements
    add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

alter table public.cash_movements
    drop constraint if exists cash_movements_origin_check;
alter table public.cash_movements
    add constraint cash_movements_origin_check
    check (origin in ('manual', 'appointment', 'subscription'));

create table if not exists public.subscription_requests (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    plan_id uuid not null references public.plans(id) on delete restrict,
    payment_choice text not null check (payment_choice in ('online', 'cash')),
    status text not null default 'pending_approval'
        check (status in ('pending_payment', 'pending_approval', 'approved', 'rejected', 'cancelled', 'expired')),
    amount numeric(10,2) not null check (amount >= 0),
    order_nsu text unique,
    checkout_url text,
    subscription_id uuid references public.subscriptions(id) on delete set null,
    admin_note text,
    requested_at timestamptz not null default now(),
    reviewed_at timestamptz,
    reviewed_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.cash_movements
    add column if not exists subscription_request_id uuid references public.subscription_requests(id) on delete set null;

drop index if exists public.cash_movements_subscription_income_unique;
create unique index if not exists cash_movements_subscription_request_income_unique
    on public.cash_movements(subscription_request_id)
    where subscription_request_id is not null
      and type = 'income'
      and origin = 'subscription';

create table if not exists public.payment_orders (
    id uuid primary key default gen_random_uuid(),
    customer_id uuid not null references public.customers(id) on delete restrict,
    appointment_id uuid references public.appointments(id) on delete set null,
    subscription_request_id uuid references public.subscription_requests(id) on delete set null,
    kind text not null check (kind in ('appointment', 'subscription')),
    provider text not null default 'infinitepay',
    order_nsu text not null unique,
    amount numeric(10,2) not null check (amount >= 0),
    status text not null default 'created'
        check (status in ('created', 'pending', 'paid', 'failed', 'cancelled', 'expired')),
    checkout_url text,
    provider_transaction_nsu text,
    provider_slug text,
    capture_method text,
    receipt_url text,
    paid_amount numeric(10,2),
    paid_at timestamptz,
    expires_at timestamptz,
    provider_payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (kind = 'appointment' and appointment_id is not null and subscription_request_id is null)
        or (kind = 'subscription' and subscription_request_id is not null and appointment_id is null)
    )
);

create index if not exists subscription_requests_customer_idx on public.subscription_requests(customer_id);
create index if not exists subscription_requests_status_idx on public.subscription_requests(status, requested_at desc);
create index if not exists payment_orders_customer_idx on public.payment_orders(customer_id);
create index if not exists payment_orders_status_idx on public.payment_orders(status, created_at desc);
create index if not exists appointments_billing_idx on public.appointments(billing_mode, payment_status, starts_at);

-- Mantém updated_at nas novas tabelas.
drop trigger if exists subscription_requests_set_updated_at on public.subscription_requests;
create trigger subscription_requests_set_updated_at
before update on public.subscription_requests
for each row execute function public.set_updated_at();

drop trigger if exists payment_orders_set_updated_at on public.payment_orders;
create trigger payment_orders_set_updated_at
before update on public.payment_orders
for each row execute function public.set_updated_at();

-- Limpa reservas online abandonadas antes de calcular disponibilidade.
create or replace function public.expire_online_booking_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    update public.appointments
    set status = 'cancelled',
        updated_at = now()
    where status = 'pending'
      and billing_mode = 'online'
      and payment_status = 'unpaid'
      and reservation_expires_at is not null
      and reservation_expires_at <= now();

    get diagnostics v_count = row_count;

    update public.payment_orders po
    set status = 'expired', updated_at = now()
    where po.kind = 'appointment'
      and po.status in ('created', 'pending')
      and po.expires_at is not null
      and po.expires_at <= now();

    return v_count;
end;
$$;

create or replace function public.get_available_slots(
    p_service_id uuid,
    p_date date
)
returns table (
    starts_at timestamptz,
    ends_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_settings public.settings%rowtype;
    v_service public.services%rowtype;
    v_hours public.business_hours%rowtype;
    v_open timestamptz;
    v_close timestamptz;
    v_break_start timestamptz;
    v_break_end timestamptz;
    v_duration interval;
    v_step interval;
    v_today date;
begin
    perform public.expire_online_booking_holds();

    select * into v_settings from public.settings limit 1;
    if not found or v_settings.accepting_bookings = false then return; end if;

    v_today := (now() at time zone v_settings.timezone)::date;
    if p_date < v_today or p_date > v_today + v_settings.booking_window_days then return; end if;

    select * into v_service
    from public.services
    where id = p_service_id and active = true;
    if not found then return; end if;

    select * into v_hours
    from public.business_hours
    where weekday = extract(dow from p_date)::smallint and is_open = true;
    if not found then return; end if;

    v_duration := make_interval(mins => v_service.duration_minutes);
    v_step := make_interval(mins => v_settings.slot_interval_minutes);
    v_open := (p_date + v_hours.opens_at) at time zone v_settings.timezone;
    v_close := (p_date + v_hours.closes_at) at time zone v_settings.timezone;

    if v_hours.break_start is not null and v_hours.break_end is not null then
        v_break_start := (p_date + v_hours.break_start) at time zone v_settings.timezone;
        v_break_end := (p_date + v_hours.break_end) at time zone v_settings.timezone;
    end if;

    return query
    select candidate, candidate + v_duration
    from generate_series(v_open, v_close - v_duration, v_step) candidate
    where candidate >= now() + make_interval(mins => v_settings.booking_notice_minutes)
      and (v_break_start is null or not tstzrange(candidate, candidate + v_duration, '[)') && tstzrange(v_break_start, v_break_end, '[)'))
      and not exists (
          select 1 from public.blocked_periods bp
          where tstzrange(candidate, candidate + v_duration, '[)') && tstzrange(bp.starts_at, bp.ends_at, '[)')
      )
      and not exists (
          select 1 from public.appointments a
          where a.status in ('pending', 'confirmed')
            and tstzrange(candidate, candidate + v_duration, '[)') && tstzrange(a.starts_at, a.ends_at, '[)')
      )
    order by candidate;
end;
$$;

-- Novo agendamento com três formas de cobrança.
create or replace function public.create_customer_appointment_v2(
    p_service_id uuid,
    p_starts_at timestamptz,
    p_notes text default null,
    p_billing_mode text default 'salon'
)
returns table (
    appointment_id uuid,
    status public.appointment_status,
    starts_at timestamptz,
    billing_mode text,
    requires_checkout boolean,
    subscription_id uuid,
    reservation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_settings public.settings%rowtype;
    v_service public.services%rowtype;
    v_customer_id uuid;
    v_subscription public.subscriptions%rowtype;
    v_appointment_id uuid;
    v_status public.appointment_status;
    v_payment_status public.payment_status;
    v_payment_method text;
    v_expires timestamptz;
    v_mode text := lower(trim(coalesce(p_billing_mode, 'salon')));
begin
    if v_uid is null then raise exception 'Faça login para agendar.'; end if;
    if v_mode not in ('online', 'salon', 'subscription') then raise exception 'Forma de pagamento inválida.'; end if;

    perform public.expire_online_booking_holds();

    select * into v_settings from public.settings limit 1;
    if not found or v_settings.accepting_bookings = false then raise exception 'A agenda online está pausada.'; end if;
    if v_mode = 'online' and v_settings.online_payments_enabled = false then raise exception 'O pagamento online ainda não está disponível.'; end if;

    select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid limit 1;
    if v_customer_id is null then raise exception 'Complete seus dados na área Minha conta antes de agendar.'; end if;

    select * into v_service from public.services where id = p_service_id and active = true;
    if not found then raise exception 'Serviço indisponível.'; end if;

    perform pg_advisory_xact_lock(hashtext(p_service_id::text || p_starts_at::text));
    if not exists (
        select 1 from public.get_available_slots(p_service_id, (p_starts_at at time zone v_settings.timezone)::date) slot
        where slot.starts_at = p_starts_at
    ) then raise exception 'Este horário não está mais disponível.'; end if;

    if v_mode = 'subscription' then
        select s.* into v_subscription
        from public.subscriptions s
        where s.customer_id = v_customer_id
          and s.status = 'active'
          and s.remaining_uses > 0
          and s.starts_on <= (p_starts_at at time zone v_settings.timezone)::date
          and (s.ends_on is null or s.ends_on >= (p_starts_at at time zone v_settings.timezone)::date)
        order by s.ends_on nulls last, s.created_at
        limit 1
        for update;
        if not found then raise exception 'Você não possui mensalidade ativa com uso disponível.'; end if;
        v_status := 'confirmed';
        v_payment_status := 'paid';
        v_payment_method := 'subscription';
    elsif v_mode = 'online' then
        v_status := 'pending';
        v_payment_status := 'unpaid';
        v_payment_method := 'infinitepay';
        v_expires := now() + make_interval(mins => v_settings.online_payment_hold_minutes);
    else
        v_status := 'confirmed';
        v_payment_status := 'unpaid';
        v_payment_method := 'salon';
    end if;

    insert into public.appointments (
        customer_id, service_id, starts_at, ends_at, status, source, notes,
        total_amount, payment_status, payment_method, created_by, billing_mode,
        subscription_id, reservation_expires_at
    ) values (
        v_customer_id, v_service.id, p_starts_at,
        p_starts_at + make_interval(mins => v_service.duration_minutes),
        v_status, 'site', nullif(trim(coalesce(p_notes, '')), ''),
        v_service.price, v_payment_status, v_payment_method, v_uid, v_mode,
        case when v_mode = 'subscription' then v_subscription.id else null end,
        v_expires
    ) returning id into v_appointment_id;

    if v_mode in ('online', 'salon') then
        insert into public.payments (
            appointment_id, amount, method, status, provider
        ) values (
            v_appointment_id, v_service.price, v_payment_method, v_payment_status,
            case when v_mode = 'online' then 'infinitepay' else null end
        );
    end if;

    return query select
        v_appointment_id, v_status, p_starts_at, v_mode,
        (v_mode = 'online'),
        case when v_mode = 'subscription' then v_subscription.id else null end,
        v_expires;
end;
$$;

-- Solicitação de mensalidade pelo próprio cliente.
create or replace function public.create_subscription_request(
    p_plan_id uuid,
    p_payment_choice text
)
returns table (
    request_id uuid,
    status text,
    payment_choice text,
    amount numeric,
    requires_checkout boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_customer_id uuid;
    v_settings public.settings%rowtype;
    v_plan public.plans%rowtype;
    v_choice text := lower(trim(coalesce(p_payment_choice, '')));
    v_request public.subscription_requests%rowtype;
begin
    if v_uid is null then raise exception 'Faça login para contratar um plano.'; end if;
    if v_choice not in ('online', 'cash') then raise exception 'Forma de pagamento inválida.'; end if;

    select * into v_settings from public.settings limit 1;
    if not found or v_settings.subscription_sales_enabled = false then
        raise exception 'A contratação de mensalidade está pausada.';
    end if;
    if v_choice = 'online' and v_settings.online_payments_enabled = false then
        raise exception 'O pagamento online ainda não está disponível.';
    end if;

    select c.id into v_customer_id from public.customers c where c.auth_user_id = v_uid limit 1;
    if v_customer_id is null then raise exception 'Complete seus dados antes de contratar um plano.'; end if;

    select * into v_plan from public.plans where id = p_plan_id and active = true;
    if not found then raise exception 'Plano indisponível.'; end if;

    if exists (
        select 1 from public.subscription_requests sr
        where sr.customer_id = v_customer_id
          and sr.plan_id = p_plan_id
          and sr.status in ('pending_payment', 'pending_approval')
    ) then raise exception 'Já existe uma solicitação deste plano em andamento.'; end if;

    insert into public.subscription_requests (
        customer_id, plan_id, payment_choice, status, amount, order_nsu
    ) values (
        v_customer_id, v_plan.id, v_choice,
        case when v_choice = 'online' then 'pending_payment' else 'pending_approval' end,
        v_plan.price,
        case when v_choice = 'online' then 'sub-' || gen_random_uuid()::text else null end
    ) returning * into v_request;

    return query select v_request.id, v_request.status, v_request.payment_choice,
        v_request.amount, (v_choice = 'online');
end;
$$;

-- Ativa/renova um plano e registra o recebimento. Uso interno por webhook ou aprovação do Duin.
create or replace function public.activate_subscription_request(
    p_request_id uuid,
    p_method text,
    p_external_reference text default null,
    p_receipt_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.subscription_requests%rowtype;
    v_plan public.plans%rowtype;
    v_subscription public.subscriptions%rowtype;
    v_timezone text;
    v_today date;
begin
    select * into v_request from public.subscription_requests where id = p_request_id for update;
    if not found then raise exception 'Solicitação de plano não encontrada.'; end if;
    if v_request.status = 'approved' and v_request.subscription_id is not null then return v_request.subscription_id; end if;
    if v_request.status in ('rejected', 'cancelled', 'expired') then raise exception 'Esta solicitação não pode ser aprovada.'; end if;

    select * into v_plan from public.plans where id = v_request.plan_id;
    select timezone into v_timezone from public.settings limit 1;
    v_today := (now() at time zone coalesce(v_timezone, 'America/Sao_Paulo'))::date;

    select s.* into v_subscription
    from public.subscriptions s
    where s.customer_id = v_request.customer_id and s.plan_id = v_request.plan_id and s.status = 'active'
    order by s.created_at desc limit 1 for update;

    if found then
        update public.subscriptions
        set starts_on = least(starts_on, v_today),
            ends_on = (greatest(coalesce(ends_on, v_today), v_today) + interval '1 month')::date,
            remaining_uses = remaining_uses + v_plan.cuts_included,
            updated_at = now()
        where id = v_subscription.id
        returning * into v_subscription;
    else
        insert into public.subscriptions (
            customer_id, plan_id, starts_on, ends_on, status, remaining_uses
        ) values (
            v_request.customer_id, v_request.plan_id, v_today,
            (v_today + interval '1 month')::date, 'active', v_plan.cuts_included
        ) returning * into v_subscription;
    end if;

    insert into public.payments (
        subscription_id, amount, method, status, paid_at, external_reference,
        provider, receipt_url, capture_method
    ) values (
        v_subscription.id, v_request.amount, p_method, 'paid', now(), p_external_reference,
        case when p_method in ('pix', 'credit_card') then 'infinitepay' else null end,
        p_receipt_url, p_method
    );

    insert into public.cash_movements (
        type, category, description, amount, movement_date, payment_method,
        subscription_id, subscription_request_id, created_by, origin
    ) values (
        'income', 'Mensalidade', 'Mensalidade recebida', v_request.amount,
        v_today, p_method, v_subscription.id, v_request.id, auth.uid(), 'subscription'
    ) on conflict (subscription_request_id)
      where subscription_request_id is not null and type = 'income' and origin = 'subscription'
      do update set amount = excluded.amount, movement_date = excluded.movement_date,
                    payment_method = excluded.payment_method;

    update public.subscription_requests
    set status = 'approved', subscription_id = v_subscription.id,
        reviewed_at = now(), reviewed_by = coalesce(auth.uid(), reviewed_by), updated_at = now()
    where id = v_request.id;

    return v_subscription.id;
end;
$$;

create or replace function public.review_subscription_request(
    p_request_id uuid,
    p_approve boolean,
    p_note text default null
)
returns table (request_id uuid, status text, subscription_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_request public.subscription_requests%rowtype;
    v_subscription_id uuid;
begin
    if not public.is_admin() then raise exception 'Acesso não autorizado.'; end if;
    select * into v_request from public.subscription_requests where id = p_request_id for update;
    if not found then raise exception 'Solicitação não encontrada.'; end if;
    if v_request.status <> 'pending_approval' then raise exception 'Esta solicitação já foi analisada.'; end if;

    if p_approve then
        v_subscription_id := public.activate_subscription_request(p_request_id, 'cash', null, null);
    else
        update public.subscription_requests
        set status = 'rejected', admin_note = nullif(trim(coalesce(p_note, '')), ''),
            reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now()
        where id = p_request_id;
    end if;

    select * into v_request from public.subscription_requests where id = p_request_id;
    return query select v_request.id, v_request.status, v_request.subscription_id;
end;
$$;


-- Confirma pagamentos InfinitePay de forma idempotente. Chamado somente pelas Edge Functions.
create or replace function public.process_infinitepay_payment(
    p_order_nsu text,
    p_transaction_nsu text,
    p_slug text,
    p_capture_method text,
    p_receipt_url text,
    p_paid_amount numeric,
    p_payload jsonb default '{}'::jsonb
)
returns table (order_id uuid, kind text, target_id uuid, already_processed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_order public.payment_orders%rowtype;
    v_subscription_id uuid;
begin
    select * into v_order
    from public.payment_orders
    where order_nsu = p_order_nsu
    for update;

    if not found then raise exception 'Pedido de pagamento não encontrado.'; end if;

    if v_order.status = 'paid' then
        return query select v_order.id, v_order.kind,
            coalesce(v_order.appointment_id, v_order.subscription_request_id), true;
        return;
    end if;

    if coalesce(p_paid_amount, 0) + 0.009 < v_order.amount then
        raise exception 'Valor pago menor que o valor esperado.';
    end if;

    update public.payment_orders
    set status = 'paid', provider_transaction_nsu = p_transaction_nsu,
        provider_slug = p_slug, capture_method = p_capture_method,
        receipt_url = p_receipt_url, paid_amount = p_paid_amount,
        paid_at = now(), provider_payload = coalesce(p_payload, '{}'::jsonb),
        updated_at = now()
    where id = v_order.id;

    if v_order.kind = 'appointment' then
        update public.appointments
        set status = 'confirmed', payment_status = 'paid',
            payment_method = coalesce(p_capture_method, 'infinitepay'),
            reservation_expires_at = null, updated_at = now()
        where id = v_order.appointment_id
          and status in ('pending', 'confirmed');

        update public.payments
        set status = 'paid', paid_at = now(),
            method = coalesce(p_capture_method, 'infinitepay'), provider = 'infinitepay',
            provider_order_nsu = p_order_nsu,
            provider_transaction_nsu = p_transaction_nsu,
            provider_slug = p_slug, receipt_url = p_receipt_url,
            capture_method = p_capture_method, updated_at = now()
        where appointment_id = v_order.appointment_id;
    else
        v_subscription_id := public.activate_subscription_request(
            v_order.subscription_request_id,
            coalesce(p_capture_method, 'infinitepay'),
            p_transaction_nsu,
            p_receipt_url
        );
    end if;

    return query select v_order.id, v_order.kind,
        coalesce(v_order.appointment_id, v_order.subscription_request_id), false;
end;
$$;

-- Consome um uso apenas quando o atendimento mensalista é concluído.
create or replace function public.consume_subscription_use_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'completed'
       and old.status is distinct from 'completed'
       and new.billing_mode = 'subscription'
       and new.subscription_id is not null
       and new.subscription_use_consumed = false then
        update public.subscriptions
        set remaining_uses = greatest(remaining_uses - 1, 0), updated_at = now()
        where id = new.subscription_id and remaining_uses > 0;
        new.subscription_use_consumed := true;
    end if;
    return new;
end;
$$;

drop trigger if exists appointments_consume_subscription_use on public.appointments;
create trigger appointments_consume_subscription_use
before update of status on public.appointments
for each row execute function public.consume_subscription_use_on_completion();

-- Um uso mensalista já foi pago na contratação do plano. Não duplica receita a cada corte.
create or replace function public.sync_appointment_payment_to_cash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_timezone text;
begin
    select timezone into v_timezone from public.settings limit 1;

    if new.billing_mode = 'subscription' then
        delete from public.cash_movements
        where appointment_id = new.id
          and type = 'income'
          and origin = 'appointment';
        return new;
    end if;

    if new.payment_status = 'paid' then
        insert into public.cash_movements (
            type, category, description, amount, movement_date,
            payment_method, appointment_id, created_by, origin
        ) values (
            'income', 'Atendimento',
            case when new.billing_mode = 'online' then 'Atendimento pré-pago' else 'Atendimento recebido no salão' end,
            new.total_amount,
            (now() at time zone coalesce(v_timezone, 'America/Sao_Paulo'))::date,
            new.payment_method, new.id, auth.uid(), 'appointment'
        )
        on conflict (appointment_id)
        where appointment_id is not null and type = 'income' and origin = 'appointment'
        do update set
            amount = excluded.amount,
            movement_date = excluded.movement_date,
            payment_method = excluded.payment_method,
            description = excluded.description;
    elsif tg_op = 'UPDATE' and old.payment_status = 'paid' and new.payment_status <> 'paid' then
        delete from public.cash_movements
        where appointment_id = new.id
          and type = 'income'
          and origin = 'appointment';
    end if;

    return new;
end;
$$;

-- RLS das novas tabelas.
alter table public.subscription_requests enable row level security;
alter table public.payment_orders enable row level security;

drop policy if exists "Customers read own subscription requests" on public.subscription_requests;
create policy "Customers read own subscription requests"
on public.subscription_requests for select to authenticated
using (exists (
    select 1 from public.customers c
    where c.id = subscription_requests.customer_id and c.auth_user_id = auth.uid()
));

drop policy if exists "Customers read own payment orders" on public.payment_orders;
create policy "Customers read own payment orders"
on public.payment_orders for select to authenticated
using (exists (
    select 1 from public.customers c
    where c.id = payment_orders.customer_id and c.auth_user_id = auth.uid()
));

drop policy if exists "Admin full access" on public.subscription_requests;
create policy "Admin full access" on public.subscription_requests
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admin full access" on public.payment_orders;
create policy "Admin full access" on public.payment_orders
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Permissões das funções.
revoke all on function public.expire_online_booking_holds() from public, anon, authenticated;
grant execute on function public.expire_online_booking_holds() to service_role;

revoke all on function public.create_customer_appointment_v2(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.create_customer_appointment_v2(uuid, timestamptz, text, text) to authenticated;

revoke all on function public.create_subscription_request(uuid, text) from public, anon;
grant execute on function public.create_subscription_request(uuid, text) to authenticated;

revoke all on function public.activate_subscription_request(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_subscription_request(uuid, text, text, text) to service_role;

revoke all on function public.process_infinitepay_payment(text, text, text, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.process_infinitepay_payment(text, text, text, text, text, numeric, jsonb) to service_role;

revoke all on function public.review_subscription_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_subscription_request(uuid, boolean, text) to authenticated;

revoke all on function public.get_available_slots(uuid, date) from public;
grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
