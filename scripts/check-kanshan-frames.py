#!/usr/bin/env python
"""看山素材的「重影」回归检查。

背景（2026-09-15 定位）：`public/kanshan/webp/*.webp` 是用 libwebp 的
`WebPAnimEncoder` 从官方 GIF 转出来的，而它会**把每帧裁成「变化区域」再做 alpha 混合** ——
变化区域里的透明像素不会擦掉上一帧，于是帧与帧叠加。浏览器优先用 WebP
（`components/kanshan/Kanshan.tsx` 里 `<picture>` 的 `<source type="image/webp">`），
所以用户看到的是「白色身体 + 多组黑色手臂 + 足球同时可见」的重影。

判据：**逐帧不透明像素数应当围绕同一个水平波动，不能单调增长。**
官方 GIF 实测稳定在 ~27k；坏 WebP 从 27k 一路涨到 50k。

用法：
    python scripts/check-kanshan-frames.py            # 只检查
    python scripts/check-kanshan-frames.py --rebuild   # 先用官方 GIF 重新生成 WebP

生成逻辑见 `scripts/build-kanshan-webp.py`（每帧显式写成 dispose=background + 不混合）。
"""
import argparse
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANIM = os.path.join(ROOT, "public", "kanshan", "anim")
WEBP = os.path.join(ROOT, "public", "kanshan", "webp")

# 帧间不透明像素数的容许波动。官方 GIF 实测 spread（(max-min)/max）在 0.01–0.13，
# 坏 WebP 是 0.79–0.84。取 0.30 作为分界：正常动画的姿态变化远小于这个值。
MAX_SPREAD = 0.30


def opaque_series(im, samples=8):
    n = getattr(im, "n_frames", 1)
    step = max(1, n // samples)
    out = []
    for i in range(0, n, step):
        im.seek(i)
        alpha = im.convert("RGBA").getchannel("A")
        out.append(sum(1 for v in alpha.get_flattened_data() if v > 8))
    return n, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="先用官方 GIF 重新生成 WebP")
    args = ap.parse_args()

    if args.rebuild:
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "build-kanshan-webp.py")], check=True)

    failed = []
    print(f"{'素材':<16}{'帧数':<8}{'不透明像素 spread':<22}{'判定'}")
    for name in sorted(os.listdir(ANIM)):
        if not name.endswith(".gif"):
            continue
        stem = name[:-4]
        gp = os.path.join(ANIM, name)
        wp = os.path.join(WEBP, stem + ".webp")
        if not os.path.exists(wp):
            failed.append(f"{stem}.webp 不存在")
            continue

        gn, _ = opaque_series(Image.open(gp))
        wn, ws = opaque_series(Image.open(wp))
        spread = (max(ws) - min(ws)) / max(1, max(ws))
        ok = spread <= MAX_SPREAD and wn == gn
        if not ok:
            failed.append(f"{stem}.webp spread={spread:.2f} 帧数={wn}（GIF {gn}）")
        print(f"{stem + '.webp':<16}{wn:<8}{spread:<22.3f}{'OK' if ok else '重影/帧数不符'}")

    print()
    if failed:
        print("检查未通过：")
        for f in failed:
            print("  ✗ " + f)
        print("\n修法：python scripts/check-kanshan-frames.py --rebuild")
        return 1
    print("全部通过：动画 WebP 无帧累积（重影已消除），且与官方 GIF 帧数一致。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
