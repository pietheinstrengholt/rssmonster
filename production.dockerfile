FROM node:11.6-alpine

RUN apk update
RUN apk add g++ make python

WORKDIR /app/client
COPY ./client/package.json ./client/package-lock.json ./
RUN npm install

WORKDIR /app/server
COPY ./server/package.json ./server/package-lock.json ./
RUN npm install

ADD ./client /app/client
WORKDIR /app/client
RUN npm run build
RUN mv ./dist ../server

ADD ./server /app/server

WORKDIR /app/server
COPY ./server/.env.example ./.env
EXPOSE 3000/tcp
CMD npm run start