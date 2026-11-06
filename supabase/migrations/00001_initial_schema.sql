-- ============================================================================
-- Migration: 00001_initial_schema.sql
-- Description: Core database schema for CardFlow Visiting Card Scanner & CRM
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Helper trigger function to automatically update updated_at columns
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 4.1 profiles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4.2 organizations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4.3 organization_members
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- Automatically provision profile and default workspace organization on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, full_name, email, avatar_url)
  VALUES (
    NEW.id,
    display_name,
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();

  INSERT INTO public.organizations (name, owner_id)
  VALUES (display_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4.4 scan_batches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scan_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  batch_name TEXT NOT NULL,
  total_images INTEGER NOT NULL DEFAULT 0 CHECK (total_images >= 0 AND total_images <= 50),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'partially_completed', 'failed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 4.5 card_scans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.card_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID REFERENCES public.scan_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  original_image_path TEXT NOT NULL,
  processed_image_path TEXT,
  raw_ocr_text TEXT,
  ocr_output JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    status IN ('uploaded', 'queued', 'processing', 'review_required', 'completed', 'failed')
  ),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- 4.6 contacts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  scan_id UUID REFERENCES public.card_scans(id) ON DELETE SET NULL,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  designation TEXT,
  phone TEXT,
  alternate_phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  education TEXT,
  linkedin_url TEXT,
  additional_information JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4.7 tags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3478F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

-- ----------------------------------------------------------------------------
-- 4.8 contact_tags
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_tags (
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- 4.9 contact_notes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_contact_notes_updated_at
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Indexes for fast queries, filtering, and duplicate detection
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);

CREATE INDEX IF NOT EXISTS idx_scan_batches_user_id ON public.scan_batches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_batches_org_id ON public.scan_batches(organization_id);
CREATE INDEX IF NOT EXISTS idx_scan_batches_status ON public.scan_batches(status);

CREATE INDEX IF NOT EXISTS idx_card_scans_user_id ON public.card_scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_scans_batch_id ON public.card_scans(batch_id);
CREATE INDEX IF NOT EXISTS idx_card_scans_status ON public.card_scans(status);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_id ON public.contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_scan_id ON public.contacts(scan_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON public.contacts(user_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(user_id, lower(company_name));
CREATE INDEX IF NOT EXISTS idx_contacts_full_name_trgm ON public.contacts USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag_id ON public.contact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_id ON public.contact_notes(contact_id, created_at DESC);

