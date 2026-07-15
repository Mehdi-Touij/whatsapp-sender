FROM node:22-slim

# Install system deps for Evolution API
RUN apt-get update && apt-get install -y --no-install-recommends     libcurl4 libssl3 ca-certificates ffmpeg     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Evolution API globally
RUN npm install -g @evolution/api@latest 2>/dev/null || echo "Will use npx"

# Copy dashboard and install
COPY dashboard/package.json dashboard/package.json
RUN cd dashboard && npm install
COPY dashboard/ dashboard/
RUN cd dashboard && npm run build

# Create start script
RUN echo '#!/bin/bash\n# Start Evolution API in background\nnpx @evolution/api &\nEVOLUTION_PID=$!\necho "Evolution API started (PID: $EVOLUTION_PID)"\n\n# Start dashboard\ncd dashboard && npm start' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["/app/start.sh"]
