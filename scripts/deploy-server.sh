#!/usr/bin/env bash
# 二号知乎 · Human Mesh —— 自托管一键部署（Ubuntu / Debian）
#
# 用法（在服务器上以 root 运行）：
#   bash deploy-server.sh --domain zhihu.cauai.fun            # 推荐：域名 + 自动 HTTPS 证书
#   bash deploy-server.sh --domain zhihu.cauai.fun --no-ssl   # 走 Cloudflare 代理，源站不需要证书
#   bash deploy-server.sh                                     # 纯 IP + 80 端口访问
#   bash deploy-server.sh --update                            # 只更新代码并重启
#
# 幂等：可以反复运行，不会重复安装，也不会覆盖已配置的密钥。
#
# 安全：--update 会在 $APP_DIR 里执行 git reset --hard，丢弃服务器上的本地改动。
# 请勿在服务器上直接改代码，所有改动走 本地 -> GitHub -> 服务器。

set -euo pipefail

APP_DIR="/opt/no2zhihu"
REPO_URL="https://github.com/1008611-creater/no.2zhihu.git"
BRANCH="main"
RUN_USER="no2zhihu"
APP_PORT="3000"
SERVICE_NAME="no2zhihu"
DOMAIN=""
EMAIL=""
USE_SSL=1
UPDATE_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    --no-ssl) USE_SSL=0;   shift ;;
    --update) UPDATE_ONLY=1; shift ;;
    *) echo "未知参数：$1"; exit 1 ;;
  esac
done

