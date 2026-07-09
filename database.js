const mongoose = require('mongoose');
const config = require('./config');
const { Log } = require('./schema');

mongoose.set('strictQuery', false);

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(config.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('✅ MongoDB Atlas ga muvaffaqiyatli ulandi');

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️ MongoDB ulanishi uzildi. Qayta ulanish...');
    });
    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      console.log('✅ MongoDB ga qayta ulandi');
    });
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB xatosi:', err.message);
      isConnected = false;
    });
  } catch (err) {
    console.error('❌ MongoDB ga ulanib bo\'lmadi:', err.message);
    setTimeout(connectDB, 5000);
  }
}

async function writeLog(level, message, data = null) {
  try {
    await Log.create({ level, message, data });
  } catch {
    console.error('[LOG ERROR]', level, message);
  }
}

module.exports = { connectDB, writeLog };
