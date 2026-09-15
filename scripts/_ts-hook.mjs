/**
 * 让裸 Node 能直接加载本仓库的 TS 源码（自检脚本用）。
 *
 * 为什么需要它：本仓库的 import 走 bundler 风格、**不写扩展名**
 * （`import { x } from "./square-layout"`）—— Next 和 tsc 都能解析，
 * 但 Node 的 ESM 解析器要求显式扩展名，直接 `import "../lib/domain/crowd.ts"`
 * 会在 crowd.ts 内部的 `./square-layout` 处报 ERR_MODULE_NOT_FOUND。
 *
 * 另一个选择是把逻辑复制一份进脚本，但那等于自检**另一份代码** ——
 * 源码改了脚本不会跟着改，最后变成「自检全绿、线上出错」。
 * 补扩展名这件事只需要十几行，比维护第二份实现便宜得多。
 *
 * 用法（必须通过 `register()` 注册，且被测模块要用动态 `import()`，
 * 因为 ESM 的链接阶段在所有模块体执行之前 —— 静态 import 时钩子还没生效）：
 *
 *     import { register } from "node:module";
 *     register(new URL("./_ts-hook.mjs", import.meta.url));
 *     const { layoutSquare } = await import("../lib/domain/square-layout.ts");
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** 目录式导入的候选入口（`./personas` → `./personas/index.ts`）。 */
const DIR_INDEX = "/index.ts";

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[cm]?[jt]s$/.test(specifier);

  if (isRelative && !hasExt) {
    // 只补扩展名，不改写路径 —— 候选顺序与 tsc 的解析顺序一致。
    for (const candidate of [specifier + ".ts", specifier + DIR_INDEX]) {
      const asPath = candidate.startsWith("../")
        ? new URL(candidate, context.parentURL)
        : new URL(candidate, context.parentURL);
      try {
        if (existsSync(fileURLToPath(asPath))) {
          return await nextResolve(candidate, context);
        }
      } catch {
        /* 路径不合法就试下一个候选 */
      }
    }
  }

  return nextResolve(specifier, context);
}
