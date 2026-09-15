"""
生成自包含的 app/icon.svg —— 把 PNG 以 base64 内嵌。

为什么不引用外链：SVG 作为 <img> 或 favicon 加载时，浏览器禁止其引用
外部资源，href="/icon.png" 会静默失败。必须把像素直接内嵌进来。

为什么不直接用 PNG 当 favicon：SVG 在任意 DPR 下由浏览器按需光栅化，
高分屏更锐利；同时保留 512 视口的圆角裁切，避免 iOS/安卓把方形图标
自动套上圆角后露出白边。
"""

import base64
import io
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
png = os.path.join(ROOT, "app", "icon.png")

# 内嵌的像素必须压到最小：favicon 会在每个页面被请求，200KB+ 会拖慢首屏。
# 图形只有三种主色（暖白 / 黑 / 蓝），量化到 64 色足够还原，体积降一个量级。
im = Image.open(png).convert("RGB").resize((256, 256), Image.LANCZOS)
buf = io.BytesIO()
im.convert("P", palette=Image.ADAPTIVE, colors=64).save(
    buf, format="PNG", optimize=True
)
raw = buf.getvalue()
print("内嵌 PNG 体积:", len(raw), "B（原", os.path.getsize(png), "B）")

b64 = base64.b64encode(raw).decode("ascii")

svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
    'width="512" height="512" role="img" aria-label="二号知乎">\n'
    '  <defs>\n'
    '    <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>\n'
    '  </defs>\n'
    '  <g clip-path="url(#tile)">\n'
    '    <image x="0" y="0" width="512" height="512" '
    'preserveAspectRatio="xMidYMid slice" '
    'href="data:image/png;base64,%s"/>\n'
    '  </g>\n'
    '</svg>\n' % b64
)

out = os.path.join(ROOT, "app", "icon.svg")
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print("写出", out, os.path.getsize(out), "B")
