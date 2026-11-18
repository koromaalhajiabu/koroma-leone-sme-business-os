-- Allow a message recipient to mark their own message as read.
-- Apply after 202611180004_school_administration_workflows.sql.
begin;

revoke update on public.school_parent_messages from authenticated;
grant update (read_at) on public.school_parent_messages to authenticated;

drop policy if exists school_parent_messages_recipient_update on public.school_parent_messages;
create policy school_parent_messages_recipient_update
on public.school_parent_messages
for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

commit;
