"""把看山官方动图 GIF 转成 WebP —— 逐字节保留视觉，只换容器与压缩。

为什么需要：6 段官方 GIF 合计 5.66 MB，首页会 preload 其中一段，
移动端评委打开页面最先等的就是它。WebP 在同等视觉下有质的体积优势，
且 2026 年所有主流浏览器都已支持（Safari 14+ / Chrome / FireFox / Edge）。

产物落到 public/kanshan/webp/，GIF 原文件保留 —— 官方素材不得删改，
降级链是 WebP -> 原 GIF，而不是用 WebP 替换掉原文件。
"""
import os
import subprocess
import sys

NAMES = ["ball", "computer", "greet", "idle", "sleepy", "sway"]
FFMPEG = r"C:\Users\lsb\AppData\Local\Programs\ffmpeg\bin\ffmpeg.exe"

base = os.path.join("public", "kanshan")
out_dir = os.path.join(base, "webp")
os.makedirs(out_dir, exist_ok=True)

total_gif = total_webp = 0
for name in NAMES:
    src = os.path.join(base, "anim", f"{name}.gif")
    dst = os.path.join(out_dir, f"{name}.webp")
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "error", "-i", src,
         "-c:v", "libwebp", "-lossless", "0", "-q:v", "76",
         "-loop", "0", "-an", dst],
        check=True,
    )
    g = os.path.getsize(src)
    w = os.path.getsize(dst)
    total_gif += g
    total_webp += w
    print(f"{name:9s} gif {g/1024:7.1f} KB -> webp {w/1024:7.1f} KB  ({w/g*100:5.1f}%)")

print(f"{'TOTAL':9s} gif {total_gif/1024/1024:7.2f} MB -> webp "
      f"{total_webp/1024/1024:6.2f} MB  ({total_webp/total_gif*100:.1f}%)")
print(f"节省 {(total_gif-total_webp)/1024/1024:.2f} MB")
