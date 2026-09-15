"""把 logo 的两层轮廓矢量化，输出与 logo-layers/*.png 完全同一套坐标系。

为什么要在位图之外再出一套矢量：
  - 顶栏 logo 只有 32px，却要下载并解码两张 785x695 的 RGBA 位图；
    改成 inline <path> 后是零请求、零解码，且任意尺寸都锐利。
  - favicon 的 16px 尺寸下位图会糊成一团，只有矢量能「一套源、任意尺寸清晰」。

做法：源图是纯色块图形（暖白底 / 黑头 / 蓝头），边缘干净。按颜色拆成两个
二值掩膜，各自用 Potrace 追踪轮廓，再叠回同一坐标系。
Potrace 是二值追踪器，所以必须分层——彩色图会退化成大量碎块。

输出：
  lib/brand/logo-paths.ts   两个层的 path d 字符串（供 LogoMark inline 使用）
  app/icon.svg              自包含矢量图标（暖白底砖 + 两层）
"""

import glob
import os
import re
import sys

import numpy as np
import potrace
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(os.path.dirname(ROOT))

# 与 split-logo-layers.py 保持完全一致的裁切，保证两套产物坐标对齐
PAD_RATIO = 0.03
BRICK = "#F7F6F3"
HUMAN = "#151517"
SHADOW = "#3F79FD"


def find_source():
    hits = sorted(glob.glob(os.path.join(WORKSPACE, "微信图片_*.png")), key=os.path.getmtime, reverse=True)
    if not hits:
        sys.exit("找不到源图")
    return hits[0]


def classify(arr):
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    blue = (b - r > 55) & (b > 170)
    black = (r < 100) & (g < 100) & (b < 110) & (~blue)
    return blue, black


def trace(mask, turdsize=40, alphamax=1.0, opttolerance=0.4):
    """追踪掩膜 → SVG path 的 d 字符串。

    turdsize 调到 40：源图经微信压缩，边缘有噪点，不过滤会生成一堆碎 path
    把文件撑大且视觉上出现毛刺。
    alphamax=1.0 是 Potrace 对「含正圆」图形的推荐值——logo 交叠处有个正圆白洞。
    opttolerance 放宽到 0.4 换更少的曲线段，肉眼无差但体积显著下降。

    ⚠️ 两个已实测确认的坑，改动前务必先读：

    1. **必须传 `~mask`。** 本版 potrace 绑定沿用 PBM 约定（0 = 黑，1 = 白），
       直接传 mask 会让它把「背景」当成填充区追踪，结果是每个 path 都额外带上
       一整圈画布矩形轮廓——渲染出来就是一团糊掉的实心块。
       实测：不取反 → x[0,W] y[0,H] 满框；取反 → 只剩图形本身。
    2. **不能做 `mask[::-1]`。** 实测不翻转时输出 y 与图像行号一致（SVG 里 y 小=上方，
       正确）；翻转后 y 会上下镜像（方块在上部却输出 y[75,90]）。
       原脚本两处都写反，且从未被真正使用过，所以一直没暴露。
    """
    data = np.ascontiguousarray(~mask)  # 见上方第 1 条
    path = potrace.Bitmap(data).trace(turdsize=turdsize, alphamax=alphamax, opttolerance=opttolerance)

    parts = []
    for curve in path:
        sx, sy = curve.start_point.x, curve.start_point.y
        parts.append("M%.1f %.1f" % (sx, sy))
        for seg in curve:
            ex, ey = seg.end_point.x, seg.end_point.y
            if seg.is_corner:
                cx, cy = seg.c.x, seg.c.y
                parts.append("L%.1f %.1fL%.1f %.1f" % (cx, cy, ex, ey))
            else:
                c1x, c1y = seg.c1.x, seg.c1.y
                c2x, c2y = seg.c2.x, seg.c2.y
                parts.append("C%.1f %.1f %.1f %.1f %.1f %.1f" % (c1x, c1y, c2x, c2y, ex, ey))
        parts.append("Z")
    d = "".join(parts)
    assert_tight(d, mask.shape)
    return d


