-- Green Lab attendance: enforce a server-side two-hour attendance window.
--
-- An entry creates a session with an expires_at exactly two hours later.
-- Supabase Cron closes expired sessions automatically, independently of any
-- student's browser/device. Manual exits before expiry remain manual exits.
--
-- The API uses *_v2 functions below so the existing RPCs can remain available
-- while this feature is introduced.

create extension if not exists pg_cron;

alter table public.attendance_sessions
  add column if not exists expires_at timestamptz;

alter table public.attendance_sessions
  add column if not exists exit_type text;

alter table public.attendance_sessions
  add constraint attendance_sessions_exit_type_check
  check (exit_type is null or exit_type in ('manual', 'automatic'));

create index if not exists idx_attendance_sessions_expires_at
  on public.attendance_sessions (expires_at)
  where exit_time is null;

-- Parse the legacy text timestamp format used by this application.
-- Timestamp strings containing an explicit timezone are parsed as-is.
-- Timezone-less legacy values are interpreted as Asia/Kolkata.
create or replace function public.green_lab_attendance_entry_instant(
  p_entry_time text
)
returns timestamptz
language plpgsql
immutable
set search_path to ''
as $function$
begin
  if p_entry_time is null or btrim(p_entry_time) = '' then
    return null;
  end if;

  if p_entry_time ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then
    return p_entry_time::timestamptz;
  end if;

  return p_entry_time::timestamp at time zone 'Asia/Kolkata';
exception
  when others then
    return null;
end;
$function$;

-- Close every session whose two-hour window has elapsed.
-- exit_time is written as the exact expiry timestamp, so a cron run that is
-- delayed by a few seconds does not give the student extra attendance time.
create or replace function public.expire_attendance_sessions()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_updated integer;
begin
  with expired as (
    select
      s.id,
      coalesce(
        s.expires_at,
        public.green_lab_attendance_entry_instant(s.entry_time)
          + interval '2 hours'
      ) as expires_at
    from public.attendance_sessions s
    where s.exit_time is null
      and coalesce(
        s.expires_at,
        public.green_lab_attendance_entry_instant(s.entry_time)
          + interval '2 hours'
      ) <= clock_timestamp()
  )
  update public.attendance_sessions s
     set expires_at = expired.expires_at,
         exit_time = to_char(
           expired.expires_at at time zone 'UTC',
           'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
         ),
         duration_minutes = 120,
         exit_type = 'automatic'
    from expired
   where s.id = expired.id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$function$;

-- Current attendance state. This also performs a synchronous expiry check, so
-- the two-hour rule remains authoritative even if a cron tick has not run yet.
create or replace function public.attendance_current_by_device_v2(
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student record;
  v_session record;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'Device is not registered';
  end if;

  perform public.expire_attendance_sessions();

  select
    s.student_id,
    s.name
  into v_student
  from public.student_devices d
  join public.students s
    on s.student_id = d.student_id
  where d.device_token = p_device_token
    and s.auth_user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Student/device registration not found';
  end if;

  select
    a.id,
    a.entry_time,
    a.expires_at,
    a.duration_minutes
  into v_session
  from public.attendance_sessions a
  where a.student_id = v_student.student_id
    and a.exit_time is null
  order by a.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'inside_lab', false,
      'student_id', v_student.student_id,
      'name', v_student.name,
      'session', null
    );
  end if;

  v_expires_at := coalesce(
    v_session.expires_at,
    public.green_lab_attendance_entry_instant(v_session.entry_time)
      + interval '2 hours'
  );

  if v_expires_at <= clock_timestamp() then
    perform public.expire_attendance_sessions();

    select
      a.id,
      a.entry_time,
      a.expires_at,
      a.duration_minutes
    into v_session
    from public.attendance_sessions a
    where a.student_id = v_student.student_id
      and a.exit_time is null
    order by a.id desc
    limit 1;

    if not found then
      return jsonb_build_object(
        'inside_lab', false,
        'student_id', v_student.student_id,
        'name', v_student.name,
        'session', null
      );
    end if;

    v_expires_at := v_session.expires_at;
  end if;

  return jsonb_build_object(
    'inside_lab', true,
    'student_id', v_student.student_id,
    'name', v_student.name,
    'session', jsonb_build_object(
      'entry_time', v_session.entry_time,
      'expires_at', v_expires_at,
      'duration_minutes', v_session.duration_minutes
    )
  );
end;
$function$;

