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
       只对交互式输入生效，不影响 powershell -File x.ps1 这类外部调用。
    3. 把 VS Code 的默认终端设为 pwsh。

  刻意不做的事：不在 5.1 启动配置里自动重启到 7.x。
  原因：7.x 的启动配置会反向加载 5.1 的启动配置（dot-source），自动重启会形成无限循环；
  同时 powershell -File x.ps1 也会被静默改道，改变脚本语义。

.PARAMETER DryRun
  只预览将要做的事，不写入任何文件。

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1 -DryRun
  pwsh -ExecutionPolicy Bypass -File scripts/fix-powershell-default.ps1
#>
param([switch]$DryRun)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$nl = [Environment]::NewLine
$docs = [Environment]::GetFolderPath("MyDocuments")

function OK($m)   { Write-Host "  [OK]   $m" -ForegroundColor Green }
function Note($m) { Write-Host "  [注意] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "  [失败] $m" -ForegroundColor Red }
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
if ($DryRun) { Note "DryRun：只预览，不写入。" }
Write-Host ""

# ---------- 1. 修 5.1 启动配置 ----------
Write-Host "[1/3] 5.1 启动配置" -ForegroundColor Cyan
$ps51Profile = Join-Path $docs "WindowsPowerShell\Microsoft.PowerShell_profile.ps1"

$forwardBlock = @'
# --- 以下由 scripts/fix-powershell-default.ps1 追加 ---
# Windows 上 powershell 永远指向 5.1，7.x 的名字是 pwsh。
# 这里做转发：交互式敲 powershell 时自动进入 7.x。
# 只对交互式输入生效；powershell -File x.ps1 这类外部调用不受影响。
function powershell {
    [CmdletBinding()]
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$RemainingArgs)
    & pwsh.exe @RemainingArgs
}
'@

$original = ""
if (Test-Path $ps51Profile) { $original = Get-Content -LiteralPath $ps51Profile -Raw }
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

if ($cleaned -notmatch "fix-powershell-default\.ps1") {
  $newContent = $cleaned.TrimEnd()
  if ($newContent -ne "") { $newContent += $nl + $nl }
  $newContent += $forwardBlock
} else {
  $newContent = $cleaned
  Note "转发块已存在，跳过（脚本可重复执行）。"
}

if ($DryRun) {
  Plan "重写 $ps51Profile"
  Write-Host "      --- 新内容 ---" -ForegroundColor DarkGray
  Write-Host $newContent -ForegroundColor DarkGray
} else {
  $dir = Split-Path -Parent $ps51Profile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if (Test-Path $ps51Profile) { Copy-Item $ps51Profile "$ps51Profile.bak-$stamp" -Force }
  $enc = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $true
  [System.IO.File]::WriteAllText($ps51Profile, $newContent, $enc)
  OK "已更新（备份：Microsoft.PowerShell_profile.ps1.bak-$stamp）"
}
Write-Host ""

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

$canWrite = $true
$merged = $desiredJson
if (Test-Path $codeFile) {
  $raw = Get-Content -LiteralPath $codeFile -Raw
  if ($raw.Trim() -ne "") {
    try {
      $obj = $raw | ConvertFrom-Json
      $obj | Add-Member -NotePropertyName "terminal.integrated.defaultProfile.windows" -NotePropertyValue "PowerShell 7" -Force
      $existingProfiles = $null
      if ($obj.PSObject.Properties.Name -contains "terminal.integrated.profiles.windows") {
        $existingProfiles = $obj."terminal.integrated.profiles.windows"
      }
      if ($null -eq $existingProfiles) {
        $existingProfiles = New-Object psobject
      }
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
    if (-not (Test-Path $codeDir)) { New-Item -ItemType Directory -Path $codeDir -Force | Out-Null }
    if (Test-Path $codeFile) { Copy-Item $codeFile "$codeFile.bak-$stamp" -Force }
    $enc2 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
    [System.IO.File]::WriteAllText($codeFile, $merged, $enc2)
    OK "已更新 $codeFile"
  }
}
Write-Host ""

# ---------- 3. 收尾 ----------
Write-Host "[3/3] 完成" -ForegroundColor Cyan
Write-Host ""
Write-Host "以后用以下任一方式打开 PowerShell 7：" -ForegroundColor Cyan
Write-Host "  - 敲 pwsh" -ForegroundColor White
Write-Host "  - Windows Terminal 新建标签页（默认已是 PowerShell 7）" -ForegroundColor White
Write-Host "  - VS Code 里新建终端（已设为 pwsh）" -ForegroundColor White
Write-Host ""
Write-Host "说明：powershell 这个命令名在 Windows 上永远指向 5.1，这是微软的命名约定。" -ForegroundColor DarkGray
Write-Host "      本脚本已在 5.1 启动配置里加转发，交互式敲 powershell 也会进入 7。" -ForegroundColor DarkGray
Write-Host "      但 powershell -File x.ps1 这类外部调用仍是 5.1，请改用 pwsh -File x.ps1。" -ForegroundColor DarkGray
Write-Host ""
if ($DryRun) { Write-Host "（DryRun：未做任何改动）" -ForegroundColor Yellow }
else { Write-Host "已全部完成。请重新打开一个终端窗口验证。" -ForegroundColor Green }
Write-Host ""
