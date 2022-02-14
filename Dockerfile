# Stage one - install
FROM node:16-alpine as base
ENV NODE_ENV production

# Install the Lambda runtime and its dependencies
RUN apk add -U build-base libtool musl-dev libressl-dev libffi-dev autoconf automake libexecinfo-dev make cmake python3 libcurl
RUN npm install -g aws-lambda-ric

# Install application dependencies
WORKDIR /app
COPY package.json /app/
RUN npm install --production

# Copy the source code
COPY src /app

# Stage two, final build
FROM node:16-alpine
WORKDIR /app
COPY --from=base /usr/local /usr/local
COPY --from=base /app /app
CMD ["/usr/local/bin/aws-lambda-ric", "index.handler"]
