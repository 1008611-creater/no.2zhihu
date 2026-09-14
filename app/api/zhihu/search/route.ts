import { NextResponse } from "next/server";

import { globalSearch, zhihuSearch } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const query = (sp.get("q") ?? "").trim();
  const scope = sp.get("scope") === "global" ? "global" : "zhihu";
  const limit = Math.min(Number(sp.get("limit") ?? 10) || 10, 20);

  if (query.length < 2) {
    return NextResponse.json({ ok: false, error: "查询词太短" }, { status: 400 });
  }

  try {
    const data = scope === "global" ? await globalSearch(query, limit) : await zhihuSearch(query, limit);
    return NextResponse.json({ ok: true, scope, data });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json({ ok: false, error: e.userMessage, kind: e.kind }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "搜索失败" }, { status: 500 });
  }
}
