import { NextResponse } from "next/server";
import { questionAnswers } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const questionUrl = (sp.get("url") ?? "").trim();
  const limit = Math.min(Number(sp.get("limit") ?? 10) || 10, 20);

  if (!questionUrl) {
    return NextResponse.json({ ok: false, error: "缺少问题链接 url" }, { status: 400 });
  }

  try {
    const data = await questionAnswers(questionUrl, limit);
    return NextResponse.json({ ok: true, items: data.Items, paging: data.Paging });
  } catch (err) {
    const e = err instanceof ZhihuApiError ? err : null;
    return NextResponse.json(
      { ok: false, error: e?.userMessage ?? "回答摘要获取失败", kind: e?.kind ?? "upstream" },
      { status: 502 },
    );
  }
}
