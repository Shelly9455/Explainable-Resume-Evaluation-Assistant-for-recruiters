import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/sync-analytics-sheet")({
  server: {
    handlers: {
      POST: async () => {
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
        const SHEET_ID = process.env.ANALYTICS_SHEET_ID;

        if (!LOVABLE_API_KEY || !GOOGLE_SHEETS_API_KEY || !SHEET_ID) {
          return new Response(
            JSON.stringify({ error: "Missing required env vars" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("analytics_events")
          .select("id,created_at,event_type,duration_ms,agreement,session_id")
          .order("created_at", { ascending: true });

        if (error) {
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const header = ["id", "created_at", "event_type", "duration_ms", "agreement", "session_id"];
        const rows = (data ?? []).map((r) => [
          r.id,
          r.created_at,
          r.event_type,
          r.duration_ms ?? "",
          r.agreement ?? "",
          r.session_id ?? "",
        ]);
        const values = [header, ...rows];

        const gw = "https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets";
        const headers = {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_SHEETS_API_KEY,
          "Content-Type": "application/json",
        };

        // Clear existing content, then write fresh snapshot
        const clearRes = await fetch(
          `${gw}/${SHEET_ID}/values/Sheet1!A:F:clear`,
          { method: "POST", headers },
        );
        if (!clearRes.ok) {
          const body = await clearRes.text();
          return new Response(
            JSON.stringify({ error: `Clear failed [${clearRes.status}]: ${body}` }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        const endCol = "F";
        const range = `Sheet1!A1:${endCol}${values.length}`;
        const writeRes = await fetch(
          `${gw}/${SHEET_ID}/values/${range}?valueInputOption=RAW`,
          { method: "PUT", headers, body: JSON.stringify({ values }) },
        );
        if (!writeRes.ok) {
          const body = await writeRes.text();
          return new Response(
            JSON.stringify({ error: `Write failed [${writeRes.status}]: ${body}` }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, rows: rows.length, synced_at: new Date().toISOString() }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});