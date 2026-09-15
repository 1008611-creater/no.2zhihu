"""
把 logo 拆成可独立运动的图层，导出为透明 PNG。

为什么要拆：位图整体是死的，只能做缩放/位移这类「整体动效」，很廉价。
但 logo 的构造是两个独立侧影（真人黑头、分身蓝头）交叠，交叠处挖了一个
白色负空间圆。拆层之后，就能让「分身」相对「真人」轻微偏移再归位，
让中间的圆像呼吸一样缩放 —— 这是叙事性的动效，不是装饰性的。

实现要点：
  - 不按硬阈值一刀切，边界像素给出部分 alpha，避免锯齿与脏边。
  - 蓝层在下、黑层在上，与原始叠放顺序一致。
  - 交叠处的白色圆洞属于「挖空」语义：从两层中各自扣掉，不做成独立图层。

输出：public/logo-layers/human.png（真人/黑）与 shadow.png（分身/蓝）
"""

import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(os.path.dirname(ROOT))
SRC = os.path.join(WORKSPACE, "微信图片_20260915091948_593_1443.png")
OUT = os.path.join(ROOT, "public", "logo-layers")


def largest_component(mask):
    """纯 numpy 连通域，只保留最大的一块。

    为什么需要：微信压缩会在图形边缘留下零散像素，不清理的话拆层后
    会出现漂浮的碎点。这里用「行扫描 + 并查集」的简化版：按行分段，
    再把上下相邻且水平有交叠的段合并，最后取最大的连通块。
    """
    H, W = mask.shape
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    segs = []          # (row, start, end, id)
    prev_row, prev_segs = -2, []
    for y in range(H):
        xs = np.flatnonzero(mask[y])
        if xs.size == 0:
            prev_row, prev_segs = y, []
            continue
        # 把连续的行像素切成段
        breaks = np.flatnonzero(np.diff(xs) > 1)
        starts = np.concatenate(([0], breaks + 1))
        ends = np.concatenate((breaks, [xs.size - 1]))
        cur = []
        for s, e in zip(starts, ends):
            seg = (y, int(xs[s]), int(xs[e]))
            sid = len(segs)
            segs.append(seg)
            parent[sid] = sid
            cur.append((sid, seg))
            # 与上一行有水平交叠的段合并
            if prev_row == y - 1:
                for pid, (_, ps, pe) in prev_segs:
                    if ps <= seg[2] and seg[1] <= pe:
                        union(pid, sid)
        prev_row, prev_segs = y, cur

    if not segs:
        return mask

    from collections import defaultdict
    groups = defaultdict(int)
    for sid, seg in enumerate(segs):
        groups[find(sid)] += seg[2] - seg[1] + 1

    best = max(groups, key=groups.get)
    keep = np.zeros_like(mask)
    for sid, (y, s, e) in enumerate(segs):
        if find(sid) == best:
            keep[y, s:e + 1] = True
    return keep


def soft_alpha(mask, feather=1.2):
    """把二值掩膜转成带亚像素过渡的 alpha。

    直接在 0/1 边界渲染会得到锯齿（尤其是缩放到 16px 的 favicon）。
    这里用「距离 + 线性衰减」做一层 1.2px 的软化，等价于廉价抗锯齿，
    但不依赖任何外部库。
    """
    m = mask.astype(np.float32)
    # 4 邻域均值做一次平滑，再与原值取较大者，保住主体不被削弱
    blur = (
        np.roll(m, 1, 0) + np.roll(m, -1, 0)
        + np.roll(m, 1, 1) + np.roll(m, -1, 1) + m * 4.0
    ) / 8.0
    a = np.maximum(m, blur)
    return np.clip(a * 255.0, 0, 255).astype(np.uint8)


def main():
    im = Image.open(SRC).convert("RGB")
    arr = np.array(im).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    blue = (b - r > 55) & (b > 170)
    black = (r < 100) & (g < 100) & (b < 110) & (~blue)

    blue = largest_component(blue)
    black = largest_component(black)
    print("蓝层像素 %d   黑层像素 %d" % (blue.sum(), black.sum()))

    # 图形包围盒（两层并集），裁到紧致并留 3% 边距
    ys, xs = np.where(blue | black)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    pad = int((y1 - y0) * 0.03)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(arr.shape[1] - 1, x1 + pad), min(arr.shape[0] - 1, y1 + pad)
    sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))

    blue, black = blue[sl], black[sl]
    # 用裁切区里的原色均值作为填充色：比写死十六进制更能贴近原图
    def mean_color(mask, chan_slice):
        sel = arr[sl][mask]
        return tuple(int(round(v)) for v in sel.mean(axis=0))

    blue_rgb = mean_color(blue, sl)
    black_rgb = mean_color(black, sl)
    print("蓝层均色 #%02X%02X%02X   黑层均色 #%02X%02X%02X" % (blue_rgb + black_rgb))

    os.makedirs(OUT, exist_ok=True)

    def write(name, mask, rgb):
        h, w = mask.shape
        img = np.zeros((h, w, 4), dtype=np.uint8)
        img[:, :, 0], img[:, :, 1], img[:, :, 2] = rgb
        img[:, :, 3] = soft_alpha(mask)
        p = os.path.join(OUT, name)
        Image.fromarray(img, "RGBA").save(p, optimize=True)
        print("  %-14s %6d B  %dx%d" % (name, os.path.getsize(p), w, h))

    write("shadow.png", blue, blue_rgb)   # 分身（蓝）在下层
    write("human.png", black, black_rgb)  # 真人（黑）在上层

    # 关键：把裁切框记录下来，供渲染层换算坐标。
    # 图层是紧密裁切过的，渲染时必须按这个比例放回画布，否则两层会错位。
    import json
    meta = {
        "source": "微信图片_20260915091948_593_1443.png",
        "sourceSize": [int(arr.shape[1]), int(arr.shape[0])],
        "crop": [int(x0), int(y0), int(x1) + 1, int(y1) + 1],
        "layerSize": [int(black.shape[1]), int(black.shape[0])],
        "note": "layerSize 即渲染时的 viewBox 尺寸；图层已紧致裁切，x=0 y=0 铺满即可。",
    }
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("  meta.json      %s" % (meta["crop"],))

    # 同时导出一张合成参考图，供视觉核对
    comp = np.zeros((black.shape[0], black.shape[1], 4), dtype=np.uint8)
    for m, rgb in ((blue, blue_rgb), (black, black_rgb)):
        a = soft_alpha(m).astype(np.float32) / 255.0
        for c in range(3):
            comp[:, :, c] = (comp[:, :, c] * (1 - a) + rgb[c] * a).astype(np.uint8)
        comp[:, :, 3] = np.maximum(comp[:, :, 3], (a * 255).astype(np.uint8))
    cp = os.path.join(OUT, "_preview.png")
    Image.fromarray(comp, "RGBA").save(cp)
    print("  合成预览       %6d B" % os.path.getsize(cp))


if __name__ == "__main__":
    main()
