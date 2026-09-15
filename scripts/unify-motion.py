"""
把散落的硬编码动效参数收敛到 lib/motion/tokens.ts。

原则：不做「把 0.3 改成 0.24」这种机械替换。每一处都先判断它在交互上
属于哪一类语义，再映射到对应层级：
  - 列表项依次入场  → DUR.slow（需要被看见，且要留出编排节奏）
  - 即时反馈（遮罩等）→ DUR.fast
  - 面板/抽屉滑入   → DUR.slow
  - 循环动画        → 保持原值（它们不是交互反馈，不该被统一）
同时把默认缓动换成 EASE.out / EASE.standard。
"""

import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_IMPORT = 'import { DUR, EASE, SHIFT, SPRING } from "@/lib/motion/tokens";'

# (文件, 原串, 新串, 说明)
EDITS = [
    # 网格图：连线绘制（0.7 是绘制时长，不是入场）保留；节点弹入归到 slow
    ("components/mesh/MeshGraph.tsx",
     "transition={{ duration: 0.34, delay: Math.min(i * 0.02, 0.6) }}",
     "transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.02, 0.6) }}",
     "节点入场"),

    # 用户知乎面板：条目入场
    ("components/mesh/UserZhihuPanel.tsx",
     "transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.3) }}",
     "transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.05, 0.3) }}",
     "条目入场"),

    # 交接面板：整体滑入
    ("components/mirror/HandoffPanel.tsx",
     "transition={{ duration: 0.4 }}",
     "transition={{ duration: DUR.slow, ease: EASE.out }}",
     "面板滑入"),

    # 答主卡：卡片入场
    ("components/mirror/PersonaCard.tsx",
     "transition={{ duration: 0.28, delay: Math.min(index * 0.035, 0.35) }}",
     "transition={{ duration: DUR.base, ease: EASE.out, delay: Math.min(index * 0.035, 0.35) }}",
     "卡片入场"),

    # 广场流：帖子入场
    ("components/square/FeedStream.tsx",
     "transition={{ duration: 0.26, delay: Math.min(i * 0.015, 0.3) }}",
     "transition={{ duration: DUR.base, ease: EASE.out, delay: Math.min(i * 0.015, 0.3) }}",
     "帖子入场"),

    # 数字滚动：保留 0.6（计数需要足够时间读完），只把 easeOut 换成曲线 token
    ("components/ui/CountUp.tsx",
     "duration: 0.6, ease: 'easeOut'",
     "duration: DUR.slower * 0.88, ease: EASE.out",
     "数字滚动"),

    # 标题拆字：入场
    ("components/ui/HeroTitle.tsx",
     "transition={{ duration: 0.6, ease: 'easeOut' }}",
     "transition={{ duration: DUR.slower * 0.88, ease: EASE.out }}",
     "标题拆字"),

    # 首页区块入场
    ("app/(flow)/page.tsx",
     "transition={{ duration: 0.35 }}",
     "transition={{ duration: DUR.slow, ease: EASE.out }}",
     "区块入场 A"),
    ("app/(flow)/page.tsx",
     "transition={{ duration: 0.4 }}",
     "transition={{ duration: DUR.slow, ease: EASE.out }}",
     "区块入场 B"),

    # 页面转场：保持稍长，换成 token
    ("app/template.tsx",
     "transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}",
     "transition={{ duration: DUR.slow, ease: EASE.out }}",
     "页面转场"),
]

# 同一串在多文件重复出现的（网格页、分身页的列表入场）
MULTI = [
    ("transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.4) }}",
     "transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.04, 0.4) }}"),
    ("transition={{ duration: 0.3, delay: Math.min(i * 0.05, 0.4) }}",
     "transition={{ duration: DUR.slow, ease: EASE.out, delay: Math.min(i * 0.05, 0.4) }}"),
    ("transition={{ duration: 0.3, delay: i * 0.05 }}",
     "transition={{ duration: DUR.slow, ease: EASE.out, delay: i * 0.05 }}"),
]
MULTI_FILES = ["app/(explore)/mesh/page.tsx", "app/(flow)/mirror/page.tsx"]


def ensure_import(src: str, path: str) -> str:
    """确保文件顶部引入了 token。已有 @/ 别名 import 的插在它前面。"""
    if "@/lib/motion/tokens" in src:
        return src
    lines = src.split("\n")
    # 找最后一条 import 语句的位置
    last = -1
    for i, ln in enumerate(lines):
        if ln.startswith("import "):
            last = i
    if last == -1:
        return src
    lines.insert(last + 1, TOKEN_IMPORT)
    return "\n".join(lines)


def main():
    changed = []
    for rel, old, new, label in EDITS:
        p = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(p):
            print("跳过（不存在）", rel)
            continue
        s = io.open(p, encoding="utf-8").read()
        if old not in s:
            print("未匹配", rel, "|", label)
            continue
        s = s.replace(old, new, 1)
        s = ensure_import(s, rel)
        io.open(p, "w", encoding="utf-8").write(s)
        changed.append(rel)
        print("OK  %-42s %s" % (rel, label))

    for rel in MULTI_FILES:
        p = os.path.join(ROOT, rel.replace("/", os.sep))
        if not os.path.exists(p):
            continue
        s = io.open(p, encoding="utf-8").read()
        n = 0
        for old, new in MULTI:
            while old in s:
                s = s.replace(old, new, 1)
                n += 1
        if n:
            s = ensure_import(s, rel)
            io.open(p, "w", encoding="utf-8").write(s)
            changed.append(rel)
            print("OK  %-42s 列表入场 ×%d" % (rel, n))

    # 去重
    changed = sorted(set(changed))
    print("\n共修改 %d 个文件" % len(changed))


if __name__ == "__main__":
    main()
