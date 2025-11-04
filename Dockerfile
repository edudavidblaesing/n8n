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

# Install Puppeteer + plugins locally (no package.json needed)
RUN npm install --no-audit --production \
    puppeteer@24 \
    puppeteer-extra@3 \
    puppeteer-extra-plugin-stealth@2 \
    puppeteer-extra-plugin-user-preferences@2 \
    puppeteer-extra-plugin-user-data-dir@2 \
    puppeteer-extra-plugin-anonymize-ua@2 \
    puppeteer-extra-plugin-recaptcha@3 \
    user-agents@1

# Copy server.js into container
COPY server.js .

# Set environment variables for Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_BIN=/usr/bin/chromium-browser \
    CHROME_PATH=/usr/lib/chromium/

# Expose the API port
EXPOSE 3000

# Give non-root user access to the app folder
RUN chown -R node:node /usr/src/app

# Switch to non-root user
USER root

# Start the Puppeteer server
CMD ["node", "server.js"]
