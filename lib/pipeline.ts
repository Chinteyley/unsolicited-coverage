import { composeCoverage, composeReject } from "@/lib/coverage";
import { extractVideoUrl } from "@/lib/extract-url";
import { replySubject } from "@/lib/html";
import {
  fetchReceivedEmail,
  isOurOwnAddress,
  replyAddress,
  sendDeskEmail,
  type ReceivedEmail,
} from "@/lib/mail";
import {
  createMuxAsset,
  isMissingTranscriptError,
  playbackIdFromAsset,
  startRobotJobs,
  type MuxAsset,
  type MuxTrack,
} from "@/lib/mux";
import { isReadyCaptionTrack } from "@/lib/mux-webhook";
import { decodePassthrough, encodePassthrough } from "@/lib/passthrough";
import {
  bindEmailToAsset,
  claimEmail,
  claimRobotStart,
  claimSend,
  jobsAreTerminal,
  readCoverage,
  releaseRobotStart,
  saveCoverageMeta,
  saveJob,
  savePlaybackId,
} from "@/lib/store";
import type { CoverageMeta, JobStatus, RobotWorkflow } from "@/lib/types";

function metaFromEmail(email: ReceivedEmail): CoverageMeta {
  return {
    emailId: email.id,
    from: email.from,
    subject: email.subject,
    replyTo: replyAddress(email),
    messageId: email.message_id ?? undefined,
  };
}

async function reject(
  meta: CoverageMeta,
  kind: "no-url" | "ingest-error",
  detail?: string,
) {
  const body = composeReject(kind, detail);
  await sendDeskEmail({
    to: meta.replyTo,
    subject: replySubject(meta.subject),
    html: body.html,
    text: body.text,
    idempotencyKey: `coverage-reject/${meta.emailId}/${kind}`,
    messageId: meta.messageId,
  });
}

export async function handleInboundEmail(emailId: string) {
  if (!(await claimEmail(emailId, "pending"))) {
    return { ok: true, skipped: "duplicate" as const };
  }

  const email = await fetchReceivedEmail(emailId);
  const meta = metaFromEmail(email);

  if (isOurOwnAddress(email.from)) {
    return { ok: true, skipped: "self" as const };
  }

  const sourceUrl = extractVideoUrl({
    text: email.text,
    html: email.html,
    attachments: email.attachments ?? [],
  });

  if (!sourceUrl) {
    await reject(meta, "no-url");
    return { ok: true, skipped: "no-url" as const };
  }

  const asset = await createMuxAsset(sourceUrl, meta);
  await bindEmailToAsset(emailId, asset.id);
  await saveCoverageMeta(asset.id, meta, sourceUrl, playbackIdFromAsset(asset));

  if (asset.status === "ready") {
    await handleAssetReady(asset);
  }

  return { ok: true, assetId: asset.id };
}

export async function handleAssetReady(asset: MuxAsset) {
  const meta =
    (await readCoverage(asset.id)) ?? decodePassthrough(asset.passthrough);
  if (!meta) {
    throw new Error(`No coverage meta for asset ${asset.id}`);
  }

  const playbackId = playbackIdFromAsset(asset);
  if (playbackId) {
    await savePlaybackId(asset.id, playbackId);
  }
  await saveCoverageMeta(
    asset.id,
    {
      emailId: meta.emailId,
      from: meta.from,
      subject: meta.subject,
      replyTo: meta.replyTo,
      messageId: meta.messageId,
    },
    (await readCoverage(asset.id))?.sourceUrl ?? "",
    playbackId,
  );

  // Generated captions finish after video.asset.ready; Robots need a ready text track.
  return { ok: true, saved: true as const };
}

export async function handleTrackReady(track: MuxTrack) {
  if (!isReadyCaptionTrack(track)) {
    return { ok: true, skipped: "not-a-text-track" as const };
  }

  const assetId = track.asset_id;
  if (!assetId) {
    throw new Error("missing asset_id on text track");
  }

  return startCoverageRobots(assetId);
}

async function startCoverageRobots(assetId: string) {
  const record = await readCoverage(assetId);
  if (!record) {
    throw new Error(`No coverage meta for asset ${assetId}`);
  }

  if (!(await claimRobotStart(assetId))) {
    return { ok: true, skipped: "robots-already-started" as const };
  }

  const passthrough = encodePassthrough(
    {
      emailId: record.emailId,
      from: record.from,
      subject: record.subject,
      replyTo: record.replyTo,
    },
    4000,
  );

  try {
    await startRobotJobs(assetId, passthrough);
    return { ok: true, started: true as const };
  } catch (error) {
    await releaseRobotStart(assetId);
    if (isMissingTranscriptError(error)) {
      console.warn("mux robots skipped; transcript not ready", assetId, error);
      return {
        ok: true,
        skipped: "transcript-not-ready" as const,
        retry: true as const,
      };
    }
    throw error;
  }
}

export async function handleAssetErrored(asset: MuxAsset) {
  const meta =
    (await readCoverage(asset.id)) ?? decodePassthrough(asset.passthrough);
  if (!meta) return { ok: true, skipped: "no-meta" as const };
  const detail = asset.errors?.messages?.join("; ") ?? asset.errors?.type;
  await reject(meta, "ingest-error", detail);
  return { ok: true };
}

export async function handleRobotJob(input: {
  workflow: RobotWorkflow;
  status: JobStatus;
  assetId: string;
  passthrough?: unknown;
  outputs?: unknown;
}) {
  const fallback = decodePassthrough(input.passthrough);
  await saveJob(input.assetId, input.workflow, input.status, input.outputs);

  const record = await readCoverage(input.assetId, fallback ?? undefined);
  if (!record || !jobsAreTerminal(record.jobs)) {
    return { ok: true, pending: true as const };
  }

  if (!(await claimSend(input.assetId))) {
    return { ok: true, skipped: "already-sent" as const };
  }

  const coverage = composeCoverage(record);
  await sendDeskEmail({
    to: record.replyTo,
    subject: replySubject(record.subject),
    html: coverage.html,
    text: coverage.text,
    idempotencyKey: `coverage/${record.emailId}`,
    messageId: record.messageId,
  });

  return { ok: true, sent: true as const, stamp: coverage.stamp };
}
