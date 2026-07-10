require('dotenv').config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  BOT_USERNAME: process.env.BOT_USERNAME,
  ADMIN_IDS: process.env.ADMIN_ID
    ? process.env.ADMIN_ID.split(',').map(id => parseInt(id.trim()))
    : [],
  MONGO_URI: process.env.MONGO_URI,
  PORT: parseInt(process.env.PORT) || 10000,
  // Render'dagi ochiq URL, masalan: https://lotariya-bot.onrender.com
  // Bo'sh qoldirilsa bot polling rejimida ishlaydi (webhook o'chiq).
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  RATE_LIMIT: {
    MAX_MESSAGES: 5,
    WINDOW_MS: 3000,
    BLOCK_DURATION: 30000,
  },
  LOTTERY: {
    MIN_TICKET_PRICE: 1,
    MAX_TICKET_PRICE: 10000,
    MIN_MAX_TICKETS: 2,
    MAX_MAX_TICKETS: 100000,
  },
  // Har bir tasdiqlangan referral g'olib tanlashda qo'shimcha necha "ovoz og'irligi" berishi.
  // Masalan 1 => 3 ta referral chaqirgan foydalanuvchining bir biletdagi yutish ehtimoli 4 barobar oshadi.
  REFERRAL_WIN_WEIGHT: 1,
  LOG_LEVELS: ['info', 'warn', 'error', 'payment', 'admin'],
};

if (!config.BOT_TOKEN) throw new Error('BOT_TOKEN .env da ko\'rsatilmagan!');
if (!config.MONGO_URI) throw new Error('MONGO_URI .env da ko\'rsatilmagan!');
if (config.ADMIN_IDS.length === 0) throw new Error('ADMIN_ID .env da ko\'rsatilmagan!');

module.exports = config;
