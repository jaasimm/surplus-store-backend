const mongoose = require('mongoose');
const env = require('./env');

/** Connect to MongoDB with sane driver options. */
async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log(`[db] connected → ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

module.exports = connectDB;
