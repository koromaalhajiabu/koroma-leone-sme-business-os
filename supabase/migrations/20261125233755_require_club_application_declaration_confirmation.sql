-- Require an affirmative club-representative declaration in the server-side submission RPC.
do $migration$
declare
  v_definition text;
  v_needle text := $needle$    if length(trim(coalesce(v_special_payload->>'authority_statement',''))) < 30 then raise exception 'Explain your authority to represent the club (at least 30 characters)'; end if;$needle$;
  v_replacement text;
begin
  select pg_get_functiondef(
    'public.submit_platform_business_application_unified(text,text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb)'::regprocedure
  ) into v_definition;
  if position(v_needle in v_definition)=0 then
    raise exception 'Could not locate the football club authority validation marker';
  end if;
  v_replacement := v_needle || E'\n    if coalesce((v_special_payload->>''declaration_confirmed'')::boolean,false) is not true then raise exception ''Confirm the club representative declaration before submitting''; end if;';
  execute replace(v_definition,v_needle,v_replacement);
end;
$migration$;
