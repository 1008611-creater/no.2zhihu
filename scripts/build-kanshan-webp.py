"""从官方 GIF 重新生成**无重影**的动画 WebP。

背景（2026-09-15 实测）：
  仓库里现存的 public/kanshan/webp/*.webp 是坏帧 —— libwebp 的 WebPAnimEncoder
  会把每帧裁剪成「变化区域」并做 alpha 混合，变化区域里的**透明像素不会擦掉上一帧**，
  于是帧与帧叠加。实测每帧不透明像素数：
      ball.webp      27091 → 48530（1.79×）
      computer.webp  27286 → 50252（1.84×）
      sway.webp      27680 → 48672（1.76×）
      greet.webp     27716 → 39832（1.44×）
      sleepy.webp    27241 → 34616（1.27×）
  而官方 GIF 本身是干净的（同一指标 27k，比值 1.00）。浏览器优先用 WebP，
  所以用户看到的就是「白色身体 + 多组黑色手臂 + 足球同时可见」的重影。

修法：不碰官方 GIF，只用 Pillow 把 GIF 逐帧合成成完整 RGBA 帧，
再用 libwebp 编码成单帧 WebP，最后**自己拼 ANMF 容器**，
把每帧显式写成 dispose=1（恢复背景）+ blend=1（不混合）——
这样每帧都是整幅替换，透明像素一定擦掉上一帧。

纯本地、零额度、可复现：scripts/build-kanshan-webp.py
"""
import os
import struct
import sys
from PIL import Image, ImageSequence

SRC = os.path.join("public", "kanshan", "anim")
DST = os.path.join("public", "kanshan", "webp")

QUALITY = 80
ALPHA_QUALITY = 100
METHOD = 6


def u24(n: int) -> bytes:
    return struct.pack("<I", n)[:3]


def chunks_of(webp_bytes: bytes):
    """从单帧 WebP 里取出 VP8/VP8L/ALPH 三个 chunk，按规范顺序返回。"""
    assert webp_bytes[:4] == b"RIFF" and webp_bytes[8:12] == b"WEBP", "not a webp"
    pos = 12
    out = []
    while pos + 8 <= len(webp_bytes):
        fourcc = webp_bytes[pos : pos + 4]
        size = struct.unpack("<I", webp_bytes[pos + 4 : pos + 8])[0]
        payload = webp_bytes[pos + 8 : pos + 8 + size]
        if fourcc in (b"ALPH", b"VP8 ", b"VP8L"):
            out.append((fourcc, payload))
        pos += 8 + size + (size & 1)
    # 规范要求 ALPH 在 VP8 之前
    order = {b"ALPH": 0, b"VP8 ": 1, b"VP8L": 0}
    out.sort(key=lambda c: order.get(c[0], 9))
    return out


def build_webp(frames, durations, canvas, out_path):
    w, h = canvas
    anim = bytearray()

    for i, (fr, dur) in enumerate(zip(frames, durations)):
        parts = chunks_of(fr)
        payload = b"".join(fourcc + struct.pack("<I", len(p)) + p + (b"\0" if len(p) & 1 else b"") for fourcc, p in parts)
        flags = 0x01 | 0x02  # dispose=background, blend=do not blend
        hdr = (
            u24(0) + u24(0) + u24(w - 1) + u24(h - 1)
            + u24(max(10, dur))
            + bytes([flags])
        )
        body = hdr + payload
        anim += b"ANMF" + struct.pack("<I", len(body)) + body

    vp8x_payload = bytes([0x02 | 0x10]) + b"\0\0\0" + u24(w - 1) + u24(h - 1)
    vp8x = b"VP8X" + struct.pack("<I", len(vp8x_payload)) + vp8x_payload
    anim_chunk = b"ANIM" + struct.pack("<I", 6) + struct.pack("<I", 0) + struct.pack("<H", 0)

    payload = vp8x + anim_chunk + bytes(anim)
    riff = b"RIFF" + struct.pack("<I", len(payload) + 4) + b"WEBP" + payload
    with open(out_path, "wb") as f:
        f.write(riff)
    return len(riff)


def main():
    total_before = 0
    total_after = 0
    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".gif"):
            continue
        stem = name[:-4]
        src = os.path.join(SRC, name)
        dst = os.path.join(DST, stem + ".webp")
        old = os.path.getsize(dst) if os.path.exists(dst) else 0

        im = Image.open(src)
        frames = []
        durations = []
        for fr in ImageSequence.Iterator(im):
            frames.append(fr.convert("RGBA").copy())
            durations.append(fr.info.get("duration", 50))
        im.close()

        # 逐帧编码为单帧 WebP（用 Pillow 调 libwebp，只是不用它的动画封装）
        encoded = []
        for fr in frames:
            import io

            buf = io.BytesIO()
            fr.save(buf, format="WEBP", quality=QUALITY, alpha_quality=ALPHA_QUALITY,
                    method=METHOD, lossless=False)
            encoded.append(buf.getvalue())

        size = build_webp(encoded, durations, (frames[0].width, frames[0].height), dst)
        total_before += old
        total_after += size
        print(f"{stem}.webp: {len(frames)} 帧  {old/1024:.0f}KB → {size/1024:.0f}KB")

    print(f"合计 {total_before/1024:.0f}KB → {total_after/1024:.0f}KB")


if __name__ == "__main__":
    sys.exit(main())
