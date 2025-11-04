# Base image
FROM node:20-alpine

# Switch to root to install dependencies
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
    bash \
    curl \
    git \
    python3 \
    make \
    g++

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/ \
    PORT=3000

# Create working directory
WORKDIR /usr/src/app

# Switch to node user
USER node

# Install Puppeteer + extras globally in container
RUN npm install -g \
    puppeteer@24 \
    puppeteer-extra@3 \
    puppeteer-extra-plugin-stealth@2 \
    puppeteer-extra-plugin-user-preferences@2 \
    puppeteer-extra-plugin-user-data-dir@2 \
    puppeteer-extra-plugin-anonymize-ua@2 \
    puppeteer-extra-plugin-recaptcha@3 \
    user-agents@1

# Copy API server script
COPY ./server.js .

# Expose API port
EXPOSE 3000

# Run API server
CMD ["node", "server.js"]

