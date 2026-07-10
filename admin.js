const {
  Lottery, Ticket, Payment, User, Channel,
  Admin, Winner, Log, History,
} = require('./schema');
const { writeLog } = require('./database');
const { createLottery, selectWinner } = require('./lottery');
const { formatDate, escapeHtml } = require('./functions');
const {
  adminKeyboard, channelSelectKeyboard, cancelKeyboard,
  lotteryAdminKeyboard, paginationKeyboard,
} = require('./keyboards');

const sessions = new Map();
const PAGE_SIZE = 5;

async function sendAdminMenu(ctx) {
  await ctx.reply(
    `👑 <b>Admin Panel</b>\n\nKerakli bo'limni tanlang:`,
    { parse_mode: 'HTML', reply_markup: adminKeyboard }
  );
}

function getSession(userId) { return sessions.get(userId) || null; }
function setSession(userId, data) { sessions.set(userId, data); }
function clearSession(userId) { sessions.delete(userId); }

async function startCreateLottery(ctx) {
  setSession(ctx.from.id, { step: 'create_lottery_photo', data: {} });
  await ctx.reply(
    `🎰 <b>Yangi lotereya yaratish</b>\n\n1️⃣ Lotereyaga rasm yuboring yoki "o'tkazib yuborish" deb yozing:`,
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
  );
}

async function handleCreateLotteryStep(ctx, bot) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session) return false;

  const { step, data } = session;
  const text = ctx.message?.text?.trim() || '';
  const photo = ctx.message?.photo;

  switch (step) {
    case 'create_lottery_photo': {
      data.photoFileId = photo ? photo[photo.length - 1].file_id : null;
      setSession(userId, { step: 'create_lottery_gift_name', data });
      await ctx.reply('2️⃣ Sovg\'a nomini kiriting (masalan: NFT Dragon, Telegram Gift):', { reply_markup: cancelKeyboard });
      return true;
    }
    case 'create_lottery_gift_name': {
      if (!text || text.length < 2) { await ctx.reply('❌ Sovg\'a nomi kamida 2 ta belgi bo\'lishi kerak:'); return true; }
      data.giftName = text;
      setSession(userId, { step: 'create_lottery_gift_value', data });
      await ctx.reply('3️⃣ Sovg\'a qiymatini kiriting (Stars da, masalan: 500):', { reply_markup: cancelKeyboard });
      return true;
    }
    case 'create_lottery_gift_value': {
      const val = parseInt(text);
      if (isNaN(val) || val < 1) { await ctx.reply('❌ Noto\'g\'ri qiymat. Musbat son kiriting:'); return true; }
      data.giftValue = val;
      setSession(userId, { step: 'create_lottery_ticket_price', data });
      await ctx.reply('4️⃣ Bilet narxini kiriting (Stars da, masalan: 10):', { reply_markup: cancelKeyboard });
      return true;
    }
    case 'create_lottery_ticket_price': {
      const price = parseInt(text);
      if (isNaN(price) || price < 1) { await ctx.reply('❌ Noto\'g\'ri narx. 1 dan katta son kiriting:'); return true; }
      data.ticketPrice = price;
      setSession(userId, { step: 'create_lottery_max_tickets', data });
      await ctx.reply('5️⃣ Maksimal biletlar sonini kiriting (masalan: 100):', { reply_markup: cancelKeyboard });
      return true;
    }
    case 'create_lottery_max_tickets': {
      const max = parseInt(text);
      if (isNaN(max) || max < 2) { await ctx.reply('❌ Kamida 2 ta bilet bo\'lishi kerak:'); return true; }
      data.maxTickets = max;
      const channels = await Channel.find();
      if (channels.length === 0) {
        await ctx.reply('❌ Hech qanday kanal qo\'shilmagan.\n"📢 Kanallar" bo\'limidan avval kanal qo\'shing.', { reply_markup: adminKeyboard });
        clearSession(userId);
        return true;
      }
      setSession(userId, { step: 'create_lottery_channel', data });
      const kb = await channelSelectKeyboard(channels);
      await ctx.reply('6️⃣ Lotereyani e\'lon qilish uchun kanal tanlang:', { reply_markup: kb });
      return true;
    }
    default:
      return false;
  }
}

