FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/oyuur.db
EXPOSE 8080
USER node
CMD ["node", "--no-warnings", "src/main.js"]
