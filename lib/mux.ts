import { muxEnv } from "@/lib/env";
import { encodePassthrough } from "@/lib/passthrough";
import type { CoverageMeta, RobotWorkflow } from "@/lib/types";
import { assertNever } from "@/lib/types";

const MUX_API = "https://api.mux.com";

const WORKFLOWS = [
  "summarize",
  "generate-chapters",
  "find-key-moments",
] as const satisfies readonly RobotWorkflow[];

function muxAuthHeader(): string {
  const { tokenId, tokenSecret } = muxEnv();
  return `Basic ${Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64")}`;
}

export class MuxRequestError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body: string;

  constructor(method: string, path: string, status: number, body: string) {
    super(`Mux ${method} ${path} ${status}: ${body}`);
    this.name = "MuxRequestError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

async function muxFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const response = await fetch(`${MUX_API}${path}`, {
    ...init,
    headers: {
      Authorization: muxAuthHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new MuxRequestError(method, path, response.status, body);
  }

  return (await response.json()) as T;
}

export function isMissingTranscriptError(error: unknown): boolean {
  if (!(error instanceof MuxRequestError) || error.status !== 422) {
    return false;
  }
  return /no transcript available|ready text track/i.test(error.body);
}

export type MuxAsset = {
  id: string;
  status?: string;
  passthrough?: string;
  playback_ids?: Array<{ id: string; policy?: string }>;
  errors?: { type?: string; messages?: string[] };
};

export type MuxTrack = {
  id: string;
  asset_id?: string;
  type?: string;
  text_type?: string;
  text_source?: string;
  status?: string;
};

export async function createMuxAsset(inputUrl: string, meta: CoverageMeta) {
  const body = {
    inputs: [
      {
        url: inputUrl,
        generated_subtitles: [{ language_code: "en", name: "English CC" }],
      },
    ],
    playback_policies: ["public"],
    video_quality: "basic",
    passthrough: encodePassthrough(meta),
  };

  const result = await muxFetch<{ data: MuxAsset }>("/video/v1/assets", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return result.data;
}

function jobBody(workflow: RobotWorkflow, assetId: string, passthrough: string) {
  switch (workflow) {
    case "summarize":
      return {
        passthrough,
        parameters: {
          asset_id: assetId,
          tone: "professional",
          output_steering: {
            summary_style: "concise",
            audience:
              "an exhausted Hollywood studio reader writing coverage after one screening",
          },
        },
      };
    case "generate-chapters":
      return {
        passthrough,
        parameters: {
          asset_id: assetId,
          output_steering: {
            chapter_style: "descriptive",
            chapter_granularity: "balanced",
            audience: "development executives skimming a coverage reel",
          },
        },
      };
    case "find-key-moments":
      return {
        passthrough,
        parameters: {
          asset_id: assetId,
          max_moments: 6,
          use_shots: true,
          output_steering: {
            selection_strategy: "story_beats",
            title_style: "punchy",
            audience: "a coverage desk looking for the one scene that sells the picture",
            rubric_priorities: ["emotional_intensity", "soundbite_quality"],
          },
        },
      };
    default:
      return assertNever(workflow, "robot workflow");
  }
}

export async function startRobotJobs(assetId: string, passthrough: string) {
  await Promise.all(
    WORKFLOWS.map((workflow) =>
      muxFetch(`/robots/v0/jobs/${workflow}`, {
        method: "POST",
        body: JSON.stringify(jobBody(workflow, assetId, passthrough)),
      }),
    ),
  );
}

export function playbackIdFromAsset(asset: MuxAsset): string | undefined {
  return asset.playback_ids?.[0]?.id;
}
