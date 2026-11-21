FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (drastically reduces image size from ~6GB to ~1GB)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Copy and install application dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source tree
COPY . .

# Pre-cache embedding model so container starts instantly without runtime download lag
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

ENV PORT=8000
ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/tmp/data

EXPOSE 8000

CMD ["sh", "-c", "uvicorn semantic_search.api.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
