import { NextResponse } from "next/server";

import { getQuota } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 仅用于调试与演示「额度纪律」。查询本身不消耗业务额度。 */
export async function GET() {
  try {
    const data = await getQuota();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json({ ok: false, error: e.userMessage, kind: e.kind }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "额度查询失败" }, { status: 500 });
  }
}
