FROM n8nio/n8n:latest

USER root

# Install Chromium and all dependencies
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
    g++

# Create directory for custom modules
RUN mkdir -p /home/node/custom_modules

# Switch to node user for npm installations
USER node

# Install ALL puppeteer extras in custom location
WORKDIR /home/node/custom_modules
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

# Switch back to root for environment setup
USER root

# Set NODE_PATH so n8n can find the modules
ENV NODE_PATH=/home/node/custom_modules/node_modules:/usr/local/lib/node_modules

# Puppeteer configuration
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Back to node user
USER node

WORKDIR /home/node

EXPOSE 5678
