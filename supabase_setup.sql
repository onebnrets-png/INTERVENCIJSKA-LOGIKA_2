-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  EURO-OFFICE: Full Database Setup                                ║
-- ║  v5.0 — 2026-03-10                                              ║
-- ║                                                                  ║
-- ║  CHANGELOG:                                                      ║
-- ║  v5.0 (EO-060): Database hardening                               ║
-- ║    - Clean RLS policies on projects (7) and project_data (8)    ║
-- ║    - Overwrite guard trigger on project_data                     ║
-- ║    - Enhanced backup trigger with data_size + saved_by           ║
-- ║    - cleanup_old_history() function                              ║
-- ║    - NOT NULL + DEFAULT on project_data.data                     ║
-- ║    - Additional performance indexes                              ║
-- ║  v4.0: Organizations tables + RLS, profiles extensions,          ║
-- ║         superadmin support, knowledge_base, create_org RPC       ║
-- ║  v3.0: DB-1..DB-5 fixes (trigger, RLS, recursion, last_sign_in)║
-- ║                                                                  ║
-- ║  Run in Supabase SQL Editor. Safe to re-run.                     ║
-- ╚══════════════════════════════════════════════════════════════════╝


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 0. HELPERS                                                       │
-- └──────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'superadmin')
  );

$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'superadmin'
  );

$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;

$$ LANGUAGE plpgsql;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 1. PROFILES TABLE + TRIGGER                                      │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  active_organization_id UUID,
  last_sign_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='first_name') THEN
    ALTER TABLE profiles ADD COLUMN first_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_name') THEN
    ALTER TABLE profiles ADD COLUMN last_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='active_organization_id') THEN
    ALTER TABLE profiles ADD COLUMN active_organization_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='last_sign_in') THEN
    ALTER TABLE profiles ADD COLUMN last_sign_in TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin', 'superadmin'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_own ON profiles;
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select_own ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS profiles_insert_trigger ON profiles;
CREATE POLICY profiles_insert_trigger ON profiles FOR INSERT
  WITH CHECK (true);


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 2. USER_SETTINGS TABLE                                           │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  ai_provider TEXT DEFAULT 'gemini' CHECK (ai_provider = ANY (ARRAY['gemini', 'openrouter', 'openai'])),
  gemini_key TEXT,
  openrouter_key TEXT,
  openai_key TEXT,
  model TEXT,
  custom_logo TEXT,
  custom_instructions JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='openai_key') THEN
    ALTER TABLE user_settings ADD COLUMN openai_key TEXT;
  END IF;
END $$;

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_select ON user_settings;
CREATE POLICY user_settings_select ON user_settings FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS user_settings_update ON user_settings;
CREATE POLICY user_settings_update ON user_settings FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_settings_insert ON user_settings;
CREATE POLICY user_settings_insert ON user_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS user_settings_upsert ON user_settings;
CREATE POLICY user_settings_upsert ON user_settings FOR UPDATE
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 3. ORGANIZATIONS TABLES                                          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  org_role TEXT DEFAULT 'member' CHECK (org_role IN ('member', 'admin', 'owner')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);

