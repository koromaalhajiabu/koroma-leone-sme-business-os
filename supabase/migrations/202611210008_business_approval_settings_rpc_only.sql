-- The validated settings RPC is the only write path for approval requirements.
-- Stock-adjustment approval is forced on by the RPC and cannot be disabled via table update.
revoke update,insert,delete on public.business_approval_settings from authenticated;
drop policy if exists business_approval_settings_update on public.business_approval_settings;
grant select on public.business_approval_settings to authenticated;
comment on table public.business_approval_settings is
 'Business-specific optional purchase, expense and refund approvals. Stock adjustments are always approval-controlled. Use set_business_approval_settings to change optional rules.';
