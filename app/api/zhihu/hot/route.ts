import { NextResponse } from "next/server";

import { hotList } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 热榜额度仅 100/天，客户端缓存 10 分钟，禁止轮询。 */
export async function GET(req: Request) {
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20, 30);
  try {
    const data = await hotList(limit);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json({ ok: false, error: e.userMessage, kind: e.kind }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "热榜获取失败" }, { status: 500 });
  }
}
