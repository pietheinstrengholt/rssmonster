FROM node:18-alpine

RUN apk update
RUN apk add g++ make python3 git

WORKDIR /app/client
ADD ./client /app/client
RUN npm install

WORKDIR /app/server
ADD server /app/server
RUN npm install

WORKDIR /app/client
RUN npm run build
RUN mv ./dist ../server

WORKDIR /app/server
EXPOSE 3000
CMD npm run start