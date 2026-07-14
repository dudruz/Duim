begin;

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
    select * into v_settings
    from public.settings
    limit 1;

    if not found or v_settings.accepting_bookings = false then
        return;
    end if;

    v_today := (now() at time zone v_settings.timezone)::date;

    if p_date < v_today
       or p_date > v_today + v_settings.booking_window_days then
        return;
    end if;

    select * into v_service
    from public.services
    where id = p_service_id
      and active = true;

    if not found then
        return;
    end if;

    select * into v_hours
    from public.business_hours
    where weekday = extract(dow from p_date)::smallint
      and is_open = true;

    if not found then
        return;
    end if;

    v_duration := make_interval(mins => v_service.duration_minutes);
    v_step := make_interval(mins => v_settings.slot_interval_minutes);

    v_open := (p_date + v_hours.opens_at) at time zone v_settings.timezone;
    v_close := (p_date + v_hours.closes_at) at time zone v_settings.timezone;

    if v_hours.break_start is not null and v_hours.break_end is not null then
        v_break_start := (p_date + v_hours.break_start) at time zone v_settings.timezone;
        v_break_end := (p_date + v_hours.break_end) at time zone v_settings.timezone;
    end if;

    return query
    select candidate as starts_at,
           candidate + v_duration as ends_at
    from generate_series(v_open, v_close - v_duration, v_step) as candidate
    where candidate >= now() + make_interval(mins => v_settings.booking_notice_minutes)
      and (
          v_break_start is null
          or not tstzrange(candidate, candidate + v_duration, '[)')
              && tstzrange(v_break_start, v_break_end, '[)')
      )
      and not exists (
          select 1
          from public.blocked_periods bp
          where tstzrange(candidate, candidate + v_duration, '[)')
                && tstzrange(bp.starts_at, bp.ends_at, '[)')
      )
      and not exists (
          select 1
          from public.appointments a
          where a.status in ('pending', 'confirmed')
            and tstzrange(candidate, candidate + v_duration, '[)')
                && tstzrange(a.starts_at, a.ends_at, '[)')
      )
    order by candidate;
end;
$$;

create or replace function public.create_public_appointment(
    p_service_id uuid,
    p_starts_at timestamptz,
    p_customer_name text,
    p_customer_phone text,
    p_customer_email text default null,
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
    v_settings public.settings%rowtype;
    v_service public.services%rowtype;
    v_customer_id uuid;
    v_phone text;
    v_appointment_id uuid;
begin
    select * into v_settings
    from public.settings
    limit 1;

    if not found or v_settings.accepting_bookings = false then
        raise exception 'A agenda online está pausada.';
    end if;

    if length(trim(coalesce(p_customer_name, ''))) < 3 then
        raise exception 'Informe o nome completo.';
    end if;

    v_phone := regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g');
    if length(v_phone) < 10 then
        raise exception 'Informe um WhatsApp válido.';
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

    insert into public.customers (name, phone, email)
    values (
        trim(p_customer_name),
        v_phone,
        nullif(trim(coalesce(p_customer_email, '')), '')
    )
    on conflict (phone) do update
    set name = excluded.name,
        email = coalesce(excluded.email, public.customers.email),
        updated_at = now()
    returning id into v_customer_id;

    insert into public.appointments (
        customer_id,
        service_id,
        starts_at,
        ends_at,
        status,
        source,
        notes,
        total_amount,
        payment_status
    )
    values (
        v_customer_id,
        v_service.id,
        p_starts_at,
        p_starts_at + make_interval(mins => v_service.duration_minutes),
        'confirmed',
        'site',
        nullif(trim(coalesce(p_notes, '')), ''),
        v_service.price,
        'unpaid'
    )
    returning id into v_appointment_id;

    return query
    select v_appointment_id, 'confirmed'::public.appointment_status, p_starts_at;
end;
$$;

revoke all on function public.get_available_slots(uuid, date) from public;
grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;

revoke all on function public.create_public_appointment(uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_public_appointment(uuid, timestamptz, text, text, text, text) to anon, authenticated;

commit;
