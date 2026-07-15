FROM node:22-slim

# Install system dependencies for Evolution API
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcurl4 libssl3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dashboard package and install
COPY dashboard/package.json dashboard/package.json
RUN cd dashboard && npm install

# Copy all source
COPY dashboard/ dashboard/

# Build the dashboard
RUN cd dashboard && npm run build

# Install tsx for the worker
RUN npm install -g tsx

# Install pg for the dashboard API routes
RUN cd dashboard && npm install pg

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "dashboard"]