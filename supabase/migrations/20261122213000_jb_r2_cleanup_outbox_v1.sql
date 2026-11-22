-- Phase 347: Verified, transactional R2 cleanup outbox. NO object deletion here.
-- Deliberately does not touch existing media, thumbnails or grants.
-- All jobs are enqueued within the SAME transaction as the corresponding delete.

CREATE TABLE IF NOT EXISTS public.jb_r2_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind text NOT NULL CHECK (entity_kind IN ('published', 'draft')),
  entity_id uuid NOT NULL,
  object_kind text NOT NULL CHECK (object_kind IN ('video', 'private_thumbnail', 'public_thumbnail')),
  bucket_name text NOT NULL,
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT jb_r2_cleanup_jobs_exact_ownership CHECK (
    (bucket_name = 'jb-premium-private-videos' AND (
      (object_kind = 'video' AND object_key ~ '^staging/[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$')
      OR (object_kind = 'private_thumbnail' AND object_key ~ '^staging-thumbnails/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$')
    ))
    OR (bucket_name = 'jb-collections-public-assets'
      AND object_kind = 'public_thumbnail'
      AND object_key ~ '^thumbnails/published/[0-9a-f-]{36}\.jpg$')
  ),
  CONSTRAINT jb_r2_cleanup_jobs_one_object UNIQUE (bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS jb_r2_cleanup_due_idx
  ON public.jb_r2_cleanup_jobs (next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS jb_r2_cleanup_entity_idx
  ON public.jb_r2_cleanup_jobs (entity_kind, entity_id, status);

ALTER TABLE public.jb_r2_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jb_r2_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jb_r2_cleanup_jobs TO service_role;

-- Add optional audit metadata for published thumbnails without rewriting history.
ALTER TABLE public.jb_admin_media_delete_audit
  ADD COLUMN IF NOT EXISTS public_thumbnail_key text;

CREATE OR REPLACE FUNCTION public.jb_admin_delete_published_media_v1(
  p_media_ids uuid[],
  p_admin_id uuid
)
RETURNS TABLE (
  deleted_media_id uuid,
  private_video_key text,
  private_thumbnail_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_media public.media%rowtype;
  v_link public.jb_media_publication_links%rowtype;
  v_stage public.jb_media_upload_staging%rowtype;
  v_video_key text;
  v_thumbnail_key text;
  v_public_key text;
  v_count integer;
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_admin_id
      AND (pg_catalog.lower(coalesce(p.role, '')) = 'admin'
           OR pg_catalog.lower(coalesce(p.account_type, '')) = 'admin')
  ) THEN
    RAISE EXCEPTION 'Admin authorization required' USING errcode = '42501';
  END IF;

  v_count := pg_catalog.cardinality(p_media_ids);
  IF p_media_ids IS NULL OR v_count NOT BETWEEN 1 AND 20
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_media_ids) AS s(id) WHERE s.id IS NULL)
     OR (SELECT count(DISTINCT s.id) FROM pg_catalog.unnest(p_media_ids) AS s(id)) <> v_count
  THEN
    RAISE EXCEPTION 'Select 1 to 20 unique media IDs' USING errcode = '22023';
  END IF;

  FOR v_id IN SELECT s.id FROM pg_catalog.unnest(p_media_ids) AS s(id) ORDER BY s.id
  LOOP
    SELECT * INTO v_media FROM public.media m WHERE m.id = v_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected media no longer exists' USING errcode = 'P0002';
    END IF;

    v_video_key := NULL; v_thumbnail_key := NULL; v_public_key := NULL;
    v_link := NULL; v_stage := NULL;

    SELECT * INTO v_link FROM public.jb_media_publication_links l
      WHERE l.media_id = v_id FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO v_stage FROM public.jb_media_upload_staging s
        WHERE s.id = v_link.staging_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Publication has missing staging metadata' USING errcode = '23503';
      END IF;

      v_video_key := 'staging/' || v_stage.created_by::text || '/' || v_stage.id::text || '.mp4';
      IF v_media.media_url IS DISTINCT FROM ('r2://jb-premium-private-videos/' || v_video_key)
         OR v_stage.storage_key IS DISTINCT FROM v_video_key THEN
        RAISE EXCEPTION 'Unsafe published video reference' USING errcode = '22023';
      END IF;
      IF v_stage.preview_key IS NOT NULL THEN
        v_thumbnail_key := 'staging-thumbnails/' || v_stage.created_by::text || '/' || v_stage.id::text || '.jpg';
        IF v_stage.preview_key IS DISTINCT FROM v_thumbnail_key THEN
          RAISE EXCEPTION 'Unsafe published thumbnail reference' USING errcode = '22023';
        END IF;
      END IF;

      -- The published cover is optional. Never delete arbitrary URLs, shared
      -- logos or external thumbnails. Require EXACT expected public copy URL.
      v_public_key := 'thumbnails/published/' || v_stage.id::text || '.jpg';
      IF v_media.thumbnail_url IS DISTINCT FROM
         ('https://assets.jb-premium-hub.vip/' || v_public_key) THEN
        v_public_key := NULL;
      END IF;
    END IF;

    INSERT INTO public.jb_admin_media_delete_audit
      (media_id, deleted_by, media_url, video_key, thumbnail_key,
       public_thumbnail_key, cleanup_status)
    VALUES (v_media.id, p_admin_id, v_media.media_url, v_video_key,
      v_thumbnail_key, v_public_key,
      CASE WHEN v_video_key IS NULL THEN 'not_applicable' ELSE 'pending' END);

    IF v_video_key IS NOT NULL THEN
      INSERT INTO public.jb_r2_cleanup_jobs
        (entity_kind, entity_id, object_kind, bucket_name, object_key)
      VALUES ('published', v_id, 'video', 'jb-premium-private-videos', v_video_key);
    END IF;
    IF v_thumbnail_key IS NOT NULL THEN
      INSERT INTO public.jb_r2_cleanup_jobs
        (entity_kind, entity_id, object_kind, bucket_name, object_key)
      VALUES ('published', v_id, 'private_thumbnail',
        'jb-premium-private-videos', v_thumbnail_key);
    END IF;
    IF v_public_key IS NOT NULL THEN
      INSERT INTO public.jb_r2_cleanup_jobs
        (entity_kind, entity_id, object_kind, bucket_name, object_key)
      VALUES ('published', v_id, 'public_thumbnail',
        'jb-collections-public-assets', v_public_key);
    END IF;

    DELETE FROM public.jb_media_publication_links WHERE media_id = v_id;
    DELETE FROM public.media WHERE id = v_id;
    IF v_link.staging_id IS NOT NULL THEN
      DELETE FROM public.jb_media_upload_staging WHERE id = v_link.staging_id;
    END IF;

    deleted_media_id := v_id;
    private_video_key := v_video_key;
    private_thumbnail_key := v_thumbnail_key;
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.jb_admin_delete_published_media_v1(uuid[], uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_admin_delete_published_media_v1(uuid[], uuid)
  TO service_role;

-- Draft deletion no longer loses cleanup state when any R2 DELETE fails.
CREATE OR REPLACE FUNCTION public.jb_admin_delete_unpublished_drafts_v1(
  p_draft_ids uuid[],
  p_admin_id uuid
)
RETURNS TABLE (deleted_draft_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_stage public.jb_media_upload_staging%rowtype;
  v_count integer;
  v_video_key text;
  v_thumbnail_key text;
BEGIN
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_admin_id
      AND (pg_catalog.lower(coalesce(p.role, '')) = 'admin'
           OR pg_catalog.lower(coalesce(p.account_type, '')) = 'admin')
  ) THEN
    RAISE EXCEPTION 'Admin authorization required' USING errcode = '42501';
  END IF;

  v_count := pg_catalog.cardinality(p_draft_ids);
  IF p_draft_ids IS NULL OR v_count NOT BETWEEN 1 AND 50
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_draft_ids) AS s(id) WHERE s.id IS NULL)
     OR (SELECT count(DISTINCT s.id) FROM pg_catalog.unnest(p_draft_ids) AS s(id)) <> v_count
  THEN
    RAISE EXCEPTION 'Select 1 to 50 unique draft IDs' USING errcode = '22023';
  END IF;

  FOR v_id IN SELECT s.id FROM pg_catalog.unnest(p_draft_ids) AS s(id) ORDER BY s.id
  LOOP
    SELECT * INTO v_stage FROM public.jb_media_upload_staging s
      WHERE s.id = v_id AND s.created_by = p_admin_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Draft not found or not owned by admin' USING errcode = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.jb_media_publication_links l
      WHERE l.staging_id = v_id) THEN
      RAISE EXCEPTION 'Published draft cannot be deleted here' USING errcode = '23503';
    END IF;

    IF NOT (v_stage.status = 'pending_review' OR
        (v_stage.status = 'awaiting_upload' AND
         v_stage.created_at < pg_catalog.now() - INTERVAL '65 minutes')) THEN
      RAISE EXCEPTION 'Active upload lease must expire before deletion' USING errcode = '22023';
    END IF;

    v_video_key := 'staging/' || p_admin_id::text || '/' || v_id::text || '.mp4';
    IF v_stage.storage_key IS DISTINCT FROM v_video_key THEN
      RAISE EXCEPTION 'Unsafe private draft key' USING errcode = '22023';
    END IF;
    v_thumbnail_key := NULL;
    IF v_stage.preview_key IS NOT NULL THEN
      v_thumbnail_key := 'staging-thumbnails/' || p_admin_id::text || '/' || v_id::text || '.jpg';
      IF v_stage.preview_key IS DISTINCT FROM v_thumbnail_key THEN
        RAISE EXCEPTION 'Unsafe draft preview key' USING errcode = '22023';
      END IF;
    END IF;

    INSERT INTO public.jb_r2_cleanup_jobs
      (entity_kind, entity_id, object_kind, bucket_name, object_key)
    VALUES ('draft', v_id, 'video', 'jb-premium-private-videos', v_video_key);
    IF v_thumbnail_key IS NOT NULL THEN
      INSERT INTO public.jb_r2_cleanup_jobs
        (entity_kind, entity_id, object_kind, bucket_name, object_key)
      VALUES ('draft', v_id, 'private_thumbnail',
        'jb-premium-private-videos', v_thumbnail_key);
    END IF;
    DELETE FROM public.jb_media_upload_staging WHERE id = v_id;
    deleted_draft_id := v_id;
    RETURN NEXT;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.jb_admin_delete_unpublished_drafts_v1(uuid[],uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_admin_delete_unpublished_drafts_v1(uuid[],uuid)
  TO service_role;

-- Concurrent worker-safe, leased job claiming. No paths supplied by caller.
CREATE OR REPLACE FUNCTION public.jb_r2_claim_cleanup_v1(
  p_limit integer DEFAULT 10,
  p_entity_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  job_id uuid, entity_kind text, entity_id uuid,
  object_kind text, bucket_name text, object_key text, lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Cleanup claim batch limit is 1 to 40' USING errcode = '22023';
  END IF;
  IF p_entity_ids IS NOT NULL AND
     (pg_catalog.cardinality(p_entity_ids) NOT BETWEEN 1 AND 50) THEN
    RAISE EXCEPTION 'Invalid cleanup entity filter' USING errcode = '22023';
  END IF;

  RETURN QUERY
  WITH chosen AS (
    SELECT j.id FROM public.jb_r2_cleanup_jobs j
    WHERE ((j.status = 'pending' AND j.next_attempt_at <= pg_catalog.now())
        OR (j.status = 'processing' AND j.lease_expires_at < pg_catalog.now()))
      AND (p_entity_ids IS NULL OR j.entity_id = ANY(p_entity_ids))
    ORDER BY j.created_at, j.id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), acquired AS (
    UPDATE public.jb_r2_cleanup_jobs j
      SET status = 'processing', attempts = j.attempts + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = pg_catalog.now() + INTERVAL '5 minutes',
        updated_at = pg_catalog.now()
    FROM chosen c WHERE j.id = c.id
    RETURNING j.id, j.entity_kind, j.entity_id, j.object_kind,
      j.bucket_name, j.object_key, j.lease_token
  )
  SELECT a.id, a.entity_kind, a.entity_id, a.object_kind,
    a.bucket_name, a.object_key, a.lease_token
  FROM acquired a;
END
$function$;

REVOKE ALL ON FUNCTION public.jb_r2_claim_cleanup_v1(integer,uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_r2_claim_cleanup_v1(integer,uuid[])
  TO service_role;

-- Acknowledge ONLY the current lease. Failures back off, then block for review.
CREATE OR REPLACE FUNCTION public.jb_r2_finish_cleanup_v1(
  p_job_id uuid, p_lease_token uuid, p_success boolean, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_entity_kind text;
  v_entity_id uuid;
  v_status text;
  v_error text;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL OR p_success IS NULL THEN
    RAISE EXCEPTION 'Invalid cleanup acknowledgement' USING errcode = '22023';
  END IF;
  v_error := left(coalesce(p_error, 'R2_DELETE_NOT_CONFIRMED'), 180);

  UPDATE public.jb_r2_cleanup_jobs j
  SET status = CASE WHEN p_success THEN 'complete'
                    WHEN j.attempts >= 12 THEN 'blocked'
                    ELSE 'pending' END,
      last_error = CASE WHEN p_success THEN NULL ELSE v_error END,
      next_attempt_at = CASE WHEN p_success THEN j.next_attempt_at
                       ELSE pg_catalog.now() + pg_catalog.make_interval(
                         mins => LEAST(1440, (5 * pg_catalog.power(
                           2::numeric, LEAST(j.attempts, 8)))::integer)) END,
      lease_token = NULL, lease_expires_at = NULL,
      completed_at = CASE WHEN p_success THEN pg_catalog.now() ELSE NULL END,
      updated_at = pg_catalog.now()
  WHERE j.id = p_job_id AND j.lease_token = p_lease_token
    AND j.status = 'processing'
  RETURNING j.entity_kind, j.entity_id, j.status
  INTO v_entity_kind, v_entity_id, v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleanup lease expired or already acknowledged'
      USING errcode = 'P0002';
  END IF;

  IF v_entity_kind = 'published' THEN
    UPDATE public.jb_admin_media_delete_audit a
    SET cleanup_status =
      CASE WHEN EXISTS (
        SELECT 1 FROM public.jb_r2_cleanup_jobs j
        WHERE j.entity_kind = 'published' AND j.entity_id = v_entity_id
          AND j.status <> 'complete'
      ) THEN 'pending' ELSE 'complete' END,
      cleanup_updated_at = pg_catalog.now(),
      cleanup_error = CASE WHEN EXISTS (
        SELECT 1 FROM public.jb_r2_cleanup_jobs j
        WHERE j.entity_kind = 'published' AND j.entity_id = v_entity_id
          AND j.status <> 'complete'
      ) THEN (
        SELECT coalesce(j.last_error, 'R2 cleanup awaiting retry')
        FROM public.jb_r2_cleanup_jobs j
        WHERE j.entity_kind = 'published' AND j.entity_id = v_entity_id
          AND j.status <> 'complete'
        ORDER BY j.created_at, j.id LIMIT 1
      ) ELSE NULL END
    WHERE a.media_id = v_entity_id AND a.cleanup_status <> 'not_applicable';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.jb_r2_finish_cleanup_v1(uuid,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jb_r2_finish_cleanup_v1(uuid,uuid,boolean,text)
  TO service_role;

COMMENT ON TABLE public.jb_r2_cleanup_jobs IS
  'Phase 347 server-only transactionally enqueued R2 deletes; never generated from orphan scan.';
