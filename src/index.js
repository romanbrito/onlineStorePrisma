const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const createServer = require('./createServer');
const db = require('./db');

const server = createServer();

// Use express middlware to handle cookies (JWT)
server.express.use(cookieParser());
// decode the JWT token
server.express.use((req, res, next) => {
  const {token} = req.cookies;
  if(token) {
    const {userId} = jwt.verify(token,process.env.APP_SECRET);
    // put the user id onto the req for future request access
    req.userId = userId;
  }
  next();
});
// TODO Use express middlware to populate current user

server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL,
    },
  },
  deets => {
    console.log(`Server is now running on port http:/localhost:${deets.port}`);
  }
);