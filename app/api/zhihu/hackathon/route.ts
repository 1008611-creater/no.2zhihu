import { NextResponse } from "next/server";
import { hackathonKnowledge, hackathonStories } from "@/lib/zhihu/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 比赛专用内容接口，无需 Access Secret。 */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind") === "knowledge" ? "knowledge" : "story";
  try {
    const items = kind === "knowledge" ? await hackathonKnowledge() : await hackathonStories();
    return NextResponse.json({ ok: true, kind, items });
  } catch {
    return NextResponse.json({ ok: false, error: "比赛内容接口暂时不可用" }, { status: 502 });
  }
}
