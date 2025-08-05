FROM node:18-alpine

# Install postgresql-client for database operations
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Make migration script executable
RUN chmod +x docker-migrate-and-start.sh

# Expose API port
EXPOSE 10000

# Command to run the application with migration reset
CMD ["./docker-migrate-and-start.sh"]