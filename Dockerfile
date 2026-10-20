FROM node:20-bookworm-slim

WORKDIR /app

ENV PORT=3000

# Install CA certificates and curl for secure outbound API calls (WhatsApp, Supabase, Gemini)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for efficient caching
COPY package*.json ./

# Install all dependencies including build tools
RUN npm install --legacy-peer-deps --include=dev

# Copy application source code
COPY . .

# Build frontend assets to dist/
RUN npm run build

# Switch to production environment for runtime
ENV NODE_ENV=production

# Create session directories for WhatsApp Baileys connections
RUN mkdir -p /app/wa-notif-session /app/wa-session /app/wa-company-session

# Expose WhatsApp session storage as persistent volumes
VOLUME ["/app/wa-notif-session", "/app/wa-session", "/app/wa-company-session"]

EXPOSE 3000

# Run Express fullstack server with WhatsApp services enabled
CMD ["npx", "tsx", "server.ts"]
