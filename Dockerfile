FROM atendai/evolution-api:v2.2.3

# Evolution API is pre-installed at /app in this image
# We add the dashboard on top

WORKDIR /evolution

# Install dashboard dependencies
COPY dashboard/package.json /dashboard/package.json
RUN cd /dashboard && npm install

# Copy dashboard source and build
COPY dashboard/ /dashboard/
RUN cd /dashboard && npm run build

# Create start script — Evolution API runs on 8080, dashboard on 3000
RUN printf '#!/bin/sh\nnode /app/dist/main.js &\nEVOLUTION_PID=$!\necho "Evolution API started (PID: $EVOLUTION_PID)"\ncd /dashboard && npm start\n' > /start.sh && chmod +x /start.sh

EXPOSE 8080

ENV PORT=8080
ENV NODE_ENV=production

CMD ["/start.sh"]