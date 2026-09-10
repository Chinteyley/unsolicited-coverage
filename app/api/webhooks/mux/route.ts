import { NextResponse } from "next/server";

import {
  parseMuxEvent,
  robotEventStatus,
  robotWorkflowFromEvent,
  verifyMuxSignature,
} from "@/lib/mux-webhook";
import type { MuxAsset } from "@/lib/mux";
import {
  handleAssetErrored,
  handleAssetReady,
  handleRobotJob,
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
