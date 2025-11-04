FROM n8nio/n8n:latest

USER root

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    npm \
    udev \
    ttf-opensans \
    git

# Install Puppeteer packages globally AND in n8n directory
RUN npm install -g \
    puppeteer@21.6.1 \
    puppeteer-extra@3.3.6 \
    puppeteer-extra-plugin-stealth@2.11.2

# Switch to n8n user
USER node

WORKDIR /home/node

# Install packages in n8n's node_modules (accessible to Code node)
RUN cd /usr/local/lib/node_modules/n8n && \
    npm install \
    puppeteer@21.6.1 \
    puppeteer-extra@3.3.6 \
    puppeteer-extra-plugin-stealth@2.11.2

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/ \
    NODE_PATH=/usr/local/lib/node_modules

EXPOSE 5678
