import { ImageResponse } from "next/og";

/**
 * 社交分享卡片（1200x630）。
 *
 * 刻意只用拉丁字符与几何图形：
 * next/og 内置字体不含中文字形，直接排版中文会渲染成方框。
 * 中文标题放在页面 metadata 里（分享时由平台展示），卡片本身走几何 + 英文。
 */
export const runtime = "edge";
export const alt = "Erhao Zhihu · Human Mesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENTS = ["#4d7cff", "#8b5cf6", "#2fbf8f", "#f59e0b"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #101322 0%, #0b0d17 55%, #161a2c 100%)",
          padding: 72,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -100,
            width: 620,
            height: 620,
            borderRadius: 620,
            background: "radial-gradient(circle, rgba(77,124,255,0.42) 0%, rgba(77,124,255,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -180,
            right: -120,
            width: 640,
            height: 640,
            borderRadius: 640,
            background: "radial-gradient(circle, rgba(47,191,143,0.32) 0%, rgba(47,191,143,0) 70%)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 26,
              background: "linear-gradient(135deg, #ffffff 0%, #c3cbe6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ width: 17, height: 21, borderRadius: 10, background: "#0b0d17" }} />
              <div style={{ width: 17, height: 21, borderRadius: 10, background: "#0b0d17" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, color: "#eef1fa", letterSpacing: 1 }}>ERHAO ZHIHU</div>
            <div style={{ fontSize: 19, color: "#8b93b0", letterSpacing: 4 }}>HUMAN MESH</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div style={{ fontSize: 78, color: "#f6f8ff", lineHeight: 1.12, letterSpacing: -1 }}>
            AI personas answer first.
          </div>
          <div style={{ fontSize: 78, color: "#9aa3c4", lineHeight: 1.12, letterSpacing: -1 }}>
            Real people fill the gap.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {ACCENTS.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 34, height: 8, borderRadius: 8, background: c }} />
            </div>
          ))}
          <div style={{ fontSize: 22, color: "#6f7794", marginLeft: 14, letterSpacing: 1 }}>
            Zhihu Hackathon 2026
          </div>
        </div>
      </div>
    ),
    size,
  );
}
