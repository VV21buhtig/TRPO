#!/usr/bin/env bash
# Запуск демонстрационного комплекса и публичного HTTPS-туннеля Tuna.
# Требования: .NET SDK 10, Node.js 22+, установленный и авторизованный tuna-cli.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${TMPDIR:-/tmp}/fastfood-public"
PUBLIC_HOST="lucky-crane-4648.a.tuna.free"
PUBLIC_URL="https://${PUBLIC_HOST}"
TUNA="${TUNA_BIN:-$(command -v tuna || true)}"
if [[ -z "${TUNA}" && -x "${HOME}/.local/bin/tuna" ]]; then
  TUNA="${HOME}/.local/bin/tuna"
fi

mkdir -p "${RUN_DIR}"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

wait_for() {
  local url="$1" name="$2"
  for _ in $(seq 1 40); do
    if curl -fsS -m 2 "${url}" >/dev/null 2>&1; then
      log "${name}: готово (${url})"
      return 0
    fi
    sleep 1
  done
  log "ОШИБКА: ${name} не поднялся (${url})"
  return 1
}

# ---------- API ----------
if curl -fsS -m 2 "http://127.0.0.1:5080/api/v1/health" >/dev/null 2>&1; then
  log "API уже работает: http://127.0.0.1:5080"
else
  log "Запускаю API..."
  (
    cd "${ROOT}/backend/FastFood.Api"
    setsid dotnet run --urls http://0.0.0.0:5080 \
      > "${RUN_DIR}/api.log" 2>&1 < /dev/null &
    echo $! > "${RUN_DIR}/api.pid"
  )
  wait_for "http://127.0.0.1:5080/api/v1/health" "API"
fi

# ---------- Web + proxy ----------
if curl -fsS -m 2 "http://127.0.0.1:8080/" >/dev/null 2>&1; then
  log "Web уже работает: http://127.0.0.1:8080"
else
  if [[ ! -f "${ROOT}/web/dist/index.html" ]]; then
    log "Собираю web..."
    (cd "${ROOT}/web" && VITE_API_URL=/api/v1 npm run build)
  fi
  log "Запускаю web preview на 8080..."
  (
    cd "${ROOT}/web"
    VITE_API_URL=/api/v1 setsid npm run preview -- --host 0.0.0.0 --port 8080 \
      > "${RUN_DIR}/web.log" 2>&1 < /dev/null &
    echo $! > "${RUN_DIR}/web.pid"
  )
  wait_for "http://127.0.0.1:8080/" "Web"
fi

# ---------- Tuna ----------
if [[ -z "${TUNA}" ]]; then
  cat >&2 <<'EOF'
Не найден tuna-cli. Установите его:
  mkdir -p ~/.local/bin /tmp/tuna-install
  cd /tmp/tuna-install
  curl -fsSL -o tuna.tar.gz https://releases.tuna.am/tuna/latest/tuna_linux_amd64.tar.gz
  tar -xzf tuna.tar.gz && chmod +x tuna && cp tuna ~/.local/bin/tuna
  ~/.local/bin/tuna login --no-browser --insecure-storage
EOF
  exit 1
fi

if [[ ! -f "${HOME}/.config/tuna/credentials.json" ]]; then
  log "Выполните вход в Tuna: ${TUNA} login --no-browser --insecure-storage"
  exit 1
fi

if curl -fsS -m 3 "${PUBLIC_URL}/api/v1/health" >/dev/null 2>&1; then
  log "Публичный туннель уже работает: ${PUBLIC_URL}"
else
  log "Запускаю туннель Tuna..."
  (
    setsid "${TUNA}" http 8080 --subdomain=lucky-crane-4648 --inspect=false \
      > "${RUN_DIR}/tuna.log" 2>&1 < /dev/null &
    echo $! > "${RUN_DIR}/tuna.pid"
  )
  wait_for "${PUBLIC_URL}/api/v1/health" "Публичный API"
fi

cat <<EOF

Готово.
  Web:      ${PUBLIC_URL}
  API:      ${PUBLIC_URL}/api/v1
  Swagger:  ${PUBLIC_URL}/swagger
  Локально: http://127.0.0.1:5173 (dev) или http://127.0.0.1:8080 (preview)
  Логи:     ${RUN_DIR}

При первом открытии web в браузере Tuna показывает страницу подтверждения —
нажмите «Посетить». Мобильное приложение это предупреждение не показывает.
EOF
