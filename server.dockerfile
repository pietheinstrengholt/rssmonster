FROM node:11.6-alpine

RUN apk update
RUN apk add g++ make python

WORKDIR /app
COPY ./server/package.json ./server/package-lock.json ./
RUN npm install

ADD ./server /app

EXPOSE 3000/tcp
CMD npm run start
