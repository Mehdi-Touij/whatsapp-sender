FROM atendai/evolution-api:v2.2.3

# Evolution API runs on port 8080
EXPOSE 8080

# Environment variables will be set via Railway
CMD ["node", "dist/main.js"]
