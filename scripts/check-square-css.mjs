/**
 * 广场 CSS 自检：两件**肉眼看不出来、但一定会错**的事。
 *
 *  ① 用了没定义的 CSS 变量。
 *     `color: var(--text-600)` 在变量不存在时**不报错**，只是让这条声明失效、
 *     颜色退化成继承值。`.sq-crowd-who` 就是这么坏的：设计意图是「比标题轻一档」，
 *     实际渲染成继承来的主文本色；悬停那条也是同一个毛病，于是**悬停毫无变化**。
 *     这类 bug 在所有构建、所有类型检查里都是绿的，只有量对比度才抓得到。
 *
 *  ② 元素与它背后地面的对比度。
 *     「气泡看不见」不是大小问题，是亮度问题：实测气泡底 #14182a 对页面底
 *     只有 1.12:1 —— 它是**一块和地面同亮度的深色板**。尺寸再大也一样看不见。
 *     所以这里断言的是亮度比，不是像素。
 *
 * 颜色一律从 CSS 里现读，不写死 —— 改了 CSS 而数字没跟着变，脚本会立刻红。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const CSS_FILES = ["app/frontend-v2.css", "app/globals.css"];

/**
 * 去掉 CSS 注释后再分析。
 *
 * 为什么必须去掉：注释里会**引用**变量（「这里原来是 var(--text-600)」），
 * 不剥掉的话，修好之后反而永远报「未定义」—— 一个把人引向错误结论的检查
 * 比没有检查更糟。行号会因此偏移，所以报错里给的是**剥注释后**的行号，
 * 定位时按变量名搜更稳。
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const cssText = new Map();
for (const f of CSS_FILES) {
  try {
    cssText.set(f, stripComments(readFileSync(f, "utf8")));
  } catch {
    cssText.set(f, "");
  }
}
const all = [...cssText.values()].join("\n");

let problems = 0;
const fail = (msg) => {
  problems++;
  console.log("  ✗ " + msg);
};
const pass = (msg) => console.log("  ✓ " + msg);
const head = (t) => {
  console.log("");
  console.log("=".repeat(74));
  console.log("  " + t);
  console.log("=".repeat(74));
};

/* ---------------------- ① 未定义的 CSS 变量 ---------------------- */

head("① 所有 var(--x) 都必须有定义（失效的声明不报错，只会悄悄退化）");

{
  // 收集所有在 CSS 里定义过的变量名（含 :root 与其它选择器里的局部定义）
  const defined = new Set();
  for (const m of all.matchAll(/(--[a-z0-9-]+)\s*:/gi)) defined.add(m[1]);

  // 运行时注入的变量：**不是 bug**，不能报。
  //   · layout.tsx 的 next/font 注入 --font-display / --font-mono
  //   · 组件内联 style 注入 --sq-depth-opacity / --sq-relic-power
  // 所以要扫 .tsx/.ts，把它们算作已定义。
  const injected = new Set();
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir, { recursive: true });
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, String(n));
      if (![".ts", ".tsx"].includes(extname(p))) continue;
      try {
        if (!statSync(p).isFile()) continue;
        const t = readFileSync(p, "utf8");
        for (const m of t.matchAll(/(--[a-z0-9-]{3,})/gi)) injected.add(m[1]);
      } catch {
        /* 读不动就跳过 */
      }
    }
  };
  walk("app");
  walk("components");
  walk("lib");

  // 只收**没有 fallback** 的 var()。写了 var(--x, 1) 的，即使 x 不存在也有兜底，
  // 不会让整条声明失效 —— 那是有意为之的防御写法，不是 bug。
  const used = new Map(); // name -> { n, withFallback }
  for (const m of all.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/gi)) {
    const name = m[1];
    const hasFallback = m[2] === ",";
    const cur = used.get(name) ?? { n: 0, bare: 0 };
    cur.n++;
    if (!hasFallback) cur.bare++;
    used.set(name, cur);
  }

  const missing = [...used.entries()].filter(
    ([n, v]) => v.bare > 0 && !defined.has(n) && !injected.has(n),
  );

  console.log(
    "  引用 " + used.size + " 个变量；CSS 定义 " + defined.size + " 个；运行时注入 " + injected.size + " 个",
  );
  if (missing.length === 0) {
    pass("所有**无兜底**的 var() 都能找到定义（其余带了 fallback，不会整条失效）");
  } else {
    for (const [n, v] of missing) {
      let line = "?";
      for (const [file, txt] of cssText) {
        const i = txt.indexOf("var(" + n);
        if (i >= 0) {
          line = file + ":" + (txt.slice(0, i).split("\n").length);
          break;
        }
      }
      fail(
        "未定义变量 " + n + "（" + v.bare + "/" + v.n + " 处无兜底，首次在 " + line + "）" +
          " —— 这条声明会整体失效，且**不报任何错**",
      );
    }
  }
}