log()  { printf '\n[部署] %s\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }
die()  { printf '\n[失败] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash deploy-server.sh"
command -v apt-get >/dev/null 2>&1 || die "本脚本只支持 Ubuntu / Debian（apt 系）。其他系统请参考 docs/self-hosting.md 手动部署。"

# ---------------- 更新模式 ----------------
if [ "$UPDATE_ONLY" -eq 1 ]; then
  log "更新代码并重启"
  [ -d "$APP_DIR/.git" ] || die "$APP_DIR 还不是 git 仓库，请先完整部署一次"
  cd "$APP_DIR"
  sudo -u "$RUN_USER" git fetch --all
  sudo -u "$RUN_USER" git reset --hard "origin/$BRANCH"
  sudo -u "$RUN_USER" npm install --no-audit --no-fund
  sudo -u "$RUN_USER" npm run build
  systemctl restart "$SERVICE_NAME"
  ok "已更新并重启"
  exit 0
fi

# ---------------- 0. 体检 ----------------
log "0/8 环境体检"
if [ -f /etc/os-release ]; then . /etc/os-release; ok "系统：$PRETTY_NAME"; fi
ok "内核：$(uname -r)"
if command -v free >/dev/null 2>&1; then
  mem_mb=$(free -m | awk '/^Mem:/{print $2}')
  ok "内存：$mem_mb MB"
  if [ "$mem_mb" -lt 1500 ]; then
    warn "内存偏小，Next.js 构建可能失败。可先加 2G swap："
    warn "  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
  fi
fi
if command -v ss >/dev/null 2>&1; then
  echo "  当前 80 / 443 / 3000 端口占用："
  ss -lntp 2>/dev/null | grep -E ':(80|443|3000)\b' | sed 's/^/    /' || true
fi
if [ -n "$DOMAIN" ]; then
  resolved=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
  if [ -n "$resolved" ]; then
    ok "$DOMAIN 解析到 $resolved"
    warn "请确认这个 IP 就是本机；若走 Cloudflare 代理，解析到的是 Cloudflare 的 IP，属正常。"
  else
    warn "$DOMAIN 尚未解析。请先在 DNS 里加一条 A 记录指向本机公网 IP，否则证书申请会失败。"
  fi
fi

# ---------------- 1. 基础软件 ----------------
log "1/8 安装基础软件（git / nginx / curl）"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git nginx
ok "基础软件就绪"

# ---------------- 2. Node.js ----------------
log "2/8 检查 Node.js（本项目需要 >= 18.17）"
need_node=1
if command -v node >/dev/null 2>&1; then
  major=$(node -p "process.versions.node.split('.')[0]")
  minor=$(node -p "process.versions.node.split('.')[1]")
  if [ "$major" -gt 18 ] || { [ "$major" -eq 18 ] && [ "$minor" -ge 17 ]; }; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  warn "未检测到合适版本，正在安装 Node 20 LTS ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
ok "Node $(node -v) / npm $(npm -v)"

# ---------------- 3. 运行用户 ----------------
log "3/8 准备运行用户"
if id "$RUN_USER" >/dev/null 2>&1; then
  ok "用户 $RUN_USER 已存在"
else
  useradd --system --create-home --shell /bin/bash "$RUN_USER"
  ok "已创建系统用户 $RUN_USER"
fi

# ---------------- 4. 拉取代码 ----------------
log "4/8 拉取代码到 $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  sudo -u "$RUN_USER" git fetch --all
  sudo -u "$RUN_USER" git reset --hard "origin/$BRANCH"
  ok "已更新到最新代码"
else
  mkdir -p "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  ok "已克隆仓库"
fi
# 为什么需要这行：仓库可能由 root 克隆，而后续以服务用户执行 git，
# git 会因「目录归属可疑」直接拒绝操作，这里显式声明该目录可信。
sudo -u "$RUN_USER" git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

# ---------------- 5. 环境变量 ----------------
log "5/8 配置环境变量"
ENV_FILE="$APP_DIR/.env.local"
if [ -f "$ENV_FILE" ] && grep -q "ZHIHU_ACCESS_SECRET=." "$ENV_FILE"; then
  ok ".env.local 已存在且含密钥，保留不动"
else
  printf '请粘贴你的 ZHIHU_ACCESS_SECRET（输入时不显示），然后回车：'
  read -rs ZHIHU_SECRET
  printf '\n'
  [ -n "$ZHIHU_SECRET" ] || die "密钥为空，已中止"
  umask 077
  printf 'ZHIHU_ACCESS_SECRET=%s\n' "$ZHIHU_SECRET" > "$ENV_FILE"
  chown "$RUN_USER:$RUN_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  ok "已写入 $ENV_FILE（权限 600，仅服务用户可读）"
fi

# ---------------- 6. 依赖与构建 ----------------
log "6/8 安装依赖并构建（首次约 1–3 分钟）"
cd "$APP_DIR"
sudo -u "$RUN_USER" npm install --no-audit --no-fund
sudo -u "$RUN_USER" npm run build
ok "构建完成"

# ---------------- 7. 开机自启 ----------------
log "7/8 配置开机自启服务"
NPM_BIN=$(command -v npm)
cat > /etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=No.2 Zhihu Human Mesh (Next.js)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$APP_PORT
ExecStart=$NPM_BIN start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
systemctl restart "$SERVICE_NAME"
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "服务已启动"
else
  die "服务启动失败，请查看：journalctl -u $SERVICE_NAME -n 50"
fi

# ---------------- 8. 反向代理 ----------------
log "8/8 配置反向代理"
# 注意：不删除系统自带的 default 站点，也不覆盖你已有的其他站点配置。
# nginx 的精确 server_name 优先级高于 default_server，因此不会互相干扰。
if [ -n "$DOMAIN" ]; then SERVER_NAME="$DOMAIN"; else SERVER_NAME="_"; fi
cat > /etc/nginx/sites-available/$SERVICE_NAME <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/$SERVICE_NAME /etc/nginx/sites-enabled/$SERVICE_NAME
nginx -t >/dev/null 2>&1 || { nginx -t; die "nginx 配置有误，请查看上面的报错"; }
systemctl reload nginx
ok "反向代理已生效（配置文件 /etc/nginx/sites-available/$SERVICE_NAME）"

# ---------------- 可选：HTTPS ----------------
if [ -n "$DOMAIN" ] && [ "$USE_SSL" -eq 1 ]; then
  log "申请 HTTPS 证书（Let's Encrypt）"
  warn "前提：$DOMAIN 的 A 记录直接指向本机 IP，且没有被 Cloudflare 代理（灰云）。"
  warn "若用 Cloudflare 橙云代理，请改用 --no-ssl，并在 Cloudflare 侧把 SSL 设为 Full。"
  apt-get install -y certbot python3-certbot-nginx
  if [ -n "$EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "$EMAIL" --redirect
  else
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  fi && ok "HTTPS 已启用" || warn "证书申请失败，可稍后手动执行：certbot --nginx -d $DOMAIN"
fi

# ---------------- 完成 ----------------
log "部署完成"
echo "  本机地址： http://127.0.0.1:$APP_PORT"
if [ -n "$DOMAIN" ]; then
  echo "  公网地址： https://$DOMAIN"
else
  echo "  公网地址： http://<你的服务器公网IP>/"
fi
echo "  健康检查： 上面的地址 + /api/health  →  应返回 credentials: true"
echo ""
echo "常用命令："
echo "  查看状态   systemctl status $SERVICE_NAME"
echo "  实时日志   journalctl -u $SERVICE_NAME -f"
echo "  更新部署   bash deploy-server.sh --update"
echo "  nginx 配置 /etc/nginx/sites-available/$SERVICE_NAME"
echo ""
echo "安全提醒：密钥只存在于 $ENV_FILE（权限 600）；请勿写入任何提交、截图或聊天记录。"