def assert_tight(d, shape):
    """自检：path 不能顶满整个画布。

    如果 potrace 又把背景当图形追踪了，path 会正好铺满画布矩形。
    这个断言就是为了让那个 bug 一出现就炸，而不是悄悄上线一坨糊图。
    """
    nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
    xs, ys = nums[0::2], nums[1::2]
    h, w = shape
    spans = (max(xs) - min(xs) >= w - 1) and (max(ys) - min(ys) >= h - 1)
    if spans:
        raise AssertionError(
            "path 铺满了整个画布（%dx%d）—— potrace 很可能又在追踪背景了。"
            "检查 trace() 里是否漏了 `~mask`。" % (w, h)
        )


def main():
    src = find_source()
    im = Image.open(src).convert("RGB")
    arr = np.array(im).astype(np.float32)
    blue, black = classify(arr)

    ys, xs = np.where(blue | black)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    pad = int((y1 - y0) * PAD_RATIO)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(arr.shape[1] - 1, x1 + pad), min(arr.shape[0] - 1, y1 + pad)

    blue_c = blue[y0:y1 + 1, x0:x1 + 1]
    black_c = black[y0:y1 + 1, x0:x1 + 1]
    LH, LW = black_c.shape

    d_shadow = trace(blue_c)
    d_human = trace(black_c)
    print("视图盒 %dx%d" % (LW, LH))
    print("  shadow path %d 字符" % len(d_shadow))
    print("  human  path %d 字符" % len(d_human))

    # ---- 1. 供 React inline 使用的路径模块 ----
    ts = '''/**
 * 品牌标识的矢量轮廓（自动生成，勿手改）。
 *
 * 生成脚本：scripts/build-logo-vector.py
 * 坐标系：viewBox="0 0 %d %d"，与 public/logo-layers/*.png 完全一致。
 *
 * 为什么用矢量而不是位图：顶栏 logo 只有 32px，位图方案要下载并解码两张
 * 785x695 的 RGBA 图；inline path 是零请求、零解码，且任意尺寸都锐利。
 */

export const LOGO_VIEWBOX = { width: %d, height: %d } as const;

/** 真人（黑）：在上层。 */
export const LOGO_HUMAN_PATH =
  "%s";

/** 分身（蓝）：在下层。 */
export const LOGO_SHADOW_PATH =
  "%s";
''' % (LW, LH, LW, LH, d_human, d_shadow)

    out_ts = os.path.join(ROOT, "lib", "brand", "logo-paths.ts")
    os.makedirs(os.path.dirname(out_ts), exist_ok=True)
    with open(out_ts, "w", encoding="utf-8") as f:
        f.write(ts)
    print("写出 lib/brand/logo-paths.ts  %d B" % os.path.getsize(out_ts))

    # ---- 2. 自包含矢量图标 ----
    # 图标用正方形：直接复用 logo 层的宽高比会得到 785x695 的非正方形，
    # favicon 必须正方形，所以把图形按比例居中放进正方形画布。
    side = max(LW, LH)
    ox, oy = (side - LW) / 2.0, (side - LH) / 2.0
    r = int(round(side * 0.122))  # 圆角 ≈ iOS squircle 观感

    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'width="512" height="512" role="img" aria-label="影子知乎">'
        '<rect width="%d" height="%d" rx="%d" fill="%s"/>'
        '<g transform="translate(%.1f %.1f)">'
        '<path fill="%s" d="%s"/>'
        '<path fill="%s" d="%s"/>'
        '</g></svg>'
        % (side, side, side, side, r, BRICK, ox, oy, SHADOW, d_shadow, HUMAN, d_human)
    )
    out_svg = os.path.join(ROOT, "app", "icon.svg")
    with open(out_svg, "w", encoding="utf-8") as f:
        f.write(svg)
    print("写出 app/icon.svg  %d B（原为 45400 B 的 base64 内嵌位图）" % os.path.getsize(out_svg))


if __name__ == "__main__":
    main()
