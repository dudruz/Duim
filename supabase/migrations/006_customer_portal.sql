begin;

alter table public.customers
    add column if not exists nickname text,
    add column if not exists birth_date date,
    add column if not exists style_preferences text;

create index if not exists customers_auth_user_idx
    on public.customers(auth_user_id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_phone text;
begin
    v_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    v_phone := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g');

    insert into public.profiles (id, full_name, email, phone, role)
    values (
        new.id,
        v_name,
        new.email,
        nullif(v_phone, ''),
        'customer'
    )
    on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        updated_at = now();

    if length(v_phone) >= 10 then
        update public.customers
        set auth_user_id = new.id,
            name = coalesce(nullif(v_name, ''), name),
            email = coalesce(new.email, email),
            updated_at = now()
        where phone = v_phone
          and auth_user_id is null
          and lower(coalesce(email, '')) = lower(coalesce(new.email, ''));

        if not found then
            insert into public.customers (auth_user_id, name, phone, email)
            values (
                new.id,
                coalesce(nullif(v_name, ''), split_part(coalesce(new.email, 'Cliente'), '@', 1)),
                v_phone,
                new.email
            )
            on conflict (phone) do nothing;
        end if;
    end if;

    return new;
end;
$$;

create or replace function public.sync_own_customer_profile(
    p_full_name text,
    p_phone text,
    p_nickname text default null,
    p_birth_date date default null,
    p_style_preferences text default null
)
returns table (
    id uuid,
    auth_user_id uuid,
    name text,
    nickname text,
    phone text,
    email text,
    birth_date date,
    style_preferences text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_name text := trim(coalesce(p_full_name, ''));
    v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
    v_customer public.customers%rowtype;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    if length(v_name) < 3 then
        raise exception 'Informe seu nome completo.';
    end if;

    if length(v_phone) < 10 then
        raise exception 'Informe um WhatsApp válido com DDD.';
    end if;

    select email into v_email from auth.users where auth.users.id = v_uid;

    if exists (
        select 1
        from public.customers c
        where c.phone = v_phone
          and c.auth_user_id is not null
          and c.auth_user_id <> v_uid
    ) then
        raise exception 'Este WhatsApp já está vinculado a outra conta.';
    end if;

    update public.profiles
    set full_name = v_name,
        phone = v_phone,
        updated_at = now()
    where public.profiles.id = v_uid;

    select * into v_customer
    from public.customers c
    where c.auth_user_id = v_uid
    limit 1;

    if found then
        update public.customers
        set name = v_name,
            nickname = nullif(trim(coalesce(p_nickname, '')), ''),
            phone = v_phone,
            email = coalesce(v_email, email),
            birth_date = p_birth_date,
            style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
            updated_at = now()
        where public.customers.id = v_customer.id
        returning * into v_customer;
    else
        update public.customers
        set auth_user_id = v_uid,
            name = v_name,
            nickname = nullif(trim(coalesce(p_nickname, '')), ''),
            email = coalesce(v_email, email),
            birth_date = p_birth_date,
            style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
            updated_at = now()
        where public.customers.phone = v_phone
          and public.customers.auth_user_id is null
          and lower(coalesce(public.customers.email, '')) = lower(coalesce(v_email, ''))
        returning * into v_customer;

        if not found and exists (
            select 1 from public.customers c
            where c.phone = v_phone
              and c.auth_user_id is null
        ) then
            raise exception 'Este WhatsApp já possui cadastro na barbearia. Peça ao Duin para vincular sua conta com segurança.';
        end if;

        if not found then
            insert into public.customers (
                auth_user_id,
                name,
                nickname,
                phone,
                email,
                birth_date,
                style_preferences
            ) values (
                v_uid,
                v_name,
                nullif(trim(coalesce(p_nickname, '')), ''),
                v_phone,
                v_email,
                p_birth_date,
                nullif(trim(coalesce(p_style_preferences, '')), '')
            )
            returning * into v_customer;
        end if;
    end if;

    return query
    select
        v_customer.id,
        v_customer.auth_user_id,
        v_customer.name,
        v_customer.nickname,
        v_customer.phone,
        v_customer.email,
        v_customer.birth_date,
        v_customer.style_preferences;
end;
$$;

create or replace function public.create_customer_appointment(
    p_service_id uuid,
    p_starts_at timestamptz,
    p_notes text default null
)
returns table (
    appointment_id uuid,
    status public.appointment_status,
    starts_at timestamptz
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
    v_appointment_id uuid;
begin
    if v_uid is null then
        raise exception 'Faça login para agendar.';
    end if;

    select * into v_settings from public.settings limit 1;
    if not found or v_settings.accepting_bookings = false then
        raise exception 'A agenda online está pausada.';
    end if;

    select c.id into v_customer_id
    from public.customers c
    where c.auth_user_id = v_uid
    limit 1;

    if v_customer_id is null then
        raise exception 'Complete seus dados na área Minha conta antes de agendar.';
    end if;

    select * into v_service
    from public.services
    where id = p_service_id
      and active = true;

    if not found then
        raise exception 'Serviço indisponível.';
    end if;

    perform pg_advisory_xact_lock(hashtext(p_service_id::text || p_starts_at::text));

    if not exists (
        select 1
        from public.get_available_slots(
            p_service_id,
            (p_starts_at at time zone v_settings.timezone)::date
        ) slot
        where slot.starts_at = p_starts_at
    ) then
        raise exception 'Este horário não está mais disponível.';
    end if;

    insert into public.appointments (
        customer_id,
        service_id,
        starts_at,
        ends_at,
        status,
        source,
        notes,
        total_amount,
        payment_status,
        created_by
    ) values (
        v_customer_id,
        v_service.id,
        p_starts_at,
        p_starts_at + make_interval(mins => v_service.duration_minutes),
        'confirmed',
        'site',
        nullif(trim(coalesce(p_notes, '')), ''),
        v_service.price,
        'unpaid',
        v_uid
    )
    returning id into v_appointment_id;

    return query
    select v_appointment_id, 'confirmed'::public.appointment_status, p_starts_at;
end;
$$;

create or replace function public.cancel_own_appointment(
    p_appointment_id uuid
)
returns table (
    appointment_id uuid,
    status public.appointment_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_settings public.settings%rowtype;
    v_appointment public.appointments%rowtype;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    select * into v_settings from public.settings limit 1;

    select a.* into v_appointment
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    where a.id = p_appointment_id
      and c.auth_user_id = v_uid
    for update;

    if not found then
        raise exception 'Agendamento não encontrado.';
    end if;

    if v_appointment.status not in ('pending', 'confirmed') then
        raise exception 'Este agendamento não pode mais ser cancelado.';
    end if;

    if now() > v_appointment.starts_at - make_interval(hours => coalesce(v_settings.cancellation_notice_hours, 2)) then
        raise exception 'O prazo para cancelamento online já encerrou. Fale diretamente com a barbearia.';
    end if;

    update public.appointments
    set status = 'cancelled',
        updated_at = now()
    where id = p_appointment_id;

    return query
    select p_appointment_id, 'cancelled'::public.appointment_status;
end;
$$;

alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.plans enable row level security;

drop policy if exists "Profiles update own or admin" on public.profiles;
drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Customers update own" on public.customers;

drop policy if exists "Customers read own" on public.customers;
create policy "Customers read own"
on public.customers for select
to authenticated
using (auth_user_id = auth.uid());

drop policy if exists "Customers read own appointments" on public.appointments;
create policy "Customers read own appointments"
on public.appointments for select
to authenticated
using (
    exists (
        select 1
        from public.customers c
        where c.id = appointments.customer_id
          and c.auth_user_id = auth.uid()
    )
);

drop policy if exists "Customers read own subscriptions" on public.subscriptions;
create policy "Customers read own subscriptions"
on public.subscriptions for select
to authenticated
using (
    exists (
        select 1
        from public.customers c
        where c.id = subscriptions.customer_id
          and c.auth_user_id = auth.uid()
    )
);

drop policy if exists "Customers read own payments" on public.payments;
create policy "Customers read own payments"
on public.payments for select
to authenticated
using (
    exists (
        select 1
        from public.appointments a
        join public.customers c on c.id = a.customer_id
        where a.id = payments.appointment_id
          and c.auth_user_id = auth.uid()
    )
    or exists (
        select 1
        from public.subscriptions s
        join public.customers c on c.id = s.customer_id
        where s.id = payments.subscription_id
          and c.auth_user_id = auth.uid()
    )
);

drop policy if exists "Customers read historical services" on public.services;
create policy "Customers read historical services"
on public.services for select
to authenticated
using (
    active = true
    or exists (
        select 1
        from public.appointments a
        join public.customers c on c.id = a.customer_id
        where a.service_id = services.id
          and c.auth_user_id = auth.uid()
    )
);

drop policy if exists "Customers read active plans" on public.plans;
create policy "Customers read active plans"
on public.plans for select
to authenticated
using (
    active = true
    or exists (
        select 1
        from public.subscriptions s
        join public.customers c on c.id = s.customer_id
        where s.plan_id = plans.id
          and c.auth_user_id = auth.uid()
    )
);

revoke all on function public.create_public_appointment(uuid, timestamptz, text, text, text, text) from anon, authenticated;
revoke all on function public.sync_own_customer_profile(text, text, text, date, text) from public;
revoke all on function public.create_customer_appointment(uuid, timestamptz, text) from public;
revoke all on function public.cancel_own_appointment(uuid) from public;

grant execute on function public.sync_own_customer_profile(text, text, text, date, text) to authenticated;
grant execute on function public.create_customer_appointment(uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_own_appointment(uuid) to authenticated;

commit;
