FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install CA certificates and curl for secure outbound API calls (WhatsApp, Supabase, Gemini)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for efficient caching
COPY package*.json ./

# Install all required dependencies
RUN npm install

# Copy application source code
COPY . .

# Build frontend assets to dist/
RUN npm run build

# Create session directories for WhatsApp Baileys connections
RUN mkdir -p /app/wa-notif-session /app/wa-session /app/wa-company-session

# Expose WhatsApp session storage as persistent volumes
VOLUME ["/app/wa-notif-session", "/app/wa-session", "/app/wa-company-session"]

EXPOSE 3000

# Run Express fullstack server with WhatsApp services enabled
CMD ["npx", "tsx", "server.ts"]
