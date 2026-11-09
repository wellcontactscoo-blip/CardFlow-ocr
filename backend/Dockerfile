FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLAGS_use_mkldnn=0 \
    FLAGS_enable_pir_api=0 \
    OCR_LOW_MEMORY_MODE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-initialize PP-OCR ONNX models at build time so Render Free Tier (512 MB RAM)
# starts in <2s and runs card OCR in ~130 MB RSS without OOM kills
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]


