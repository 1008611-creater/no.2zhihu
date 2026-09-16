#!/usr/bin/env bash
# 二号知乎 · 原子部署（构建到独立目录 → 整目录切换，服务全程不中断）
#
# 为什么需要这个脚本
#   Next.js 的产物默认写进 .next。旧流程是「先 rm -rf .next，再 npm run build」——
#   在 1~3 分钟的构建窗口里，线上进程虽然还活着（旧 HTML 已经发给了浏览器），
#   但它引用的 /_next/static/chunks/*.js 已经**不在磁盘上了**。
#   用户在窗口里点任何一下，浏览器去取那个 chunk，服务端返回 404
#   （实测 content_type=text/html）→ 客户端抛 ChunkLoadError，页面白屏/卡死。
#
#   关键点：**中断的来源是「先删后建」，不是「重启」**。所以只解决重启是不够的，
#   必须让 .next 这个目录**在同一文件系统内被原子替换**，绝不能出现「中间态」。
#
# 做法
#   1. 用 NEXT_DIST_DIR=.next.new 构建到独立目录（线上 .next 全程不动，可继续服务）
#   2. 构建产物做完整性体检（BUILD_ID / static / server 都在）
#   3. 原子切换：把旧 .next 改名成 .next.old，把 .next.new 改名成 .next
#      —— rename(2) 在同一文件系统内是原子的，不存在「半个 .next」的窗口
#   4. 重启服务并等健康检查；失败则把 .next.old 换回去（回滚点仍在原地）
#   5. 成功后清掉 .next.old（旧版本遗留的 static 目录）
#
# 为什么不用软链接（ln -s）
#   软链接方案需要在 nginx / systemd 两侧都改成读链接目标，且 Next 的
#   required-server-files.json 里记的是相对路径，换链接容易踩到；
#   目录 rename 不动任何配置，风险最小。
#
# 用法（在服务器上以 root 运行）：
#   bash scripts/deploy-server.sh --update            # 原子更新到 origin/main
#   ATOMIC_SKIP_BUILD=1 bash scripts/deploy-server.sh --update   # 复用已有 .next.new（调试用）
#
# 退出码：0 成功；非 0 失败（线上保持旧版本或已回滚）。
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/no2zhihu}"
RUN_USER="${RUN_USER:-no2zhihu}"
SERVICE_NAME="${SERVICE_NAME:-no2zhihu}"
BRANCH="${BRANCH:-main}"
APP_PORT="${APP_PORT:-3000}"
HEALTH="${HEALTH:-http://127.0.0.1:${APP_PORT}/api/health}"
STAGING_DIR=".next.new"
OLD_DIR=".next.old"
BUILD_LOG="/tmp/no2zhihu-atomic-build-$(date +%s).log"

