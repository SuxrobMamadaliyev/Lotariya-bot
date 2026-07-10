const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId:    { type: Number, required: true, unique: true },
  firstName:     { type: String, default: '' },
  lastName:      { type: String, default: '' },
  username:      { type: String, default: '' },
  totalTickets:  { type: Number, default: 0 },
  activeTickets: { type: Number, default: 0 },
  totalWins:     { type: Number, default: 0 },
  totalSpent:    { type: Number, default: 0 },
  isBlocked:     { type: Boolean, default: false },
  isAdmin:       { type: Boolean, default: false },
  // ── Referral tizimi ──────────────────────────────────────────────────────
  referredBy:         { type: Number, default: null },   // kim taklif qilgan (telegramId)
  referralConfirmed:  { type: Boolean, default: false },  // majburiy kanallarga obuna bo'lganmi
  confirmedReferrals: { type: Number, default: 0 },       // shu foydalanuvchi taklif qilgan va tasdiqlangan odamlar soni
  joinedAt:      { type: Date, default: Date.now },
  lastActivity:  { type: Date, default: Date.now },
}, { timestamps: true });

const lotterySchema = new mongoose.Schema({
  number:       { type: Number, required: true, unique: true },
  giftName:     { type: String, required: true },
  giftValue:    { type: Number, required: true },
  ticketPrice:  { type: Number, required: true },
  maxTickets:   { type: Number, required: true },
  soldTickets:  { type: Number, default: 0 },
  participants: { type: Number, default: 0 },
  photoFileId:  { type: String, default: null },
  channelId:    { type: String, required: true },
  channelMsgId: { type: Number, default: null },
  status: {
    type: String,
    enum: ['active', 'paused', 'cancelled', 'finished'],
    default: 'active',
  },
  winnerId:     { type: Number, default: null },
  winnerTicket: { type: Number, default: null },
  createdBy:    { type: Number, required: true },
  startedAt:    { type: Date, default: Date.now },
  finishedAt:   { type: Date, default: null },
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  lotteryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lottery', required: true },
  lotteryNum:   { type: Number, required: true },
  ticketNumber: { type: Number, required: true },
  userId:       { type: Number, required: true },
  userName:     { type: String, default: '' },
  paymentId:    { type: String, default: null },
  isWinner:     { type: Boolean, default: false },
  boughtAt:     { type: Date, default: Date.now },
}, { timestamps: true });

ticketSchema.index({ lotteryId: 1, ticketNumber: 1 }, { unique: true });

const paymentSchema = new mongoose.Schema({
  userId:       { type: Number, required: true },
  lotteryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lottery' },
  lotteryNum:   { type: Number },
  amount:       { type: Number, required: true },
  chargeId:     { type: String, unique: true },
  ticketId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
  ticketNumber: { type: Number },
  status:       { type: String, enum: ['pending', 'success', 'refunded'], default: 'pending' },
  paidAt:       { type: Date, default: Date.now },
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },
  value:     { type: mongoose.Schema.Types.Mixed },
  updatedAt: { type: Date, default: Date.now },
});

const channelSchema = new mongoose.Schema({
  username:   { type: String, required: true },
  chatId:     { type: String, required: true, unique: true },
  inviteLink: { type: String, default: '' },
  title:      { type: String, default: '' },
  addedBy:    { type: Number },
  addedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

const adminSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, unique: true },
  firstName:  { type: String, default: '' },
  username:   { type: String, default: '' },
  addedBy:    { type: Number },
  addedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

const winnerSchema = new mongoose.Schema({
  lotteryId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lottery' },
  lotteryNum:   { type: Number },
  userId:       { type: Number },
  firstName:    { type: String, default: '' },
  username:     { type: String, default: '' },
  ticketNumber: { type: Number },
  giftName:     { type: String },
  giftValue:    { type: Number },
  wonAt:        { type: Date, default: Date.now },
}, { timestamps: true });

const historySchema = new mongoose.Schema({
  type:   { type: String },
  userId: { type: Number, default: null },
  data:   { type: mongoose.Schema.Types.Mixed },
  at:     { type: Date, default: Date.now },
}, { timestamps: true });

const logSchema = new mongoose.Schema({
  level:   { type: String, enum: ['info', 'warn', 'error', 'payment', 'admin'], default: 'info' },
  message: { type: String },
  data:    { type: mongoose.Schema.Types.Mixed, default: null },
  at:      { type: Date, default: Date.now },
}, { timestamps: true });

logSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = {
  User:     mongoose.model('User',    userSchema),
  Lottery:  mongoose.model('Lottery', lotterySchema),
  Ticket:   mongoose.model('Ticket',  ticketSchema),
  Payment:  mongoose.model('Payment', paymentSchema),
  Settings: mongoose.model('Settings', settingsSchema),
  Channel:  mongoose.model('Channel', channelSchema),
  Admin:    mongoose.model('Admin',   adminSchema),
  Winner:   mongoose.model('Winner',  winnerSchema),
  History:  mongoose.model('History', historySchema),
  Log:      mongoose.model('Log',     logSchema),
};
