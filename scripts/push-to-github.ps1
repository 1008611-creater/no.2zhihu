# 一键推送到 GitHub（公开仓库）。
#
# 用法（在项目根目录打开 PowerShell 后粘贴）：
#   pwsh -ExecutionPolicy Bypass -File scripts/push-to-github.ps1
#
# 可选参数：
#   -RepoUrl  https://github.com/<用户名>/<仓库名>.git   默认用下面的 $RepoUrl
#   -Message  "自定义提交信息"
#
# 前置：本机已安装 Git 与 GitHub CLI（gh）。
# 首次使用需要先跑一次  gh auth login  完成浏览器授权；脚本会帮你检测。
#
# 设计说明：本脚本刻意不使用 $ErrorActionPreference = "Stop"。
# 原因：git push / gh auth status 会把正常进度写到 stderr，
# 在「遇错即停」模式下会被 PowerShell 误判为致命错误而中断推送。
# 因此改为：每一条关键命令都显式检查 $LASTEXITCODE。

param(
  [string]$RepoUrl = "https://github.com/1008611-creater/no.2zhihu.git",
  [string]$Branch = "main",
  [string]$Message = "feat: 二号知乎 Human Mesh —— 多 Skill 分身 + 看山缺口识别 + Human Mesh",
  [string]$UserName = "1008611-creater",
  [string]$UserEmail = "1008611-creater@users.noreply.github.com"
)

$ErrorActionPreference = "Continue"

function Step($n, $text) { Write-Host "[$n] $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "已中止：$text" -ForegroundColor Red; exit 1 }

# ---------- 1. 环境检查 ----------
Step "1/7" "检查 git ..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Fail "未找到 git，请先安装：https://git-scm.com/download/win"
}
Write-Host "  OK：git 可用。" -ForegroundColor Green

# ---------- 2. GitHub 登录状态 ----------
Step "2/7" "检查 GitHub 登录状态 ..."
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "  未检测到 GitHub CLI（gh）。" -ForegroundColor Yellow
  Write-Host "  这不影响推送：git 会在首次 push 时弹出浏览器授权窗口。" -ForegroundColor Yellow
} else {
  gh auth status
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  未登录 GitHub。请先在另一个窗口执行：" -ForegroundColor Yellow
    Write-Host "      gh auth login" -ForegroundColor White
    Write-Host "  选 GitHub.com -> HTTPS -> 用浏览器登录，完成后回来重跑本脚本。" -ForegroundColor Yellow
    Fail "GitHub 尚未登录（gh auth status 失败）。"
  }
  Write-Host "  OK：GitHub 已登录。" -ForegroundColor Green
  # 让 git 复用 gh 的凭证（重复执行无副作用）。
  gh auth setup-git 2>$null | Out-Null
}

# ---------- 3. 安全闸门（最重要的一步）----------
Step "3/7" "安全检查：确认凭证文件不会被提交 ..."
if (Test-Path ".env.local") {
  $ignored = git check-ignore -v .env.local 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $ignored) {
    Fail "危险：.env.local 没有被 .gitignore 忽略！请先修 .gitignore 再推送。"
  }
  Write-Host "  OK：.env.local 已被忽略 -> $ignored" -ForegroundColor Green
} else {
  Write-Host "  提示：本地没有 .env.local，跳过该项检查。" -ForegroundColor Yellow
}

# ---------- 4. 初始化仓库 ----------
Step "4/7" "初始化 git 仓库 ..."
if (-not (Test-Path ".git")) {
  git init | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "git init 失败。" }
}
# 用 symbolic-ref 而不是 branch -M：新仓库还没有第一个提交时，branch -M 会失败。
git symbolic-ref HEAD "refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) { Fail "无法设置分支名为 $Branch。" }

# ---------- 5. 暂存 ----------
Step "5/7" "暂存文件（.env.local / .official / .refs / .skills / .tools 均被忽略）..."
git add -A
if ($LASTEXITCODE -ne 0) { Fail "git add 失败。" }
git status --short

# 二次防线：暂存区里绝不能出现凭证文件。
$staged = @(git diff --cached --name-only)
$bad = $staged | Where-Object { $_ -match "(^|/)\.env\.local$" -or $_ -match "(^|/)\.git-remote-token$" }
if ($bad) { Fail ("暂存区里出现了凭证文件：" + ($bad -join ", ")) }
Write-Host ("  暂存 " + $staged.Count + " 个文件，未发现凭证文件。") -ForegroundColor Green

# ---------- 6. 提交 ----------
Step "6/7" "提交 ..."
$pending = git status --porcelain
if ($pending) {
  git -c user.name="$UserName" -c user.email="$UserEmail" commit -m "$Message"
  if ($LASTEXITCODE -ne 0) { Fail "git commit 失败。" }
} else {
  Write-Host "  没有需要提交的改动。" -ForegroundColor Yellow
}

# ---------- 7. 推送 ----------
Step "7/7" "推送到 $RepoUrl ..."
git remote remove origin 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "  （此前没有 origin，跳过）" -ForegroundColor DarkGray }
git remote add origin $RepoUrl
if ($LASTEXITCODE -ne 0) { Fail "添加 remote 失败。" }
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "推送失败。常见原因与对策：" -ForegroundColor Yellow
  Write-Host "  - 代理不可用：全局 gitconfig 指向 http://127.0.0.1:7897，请确认代理已启动。" -ForegroundColor Yellow
  Write-Host "  - 凭证失效：重跑 gh auth login。" -ForegroundColor Yellow
  Fail "git push 返回非零退出码。"
}

Write-Host ""
Write-Host "完成！仓库地址：$RepoUrl" -ForegroundColor Green
Write-Host "下一步：" -ForegroundColor Green
Write-Host "  1. 打开仓库确认文件已出现，并查看 Actions 里的绿色 CI。" -ForegroundColor Green
Write-Host "  2. 到 https://vercel.com/new 导入该仓库，配置环境变量 ZHIHU_ACCESS_SECRET。" -ForegroundColor Green
