-- Phase 363: download-only independent content-safety clearance.
-- Prepared for review; DO NOT apply or seed during the production safety hold.
-- Existing videos default to NO clearance. No browser or admin action can grant it.
CREATE TABLE IF NOT EXISTS public.jb_download_safety_clearances (
  media_id uuid PRIMARY KEY REFERENCES public.media(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  review_status text NOT NULL CHECK (review_status IN ('approved','blocked')),
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL,
  valid_until timestamptz,
  approval_reference text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jb_dsc_source_shape CHECK (
    source_key ~ '^staging/[0-9a-f-]{36}/[0-9a-f-]{36}[.]mp4$'
  ),
  CONSTRAINT jb_dsc_approval_requires_reference CHECK (
    review_status <> 'approved' OR
      (approval_reference IS NOT NULL AND length(btrim(approval_reference)) >= 8)
  ),
  CONSTRAINT jb_dsc_expiry_after_review CHECK (
    valid_until IS NULL OR valid_until > reviewed_at
  )
);

ALTER TABLE public.jb_download_safety_clearances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jb_download_safety_clearances
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jb_download_safety_clearances
  TO service_role;

-- No RLS policy or client write RPC is intentionally provided. Clearance
-- must come from a separate authorized independent-review process. A normal
-- publication rights confirmation is NOT content-safety approval.
-- Do not bulk-approve existing media or infer approval from filenames.
NOTIFY pgrst, 'reload schema';
