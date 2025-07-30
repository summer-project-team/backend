/**
 * WebSocket Service for real-time updates
 */
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connections = new Map();
  }

  initialize(server) {
    this.io = socketIo(server, {
      cors: {
        origin: '*', // In production, restrict this to your frontend domain
        methods: ['GET', 'POST']
      }
    });

    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication error: Token not provided'));
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'crossbridge_secret_key');
        socket.user = decoded;
        next();
      } catch (error) {
        return next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      const userId = socket.user.id;
      console.log(`User connected: ${userId}`);
      
      // Store the connection
      if (!this.connections.has(userId)) {
        this.connections.set(userId, []);
      }
      this.connections.get(userId).push(socket.id);
      
      // Send welcome message
      socket.emit('welcome', { message: 'Connected to CrossBridge real-time service' });
      
      // Join user-specific room
      socket.join(`user:${userId}`);
      
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        // Remove the connection
        const userConnections = this.connections.get(userId) || [];
        const index = userConnections.indexOf(socket.id);
        if (index !== -1) {
          userConnections.splice(index, 1);
        }
        if (userConnections.length === 0) {
          this.connections.delete(userId);
        }
      });
    });
    
    console.log('WebSocket service initialized');
    return this.io;
  }

  // Send a message to a specific user
  sendToUser(userId, event, data) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
      return true;
    }
    return false;
  }

  // Send a message to all connected users
  broadcast(event, data) {
    if (this.io) {
      this.io.emit(event, data);
      return true;
    }
    return false;
  }

  // Send a transaction update
  sendTransactionUpdate(userId, transaction) {
    return this.sendToUser(userId, 'transaction:update', {
      transaction_id: transaction.id,
      status: transaction.status,
      updated_at: transaction.updated_at,
      details: transaction
    });
  }

  // Send a new notification
  sendNotification(userId, notification) {
    return this.sendToUser(userId, 'notification', notification);
  }

  // Send a system announcement to all users
  sendSystemAnnouncement(message) {
    return this.broadcast('system:announcement', {
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Check if a user is online
  isUserOnline(userId) {
    return this.connections.has(userId) && this.connections.get(userId).length > 0;
  }

  // Get number of online users
  getOnlineUsersCount() {
    return this.connections.size;
  }
}

// Create a singleton instance
const websocketService = new WebSocketService();

module.exports = websocketService; 