#Requires -Version 5.1
<#
.SYNOPSIS
  让 PowerShell 默认使用 7.x（pwsh），而不是系统自带的 5.1。

.DESCRIPTION
  背景：在 Windows 上，powershell 这个命令名永远指向系统自带的 5.1，
  7.x 的命令名是 pwsh。这是微软的硬性命名约定，装多少个版本都不会变。

  本脚本做三件事：
    1. 修掉 5.1 启动配置里指向 D: 盘的悬空引用（该路径已不存在，每次启动都会静默失败）。
    2. 在 5.1 启动配置里加一个转发：交互式敲 powershell 时自动进入 7.x。
    3. 把 VS Code 的默认终端设为 pwsh。

  刻意不做的事：不在 5.1 启动配置里自动重启到 7.x。
  原因：7.x 的启动配置会反向加载 5.1 的启动配置（dot-source），自动重启会形成无限循环。

.PARAMETER DryRun
  只预览将要做的事，不写入任何文件。

.PARAMETER ProfileOnly
  只修启动配置，不动 VS Code 设置。

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1 -DryRun
  pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1
#>
param([switch]$DryRun, [switch]$ProfileOnly)

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$nl = [Environment]::NewLine
$script:failures = 0

function OK($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Note($m) { Write-Host "  [注意] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [失败] $m" -ForegroundColor Red; $script:failures++ }
function Plan($m) { Write-Host "  [将做] $m" -ForegroundColor Cyan }

Write-Host ""
Write-Host "== 让 PowerShell 默认走 7.x ==" -ForegroundColor Cyan
Write-Host ""

# ---------- 0. 前提：pwsh 是否存在 ----------
$pwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if (-not $pwsh) {
  Bad "没找到 pwsh.exe（PowerShell 7）。"
  Write-Host "       安装：winget install --id Microsoft.PowerShell --source winget" -ForegroundColor Yellow
  exit 1
}
OK "找到 PowerShell 7：$($pwsh.Source)"
$ver = & $pwsh.Source -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
if ($ver) { OK "版本：$ver" }
if ($DryRun) { Note "DryRun：只预览，不写入。" }
Write-Host ""

# ---------- 1. 定位 5.1 启动配置 ----------
Write-Host "[1/3] 5.1 启动配置" -ForegroundColor Cyan

# 候选路径按「真实存在」优先。不能只信 [Environment]::GetFolderPath，
# 它可能返回非预期位置，导致静默写错地方、看起来像成功。
$candidates = New-Object System.Collections.Generic.List[string]
$myDocs = [Environment]::GetFolderPath("MyDocuments")
if ($myDocs) { $candidates.Add((Join-Path $myDocs "WindowsPowerShell\Microsoft.PowerShell_profile.ps1")) }
if ($env:USERPROFILE) { $candidates.Add((Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1")) }
if ($HOME) { $candidates.Add((Join-Path $HOME "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1")) }

$ps51Profile = $null
foreach ($c in $candidates) {
  if (Test-Path -LiteralPath $c) { $ps51Profile = $c; break }
}
if (-not $ps51Profile) {
  if ($env:USERPROFILE) { $ps51Profile = Join-Path $env:USERPROFILE "Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1" }
  elseif ($myDocs) { $ps51Profile = Join-Path $myDocs "WindowsPowerShell\Microsoft.PowerShell_profile.ps1" }
  Note "未找到现有 5.1 启动配置，将新建。"
}
Write-Host "       目标文件：$ps51Profile" -ForegroundColor DarkGray

# 用单引号 here-string：块里含 $ 变量，必须原样写进去，不能在生成时展开。
$forwardBlock = @'
# --- BEGIN fix-powershell-default ---
# Windows 上 powershell 永远指向 5.1，7.x 的名字是 pwsh。
# 在 5.1 里交互式敲 powershell 时自动进入 7.x。
# Core 版本会反向加载本文件（dot-source），所以用 PSEdition 判断，避免自我转发。
if ($PSVersionTable.PSEdition -eq "Desktop") {
    function powershell {
        [CmdletBinding()]
        param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RemainingArgs)
        if ($RemainingArgs -and $RemainingArgs.Count -gt 0) {
            # 带参数时保持 5.1 原生语义（例如 -File x.ps1），不静默改道
            & "$PSHOME\powershell.exe" @RemainingArgs
        } else {
            & pwsh.exe
        }
    }
}
# --- END fix-powershell-default ---
'@

# 用标记行精确替换转发块：既保证可重复执行，也不依赖原文格式
$beginMarker = "# --- BEGIN fix-powershell-default ---"
$endMarker   = "# --- END fix-powershell-default ---"

function Remove-ForwardBlock([string]$text) {
  if ($text -notmatch [regex]::Escape($beginMarker)) { return $text }
  $kept = New-Object System.Collections.Generic.List[string]
  $skipping = $false
  foreach ($line in ($text -split "\r?\n")) {
    if (-not $skipping -and $line.Trim() -eq $beginMarker) { $skipping = $true; continue }
    if ($skipping) {
      if ($line.Trim() -eq $endMarker) { $skipping = $false }
      continue
    }
    $kept.Add($line)
  }
  return (($kept -join $nl).Trim())
}

try {
  $original = ""
  if (Test-Path -LiteralPath $ps51Profile) { $original = Get-Content -LiteralPath $ps51Profile -Raw }
  $cleaned = $original

  if ($cleaned -match "profile\.common\.ps1") {
    $kept = New-Object System.Collections.Generic.List[string]
    $skipping = $false
    foreach ($line in ($cleaned -split "\r?\n")) {
      if (-not $skipping -and $line -match "profile\.common\.ps1") { $skipping = $true; continue }
      if ($skipping) { if ($line.Trim() -eq "}") { $skipping = $false }; continue }
      $kept.Add($line)
    }
    $cleaned = ($kept -join $nl).Trim()
    Note "已移除指向 D: 盘的悬空引用（profile.common.ps1）。"
  }

  # 旧版转发块先摘掉，再统一追加最新版 —— 保证重复执行时内容始终是最新的
  if ($cleaned -match [regex]::Escape($beginMarker)) {
    $cleaned = Remove-ForwardBlock $cleaned
    Note "检测到已有转发块，将替换为最新版。"
  }

  $newContent = $cleaned.TrimEnd()
  if ($newContent -ne "") { $newContent += $nl + $nl }
  $newContent += ($forwardBlock -replace "\r?\n", $nl)

  if ($DryRun) {
    Plan "重写 $ps51Profile"
    Write-Host "      --- 新内容 ---" -ForegroundColor DarkGray
    Write-Host $newContent -ForegroundColor DarkGray
  } else {
    $dir = Split-Path -Parent $ps51Profile
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    if (Test-Path -LiteralPath $ps51Profile) {
      Copy-Item -LiteralPath $ps51Profile -Destination "$ps51Profile.bak-$stamp" -Force -ErrorAction Stop
    }
    $enc = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $true
    [System.IO.File]::WriteAllText($ps51Profile, $newContent, $enc)
    $written = Get-Item -LiteralPath $ps51Profile
    OK "已写入（$($written.Length) 字节，备份后缀 .bak-$stamp）"
  }
} catch {
  Bad "写 5.1 启动配置失败：$($_.Exception.Message)"
  Write-Host "       路径：$ps51Profile" -ForegroundColor DarkGray
}
Write-Host ""

if (-not $ProfileOnly) {
# ---------- 2. VS Code 默认终端 ----------
Write-Host "[2/3] VS Code 默认终端" -ForegroundColor Cyan
$codeDir = Join-Path $env:APPDATA "Code\User"
$codeFile = Join-Path $codeDir "settings.json"

$desiredJson = @'
{
  "terminal.integrated.defaultProfile.windows": "PowerShell 7",
  "terminal.integrated.profiles.windows": {
    "PowerShell 7": {
      "path": "pwsh.exe"
    }
  }
}
'@

try {
  $canWrite = $true
  $merged = $desiredJson
  if (Test-Path -LiteralPath $codeFile) {
    $raw = Get-Content -LiteralPath $codeFile -Raw
    if ($raw.Trim() -ne "") {
      try {
        $obj = $raw | ConvertFrom-Json
        $obj | Add-Member -NotePropertyName "terminal.integrated.defaultProfile.windows" -NotePropertyValue "PowerShell 7" -Force
        $existingProfiles = $null
        if ($obj.PSObject.Properties.Name -contains "terminal.integrated.profiles.windows") {
          $existingProfiles = $obj."terminal.integrated.profiles.windows"
        }
        if ($null -eq $existingProfiles) { $existingProfiles = New-Object psobject }
        $existingProfiles | Add-Member -NotePropertyName "PowerShell 7" -NotePropertyValue ([pscustomobject]@{ path = "pwsh.exe" }) -Force
        $obj | Add-Member -NotePropertyName "terminal.integrated.profiles.windows" -NotePropertyValue $existingProfiles -Force
        $merged = $obj | ConvertTo-Json -Depth 10
        OK "已合并进现有设置（其它配置保持不变）。"
      } catch {
        $canWrite = $false
        Note "现有 settings.json 含注释或格式特殊，无法安全自动合并。"
        Write-Host "       请手工把下面两项加进 VS Code 设置：" -ForegroundColor Yellow
        Write-Host $desiredJson -ForegroundColor DarkGray
      }
    }
  }

  if ($canWrite) {
    if ($DryRun) { Plan "写入 $codeFile" }
    else {
      if (-not (Test-Path -LiteralPath $codeDir)) { New-Item -ItemType Directory -Path $codeDir -Force | Out-Null }
      if (Test-Path -LiteralPath $codeFile) { Copy-Item -LiteralPath $codeFile -Destination "$codeFile.bak-$stamp" -Force -ErrorAction Stop }
      $enc2 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
      [System.IO.File]::WriteAllText($codeFile, $merged, $enc2)
      OK "已更新 $codeFile"
    }
  }
} catch {
  Bad "写 VS Code 设置失败：$($_.Exception.Message)"
}
Write-Host ""
}

# ---------- 3. 收尾 ----------
Write-Host "[3/3] 完成" -ForegroundColor Cyan
Write-Host ""
Write-Host "以后用以下任一方式打开 PowerShell 7：" -ForegroundColor Cyan
Write-Host "  - 敲 pwsh" -ForegroundColor White
Write-Host "  - Windows Terminal 新建标签页（默认已是 PowerShell 7）" -ForegroundColor White
Write-Host "  - VS Code 里新建终端（已设为 pwsh）" -ForegroundColor White
Write-Host ""
Write-Host "说明：powershell 这个命令名在 Windows 上永远指向 5.1，这是微软的命名约定。" -ForegroundColor DarkGray
Write-Host "      powershell -File x.ps1 这类外部调用也仍是 5.1，请改用 pwsh -File x.ps1。" -ForegroundColor DarkGray
Write-Host ""
if ($DryRun) {
  Write-Host "（DryRun：未做任何改动）" -ForegroundColor Yellow
} elseif ($script:failures -gt 0) {
  Write-Host "有 $($script:failures) 项失败，见上面的 [失败] 行。" -ForegroundColor Red
  exit 1
} else {
  Write-Host "已全部完成。请重新打开一个终端窗口验证。" -ForegroundColor Green
}
Write-Host ""
