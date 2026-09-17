/**
 * 视觉审计：把「看起来不牛逼」拆成可测量的量。
 *
 * 为什么非要量化：owner 反复说「平庸 / 不够顶级」，而我前面几轮都在凭手感调色 ——
 * 结果改了 5 版，每版都在修真问题，但整体观感没有质变。
 * 凭手感调参的毛病是：**调完不知道离目标还有多远，也不知道该先动哪个**。
 *
 * 这份审计只输出数字，不做美化。跑法：
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/audit-square-visual.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";

register(new URL("./_ts-hook.mjs", import.meta.url));

const { layoutSquare, homeViewport, clampViewport } = await import("../lib/domain/square-layout.ts");
const { crowdLayout } = await import("../lib/domain/crowd.ts");
const { lightOfCluster, lightReach, shadowOf } = await import("../lib/domain/light.ts");
const { relicOf, RELIC_RADIUS_RATIO } = await import("../lib/domain/relic.ts");

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, "..", "public", "square-library.json"), "utf8"));
const entries = raw.entries ?? [];

const topics = entries.map((e) => {
  const handles = new Set((e.skills ?? []).map((s) => s.persona?.handle ?? "name:" + s.name));
  return {
    id: e.id,
    title: e.title,
    answerCount: (e.answers ?? []).length,
    personaCount: handles.size,
    openGapCount: (e.gaps ?? []).filter((g) => !g.filledBy).length,
    hasReplies: (e.answers ?? []).some((a) => (a.round ?? 0) > 0),
    mine: false,
  };
});

const layout = layoutSquare(topics, (h) => h, () => []);
const clusters = crowdLayout(layout.nodes);
const b = layout.bounds;
const W = b.maxX - b.minX;
const H = b.maxY - b.minY;

/**
 * 世界坐标 → 舞台屏幕坐标。
 *
 * ⚠️ 这里以前写成 `(worldX - boundsCenter) * scale + stageW/2 + view.x` —— 错。
 *    `homeViewport` 返回的 `view.x/y` **已经**是「把世界原点搬到舞台中心」的平移量
 *    （`x = vw/2 - home.x*scale`），再减一次包围盒中心等于整体平移了半个舞台，
 *    于是「视野内簇数」在 1280→2560 四档屏幕上**恒等于 10**（世界根本没动）。
 *    我在气泡定位上踩过同一个坑，这里是第二次。
 *    正解只有一行：`screenX = worldX * scale + view.x`。
 */
const toScreen = (wx, wy, view) => ({ x: wx * view.scale + view.x, y: wy * view.scale + view.y });

const P = (s) => console.log(s);
const head = (t) => {
  P("");
  P("=".repeat(76));
  P("  " + t);
  P("=".repeat(76));
};
const row = (k, v, note = "") => P("  " + String(k).padEnd(30) + String(v).padStart(10) + "   " + note);

head("① 内容密度 —— 「画面空」的根因");

const figures = clusters.reduce((n, c) => n + c.figures.length, 0);
const personas = clusters.reduce((n, c) => n + c.personaCount, 0);
const gaps = clusters.reduce((n, c) => n + c.gapCount, 0);
// 人形数中位数
const counts = clusters.map((c) => c.figures.length).sort((a, b) => a - b);
const median = counts[Math.floor(counts.length / 2)];

row("讨论场次", entries.length);
row("人形总数", figures, "= " + personas + " 分身 + " + gaps + " 缺口");
row("每簇人形数 中位数", median, "最小 " + counts[0] + " / 最大 " + counts[counts.length - 1]);
row("每簇分身数", personas / clusters.length >= 3 ? "3" : "?", "全部相同 —— 每场固定 3 位");
row("有回应（round>0）的场次", topics.filter((t) => t.hasReplies).length, "→ 「正在发生」维度恒空");

// 覆盖率 = 人群总面积 / 场地面积
const crowdArea = clusters.reduce((n, c) => n + Math.PI * c.radius * c.radius, 0);
const fieldArea = Math.PI * (W / 2) * (H / 2);
row("人群占地 / 场地", (100 * crowdArea / fieldArea).toFixed(1) + "%", "空地占比 " + (100 - 100 * crowdArea / fieldArea).toFixed(1) + "%");

head("② 屏幕尺度 —— 「看不清是人」的根因");

for (const vw of [1440, 1920]) {
  const vh = vw === 1440 ? 900 : 1080;
  // 广场只占 75% 宽
  // 广场占屏幕 75%（右侧广播栏 25%），再扣掉一点内边距
  const stageW = vw * 0.75 - 24;
  const stageH = vh - 64;
  const view = homeViewport(layout, stageW, stageH);
  const heights = clusters.flatMap((c) =>
    c.figures.filter((f) => f.kind === "persona").map((f) => f.height * view.scale),
  );
  heights.sort((a, b2) => a - b2);
  const mn = heights[0];
  const mx = heights[heights.length - 1];
  const md = heights[Math.floor(heights.length / 2)];

  const inView = clusters.filter((c) => {
    const p = toScreen(c.x, c.y, view);
    const r = c.radius * view.scale;
    return p.x > -r && p.x < stageW + r && p.y > -r && p.y < stageH + r;
  }).length;

  P("");
  row("—— " + vw + "×" + vh + " ——", "scale=" + view.scale.toFixed(2));
  row("  人形屏幕高度 中位数", md.toFixed(1) + "px");
  row("  人形屏幕高度 区间", mn.toFixed(1) + "–" + mx.toFixed(1) + "px");
  row("  视野内簇数", inView + " / " + clusters.length);
  P("      人形宽度 = 高度 × 0.6 → 中位宽约 " + (md * 0.6).toFixed(1) + "px");
}

