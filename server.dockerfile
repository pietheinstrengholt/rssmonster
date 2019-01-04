FROM node:11.6-alpine

WORKDIR /app
COPY ./server/package.json ./server/package-lock.json ./
RUN npm install

ADD ./server /app

COPY ./server/.env.example ./.env
EXPOSE 3000/tcp
CMD npm run start
