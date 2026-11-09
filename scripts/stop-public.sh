#!/usr/bin/env bash
# Останавливает процессы, запущенные scripts/start-public.sh.
set -euo pipefail

RUN_DIR="${TMPDIR:-/tmp}/fastfood-public"

for name in tuna web api; do
  pid_file="${RUN_DIR}/${name}.pid"
  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}")"
    if kill -0 "${pid}" 2>/dev/null; then
      # Процессы запущены через setsid, поэтому убиваем всю группу:
      # иначе dotnet run оставляет дочерний FastFood.Api, а npm — node.
      kill -- -"${pid}" 2>/dev/null || kill "${pid}" 2>/dev/null || true
      echo "Остановлен ${name} (pid ${pid})"
    fi
    rm -f "${pid_file}"
  fi
done
