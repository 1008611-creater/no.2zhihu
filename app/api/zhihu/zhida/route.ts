import { NextResponse } from "next/server";
import { z } from "zod";

import { hasCredentials, zhidaText } from "@/lib/zhihu/client";
import { ZhihuApiError } from "@/lib/zhihu/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 直答（知乎自研模型）追问接口。
 *
 * 额度仅 100/天，所以入参严格限长，且底层 client 已按「模型 + 完整消息」
 * 做 30 分钟缓存与并发合并。未配置凭证时如实降级，不编造回答。
 */

const Message = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const Body = z.object({
  messages: z.array(Message).min(1).max(8),
  model: z.enum(["zhida-fast-1p5", "zhida-thinking-1p5"]).optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "参数不合法" }, { status: 400 });
  }

  if (!hasCredentials()) {
    return NextResponse.json(
      { ok: false, error: "服务端尚未配置知乎开放平台凭证，当前为只读降级模式。", kind: "config" },
      { status: 503 },
    );
  }

  try {
    const text = await zhidaText(parsed.messages, { model: parsed.model ?? "zhida-fast-1p5" });
    if (!text) return NextResponse.json({ ok: false, error: "直答未返回内容" }, { status: 502 });
    return NextResponse.json({ ok: true, model: parsed.model ?? "zhida-fast-1p5", text });
  } catch (err) {
    if (err instanceof ZhihuApiError) {
      return NextResponse.json({ ok: false, error: err.userMessage, kind: err.kind }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "直答调用失败" }, { status: 500 });
  }
}