CREATE TABLE IF NOT EXISTS organization_instructions (
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE PRIMARY KEY,
  instructions JSONB DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_active_organization_id_fkey'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_active_organization_id_fkey
      FOREIGN KEY (active_organization_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Organizations RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_instructions ENABLE ROW LEVEL SECURITY;

-- create_org_for_new_user RPC
CREATE OR REPLACE FUNCTION create_org_for_new_user(p_user_id UUID, p_org_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_slug TEXT;
BEGIN
  v_slug := lower(regexp_replace(p_org_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO organizations (name, slug, created_by)
  VALUES (p_org_name, v_slug, p_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO organization_members (organization_id, user_id, org_role)
  VALUES (v_org_id, p_user_id, 'owner');

  UPDATE profiles SET active_organization_id = v_org_id WHERE id = p_user_id;

  INSERT INTO organization_instructions (organization_id) VALUES (v_org_id)
  ON CONFLICT (organization_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'orgId', v_org_id, 'slug', v_slug);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;

$$;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 4. PROJECTS + PROJECT_DATA TABLES                                │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'New Project',
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='organization_id') THEN
    ALTER TABLE projects ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_data (
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('en', 'si')),
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, language)
);

CREATE INDEX IF NOT EXISTS idx_project_data_project_id ON project_data(project_id);

-- ═══ v5.0 (EO-060): Projects RLS — clean, no duplicates ═══
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON projects;
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
DROP POLICY IF EXISTS "proj_sel_superadmin" ON projects;
DROP POLICY IF EXISTS "projects_admin_select_org" ON projects;
DROP POLICY IF EXISTS "projects_delete_owner" ON projects;
DROP POLICY IF EXISTS "projects_superadmin_select_all" ON projects;

CREATE POLICY proj_select_owner ON projects FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY proj_select_admin ON projects FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'superadmin')
    AND (projects.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
);

CREATE POLICY proj_insert_owner ON projects FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY proj_update_owner ON projects FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY proj_update_admin ON projects FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'superadmin')
    AND (projects.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role IN ('admin', 'superadmin')
    AND (projects.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
);

CREATE POLICY proj_delete_owner ON projects FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY proj_delete_superadmin ON projects FOR DELETE USING (
  is_superadmin()
);

-- ═══ v5.0 (EO-060): Project_data RLS — clean, no duplicates ═══
ALTER TABLE project_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own project data" ON project_data;
DROP POLICY IF EXISTS "Users can insert own project data" ON project_data;
DROP POLICY IF EXISTS "Users can update own project data" ON project_data;
DROP POLICY IF EXISTS "Users can view own project data" ON project_data;
DROP POLICY IF EXISTS "project_data_delete_own" ON project_data;
DROP POLICY IF EXISTS "project_data_delete_owner" ON project_data;
DROP POLICY IF EXISTS "project_data_insert_own" ON project_data;
DROP POLICY IF EXISTS "project_data_select_own" ON project_data;
DROP POLICY IF EXISTS "project_data.update_own" ON project_data;
DROP POLICY IF EXISTS "pd_sel_superadmin" ON project_data;
DROP POLICY IF EXISTS "project_data_admin_select_org" ON project_data;
DROP POLICY IF EXISTS "project_data_superadmin_select_all" ON project_data;

CREATE POLICY pd_select_owner ON project_data FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_data.project_id
    AND projects.owner_id = auth.uid()
  )
);

CREATE POLICY pd_select_admin ON project_data FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN profiles p ON (p.id = auth.uid())
    WHERE pr.id = project_data.project_id
    AND p.role IN ('admin', 'superadmin')
    AND (pr.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
);

CREATE POLICY pd_insert_owner ON project_data FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_data.project_id
    AND projects.owner_id = auth.uid()
  )
);

CREATE POLICY pd_update_owner ON project_data FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_data.project_id
    AND projects.owner_id = auth.uid()
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_data.project_id
    AND projects.owner_id = auth.uid()
  )
);

CREATE POLICY pd_update_admin ON project_data FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN profiles p ON (p.id = auth.uid())
    WHERE pr.id = project_data.project_id
    AND p.role IN ('admin', 'superadmin')
    AND (pr.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN profiles p ON (p.id = auth.uid())
    WHERE pr.id = project_data.project_id
    AND p.role IN ('admin', 'superadmin')
    AND (pr.organization_id = p.active_organization_id OR p.role = 'superadmin')
  )
);

CREATE POLICY pd_delete_owner ON project_data FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = project_data.project_id
    AND projects.owner_id = auth.uid()
  )
);

CREATE POLICY pd_delete_superadmin ON project_data FOR DELETE USING (
  is_superadmin()
);

-- ═══ v5.0 (EO-060): Overwrite guard trigger ═══
CREATE OR REPLACE FUNCTION guard_against_data_overwrite()
RETURNS TRIGGER AS $$
DECLARE
  old_size int;
  new_size int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_size := length(OLD.data::text);
    new_size := length(NEW.data::text);
    IF old_size > 5000 AND new_size < 500 AND NEW.data != '{}'::jsonb THEN
      RAISE EXCEPTION
        '[EO-060] data_overwrite_guard: Blocked overwrite of % chars with % chars for project=% lang=%. Use explicit {} to clear data.',
        old_size, new_size, NEW.project_id, NEW.language;
    END IF;
  END IF;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_data_overwrite ON project_data;
