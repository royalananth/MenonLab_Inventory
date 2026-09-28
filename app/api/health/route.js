// Diagnostics for when the app is down.
//
// Deliberately does NOT call ensureInit() — if a migration is what's broken,
// this endpoint still has to answer. It connects directly, with a short
// timeout, and reports why it failed in plain words.
//
// Open https://<the app>/api/health in a browser. No sign-in needed.
// It never returns the connection string, password or host — only whether
// things are set, and the database's own error code.
import { NextResponse } from "next/server";
import pg from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PLAIN = {
  ECONNREFUSED: "The database refused the connection. It is usually suspended, stopped, or over its plan's quota.",
  ENOTFOUND: "The database host name doesn't resolve. The database was probably deleted, or POSTGRES_URL points at the wrong host.",
  ETIMEDOUT: "The database didn't answer in time. Usually suspended or asleep — try loading the app once more, then check the provider.",
  ECONNRESET: "The database dropped the connection mid-handshake. Often a connection limit that has been reached.",
  "28P01": "The database rejected the username or password. The credentials were rotated — copy the current connection string into POSTGRES_URL.",
  "28000": "The database rejected the login. Check the user in POSTGRES_URL.",
  "3D000": "That database name doesn't exist on the server. It may have been deleted or renamed.",
  "53300": "Too many connections. The database has hit its connection limit.",
  "53400": "The database is out of resources on its current plan.",
  XX000: "The database returned an internal error. On serverless Postgres this usually means the compute is suspended or over quota.",
};

export async function GET() {
  const started = Date.now();
  const cs =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";

  const out = {
    app: "ok",
    checkedAt: new Date().toISOString(),
    env: {
      connectionStringSet: !!cs,
      // Which variable, and just enough of the host to recognise it. No
      // credentials, ever.
      variable: process.env.POSTGRES_URL ? "POSTGRES_URL"
        : process.env.DATABASE_URL ? "DATABASE_URL"
          : process.env.POSTGRES_PRISMA_URL ? "POSTGRES_PRISMA_URL" : null,
      host: (() => {
        try { return cs ? new URL(cs).hostname.replace(/^([^.]{0,6}).*?\./, "$1….") : null; } catch { return "unparseable"; }
      })(),
      agentSecretSet: !!process.env.AGENT_SHARED_SECRET,
      whatsappConfigured: !!(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID && process.env.WHATSAPP_PHONE_NUMBER_ID),
    },
  };

  if (!cs) {
    out.database = "no connection string";
    out.verdict = "POSTGRES_URL is not set on this deployment. Add it in Vercel → Settings → Environment Variables, then redeploy.";
    return NextResponse.json(out, { status: 503 });
  }

  const local = cs.includes("localhost") || cs.includes("127.0.0.1");
  const client = new pg.Client({
    connectionString: cs,
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    query_timeout: 8000,
  });

  try {
    await client.connect();
    const one = await client.query("SELECT 1 AS ok");
    out.database = one.rows[0] && one.rows[0].ok === 1 ? "reachable" : "odd response";

    // If it answers, say how much of the app's own schema is actually there.
    try {
      const t = await client.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name`
      );
      out.tables = t.rows.map((r) => r.table_name);
      const counts = {};
      for (const name of ["members", "items", "orders", "sessions"]) {
        if (out.tables.includes(name)) {
          const c = await client.query(`SELECT count(*)::int AS n FROM ${name}`);
          counts[name] = c.rows[0].n;
        }
      }
      out.rows = counts;
      if (out.tables.includes("meta")) {
        const m = await client.query(`SELECT k, v FROM meta ORDER BY k`);
        out.migrations = Object.fromEntries(m.rows.map((r) => [r.k, r.v]));
      }
      out.verdict = counts.members > 0
        ? `Database is healthy. ${counts.members} people on the roster. If the app still fails, the problem is elsewhere — send this whole page.`
        : "Database is reachable but the members table is empty or missing. The schema did not finish setting up.";
    } catch (inner) {
      out.schemaError = { code: inner.code || null, message: String(inner.message || inner).slice(0, 300) };
      out.verdict = "Connected, but reading the tables failed. Send this whole page.";
    }
    out.ms = Date.now() - started;
    return NextResponse.json(out);
  } catch (e) {
    const code = e.code || (e.errors && e.errors[0] && e.errors[0].code) || null;
    out.database = "unreachable";
    out.error = { code, message: String(e.message || e).slice(0, 300) };
    out.verdict = PLAIN[code] || `The database could not be reached: ${String(e.message || e).slice(0, 200)}`;
    out.ms = Date.now() - started;
    return NextResponse.json(out, { status: 503 });
  } finally {
    try { await client.end(); } catch { /* already gone */ }
  }
}
