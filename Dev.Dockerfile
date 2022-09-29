# -------------------------------------------------------------
# Dev container image
# -------------------------------------------------------------
FROM node:18-alpine AS builder
LABEL maintainer="vasu1124"

# Create workdir
WORKDIR /app

COPY package.json tsconfig.json ./
COPY src src/
# Install  dependencies
RUN npm install --audit=false --omit=optional && npm cache clean --force

EXPOSE 9229

# Run with nodemon watching files
# --inspect or --inspect-brk
CMD ["npm", "run", "dev:start"]
