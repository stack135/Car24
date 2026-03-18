const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const path = require('path');
const sequelize = require('./config/database');

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.urlencoded({ extended: true }));

// Serve static files for payment screenshots
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Global rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cars', require('./routes/cars'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/branches', require('./routes/branches'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rides', require('./routes/rides'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/owners', require('./routes/owners'));
app.use('/api/car-pricing', require('./routes/carPricing'));
app.use('/api/refunds', require('./routes/refunds'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Car24 API is running', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Database connection and sync
const PORT = process.env.PORT || 5000;

const { User, Owner, Branch, Car, CarPricing, Booking, Payment, Refund, Ride } = require('./models');

// Auto-expire bookings job
setInterval(async () => {
  try {
    const expiredBookings = await Booking.findAll({
      where: {
        status: 'awaiting_payment',
        paymentExpiresAt: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });

    for (const booking of expiredBookings) {
      await booking.update({ status: 'cancelled' });
      console.log(`Booking ${booking.id} expired and cancelled`);
    }
  } catch (error) {
    console.error('Error expiring bookings:', error);
  }
}, 60000); // Run every minute

sequelize.authenticate()
  .then(() => {
    console.log('PostgreSQL connected');
    console.log('Syncing database with force: true (will drop all tables)...');
    return sequelize.sync({ force: false });
  })
  .then(() => {
    console.log('Database synced successfully');
    const server = app.listen(PORT, () => console.log(`🚗 Car24 API Server running on port ${PORT}`));
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Please free the port or change PORT in .env`);
        process.exit(1);
      }
    });
  })
  .catch(err => {
    console.error('Database error:', err);
    process.exit(1);
  });
