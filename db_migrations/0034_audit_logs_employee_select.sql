-- 0034_audit_logs_employee_select.sql
-- Project Daylight - Add SELECT policy for audit_logs (employees only)
--
-- Allow employees (is_employee = true in profiles) to view all audit logs.
-- This enables internal debugging and compliance review by staff members.
--
-- Non-employees cannot read audit logs via the client.

CREATE POLICY "Employees can view all audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_employee = true
  )
);

