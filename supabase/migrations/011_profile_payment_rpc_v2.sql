begin;

-- ETAPA 15
-- Corrige de forma isolada:
-- 1) salvamento de Minha conta;
-- 2) vínculo automático entre auth.users, profiles e customers;
-- 3) contratação de mensalidade sem criar solicitações duplicadas;
-- 4) agendamento pré-pago sem falso aviso de perfil incompleto.
--
-- As novas RPCs retornam JSONB para evitar incompatibilidades de tipo no PostgREST.

create or replace function public.normalize_br_phone(p_value text)
returns text
language plpgsql
immutable
as $$
declare
    v_digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
    if left(v_digits, 4) = '0055' and length(v_digits) in (14, 15) then
        v_digits := substr(v_digits, 5);
    elsif left(v_digits, 2) = '55' and length(v_digits) in (12, 13) then
        v_digits := substr(v_digits, 3);
    end if;

    while left(v_digits, 1) = '0' and length(v_digits) > 11 loop
        v_digits := substr(v_digits, 2);
    end loop;

    if length(v_digits) > 11 then
        v_digits := right(v_digits, 11);
    end if;

    return v_digits;
end;
$$;

create or replace function public.sync_own_customer_profile_v2(
    p_full_name text,
    p_phone text,
    p_nickname text default null,
    p_birth_date date default null,
    p_style_preferences text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_name text := trim(coalesce(p_full_name, ''));
    v_phone text := public.normalize_br_phone(p_phone);
    v_customer public.customers%rowtype;
    v_candidate_id uuid;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    if length(v_name) < 3 then
        raise exception 'Informe seu nome completo.';
    end if;

    if length(v_phone) not in (10, 11) then
        raise exception 'Informe o WhatsApp com DDD, sem o código 55. Ex.: (31) 99999-9999.';
    end if;

    select auth_user.email
      into v_email
      from auth.users as auth_user
     where auth_user.id = v_uid;

    if exists (
        select 1
          from public.customers as linked_customer
         where public.normalize_br_phone(linked_customer.phone) = v_phone
           and linked_customer.auth_user_id is not null
           and linked_customer.auth_user_id <> v_uid
    ) then
        raise exception 'Este WhatsApp já está vinculado a outra conta.';
    end if;

    insert into public.profiles (
        id, full_name, email, phone, role, active
    ) values (
        v_uid, v_name, v_email, v_phone, 'customer', true
    )
    on conflict (id) do update
       set full_name = excluded.full_name,
           email = excluded.email,
           phone = excluded.phone,
           updated_at = now();

    update auth.users as auth_user
       set raw_user_meta_data = coalesce(auth_user.raw_user_meta_data, '{}'::jsonb)
            || jsonb_build_object('full_name', v_name, 'phone', v_phone),
           updated_at = now()
     where auth_user.id = v_uid;

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
        -- Primeiro reaproveita um cadastro do salão pelo mesmo telefone.
        select customer_row.id
          into v_candidate_id
          from public.customers as customer_row
         where customer_row.auth_user_id is null
           and public.normalize_br_phone(customer_row.phone) = v_phone
         order by customer_row.created_at
         limit 1
         for update;

        -- Se não encontrou pelo telefone, tenta um cadastro antigo pelo mesmo e-mail.
        if v_candidate_id is null and v_email is not null then
            select customer_row.id
              into v_candidate_id
              from public.customers as customer_row
             where customer_row.auth_user_id is null
               and customer_row.email is not null
               and lower(customer_row.email) = lower(v_email)
             order by customer_row.created_at
             limit 1
             for update;
        end if;

        if v_candidate_id is not null then
            update public.customers as customer_row
               set auth_user_id = v_uid,
                   name = v_name,
                   nickname = nullif(trim(coalesce(p_nickname, '')), ''),
                   phone = v_phone,
                   email = coalesce(v_email, customer_row.email),
                   birth_date = p_birth_date,
                   style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
                   updated_at = now()
             where customer_row.id = v_candidate_id
            returning customer_row.* into v_customer;
        else
            insert into public.customers (
                auth_user_id, name, nickname, phone, email, birth_date, style_preferences
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

    return jsonb_build_object(
        'id', v_customer.id,
        'auth_user_id', v_customer.auth_user_id,
        'name', v_customer.name,
        'nickname', v_customer.nickname,
        'phone', v_customer.phone,
        'email', v_customer.email,
        'birth_date', v_customer.birth_date,
        'style_preferences', v_customer.style_preferences
    );
end;
$$;

create or replace function public.ensure_own_customer_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_email text;
    v_name text;
    v_phone text;
    v_customer public.customers%rowtype;
    v_candidate_id uuid;
begin
    if v_uid is null then
        raise exception 'Faça login para continuar.';
    end if;

    select customer_row.*
      into v_customer
      from public.customers as customer_row
     where customer_row.auth_user_id = v_uid
     order by customer_row.created_at
     limit 1;

    if found then
        return to_jsonb(v_customer);
    end if;

    select
        auth_user.email,
        trim(coalesce(profile_row.full_name, auth_user.raw_user_meta_data ->> 'full_name', '')),
        public.normalize_br_phone(coalesce(profile_row.phone, auth_user.raw_user_meta_data ->> 'phone', ''))
      into v_email, v_name, v_phone
      from auth.users as auth_user
      left join public.profiles as profile_row on profile_row.id = auth_user.id
     where auth_user.id = v_uid;

    if length(v_name) < 3 or length(v_phone) not in (10, 11) then
        raise exception 'Complete nome e WhatsApp na área Minha conta antes de agendar.';
    end if;

    if exists (
        select 1
          from public.customers as linked_customer
         where public.normalize_br_phone(linked_customer.phone) = v_phone
           and linked_customer.auth_user_id is not null
           and linked_customer.auth_user_id <> v_uid
    ) then
        raise exception 'Este WhatsApp já está vinculado a outra conta.';
    end if;

    select customer_row.id
      into v_candidate_id
      from public.customers as customer_row
     where customer_row.auth_user_id is null
       and public.normalize_br_phone(customer_row.phone) = v_phone
     order by customer_row.created_at
     limit 1
     for update;

    if v_candidate_id is null and v_email is not null then
        select customer_row.id
          into v_candidate_id
          from public.customers as customer_row
         where customer_row.auth_user_id is null
           and customer_row.email is not null
           and lower(customer_row.email) = lower(v_email)
         order by customer_row.created_at
         limit 1
         for update;
    end if;

    if v_candidate_id is not null then
        update public.customers as customer_row
           set auth_user_id = v_uid,
               name = v_name,
               phone = v_phone,
               email = coalesce(v_email, customer_row.email),
               updated_at = now()
         where customer_row.id = v_candidate_id
        returning customer_row.* into v_customer;
    else
        insert into public.customers (
            auth_user_id, name, phone, email
        ) values (
            v_uid, v_name, v_phone, v_email
        )
        returning * into v_customer;
    end if;

    return to_jsonb(v_customer);
end;
$$;

create or replace function public.create_subscription_request_v2(
    p_plan_id uuid,
    p_payment_choice text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_customer jsonb;
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

    if not found or coalesce(v_settings.subscription_sales_enabled, false) = false then
        raise exception 'A contratação de mensalidade está pausada.';
    end if;

    if v_choice = 'online' and coalesce(v_settings.online_payments_enabled, false) = false then
        raise exception 'O pagamento online ainda não está disponível.';
    end if;

    v_customer := public.ensure_own_customer_v2();
    v_customer_id := (v_customer ->> 'id')::uuid;
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
           and subscription_row.starts_on <= v_today
           and (subscription_row.ends_on is null or subscription_row.ends_on >= v_today)
    ) then
        raise exception 'Você já possui uma mensalidade ativa. Aguarde o fim do ciclo atual para contratar outra.';
    end if;

    -- Em vez de gerar erro 400 por clique repetido, reutiliza a solicitação aberta.
    select request_row.*
      into v_request
      from public.subscription_requests as request_row
     where request_row.customer_id = v_customer_id
       and request_row.plan_id = v_plan.id
       and request_row.payment_choice = v_choice
       and request_row.status in ('pending_payment', 'pending_approval')
     order by request_row.requested_at desc
     limit 1;

    if found then
        return jsonb_build_object(
            'request_id', v_request.id,
            'status', v_request.status,
            'payment_choice', v_request.payment_choice,
            'amount', v_request.amount,
            'requires_checkout', v_request.payment_choice = 'online',
            'checkout_url', v_request.checkout_url,
            'reused', true
        );
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
    )
    returning * into v_request;

    return jsonb_build_object(
        'request_id', v_request.id,
        'status', v_request.status,
        'payment_choice', v_request.payment_choice,
        'amount', v_request.amount,
        'requires_checkout', v_request.payment_choice = 'online',
        'checkout_url', v_request.checkout_url,
        'reused', false
    );
end;
$$;

create or replace function public.create_customer_appointment_v3(
    p_service_id uuid,
    p_starts_at timestamptz,
    p_notes text default null,
    p_billing_mode text default 'salon'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid uuid := auth.uid();
    v_settings public.settings%rowtype;
    v_service public.services%rowtype;
    v_customer jsonb;
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

    if v_mode = 'online' and coalesce(v_settings.online_payments_enabled, false) = false then
        raise exception 'O pagamento online ainda não está disponível.';
    end if;

    v_customer := public.ensure_own_customer_v2();
    v_customer_id := (v_customer ->> 'id')::uuid;

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
            raise exception 'Todos os % cortes deste ciclo já foram usados ou reservados.', v_cycle_limit;
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
    )
    returning id into v_appointment_id;

    if v_mode in ('online', 'salon') then
        insert into public.payments (
            appointment_id, amount, method, status, provider
        ) values (
            v_appointment_id,
            v_service.price,
            v_payment_method,
            v_payment_status,
            case when v_mode = 'online' then 'infinitepay' else null end
        );
    end if;

    return jsonb_build_object(
        'appointment_id', v_appointment_id,
        'status', v_status,
        'starts_at', p_starts_at,
        'billing_mode', v_mode,
        'requires_checkout', v_mode = 'online',
        'subscription_id', case when v_mode = 'subscription' then v_subscription.id else null end,
        'reservation_expires_at', v_expires
    );
end;
$$;

revoke all on function public.sync_own_customer_profile_v2(text, text, text, date, text) from public, anon;
revoke all on function public.ensure_own_customer_v2() from public, anon;
revoke all on function public.create_subscription_request_v2(uuid, text) from public, anon;
revoke all on function public.create_customer_appointment_v3(uuid, timestamptz, text, text) from public, anon;

grant execute on function public.sync_own_customer_profile_v2(text, text, text, date, text) to authenticated;
grant execute on function public.ensure_own_customer_v2() to authenticated;
grant execute on function public.create_subscription_request_v2(uuid, text) to authenticated;
grant execute on function public.create_customer_appointment_v3(uuid, timestamptz, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