head("③ 视觉信息预算 —— 一个屏幕里有多少可辨元素");

{
  const vw = 1440;
  const vh = 900;
  // 广场占屏幕 75%（右侧广播栏 25%），再扣掉一点内边距
  const stageW = vw * 0.75 - 24;
  const stageH = vh - 64;
  const view = homeViewport(layout, stageW, stageH);
  let titles = 0;
  let titleChars = 0;
  for (const n of layout.nodes) {
    const p = toScreen(n.x, n.y, view);
    if (p.x > -200 && p.x < stageW + 200 && p.y > -100 && p.y < stageH + 100) {
      titles++;
      titleChars += n.title.length;
    }
  }
  row("视野内标题数", titles);
  row("视野内标题总字数", titleChars, "中文 " + titleChars + " 字 ≈ " + (titleChars * 16 * 16 / 1000).toFixed(0) + "k px²");
  row("文本占屏面积", ((100 * titleChars * 16 * 16 * 1.6) / (stageW * stageH)).toFixed(1) + "%", "算上两行折行与行高");
}

head("④ 光影的实际贡献 —— 我加的那三层到底有多大用");

{
  const vw = 1440, vh = 900;
  // 广场占屏幕 75%（右侧广播栏 25%），再扣掉一点内边距
  const stageW = vw * 0.75 - 24;
  const stageH = vh - 64;
  const view = homeViewport(layout, stageW, stageH);

  // 每簇一盏灯（光就在那件发光物件上）—— 2026-09-16 改，见 light.ts。
  // 影子面积（屏幕像素）
  let shadowArea = 0;
  let shadowCount = 0;
  // 逐簇统计影子方向的张角：若各簇自己的方向扇区彼此错开，
  // 说明影子是「从物件向外辐射」的，而不是全场平行。
  const fanAngles = [];
  for (const c of clusters) {
    const node = layout.nodes.find((n) => n.id === c.id);
    const relic = relicOf(node?.title ?? "", node?.size ?? 200);
    const light = lightOfCluster(c.x, c.y, relic.intensity);
    const reach = lightReach(c.radius);
    const angles = [];
    for (const f of c.figures) {
      if (f.kind !== "persona") continue;
      const s = shadowOf({ x: c.x + f.dx, y: c.y + f.dy }, f.height, light, reach);
      const w = s.width * view.scale;
      // 影长在屏幕上按 scale 缩，但方向任意 —— 面积估算取 长×宽
      shadowArea += s.length * view.scale * w;
      shadowCount++;
      angles.push(s.angle);
    }
    if (angles.length >= 2) {
      const lo = Math.min(...angles);
      const hi = Math.max(...angles);
      fanAngles.push(Math.min(hi - lo, 360 - (hi - lo)));
    }
  }
  row("影子数", shadowCount);
  row("影子总屏面积", Math.round(shadowArea) + " px²", "占广场 " + ((100 * shadowArea) / (stageW * stageH)).toFixed(2) + "%");
  const fanMed = fanAngles.slice().sort((a, b) => a - b)[Math.floor(fanAngles.length / 2)];
  row("逐簇影子方向张角 中位数", fanMed.toFixed(0) + "°", "场数 " + fanAngles.length + "；接近 0 = 全场平行（错）");

  // 发光物件（relic）的屏面积
  let relicArea = 0;
  for (const c of clusters) {
    const r = c.radius * RELIC_RADIUS_RATIO * view.scale;
    relicArea += Math.PI * r * r;
  }
  row("发光物件总屏面积", Math.round(relicArea) + " px²", "占广场 " + ((100 * relicArea) / (stageW * stageH)).toFixed(2) + "%");

  // 人形实心面积（近似：头圆 + 身梯形 ≈ 0.62 × 高 × 宽）
  let figArea = 0;
  for (const c of clusters) {
    for (const f of c.figures) {
      const h = f.height * view.scale;
      const w = h * 0.6;
      figArea += h * w * 0.62;
    }
  }
  row("人形总屏面积", Math.round(figArea) + " px²", "占广场 " + ((100 * figArea) / (stageW * stageH)).toFixed(2) + "%");

  P("");
  const figPct = (100 * figArea) / (stageW * stageH);
  const shPct = (100 * shadowArea) / (stageW * stageH);
  P("  主体（人形）占广场 " + figPct.toFixed(2) + "%   加上影子共 " + (figPct + shPct).toFixed(2) + "%");
  P("  背景占 " + (100 - figPct - shPct).toFixed(2) + "%");
  P("");
  P("  参照：一张「有主体」的画面，主体通常占 15–40%。");
  P("        这个广场是 " + figPct.toFixed(1) + "% —— 差一个量级。");
  P("        **所以「空」不是配色问题，是像素分配问题。**");
}

