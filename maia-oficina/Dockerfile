# Oficina da Maia na Railway: Node 22 + Chromium (pra desenhar as artes e as legendas) + ffmpeg (pra montar o vídeo)
FROM node:22-bookworm-slim

# chromium e ffmpeg do Debian; fontes com acento (Noto, DejaVu, Liberation) e emoji pra quando o Google Fonts não responder
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium ffmpeg ca-certificates \
      fonts-noto-core fonts-noto-color-emoji fonts-dejavu-core fonts-liberation fontconfig \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    FFMPEG=ffmpeg \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

# roda como usuário comum (o Chromium não gosta de root)
RUN useradd -m oficina && chown -R oficina /app
USER oficina

CMD ["node", "oficina.js"]
