// start the yoga server
require('dotenv').config();
const createServer = require('./createServer');
const db = require('./db');

const server = createServer();

// todo use express middleware for cookies and current user

server.start({
  cors: {
    credentials: true,
    origin: process.env.FRONTEND_URL
    // only accept connections from origin
  }
}, deets => {
  console.log(`Server is running on port http://localhost:${deets.port}`);
});