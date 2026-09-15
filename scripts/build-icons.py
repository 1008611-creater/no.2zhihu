"""从 logo 原图生成全套站点图标。

为什么还要位图（明明已经有矢量了）：
  Apple Touch Icon 只认 PNG，favicon.ico 也只能装位图，manifest 里的
  maskable 图标同样要 PNG。矢量那份（app/icon.svg）负责现代浏览器的
  favicon 与任意尺寸缩放，两者互补。

关键一步是**去噪**：源图是微信压缩过的，暖白底上带着肉眼几乎看不见但
数量巨大的色噪。不做处理直接存 PNG，调色板量化会被噪点撑爆——
实测 174KB 只能压到 98KB。而 logo 本质上只有三个平色（暖白底 / 黑头 /
蓝头），把每个像素吸附到最近的那个品牌色，噪点就没了；随后用 LANCZOS
降采样，硬边自然变成干净的抗锯齿过渡。实测 174KB → 13.8KB。

产出：
  app/icon.svg          —— 真矢量，由 scripts/build-logo-vector.py 生成（本脚本不碰）
  app/icon.png          —— 512x512，manifest 大图
  app/apple-icon.png    —— 180x180，Apple Touch Icon（Apple 只认 PNG）
  public/icon-192.png   —— 192x192，manifest 192 档
  app/favicon.ico       —— 16/32/48 多尺寸

⚠️ 不要生成 app/icon-192.png：Next 的图标约定只认 `icon.png` / `icon1.png` /
`icon2.png`，`icon-192.png` 这种带尺寸后缀的名字不会被注册成路由
（构建产物的路由表里根本没有它）。所以 192 档必须放在 public/。
"""

import io
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(os.path.dirname(ROOT))
SRC = os.path.join(WORKSPACE, "微信图片_20260915091948_593_1443.png")

# 品牌三色（与设计系统、logo-paths 一致）
PALETTE = np.array([[247, 246, 243], [21, 21, 22], [63, 121, 253]], dtype=np.int16)

# 图形包围盒（实测）x[254,998] y[292,946]，四周留边后做正方形裁切。
# 裁成正方形是为了图标不被非等比拉伸——原图 744x654 直接塞进方框会变形。
BBOX = (254, 292, 998, 946)
PAD = 34
QUANT_COLORS = 64


def denoise(img):
    """把每个像素吸附到最近的品牌色，抹掉压缩噪点。

    ⚠️ 必须用 int32 算距离。用 int16 的话，通道差最大 255，平方 65025
    直接溢出 int16 上限（32767），argmin 会取到完全错误的颜色——
    实测表现是整张图反相（底色变黑、侧影变白），但文件体积依然很小，
    所以只看体积的测试发现不了，必须核对像素值。
    """
    a = np.array(img).astype(np.int32)
    pal = PALETTE.astype(np.int32)
    d = ((a[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1)
    return Image.fromarray(PALETTE[d.argmin(-1)].astype(np.uint8))


def save_png(img, size, path):
    """降采样 + 调色板量化。降采样在前，硬边自然变成抗锯齿过渡。"""
    r = img.resize((size, size), Image.LANCZOS)
    r.quantize(colors=QUANT_COLORS).save(path, optimize=True)
    return os.path.getsize(path)


def main():
    im = Image.open(SRC).convert("RGB")
    print("源图 %dx%d" % im.size)

    x0, y0, x1, y1 = BBOX
    x0 -= PAD
    y0 -= PAD
    x1 += PAD
    y1 += PAD
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = max(x1 - x0, y1 - y0) // 2 + 8
    box = (cx - half, cy - half, cx + half, cy + half)

    # 用暖白铺底再粘贴，避免裁切越界时露出黑边
    canvas = Image.new("RGB", (half * 2, half * 2), tuple(PALETTE[0]))
    crop = im.crop((max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3])))
    canvas.paste(crop, (max(0, -box[0]), max(0, -box[1])))

    clean = denoise(canvas)
    print("去噪完成（%d 色吸附）" % len(PALETTE))

    APP = os.path.join(ROOT, "app")
    PUBLIC = os.path.join(ROOT, "public")

    targets = [
        (512, os.path.join(APP, "icon.png")),
        (180, os.path.join(APP, "apple-icon.png")),
        (192, os.path.join(PUBLIC, "icon-192.png")),
    ]
    for size, path in targets:
        before = os.path.getsize(path) if os.path.exists(path) else 0
        after = save_png(clean, size, path)
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        print("  %-24s %3dpx  %7dB → %6dB" % (rel, size, before, after))

    ico = os.path.join(APP, "favicon.ico")
    before = os.path.getsize(ico) if os.path.exists(ico) else 0
    clean.resize((256, 256), Image.LANCZOS).save(ico, sizes=[(16, 16), (32, 32), (48, 48)])
    print("  %-24s        %7dB → %6dB" % ("app/favicon.ico", before, os.path.getsize(ico)))


if __name__ == "__main__":
    main()
