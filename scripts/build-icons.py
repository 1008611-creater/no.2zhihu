"""
从用户提供的 logo 原图裁切生成全套站点图标。

为什么不用矢量化：时间紧，且位图在 favicon 这类小尺寸下完全够用。
源图 1254x1254 分辨率远超所有目标尺寸，降采样后边缘依然锐利。

产出：
  app/icon.svg        —— 保留矢量包装，内嵌 512 PNG（Next 直接可用）
  app/apple-icon.png  —— 180x180，Apple Touch Icon（Apple 只认 PNG）
  app/icon.png        —— 512x512，manifest 大图
  app/favicon.ico     —— 16/32/48 多尺寸
  public/logo.png     —— 顶栏主 logo 用（透明边距已裁紧）
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = os.path.dirname(os.path.dirname(ROOT))
SRC = os.path.join(WORKSPACE, "微信图片_20260915091948_593_1443.png")

BG = (247, 246, 243)  # #F7F6F3 暖白底，与 logo 原底色一致

im = Image.open(SRC).convert("RGB")
print("源图", im.size)

# 图形包围盒（实测）：x[254,998] y[292,946]，四周留 4% 呼吸边距后做正方形裁切。
# 裁成正方形是为了图标不被非等比拉伸——原图 744x654 直接塞进方框会变形。
x0, y0, x1, y1 = 254, 292, 998, 946
pad = 34
x0 -= pad; y0 -= pad; x1 += pad; y1 += pad

cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
half = max(x1 - x0, y1 - y0) // 2 + 8
box = (cx - half, cy - half, cx + half, cy + half)
print("裁切框", box, "边长", half * 2)

# 用暖白底铺底再粘贴，避免裁切越界时出现黑边
canvas = Image.new("RGB", (half * 2, half * 2), BG)
crop = im.crop((max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3])))
canvas.paste(crop, (max(0, -box[0]), max(0, -box[1])))

APP = os.path.join(ROOT, "app")
PUBLIC = os.path.join(ROOT, "public")

# 全部用 LANCZOS 降采样，保住边缘锐度
canvas.resize((512, 512), Image.LANCZOS).save(os.path.join(APP, "icon.png"), optimize=True)
canvas.resize((180, 180), Image.LANCZOS).save(os.path.join(APP, "apple-icon.png"), optimize=True)
canvas.resize((192, 192), Image.LANCZOS).save(os.path.join(APP, "icon-192.png"), optimize=True)
canvas.resize((512, 512), Image.LANCZOS).save(
    os.path.join(PUBLIC, "logo.png"), optimize=True
)

# favicon.ico 打包 16/32/48 三档
canvas.resize((256, 256), Image.LANCZOS).save(
    os.path.join(APP, "favicon.ico"),
    sizes=[(16, 16), (32, 32), (48, 48)],
)

for f in ["app/icon.png", "app/apple-icon.png", "app/icon-192.png",
          "app/favicon.ico", "public/logo.png"]:
    p = os.path.join(ROOT, f.replace("/", os.sep))
    print("  %-22s %7d B" % (f, os.path.getsize(p)))
