import { NextResponse } from "next/server";

import { getSessionWithToken } from "@/lib/zhihu/session";
import { fetchUserSnapshot } from "@/lib/zhihu/user-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 授权用户的公开数据快照。
 *
 * 只读、只在登录后可用。返回的是「每条接口各一条样本」—— 目的是证明
 * 这条授权链路真的通到了用户自己的数据，而不是把用户的完整历史搬下来。
 *
 * ⚠️ 绝不回传 access_token。它只存在于服务端内存，前端拿不到也不该拿到。
 */
export async function GET() {
  const session = await getSessionWithToken();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        error: "未登录，或登录已过期。请重新用知乎账号登录。",
        kind: "auth",
      },
      { status: 401 },
    );
  }

  try {
    const items = await fetchUserSnapshot(session.accessToken);
    return NextResponse.json({
      ok: true,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        status: i.result.status,
        message: i.result.message,
        item: i.result.item,
      })),
    });
  } catch (err) {
    // 配置缺失等异常：如实回报，不伪造数据。
    const message = err instanceof Error ? err.message : "读取失败";
    return NextResponse.json({ ok: false, error: message, kind: "upstream" }, { status: 502 });
  }
}
