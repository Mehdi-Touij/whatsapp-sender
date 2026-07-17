FROM node:22-slim

WORKDIR /app

# Install dashboard dependencies
COPY dashboard/package.json /dashboard/package.json
RUN cd /dashboard && npm install

# Copy dashboard source and build
COPY dashboard/ /dashboard/
RUN cd /dashboard && npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "/dashboard"]