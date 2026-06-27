FROM python:3.12-slim

WORKDIR /app

# 依存のみ先にインストールしてレイヤキャッシュを効かせる
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Moodle(Phase 1.5) SSO自動ログイン用: Chromium + 依存 + 初回ログイン用の仮想ディスプレイ/VNC
RUN playwright install --with-deps chromium && \
    apt-get update && apt-get install -y --no-install-recommends xvfb x11vnc && \
    rm -rf /var/lib/apt/lists/*

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    DATA_DIR=/app/data

CMD ["python", "-m", "agent.main"]
