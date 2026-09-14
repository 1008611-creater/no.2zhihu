#requires -version 5.1
<#
  把本地 Git 历史对齐到远端，解决「git pull / git push 互相拒绝」的问题。

  背景：本仓库的本地历史与远端历史是两条独立的线。
  本地用 git init 建了一个根提交 65ff2cc（内容 = 远端首推 71cf2ae，
  逐字节相同），但两者没有共同祖先。于是：
    - 本地 git log 只能看到 1 个提交
    - git pull 报 unrelated histories / git push 报 non-fast-forward

  本脚本做的事：
    1. 把当前提交存成备份分支（随时可 git branch 找回）
    2. 抓取远端
    3. 确认本地没有任何「远端没有的内容」（有则中止）
    4. git reset --mixed 到远端 —— 只移动分支指针和索引，
       工作区文件一个字节都不会动

  用法（在项目根目录执行）：
    pwsh -File scripts/repair-git-history.ps1
    仅检查不修改： pwsh -File scripts/repair-git-history.ps1 -CheckOnly
#>
[CmdletBinding()]
param(
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"

function Fail($m) { Write-Host ""; Write-Host "  [X] $m" -ForegroundColor Red; Write-Host ""; exit 1 }
function Step($m) { Write-Host "  -> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "  对齐本地 Git 历史到 $Remote/$Branch" -ForegroundColor White
Write-Host ""

if (-not (Test-Path ".git")) {
  Fail "这里不是 Git 仓库根目录。请先 cd 到项目根目录（含 .git 的那一层）再执行。"
}

Step "检查远端 $Remote ..."
git remote get-url $Remote *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "没有配置远端 $Remote。先执行：git remote add $Remote https://github.com/1008611-creater/no.2zhihu.git"
}

Step "抓取远端最新提交 ..."
git fetch $Remote $Branch
if ($LASTEXITCODE -ne 0) {
  Fail "抓取失败。检查网络/代理，或确认已登录：gh auth status"
}

$target = "$Remote/$Branch"
$targetSha = git rev-parse $target 2>$null
if ($LASTEXITCODE -ne 0 -or -not $targetSha) { Fail "无法解析 $target" }
Ok "$target = $($targetSha.Substring(0,7))"

# --- 安全检查：本地提交里有没有远端不存在的内容 ---
$localSha = git rev-parse HEAD 2>$null
if ($localSha -and $localSha -ne $targetSha) {
  Step "检查本地提交里是否有远端没有的文件 ..."
  $localOnly = @(git diff --name-only --diff-filter=D $targetSha HEAD 2>$null | Where-Object { $_ })
  $deleted = @(git diff --name-only --diff-filter=A $targetSha HEAD 2>$null | Where-Object { $_ })
  if ($deleted.Count -gt 0) {
    Warn "本地独有（远端没有）的文件：$($deleted.Count) 个"
    $deleted | Select-Object -First 10 | ForEach-Object { Write-Host "        $_" -ForegroundColor Yellow }
    Write-Host ""
    Fail "这些内容只存在于本地提交中。为避免丢失，脚本已中止。请先把它们推上去，或告诉我，我帮你处理。"
  }
  Ok "本地提交没有远端缺失的内容，可以安全对齐。"
}

# --- 工作区改动只是提示，不是危险 ---
$wt = @(git diff --name-only HEAD 2>$null | Where-Object { $_ })
if ($wt.Count -gt 0) {
  Warn "工作区有 $($wt.Count) 个文件已改动（未提交）——对齐后它们会保留为待提交改动，不会丢。"
  $wt | Select-Object -First 10 | ForEach-Object { Write-Host "        $_" -ForegroundColor DarkGray }
} else {
  Ok "工作区干净。"
}

if ($CheckOnly) {
  Write-Host ""
  Write-Host "  （-CheckOnly：仅检查，未做任何修改）" -ForegroundColor White
  Write-Host ""
  exit 0
}

# --- 备份 ---
if ($localSha -and $localSha -ne $targetSha) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backup = "backup/pre-repair-$stamp"
  Step "备份当前提交到 $backup ..."
  git update-ref "refs/heads/$backup" $localSha
  if ($LASTEXITCODE -eq 0) { Ok "已备份：$backup（$($localSha.Substring(0,7))）" }
  else { Warn "备份失败，但继续（原提交仍在 reflog 中）" }
}

# --- 对齐 ---
Step "对齐 $Branch 到 $target（工作区文件不动）..."
git reset --mixed $target
if ($LASTEXITCODE -ne 0) { Fail "对齐失败。" }

Write-Host ""
Write-Host "  提交历史：" -ForegroundColor White
git log --oneline -6
Write-Host ""
Write-Host "  当前状态：" -ForegroundColor White
git status -sb
Write-Host ""
Ok "完成。本地与远端历史已统一，之后 git pull / git push 都正常。"
Write-Host ""
Write-Host "  若 status 里还有几个 M 开头的文件，那是刚才提到的未提交改动，属正常。" -ForegroundColor DarkGray
Write-Host "  想撤销本次对齐：git reset --hard <备份分支名>" -ForegroundColor DarkGray
Write-Host ""
