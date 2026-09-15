import { NextResponse } from "next/server";
import { z } from "zod";

import { collectEvidence, draftAnswer, invitePersona } from "@/lib/server/mirror";
import { distillPersona, skillFromDistilled } from "@/lib/server/persona";
import { ZhihuApiError } from "@/lib/zhihu/errors";
import { invitePublicFigure } from "@/lib/server/publicFigures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().trim().min(4).max(300),
  /** 预置答主：传 handle，走本地人格库，零蒸馏成本。 */
  handle: z.string().trim().min(1).max(60).optional(),
  /** 临时指定一位没预置的答主：传名字，走在线蒸馏，如实返回命中条数。 */
  name: z.string().trim().min(1).max(40).optional(),
  topic: z.string().trim().max(60).optional(),
  publicFigureId: z.string().trim().min(1).max(60).optional(),
  evidencePerSkill: z.number().int().min(1).max(5).optional(),
}).refine(value => [value.handle, value.name, value.publicFigureId].filter(Boolean).length === 1,
  { message: "请选择一种邀请方式：知乎答主或公共人物" });

/**
 * 继续邀请一位答主。
 *
 * 只生成这一位的回答，不重跑已有分身 —— 这是额度纪律里最关键的一条：
 * 用户「再加一个人进来看看」不应该让前面已经生成的内容全部重算。
 *
 * 两种情况：
 *   - handle：预置答主，直接用本地人格库。
 *   - name：未预置的答主，现场检索 + 蒸馏。命中 0 条时如实返回 low 置信度。
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
    // 路径 A：预置答主。
    if (parsed.publicFigureId) {
      const result = await invitePublicFigure(parsed.question, parsed.publicFigureId);
      if (!result) return NextResponse.json({ ok: false, error: "该人物暂无已核验且匹配当前问题的能力。" }, { status: 422 });
      return NextResponse.json({ ok: true, mode: "public_figure", ...result });
    }
    if (parsed.handle) {
      const result = await invitePersona(parsed.question, parsed.handle, {
        evidencePerSkill: parsed.evidencePerSkill,
      });
      if (!result) {
        return NextResponse.json(
          { ok: false, error: "名册里没有这位答主。可以改用「临时指定」让他现场蒸馏。" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, mode: "preset", skill: result.skill, answer: result.answer });
    }

    // 路径 B：临时指定的新答主，现场蒸馏。
    if (!parsed.name) {
      return NextResponse.json({ ok: false, error: "请提供 handle 或 name" }, { status: 400 });
    }

    const topic = parsed.topic?.trim() || parsed.question.slice(0, 20);
    const distilled = await distillPersona(parsed.name, parsed.name, topic);
    const skill = skillFromDistilled(parsed.name, distilled);

    // 临时人格不进名册，所以这里直接取证据 + 生成正文。
    //
    // 证据检索词刻意用「主题 + 人格领域」而不是「主题 + 人名」：
    // 知乎搜索是内容语义检索，带上人名会把结果拉向「别人讨论这个人」的内容，
    // 那些内容对回答这个问题没有价值。这与预置答主路径（buildPersonaQuery）
    // 口径一致：领域词负责选材，人格负责组织语言。
    const domain = distilled.persona.knows[0]?.split(/[、与和的]/)[0] ?? "";
    const query = domain ? topic + " " + domain : topic;
    const sources = await collectEvidence(query, parsed.evidencePerSkill ?? 3);
    const withEvidence = { ...skill, query, sources };
    const answer = await draftAnswer(withEvidence, parsed.question, true);

    return NextResponse.json({
      ok: true,
      mode: "distilled",
      confidence: distilled.confidence,
      validSamples: distilled.validSamples,
      failureReason: distilled.failureReason,
      matched: distilled.matched,
      scanned: distilled.scanned,
      note: distilled.note,
      skill: withEvidence,
      answer,
    });
  } catch (e) {
    if (e instanceof ZhihuApiError) {
      return NextResponse.json(
        { ok: false, error: e.userMessage, kind: e.kind },
        { status: e.kind === "config" ? 200 : 502 },
      );
    }
    return NextResponse.json({ ok: false, error: "邀请失败，请稍后重试" }, { status: 500 });
  }
}
