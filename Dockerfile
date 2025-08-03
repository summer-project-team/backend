FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose API port
EXPOSE $PORT

# Command to run the application
CMD ["sh", "-c", "npx knex migrate:latest && npm start"]