begin;

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
begin
    if auth.uid() is null then
        raise exception 'Entre ou crie sua conta antes de agendar.';
    end if;

    return query
    select *
    from public.create_customer_appointment(
        p_service_id,
        p_starts_at,
        p_notes
    );
end;
$$;

grant usage on schema public to anon, authenticated;
revoke all on function public.get_available_slots(uuid, date) from public;
grant execute on function public.get_available_slots(uuid, date) to anon, authenticated;

revoke all on function public.create_customer_appointment(uuid, timestamptz, text) from public, anon;
grant execute on function public.create_customer_appointment(uuid, timestamptz, text) to authenticated;

revoke all on function public.sync_own_customer_profile(text, text, text, date, text) from public, anon;
grant execute on function public.sync_own_customer_profile(text, text, text, date, text) to authenticated;

revoke all on function public.cancel_own_appointment(uuid) from public, anon;
grant execute on function public.cancel_own_appointment(uuid) to authenticated;

revoke all on function public.create_public_appointment(uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.create_public_appointment(uuid, timestamptz, text, text, text, text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