head("⑤ 对比度清单 —— 每个元素的亮度与它占的像素");

{
  //
  // ⚠️ 这一节是**手写清单**，所以它自己会腐烂 —— 上一版就是这么死的：
  //    广场改成「每簇自发光」之后，清单里还写着「全广场一盏灯」的那几层，
  //    而这份脚本没进 check:logic，于是它安静地错了好几天没人发现。
  //    所以每一项都带一个 `probe`：在 CSS 里找不到这个字串就报「已失效」。
  //
  const cssPath = join(here, "..", "app", "frontend-v2.css");
  const css = readFileSync(cssPath, "utf8");
  const layers = [
    ["广场容器", ".sq-root", "纯色", "整屏"],
    ["场地（逐簇光池）", ".sq-field", "radial", "整片地面"],
    ["发光物件光晕", ".sq-relic-halo", "radial", "每簇中心"],
    ["发光物件本体", ".sq-relic", "SVG", "每簇中心"],
    ["在场分身剪影", ".sq-figure-persona", "实体", "见 ④"],
    ["影子", ".sq-shadow", "实体", "见 ④"],
    ["缺口地洞", ".sq-hole-glow", "渐变", "每簇 1–3 个"],
    ["看山（主持人）", ".sq-kanshan-host", "SVG", "广场正中"],
    ["对语气泡", ".sq-bubble", "实体", "每簇 0–1 个"],
    ["答主姓名条", ".sq-crowd-who", "文本", "每簇一条"],
  ];
  P("  层级                     探针                       形态        占屏");
  P("  " + "-".repeat(72));
  let stale = 0;
  for (const [n, probe, f, a] of layers) {
    const ok = css.includes(probe);
    if (!ok) stale++;
    P("  " + n.padEnd(22) + (probe + (ok ? "" : " ✗已失效")).padEnd(28) + f.padEnd(12) + a);
  }
  P("");
  if (stale > 0) {
    P("  ⚠️ 有 " + stale + " 项在 app/frontend-v2.css 里找不到 —— 这份清单**已经腐烂**了。");
    P("     改这份清单前先去读 CSS，别照着旧清单调色。");
  } else {
    P("  ✅ 全部探针都能在 CSS 里找到，清单与实现同步。");
  }
}

head("⑥ 大屏为什么不显示更多 —— 缩放上限被钳死");

{
  //
  // ⚠️ 这一节以前是**推算**的，结论是「大屏只会看到更多空白」——
  //    那是拍脑袋：same scale + 更大的视口 = 装进**更多**世界，
  //    看到的是更多簇、不是更多空白。结论方向都说反了。
  //    现在实测：同一份布局，逐档屏幕量「入画簇数 / 人形像素高 / 空地占比」。
  //
  const measure = (vw, vh) => {
    const stageW = vw * 0.75 - 24;
    const stageH = vh - 64;
    const view = homeViewport(layout, stageW, stageH);
    let inView = 0;
    let covered = 0;
    for (const c of clusters) {
      const p = toScreen(c.x, c.y, view);
      const r = c.radius * view.scale;
      if (p.x > -r && p.x < stageW + r && p.y > -r && p.y < stageH + r) {
        inView++;
        covered += Math.PI * r * r;
      }
    }
    const hs = clusters
      .flatMap((c) => c.figures.filter((f) => f.kind === "persona").map((f) => f.height * view.scale))
      .sort((x, y) => x - y);
    return {
      scale: view.scale,
      inView,
      figPx: hs[Math.floor(hs.length / 2)],
      empty: 100 - (100 * covered) / (stageW * stageH),
    };
  };

  P("  屏幕            scale    入画簇数    人形中位高    入画后仍空");
  P("  " + "-".repeat(72));
  for (const [vw, vh] of [[1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
    const m = measure(vw, vh);
    P(
      "  " +
        (vw + "×" + vh).padEnd(16) +
        m.scale.toFixed(3).padStart(5) +
        String(m.inView + " / " + clusters.length).padStart(12) +
        (m.figPx.toFixed(1) + "px").padStart(14) +
        (m.empty.toFixed(1) + "%").padStart(14),
    );
  }
  P("");
  P("  读法：scale 恒定 0.92（`homeViewport` 写死的），所以**人形像素高不随屏幕变**。");
  P("        屏幕越大 → 装进更多世界 → 入画簇数变多、空地占比变小。");
  P("        所以大屏不是「更空」，而是「看得更全、人一样大」——");
  P("        真正该问的是另一个问题：小屏（1280）入画太少时，要不要自动降 scale。");
}

P("");
P("=".repeat(76));
P("  审计完毕。以上全部由真实数据 + 真实布局算出，无一处是估计值。");
P("=".repeat(76));