log()  { printf '\n[原子部署] %s\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }
die()  { printf '\n[失败] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash scripts/deploy-server.sh --update"
[ -d "$APP_DIR" ] || die "$APP_DIR 不存在"
cd "$APP_DIR" || die "进不去 $APP_DIR"

# ─────────────────────────────────────────────────────────────
# 0. 体检：确认这个仓库的版本支持原子部署
# ─────────────────────────────────────────────────────────────
log "0/6 体检"
if ! grep -q 'NEXT_DIST_DIR' next.config.js 2>/dev/null; then
  die "next.config.js 里没有 NEXT_DIST_DIR —— 这份代码不支持原子部署。
      请先合并包含原子部署改动的 PR，或改用 scripts/deploy-server.sh 的旧模式。"
fi
ok "next.config.js 支持 NEXT_DIST_DIR 覆盖"

have() { command -v "$1" >/dev/null 2>&1; }
have flock || die "缺 flock（util-linux），无法保证部署互斥"
ok "工具齐备（flock / git / npm）"

# ─────────────────────────────────────────────────────────────
# 1. 互斥锁 + 等并发构建
# ─────────────────────────────────────────────────────────────
# 为什么两件事都要做：
#   flock 防的是「两个部署同时跑」；pgrep 防的是「有人手动构建，正写着同一个产物目录」。
#   本项目历史上踩过并发构建抢同一个 .next 导致 EACCES 的坑。
exec 9>/var/lock/no2zhihu-deploy.lock || die "打不开锁文件"
flock -n 9 || die "已有部署在进行中，本次跳过"

waited=0
while pgrep -f 'next build' >/dev/null 2>&1; do
  [ "$waited" -eq 0 ] && log "检测到并发构建，等待中…"
  sleep 10
  waited=$((waited + 10))
  [ "$waited" -ge 600 ] && die "等待 10 分钟仍有并发构建，放弃本次部署"
done
ok "无并发构建"

# ─────────────────────────────────────────────────────────────
# 2. 取目标版本
# ─────────────────────────────────────────────────────────────
log "1/6 拉取代码"
git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true

su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && git fetch --prune origin $BRANCH" >/dev/null 2>&1 \
  || die "git fetch 失败（网络或权限）"

TARGET=$(su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && git rev-parse origin/$BRANCH" 2>/dev/null | tr -d '\r')
CURRENT=$(su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && git rev-parse HEAD" 2>/dev/null | tr -d '\r')
[ -n "$TARGET" ] || die "取不到 origin/$BRANCH 的 sha"
log "  当前 $CURRENT"
log "  目标 $TARGET"

if [ "$CURRENT" = "$TARGET" ] && systemctl is-active --quiet "$SERVICE_NAME"; then
  log "已是最新且服务正常，无需部署"
  echo "RESULT=up-to-date COMMIT=$TARGET"
  exit 0
fi

printf '%s\n' "$CURRENT" > /root/no2zhihu-rollback-commit.txt
ok "回滚点已记录：$CURRENT"

su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && git reset --hard origin/$BRANCH" >/dev/null \
  || die "git reset 失败"
# git 以 root 身份 checkout 会把属主写成 root，构建前必须还回去
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
ok "代码已更新到 $TARGET"

# ─────────────────────────────────────────────────────────────
# 3. 构建到独立目录（线上 .next 全程不动）
# ─────────────────────────────────────────────────────────────
log "2/6 构建到 $STAGING_DIR（线上 .next 不受影响，仍在服务）"

# 清掉上一轮的残留：它可能是半成品，也可能是上次回滚留下的
rm -rf "$APP_DIR/$STAGING_DIR"
chown "$RUN_USER:$RUN_USER" "$APP_DIR"

if [ "${ATOMIC_SKIP_BUILD:-0}" = "1" ]; then
  warn "ATOMIC_SKIP_BUILD=1 —— 跳过构建，直接复用现有 $STAGING_DIR"
elif ! su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && NEXT_DIST_DIR=$STAGING_DIR npm run build" >"$BUILD_LOG" 2>&1; then
  tail -40 "$BUILD_LOG" >&2
  die "构建失败（日志 $BUILD_LOG）—— 线上仍是旧版本，未做任何切换"
else
  # 约定：只看 exit code 不可靠，必须有 'Compiled successfully'
  if ! grep -q 'Compiled successfully' "$BUILD_LOG"; then
    tail -40 "$BUILD_LOG" >&2
    die "构建输出没有 'Compiled successfully'（日志 $BUILD_LOG）—— 线上仍是旧版本"
  fi
  ok "构建通过"
fi

# ─────────────────────────────────────────────────────────────
# 4. 产物体检（切之前先确认新版本是完整的）
# ─────────────────────────────────────────────────────────────
log "3/6 新产物体检"
for f in BUILD_ID "$STAGING_DIR/static" "$STAGING_DIR/server" "$STAGING_DIR/routes-manifest.json"; do
  [ -e "$f" ] || die "新产物不完整：缺 $f —— 不做切换，线上仍是旧版本"
done
NEW_BUILD_ID=$(cat "$STAGING_DIR/BUILD_ID" 2>/dev/null | tr -d '\r\n')
[ -n "$NEW_BUILD_ID" ] || die "新产物 BUILD_ID 为空 —— 不做切换"
CHUNKS=$(find "$STAGING_DIR/static/chunks" -name '*.js' 2>/dev/null | wc -l)
[ "$CHUNKS" -gt 0 ] || die "新产物 static/chunks 里没有 .js —— 不做切换"
ok "BUILD_ID=$NEW_BUILD_ID，chunks=$CHUNKS 个"

# ─────────────────────────────────────────────────────────────
# 5. 原子切换
# ─────────────────────────────────────────────────────────────
log "4/6 原子切换 $STAGING_DIR → .next"
# 同一文件系统内的 rename 是原子的：任何时刻 .next 要么是完整旧版、要么是完整新版，
# 不会出现「目录在、文件不在」的中间态 —— 这正是修掉 ChunkLoadError 的关键。
if [ -e "$APP_DIR/.next" ]; then
  rm -rf "$APP_DIR/$OLD_DIR"
  mv "$APP_DIR/.next" "$APP_DIR/$OLD_DIR" || die "旧 .next 改名失败（切换未发生）"
fi
if ! mv "$APP_DIR/$STAGING_DIR" "$APP_DIR/.next"; then
  warn "新产物改名失败 —— 立即把旧版本换回来"
  [ -e "$APP_DIR/$OLD_DIR" ] && mv "$APP_DIR/$OLD_DIR" "$APP_DIR/.next"
  die "原子切换失败，已回滚到旧版本"
fi
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/.next"
ok "切换完成（旧版本留在 $OLD_DIR，可随时回滚）"

# ─────────────────────────────────────────────────────────────
# 6. 重启 + 健康检查 + 失败回滚
# ─────────────────────────────────────────────────────────────
log "5/6 重启服务并等健康检查"
systemctl restart "$SERVICE_NAME" || die "重启失败"

HEALTHY=0
for i in $(seq 1 20); do
  sleep 3
  if systemctl is-active --quiet "$SERVICE_NAME" && curl -fsS --max-time 5 "$HEALTH" >/dev/null 2>&1; then
    HEALTHY=1
    ok "服务已恢复（$((i * 3)) 秒）"
    break
  fi
done

if [ "$HEALTHY" != "1" ]; then
  warn "60 秒内健康检查未通过 —— 回滚到 $CURRENT"
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager >&2 || true
  if [ -e "$APP_DIR/$OLD_DIR" ]; then
    rm -rf "$APP_DIR/.next"
    mv "$APP_DIR/$OLD_DIR" "$APP_DIR/.next"
    chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/.next"
    systemctl restart "$SERVICE_NAME"
    sleep 5
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      # 让 git 也回到旧 commit，避免「代码是新的、产物是旧的」这种更糟的不一致
      su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && git reset --hard $CURRENT" >/dev/null 2>&1 || true
      chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
      die "已回滚到 $CURRENT（代码与产物都回退了），请查 journalctl -u $SERVICE_NAME"
    fi
    die "回滚后服务仍不健康，需人工介入：journalctl -u $SERVICE_NAME"
  fi
  die "健康检查未通过，且没有可用的旧版本可回滚"
fi

# ─────────────────────────────────────────────────────────────
# 7. 清理旧版本
# ─────────────────────────────────────────────────────────────
log "6/6 清理旧版本产物"
# 为什么必须清理：实测服务器磁盘已用 88%（49G 里剩 6.0G），.next 约 228M；
# 留一份 .next.old 可以接受，留多份会累积。这里只保留一份（即本次的 OLD_DIR），
# 更早的残留（如果有）一并删掉。
rm -rf "$APP_DIR/$OLD_DIR"
if [ -d "/opt/no2zhihu-next-prev" ]; then
  rm -rf /opt/no2zhihu-next-prev
  ok "顺带清掉了历史手工备份 /opt/no2zhihu-next-prev"
fi
ok "已清理"

# ─────────────────────────────────────────────────────────────
# 8. 部署后冒烟（与 CI 同一份脚本）
# ─────────────────────────────────────────────────────────────
log "部署后冒烟检查"
if [ -f "$APP_DIR/scripts/smoke.mjs" ]; then
  if su - "$RUN_USER" -s /bin/bash -c "cd $APP_DIR && node scripts/smoke.mjs --base http://127.0.0.1:$APP_PORT --retries 2 --retry-wait 3000" ; then
    ok "冒烟通过"
  else
    warn "冒烟未通过 —— 服务进程健康，但行为不对，请尽快人工确认（可回滚到 $CURRENT）"
    echo "RESULT=deployed-but-smoke-failed COMMIT=$TARGET"
    exit 1
  fi
fi

echo "RESULT=deployed COMMIT=$TARGET"
log "完成：$CURRENT → $TARGET"
