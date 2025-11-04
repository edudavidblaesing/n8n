# Puppeteer API Dockerfile

FROM node:20-alpine

# Switch to root for package installation
USER root

# Install dependencies for Chromium and Puppeteer
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

# Create app directory
WORKDIR /usr/src/app

# Copy package.json if you have one, otherwise initialize npm
COPY package.json package-lock.json* ./
RUN npm install --unsafe-perm=true --no-audit --production

# Copy server.js into container
COPY server.js .

# Set environment variables for Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Expose the port for API
EXPOSE 3000

# Make node user own the app directory (avoid permission errors)
RUN chown -R node:node /usr/src/app

# Switch to non-root user for running server
USER node

# Start the Puppeteer server
CMD ["node", "server.js"]
