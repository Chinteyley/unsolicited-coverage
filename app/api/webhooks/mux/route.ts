import { NextResponse } from "next/server";

import {
  isReadyCaptionTrack,
  parseMuxEvent,
  robotEventStatus,
  robotWorkflowFromEvent,
  verifyMuxSignature,
} from "@/lib/mux-webhook";
import type { MuxAsset, MuxTrack } from "@/lib/mux";
import {
  handleAssetErrored,
  handleAssetReady,
  handleRobotJob,
  handleTrackReady,
} from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

function asAsset(data: Record<string, unknown>): MuxAsset {
  return {
    id: String(data.id ?? ""),
    status: typeof data.status === "string" ? data.status : undefined,
    passthrough:
      typeof data.passthrough === "string" ? data.passthrough : undefined,
    playback_ids: data.playback_ids as MuxAsset["playback_ids"],
    errors: data.errors as MuxAsset["errors"],
  };
}

function asTrack(data: Record<string, unknown>): MuxTrack {
  const assetId =
    typeof data.asset_id === "string"
      ? data.asset_id
      : data.asset_id != null
        ? String(data.asset_id)
        : undefined;
  return {
    id: String(data.id ?? ""),
    asset_id: assetId || undefined,
    type: typeof data.type === "string" ? data.type : undefined,
    text_type: typeof data.text_type === "string" ? data.text_type : undefined,
    text_source:
      typeof data.text_source === "string" ? data.text_source : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
  };
}

export async function POST(request: Request) {
  const payload = await request.text();

  try {
    verifyMuxSignature(payload, request.headers.get("mux-signature"));
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = parseMuxEvent(payload);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    if (event.type === "video.asset.ready") {
      const asset = asAsset(event.data);
      if (!asset.id) {
        return NextResponse.json({ error: "missing asset id" }, { status: 400 });
      }
      return NextResponse.json(await handleAssetReady(asset));
    }

    if (event.type === "video.asset.errored") {
      const asset = asAsset(event.data);
      if (!asset.id) {
        return NextResponse.json({ error: "missing asset id" }, { status: 400 });
      }
      return NextResponse.json(await handleAssetErrored(asset));
    }

    if (event.type === "video.asset.track.ready") {
      const track = asTrack(event.data);
      if (isReadyCaptionTrack(track) && !track.asset_id) {
        return NextResponse.json({ error: "missing asset_id" }, { status: 400 });
      }
      return NextResponse.json(await handleTrackReady(track));
    }

    const workflow = robotWorkflowFromEvent(event.type);
    const status = robotEventStatus(event.type);
    if (workflow && status) {
      const parameters = event.data.parameters as
        | { asset_id?: string }
        | undefined;
      const assetId = String(parameters?.asset_id ?? "");
      if (!assetId) {
        return NextResponse.json({ error: "missing asset_id" }, { status: 400 });
      }
      return NextResponse.json(
        await handleRobotJob({
          workflow,
          status,
          assetId,
          passthrough: event.data.passthrough,
          outputs: event.data.outputs,
        }),
      );
    }

    return NextResponse.json({ ok: true, ignored: event.type });
  } catch (error) {
    console.error("mux webhook failed", error);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
