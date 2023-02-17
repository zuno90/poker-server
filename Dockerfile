FROM node:alpine as build
WORKDIR /usr/src/app/poker-server
COPY ./package*.json .
RUN yarn
COPY . .
RUN yarn build

CMD [ "node", "dist/index.js" ]