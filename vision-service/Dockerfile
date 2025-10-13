# Vision Service Dockerfile - Optimized for faster builds
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies first (cached if requirements don't change)
# Use correct package names for Debian trixie
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgtk-3-0 \
    libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set pip to use faster mirrors and parallel downloads
RUN pip config set global.index-url https://pypi.org/simple && \
    pip config set global.trusted-host pypi.org

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies with optimizations for faster builds
RUN pip install --no-cache-dir --prefer-binary --no-deps -r requirements.txt && \
    pip cache purge

# Copy source code (this layer will rebuild only when source changes)
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Expose port
EXPOSE 5001

# Start the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5001", "--reload"]
