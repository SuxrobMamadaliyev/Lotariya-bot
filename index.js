require('dotenv').config();

const { Bot, webhookCallback } = require('grammy');
const express = require('express');
const config  = require('./config');
const { connectDB, writeLog } = require('./database');
const { checkSpam, isAdmin, upsertUser, checkSubscription } = require('./functions');
const { subscribeKeyboard, adminKeyboard } = require('./keyboards');
const { handleCallback } = require('./callback');
const { handlePreCheckout, handleSuccessfulPayment } = require('./payment');

const {
  sendAdminMenu, getSession, clearSession,
  startCreateLottery, handleCreateLotteryStep,
  showActiveLotteriesAdmin, showFinishedLotteries,
  showUsers, showStats, showPayments,
  startBroadcast, handleBroadcastMessage, startAd,
  showChannels, handleAddChannel,
  showAdmins, handleAddAdmin,
  showSubscriptionSettings, showLogs, sendBackup,
  startSelectWinner, handleSelectWinnerNum,
  startFinishLottery, handleFinishLotteryNum,
} = require('./admin');

const {
  sendUserMenu, showActiveLotteries, showMyTickets,
  showLastWinners, showProfile, showMyPayments,
  showHistory, showHelp, showAdminContact, showGifts,
} = require('./user');

const bot = new Bot(config.BOT_TOKEN);

const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('Bot is running'));
// UptimeRobot shu manzilga har necha daqiqada ping yuborib turadi (24/7 uyg'oq turishi uchun)
app.get('/ping', (req, res) => res.status(200).send('pong'));

// Webhook maxfiy yo'li — token'ning o'zidan foydalanamiz, shuning uchun uni
// hech kim taxmin qilolmaydi (faqat Telegram va siz biladi).
const WEBHOOK_PATH = `/webhook/${config.BOT_TOKEN}`;

// ── Middleware ────────────────────────────────────────────────────────────────
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();
  if (!ctx.message?.successful_payment && !ctx.preCheckoutQuery) {
    if (checkSpam(ctx.from.id)) {
      try { await ctx.reply('⚠️ Juda tez bosyapsiz. Biroz kuting.'); } catch {}
      return;
    }
  }
  await upsertUser(ctx.from);
  return next();
});

// ── /start ────────────────────────────────────────────────────────────────────
bot.command('start', async (ctx) => {
  try {
    const userId = ctx.from.id;
    if (await isAdmin(userId)) { await sendAdminMenu(ctx); return; }
    const { ok, missing } = await checkSubscription(bot, userId);
    if (!ok) {
      await ctx.reply(
        '📢 <b>Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:</b>',
        { parse_mode: 'HTML', reply_markup: subscribeKeyboard(missing) }
      );
      return;
    }
    await sendUserMenu(ctx);
  } catch (err) {
    await writeLog('error', '/start xatosi', { err: err.message });
  }
});

// ── /admin ────────────────────────────────────────────────────────────────────
bot.command('admin', async (ctx) => {
  if (await isAdmin(ctx.from.id)) { await sendAdminMenu(ctx); }
  else { await ctx.reply('❌ Ruxsat yo\'q.'); }
});

// ── To'lovlar ─────────────────────────────────────────────────────────────────
bot.on('pre_checkout_query', handlePreCheckout);
bot.on('message:successful_payment', async (ctx) => { await handleSuccessfulPayment(ctx, bot); });

// ── Callback ──────────────────────────────────────────────────────────────────
bot.on('callback_query:data', async (ctx) => { await handleCallback(ctx, bot); });

