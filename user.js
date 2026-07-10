const { Lottery, Ticket, Payment, Winner, User } = require('./schema');
const { writeLog } = require('./database');
const { formatDate, escapeHtml, progressBar, getReferralLink } = require('./functions');
const { userKeyboard, lotteryBuyKeyboard, paginationKeyboard } = require('./keyboards');
const { sendStarsInvoice } = require('./payment');

const PAGE_SIZE = 5;

async function sendUserMenu(ctx) {
  await ctx.reply(
    `👋 <b>Xush kelibsiz, ${escapeHtml(ctx.from.first_name || 'Do\'stim')}!</b>\n\n` +
    `🎰 <b>NFT Lotereya Botiga xush kelibsiz!</b>\n\nQuyidagi menyudan kerakli bo'limni tanlang:`,
    { parse_mode: 'HTML', reply_markup: userKeyboard }
  );
}

async function showActiveLotteries(ctx) {
  try {
    const lotteries = await Lottery.find({ status: 'active' }).sort({ createdAt: -1 });
    if (lotteries.length === 0) {
      await ctx.reply('😔 Hozircha faol lotereyalar yo\'q.', { reply_markup: userKeyboard });
      return;
    }
    await ctx.reply(`🎰 <b>Faol lotereyalar (${lotteries.length} ta)</b>`, { parse_mode: 'HTML', reply_markup: userKeyboard });
    for (const lottery of lotteries) {
      const bar = progressBar(lottery.soldTickets, lottery.maxTickets);
      const text =
        `🎰 <b>№${lottery.number} LOTEREYA</b>\n\n` +
        `🎁 <b>Sovg'a:</b> ${escapeHtml(lottery.giftName)}\n` +
        `⭐ <b>Qiymati:</b> ${lottery.giftValue} Stars\n` +
        `🎟 <b>Bilet narxi:</b> ${lottery.ticketPrice} ⭐\n\n` +
        `📈 Sotilgan: ${lottery.soldTickets}/${lottery.maxTickets}\n${bar}\n` +
        `👥 Ishtirokchilar: ${lottery.participants}\n` +
        `📅 Boshlangan: ${formatDate(lottery.startedAt)}`;

      if (lottery.photoFileId) {
        await ctx.replyWithPhoto(lottery.photoFileId, { caption: text, parse_mode: 'HTML', reply_markup: lotteryBuyKeyboard(lottery) });
      } else {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: lotteryBuyKeyboard(lottery) });
      }
    }
  } catch (err) {
    await writeLog('error', 'showActiveLotteries xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showMyTickets(ctx, page = 0) {
  try {
    const userId = ctx.from.id;
    const total = await Ticket.countDocuments({ userId });
    if (total === 0) {
      await ctx.reply('🎟 Sizda hali bilet yo\'q.', { reply_markup: userKeyboard });
      return;
    }
    const tickets = await Ticket.find({ userId }).sort({ boughtAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE);
    const lotteries = await Lottery.find({ _id: { $in: [...new Set(tickets.map(t => t.lotteryId.toString()))] } });
    const lotteryMap = Object.fromEntries(lotteries.map(l => [l._id.toString(), l]));

    let text = `🎟 <b>Mening biletlarim</b> (${total} ta)\n\n`;
    tickets.forEach(t => {
      const l = lotteryMap[t.lotteryId.toString()];
      const winMark = t.isWinner ? ' 🏆' : '';
      const lStatus = l ? ` [${l.status === 'active' ? '🟢' : '🏁'}]` : '';
      text += `#${t.ticketNumber}${winMark} — №${t.lotteryNum} Lotereya${lStatus}\n   📅 ${formatDate(t.boughtAt)}\n`;
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const kb = totalPages > 1 ? paginationKeyboard(page, totalPages, 'my_tickets_page') : undefined;

    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err) {
    await writeLog('error', 'showMyTickets xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showLastWinners(ctx) {
  try {
    const winners = await Winner.find().sort({ wonAt: -1 }).limit(10);
    if (winners.length === 0) {
      await ctx.reply('🏆 Hali g\'olib aniqlanmagan.', { reply_markup: userKeyboard });
      return;
    }
    let text = `🏆 <b>Oxirgi g'oliblar</b>\n\n`;
    winners.forEach((w, i) => {
      const name = w.username ? `@${w.username}` : escapeHtml(w.firstName || 'Noma\'lum');
      text += `${i + 1}. ${name}\n   🎰 №${w.lotteryNum} | 🎟 #${w.ticketNumber}\n   🎁 ${escapeHtml(w.giftName)} (${w.giftValue} ⭐)\n   📅 ${formatDate(w.wonAt)}\n\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: userKeyboard });
  } catch (err) {
    await writeLog('error', 'showLastWinners xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showProfile(ctx) {
  try {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) { await ctx.reply('❌ Profil topilmadi. /start ni bosing.'); return; }

    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Noma\'lum';
    const text =
      `👤 <b>Mening profilim</b>\n\n` +
      `👋 <b>Ism:</b> ${escapeHtml(name)}\n` +
      `🔗 <b>Username:</b> ${user.username ? `@${user.username}` : '—'}\n` +
      `🆔 <b>Telegram ID:</b> <code>${user.telegramId}</code>\n\n` +
      `🎟 <b>Jami biletlar:</b> ${user.totalTickets}\n` +
      `🟢 <b>Faol biletlar:</b> ${user.activeTickets}\n` +
      `🏆 <b>Yutgan lotereyalar:</b> ${user.totalWins}\n` +
      `⭐ <b>Jami to'langan:</b> ${user.totalSpent} Stars\n\n` +
      `👥 <b>Taklif qilingan do'stlar:</b> ${user.confirmedReferrals || 0} ta\n` +
      `🍀 <i>Har bir do'stingiz kanalga obuna bo'lib qolsa, yutish ehtimolingiz oshadi!</i>\n` +
      `🔗 <b>Sizning referral havolangiz:</b>\n<code>${getReferralLink(user.telegramId)}</code>\n\n` +
      `📅 <b>Ro'yxatdan o'tgan:</b> ${formatDate(user.joinedAt)}`;

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: userKeyboard });
  } catch (err) {
    await writeLog('error', 'showProfile xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showMyPayments(ctx, page = 0) {
  try {
    const userId = ctx.from.id;
    const total = await Payment.countDocuments({ userId, status: 'success' });
    if (total === 0) { await ctx.reply('💳 Hali to\'lovlar mavjud emas.', { reply_markup: userKeyboard }); return; }

    const payments = await Payment.find({ userId, status: 'success' }).sort({ paidAt: -1 }).skip(page * PAGE_SIZE).limit(PAGE_SIZE);
    let text = `⭐ <b>Mening to'lovlarim</b> (${total} ta)\n\n`;
    payments.forEach(p => {
      text += `🎰 №${p.lotteryNum} — 🎟 #${p.ticketNumber}\n⭐ ${p.amount} Stars | 📅 ${formatDate(p.paidAt)}\n\n`;
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const kb = totalPages > 1 ? paginationKeyboard(page, totalPages, 'my_payments_page') : undefined;
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }
  } catch (err) {
    await writeLog('error', 'showMyPayments xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showHistory(ctx) {
  try {
    const finished = await Lottery.find({ status: 'finished' }).sort({ finishedAt: -1 }).limit(10);
    if (finished.length === 0) { await ctx.reply('📜 Hali yakunlangan lotereyalar yo\'q.', { reply_markup: userKeyboard }); return; }

    let text = `📜 <b>Yakunlangan lotereyalar</b>\n\n`;
    for (const l of finished) {
      const winner = await Winner.findOne({ lotteryId: l._id });
      const wName = winner ? (winner.username ? `@${winner.username}` : escapeHtml(winner.firstName || '—')) : '—';
      text += `🎰 <b>№${l.number}</b> — ${escapeHtml(l.giftName)}\n🏆 G'olib: ${wName} (#${winner?.ticketNumber || '—'})\n📅 ${formatDate(l.finishedAt)}\n\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: userKeyboard });
  } catch (err) {
    await writeLog('error', 'showHistory xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function showHelp(ctx) {
  await ctx.reply(
    `❓ <b>Yordam</b>\n\n` +
    `<b>Qanday bilet sotib olish mumkin?</b>\n` +
    `1. 🎰 Faol lotereyalar bo'limiga o'ting\n` +
    `2. Lotereyani tanlang\n` +
    `3. "Bilet sotib olish" tugmasini bosing\n` +
    `4. Telegram Stars orqali to'lov qiling\n\n` +
    `<b>G'olib qanday tanlanadi?</b>\n` +
    `Barcha biletlar sotilgach yoki admin tomonidan g'olib tasodifiy tanlanadi.\n\n` +
    `📞 Savollar bo'lsa — <b>Admin</b> tugmasini bosing.`,
    { parse_mode: 'HTML', reply_markup: userKeyboard }
  );
}

async function showAdminContact(ctx) {
  await ctx.reply(
    `📞 <b>Admin bilan bog'lanish</b>\n\nSavollaringiz bo'lsa adminga murojaat qiling.\n\n✉️ Xabaringizni yozing — admin imkon qadar javob beradi.`,
    { parse_mode: 'HTML', reply_markup: userKeyboard }
  );
}

async function showGifts(ctx) {
  try {
    const winners = await Winner.find().sort({ wonAt: -1 }).limit(20);
    if (winners.length === 0) { await ctx.reply('🎁 Hali sovg\'a tarqatilmagan.', { reply_markup: userKeyboard }); return; }

    let text = `🎁 <b>Tarqatilgan sovg'alar</b>\n\n`;
    winners.forEach((w, i) => {
      text += `${i + 1}. <b>${escapeHtml(w.giftName)}</b> (${w.giftValue} ⭐)\n   🎰 №${w.lotteryNum} | 📅 ${formatDate(w.wonAt)}\n\n`;
    });
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: userKeyboard });
  } catch (err) {
    await writeLog('error', 'showGifts xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.');
  }
}

async function buyTicketCore(ctx, lotteryId) {
  const lottery = await Lottery.findById(lotteryId);
  if (!lottery || lottery.status !== 'active') { throw new Error('NOT_ACTIVE'); }
  if (lottery.soldTickets >= lottery.maxTickets) { throw new Error('SOLD_OUT'); }
  await sendStarsInvoice(ctx, ctx.from.id, lottery);
}

async function handleBuyTicket(ctx, lotteryId) {
  try {
    await buyTicketCore(ctx, lotteryId);
    await ctx.answerCallbackQuery();
  } catch (err) {
    const msg = err.message === 'NOT_ACTIVE' ? '❌ Bu lotereya faol emas.'
      : err.message === 'SOLD_OUT' ? '❌ Barcha biletlar sotilgan!'
      : '❌ Xato yuz berdi.';
    if (err.message !== 'NOT_ACTIVE' && err.message !== 'SOLD_OUT') {
      await writeLog('error', 'handleBuyTicket xatosi', { err: err.message });
    }
    await ctx.answerCallbackQuery(msg);
  }
}

// Kanal postidagi "Bilet sotib olish" tugmasi orqali /start deep-link bilan
// kelgan foydalanuvchi uchun — to'g'ridan-to'g'ri to'lov oynasini ochadi.
async function handleBuyTicketFromStart(ctx, lotteryId) {
  try {
    await buyTicketCore(ctx, lotteryId);
  } catch (err) {
    const msg = err.message === 'NOT_ACTIVE' ? '❌ Bu lotereya hozir faol emas.'
      : err.message === 'SOLD_OUT' ? '❌ Afsuski, barcha biletlar sotilgan!'
      : '❌ Xato yuz berdi, birozdan so\'ng qayta urinib ko\'ring.';
    if (err.message !== 'NOT_ACTIVE' && err.message !== 'SOLD_OUT') {
      await writeLog('error', 'handleBuyTicketFromStart xatosi', { err: err.message });
    }
    await ctx.reply(msg, { reply_markup: userKeyboard });
  }
}

async function buildLotteryDetailText(ctx, lotteryId) {
  const lottery = await Lottery.findById(lotteryId);
  if (!lottery) return null;
  const userTickets = await Ticket.countDocuments({ lotteryId: lottery._id, userId: ctx.from.id });
  const bar = progressBar(lottery.soldTickets, lottery.maxTickets);
  const text =
    `🎰 <b>№${lottery.number} LOTEREYA — Batafsil</b>\n\n` +
    `🎁 <b>Sovg'a:</b> ${escapeHtml(lottery.giftName)}\n` +
    `⭐ <b>Qiymati:</b> ${lottery.giftValue} Stars\n` +
    `🎟 <b>Bilet narxi:</b> ${lottery.ticketPrice} ⭐\n\n` +
    `📈 <b>Holat:</b>\n${bar}\n   Sotilgan: ${lottery.soldTickets} / ${lottery.maxTickets}\n` +
    `👥 Ishtirokchilar: ${lottery.participants}\n\n` +
    `🎟 <b>Sizning biletlaringiz:</b> ${userTickets} ta\n` +
    `📅 <b>Boshlangan:</b> ${formatDate(lottery.startedAt)}`;
  return { lottery, text };
}

async function handleLotteryDetail(ctx, lotteryId) {
  try {
    const result = await buildLotteryDetailText(ctx, lotteryId);
    if (!result) { await ctx.answerCallbackQuery('❌ Lotereya topilmadi.'); return; }
    await ctx.answerCallbackQuery();
    await ctx.reply(result.text, { parse_mode: 'HTML', reply_markup: lotteryBuyKeyboard(result.lottery) });
  } catch (err) {
    await writeLog('error', 'handleLotteryDetail xatosi', { err: err.message });
    await ctx.answerCallbackQuery('❌ Xato yuz berdi.');
  }
}

// Kanal postidagi "Batafsil" tugmasi orqali /start deep-link bilan kelganda.
async function handleLotteryDetailFromStart(ctx, lotteryId) {
  try {
    const result = await buildLotteryDetailText(ctx, lotteryId);
    if (!result) { await ctx.reply('❌ Lotereya topilmadi.', { reply_markup: userKeyboard }); return; }
    await ctx.reply(result.text, { parse_mode: 'HTML', reply_markup: lotteryBuyKeyboard(result.lottery) });
  } catch (err) {
    await writeLog('error', 'handleLotteryDetailFromStart xatosi', { err: err.message });
    await ctx.reply('❌ Xato yuz berdi.', { reply_markup: userKeyboard });
  }
}

module.exports = {
  sendUserMenu, showActiveLotteries, showMyTickets, showLastWinners,
  showProfile, showMyPayments, showHistory, showHelp,
  showAdminContact, showGifts, handleBuyTicket, handleLotteryDetail,
  handleBuyTicketFromStart, handleLotteryDetailFromStart,
};
