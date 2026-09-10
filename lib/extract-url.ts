import type { ReceivedAttachment } from "@/lib/types";

const URL_RE = /https?:\/\/[^\s<>"'\]\)]+/gi;

const VIDEO_EXT = /\.(mp4|mov|webm|m4v|mkv|m3u8|avi)(?:$|[?#])/i;

const MEDIA_HOST =
  /(youtube\.com|youtu\.be|vimeo\.com|mux\.com|stream\.mux\.com|loom\.com|wistia\.com|cloudinary\.com|dropbox\.com|googleusercontent\.com|r2\.dev|blob\.vercel-storage\.com|s3[.-]|streamable\.com|w3\.org\/.*\/media)/i;

const SKIP_HOST =
  /(tracking|unsubscribe|list-manage|mailchi|sentry\.io|schema\.org|w3\.org\/1999|w3\.org\/TR)/i;

const VIDEO_MIME = /^(video\/|application\/(mp4|octet-stream))/i;

function trimUrl(raw: string): string {
  return raw.replace(/[.,;:!?]+$/g, "");
}

function urlsFromText(text: string): string[] {
  const found = text.match(URL_RE) ?? [];
  return found.map(trimUrl);
}

function urlsFromHtml(html: string): string[] {
  const hrefs = [...html.matchAll(/https?:\/\/[^"'>\s]+/gi)].map((m) =>
    trimUrl(m[0]),
  );
  const stripped = html.replace(/<[^>]+>/g, " ");
  return [...hrefs, ...urlsFromText(stripped)];
}

function isSkippable(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return SKIP_HOST.test(host) || SKIP_HOST.test(url);
  } catch {
    return true;
  }
}

function isMediaUrl(url: string): boolean {
  if (isSkippable(url)) return false;
  return VIDEO_EXT.test(url) || MEDIA_HOST.test(url);
}

function isVideoAttachment(attachment: ReceivedAttachment): boolean {
  const type = attachment.content_type ?? "";
  const name = attachment.filename ?? "";
  return VIDEO_MIME.test(type) || VIDEO_EXT.test(name);
}

export function extractVideoUrl(input: {
  text?: string | null;
  html?: string | null;
  attachments?: ReceivedAttachment[];
}): string | null {
  for (const attachment of input.attachments ?? []) {
    if (isVideoAttachment(attachment) && attachment.download_url) {
      return attachment.download_url;
    }
  }

  const candidates = [
    ...urlsFromText(input.text ?? ""),
    ...urlsFromHtml(input.html ?? ""),
  ];

  const media = candidates.find(isMediaUrl);
  if (media) return media;

  const first = candidates.find((url) => !isSkippable(url));
  return first ?? null;
}
