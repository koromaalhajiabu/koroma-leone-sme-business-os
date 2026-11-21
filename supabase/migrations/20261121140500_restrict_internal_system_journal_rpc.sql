-- Restrict the internal journal-posting helper to trusted server-side callers.
-- Business workflows and triggers invoke this function under their SECURITY DEFINER owner;
-- it is not a client RPC and has no independent business-role authorization check.
REVOKE ALL ON FUNCTION public.post_system_journal(uuid,date,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_system_journal(uuid,date,text,text,text,jsonb)
  TO service_role;