async function handleChannelSelect(ctx, bot, channelChatId) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session || session.step !== 'create_lottery_channel') {
    await ctx.answerCallbackQuery('❌ Sessiya muddati o\'tdi.');
    return;
  }
  session.data.channelId = channelChatId;
  clearSession(userId);

  try {
    await ctx.answerCallbackQuery('⏳ Lotereya yaratilmoqda...');
    await ctx.editMessageText('⏳ <b>Lotereya yaratilmoqda...</b>', { parse_mode: 'HTML' });
    const lottery = await createLottery(bot, userId, session.data);
    await ctx.reply(
      `✅ <b>Lotereya muvaffaqiyatli yaratildi!</b>\n\n` +
      `🎰 Raqam: <b>№${lottery.number}</b>\n` +
      `🎁 Sovg'a: ${escapeHtml(lottery.giftName)}\n` +
      `⭐ Qiymati: ${lottery.giftValue} Stars\n` +
      `🎟 Bilet narxi: ${lottery.ticketPrice} Stars\n` +
      `📈 Maksimal: ${lottery.maxTickets} ta bilet`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard }
    );
    await writeLog('admin', 'Admin lotereya yaratdi', { userId, lotteryNum: lottery.number });
  } catch (err) {
    await ctx.reply(`❌ Xato: ${err.message}`, { reply_markup: adminKeyboard });
    await writeLog('error', 'Lotereya yaratishda xato', { err: err.message });
  }
}

