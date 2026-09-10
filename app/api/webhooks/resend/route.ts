import { NextResponse } from "next/server";

import { resendEnv } from "@/lib/env";
import { resendClient } from "@/lib/mail";
import { handleInboundEmail } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const payload = await request.text();

  let event;
  try {
    const { webhookSecret } = resendEnv();
    event = resendClient().webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  try {
    const result = await handleInboundEmail(event.data.email_id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("resend webhook failed", error);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
