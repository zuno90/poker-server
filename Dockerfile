FROM node:alpine
WORKDIR /usr/src/app/poker-server
COPY ./package*.json .
RUN yarn
COPY . .
RUN yarn build

CMD [ "yarn", "start" ]