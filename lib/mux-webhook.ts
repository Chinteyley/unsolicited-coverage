import { createHmac, timingSafeEqual } from "node:crypto";

import { muxEnv } from "@/lib/env";

const TOLERANCE_SEC = 300;

export function verifyMuxSignature(payload: string, header: string | null) {
  if (!header) {
    throw new Error("Missing mux-signature header");
  }

  const { webhookSecret } = muxEnv();
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, ...rest] = piece.split("=");
    if (key && rest.length) {
      parts.set(key.trim(), rest.join("="));
    }
  }

  const timestamp = parts.get("t");
  const signature = parts.get("v1");
  if (!timestamp || !signature) {
    throw new Error("Invalid mux-signature header");
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const received = Buffer.from(signature, "hex");
  const computed = Buffer.from(expected, "hex");
  if (
    received.length !== computed.length ||
    !timingSafeEqual(received, computed)
  ) {
    throw new Error("Mux webhook signature mismatch");
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(age) || age > TOLERANCE_SEC) {
    throw new Error("Mux webhook timestamp is too old");
  }
}

export type MuxWebhookEvent = {
  type: string;
  data: Record<string, unknown>;
};

export function parseMuxEvent(payload: string): MuxWebhookEvent {
  const parsed = JSON.parse(payload) as {
    type?: string;
    data?: Record<string, unknown>;
  };
  if (!parsed.type || !parsed.data) {
    throw new Error("Mux webhook payload missing type or data");
  }
  return { type: parsed.type, data: parsed.data };
}

export function robotWorkflowFromEvent(
  type: string,
): "summarize" | "generate-chapters" | "find-key-moments" | null {
  const match = type.match(/^robots\.job\.(.+)\.(completed|errored)$/);
  if (!match) return null;
  const workflow = match[1].replace(/_/g, "-");
  if (
    workflow === "summarize" ||
    workflow === "generate-chapters" ||
    workflow === "find-key-moments"
  ) {
    return workflow;
  }
  return null;
}

export function robotEventStatus(
  type: string,
): "completed" | "errored" | null {
  if (type.endsWith(".completed")) return "completed";
  if (type.endsWith(".errored")) return "errored";
  return null;
}

const TEXT_TRACK_TYPES = new Set(["text", "subtitle", "subtitles", "caption", "captions"]);
const TEXT_TRACK_KINDS = new Set(["subtitles", "captions", "closed_captions"]);
const GENERATED_TEXT_SOURCES = new Set([
  "generated_vod",
  "generated_live",
  "generated_live_final",
  "uploaded",
  "embedded",
]);

export function isReadyCaptionTrack(data: {
  type?: string;
  text_type?: string;
  text_source?: string;
  status?: string;
}): boolean {
  const status = data.status?.toLowerCase();
  if (status && status !== "ready") return false;

  const type = data.type?.toLowerCase() ?? "";
  if (type === "video" || type === "audio") return false;

  const textType = data.text_type?.toLowerCase() ?? "";
  const textSource = data.text_source?.toLowerCase() ?? "";

  return (
    TEXT_TRACK_TYPES.has(type) ||
    TEXT_TRACK_KINDS.has(textType) ||
    GENERATED_TEXT_SOURCES.has(textSource)
  );
}
