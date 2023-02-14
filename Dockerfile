FROM public.ecr.aws/lambda/nodejs:16 as base
ENV NODE_ENV production
ENV LANG en_US.UTF-8

WORKDIR ${LAMBDA_TASK_ROOT}
COPY  package.json package-lock.json metrics.yml ./
COPY src ./
RUN npm ci --production
CMD [ "index.handler" ]
