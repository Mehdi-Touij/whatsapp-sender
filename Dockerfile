FROM node:22-slim

WORKDIR /app

# Install dashboard dependencies (copy both package.json AND package-lock.json)
COPY dashboard/package.json dashboard/package-lock.json /dashboard/
RUN cd /dashboard && npm ci --legacy-peer-deps

# Copy dashboard source and build
COPY dashboard/ /dashboard/
RUN cd /dashboard && npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "/dashboard"]