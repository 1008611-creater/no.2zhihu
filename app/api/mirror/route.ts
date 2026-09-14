import { NextResponse } from "next/server";
import { z } from "zod";

import { runMirror } from "@/lib/server/mirror";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(4, "问题太短，请再具体一点").max(300, "问题太长了"),
  // v1：用户可以在「选择答主」步骤手动勾选；不传则走看山推荐。
  handles: z.array(z.string().trim().min(1).max(60)).max(6).optional(),
  useZhida: z.boolean().optional(),
  evidencePerSkill: z.number().int().min(1).max(5).optional(),
});

/**
 * 核心接口：问题 → 路由 → 证据 → 回答 → 缺口。
 * 结果按「问题 + 指定答主」缓存 30 分钟，重复演示不消耗新额度。
 */
export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    const message = e instanceof z.ZodError ? e.issues[0]?.message : "请求格式不正确";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    const mirror = await runMirror(parsed.question, {
      handles: parsed.handles,
      useZhida: parsed.useZhida,
      evidencePerSkill: parsed.evidencePerSkill,
    });
    return NextResponse.json({ ok: true, mirror });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json(
        { ok: false, error: e.userMessage, kind: e.kind },
        { status: e.kind === "config" ? 200 : 502 },
      );
    }
    return NextResponse.json({ ok: false, error: "生成失败，请稍后重试" }, { status: 500 });
  }
}
