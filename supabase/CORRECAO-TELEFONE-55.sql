begin;

-- Padroniza telefones brasileiros como DDD + número, sem o código internacional 55.
create or replace function public.normalize_br_phone(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
    v_digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
    if left(v_digits, 4) = '0055' and length(v_digits) in (14, 15) then
        v_digits := substr(v_digits, 5);
    end if;

    if left(v_digits, 2) = '55' and length(v_digits) in (12, 13) then
        v_digits := substr(v_digits, 3);
    end if;

    if left(v_digits, 1) = '0' and length(v_digits) in (11, 12) then
        v_digits := substr(v_digits, 2);
    end if;

    if length(v_digits) > 11 then
        v_digits := right(v_digits, 11);
    end if;

    return v_digits;
end;
$$;

-- Corrige dados que não possuem restrição de unicidade.
update public.profiles
set phone = nullif(public.normalize_br_phone(phone), ''),
    updated_at = now()
where phone is distinct from nullif(public.normalize_br_phone(phone), '');

update public.settings
set phone_digits = nullif(public.normalize_br_phone(coalesce(phone_digits, phone_display)), ''),
    phone_display = case
        when length(public.normalize_br_phone(coalesce(phone_digits, phone_display))) = 11 then
            format('(%s) %s-%s',
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 1, 2),
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 3, 5),
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 8, 4)
            )
        when length(public.normalize_br_phone(coalesce(phone_digits, phone_display))) = 10 then
            format('(%s) %s-%s',
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 1, 2),
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 3, 4),
                substr(public.normalize_br_phone(coalesce(phone_digits, phone_display)), 7, 4)
            )
        else phone_display
    end,
    updated_at = now();

-- Corrige clientes quando não há outro registro equivalente que causaria conflito na chave única.
do $$
declare
    v_row record;
    v_phone text;
begin
    for v_row in select id, phone from public.customers loop
        v_phone := public.normalize_br_phone(v_row.phone);

        if length(v_phone) in (10, 11)
           and v_phone is distinct from v_row.phone
           and not exists (
                select 1
                from public.customers other
                where other.id <> v_row.id
                  and public.normalize_br_phone(other.phone) = v_phone
           ) then
            update public.customers
            set phone = v_phone,
                updated_at = now()
            where id = v_row.id;
        end if;
    end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name text;
    v_phone text;
    v_customer_id uuid;
begin
    v_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    v_phone := public.normalize_br_phone(new.raw_user_meta_data ->> 'phone');

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

    if length(v_phone) in (10, 11) then
        select c.id into v_customer_id
        from public.customers c
        where public.normalize_br_phone(c.phone) = v_phone
          and c.auth_user_id is null
          and lower(coalesce(c.email, '')) = lower(coalesce(new.email, ''))
        order by c.created_at
        limit 1;

        if v_customer_id is not null then
            update public.customers
            set auth_user_id = new.id,
                name = coalesce(nullif(v_name, ''), name),
                phone = v_phone,
                email = coalesce(new.email, email),
                updated_at = now()
            where id = v_customer_id;
        else
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
        raise exception 'Informe um WhatsApp válido com DDD.';
    end if;

    select email into v_email from auth.users where auth.users.id = v_uid;

    if exists (
        select 1
        from public.customers c
        where public.normalize_br_phone(c.phone) = v_phone
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
        select c.id into v_customer_id
        from public.customers c
        where public.normalize_br_phone(c.phone) = v_phone
          and c.auth_user_id is null
          and lower(coalesce(c.email, '')) = lower(coalesce(v_email, ''))
        order by c.created_at
        limit 1;

        if v_customer_id is not null then
            update public.customers
            set auth_user_id = v_uid,
                name = v_name,
                nickname = nullif(trim(coalesce(p_nickname, '')), ''),
                phone = v_phone,
                email = coalesce(v_email, email),
                birth_date = p_birth_date,
                style_preferences = nullif(trim(coalesce(p_style_preferences, '')), ''),
                updated_at = now()
            where public.customers.id = v_customer_id
            returning * into v_customer;
        elsif exists (
            select 1 from public.customers c
            where public.normalize_br_phone(c.phone) = v_phone
              and c.auth_user_id is null
        ) then
            raise exception 'Este WhatsApp já possui cadastro na barbearia. Peça ao Duin para vincular sua conta com segurança.';
        else
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

revoke all on function public.normalize_br_phone(text) from public, anon, authenticated;
revoke all on function public.sync_own_customer_profile(text, text, text, date, text) from public, anon;
grant execute on function public.sync_own_customer_profile(text, text, text, date, text) to authenticated;

commit;

notify pgrst, 'reload schema';
