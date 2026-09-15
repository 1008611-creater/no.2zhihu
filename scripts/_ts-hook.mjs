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
 * 补扩展名 + 转译这件事只需要几十行，比维护第二份实现便宜得多。
 *
 * ## 为什么还需要一个 load 钩子（2026-09-15 补，在 CI 上实测踩到）
 *
 * 只有 resolve 钩子是**不够的**，而且这个缺口很隐蔽：
 * 本机 Node 22 自带 TS 类型剥离（native type stripping），`.ts` 能被直接加载，
 * 所以脚本在本机跑得好好的；而 **CI 用的是 Node 20，没有这个能力** ——
 *
 *     TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
 *
 * 于是形成最坏的一种组合：**守卫在本机绿、在 CI 红**，而且没人知道 ——
 * 因为这些脚本此前根本没进过 CI。修法是给 `.ts` 自己转译，
 * 让 Node 20 与 Node 22 走**同一条路径**，本机结果即可代表 CI 结果。
 *
 * 转译用仓库自己的 `typescript`（devDependency，CI 的 npm install 会装），
 * 因此不会引入第二份编译器版本。拿不到 typescript 时退回 nextLoad ——
 * 那种情况下 Node 22+ 的原生剥离仍然兜得住。
 *
 * 用法（必须通过 `register()` 注册，且被测模块要用动态 `import()`，
 * 因为 ESM 的链接阶段在所有模块体执行之前 —— 静态 import 时钩子还没生效）：
 *
 *     import { register } from "node:module";
 *     register(new URL("./_ts-hook.mjs", import.meta.url));
 *     const { layoutSquare } = await import("../lib/domain/square-layout.ts");
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

/** 目录式导入的候选入口（`./personas` → `./personas/index.ts`）。 */
const DIR_INDEX = "/index.ts";

/** 需要自己转译的扩展名。 */
const TS_EXT = /\.tsx?$/;

/** 仓库自带的 TypeScript；拿不到就退回 Node 自身的处理。 */
let ts = null;
try {
  ts = createRequire(import.meta.url)("typescript");
} catch {
  ts = null;
}

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

export async function load(url, context, nextLoad) {
  // 只接管本地的 .ts / .tsx；其余（node: 内置、json、.mjs）原样交给 Node。
  if (!ts || !url.startsWith("file:") || !TS_EXT.test(url)) {
    return nextLoad(url, context);
  }

  const path = fileURLToPath(url);
  const source = readFileSync(path, "utf8");
  const out = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      // 逐文件转译，不做跨文件类型检查 —— 与「自检脚本只关心运行期行为」一致；
      // 类型正确性由 CI 里的 tsc --noEmit 单独负责。
      isolatedModules: true,
      esModuleInterop: true,
      removeComments: false,
      sourceMap: false,
    },
  });

  return { format: "module", source: out.outputText, shortCircuit: true };
}
