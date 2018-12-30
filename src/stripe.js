module.exports = require('stripe')(process.env.STRIPE_SECRET);
// same as
// const stripe = require('stripe');
// const config = stripe(process.env.STRIPE_SECRET);
// module.exports = config;