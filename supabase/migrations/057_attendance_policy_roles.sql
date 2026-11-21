-- Refine attendance permissions: accountants can read, while owners/admins/managers manage records.
drop policy if exists employee_attendance_manage on public.employee_attendance;
drop policy if exists employee_attendance_accountant_read on public.employee_attendance;
create policy employee_attendance_read on public.employee_attendance
for select to authenticated
using (has_business_role(business_id,array['owner'::business_role,'admin'::business_role,'manager'::business_role,'accountant'::business_role]));
create policy employee_attendance_insert on public.employee_attendance
for insert to authenticated
with check (has_business_role(business_id,array['owner'::business_role,'admin'::business_role,'manager'::business_role]));
create policy employee_attendance_update on public.employee_attendance
for update to authenticated
using (has_business_role(business_id,array['owner'::business_role,'admin'::business_role,'manager'::business_role]))
with check (has_business_role(business_id,array['owner'::business_role,'admin'::business_role,'manager'::business_role]));
create policy employee_attendance_delete on public.employee_attendance
for delete to authenticated
using (has_business_role(business_id,array['owner'::business_role,'admin'::business_role,'manager'::business_role]));