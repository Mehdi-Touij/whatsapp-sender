FROM atendai/evolution-api:v2.2.3

# Evolution API is already in this image at /app
# We need to add our dashboard alongside it

WORKDIR /evolution

# The Evolution API image already has everything at /app
# Let's add the dashboard as a separate process

# Install dashboard dependencies
COPY dashboard/package.json /dashboard/package.json
RUN cd /dashboard && npm install

# Copy dashboard source
COPY dashboard/ /dashboard/
RUN cd /dashboard && npm run build

# Create start script that runs both
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'cd /app && node dist/main.js &' >> /start.sh && \
    echo 'EVOLUTION_PID=$!' >> /start.sh && \
    echo 'echo "Evolution API started (PID: $EVOLUTION_PID)"' >> /start.sh && \
    echo 'cd /dashboard && npm start' >> /start.sh && \
    chmod +x /start.sh

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["/start.sh"]