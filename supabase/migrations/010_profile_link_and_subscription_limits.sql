begin;

-- Etapa 14
-- 1) Corrige o erro "column reference email is ambiguous" ao salvar Minha conta.
-- 2) Repara/garante o vínculo entre auth.users, profiles e customers.
-- 3) Impede reservar mais cortes mensais do que os usos disponíveis no ciclo.
-- 4) Evita acumular mensalidades enquanto já existe um plano ativo.

create or replace function public.normalize_br_phone(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
    v_raw text := trim(coalesce(p_value, ''));
    v_digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
    -- Prefixos internacionais digitados explicitamente.
    if v_raw ~ '^\s*\+\s*55' then
        v_digits := regexp_replace(v_raw, '^\s*\+\s*55', '');
        v_digits := regexp_replace(v_digits, '\D', '', 'g');
    elsif v_raw ~ '^\s*00\s*55' then
        v_digits := regexp_replace(v_raw, '^\s*00\s*55', '');
        v_digits := regexp_replace(v_digits, '\D', '', 'g');
    elsif left(v_digits, 4) = '0055' and length(v_digits) in (14, 15) then
        v_digits := substr(v_digits, 5);
    elsif left(v_digits, 2) = '55' and length(v_digits) in (12, 13) then
        v_digits := substr(v_digits, 3);
    end if;

    -- Zero de longa distância eventualmente colado antes do DDD.
    if left(v_digits, 1) = '0' and length(v_digits) in (11, 12) then
        v_digits := substr(v_digits, 2);
    end if;

    if length(v_digits) > 11 then
        v_digits := right(v_digits, 11);
    end if;

    return v_digits;
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
    v_phone text := public.normalize_br_phone(p_phone);
    v_customer public.customers%rowtype;
    v_customer_id uuid;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    if length(v_name) < 3 then
        raise exception 'Informe seu nome completo.';
    end if;

    if length(v_phone) not in (10, 11) then
        raise exception 'Informe o WhatsApp com DDD, sem o código 55. Ex.: 31 99999-9999.';
    end if;

    select u.email
      into v_email
      from auth.users as u
     where u.id = v_uid;

    if exists (
        select 1
          from public.customers as other_customer
         where public.normalize_br_phone(other_customer.phone) = v_phone
           and other_customer.auth_user_id is not null
           and other_customer.auth_user_id <> v_uid
    ) then
        raise exception 'Este WhatsApp já está vinculado a outra conta.';
    end if;

    insert into public.profiles as profile_row (
        id,
        full_name,
        email,
        phone,
        role,
        active
    ) values (
        v_uid,
        v_name,
        v_email,
        v_phone,
        'customer',
        true
    )
    on conflict (id) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           phone = excluded.phone,
           updated_at = now();

    select customer_row.*
      into v_customer
      from public.customers as customer_row
     where customer_row.auth_user_id = v_uid
     order by customer_row.created_at
     limit 1
     for update;

    if found then
        update public.customers as customer_row
           set name = v_name,
               nickname = nullif(trim(coalesce(p_nickname, '')), ''),
               phone = v_phone,
               email = coalesce(v_email, customer_row.email),
               birth_date = p_birth_date,
               style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
               updated_at = now()
         where customer_row.id = v_customer.id
        returning customer_row.* into v_customer;
    else
        select customer_row.id
          into v_customer_id
          from public.customers as customer_row
         where public.normalize_br_phone(customer_row.phone) = v_phone
           and customer_row.auth_user_id is null
           and (
               customer_row.email is null
               or v_email is null
               or lower(customer_row.email) = lower(v_email)
           )
         order by customer_row.created_at
         limit 1
         for update;

        if v_customer_id is not null then
            update public.customers as customer_row
               set auth_user_id = v_uid,
                   name = v_name,
                   nickname = nullif(trim(coalesce(p_nickname, '')), ''),
                   phone = v_phone,
                   email = coalesce(v_email, customer_row.email),
                   birth_date = p_birth_date,
                   style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
                   updated_at = now()
             where customer_row.id = v_customer_id
            returning customer_row.* into v_customer;
        elsif exists (
            select 1
              from public.customers as customer_row
             where public.normalize_br_phone(customer_row.phone) = v_phone
               and customer_row.auth_user_id is null
        ) then
            raise exception 'Este WhatsApp já possui outro cadastro na barbearia. Peça ao Duin para conferir o vínculo.';
        else
            insert into public.customers as customer_row (
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
            returning customer_row.* into v_customer;
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

-- Garante um customer vinculado usando os dados já salvos no perfil.
create or replace function public.ensure_own_customer()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_name text;
    v_phone text;
    v_customer_id uuid;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    select customer_row.id
      into v_customer_id
      from public.customers as customer_row
     where customer_row.auth_user_id = v_uid
     order by customer_row.created_at
     limit 1;

    if v_customer_id is not null then
        return v_customer_id;
    end if;

    select
        user_row.email,
        trim(coalesce(profile_row.full_name, user_row.raw_user_meta_data ->> 'full_name', '')),
        public.normalize_br_phone(coalesce(profile_row.phone, user_row.raw_user_meta_data ->> 'phone', ''))
      into v_email, v_name, v_phone
      from auth.users as user_row
      left join public.profiles as profile_row on profile_row.id = user_row.id
     where user_row.id = v_uid;

    if length(v_name) < 3 or length(v_phone) not in (10, 11) then
        raise exception 'Complete nome e WhatsApp na área Minha conta antes de agendar.';
    end if;

    if exists (
        select 1
          from public.customers as other_customer
         where public.normalize_br_phone(other_customer.phone) = v_phone
           and other_customer.auth_user_id is not null
           and other_customer.auth_user_id <> v_uid
    ) then
        raise exception 'Este WhatsApp já está vinculado a outra conta.';
    end if;

    select customer_row.id
      into v_customer_id
      from public.customers as customer_row
     where public.normalize_br_phone(customer_row.phone) = v_phone
       and customer_row.auth_user_id is null
       and (
           customer_row.email is null
           or v_email is null
           or lower(customer_row.email) = lower(v_email)
       )
     order by customer_row.created_at
     limit 1
     for update;

    if v_customer_id is not null then
        update public.customers as customer_row
           set auth_user_id = v_uid,
               name = coalesce(nullif(v_name, ''), customer_row.name),
               phone = v_phone,
               email = coalesce(v_email, customer_row.email),
               updated_at = now()
         where customer_row.id = v_customer_id;
        return v_customer_id;
    end if;

    if exists (
        select 1
          from public.customers as customer_row
         where public.normalize_br_phone(customer_row.phone) = v_phone
           and customer_row.auth_user_id is null
    ) then
        raise exception 'Este WhatsApp já possui outro cadastro na barbearia. Peça ao Duin para conferir o vínculo.';
    end if;

    insert into public.customers as customer_row (
        auth_user_id,
        name,
        phone,
        email
    ) values (
        v_uid,
        v_name,
        v_phone,
        v_email
    ) returning customer_row.id into v_customer_id;

    return v_customer_id;
end;
$$;

-- Os vínculos antigos são reparados sob demanda por sync_own_customer_profile
-- e ensure_own_customer, evitando associar automaticamente números duplicados.

-- Corrige o RPC de agendamento e reserva os usos mensais ainda não concluídos.
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
    v_reserved_uses integer := 0;
    v_cycle_limit integer := 0;
    v_available_uses integer := 0;
    v_appointment_id uuid;
    v_status public.appointment_status;
    v_payment_status public.payment_status;
    v_payment_method text;
    v_expires timestamptz;
    v_mode text := lower(trim(coalesce(p_billing_mode, 'salon')));
begin
    if v_uid is null then
        raise exception 'Faça login para agendar.';
    end if;

    if v_mode not in ('online', 'salon', 'subscription') then
        raise exception 'Forma de pagamento inválida.';
    end if;

    perform public.expire_online_booking_holds();

    select settings_row.*
      into v_settings
      from public.settings as settings_row
     limit 1;

    if not found or v_settings.accepting_bookings = false then
        raise exception 'A agenda online está pausada.';
    end if;

    if v_mode = 'online' and v_settings.online_payments_enabled = false then
        raise exception 'O pagamento online ainda não está disponível.';
    end if;

    v_customer_id := public.ensure_own_customer();

    select service_row.*
      into v_service
      from public.services as service_row
     where service_row.id = p_service_id
       and service_row.active = true;

    if not found then
        raise exception 'Serviço indisponível.';
    end if;

    perform pg_advisory_xact_lock(hashtext(p_service_id::text || p_starts_at::text));

    if not exists (
        select 1
          from public.get_available_slots(
              p_service_id,
              (p_starts_at at time zone v_settings.timezone)::date
          ) as available_slot
         where available_slot.starts_at = p_starts_at
    ) then
        raise exception 'Este horário não está mais disponível.';
    end if;

    if v_mode = 'subscription' then
        select subscription_row.*
          into v_subscription
          from public.subscriptions as subscription_row
         where subscription_row.customer_id = v_customer_id
           and subscription_row.status = 'active'
           and subscription_row.remaining_uses > 0
           and subscription_row.starts_on <= (p_starts_at at time zone v_settings.timezone)::date
           and (
               subscription_row.ends_on is null
               or subscription_row.ends_on >= (p_starts_at at time zone v_settings.timezone)::date
           )
         order by subscription_row.ends_on nulls last, subscription_row.created_at
         limit 1
         for update;

        if not found then
            raise exception 'Você não possui mensalidade ativa com uso disponível.';
        end if;

        select coalesce(plan_row.cuts_included, v_subscription.remaining_uses)
          into v_cycle_limit
          from public.plans as plan_row
         where plan_row.id = v_subscription.plan_id;

        v_cycle_limit := least(v_subscription.remaining_uses, coalesce(v_cycle_limit, v_subscription.remaining_uses));

        select count(*)::integer
          into v_reserved_uses
          from public.appointments as appointment_row
         where appointment_row.subscription_id = v_subscription.id
           and appointment_row.billing_mode = 'subscription'
           and appointment_row.status in ('pending', 'confirmed')
           and appointment_row.subscription_use_consumed = false;

        v_available_uses := greatest(v_cycle_limit - v_reserved_uses, 0);

        if v_available_uses <= 0 then
            raise exception 'Todos os % cortes deste ciclo já foram usados ou reservados. Cancele um horário futuro ou aguarde a próxima mensalidade.', v_cycle_limit;
        end if;

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

    insert into public.appointments as appointment_row (
        customer_id,
        service_id,
        starts_at,
        ends_at,
        status,
        source,
        notes,
        total_amount,
        payment_status,
        payment_method,
        created_by,
        billing_mode,
        subscription_id,
        reservation_expires_at
    ) values (
        v_customer_id,
        v_service.id,
        p_starts_at,
        p_starts_at + make_interval(mins => v_service.duration_minutes),
        v_status,
        'site',
        nullif(trim(coalesce(p_notes, '')), ''),
        v_service.price,
        v_payment_status,
        v_payment_method,
        v_uid,
        v_mode,
        case when v_mode = 'subscription' then v_subscription.id else null end,
        v_expires
    ) returning appointment_row.id into v_appointment_id;

    if v_mode in ('online', 'salon') then
        insert into public.payments (
            appointment_id,
            amount,
            method,
            status,
            provider
        ) values (
            v_appointment_id,
            v_service.price,
            v_payment_method,
            v_payment_status,
            case when v_mode = 'online' then 'infinitepay' else null end
        );
    end if;

    return query
    select
        v_appointment_id,
        v_status,
        p_starts_at,
        v_mode,
        v_mode = 'online',
        case when v_mode = 'subscription' then v_subscription.id else null end,
        v_expires;
end;
$$;

-- Não deixa contratar outro plano enquanto ainda existe uma mensalidade vigente.
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
    v_today date;
begin
    if v_uid is null then
        raise exception 'Faça login para contratar um plano.';
    end if;

    if v_choice not in ('online', 'cash') then
        raise exception 'Forma de pagamento inválida.';
    end if;

    select settings_row.*
      into v_settings
      from public.settings as settings_row
     limit 1;

    if not found or v_settings.subscription_sales_enabled = false then
        raise exception 'A contratação de mensalidade está pausada.';
    end if;

    if v_choice = 'online' and v_settings.online_payments_enabled = false then
        raise exception 'O pagamento online ainda não está disponível.';
    end if;

    v_customer_id := public.ensure_own_customer();
    v_today := (now() at time zone coalesce(v_settings.timezone, 'America/Sao_Paulo'))::date;

    select plan_row.*
      into v_plan
      from public.plans as plan_row
     where plan_row.id = p_plan_id
       and plan_row.active = true;

    if not found then
        raise exception 'Plano indisponível.';
    end if;

    if exists (
        select 1
          from public.subscriptions as subscription_row
         where subscription_row.customer_id = v_customer_id
           and subscription_row.status = 'active'
           and (
               subscription_row.ends_on is null
               or subscription_row.ends_on >= v_today
           )
    ) then
        raise exception 'Você já possui uma mensalidade ativa. A nova contratação ficará disponível após o fim do ciclo atual.';
    end if;

    if exists (
        select 1
          from public.subscription_requests as request_row
         where request_row.customer_id = v_customer_id
           and request_row.plan_id = p_plan_id
           and request_row.status in ('pending_payment', 'pending_approval')
    ) then
        raise exception 'Já existe uma solicitação deste plano em andamento.';
    end if;

    insert into public.subscription_requests (
        customer_id,
        plan_id,
        payment_choice,
        status,
        amount,
        order_nsu
    ) values (
        v_customer_id,
        v_plan.id,
        v_choice,
        case when v_choice = 'online' then 'pending_payment' else 'pending_approval' end,
        v_plan.price,
        case when v_choice = 'online' then 'sub-' || gen_random_uuid()::text else null end
    ) returning * into v_request;

    return query
    select
        v_request.id,
        v_request.status,
        v_request.payment_choice,
        v_request.amount,
        v_choice = 'online';
end;
$$;

-- Cada aprovação abre um novo ciclo com exatamente os usos do plano, sem acumular saldo.
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
    select request_row.*
      into v_request
      from public.subscription_requests as request_row
     where request_row.id = p_request_id
     for update;

    if not found then
        raise exception 'Solicitação de plano não encontrada.';
    end if;

    if v_request.status = 'approved' and v_request.subscription_id is not null then
        return v_request.subscription_id;
    end if;

    if v_request.status in ('rejected', 'cancelled', 'expired') then
        raise exception 'Esta solicitação não pode ser aprovada.';
    end if;

    select plan_row.*
      into v_plan
      from public.plans as plan_row
     where plan_row.id = v_request.plan_id;

    select settings_row.timezone
      into v_timezone
      from public.settings as settings_row
     limit 1;

    v_today := (now() at time zone coalesce(v_timezone, 'America/Sao_Paulo'))::date;

    select subscription_row.*
      into v_subscription
      from public.subscriptions as subscription_row
     where subscription_row.customer_id = v_request.customer_id
       and subscription_row.plan_id = v_request.plan_id
     order by subscription_row.created_at desc
     limit 1
     for update;

    if found then
        update public.subscriptions as subscription_row
           set starts_on = v_today,
               ends_on = (v_today + interval '1 month')::date,
               status = 'active',
               remaining_uses = v_plan.cuts_included,
               updated_at = now()
         where subscription_row.id = v_subscription.id
        returning subscription_row.* into v_subscription;
    else
        insert into public.subscriptions (
            customer_id,
            plan_id,
            starts_on,
            ends_on,
            status,
            remaining_uses
        ) values (
            v_request.customer_id,
            v_request.plan_id,
            v_today,
            (v_today + interval '1 month')::date,
            'active',
            v_plan.cuts_included
        ) returning * into v_subscription;
    end if;

    insert into public.payments (
        subscription_id,
        amount,
        method,
        status,
        paid_at,
        external_reference,
        provider,
        receipt_url,
        capture_method
    ) values (
        v_subscription.id,
        v_request.amount,
        p_method,
        'paid',
        now(),
        p_external_reference,
        case when p_method in ('pix', 'credit_card') then 'infinitepay' else null end,
        p_receipt_url,
        p_method
    );

    insert into public.cash_movements (
        type,
        category,
        description,
        amount,
        movement_date,
        payment_method,
        subscription_id,
        subscription_request_id,
        created_by,
        origin
    ) values (
        'income',
        'Mensalidade',
        'Mensalidade recebida',
        v_request.amount,
        v_today,
        p_method,
        v_subscription.id,
        v_request.id,
        auth.uid(),
        'subscription'
    )
    on conflict (subscription_request_id)
    where subscription_request_id is not null
      and type = 'income'
      and origin = 'subscription'
    do update set
        amount = excluded.amount,
        movement_date = excluded.movement_date,
        payment_method = excluded.payment_method;

    update public.subscription_requests as request_row
       set status = 'approved',
           subscription_id = v_subscription.id,
           reviewed_at = now(),
           reviewed_by = coalesce(auth.uid(), request_row.reviewed_by),
           updated_at = now()
     where request_row.id = v_request.id;

    return v_subscription.id;
end;
$$;

-- Limita saldos antigos acumulados ao número de cortes do plano atual.
update public.subscriptions as subscription_row
   set remaining_uses = least(subscription_row.remaining_uses, plan_row.cuts_included),
       updated_at = now()
  from public.plans as plan_row
 where plan_row.id = subscription_row.plan_id
   and subscription_row.remaining_uses > plan_row.cuts_included;

revoke all on function public.normalize_br_phone(text) from public, anon, authenticated;
revoke all on function public.ensure_own_customer() from public, anon, authenticated;
revoke all on function public.sync_own_customer_profile(text, text, text, date, text) from public, anon;
revoke all on function public.create_customer_appointment_v2(uuid, timestamptz, text, text) from public, anon;
revoke all on function public.create_subscription_request(uuid, text) from public, anon;
revoke all on function public.activate_subscription_request(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.sync_own_customer_profile(text, text, text, date, text) to authenticated;
grant execute on function public.create_customer_appointment_v2(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.create_subscription_request(uuid, text) to authenticated;
grant execute on function public.activate_subscription_request(uuid, text, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
