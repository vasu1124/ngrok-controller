FROM node:14-alpine AS builder
LABEL maintainer="vasu1124"

# Copy everything and create workdir
WORKDIR /app
COPY package.json package-lock.json tsconfig.json /app/
COPY src /app/src/

# Install  dependencies
RUN npm install --no-optional && npm cache clean --force

RUN npm run build && rm -rf src

# Debugging output
RUN find . -not -path "./node_modules/*" -print

# -------------------------------------------------------------
# Final container image
# -------------------------------------------------------------
FROM node:14-alpine

WORKDIR /app

# RUN find / -print
COPY --from=builder /app /app/
RUN npm install -g nodemon
RUN find . -not -path "./node_modules/*" -print

# Run with debugging port when container launches
#ENTRYPOINT ["node", "--inspect=9229", "dist/main.js"]

EXPOSE 9229
# Run with nodemon watching .cds and .js files
# On any change, cds deploy
CMD ["nodemon", "--ignore", "node_modules/**/*", "-e", "js", "node", "--inspect=9229", "dist/main.js"]