/* ---------------------- ② 对比度 ---------------------- */

head("② 对比度：元素必须能从它背后的地面上「浮」出来");

/** sRGB → 相对亮度（WCAG 2.1 定义） */
function lum(r, g, b) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function parseColor(s) {
  if (!s) return null;
  const t = s.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(t);
  if (m) return [17, 17, 17].map((k, i) => parseInt(m[1][i] + m[1][i], 16));
  m = /^#([0-9a-f]{6})$/i.exec(t);
  if (m) {
    const h = m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(t);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function ratio(c1, c2) {
  const a = lum(...c1);
  const b = lum(...c2);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 读某个选择器块里的某条声明。
 *
 * 为什么要按「选择器列表」匹配：CSS 里大量写成
 *   `.a .who,\n.b .who { color: ... }`
 * 中间是逗号不是 `{`，只按单个选择器匹配会**静默读不到**（返回 null），
 * 然后被当成「变量未定义」报出来 —— 报的是错的病。
 * 所以先取 `{` 之前的整段选择器列表，再按逗号拆开比对。
 */
function declOf(selector, prop) {
  const txt = cssText.get("app/frontend-v2.css") ?? "";
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // ⚠️ 不要写成 `(^|\})([^{}]*)\{...\}`：上一个块的结尾 `}` 会被上一次匹配吃掉，
  //    紧随其后的那个块就再也匹配不上（`.sq-bubble` 就是这么被漏掉的，
  //    于是报「读不到颜色」—— 报错指向的病是错的）。
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(txt))) {
    const list = m[1].split(",").map((s) => s.trim());
    if (!list.includes(selector)) continue;
    const dm = new RegExp("(?:^|;|\\n)\\s*" + esc(prop) + "\\s*:\\s*([^;]+)", "m").exec(m[2]);
    if (dm) return dm[1].trim();
  }
  return null;
}

/** 把 `var(--x)` 解析到具体色值；解析不了返回 null（让调用方显式失败） */
function resolve(raw) {
  if (!raw) return null;
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw.trim());
  if (!m) return parseColor(raw);
  const name = m[1];
  // 取**最后一次**定义（:root 里后者覆盖前者；frontend-v2 覆盖 globals）
  let last = null;
  for (const txt of cssText.values()) {
    for (const dm of txt.matchAll(new RegExp("(?:^|[;{}\\s])" + name + "\\s*:\\s*([^;}]+)", "g"))) {
      last = dm[1].trim();
    }
  }
  if (!last) return null;
  return resolve(last); // 可能是 var(--y) 的链式别名
}

// 页面底：.sq-root 的 background 最后一层（var(--ink-950) → --surface）
const surfaceHex = resolve("var(--surface)");
if (!surfaceHex) fail("读不到 --surface（页面底色）—— 对比度无从算起");
const pageBg = surfaceHex;

console.log("  页面底色 rgb(" + pageBg.join(",") + ")");

// 气泡：底 / 边框 / 正文 / 署名
const bubbleBg = resolve(declOf(".sq-bubble", "background"));
const bubbleText = resolve(declOf(".sq-bubble-text", "color"));
const bubbleWho = resolve(declOf(".sq-bubble-who", "color"));

