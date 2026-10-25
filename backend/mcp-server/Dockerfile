FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.mjs ./
COPY lib ./lib
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
