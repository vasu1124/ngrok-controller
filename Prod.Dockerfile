FROM node:14-alpine AS builder
LABEL maintainer="vasu1124"

# Copy everything and create workdir
WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./

# Install  dependencies
RUN npm install --no-audit --no-optional && npm cache clean --force

# Build with tsc
COPY src src/
RUN npm run build && rm -rf src

# List output
# RUN find . -not -path "./node_modules/*" -print

# -------------------------------------------------------------
# Final container image
# -------------------------------------------------------------
FROM node:14-alpine

WORKDIR /app

# RUN find / -print
COPY --from=builder /app /app/

# List output
RUN find . -not -path "./node_modules/*" -print

# Run with node
CMD ["node", "dist/main.js", "--log", "info"]
