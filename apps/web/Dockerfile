# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
# Patch OS-level CVEs on top of the node:20-alpine base on each rebuild.
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine
# Patch OS-level CVEs on top of the nginx:alpine base on each rebuild.
RUN apk upgrade --no-cache
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
