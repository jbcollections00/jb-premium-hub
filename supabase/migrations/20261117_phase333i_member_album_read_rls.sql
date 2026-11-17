-- JB Premium Hub: Phase 333I member-only album directory metadata
-- Additive RLS policy change. Does not touch media rows, thumbnails or R2.
-- Apply only after verifying billing_my_access() returns the columns
-- tier, can_view_albums, access_expires_at in the target database.
--
-- Transactional: if a referenced schema item is missing, ALL changes roll back.
BEGIN;

DO $guard$
BEGIN
  IF to_regprocedure('public.jb_billing_my_access()') IS NULL THEN
    RAISE EXCEPTION 'Missing jb_billing_my_access() — abort album RLS update';
  END IF;
  IF to_regprocedure('public.is_current_user_admin()') IS NULL THEN
    RAISE EXCEPTION 'Missing admin verifier — abort album RLS update';
  END IF;
END
$guard$;

-- Former policy exposed visible album names to FREE/anonymous clients.
DROP POLICY IF EXISTS jb_albums_public_read_visible ON public.jb_media_albums;
DROP POLICY IF EXISTS jb_albums_paid_read_visible ON public.jb_media_albums;

CREATE POLICY jb_albums_paid_read_visible
ON public.jb_media_albums FOR SELECT TO authenticated
USING (
  is_visible = true AND
  (
    EXISTS (
      SELECT 1
      FROM public.jb_billing_my_access() AS entitlement
      WHERE entitlement.tier IN ('standard', 'vip')
        AND entitlement.can_view_albums = true
        AND entitlement.access_expires_at > now()
    )
    OR EXISTS (
      -- Existing valid legacy VIP code subscriptions remain supported.
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND lower(coalesce(p.account_type, '')) = 'vip'
        AND p.vip_until > now()
    )
  )
);

-- Existing jb_albums_admin_read_all policy still permits Admin.
REVOKE SELECT ON public.jb_media_albums FROM anon;
GRANT SELECT ON public.jb_media_albums TO authenticated;

COMMENT ON TABLE public.jb_media_albums IS
  'Album metadata readable only by authenticated authorized Standard/VIP/Admin users; FREE member access denied by RLS. Videos have separate authorization.';

COMMIT;
