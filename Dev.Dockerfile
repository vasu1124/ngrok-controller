# -------------------------------------------------------------
# Dev container image
# -------------------------------------------------------------
FROM node:14-alpine
LABEL maintainer="vasu1124"

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm install -g --no-audit --no-optional nodemon && npm install --no-audit --no-optional && npm cache clean --force
COPY dist dist/
# RUN find . -not -path "./node_modules/*" -print

EXPOSE 9229

# Run with nodemon watching .js files
# --inspect or --inspect-brk
CMD ["nodemon", "--ignore", "node_modules/**/*", "-e", "js", "--inspect=9229", "dist/main.js", "--log", "debug"]
