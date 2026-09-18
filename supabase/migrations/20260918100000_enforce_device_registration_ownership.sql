-- Enforce one-time device ownership.
-- A device token may belong to exactly one student. Re-registration by the
-- same student is idempotent; attempting to assign it to another student fails.

CREATE OR REPLACE FUNCTION public.register_student_device(p_student_id text, p_name text, p_device_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_student public.students%rowtype;
  v_device public.student_devices%rowtype;
begin
  if p_student_id is null or btrim(p_student_id) = '' or
     p_name is null or btrim(p_name) = '' or
     p_device_token is null or btrim(p_device_token) = '' then
    raise exception 'student_id, name and device_token are required';
  end if;

  select * into v_device
  from public.student_devices
  where device_token = p_device_token
  limit 1;

  if found then
    if v_device.student_id <> p_student_id then
      raise exception 'This device is already registered to another student';
    end if;

    select * into v_student
    from public.students
    where student_id = v_device.student_id
    limit 1;

    return jsonb_build_object(
      'student_id', v_student.student_id,
      'name', v_student.name,
      'device_registered', true,
      'already_registered', true
    );
  end if;

  select * into v_student
  from public.students
  where student_id = p_student_id
  limit 1;

  if not found then
    insert into public.students(student_id, name, auth_user_id)
    values (p_student_id, p_name, auth.uid())
    returning * into v_student;
  end if;

  insert into public.student_devices(student_id, device_token, created_at)
  values (v_student.student_id, p_device_token, to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));

  return jsonb_build_object(
    'student_id', v_student.student_id,
    'name', v_student.name,
    'device_registered', true,
    'already_registered', false
  );
end;
$function$;