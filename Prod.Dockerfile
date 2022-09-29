FROM node:18-alpine AS builder
LABEL maintainer="vasu1124"

# Create workdir
WORKDIR /app

COPY package.json tsconfig.json ./
# Install  dependencies
RUN npm install --audit=false --omit=optional && npm cache clean --force

# Copy source
COPY src src/

# Build
# RUN npm run build && rm -rf src

# -------------------------------------------------------------
# Final container image, fresh setup 
# -------------------------------------------------------------
FROM node:18-alpine

WORKDIR /app

# RUN find / -print
COPY --from=builder /app /app/

# List output
# RUN find . -not -path "./node_modules/*" -print

# Run with node
CMD ["npm", "run", "start"]