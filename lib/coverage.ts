import { escapeHtml, firstSentence, formatClock } from "@/lib/html";
import type {
  ChaptersOutputs,
  CoverageRecord,
  KeyMoment,
  MomentsOutputs,
  Stamp,
  SummarizeOutputs,
} from "@/lib/types";

const COMPS: Record<string, [string, string, string]> = {
  Horror: ["Hereditary", "The Witch", "It Follows"],
  Thriller: ["Zodiac", "Prisoners", "The Conversation"],
  Comedy: ["Office Space", "The Big Sick", "Groundhog Day"],
  Romance: ["Before Sunrise", "Portrait of a Lady on Fire", "Eternal Sunshine"],
  Drama: ["Manchester by the Sea", "Moonlight", "The Florida Project"],
  Documentary: ["The Act of Killing", "Won't You Be My Neighbor?", "Free Solo"],
  "Sci-Fi": ["Primer", "Ex Machina", "Arrival"],
  Action: ["Mad Max: Fury Road", "John Wick", "The Raid"],
  Mystery: ["Knives Out", "Gone Girl", "Memories of Murder"],
  Animation: ["Spider-Verse", "The Iron Giant", "Perfect Blue"],
  Western: ["No Country for Old Men", "There Will Be Blood", "The Proposition"],
  Musical: ["Whiplash", "La La Land", "All That Jazz"],
  Sports: ["Moneyball", "Raging Bull", "Friday Night Lights"],
  Default: ["The Social Network", "Whiplash", "Her"],
};

const GENRE_RULES: Array<[RegExp, keyof typeof COMPS]> = [
  [/horror|scary|ghost|haunt|blood|slash/i, "Horror"],
  [/thriller|suspense|kidnap|conspiracy/i, "Thriller"],
  [/comedy|funny|humor|satire|sketch/i, "Comedy"],
  [/romance|dating|love|wedding/i, "Romance"],
  [/documentary|interview|true story|explainer/i, "Documentary"],
  [/sci-?fi|space|robot|future|ai\b|android/i, "Sci-Fi"],
  [/action|fight|chase|stunt|martial/i, "Action"],
  [/mystery|detective|whodunnit|clue/i, "Mystery"],
  [/animat|cartoon|pixar/i, "Animation"],
  [/western|cowboy|outlaw/i, "Western"],
  [/musical|song|dance|jazz/i, "Musical"],
  [/sport|game|athlete|coach|nba|nfl/i, "Sports"],
  [/drama|family|grief|addiction/i, "Drama"],
];

export function guessGenre(
  tags: string[],
  title: string,
  description: string,
): string {
  const hay = [...tags, title, description].join(" ");
  for (const [pattern, genre] of GENRE_RULES) {
    if (pattern.test(hay)) return genre;
  }
  return "Default";
}

export function decideStamp(
  summarize?: SummarizeOutputs,
  chapters?: ChaptersOutputs,
  moments?: MomentsOutputs,
): Stamp {
  const scores = (moments?.moments ?? [])
    .map((moment) => moment.overall_score)
    .filter((score): score is number => typeof score === "number");
  const avg =
    scores.length === 0
      ? 0
      : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const chapterCount = chapters?.chapters?.length ?? 0;
  const description = summarize?.description ?? "";
  const thin = description.length < 80 && scores.length === 0;

  if (thin || (avg > 0 && avg < 0.4 && chapterCount < 2)) return "PASS";
  if (avg >= 0.82 && chapterCount >= 3) return "RECOMMEND";
  return "CONSIDER";
}

function logline(title: string, description: string): string {
  const lead = firstSentence(description);
  if (lead) return lead;
  if (title) return `${title} happens. I have notes. They are brief.`;
  return "A video occurs. People talk. Something is attempted.";
}

function stampCopy(stamp: Stamp): string {
  switch (stamp) {
    case "RECOMMEND":
      return "I am not being paid enough to like things, and I liked this. Do not make me say it twice.";
    case "PASS":
      return "I watched it. That was the generous part. File under: we already have this, except the one we have works.";
    case "CONSIDER":
      return "Not nothing. Not a picture yet. Someone with a better chair should look at the middle.";
    default: {
      const _exhaustive: never = stamp;
      return _exhaustive;
    }
  }
}

