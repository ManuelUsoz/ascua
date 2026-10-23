FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb xauth x11-utils openbox procps fonts-dejavu-core \
    libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libxshmfence1 libxtst6 \
    libatk-bridge2.0-0 libdrm2 libxkbcommon0 libsecret-1-0 \
  && rm -rf /var/lib/apt/lists/*

ENV NX_DAEMON=false NX_NO_CLOUD=true ELECTRON_DISABLE_SANDBOX=1 SHELL=/bin/bash APPIMAGE_EXTRACT_AND_RUN=1

USER node
WORKDIR /home/node/ascua

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN sed -i 's/\r$//' tools/linux/check.sh

CMD ["bash", "tools/linux/check.sh", "/out"]