if (!bubbleBg || !bubbleText || !bubbleWho) {
  fail("读不到气泡的三条颜色（background / 正文 / 署名）—— 选择器或写法变了");
} else {
  console.log("  气泡底 rgb(" + bubbleBg.join(",") + ")  正文 rgb(" + bubbleText.join(",") + ")");

  const rText = ratio(bubbleText, bubbleBg);
  const rWho = ratio(bubbleWho, bubbleBg);
  const rSurface = ratio(bubbleBg, pageBg);

  console.log("    正文 / 气泡底 = " + rText.toFixed(2) + ":1");
  console.log("    署名 / 气泡底 = " + rWho.toFixed(2) + ":1");
  console.log("    气泡底 / 页面底 = " + rSurface.toFixed(2) + ":1  ← 这条决定「看不看得见」");

  if (rText >= 4.5) pass("正文对比度 " + rText.toFixed(2) + " ≥ 4.5（正文可读）");
  else fail("正文对比度只有 " + rText.toFixed(2) + "（< 4.5）—— 气泡里的字会糊");

  if (rWho >= 4.5) pass("署名对比度 " + rWho.toFixed(2) + " ≥ 4.5");
  else fail("署名对比度只有 " + rWho.toFixed(2) + "（< 4.5）—— 看不出是谁说的");

  // 1.5 是「一块板能从地面上被认出来」的经验下限。
  // 实测 1.12 时的观感就是「一片更深的影子」，不是「一条气泡」。
  if (rSurface >= 1.5) pass("气泡底 vs 页面底 " + rSurface.toFixed(2) + " ≥ 1.5（气泡能被看见）");
  else
    fail(
      "气泡底 vs 页面底只有 " + rSurface.toFixed(2) + "（< 1.5）—— 气泡与地面几乎同亮度，" +
        "放大字号也看不出来。这条就是「气泡太小看不见」的真实根因。",
    );
}

// 姓名条：必须比标题轻一档（设计意图），且悬停必须真的变亮
const titleColor = resolve(declOf(".sq-crowd-title", "color"));
const whoColor = resolve(declOf(".sq-crowd-who", "color"));
const whoHover = resolve(declOf(".sq-crowd-node-hover .sq-crowd-who", "color"));

if (!titleColor || !whoColor) {
  fail("读不到标题 / 姓名条的颜色");
} else {
  const rt = ratio(titleColor, pageBg);
  const rw = ratio(whoColor, pageBg);
  console.log("");
  console.log("  标题 rgb(" + titleColor.join(",") + ")  姓名条 rgb(" + whoColor.join(",") + ")");
  console.log("    标题 / 页面底 = " + rt.toFixed(2) + ":1");
  console.log("    姓名条 / 页面底 = " + rw.toFixed(2) + ":1");

  if (rt >= 4.5) pass("标题对比度 " + rt.toFixed(2) + " ≥ 4.5");
  else fail("标题对比度只有 " + rt.toFixed(2) + " —— 22 个标题是广场的主要信息，读不了就全废");

  if (rw >= 4.5) pass("姓名条对比度 " + rw.toFixed(2) + " ≥ 4.5");
  else fail("姓名条对比度只有 " + rw.toFixed(2) + "（< 4.5）—— 名字等于没写");

  // 「轻一档」的量化：姓名条的亮度必须**低于**标题，否则它跟标题抢注意力。
  const lt = lum(...titleColor);
  const lw = lum(...whoColor);
  if (lw < lt) pass("姓名条亮度 " + lw.toFixed(3) + " < 标题 " + lt.toFixed(3) + "（确实轻一档）");
  else
    fail(
      "姓名条亮度 " + lw.toFixed(3) + " ≥ 标题 " + lt.toFixed(3) +
        " —— 名字跟标题一样亮，浮标会变吵（多半是变量失效退化成了继承色）",
    );

  if (whoHover) {
    const lh = lum(...whoHover);
    if (lh > lw * 1.15) pass("悬停时姓名条变亮（" + lw.toFixed(3) + " → " + lh.toFixed(3) + "）");
    else fail("悬停色 " + lh.toFixed(3) + " 没比常态 " + lw.toFixed(3) + " 亮 —— 悬停等于没反馈");
  } else {
    fail("读不到悬停态的姓名条颜色（多半是变量未定义）");
  }
}

/* ---------------------- ③ 发光物件 ---------------------- */

head("③ 话题中心的发光物件必须真的「亮」（owner 的原话：像奇珍异宝一样发光）");

