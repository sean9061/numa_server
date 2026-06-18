FROM python:3.12-slim

WORKDIR /app

# 依存のみ先にインストールしてレイヤキャッシュを効かせる
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    DATA_DIR=/app/data

CMD ["python", "-m", "agent.main"]
