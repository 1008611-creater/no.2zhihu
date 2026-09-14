import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * 搬运到知乎。
 *
 * 重要事实（2026-09-14 实测）：知乎开放平台没有写入/发布接口，
 * 全部 54 个文档条目都是只读或与发布无关的能力。官方文档也明确说明
 * 发布相关字段与 scope 未文档化，不得猜测实现。
 *
 * 所以这里不做「模拟发布」，也不做任何「预填」暗示：只返回真实知乎编辑器深链，
 * 正文由前端提供复制按钮，用户自己粘贴并发布。返回体里如实说明这一点。
 */

const Body = z.object({
  questionUrl: z.string().url().optional(),
  questionTitle: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "参数不合法" }, { status: 400 });
  }

  const { questionUrl, questionTitle } = parsed;
  const questionId = questionUrl?.match(/question\/(\d+)/)?.[1];

  // 知乎答题页：有 question id 时直达该问题的写回答入口
  const editorUrl = questionId
    ? `https://www.zhihu.com/question/${questionId}/answer/new`
    : `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(questionTitle)}`;

  return NextResponse.json({
    ok: true,
    mode: "deep-link",
    editorUrl,
    canPublishViaApi: false,
    note:
      "知乎开放平台未提供发布接口，因此无法通过 API 直接发布。" +
      "已生成知乎真实编辑器深链。本产品无法代你发布，请复制正文后自行粘贴并发布。",
  });
}
