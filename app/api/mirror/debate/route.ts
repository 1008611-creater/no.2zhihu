import { NextResponse } from "next/server";
import { z } from "zod";

import { runDebate } from "@/lib/server/mirror";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Entry = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(60),
  handle: z.string().max(60).optional(),
  body: z.string().min(1).max(4000),
});

const Body = z.object({
  question: z.string().trim().min(4).max(300),
  entries: z.array(Entry).min(2).max(8),
});

/**
 * 一轮互相回应。
 *
 * 只跑一轮，最多 2 次直答：1 次识别冲突，1 次让两位各写一段回应。
 * 没有识别出冲突就如实返回空数组 + 原因，不强行制造对立。
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
    const { replies, note } = await runDebate(parsed.question, parsed.entries);
    return NextResponse.json({ ok: true, replies, note });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json(
        { ok: false, error: e.userMessage, kind: e.kind },
        { status: e.kind === "config" ? 200 : 502 },
      );
    }
    return NextResponse.json({ ok: false, error: "互相回应生成失败，请稍后重试" }, { status: 500 });
  }
}
