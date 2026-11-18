begin;

-- Restrict parent-message updates to the read receipt column only.
-- The RLS policy controls which recipient row may be updated; column grants
-- prevent a recipient from editing the sender, recipient, student, subject or message.
revoke update on public.school_parent_messages from authenticated;
grant update (read_at) on public.school_parent_messages to authenticated;

drop policy if exists school_parent_messages_recipient_update on public.school_parent_messages;
create policy school_parent_messages_recipient_update
on public.school_parent_messages
for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

commit;
