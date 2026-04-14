FROM node:20-slim

WORKDIR /app

# Copy root package.json
COPY package.json ./

# Copy server files
COPY server/package.json ./server/
COPY server/tsconfig.json ./server/
COPY server/src ./server/src/

# Copy client files
COPY client/package.json ./client/
COPY client/ ./client/

# Install and build server
RUN cd server && npm install && npm run build

# Install and build client
RUN cd client && npm install && npm run build

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["node", "server/dist/index.js"]
