# Production image for Railway (or any container host): build with Vite/Nitro, run the
# node-server output. Uses package-lock.json (npm ci) so installs are reproducible.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY --from=build /app/.output ./.output
# Nitro's node-server reads PORT (Railway injects it); 3000 is the fallback.
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