function readerAside(stamp: Stamp, genre: string): string {
  switch (stamp) {
    case "RECOMMEND":
      return `I watched it once, on a laptop, with Slack open. Still ${genre.toLowerCase()} enough to survive a notes call.`;
    case "PASS":
      return `I watched it once. That was a complete viewing. ${genre} is a generous word.`;
    case "CONSIDER":
      return `I watched it once. The ${genre.toLowerCase()} version of this movie is visible if you squint and stop being precious.`;
    default: {
      const _exhaustive: never = stamp;
      return _exhaustive;
    }
  }
}

function playerHref(playbackId: string | undefined, seconds: number): string | null {
  if (!playbackId) return null;
  return `https://player.mux.com/${playbackId}?time=${Math.max(0, Math.floor(seconds))}`;
}

function momentLine(moment: KeyMoment): string {
  const start = formatClock((moment.start_ms ?? 0) / 1000);
  const end = formatClock((moment.end_ms ?? 0) / 1000);
  const title = moment.title ?? "An incident";
  const score =
    typeof moment.overall_score === "number"
      ? ` · ${moment.overall_score.toFixed(2)}`
      : "";
  const note =
    moment.audible_narrative ??
    moment.visual_narrative ??
    "Something happens. I wrote it down.";
  return `${start}–${end}  ${title}${score}\n    ${note}`;
}

