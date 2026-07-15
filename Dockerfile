FROM node:22-alpine

WORKDIR /app

COPY dashboard/package.json dashboard/package.json
RUN npm install --prefix dashboard

COPY dashboard/ dashboard/
RUN npm run build --prefix dashboard

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["npm", "start", "--prefix", "dashboard"]