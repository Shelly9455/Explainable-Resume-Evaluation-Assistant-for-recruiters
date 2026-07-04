CREATE TABLE public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  duration_ms INTEGER,
  agreement TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_type_idx ON public.analytics_events (event_type);
CREATE INDEX analytics_events_created_idx ON public.analytics_events (created_at DESC);
GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log events" ON public.analytics_events FOR INSERT TO anon, authenticated WITH CHECK (true);