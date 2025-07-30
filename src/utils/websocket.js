const WebSocket = require('ws');
const rateStreamingService = require('../services/rateStreamingService');

let wss = null;

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server instance
 */
const initializeWebSocket = (server) => {
  if (wss) return; // Already initialized

  // Create WebSocket server
  wss = new WebSocket.Server({ server });
  console.log('WebSocket server initialized');
  
  // Initialize transaction notification handler
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        // Handle different message types
        switch (data.type) {
          case 'subscribe_transaction':
            // Subscribe to transaction updates
            ws.transactionId = data.transaction_id;
            console.log(`Client subscribed to transaction updates for: ${data.transaction_id}`);
            break;
            
          case 'ping':
            // Respond to ping with pong
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
            
          default:
            console.log(`Unknown message type: ${data.type}`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to CrossBridge WebSocket server',
      timestamp: Date.now()
    }));
  });
  
  // Initialize rate streaming service
  rateStreamingService.initialize(new WebSocket.Server({ 
    server, 
    path: '/ws/rates' 
  }), server);
  
  return wss;
};

/**
 * Send a notification update about a transaction
 * @param {string} transactionId - Transaction ID
 * @param {Object} data - Transaction data
 */
const notifyTransactionUpdate = (transactionId, data = null) => {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.transactionId === transactionId && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'transaction_update',
        transaction_id: transactionId,
        data: data,
        timestamp: Date.now()
      }));
    }
  });
};

/**
 * Broadcast a message to all connected clients
 * @param {Object} message - Message to broadcast
 */
const broadcast = (message) => {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
    }
  });
};

/**
 * Close all WebSocket connections
 */
const closeAllConnections = () => {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    client.close();
  });
  
  // Stop rate streaming
  rateStreamingService.stop();
};

module.exports = {
  initializeWebSocket,
  notifyTransactionUpdate,
  broadcast,
  closeAllConnections
}; 