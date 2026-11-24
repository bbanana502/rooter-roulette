#!/bin/sh
# 루터 굿즈 룰렛: 이 폴더를 http://localhost:5173 으로 띄우고 브라우저를 엶 (Ctrl+C 로 종료)
cd "$(dirname "$0")"
PORT=${PORT:-5173}
(sleep 1 && open "http://localhost:$PORT") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
