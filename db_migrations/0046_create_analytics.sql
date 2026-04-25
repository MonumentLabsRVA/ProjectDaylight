-- Migration: 0046_create_analytics
-- Description: Append-only behavioral event log for AI-assisted analysis.
-- Folds project-margin's 0024 + 0026 + 0043 + 0045 + 0050 into one greenfield migration.

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS analytics;

COMMENT ON SCHEMA analytics IS 'Append-only behavioral event logs for AI-assisted analysis. Events are immutable - no updates, no deletes.';

-- ============================================================
-- EVENTS TABLE
-- ============================================================

CREATE TABLE analytics.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  context jsonb NOT NULL DEFAULT '{}',
  inserted_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics.events IS 'Append-only behavioral event log. Primary consumer is AI-assisted analysis.';
COMMENT ON COLUMN analytics.events.event_type IS 'Semantic event name in snake_case (e.g., journal_entry_submitted)';
COMMENT ON COLUMN analytics.events.actor_id IS 'The user who triggered the event. NULL for system/anonymous events.';
COMMENT ON COLUMN analytics.events.payload IS 'Event-specific data. Structure varies by event_type.';
COMMENT ON COLUMN analytics.events.context IS 'Contextual metadata: route, user_agent, source, etc.';
COMMENT ON COLUMN analytics.events.inserted_at IS 'Server-side timestamp. Never trust client timestamps.';

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_analytics_events_type ON analytics.events(event_type);
CREATE INDEX idx_analytics_events_actor ON analytics.events(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_analytics_events_inserted_at ON analytics.events(inserted_at DESC);
CREATE INDEX idx_analytics_events_actor_time ON analytics.events(actor_id, inserted_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_analytics_events_payload ON analytics.events USING gin(payload jsonb_path_ops);
CREATE INDEX idx_analytics_events_context ON analytics.events USING gin(context jsonb_path_ops);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE analytics.events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only insert events attributed to themselves (or anonymous events)
CREATE POLICY "Users can only insert their own events"
  ON analytics.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = (SELECT auth.uid())
    OR actor_id IS NULL
  );

-- Employees can read all events (for internal dashboards)
CREATE POLICY "Employees can read events"
  ON analytics.events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_employee = true
    )
  );

-- ============================================================
-- log_event RPC (search_path hardened from project-margin 0045)
-- ============================================================

CREATE OR REPLACE FUNCTION analytics.log_event(
  p_event_type text,
  p_actor_id uuid DEFAULT NULL::uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_event_type IS NULL OR p_event_type = '' THEN
    RAISE EXCEPTION 'event_type cannot be null or empty';
  END IF;

  INSERT INTO analytics.events (event_type, actor_id, payload, context)
  VALUES (p_event_type, p_actor_id, p_payload, p_context)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$function$;

COMMENT ON FUNCTION analytics.log_event IS 'Helper to log analytics events. Use from backend API routes via supabase.schema(''analytics'').rpc(''log_event'', ...).';

-- ============================================================
-- AUTH LIFECYCLE TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION analytics.handle_user_signed_up()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_signup_method text;
BEGIN
  v_signup_method := COALESCE(
    (NEW.raw_app_meta_data ->> 'provider'),
    (NEW.raw_app_meta_data ->> 'signup_method'),
    'unknown'
  );

  PERFORM analytics.log_event(
    'user_signed_up',
    NEW.id,
    jsonb_build_object(
      'userId', NEW.id,
      'signupMethod', v_signup_method
    ),
    jsonb_build_object(
      'source', 'supabase_auth'
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_signed_up ON auth.users;

CREATE TRIGGER on_auth_user_signed_up
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION analytics.handle_user_signed_up();

CREATE OR REPLACE FUNCTION analytics.handle_user_logged_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_login_method text;
  v_user auth.users;
BEGIN
  SELECT * INTO v_user FROM auth.users WHERE id = NEW.user_id;

  IF FOUND THEN
    v_login_method := COALESCE(
      (v_user.raw_app_meta_data ->> 'provider'),
      (v_user.raw_app_meta_data ->> 'signup_method'),
      'unknown'
    );
  ELSE
    v_login_method := 'unknown';
  END IF;

  PERFORM analytics.log_event(
    'user_logged_in',
    NEW.user_id,
    jsonb_build_object(
      'userId', NEW.user_id,
      'loginMethod', v_login_method
    ),
    jsonb_build_object(
      'source', 'supabase_auth'
    )
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_logged_in ON auth.sessions;

CREATE TRIGGER on_auth_user_logged_in
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION analytics.handle_user_logged_in();

-- ============================================================
-- GRANTS
-- ============================================================

-- App role: insert via direct table writes or RPC
GRANT USAGE ON SCHEMA analytics TO authenticated;
GRANT INSERT ON analytics.events TO authenticated;
GRANT EXECUTE ON FUNCTION analytics.log_event(text, uuid, jsonb, jsonb) TO authenticated;

-- Service role: read access for admin dashboards / Inngest workers
GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT ON TABLES TO service_role;
