"""把 deploy-motion-pr8.md 渲染成自包含 HTML（无 CDN）。"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "docs" / "deploy-motion-pr8.md").read_text(encoding="utf-8")


def inline(t: str) -> str:
    """粗体 / 行内代码。先转义再替换，避免 HTML 注入。"""
    t = html.escape(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"`(.+?)`", r"<code class='ic'>\1</code>", t)
    return t


out, in_code = [], False
tbl = []


def flush_table():
    if not tbl:
        return
    head, *rows = tbl
    cells = [c.strip() for c in head.strip("|").split("|")]
    out.append('<table><thead><tr>' + "".join(f"<th>{inline(c)}</th>" for c in cells) + "</tr></thead><tbody>")
    for r in rows:
        if set(r.replace("|", "").strip()) <= set("-: "):
            continue
        cs = [c.strip() for c in r.strip("|").split("|")]
        out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cs) + "</tr>")
    out.append("</tbody></table>")
    tbl.clear()


for ln in src.split("\n"):
    if ln.startswith("```"):
        flush_table()
        if in_code:
            out.append("</code></pre>")
            in_code = False
        else:
            out.append("<pre><code>")
            in_code = True
        continue
    if in_code:
        out.append(html.escape(ln))
        continue
    if ln.startswith("|"):
        tbl.append(ln)
        continue
    flush_table()

    s = ln.strip()
    if ln.startswith("# "):
        out.append(f"<h1>{inline(ln[2:])}</h1>")
    elif ln.startswith("## "):
        out.append(f"<h2>{inline(ln[3:])}</h2>")
    elif ln.startswith("### "):
        out.append(f"<h3>{inline(ln[4:])}</h3>")
    elif ln.startswith("> "):
        out.append(f"<blockquote>{inline(ln[2:])}</blockquote>")
    elif s == "---":
        out.append("<hr>")
    elif s.startswith("- [ ]"):
        out.append(f"<div class='task'>{inline(s[5:].strip())}</div>")
    elif s.startswith("- "):
        out.append(f"<div class='li'>{inline(s[2:])}</div>")
    elif s == "":
        out.append("")
    else:
        out.append(f"<p>{inline(ln)}</p>")

flush_table()
if in_code:
    out.append("</code></pre>")

body = "\n".join(out)

DOC = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>上线部署提示词 · PR #8</title><style>
:root{--bg:#0b0d17;--line:#252838;--text:#e8eaf2;--dim:#96a0ba;--blue:#3E79FE;--green:#2fbf8f;--orange:#ff8a4c}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
font:15.5px/1.8 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
padding:40px 22px 100px;-webkit-font-smoothing:antialiased}
.wrap{max-width:880px;margin:0 auto}
h1{font-size:31px;line-height:1.28;margin:0 0 22px;letter-spacing:-.022em}
h2{font-size:20px;margin:48px 0 16px;padding-bottom:11px;border-bottom:1px solid var(--line)}
h3{font-size:16.5px;margin:30px 0 10px}
p{margin:11px 0}
strong{color:#fff;font-weight:700}
blockquote{margin:15px 0;padding:13px 18px;border-left:3px solid var(--blue);
background:rgba(62,121,254,.09);border-radius:0 9px 9px 0}
hr{border:0;border-top:1px solid var(--line);margin:36px 0}
pre{background:#06070d;border:1px solid var(--line);border-radius:11px;
padding:15px 17px;overflow-x:auto;margin:15px 0}
pre code{font:13px/1.7 "SF Mono",Consolas,Monaco,monospace;color:#9ee6c4;white-space:pre}
code.ic{font:13px/1 "SF Mono",Consolas,Monaco,monospace;color:#ffc98a;
background:rgba(255,201,138,.1);padding:2px 6px;border-radius:4px;white-space:nowrap}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
th{text-align:left;padding:10px 12px;background:#141726;border-bottom:1.5px solid var(--line);
font-weight:700;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid rgba(37,40,56,.6);color:#d3d8e6;
font-variant-numeric:tabular-nums}
tbody tr:hover{background:rgba(62,121,254,.05)}
.task{padding:6px 0 6px 28px;position:relative}
.task:before{content:"\\2610";position:absolute;left:3px;color:var(--blue);font-size:16px}
.li{padding:5px 0 5px 22px;position:relative}
.li:before{content:"\\00b7";position:absolute;left:7px;color:var(--blue);font-weight:700;font-size:18px}
@media(max-width:640px){
body{padding:20px 14px 64px;font-size:15px}
h1{font-size:23px}h2{font-size:17px;margin-top:36px}
table{font-size:12.5px}th{white-space:normal}td,th{padding:7px 8px}
pre{padding:12px 13px}pre code{font-size:11.5px}
}
</style></head><body><div class="wrap">
""" + body + """
</div></body></html>"""

p = ROOT / "_deploy-pr8.html"
p.write_text(DOC, encoding="utf-8")
print("已生成 %s（%d KB）" % (p, len(DOC.encode("utf-8")) // 1024))