CREATE TRIGGER trg_guard_data_overwrite
  BEFORE UPDATE ON project_data
  FOR EACH ROW
  EXECUTE FUNCTION guard_against_data_overwrite();

-- ═══ v5.0 (EO-060): updated_at triggers ═══
DROP TRIGGER IF EXISTS update_project_data_updated_at ON project_data;
CREATE TRIGGER update_project_data_updated_at
  BEFORE UPDATE ON project_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 5. TRANSLATION HASHES TABLE                                      │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS translation_hashes (
  project_id TEXT NOT NULL,
  source_lang TEXT NOT NULL CHECK (source_lang IN ('en', 'si')),
  target_lang TEXT NOT NULL CHECK (target_lang IN ('en', 'si')),
  field_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (project_id, source_lang, target_lang, field_path)
);

ALTER TABLE translation_hashes ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 6. KNOWLEDGE BASE TABLE                                          │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INT,
  storage_path TEXT,
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 7. PROJECT_DATA_HISTORY TABLE (v5.0 enhanced)                    │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS project_data_history (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  language TEXT NOT NULL,
  data JSONB NOT NULL,
  saved_by UUID,
  saved_at TIMESTAMPTZ DEFAULT now(),
  data_size INT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_data_history' AND column_name='data_size') THEN
    ALTER TABLE project_data_history ADD COLUMN data_size INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_data_history' AND column_name='saved_by') THEN
    ALTER TABLE project_data_history ADD COLUMN saved_by UUID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pdh_project_lang ON project_data_history(project_id, language);
CREATE INDEX IF NOT EXISTS idx_pdh_saved_at ON project_data_history(saved_at DESC);

ALTER TABLE project_data_history ENABLE ROW LEVEL SECURITY;

-- ═══ v5.0 (EO-060): Enhanced backup trigger ═══
CREATE OR REPLACE FUNCTION backup_project_data_before_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.data IS DISTINCT FROM NEW.data THEN
    INSERT INTO project_data_history
      (project_id, language, data, saved_by, saved_at, data_size)
    VALUES
      (OLD.project_id, OLD.language, OLD.data, auth.uid(), now(), length(OLD.data::text));
  END IF;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_backup_project_data ON project_data;
CREATE TRIGGER trg_backup_project_data
  BEFORE UPDATE ON project_data
  FOR EACH ROW
  EXECUTE FUNCTION backup_project_data_before_update();

-- ═══ v5.0 (EO-060): History cleanup function ═══
CREATE OR REPLACE FUNCTION cleanup_old_history(keep_count INT DEFAULT 50)
RETURNS INT AS $$
DECLARE
  deleted INT;
BEGIN
  WITH ranked AS (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id, language
        ORDER BY saved_at DESC
      ) as rn
    FROM project_data_history
  )
  DELETE FROM project_data_history
  WHERE id IN (SELECT id FROM ranked WHERE rn > keep_count);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 8. APP_CHANGELOG TABLE                                           │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS app_changelog (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  version TEXT,
  type TEXT CHECK (type = ANY (ARRAY['FEAT', 'FIX', 'UI', 'PERF', 'DOCS'])),
  title TEXT NOT NULL,
  description TEXT,
  files_changed TEXT[],
  released_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE app_changelog ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 9. ERROR_LOG TABLE                                               │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS error_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_source TEXT,
  error_message TEXT,
  error_stack TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 10. ADMIN_LOG TABLE                                              │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS admin_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_user_id UUID,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_log ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 11. GLOBAL_SETTINGS TABLE                                        │
-- └──────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS global_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings JSONB DEFAULT '{}',
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 12. LAST_SIGN_IN TRIGGER                                         │
-- └──────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION update_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET last_sign_in = now() WHERE id = NEW.user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'update_last_sign_in failed: %', SQLERRM;
  RETURN NEW;
END;

$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_session_created ON auth.sessions;
CREATE TRIGGER on_auth_session_created
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_last_sign_in();


-- ┌──────────────────────────────────────────────────────────────────┐
-- │ 13. VERIFICATION                                                 │
-- └──────────────────────────────────────────────────────────────────┘

SELECT '✅ EURO-OFFICE supabase_setup.sql v5.0 complete' as status;
