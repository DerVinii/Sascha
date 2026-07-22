import { NextRequest, NextResponse } from "next/server";
import { getAttachment } from "@/lib/server/mailbox/imap";
import { getMailboxConfig } from "@/lib/server/mailbox/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authentifizierter Proxy zum Herunterladen eines Mail-Anhangs.
 * Liegt hinter dem Passwort-Gate (Middleware schützt /api außer der Whitelist).
 *
 * GET /api/postfach/attachment?folder=INBOX&uid=123&index=0
 */
export async function GET(req: NextRequest) {
  if (!getMailboxConfig()) {
    return NextResponse.json(
      { error: "Postfach nicht konfiguriert" },
      { status: 503 },
    );
  }

  const params = req.nextUrl.searchParams;
  const folder = params.get("folder");
  const uid = Number(params.get("uid"));
  const index = Number(params.get("index"));

  if (!folder || !Number.isFinite(uid) || !Number.isFinite(index)) {
    return NextResponse.json({ error: "Ungültige Parameter" }, { status: 400 });
  }

  try {
    const att = await getAttachment(folder, uid, index);
    const body = new Uint8Array(att.content);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": att.contentType,
        "Content-Disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fehler" },
      { status: 500 },
    );
  }
}
