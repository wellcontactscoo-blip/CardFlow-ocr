-- ============================================================================
-- Migration: 00003_storage_buckets.sql
-- Description: Private Supabase Storage buckets and folder-scoped RLS policies
-- ============================================================================

-- Create private storage buckets with strict MIME type and 10MB file size limits
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'visiting-cards-original',
    'visiting-cards-original',
    FALSE,
    10485760,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  ),
  (
    'visiting-cards-processed',
    'visiting-cards-processed',
    FALSE,
    10485760,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage objects are organized under: <user_id>/<scan_id>/<filename>
-- Enforce that authenticated users can only access objects inside their own <user_id>/ folder

CREATE POLICY "Users can view own original visiting cards"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visiting-cards-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload own original visiting cards"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visiting-cards-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own original visiting cards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visiting-cards-original'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own processed visiting cards"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'visiting-cards-processed'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload own processed visiting cards"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'visiting-cards-processed'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own processed visiting cards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'visiting-cards-processed'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

