import { NextResponse } from "next/server";
import { questionRecommendations } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = sp.get("q")?.trim() || undefined;
  const count = Math.min(Number(sp.get("count") ?? 5) || 5, 10);

  try {
    const items = await questionRecommendations({ query, count });
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    const e = err instanceof ZhihuApiError ? err : null;
    return NextResponse.json(
      { ok: false, error: e?.userMessage ?? "问题推荐失败", kind: e?.kind ?? "upstream" },
      { status: 502 },
    );
  }
}
