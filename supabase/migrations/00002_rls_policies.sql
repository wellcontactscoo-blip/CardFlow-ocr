-- ============================================================================
-- Migration: 00002_rls_policies.sql
-- Description: Row Level Security (RLS) policies for strict multi-tenant & user isolation
-- ============================================================================

-- Helper functions to verify organization membership and admin/owner privileges
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_org_admin_or_owner(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Enable RLS across all 9 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

-- 1. profiles policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. organizations policies
CREATE POLICY "Organization members can view organization"
  ON public.organizations FOR SELECT
  USING (owner_id = auth.uid() OR public.is_org_member(id));

CREATE POLICY "Users can create own organizations"
  ON public.organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners and admins can update organization"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_org_admin_or_owner(id))
  WITH CHECK (owner_id = auth.uid() OR public.is_org_admin_or_owner(id));

CREATE POLICY "Only owner can delete organization"
  ON public.organizations FOR DELETE
  USING (owner_id = auth.uid());

-- 3. organization_members policies
CREATE POLICY "Members can view fellow organization members"
  ON public.organization_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Owners and admins can add members"
  ON public.organization_members FOR INSERT
  WITH CHECK (public.is_org_admin_or_owner(organization_id));

CREATE POLICY "Owners and admins can update members"
  ON public.organization_members FOR UPDATE
  USING (public.is_org_admin_or_owner(organization_id))
  WITH CHECK (public.is_org_admin_or_owner(organization_id));

CREATE POLICY "Owners and admins can remove members"
  ON public.organization_members FOR DELETE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

-- 4. scan_batches policies
CREATE POLICY "Users can view own or org scan batches"
  ON public.scan_batches FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can create own scan batches"
  ON public.scan_batches FOR INSERT
  WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id)));

CREATE POLICY "Users can update own or org scan batches"
  ON public.scan_batches FOR UPDATE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

CREATE POLICY "Users can delete own scan batches"
  ON public.scan_batches FOR DELETE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

-- 5. card_scans policies
CREATE POLICY "Users can view own or org card scans"
  ON public.card_scans FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can create own card scans"
  ON public.card_scans FOR INSERT
  WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id)));

CREATE POLICY "Users can update own or org card scans"
  ON public.card_scans FOR UPDATE
  USING (user_id = auth.uid() OR public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can delete own card scans"
  ON public.card_scans FOR DELETE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

-- 6. contacts policies
CREATE POLICY "Users can view own or org contacts"
  ON public.contacts FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can create own contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id)));

CREATE POLICY "Users can update own or org contacts"
  ON public.contacts FOR UPDATE
  USING (user_id = auth.uid() OR public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can delete own or admin org contacts"
  ON public.contacts FOR DELETE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

-- 7. tags policies
CREATE POLICY "Users can view own or org tags"
  ON public.tags FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can create own tags"
  ON public.tags FOR INSERT
  WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR public.is_org_member(organization_id)));

CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (user_id = auth.uid() OR public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_member(organization_id));

CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (user_id = auth.uid() OR public.is_org_admin_or_owner(organization_id));

-- 8. contact_tags policies
CREATE POLICY "Users can view contact tags for accessible contacts"
  ON public.contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_tags.contact_id
        AND (c.user_id = auth.uid() OR public.is_org_member(c.organization_id))
    )
  );

CREATE POLICY "Users can attach tags to accessible contacts"
  ON public.contact_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_tags.contact_id
        AND (c.user_id = auth.uid() OR public.is_org_member(c.organization_id))
    )
    AND EXISTS (
      SELECT 1 FROM public.tags t
      WHERE t.id = contact_tags.tag_id
        AND (t.user_id = auth.uid() OR public.is_org_member(t.organization_id))
    )
  );

CREATE POLICY "Users can detach tags from accessible contacts"
  ON public.contact_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_tags.contact_id
        AND (c.user_id = auth.uid() OR public.is_org_member(c.organization_id))
    )
  );

-- 9. contact_notes policies
CREATE POLICY "Users can view notes for accessible contacts"
  ON public.contact_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_notes.contact_id
        AND (c.user_id = auth.uid() OR public.is_org_member(c.organization_id))
    )
  );

CREATE POLICY "Users can add notes to accessible contacts"
  ON public.contact_notes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_notes.contact_id
        AND (c.user_id = auth.uid() OR public.is_org_member(c.organization_id))
    )
  );

CREATE POLICY "Users can update own notes"
  ON public.contact_notes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own notes"
  ON public.contact_notes FOR DELETE
  USING (user_id = auth.uid());

