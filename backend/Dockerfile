FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
COPY desktop-host/package.json desktop-host/package.json
RUN npm install

FROM deps AS build
COPY backend backend
RUN npm --workspace backend run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/package.json package.json
COPY --from=deps /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY backend/db backend/db
EXPOSE 8080
CMD ["npm", "--workspace", "backend", "run", "start"]
