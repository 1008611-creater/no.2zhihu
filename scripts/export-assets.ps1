# 把 docs/assets 里的 SVG 渲染成赛事表单需要的 PNG（封面图 + icon）。
#
# 用法（在项目根目录打开 PowerShell 后粘贴）：
#   pwsh -ExecutionPolicy Bypass -File scripts/export-assets.ps1
#
# 原理：调用本机已安装的 Edge 或 Chrome 的无头模式截图。
# 零安装、零联网、不引入任何依赖，也不上传任何内容。
# 产物统一放在 docs/assets/export/ 下。

$ErrorActionPreference = "Stop"

function Step($n, $text) { Write-Host "[$n] $text" -ForegroundColor Cyan }

# ---------- 1. 找浏览器 ----------
Step "1/5" "查找本机浏览器（Edge / Chrome）..."
$browser = $null
$candidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
foreach ($c in $candidates) {
  if (Test-Path $c) { $browser = $c; break }
}
if (-not $browser) {
  throw "未找到 Edge 或 Chrome。请手动打开 docs/assets/*.svg 截图，或安装任一浏览器后重试。"
}
Write-Host "  使用：$browser" -ForegroundColor Green

$root = (Get-Location).Path
$outDir = Join-Path $root "docs\assets\export"
$tmpDir = Join-Path $env:TEMP ("zhihu-assets-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

# ---------- 2. 准备任务 ----------
Step "2/5" "准备输出目录 docs/assets/export ..."

# 每一项：源 SVG、输出名、宽、高
$jobs = @(
  @{ Src = "docs\assets\cover.svg";       Out = "cover-1920x1080.png"; W = 1920; H = 1080 },
  @{ Src = "docs\assets\cover.svg";       Out = "cover-1600x900.png";  W = 1600; H = 900  },
  @{ Src = "docs\assets\cover.svg";       Out = "cover-1280x720.png";  W = 1280; H = 720  },
  @{ Src = "docs\assets\icon-square.svg"; Out = "icon-1024.png";       W = 1024; H = 1024 },
  @{ Src = "docs\assets\icon-square.svg"; Out = "icon-512.png";        W = 512;  H = 512  },
  @{ Src = "docs\assets\icon-square.svg"; Out = "icon-256.png";        W = 256;  H = 256  }
)

# ---------- 3. 渲染 ----------
Step "3/5" "渲染 PNG（每个尺寸约 1–3 秒）..."
$ok = 0
foreach ($j in $jobs) {
  $srcPath = Join-Path $root $j.Src
  if (-not (Test-Path $srcPath)) { Write-Host "  跳过（源文件不存在）：$($j.Src)" -ForegroundColor Yellow; continue }

  # 用一个零边距的 HTML 精确包住 SVG，避免浏览器默认留白
  $svgText = Get-Content -Raw -Encoding UTF8 $srcPath
  $html = @"
<!doctype html><html><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden}
  svg{display:block;width:$($j.W)px;height:$($j.H)px}
</style></head><body>
$svgText
</body></html>
"@
  $htmlPath = Join-Path $tmpDir ($j.Out + ".html")
  [System.IO.File]::WriteAllText($htmlPath, $html, (New-Object System.Text.UTF8Encoding($false)))

  $outPath = Join-Path $outDir $j.Out
  if (Test-Path $outPath) { Remove-Item $outPath -Force }

  $profile = Join-Path $tmpDir "profile"
  $chromeArgs = @(
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--user-data-dir=$profile",
    "--window-size=$($j.W),$($j.H)",
    "--screenshot=$outPath",
    ([System.Uri]$htmlPath).AbsoluteUri
  )
  & $browser @chromeArgs 2>$null | Out-Null

  if (Test-Path $outPath) {
    $kb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
    Write-Host "  OK $($j.Out)  ($($j.W)x$($j.H), $kb KB)" -ForegroundColor Green
    $ok++
  } else {
    Write-Host "  失败：$($j.Out)" -ForegroundColor Red
  }
}

# ---------- 4. 清理临时文件 ----------
Step "4/5" "清理临时文件 ..."
Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue

# ---------- 5. 完成 ----------
Step "5/5" "完成（成功 $ok / $($jobs.Count)）"
Write-Host ""
Write-Host "PNG 已导出到：$outDir" -ForegroundColor Green
Get-ChildItem $outDir -Filter *.png | Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}} | Format-Table -AutoSize
Write-Host "赛事表单填写建议：" -ForegroundColor Cyan
Write-Host "  封面图：cover-1920x1080.png（16:9，主用）；若页面限制体积，用 cover-1280x720.png"
Write-Host "  icon  ：icon-512.png（主用）；需要更大或更小用 icon-1024.png / icon-256.png"
Write-Host ""
Write-Host "注意：导出的是 PNG，不含任何凭证；可放心上传。" -ForegroundColor Green
