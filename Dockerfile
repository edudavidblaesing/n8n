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

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Switch to node user for npm installs
USER node

# Ensure n8n home directory exists
RUN mkdir -p /home/node/.n8n

# Set working directory to n8n home
WORKDIR /home/node/.n8n

# Initialize npm project and install Puppeteer + plugins here
RUN npm init -y && \
    npm install \
        puppeteer@21.6.1 \
        puppeteer-extra@3.3.6 \
        puppeteer-extra-plugin-stealth@2.11.2 \
        puppeteer-extra-plugin-user-preferences@2.4.1 \
        puppeteer-extra-plugin-user-data-dir@2.4.1 \
        puppeteer-extra-plugin-anonymize-ua@2.4.6 \
        puppeteer-extra-plugin-block-resources@2.4.6 \
        puppeteer-extra-plugin-recaptcha@3.6.8 \
        user-agents@1.1.0

# Back to main home
WORKDIR /home/node

# Expose n8n default port
EXPOSE 5678

# Entrypoint remains n8n
