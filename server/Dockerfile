# Server Dockerfile - Optimized
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (this layer will be cached if package.json doesn't change)
RUN npm install && npm cache clean --force

# Copy source code (this layer will rebuild only when source changes)
COPY . .

# Expose port
EXPOSE 4100

# Start development server
CMD ["npm", "run", "dev"]