// ── Matn xabarlari ────────────────────────────────────────────────────────────
bot.on('message:text', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const text   = ctx.message.text.trim();

    if (await isAdmin(userId)) {
      const session = getSession(userId);

      if (session) {
        if (session.step.startsWith('create_lottery_') && await handleCreateLotteryStep(ctx, bot)) return;
        if (session.step === 'broadcast_message' && await handleBroadcastMessage(ctx, bot)) return;
        if (session.step === 'add_channel' && await handleAddChannel(ctx, bot)) return;
        if (session.step === 'add_admin' && await handleAddAdmin(ctx)) return;
        if (session.step === 'select_winner_num' && await handleSelectWinnerNum(ctx, bot)) return;
        if (session.step === 'finish_lottery_num' && await handleFinishLotteryNum(ctx, bot)) return;

        if (text.toLowerCase() === 'bekor' || text === '❌ Bekor qilish') {
          clearSession(userId);
          await ctx.reply('❌ Bekor qilindi.', { reply_markup: adminKeyboard });
          return;
        }
      }

      switch (text) {
        case '🎰 Lotereya yaratish':       await startCreateLottery(ctx); return;
        case '📋 Faol lotereyalar':        await showActiveLotteriesAdmin(ctx); return;
        case '📦 Yakunlangan lotereyalar': await showFinishedLotteries(ctx); return;
        case '👥 Foydalanuvchilar':        await showUsers(ctx); return;
        case '📊 Statistika':              await showStats(ctx); return;
        case '💳 To\'lovlar':              await showPayments(ctx); return;
        case '📢 Xabar yuborish':          await startBroadcast(ctx); return;
        case '📣 Reklama yuborish':        await startAd(ctx); return;
        case '🎁 Sovg\'alar':              await showGifts(ctx); return;
        case '📢 Kanallar':                await showChannels(ctx); return;
        case '🔒 Majburiy obuna':          await showSubscriptionSettings(ctx); return;
        case '👑 Adminlar':                await showAdmins(ctx); return;
        case '🗂 Backup':                  await sendBackup(ctx); return;
        case '📝 Loglar':                  await showLogs(ctx); return;
        case '❌ Lotereyani tugatish':     await startFinishLottery(ctx); return;
        case '🏆 G\'olibni tanlash':       await startSelectWinner(ctx); return;
        case '⭐ Narx sozlamalari':
          await ctx.reply('⭐ Narx lotereyalar yaratilganda belgilanadi.'); return;
        case '⚙️ Sozlamalar':
          await ctx.reply('⚙️ <b>Sozlamalar</b>\n\nKelgusida qo\'shiladi.', { parse_mode: 'HTML' }); return;
      }
    }

    // Majburiy obuna (foydalanuvchi)
    if (!(await isAdmin(userId))) {
      const { ok, missing } = await checkSubscription(bot, userId);
      if (!ok) {
        await ctx.reply(
          '📢 <b>Botdan foydalanish uchun quyidagi kanallarga obuna bo\'ling:</b>',
          { parse_mode: 'HTML', reply_markup: subscribeKeyboard(missing) }
        );
        return;
      }
    }

    switch (text) {
      case '🎰 Faol lotereyalar':    await showActiveLotteries(ctx); return;
      case '🎟 Mening biletlarim':   await showMyTickets(ctx); return;
      case '🏆 Oxirgi g\'oliblar':   await showLastWinners(ctx); return;
      case '📜 Tarix':               await showHistory(ctx); return;
      case '👤 Profil':              await showProfile(ctx); return;
      case '⭐ To\'lovlarim':        await showMyPayments(ctx); return;
      case '🎁 Sovg\'alar':          await showGifts(ctx); return;
      case '📢 Yangiliklar':         await ctx.reply('📢 Yangiliklar uchun kanalimizga obuna bo\'ling!'); return;
      case '❓ Yordam':              await showHelp(ctx); return;
      case '📞 Admin':               await showAdminContact(ctx); return;
      default:
        if (await isAdmin(userId)) { await sendAdminMenu(ctx); }
        else { await sendUserMenu(ctx); }
    }
  } catch (err) {
    await writeLog('error', 'message:text xatosi', { err: err.message });
  }
});

// ── Rasm (admin sessiyasida) ──────────────────────────────────────────────────
bot.on('message:photo', async (ctx) => {
  try {
    if (!(await isAdmin(ctx.from.id))) return;
    const session = getSession(ctx.from.id);
    if (!session) return;
    if (session.step === 'create_lottery_photo') { await handleCreateLotteryStep(ctx, bot); return; }
    if (session.step === 'broadcast_message') { await handleBroadcastMessage(ctx, bot); }
  } catch (err) {
    await writeLog('error', 'message:photo xatosi', { err: err.message });
  }
});

// ── Xato handler ──────────────────────────────────────────────────────────────
bot.catch(async (err) => {
  console.error('Bot xatosi:', err.error);
  await writeLog('error', 'Bot xatosi', { err: err.error?.message || String(err.error) });
});

// ── Ishga tushurish ───────────────────────────────────────────────────────────
async function main() {
  try {
    await connectDB();

    if (config.WEBHOOK_URL) {
      // ── WEBHOOK REJIMI (Render / production) ──────────────────────────────
      app.use(WEBHOOK_PATH, webhookCallback(bot, 'express'));

      app.listen(config.PORT, async () => {
        console.log(`✅ Server ${config.PORT} portda (webhook rejimi)`);
        const fullUrl = `${config.WEBHOOK_URL}${WEBHOOK_PATH}`;
        await bot.api.setWebhook(fullUrl, { drop_pending_updates: true });
        const info = await bot.api.getMe();
        console.log(`✅ Bot @${info.username} webhook orqali ishga tushdi`);
        console.log(`🔗 Webhook: ${fullUrl}`);
        await writeLog('info', 'Bot webhook rejimida ishga tushdi', { username: info.username, url: fullUrl });
      });
    } else {
      // ── POLLING REJIMI (lokal test uchun) ─────────────────────────────────
      app.listen(config.PORT, () => console.log(`✅ Server ${config.PORT} portda (polling rejimi)`));
      await bot.api.deleteWebhook({ drop_pending_updates: true }).catch(() => {});
      await bot.start({
        onStart: (info) => {
          console.log(`✅ Bot @${info.username} ishga tushdi (polling)`);
          writeLog('info', 'Bot polling rejimida ishga tushdi', { username: info.username });
        },
      });
    }
  } catch (err) {
    console.error('❌ Start xatosi:', err.message);
    process.exit(1);
  }
}

process.on('unhandledRejection', async (reason) => {
  console.error('UnhandledRejection:', reason);
  await writeLog('error', 'UnhandledRejection', { reason: String(reason) });
});

process.on('uncaughtException', async (err) => {
  console.error('UncaughtException:', err.message);
  await writeLog('error', 'UncaughtException', { err: err.message });
  process.exit(1);
});

main();
