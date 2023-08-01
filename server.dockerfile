FROM node:18-alpine

RUN apk update
RUN apk add g++ make python3

WORKDIR /app
COPY ./server/package.json ./server/package-lock.json ./
RUN npm install

ADD ./server /app

EXPOSE 3000/tcp
CMD npm run debug
