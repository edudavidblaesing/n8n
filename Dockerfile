# Start from n8n official image
FROM n8nio/n8n:latest

# Switch to root to install system dependencies
USER root

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    ttf-opensans \
    nodejs \
    npm \
    udev \
    git \
    python3 \
    make \
    g++ \
    bash \
    curl

# Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Install Puppeteer + plugins globally
RUN npm install -g \
    puppeteer@21.6.1 \
    puppeteer-extra@3.3.6 \
    puppeteer-extra-plugin-stealth@2.11.2 \
    puppeteer-extra-plugin-user-preferences@2.4.1 \
    puppeteer-extra-plugin-user-data-dir@2.4.1 \
    puppeteer-extra-plugin-anonymize-ua@2.4.6 \
    puppeteer-extra-plugin-recaptcha@3.6.8 \
    user-agents@1.1.0

# Switch back to node user
USER node

# Set working directory
WORKDIR /home/node

# Expose n8n port
EXPOSE 5678

# Entrypoint remains n8n
