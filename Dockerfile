# Puppeteer API Dockerfile
FROM node:20-alpine

# Switch to root to install system dependencies
USER root

# Install dependencies for Chromium & Puppeteer
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

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json if exists
COPY package*.json ./

# Install Node dependencies locally (production mode)
RUN npm install --production

# Copy server.js into container
COPY server.js .

# Environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Expose API port
EXPOSE 3000

# Use root (or create a non-root user later if you want)
USER root

# Start the Puppeteer server
CMD ["node", "server.js"]