async function showActiveLotteriesAdmin(ctx) {
  try {
    const lotteries = await Lottery.find({ status: { $in: ['active', 'paused'] } }).sort({ createdAt: -1 });
    if (lotteries.length === 0) {
      await ctx.reply('📋 Faol lotereyalar yo\'q.', { reply_markup: adminKeyboard });
      return;
    }
    await ctx.reply(`📋 <b>Faol lotereyalar (${lotteries.length} ta)</b>`, { parse_mode: 'HTML', reply_markup: adminKeyboard });
    for (const l of lotteries) {
      const text =
        `🎰 <b>№${l.number}</b> — ${escapeHtml(l.giftName)}\n` +
        `⭐ ${l.giftValue} Stars | 🎟 ${l.ticketPrice}/bilet\n` +
        `📈 ${l.soldTickets}/${l.maxTickets} bilet | 👥 ${l.participants} ishtirokchi\n` +
        `📅 ${formatDate(l.startedAt)}\n` +
        `⏳ ${l.status === 'active' ? '🟢 Faol' : '⏸ To\'xtatilgan'}`;
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: lotteryAdminKeyboard(l) });
    }
  } catch (err) {
    await writeLog('error', 'showActiveLotteriesAdmin xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showFinishedLotteries(ctx, page = 0) {
  try {
    const total = await Lottery.countDocuments({ status: { $in: ['finished', 'cancelled'] } });
    if (total === 0) { await ctx.reply('📦 Yakunlangan lotereyalar yo\'q.', { reply_markup: adminKeyboard }); return; }

    const lotteries = await Lottery.find({ status: { $in: ['finished', 'cancelled'] } })
      .sort({ finishedAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE);

    let text = `📦 <b>Yakunlangan lotereyalar</b> (${total} ta)\n\n`;
    for (const l of lotteries) {
      const winner = await Winner.findOne({ lotteryId: l._id });
      const wName = winner ? (winner.username ? `@${winner.username}` : escapeHtml(winner.firstName || '—')) : '—';
      text += `🎰 <b>№${l.number}</b> — ${escapeHtml(l.giftName)}\n🏆 G'olib: ${wName} | 📅 ${formatDate(l.finishedAt)}\n\n`;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const kb = totalPages > 1 ? paginationKeyboard(page, totalPages, 'finished_page') : undefined;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err) {
    await writeLog('error', 'showFinishedLotteries xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function handleLotteryAction(ctx, bot, action, lotteryId) {
  try {
    const lottery = await Lottery.findById(lotteryId);
    if (!lottery) { await ctx.answerCallbackQuery('❌ Lotereya topilmadi.'); return; }

    if (action === 'lottery_pause') {
      if (lottery.status !== 'active') { await ctx.answerCallbackQuery('❌ Faqat faol lotereyani to\'xtatish mumkin.'); return; }
      await Lottery.findByIdAndUpdate(lotteryId, { status: 'paused' });
      await ctx.answerCallbackQuery('⏸ Lotereya to\'xtatildi.');
      await ctx.editMessageText(`⏸ <b>№${lottery.number} Lotereya to'xtatildi.</b>`, { parse_mode: 'HTML' });
      await writeLog('admin', 'Lotereya to\'xtatildi', { lotteryNum: lottery.number });
    }

    else if (action === 'lottery_resume') {
      if (lottery.status !== 'paused') { await ctx.answerCallbackQuery('❌ Faqat to\'xtatilgan lotereyani davom ettirish mumkin.'); return; }
      await Lottery.findByIdAndUpdate(lotteryId, { status: 'active' });
      await ctx.answerCallbackQuery('▶️ Lotereya davom ettirildi.');
      await ctx.editMessageText(`▶️ <b>№${lottery.number} Lotereya davom ettirildi.</b>`, { parse_mode: 'HTML' });
      await writeLog('admin', 'Lotereya davom ettirildi', { lotteryNum: lottery.number });
    }

    else if (action === 'lottery_cancel') {
      await Lottery.findByIdAndUpdate(lotteryId, { status: 'cancelled', finishedAt: new Date() });
      await ctx.answerCallbackQuery('❌ Lotereya bekor qilindi.');
      await ctx.editMessageText(`❌ <b>№${lottery.number} Lotereya bekor qilindi.</b>`, { parse_mode: 'HTML' });
      const updated = await Lottery.findById(lotteryId);
      const { updateLotteryPost } = require('./lottery');
      await updateLotteryPost(bot, updated);
      await writeLog('admin', 'Lotereya bekor qilindi', { lotteryNum: lottery.number });
    }

    else if (action === 'lottery_finish') {
      if (lottery.soldTickets === 0) { await ctx.answerCallbackQuery('❌ Birorta bilet sotilmagan.'); return; }
      await ctx.answerCallbackQuery('🏆 G\'olib tanlanmoqda...');
      await ctx.editMessageText('⏳ <b>G\'olib tanlanmoqda...</b>', { parse_mode: 'HTML' });
      const result = await selectWinner(bot, lotteryId, ctx.from.id);
      const wName = result.winnerUser
        ? ([result.winnerUser.firstName, result.winnerUser.lastName].filter(Boolean).join(' ') || result.winnerUser.username || '—')
        : result.winnerTicket.userName || '—';
      await ctx.reply(
        `🏆 <b>G'olib tanlandi!</b>\n\n👤 ${escapeHtml(wName)}\n🎟 Bilet: #${result.winnerTicket.ticketNumber}\n🎁 Sovg'a: ${escapeHtml(lottery.giftName)}`,
        { parse_mode: 'HTML', reply_markup: adminKeyboard }
      );
    }

    else if (action === 'lottery_participants') {
      const tickets = await Ticket.find({ lotteryId: lottery._id });
      const uIds = [...new Set(tickets.map(t => t.userId))];
      const users = await User.find({ telegramId: { $in: uIds } });
      const userMap = Object.fromEntries(users.map(u => [u.telegramId, u]));

      let text = `👥 <b>№${lottery.number} — Ishtirokchilar (${uIds.length} ta)</b>\n\n`;
      uIds.slice(0, 50).forEach((uid, i) => {
        const u = userMap[uid];
        const name = u ? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || String(uid)) : String(uid);
        const count = tickets.filter(t => t.userId === uid).length;
        text += `${i + 1}. ${escapeHtml(name)} — ${count} ta bilet\n`;
      });
      if (uIds.length > 50) text += `\n... va yana ${uIds.length - 50} ta`;
      await ctx.answerCallbackQuery();
      await ctx.reply(text, { parse_mode: 'HTML' });
    }

    else if (action === 'lottery_tickets') {
      const tickets = await Ticket.find({ lotteryId: lottery._id }).sort({ ticketNumber: 1 }).limit(50);
      let text = `🎟 <b>№${lottery.number} — Biletlar (${lottery.soldTickets} ta)</b>\n\n`;
      tickets.forEach(t => {
        text += `#${t.ticketNumber}${t.isWinner ? ' 🏆' : ''} — ${escapeHtml(t.userName || String(t.userId))}\n`;
      });
      if (lottery.soldTickets > 50) text += `\n... va yana ${lottery.soldTickets - 50} ta bilet`;
      await ctx.answerCallbackQuery();
      await ctx.reply(text, { parse_mode: 'HTML' });
    }

  } catch (err) {
    await writeLog('error', 'handleLotteryAction xatosi', { action, err: err.message });
    try { await ctx.answerCallbackQuery('❌ Xato yuz berdi.'); } catch {}
  }
}

async function showUsers(ctx, page = 0) {
  try {
    const total = await User.countDocuments();
    const users = await User.find().sort({ joinedAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE);

    let text = `👥 <b>Foydalanuvchilar</b> (${total} ta)\n\n`;
    users.forEach((u, i) => {
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || String(u.telegramId);
      text += `${page * PAGE_SIZE + i + 1}. ${escapeHtml(name)}${u.isBlocked ? ' 🚫' : ''}${u.isAdmin ? ' 👑' : ''}\n`;
      text += `   🆔 <code>${u.telegramId}</code> | 🎟 ${u.totalTickets} ta | 👥 ${u.confirmedReferrals || 0} referral\n`;
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const kb = totalPages > 1 ? paginationKeyboard(page, totalPages, 'users_page') : undefined;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err) {
    await writeLog('error', 'showUsers xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showStats(ctx) {
  try {
    const [totalUsers, totalLotteries, activeLotteries, finishedLotteries, totalTickets, totalPayments] = await Promise.all([
      User.countDocuments(),
      Lottery.countDocuments(),
      Lottery.countDocuments({ status: 'active' }),
      Lottery.countDocuments({ status: 'finished' }),
      Ticket.countDocuments(),
      Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    const text =
      `📊 <b>Statistika</b>\n\n` +
      `👥 <b>Foydalanuvchilar:</b> ${totalUsers}\n\n` +
      `🎰 <b>Lotereyalar:</b>\n   Jami: ${totalLotteries}\n   Faol: ${activeLotteries}\n   Yakunlangan: ${finishedLotteries}\n\n` +
      `🎟 <b>Biletlar jami:</b> ${totalTickets}\n` +
      `⭐ <b>Jami to'langan Stars:</b> ${totalPayments[0]?.total || 0}\n\n` +
      `📅 Hisobot: ${formatDate(new Date())}`;

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  } catch (err) {
    await writeLog('error', 'showStats xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showPayments(ctx, page = 0) {
  try {
    const total = await Payment.countDocuments({ status: 'success' });
    const payments = await Payment.find({ status: 'success' }).sort({ paidAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE);

    let text = `💳 <b>To'lovlar tarixi</b> (${total} ta)\n\n`;
    payments.forEach(p => {
      text += `🆔 <code>${p.userId}</code>\n🎰 №${p.lotteryNum} | 🎟 #${p.ticketNumber} | ⭐ ${p.amount}\n📅 ${formatDate(p.paidAt)}\n\n`;
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const kb = totalPages > 1 ? paginationKeyboard(page, totalPages, 'payments_page') : undefined;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err) {
    await writeLog('error', 'showPayments xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function startBroadcast(ctx) {
  setSession(ctx.from.id, { step: 'broadcast_message', data: {} });
  await ctx.reply(
    '📢 <b>Broadcast xabar</b>\n\nBarcha foydalanuvchilarga yuboriladigan xabarni kiriting:',
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
  );
}

async function handleBroadcastMessage(ctx, bot) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session || session.step !== 'broadcast_message') return false;
  clearSession(userId);

  const users = await User.find({ isBlocked: false }).select('telegramId');
  let sent = 0, failed = 0;
  await ctx.reply(`⏳ ${users.length} ta foydalanuvchiga yuborilmoqda...`);

  for (const u of users) {
    try {
      if (ctx.message.photo) {
        await bot.api.sendPhoto(u.telegramId, ctx.message.photo[ctx.message.photo.length - 1].file_id, {
          caption: ctx.message.caption || '', parse_mode: 'HTML',
        });
      } else {
        await bot.api.sendMessage(u.telegramId, ctx.message.text, { parse_mode: 'HTML' });
      }
      sent++;
      if (sent % 30 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch { failed++; }
  }

  await ctx.reply(`✅ Broadcast yakunlandi!\n\n✅ Yuborildi: ${sent}\n❌ Xato: ${failed}`, { reply_markup: adminKeyboard });
  await writeLog('admin', 'Broadcast yuborildi', { adminId: userId, sent, failed });
  return true;
}

async function startAd(ctx) {
  setSession(ctx.from.id, { step: 'ad_message', data: {} });
  await ctx.reply('📣 <b>Reklama yuborish</b>\n\nReklama xabarini kiriting:', { parse_mode: 'HTML', reply_markup: cancelKeyboard });
}

async function showChannels(ctx) {
  try {
    const channels = await Channel.find();
    let text = `📢 <b>Kanallar (${channels.length} ta)</b>\n\n`;
    channels.forEach((ch, i) => {
      text += `${i + 1}. ${ch.title || ch.username}\n   Username: ${ch.username}\n   ID: <code>${ch.chatId}</code>\n\n`;
    });
    text += 'Yangi kanal qo\'shish uchun username yuboring (@channel):';
    setSession(ctx.from.id, { step: 'add_channel', data: {} });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: cancelKeyboard });
  } catch (err) {
    await writeLog('error', 'showChannels xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function handleAddChannel(ctx, bot) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session || session.step !== 'add_channel') return false;

  const text = ctx.message?.text?.trim() || '';
  if (!text.startsWith('@')) { await ctx.reply('❌ Kanal username @ bilan boshlanishi kerak. Masalan: @mychannel'); return true; }

  clearSession(userId);

  try {
    const chat = await bot.api.getChat(text);
    const inviteLink = chat.invite_link || `https://t.me/${text.replace('@', '')}`;
    await Channel.findOneAndUpdate(
      { chatId: String(chat.id) },
      { username: text, chatId: String(chat.id), title: chat.title || text, inviteLink, addedBy: userId },
      { upsert: true, new: true }
    );
    await ctx.reply(`✅ Kanal qo'shildi!\n\n${chat.title || text} — <code>${chat.id}</code>`, {
      parse_mode: 'HTML', reply_markup: adminKeyboard,
    });
    await writeLog('admin', 'Kanal qo\'shildi', { username: text, chatId: chat.id });
  } catch {
    await ctx.reply('❌ Kanalni topib bo\'lmadi.\n\nBot kanalga admin sifatida qo\'shilganligini tekshiring.', { reply_markup: adminKeyboard });
  }
  return true;
}

async function showAdmins(ctx) {
  try {
    const admins = await User.find({ isAdmin: true });
    let text = `👑 <b>Adminlar ro'yxati</b>\n\n`;
    admins.forEach((a, i) => {
      const name = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username || String(a.telegramId);
      text += `${i + 1}. ${escapeHtml(name)} — <code>${a.telegramId}</code>\n`;
    });
    text += '\nAdmin qo\'shish uchun Telegram ID yuboring:';
    setSession(ctx.from.id, { step: 'add_admin', data: {} });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: cancelKeyboard });
  } catch (err) {
    await writeLog('error', 'showAdmins xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function handleAddAdmin(ctx) {
  const userId = ctx.from.id;
  const session = getSession(userId);
  if (!session || session.step !== 'add_admin') return false;

  const targetId = parseInt(ctx.message?.text?.trim());
  if (isNaN(targetId)) { await ctx.reply('❌ Noto\'g\'ri ID. Raqam kiriting:'); return true; }

  clearSession(userId);
  await User.findOneAndUpdate({ telegramId: targetId }, { $set: { isAdmin: true } }, { upsert: true });
  await ctx.reply(`✅ <code>${targetId}</code> adminlikka qo'shildi.`, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  await writeLog('admin', 'Admin qo\'shildi', { targetId, addedBy: userId });
  return true;
}

async function showSubscriptionSettings(ctx) {
  try {
    const channels = await Channel.find();
    let text = `🔒 <b>Majburiy obuna kanallari</b>\n\n`;
    if (channels.length === 0) {
      text += 'Hech qanday kanal yo\'q.\n\n';
    } else {
      channels.forEach((ch, i) => { text += `${i + 1}. ${ch.title || ch.username} (${ch.username})\n`; });
    }
    text += '\nKanal qo\'shish/o\'chirish uchun "📢 Kanallar" bo\'limidan foydalaning.';
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  } catch (err) {
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showLogs(ctx) {
  try {
    const logs = await Log.find().sort({ at: -1 }).limit(20);
    if (logs.length === 0) { await ctx.reply('📝 Loglar bo\'sh.', { reply_markup: adminKeyboard }); return; }

    let text = `📝 <b>Oxirgi 20 ta log</b>\n\n`;
    logs.forEach(l => {
      const emoji = { info: 'ℹ️', warn: '⚠️', error: '❌', payment: '💳', admin: '👑' }[l.level] || '📌';
      text += `${emoji} [${l.level}] ${formatDate(l.at)}\n${escapeHtml(l.message)}\n\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: adminKeyboard });
  } catch (err) {
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function sendBackup(ctx) {
  try {
    const [users, lotteries, winners, payments] = await Promise.all([
      User.countDocuments(), Lottery.countDocuments(),
      Winner.countDocuments(), Payment.countDocuments({ status: 'success' }),
    ]);
    const backup = { generatedAt: new Date().toISOString(), stats: { users, lotteries, winners, payments } };
    const buf = Buffer.from(JSON.stringify(backup, null, 2), 'utf-8');
    await ctx.replyWithDocument(
      { source: buf, filename: `backup_${Date.now()}.json` },
      { caption: '🗂 <b>Backup yaratildi</b>', parse_mode: 'HTML' }
    );
    await writeLog('admin', 'Backup yuklandi', { adminId: ctx.from.id });
  } catch (err) {
    await writeLog('error', 'sendBackup xatosi', { err: err.message });
    await ctx.reply('❌ Backup yaratishda xato.');
  }
}

async function startSelectWinner(ctx) {
  const lotteries = await Lottery.find({ status: 'active', soldTickets: { $gt: 0 } });
  if (lotteries.length === 0) { await ctx.reply('🏆 Bilet sotilgan faol lotereyalar yo\'q.', { reply_markup: adminKeyboard }); return; }
  let text = '🏆 <b>G\'olib tanlash</b>\n\nLotereya raqamini kiriting:\n\n';
  lotteries.forEach(l => { text += `№${l.number} — ${escapeHtml(l.giftName)} (${l.soldTickets} bilet)\n`; });
  setSession(ctx.from.id, { step: 'select_winner_num', data: {} });
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: cancelKeyboard });
}

async function handleSelectWinnerNum(ctx, bot) {
  const session = getSession(ctx.from.id);
  if (!session || session.step !== 'select_winner_num') return false;

  const num = parseInt(ctx.message?.text?.trim());
  if (isNaN(num)) { await ctx.reply('❌ Noto\'g\'ri raqam:'); return true; }

  clearSession(ctx.from.id);
  const lottery = await Lottery.findOne({ number: num });
  if (!lottery) { await ctx.reply('❌ Bunday raqamdagi lotereya topilmadi.', { reply_markup: adminKeyboard }); return true; }

  try {
    await ctx.reply('⏳ G\'olib tanlanmoqda...');
    const result = await selectWinner(bot, lottery._id, ctx.from.id);
    const wName = result.winnerUser
      ? ([result.winnerUser.firstName, result.winnerUser.lastName].filter(Boolean).join(' ') || String(result.winnerTicket.userId))
      : String(result.winnerTicket.userId);
    await ctx.reply(
      `🏆 <b>G'olib tanlandi!</b>\n\n👤 ${escapeHtml(wName)}\n🎟 #${result.winnerTicket.ticketNumber}`,
      { parse_mode: 'HTML', reply_markup: adminKeyboard }
    );
  } catch (err) {
    await ctx.reply(`❌ Xato: ${err.message}`, { reply_markup: adminKeyboard });
  }
  return true;
}

async function startFinishLottery(ctx) {
  const lotteries = await Lottery.find({ status: { $in: ['active', 'paused'] } });
  if (lotteries.length === 0) { await ctx.reply('❌ Tugatish uchun faol lotereya yo\'q.', { reply_markup: adminKeyboard }); return; }
  let text = '❌ <b>Lotereyani tugatish</b>\n\nLotereya raqamini kiriting:\n\n';
  lotteries.forEach(l => { text += `№${l.number} — ${escapeHtml(l.giftName)}\n`; });
  setSession(ctx.from.id, { step: 'finish_lottery_num', data: {} });
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: cancelKeyboard });
}

async function handleFinishLotteryNum(ctx, bot) {
  const session = getSession(ctx.from.id);
  if (!session || session.step !== 'finish_lottery_num') return false;

  const num = parseInt(ctx.message?.text?.trim());
  clearSession(ctx.from.id);
  if (isNaN(num)) { await ctx.reply('❌ Noto\'g\'ri raqam.', { reply_markup: adminKeyboard }); return true; }

  const lottery = await Lottery.findOneAndUpdate(
    { number: num, status: { $in: ['active', 'paused'] } },
    { status: 'cancelled', finishedAt: new Date() },
    { new: true }
  );
  if (!lottery) { await ctx.reply('❌ Faol lotereya topilmadi.', { reply_markup: adminKeyboard }); return true; }

  const { updateLotteryPost } = require('./lottery');
  await updateLotteryPost(bot, lottery);
  await ctx.reply(`✅ №${lottery.number} Lotereya tugatildi.`, { reply_markup: adminKeyboard });
  await writeLog('admin', 'Lotereya tugatildi', { num, adminId: ctx.from.id });
  return true;
}

module.exports = {
  sendAdminMenu, getSession, setSession, clearSession,
  startCreateLottery, handleCreateLotteryStep, handleChannelSelect,
  showActiveLotteriesAdmin, showFinishedLotteries, handleLotteryAction,
  showUsers, showStats, showPayments,
  startBroadcast, handleBroadcastMessage, startAd,
  showChannels, handleAddChannel,
  showAdmins, handleAddAdmin,
  showSubscriptionSettings, showLogs, sendBackup,
  startSelectWinner, handleSelectWinnerNum,
  startFinishLottery, handleFinishLotteryNum,
};
