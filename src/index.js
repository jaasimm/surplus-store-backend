/**
 * Surplus Store — API server entry point.
 * Starts MongoDB, then Express on the configured port.
 */
const env = require('./config/env');
const connectDB = require('./config/db');

(async () => {
  try {
    await connectDB();

    // Mongoose models are required lazily by routes; load app after the DB is up.
    const app = require('./app');

    const server = app.listen(env.port, () => {
      console.log(`\n🛍  Surplus Store API  →  http://localhost:${env.port}/api`);
      console.log(`   env: ${env.nodeEnv} | otp: ${env.otp.provider} | uploads: ${env.upload.driver}`);
      console.log(`   payments: ${env.razorpay.keyId ? 'razorpay live keys' : 'MOCK checkout (no keys configured)'}\n`);
    });

    // Graceful shutdown (Docker / PM2 friendly)
    const shutdown = (signal) => async () => {
      console.log(`\n${signal} received — shutting down…`);
      server.close(async () => {
        const mongoose = require('mongoose');
        await mongoose.disconnect();
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown('SIGINT'));
    process.on('SIGTERM', shutdown('SIGTERM'));

    process.on('unhandledRejection', (err) => {
      console.error('[unhandledRejection]', err);
    });
  } catch (err) {
    console.error('[fatal] failed to start server:', err.message);
    process.exit(1);
  }
})();
