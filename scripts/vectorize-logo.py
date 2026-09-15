"""
把老二号知乎的 logo 位图矢量化成干净的 SVG。

为什么需要它：位图在 favicon 那种 16px 尺寸下会糊成一团，苹果 touch icon
也必须能在高 DPI 屏上锐利。只有矢量才能「一套源文件、任意尺寸都清晰」。

做法：源图是纯色块图形（暖白底 #F7F6F3 / 黑头 #151516 / 蓝头 #3E79FE），
边缘干净。所以按颜色把图拆成三个二值掩膜，各自用 Potrace 追踪轮廓，
再按「底 → 蓝 → 黑」的顺序叠回同一个 SVG。

为什么分层而不是一次追踪彩色图：Potrace 是二值追踪器，彩色图会退化成
大量碎块。分层后每层都是单一闭合 path，输出体积小、缩放不失真。

用法：python scripts/vectorize-logo.py
输入：工作区根目录的 微信图片_*.png（1254x1254）
输出：app/icon.svg（512 视口）+ 一份 1024 视口的大图版
"""

import os
import sys
import glob
import numpy as np
from PIL import Image
import potrace


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(os.path.dirname(ROOT))
SRC_PATTERN = os.path.join(WORKSPACE, "微信图片_*.png")


def find_source():
    hits = sorted(glob.glob(SRC_PATTERN), key=os.path.getmtime, reverse=True)
    if not hits:
        sys.exit("找不到源图：%s" % SRC_PATTERN)
    return hits[0]


def classify(arr):
    """把 RGB 数组分类成 底 / 蓝 / 黑。返回两个布尔掩膜。

    阈值依据实测采样：底色 #F7F6F3、黑 #151516、蓝 #3E79FE。
    取色判据用「蓝通道显著高于红通道」来识别蓝色，比直接比色值稳。
    """
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)

    blue = (b - r > 55) & (b > 170)
    black = (r < 90) & (g < 90) & (b < 100) & (~blue)
    return blue, black


def trace(mask, turdsize=12, alphamax=1.0, opttolerance=0.2):
    """把布尔掩膜追踪成 SVG path 的 d 属性字符串。

    turdsize 过滤掉小于 N 像素的孤立斑点——微信压缩会在边缘留下噪点，
    不过滤会生成一堆无意义的碎 path。
    alphamax 控制圆角平滑度：1.0 是 Potrace 对「有圆形元素」的推荐值，
    调高会让轮廓更硬。logo 里有正圆（交叠处的白洞），取 1.0 最合适。
    """
    data = np.ascontiguousarray(mask[::-1])  # Potrace 用左下为原点
    bmp = potrace.Bitmap(data)
    path = bmp.trace(turdsize=turdsize, alphamax=alphamax, opttolerance=opttolerance)

    parts = []
    for curve in path:
        sx, sy = curve.start_point
        parts.append("M%.2f %.2f" % (sx, sy))
        for seg in curve:
            if seg.is_corner:
                cx, cy = seg.c
                ex, ey = seg.end_point
                parts.append("L%.2f %.2f L%.2f %.2f" % (cx, cy, ex, ey))
            else:
                c1x, c1y = seg.c1
                c2x, c2y = seg.c2
                ex, ey = seg.end_point
                parts.append(
                    "C%.2f %.2f %.2f %.2f %.2f %.2f"
                    % (c1x, c1y, c2x, c2y, ex, ey)
                )
        parts.append("Z")
    return "".join(parts)


def main():
    src = find_source()
    print("源图:", src)
    im = Image.open(src).convert("RGB")
    W, H = im.size
    print("尺寸:", W, "x", H)

    arr = np.array(im)
    blue_mask, black_mask = classify(arr)
    print("蓝像素 %d  黑像素 %d" % (blue_mask.sum(), black_mask.sum()))

    # 图形包围盒，用于裁掉多余留白、让 logo 在各尺寸下都占满视觉面积
    ys, xs = np.where(blue_mask | black_mask)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    print("图形包围盒 x[%d,%d] y[%d,%d] w=%d h=%d" % (x0, x1, y0, y1, x1 - x0, y1 - y0))

    # 裁切时四周留一点呼吸边距（图形高度的 4%），避免贴边显得局促
    pad = int(round((y1 - y0) * 0.04))
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(W - 1, x1 + pad); y1 = min(H - 1, y1 + pad)
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    print("裁切后 %dx%d（含 %dpx 边距）" % (cw, ch, pad))

    blue_m = blue_mask[y0:y1 + 1, x0:x1 + 1]
    black_m = black_mask[y0:y1 + 1, x0:x1 + 1]

    # 裁切后重算包围盒——裁切边界本身没有内容，追踪前必须回收到实际图形上，
    # 否则 Potrace 会沿整个矩形边缘生成一圈假轮廓。
    def rebox(m):
        yy, xx = np.where(m)
        return m[yy.min():yy.max() + 1, xx.min():xx.max() + 1], xx.min(), yy.min()

    blue_t, bx, by = rebox(blue_m)
    black_t, kx, ky = rebox(black_m)

    d_blue = trace(blue_t)
    d_black = trace(black_t)
    print("蓝 path 长度 %d  黑 path 长度 %d" % (len(d_blue), len(d_black)))

    # 两层各自相对裁切区的偏移，合成时要还原到同一坐标系
    def wrap(d, offx, offy):
        return '<g transform="translate(%d %d)">%s</g>' % (offx, offy, "<path d=\"%s\"/>" % d)

    # 视图盒：用「蓝层的包围盒」和「黑层的包围盒」的并集，保证两层都在内
    vx = min(bx, kx); vy = min(by, ky)
    vx2 = max(bx + blue_t.shape[1], kx + black_t.shape[1])
    vy2 = max(by + blue_t.shape[0], ky + black_t.shape[0])
    vw, vh = vx2 - vx, vy2 - vy
    print("并集视图盒 w=%d h=%d" % (vw, vh))

    # 统一平移：把两层坐标都减去 vx/vy
    body = (
        '<g id="blue" fill="#3E79FE" fill-rule="nonzero">'
        '<path transform="translate(%d %d)" d="%s"/></g>'
        % (bx - vx, by - vy, d_blue)
        + '<g id="black" fill="#151516" fill-rule="nonzero">'
        '<path transform="translate(%d %d)" d="%s"/></g>'
        % (kx - vx, ky - vy, d_black)
    )

    def build(size, corner):
        """暖白圆角底砖 + 图形。corner 用比例算，保证各尺寸圆角视觉一致。"""
        return (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
            'width="%d" height="%d" role="img" aria-label="二号知乎">\n'
            '  <rect width="%d" height="%d" rx="%d" fill="#F7F6F3"/>\n'
            '  <svg x="%.2f%%" y="%.2f%%" width="%.2f%%" height="%.2f%%" '
            'viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet">\n'
            '    %s\n'
            '  </svg>\n'
            '</svg>\n'
            % (
                size, size, size, size,
                size, size, int(round(size * 0.22)),
                (pad / float(cw)) * 100 * 0.75, (pad / float(ch)) * 100 * 0.75,
                (vw / float(cw)) * 100 * 0.75, (vh / float(ch)) * 100 * 0.75,
                vw, vh,
                body,
            )
        )

    out512 = os.path.join(ROOT, "app", "icon.svg")
    with open(out512, "w", encoding="utf-8") as f:
        f.write(build(512, 0.22))
    print("写出:", out512, os.path.getsize(out512), "B")


def d_blue_bg(x):
    return x


if __name__ == "__main__":
    main()
