import type { CoverageMeta } from "@/lib/types";

const ASSET_PASSTHROUGH_MAX = 255;

export function encodePassthrough(
  meta: CoverageMeta,
  max = ASSET_PASSTHROUGH_MAX,
): string {
  const payload: CoverageMeta = {
    emailId: meta.emailId,
    from: meta.from,
    subject: meta.subject,
    replyTo: meta.replyTo,
  };

  let json = JSON.stringify(payload);
  if (json.length <= max) return json;

  const shrink = (subject: string, from: string, replyTo: string) =>
    JSON.stringify({ emailId: meta.emailId, from, subject, replyTo });

  let subject = meta.subject;
  while (subject.length > 0 && shrink(subject, meta.from, meta.replyTo).length > max) {
    subject = subject.slice(0, -1);
  }
  json = shrink(subject, meta.from, meta.replyTo);
  if (json.length <= max) return json;

  return shrink("", meta.from.slice(0, 40), meta.replyTo.slice(0, 80)).slice(
    0,
    max,
  );
}

export function decodePassthrough(value: unknown): CoverageMeta | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CoverageMeta>;
    if (!parsed.emailId || !parsed.replyTo) return null;
    return {
      emailId: String(parsed.emailId),
      from: String(parsed.from ?? parsed.replyTo),
      subject: String(parsed.subject ?? ""),
      replyTo: String(parsed.replyTo),
      messageId:
        typeof parsed.messageId === "string" ? parsed.messageId : undefined,
    };
  } catch {
    return null;
  }
}