{
  /**
   * 带 alpha 的解析 + 合成。
   *
   * 为什么必须合成：`.sq-relic-body` 原来写的是 `rgba(255,214,178,0.22)` ——
   * 只比 RGB 不看 alpha，会算出「暖白色」，看起来完全正常；
   * 但 22% 叠在近黑地面上实际是 rgb(66,55,48)，**和背景几乎同亮度**。
   * 「读代码看不出、看数字才看得见」的坑，就在这个 alpha 上。
   */
  function parseRGBA(s) {
    if (!s) return null;
    const t = s.trim();
    let m = /^#([0-9a-f]{6})$/i.exec(t);
    if (m) {
      const h = m[1];
      return [+parseInt(h.slice(0, 2), 16), +parseInt(h.slice(2, 4), 16), +parseInt(h.slice(4, 6), 16), 1];
    }
    m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i.exec(t);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return null;
  }
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));

  const bodyRaw = declOf(".sq-relic-body", "fill");
  const lineRaw = declOf(".sq-relic-line", "stroke");
  const detailRaw = declOf(".sq-relic-detail", "stroke");
  const svgW = declOf(".sq-relic-svg", "width");

  const bodyRGBA = parseRGBA(bodyRaw);
  const lineRGBA = parseRGBA(lineRaw);

  if (!bodyRGBA) {
    fail("读不到 .sq-relic-body 的 fill（写法变了？）");
  } else {
    const bodyOnPage = over(bodyRGBA, pageBg);
    const rBody = ratio(bodyOnPage, pageBg);
    console.log("  物件本体 raw = " + bodyRaw + "  alpha=" + bodyRGBA[3]);
    console.log("    合成到页面底 = rgb(" + bodyOnPage.map((v) => Math.round(v)).join(",") + ")");
    console.log("    物件本体 / 页面底 = " + rBody.toFixed(2) + ":1");
    console.log("    svg 占物件框 = " + svgW + "（屏幕上物件本体约 " +
      (74 * 0.4).toFixed(0) + "px 量级）");

    // 4.5：与正文同级。它不是装饰，是「这场在聊什么」的唯一图形线索 ——
    // 人看不清物件，整场讨论就只剩标题可读。
    if (rBody >= 4.5) pass("物件本体对比度 " + rBody.toFixed(2) + " ≥ 4.5（真的在发光）");
    else
      fail(
        "物件本体对比度只有 " + rBody.toFixed(2) + "（< 4.5）—— 它和地面几乎同亮度，" +
          "owner 要的「像奇珍异宝一样发光」在屏幕上根本不成立。" +
          "多半是 fill 的 alpha 太低（实测 0.22 时只有 1.72:1）。",
      );

    // 本体必须**亮于**页面底（是「发光的东西」，不是「地上的洞」）
    const lb = lum(...bodyOnPage);
    const lp = lum(...pageBg);
    if (lb > lp) pass("物件本体亮于页面底（" + lb.toFixed(3) + " > " + lp.toFixed(3) + "）");
    else fail("物件本体不比页面底亮 —— 读起来是个坑，不是发光的东西");
  }

  const lBody = bodyRGBA ? lum(...over(bodyRGBA, pageBg)) : 0;
  const lPage = lum(...pageBg);

  // 内部细节线（钟的指针 / 药瓶分隔 / 楼的窗）：压在实心亮本体上 → 必须**深于**本体
  if (!detailRaw) {
    fail("读不到 .sq-relic-detail 的 stroke");
  } else {
    const lDetail = lum(...over(parseRGBA(detailRaw), pageBg));
    console.log("  内部细节线 raw = " + detailRaw + "  亮度 " + lDetail.toFixed(3));
    if (lDetail < lBody) pass("内部细节线深于本体（" + lDetail.toFixed(3) + " < " + lBody.toFixed(3) + "）");
    else
      fail(
        "内部细节线亮度 " + lDetail.toFixed(3) + " ≥ 本体 " + lBody.toFixed(3) +
          " —— 本体是实心亮色时，浅色线会完全融进去（指针 / 分隔 / 窗格等于没画）",
      );
  }

  // 外部轮廓线（杯柄 / 蒸汽 / 镜腿 / 底座）：压在近黑的地面上 → 必须**亮于**页面底
  if (!lineRGBA) {
    fail("读不到 .sq-relic-line 的 stroke");
  } else {
    const lLine = lum(...over(lineRGBA, pageBg));
    console.log("  外部轮廓线 raw = " + lineRaw + "  亮度 " + lLine.toFixed(3));
    if (lLine > lPage * 4) {
      pass("外部轮廓线明显亮于页面底（" + lLine.toFixed(3) + " vs " + lPage.toFixed(3) + "）");
    } else {
      fail(
        "外部轮廓线亮度 " + lLine.toFixed(3) + " 不够亮（页面底 " + lPage.toFixed(3) +
          "）—— 杯柄 / 蒸汽 / 镜腿压在近黑地面上会看不见。" +
          "这两类线**不能共用一个类名**：内部线要深、外部线要亮。",
      );
    }
  }
}

console.log("");
console.log("=".repeat(74));
console.log(problems === 0 ? "  全部通过（0 处问题）" : "  " + problems + " 处问题");
console.log("=".repeat(74));
process.exit(problems === 0 ? 0 : 1);
