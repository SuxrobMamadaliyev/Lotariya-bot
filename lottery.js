const { Lottery, Ticket, Winner, History, User } = require('./schema');
const { writeLog } = require('./database');
const { randomInt, formatDate, escapeHtml, progressBar } = require('./functions');
const { lotteryCardKeyboard, lotteryAdminKeyboard } = require('./keyboards');

async function getNextLotteryNumber() {
  const last = await Lottery.findOne().sort({ number: -1 });
  return last ? last.number + 1 : 1;
}

function buildPostText(lottery) {
  const statusEmoji = {
    active:    '🟢 Faol',
    paused:    '⏸ To\'xtatilgan',
    finished:  '🏁 Yakunlangan',
    cancelled: '❌ Bekor qilingan',
  }[lottery.status] || '❔';

  const bar = progressBar(lottery.soldTickets, lottery.maxTickets);
  return (
    `🎰 <b>№${lottery.number} LOTEREYA</b>\n\n` +
    `🎁 <b>Sovg'a:</b> ${escapeHtml(lottery.giftName)}\n` +
    `⭐ <b>Qiymati:</b> ${lottery.giftValue} Stars\n` +
    `🎟 <b>Bilet narxi:</b> ${lottery.ticketPrice} ⭐\n\n` +
    `📈 <b>Sotilgan biletlar:</b> ${lottery.soldTickets} / ${lottery.maxTickets}\n` +
    `${bar}\n` +
    `👥 <b>Ishtirokchilar:</b> ${lottery.participants}\n` +
    `⏳ <b>Holati:</b> ${statusEmoji}\n` +
    `📅 <b>Boshlangan:</b> ${formatDate(lottery.startedAt)}`
  );
}

async function sendLotteryPost(bot, lottery) {
  try {
    const text = buildPostText(lottery);
    const keyboard = lotteryCardKeyboard(lottery);
    let msg;
    if (lottery.photoFileId) {
      msg = await bot.api.sendPhoto(lottery.channelId, lottery.photoFileId, {
        caption: text, parse_mode: 'HTML', reply_markup: keyboard,
      });
    } else {
      msg = await bot.api.sendMessage(lottery.channelId, text, {
        parse_mode: 'HTML', reply_markup: keyboard,
      });
    }
    await Lottery.findByIdAndUpdate(lottery._id, { channelMsgId: msg.message_id });
    await writeLog('info', 'Kanal posti yuborildi', { lotteryNum: lottery.number });
    return msg;
  } catch (err) {
    await writeLog('error', 'Kanal postini yuborishda xato', { err: err.message });
    throw err;
  }
}

async function updateLotteryPost(bot, lottery) {
  if (!lottery.channelMsgId) return;
  try {
    const text = buildPostText(lottery);
    const kb = lottery.status === 'active' ? lotteryCardKeyboard(lottery) : undefined;
    if (lottery.photoFileId) {
      await bot.api.editMessageCaption(lottery.channelId, lottery.channelMsgId, {
        caption: text, parse_mode: 'HTML', reply_markup: kb,
      });
    } else {
      await bot.api.editMessageText(lottery.channelId, lottery.channelMsgId, text, {
        parse_mode: 'HTML', reply_markup: kb,
      });
    }
  } catch (err) {
    if (!err.message?.includes('not modified')) {
      await writeLog('warn', 'Kanal postini yangilashda xato', { err: err.message });
    }
  }
}

async function createLottery(bot, adminId, data) {
  try {
    const number = await getNextLotteryNumber();
    const lottery = await Lottery.create({
      number,
      giftName:    data.giftName,
      giftValue:   data.giftValue,
      ticketPrice: data.ticketPrice,
      maxTickets:  data.maxTickets,
      photoFileId: data.photoFileId || null,
      channelId:   data.channelId,
      createdBy:   adminId,
    });
    await sendLotteryPost(bot, lottery);
    await History.create({ type: 'lottery_created', userId: adminId, data: { lotteryNum: number } });
    await writeLog('admin', 'Lotereya yaratildi', { number, adminId });
    return lottery;
  } catch (err) {
    await writeLog('error', 'createLottery xatosi', { err: err.message });
    throw err;
  }
}

async function createTicket(bot, lotteryId, userId, userName, chargeId, amount) {
  try {
    const lottery = await Lottery.findById(lotteryId);
    if (!lottery) throw new Error('Lotereya topilmadi');
    if (lottery.status !== 'active') throw new Error('Lotereya faol emas');

    const lastTicket = await Ticket.findOne({ lotteryId }).sort({ ticketNumber: -1 });
    const ticketNumber = lastTicket ? lastTicket.ticketNumber + 1 : 1;

    const ticket = await Ticket.create({
      lotteryId, lotteryNum: lottery.number,
      ticketNumber, userId, userName, paymentId: chargeId,
    });

    const participantCount = await Ticket.distinct('userId', { lotteryId });
    const updated = await Lottery.findByIdAndUpdate(
      lotteryId,
      { $inc: { soldTickets: 1 }, $set: { participants: participantCount.length } },
      { new: true }
    );

    await User.findOneAndUpdate(
      { telegramId: userId },
      { $inc: { totalTickets: 1, activeTickets: 1, totalSpent: amount } }
    );

    await updateLotteryPost(bot, updated);

    if (updated.soldTickets >= updated.maxTickets) {
      await autoFinishLottery(bot, updated);
    }

    await History.create({
      type: 'ticket_bought', userId,
      data: { lotteryNum: lottery.number, ticketNumber, amount },
    });
    await writeLog('payment', 'Bilet yaratildi', { lotteryNum: lottery.number, ticketNumber, userId, amount });

    return { ticket, lottery: updated };
  } catch (err) {
    await writeLog('error', 'createTicket xatosi', { err: err.message });
    throw err;
  }
}