export function composeCoverage(record: CoverageRecord): {
  html: string;
  text: string;
  stamp: Stamp;
} {
  const summarize = record.jobs.summarize?.outputs;
  const chapters = record.jobs["generate-chapters"]?.outputs;
  const moments = record.jobs["find-key-moments"]?.outputs;
  const title = summarize?.title?.trim() || record.subject || "UNTITLED SUBMISSION";
  const description = summarize?.description?.trim() || "";
  const tags = summarize?.tags ?? [];
  const genre = guessGenre(tags, title, description);
  const comps = COMPS[genre] ?? COMPS.Default;
  const stamp = decideStamp(summarize, chapters, moments);
  const line = logline(title, description);
  const chapterList = chapters?.chapters ?? [];
  const momentList = moments?.moments ?? [];

  const chapterText =
    chapterList.length === 0
      ? "    (No chapters. The picture declined to have acts.)"
      : chapterList
          .map((chapter) => {
            const clock = formatClock(chapter.start_time);
            return `    ${clock}  ${chapter.title}`;
          })
          .join("\n");

  const momentText =
    momentList.length === 0
      ? "    (No key moments. A bold choice, if you like emptiness.)"
      : momentList.map((moment) => `    ${momentLine(moment)}`).join("\n\n");

  const text = [
    "UNSOLICITED COVERAGE",
    "Coverage Desk — we did not request this, and we covered it anyway.",
    "",
    `TITLE:     ${title}`,
    `LOGLINE:   ${line}`,
    `GENRE:     ${genre === "Default" ? "Drama, allegedly" : genre}`,
    `COMPS:     ${comps.join(" / ")}`,
    `STAMP:     ${stamp}`,
    "",
    "CHAPTER REEL",
    chapterText,
    "",
    "KEY MOMENTS",
    momentText,
    "",
    "READER NOTES",
    `    ${stampCopy(stamp)}`,
    `    ${readerAside(stamp, genre === "Default" ? "drama" : genre)}`,
    tags.length ? `    Tags the robot volunteered: ${tags.join(", ")}.` : "",
    "    Confidence: unreasonable. Screening count: one.",
    "",
    "— Coverage Desk",
    "Mux × Resend. Best reply wins. This was the reply.",
  ]
    .filter((row) => row !== "")
    .join("\n");

  const chapterHtml =
    chapterList.length === 0
      ? `<p class="empty">No chapters. The picture declined to have acts.</p>`
      : `<ol class="reel">${chapterList
          .map((chapter) => {
            const href = playerHref(record.playbackId, chapter.start_time);
            const label = `${escapeHtml(formatClock(chapter.start_time))} — ${escapeHtml(chapter.title)}`;
            const inner = href
              ? `<a href="${escapeHtml(href)}">${label}</a>`
              : label;
            return `<li>${inner}</li>`;
          })
          .join("")}</ol>`;

  const momentHtml =
    momentList.length === 0
      ? `<p class="empty">No key moments. A bold choice, if you like emptiness.</p>`
      : `<ul class="moments">${momentList
          .map((moment) => {
            const href = playerHref(record.playbackId, (moment.start_ms ?? 0) / 1000);
            const clock = `${formatClock((moment.start_ms ?? 0) / 1000)}–${formatClock((moment.end_ms ?? 0) / 1000)}`;
            const heading = escapeHtml(moment.title ?? "An incident");
            const title = href
              ? `<a href="${escapeHtml(href)}">${heading}</a>`
              : heading;
            const note = escapeHtml(
              moment.audible_narrative ??
                moment.visual_narrative ??
                "Something happens. I wrote it down.",
            );
            const score =
              typeof moment.overall_score === "number"
                ? `<span class="score">${moment.overall_score.toFixed(2)}</span>`
                : "";
            return `<li><div class="mhead"><span class="clock">${escapeHtml(clock)}</span> ${title} ${score}</div><p>${note}</p></li>`;
          })
          .join("")}</ul>`;

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#1b1814;padding:24px 12px;">
  <div style="max-width:640px;margin:0 auto;background:#f3e6c4;color:#221c14;font-family:Georgia,'Times New Roman',serif;border:1px solid #3a2a16;padding:28px 28px 32px;">
    <p style="margin:0 0 4px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7a2e24;">Unsolicited Coverage</p>
    <p style="margin:0 0 22px;font-family:'Courier New',Courier,monospace;font-size:12px;color:#5c4a32;">Coverage Desk — we did not request this, and we covered it anyway.</p>
    <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;">${escapeHtml(title)}</h1>
    <p style="margin:0 0 18px;font-size:16px;line-height:1.45;"><strong>Logline.</strong> ${escapeHtml(line)}</p>
    <p style="margin:0 0 6px;font-family:'Courier New',Courier,monospace;font-size:13px;"><strong>GENRE</strong> &nbsp; ${escapeHtml(genre === "Default" ? "Drama, allegedly" : genre)}</p>
    <p style="margin:0 0 22px;font-family:'Courier New',Courier,monospace;font-size:13px;"><strong>COMPS</strong> &nbsp; ${escapeHtml(comps.join(" / "))}</p>
    <div style="display:inline-block;margin:0 0 22px;padding:8px 16px;border:3px solid #9b1d1d;color:#9b1d1d;font-family:'Courier New',Courier,monospace;font-size:22px;letter-spacing:0.14em;transform:rotate(-3deg);">${escapeHtml(stamp)}</div>
    <h2 style="margin:8px 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Chapter reel</h2>
    ${chapterHtml}
    <h2 style="margin:22px 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Key moments</h2>
    ${momentHtml}
    <h2 style="margin:22px 0 8px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;font-family:'Courier New',Courier,monospace;">Reader notes</h2>
    <p style="margin:0 0 10px;">${escapeHtml(stampCopy(stamp))}</p>
    <p style="margin:0 0 10px;">${escapeHtml(readerAside(stamp, genre === "Default" ? "drama" : genre))}</p>
    ${
      tags.length
        ? `<p style="margin:0 0 10px;font-family:'Courier New',Courier,monospace;font-size:12px;color:#5c4a32;">Tags the robot volunteered: ${escapeHtml(tags.join(", "))}.</p>`
        : ""
    }
    <p style="margin:18px 0 0;font-family:'Courier New',Courier,monospace;font-size:11px;color:#5c4a32;">Confidence: unreasonable. Screening count: one.<br/>— Coverage Desk · Mux × Resend · Best reply wins.</p>
  </div>
</body>
</html>`;

  return { html, text, stamp };
}

export function composeReject(kind: "no-url" | "ingest-error", detail?: string) {
  const noUrl =
    kind === "no-url"
      ? "The desk does not read treatments, lookbooks, or vibes. Send a video URL. Direct .mp4 / .mov / .webm preferred. YouTube is a coin flip."
      : `We pulled the file. The file declined to be a file.${detail ? ` Mux: ${detail}` : ""} Try a direct media URL.`;

  const text = [
    "UNSOLICITED COVERAGE — REJECTED AT THE DOOR",
    "",
    noUrl,
    "",
    "— Coverage Desk",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;background:#1b1814;padding:24px 12px;">
  <div style="max-width:640px;margin:0 auto;background:#f3e6c4;color:#221c14;font-family:Georgia,serif;border:1px solid #3a2a16;padding:28px;">
    <p style="margin:0 0 12px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7a2e24;">Unsolicited Coverage</p>
    <div style="display:inline-block;margin:0 0 18px;padding:8px 16px;border:3px solid #9b1d1d;color:#9b1d1d;font-family:'Courier New',Courier,monospace;font-size:20px;letter-spacing:0.14em;">PASS</div>
    <p style="font-size:16px;line-height:1.45;">${escapeHtml(noUrl)}</p>
    <p style="font-family:'Courier New',Courier,monospace;font-size:11px;color:#5c4a32;">— Coverage Desk</p>
  </div>
</body></html>`;

  return { html, text };
}
