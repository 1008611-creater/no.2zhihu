import { NextResponse } from "next/server";
import { z } from "zod";

import { runDebate } from "@/lib/server/mirror";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 请求体的两条上限，都放宽过（2026-09-15）。
 *
 * 原来的 `body.max(4000)` / `entries.max(8)` 是照「模型回答」拍的，但这里收的是
 * **用户已经拿到的回答正文**，条数由「邀请过几位答主」决定、长度由直答产出决定：
 *   · 邀请超过 8 位 → 必然 400。而 `runDebate` 只是从里面挑分歧最尖锐的一对，
 *     条数根本不该卡在 8；
 *   · 直答正文经常 800+ 字，长回答的问题很容易越过 4000 → 同样 400。
 * 撞线时前端只拿到一句英文 Zod 文案，界面上就是「点了互相回应，弹出一个
 * 看不懂的错误」—— 这正是产品负责人反馈的那条。
 * （反代访问日志里能查到这类 400：`POST /api/mirror/debate 400 42`。）
 *
 * 放宽后仍保留上限，避免单请求体无限膨胀；客户端 `DebatePanel` 会先按同样的
 * 数字裁剪，两道都留。报错文案也换成中文 —— 这一层的错误是直接给用户看的。
 */
const Entry = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(60),
  handle: z.string().max(60).optional(),
  body: z.string().min(1).max(8000, "这一段回答太长了，超出了单次互相回应的上限。"),
});

const Body = z.object({
  question: z.string().trim().min(4).max(300),
  entries: z
    .array(Entry)
    .min(2, "至少要有两位答主回答过，才谈得上互相回应。")
    .max(24, "这场讨论里的回答太多了，一次互相回应最多处理 24 条。"),
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
