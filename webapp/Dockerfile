# Self-Healing SOP — web app. Multi-stage: build with Vite, serve static via nginx.
FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The browser (not this container) calls the backend, so the API base URL points
# at the host-published backend port. Override at build time if needed.
ARG VITE_API_BASE_URL=http://localhost:8077
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
