FROM node:22-alpine
ENV NODE_ENV=development
WORKDIR /app

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ /app/
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
