import { Redis } from "@upstash/redis";

import { redisEnv } from "@/lib/env";
import type {
  ChaptersOutputs,
  CoverageJobs,
  CoverageMeta,
  CoverageRecord,
  JobStatus,
  MomentsOutputs,
  RobotWorkflow,
  SummarizeOutputs,
} from "@/lib/types";
import { assertNever } from "@/lib/types";

const TTL_SECONDS = 60 * 60 * 24 * 7;

let redis: Redis | null = null;

function client(): Redis {
  if (!redis) {
    redis = new Redis(redisEnv());
  }
  return redis;
}

function assetKey(assetId: string) {
  return `uc:asset:${assetId}`;
}

function emailKey(emailId: string) {
  return `uc:email:${emailId}`;
}

function robotsLockKey(assetId: string) {
  return `uc:robots:${assetId}`;
}

function sentKey(assetId: string) {
  return `uc:sent:${assetId}`;
}

export async function claimEmail(emailId: string, assetPlaceholder: string) {
  const ok = await client().set(emailKey(emailId), assetPlaceholder, {
    nx: true,
    ex: TTL_SECONDS,
  });
  return ok === "OK";
}

export async function bindEmailToAsset(emailId: string, assetId: string) {
  await client().set(emailKey(emailId), assetId, { ex: TTL_SECONDS });
}

export async function saveCoverageMeta(
  assetId: string,
  meta: CoverageMeta,
  sourceUrl: string,
  playbackId?: string,
) {
  const redisClient = client();
  await redisClient.hset(assetKey(assetId), {
    meta,
    sourceUrl,
    ...(playbackId ? { playbackId } : {}),
  });
  await redisClient.expire(assetKey(assetId), TTL_SECONDS);
}

export async function savePlaybackId(assetId: string, playbackId: string) {
  const redisClient = client();
  await redisClient.hset(assetKey(assetId), { playbackId });
  await redisClient.expire(assetKey(assetId), TTL_SECONDS);
}

export async function claimRobotStart(assetId: string) {
  const ok = await client().set(robotsLockKey(assetId), "1", {
    nx: true,
    ex: TTL_SECONDS,
  });
  return ok === "OK";
}

export async function releaseRobotStart(assetId: string) {
  await client().del(robotsLockKey(assetId));
}

export async function saveJob(
  assetId: string,
  workflow: RobotWorkflow,
  status: JobStatus,
  outputs?: unknown,
) {
  const redisClient = client();
  await redisClient.hset(assetKey(assetId), {
    [workflow]: { status, outputs },
  });
  await redisClient.expire(assetKey(assetId), TTL_SECONDS);
}

function asJson<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseJob<T>(raw: unknown) {
  return asJson<{ status: JobStatus; outputs?: T }>(raw);
}

export async function readCoverage(
  assetId: string,
  fallback?: CoverageMeta,
): Promise<CoverageRecord | null> {
  const hash = await client().hgetall<Record<string, unknown>>(assetKey(assetId));
  const meta = asJson<CoverageMeta>(hash?.meta) ?? fallback;
  if (!meta) return null;

  return {
    ...meta,
    assetId,
    playbackId: typeof hash?.playbackId === "string" ? hash.playbackId : undefined,
    sourceUrl: typeof hash?.sourceUrl === "string" ? hash.sourceUrl : "",
    jobs: {
      summarize: parseJob<SummarizeOutputs>(hash?.summarize),
      "generate-chapters": parseJob<ChaptersOutputs>(
        hash?.["generate-chapters"],
      ),
      "find-key-moments": parseJob<MomentsOutputs>(hash?.["find-key-moments"]),
    },
  };
}

export function jobsAreTerminal(jobs: CoverageJobs): boolean {
  const workflows: RobotWorkflow[] = [
    "summarize",
    "generate-chapters",
    "find-key-moments",
  ];
  return workflows.every((workflow) => {
    const job = jobs[workflow];
    switch (workflow) {
      case "summarize":
      case "generate-chapters":
      case "find-key-moments":
        return job?.status === "completed" || job?.status === "errored";
      default:
        return assertNever(workflow, "robot workflow");
    }
  });
}

export async function claimSend(assetId: string) {
  const ok = await client().set(sentKey(assetId), "1", {
    nx: true,
    ex: TTL_SECONDS,
  });
  return ok === "OK";
}
