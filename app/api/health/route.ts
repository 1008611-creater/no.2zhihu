import { NextResponse } from "next/server";

import { hasCredentials } from "@/lib/zhihu/client";
import { cacheStats } from "@/lib/zhihu/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 部署探针。只返回布尔值与计数，**绝不回显任何凭证内容**。
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    credentials: hasCredentials(),
    cache: cacheStats(),
    at: new Date().toISOString(),
  });
}