async function selectWinner(bot, lotteryId, adminId = null) {
  try {
    const lottery = await Lottery.findById(lotteryId);
    if (!lottery) throw new Error('Lotereya topilmadi');
    if (lottery.soldTickets === 0) throw new Error('Birorta bilet sotilmagan');

    const tickets = await Ticket.find({ lotteryId });
    const winnerTicket = tickets[randomInt(0, tickets.length - 1)];
    const winnerUser = await User.findOne({ telegramId: winnerTicket.userId });

    await Winner.create({
      lotteryId, lotteryNum: lottery.number,
      userId:       winnerTicket.userId,
      firstName:    winnerUser?.firstName || winnerTicket.userName,
      username:     winnerUser?.username  || '',
      ticketNumber: winnerTicket.ticketNumber,
      giftName:     lottery.giftName,
      giftValue:    lottery.giftValue,
    });

    await Ticket.findByIdAndUpdate(winnerTicket._id, { isWinner: true });
    await Lottery.findByIdAndUpdate(lotteryId, {
      status: 'finished', winnerId: winnerTicket.userId,
      winnerTicket: winnerTicket.ticketNumber, finishedAt: new Date(),
    });
    await User.findOneAndUpdate({ telegramId: winnerTicket.userId }, { $inc: { totalWins: 1 } });

    const ticketCounts = await Ticket.aggregate([
      { $match: { lotteryId: lottery._id } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    for (const rec of ticketCounts) {
      await User.findOneAndUpdate(
        { telegramId: rec._id },
        { $inc: { activeTickets: -rec.count } }
      );
    }

    await announceWinner(bot, lottery, winnerTicket, winnerUser);
    await History.create({
      type: 'winner_selected', userId: adminId,
      data: { lotteryNum: lottery.number, winnerId: winnerTicket.userId, ticketNumber: winnerTicket.ticketNumber },
    });
    await writeLog('admin', 'G\'olib tanlandi', {
      lotteryNum: lottery.number, winnerId: winnerTicket.userId,
      ticketNumber: winnerTicket.ticketNumber,
    });

    return { lottery, winnerTicket, winnerUser };
  } catch (err) {
    await writeLog('error', 'selectWinner xatosi', { err: err.message });
    throw err;
  }
}

async function announceWinner(bot, lottery, winnerTicket, winnerUser) {
  try {
    const name = winnerUser
      ? ([winnerUser.firstName, winnerUser.lastName].filter(Boolean).join(' ') || winnerUser.username)
      : winnerTicket.userName || '—';

    const mention = `<a href="tg://user?id=${winnerTicket.userId}">${escapeHtml(name)}</a>`;

    const text =
      `🎉 <b>LOTEREYA TUGADI!</b>\n\n` +
      `🏆 <b>G'OLIB ANIQLANDI!</b>\n\n` +
      `👤 <b>Ismi:</b> ${mention}\n` +
      `🆔 <b>Telegram ID:</b> <code>${winnerTicket.userId}</code>\n` +
      `🎟 <b>Yutgan bilet:</b> #${winnerTicket.ticketNumber}\n\n` +
      `🎁 <b>Sovg'a:</b> ${escapeHtml(lottery.giftName)}\n` +
      `⭐ <b>Qiymati:</b> ${lottery.giftValue} Stars\n\n` +
      `📅 <b>Sana:</b> ${formatDate(new Date())}\n\n` +
      `🎰 <b>№${lottery.number} Lotereya</b>`;

    if (lottery.photoFileId) {
      await bot.api.sendPhoto(lottery.channelId, lottery.photoFileId, { caption: text, parse_mode: 'HTML' });
    } else {
      await bot.api.sendMessage(lottery.channelId, text, { parse_mode: 'HTML' });
    }

    const updatedLottery = await Lottery.findById(lottery._id);
    if (updatedLottery) await updateLotteryPost(bot, updatedLottery);
  } catch (err) {
    await writeLog('error', 'announceWinner xatosi', { err: err.message });
  }
}

async function autoFinishLottery(bot, lottery) {
  try {
    await writeLog('info', 'Avtomatik yakunlash', { lotteryNum: lottery.number });
    await new Promise(r => setTimeout(r, 2000));
    await selectWinner(bot, lottery._id);
  } catch (err) {
    await writeLog('error', 'autoFinishLottery xatosi', { err: err.message });
  }
}

module.exports = { createLottery, createTicket, selectWinner, buildPostText, sendLotteryPost, updateLotteryPost };
