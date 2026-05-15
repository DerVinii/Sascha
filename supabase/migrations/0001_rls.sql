-- ============================================================================
-- RLS-Policies für SK Kommandozentrale (Phase 0/1)
-- ============================================================================
-- Strategie: Jede Tabelle hat org_id (direkt oder transitiv). Alle Policies
-- scopen auf org_ids, in denen der aktuell authentifizierte User Member ist.
--
-- Nach dem Drizzle-Push: dieses File in Supabase SQL Editor ausführen
-- ODER via psql: psql "$DATABASE_URL" -f supabase/migrations/0001_rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: gibt alle org_ids zurück, in denen auth.uid() Member ist
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- RLS auf allen Tabellen aktivieren
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- organizations: User sieht Orgs, in denen er Member ist
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "orgs_select" ON public.organizations;
CREATE POLICY "orgs_select" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS "orgs_insert" ON public.organizations;
CREATE POLICY "orgs_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- Org-Erstellung erlaubt; org_member-Eintrag muss separat

DROP POLICY IF EXISTS "orgs_update" ON public.organizations;
CREATE POLICY "orgs_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ----------------------------------------------------------------------------
-- org_members: eigene Memberships + Members der eigenen Orgs sichtbar
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_members_select" ON public.org_members;
CREATE POLICY "org_members_select" ON public.org_members
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.user_org_ids()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "org_members_self_insert" ON public.org_members;
CREATE POLICY "org_members_self_insert" ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR org_id IN (
    SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS "org_members_admin_update" ON public.org_members;
CREATE POLICY "org_members_admin_update" ON public.org_members
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

DROP POLICY IF EXISTS "org_members_admin_delete" ON public.org_members;
CREATE POLICY "org_members_admin_delete" ON public.org_members
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- ----------------------------------------------------------------------------
-- Generic Org-Scope Policies (org_id direkt auf Tabelle)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'org_invites',
      'companies',
      'contacts',
      'tags',
      'pipelines',
      'deals',
      'activities',
      'email_threads',
      'notes',
      'automations',
      'documents',
      'audit_log'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON public.%s;', t, t);
    EXECUTE format($f$
      CREATE POLICY "%s_all" ON public.%s
        FOR ALL TO authenticated
        USING (org_id IN (SELECT public.user_org_ids()))
        WITH CHECK (org_id IN (SELECT public.user_org_ids()));
    $f$, t, t);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Transitive Policies (kein org_id direkt, über Parent-Tabelle)
-- ----------------------------------------------------------------------------

-- pipeline_stages: scope via pipelines.org_id
DROP POLICY IF EXISTS "pipeline_stages_all" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_all" ON public.pipeline_stages
  FOR ALL TO authenticated
  USING (pipeline_id IN (SELECT id FROM public.pipelines WHERE org_id IN (SELECT public.user_org_ids())))
  WITH CHECK (pipeline_id IN (SELECT id FROM public.pipelines WHERE org_id IN (SELECT public.user_org_ids())));

-- email_messages: scope via email_threads.org_id
DROP POLICY IF EXISTS "email_messages_all" ON public.email_messages;
CREATE POLICY "email_messages_all" ON public.email_messages
  FOR ALL TO authenticated
  USING (thread_id IN (SELECT id FROM public.email_threads WHERE org_id IN (SELECT public.user_org_ids())))
  WITH CHECK (thread_id IN (SELECT id FROM public.email_threads WHERE org_id IN (SELECT public.user_org_ids())));