-- Record a new entry. The two-hour expiry is generated by the database.
create or replace function public.attendance_entry_by_device_v2(
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student record;
  v_active record;
  v_entry_at timestamptz;
  v_expires_at timestamptz;
  v_entry_text text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'Device is not registered';
  end if;

  perform public.expire_attendance_sessions();

  select
    s.student_id,
    s.name
  into v_student
  from public.student_devices d
  join public.students s
    on s.student_id = d.student_id
  where d.device_token = p_device_token
    and s.auth_user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Student/device registration not found';
  end if;

  select a.id, a.entry_time, a.expires_at
    into v_active
  from public.attendance_sessions a
  where a.student_id = v_student.student_id
    and a.exit_time is null
  order by a.id desc
  limit 1
  for update;

  if found then
    raise exception 'You are already inside Green Lab';
  end if;

  v_entry_at := clock_timestamp();
  v_expires_at := v_entry_at + interval '2 hours';
  v_entry_text := to_char(
    v_entry_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  insert into public.attendance_sessions (
    student_id,
    entry_time,
    exit_time,
    duration_minutes,
    expires_at,
    exit_type
  )
  values (
    v_student.student_id,
    v_entry_text,
    null,
    null,
    v_expires_at,
    null
  );

  return jsonb_build_object(
    'action', 'entry',
    'student_id', v_student.student_id,
    'name', v_student.name,
    'entry_time', v_entry_text,
    'expires_at', v_expires_at
  );
end;
$function$;

-- Record a manual exit before expiry. If the two-hour window has already
-- elapsed, the function closes it as an automatic exit instead.
create or replace function public.attendance_exit_by_device_v2(
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student record;
  v_session record;
  v_expires_at timestamptz;
  v_now timestamptz;
  v_duration integer;
  v_exit_text text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'Device is not registered';
  end if;

  perform public.expire_attendance_sessions();

  select
    s.student_id,
    s.name
  into v_student
  from public.student_devices d
  join public.students s
    on s.student_id = d.student_id
  where d.device_token = p_device_token
    and s.auth_user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Student/device registration not found';
  end if;

  select
    a.id,
    a.entry_time,
    a.expires_at
  into v_session
  from public.attendance_sessions a
  where a.student_id = v_student.student_id
    and a.exit_time is null
  order by a.id desc
  limit 1
  for update;

  if not found then
    raise exception 'No active entry found';
  end if;

  v_expires_at := coalesce(
    v_session.expires_at,
    public.green_lab_attendance_entry_instant(v_session.entry_time)
      + interval '2 hours'
  );

  v_now := clock_timestamp();

  if v_expires_at is not null and v_expires_at <= v_now then
    v_exit_text := to_char(
      v_expires_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    update public.attendance_sessions
       set expires_at = v_expires_at,
           exit_time = v_exit_text,
           duration_minutes = 120,
           exit_type = 'automatic'
     where id = v_session.id;

    return jsonb_build_object(
      'action', 'automatic_exit',
      'student_id', v_student.student_id,
      'name', v_student.name,
      'entry_time', v_session.entry_time,
      'exit_time', v_exit_text,
      'expires_at', v_expires_at,
      'duration_minutes', 120,
      'exit_type', 'automatic'
    );
  end if;

  v_duration := greatest(
    0,
    least(
      120,
      floor(
        extract(
          epoch from (
            v_now - (v_expires_at - interval '2 hours')
          )
        ) / 60
      )
    )
  )::integer;

  v_exit_text := to_char(
    v_now at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  update public.attendance_sessions
     set expires_at = v_expires_at,
         exit_time = v_exit_text,
         duration_minutes = v_duration,
         exit_type = 'manual'
   where id = v_session.id;

  return jsonb_build_object(
    'action', 'manual_exit',
    'student_id', v_student.student_id,
    'name', v_student.name,
    'entry_time', v_session.entry_time,
    'exit_time', v_exit_text,
    'expires_at', v_expires_at,
    'duration_minutes', v_duration,
    'exit_type', 'manual'
  );
end;
$function$;

create or replace function public.attendance_history_by_device_v2(
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student record;
  v_history jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'Device is not registered';
  end if;

  perform public.expire_attendance_sessions();

  select
    s.student_id,
    s.name
  into v_student
  from public.student_devices d
  join public.students s
    on s.student_id = d.student_id
  where d.device_token = p_device_token
    and s.auth_user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Student/device registration not found';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', v_student.student_id,
        'name', v_student.name,
        'entry_time', a.entry_time,
        'exit_time', a.exit_time,
        'expires_at', a.expires_at,
        'duration_minutes', a.duration_minutes,
        'exit_type', a.exit_type
      )
      order by a.id desc
    ),
    '[]'::jsonb
  )
  into v_history
  from public.attendance_sessions a
  where a.student_id = v_student.student_id;

  return v_history;
end;
$function$;

revoke all on function public.green_lab_attendance_entry_instant(text)
  from public;

revoke all on function public.expire_attendance_sessions()
  from public;

revoke all on function public.attendance_current_by_device_v2(text)
  from public;
revoke all on function public.attendance_entry_by_device_v2(text)
  from public;
revoke all on function public.attendance_exit_by_device_v2(text)
  from public;
revoke all on function public.attendance_history_by_device_v2(text)
  from public;

grant execute on function public.attendance_current_by_device_v2(text)
  to authenticated;
grant execute on function public.attendance_entry_by_device_v2(text)
  to authenticated;
grant execute on function public.attendance_exit_by_device_v2(text)
  to authenticated;
grant execute on function public.attendance_history_by_device_v2(text)
  to authenticated;

-- Supabase Cron runs this independently of every student's browser/device.
-- The exact expiry timestamp is stored on the attendance row.
select cron.schedule(
  'green-lab-attendance-auto-exit',
  '* * * * *',
  'select public.expire_attendance_sessions();'
);
