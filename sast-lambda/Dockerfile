FROM public.ecr.aws/lambda/nodejs:20

RUN dnf install -y git && dnf clean all

COPY package.json ${LAMBDA_TASK_ROOT}/

RUN npm install

COPY scanner.js ${LAMBDA_TASK_ROOT}/
COPY handler.js ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambdaHandler"]
