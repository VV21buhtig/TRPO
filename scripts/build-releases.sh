#!/usr/bin/env bash
# Сборка переносимых релизов desktop и подготовка Android APK.
# Требования: Node.js, Python 3, unzip, tar, curl.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP="${ROOT}/desktop"
MOBILE="${ROOT}/mobile"
OUT="${RELEASE_OUT:-${ROOT}/release}"
CACHE="${OUT}/.cache"
WORK="${OUT}/.work"
PUBLIC_API="${PUBLIC_API:-https://lucky-crane-4648.a.tuna.free/api/v1}"

VERSION="$(cd "${DESKTOP}" && node -p "require('./package.json').version")"
ELECTRON_VERSION="$(cd "${DESKTOP}" && node -p "require('./node_modules/electron/package.json').version")"
WIN_ARCHIVE="electron-v${ELECTRON_VERSION}-win32-x64.zip"
LINUX_ARCHIVE="electron-v${ELECTRON_VERSION}-linux-x64.zip"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

download_electron() {
  local archive="$1"
  local expected actual
  expected="$(cd "${DESKTOP}" && node -p "require('./node_modules/electron/checksums.json')['${archive}']")"
  mkdir -p "${CACHE}"
  if [[ ! -f "${CACHE}/${archive}" ]]; then
    log "Скачиваю ${archive}"
    curl -fL --retry 3 --retry-delay 2 \
      -o "${CACHE}/${archive}.part" \
      "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${archive}"
    mv "${CACHE}/${archive}.part" "${CACHE}/${archive}"
  fi
  actual="$(sha256sum "${CACHE}/${archive}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "ОШИБКА: неверная контрольная сумма ${archive}" >&2
    echo "ожидалось: ${expected}" >&2
    echo "получено:  ${actual}" >&2
    exit 1
  fi
  log "Контрольная сумма ${archive}: OK"
}

prepare_app_dir() {
  local platform="$1"
  local archive="$2"
  local dirname="FastFood-Operator-${VERSION}-${platform}"
  local dest="${WORK}/${dirname}"

  rm -rf "${dest}"
  mkdir -p "${dest}"
  unzip -q "${CACHE}/${archive}" -d "${dest}"
  rm -f "${dest}/resources/default_app.asar"
  mkdir -p "${dest}/resources/app"
  cp -a "${DESKTOP}/dist" "${dest}/resources/app/dist"
  cp "${DESKTOP}/package.json" "${dest}/resources/app/package.json"

  cat > "${dest}/README-RELEASE.txt" <<EOF
FastFood Operator ${VERSION} (${platform})
==========================================

Публичный API: ${PUBLIC_API}

Учётные записи демо:
  оператор:      +79990000001 / 12345
  менеджер:      +79990000002 / 12345
  клиент:        +79991234567 / 12345
  SMS-код:       0000

Если публичный контур временно недоступен, приложение покажет ошибку
подключения. Это не ошибка сборки: проверьте ${PUBLIC_API}/health.
EOF

  printf '%s\n' "${dest}"
}

package_windows() {
  local dir
  dir="$(prepare_app_dir "win-x64" "${WIN_ARCHIVE}")"
  mv "${dir}/electron.exe" "${dir}/FastFood-Operator.exe"
  cat > "${dir}/Start FastFood Operator.bat" <<'EOF'
@echo off
set "FF_API_URL=https://lucky-crane-4648.a.tuna.free/api/v1"
start "" "%~dp0FastFood-Operator.exe"
EOF

  python3 - "${WORK}" "${dir}" "${OUT}/FastFood-Operator-${VERSION}-win-x64.zip" <<'PY'
import os, sys, zipfile
work, source, target = sys.argv[1:4]
with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for root, dirs, files in os.walk(source):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(root, name)
            arcname = os.path.relpath(path, work)
            z.write(path, arcname)
print(target)
PY
}

package_linux() {
  local dir
  dir="$(prepare_app_dir "linux-x64" "${LINUX_ARCHIVE}")"
  mv "${dir}/electron" "${dir}/fastfood-operator"
  chmod +x "${dir}/fastfood-operator"
  cat > "${dir}/run-fastfood-operator.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\${BASH_SOURCE[0]}")"
export FF_API_URL="\${FF_API_URL:-${PUBLIC_API}}"
exec ./fastfood-operator "\$@"
EOF
  chmod +x "${dir}/run-fastfood-operator.sh"
  tar -czf "${OUT}/FastFood-Operator-${VERSION}-linux-x64.tar.gz" -C "${WORK}" "$(basename "${dir}")"
  echo "${OUT}/FastFood-Operator-${VERSION}-linux-x64.tar.gz"
}

log "Сборка desktop"
(cd "${DESKTOP}" && npm run build)

download_electron "${WIN_ARCHIVE}"
download_electron "${LINUX_ARCHIVE}"
mkdir -p "${OUT}" "${WORK}"

package_windows
package_linux

APK="${MOBILE}/build/app/outputs/flutter-apk/app-release.apk"
if [[ -f "${APK}" ]]; then
  cp "${APK}" "${OUT}/FastFood-Operator-${VERSION}-android.apk"
  log "Android APK подготовлен"
else
  log "APK не найден: ${APK}"
  log "Соберите его командой: cd mobile && flutter build apk --release --dart-define=API_BASE=${PUBLIC_API}"
fi

(
  cd "${OUT}"
  rm -f SHA256SUMS.txt
  sha256sum FastFood-Operator-"${VERSION}"-* > SHA256SUMS.txt
)

log "Готово: ${OUT}"
ls -lh "${OUT}" | sed -n '1,20p'
