const { Payment, Lottery } = require('./schema');
const { writeLog } = require('./database');
const { createTicket } = require('./lottery');

async function sendStarsInvoice(bot, chatId, lottery) {
  try {
    await bot.api.sendInvoice(
      chatId,
      `🎟 №${lottery.number} Lotereya — Bilet`,
      `🎁 Sovg'a: ${lottery.giftName}\n⭐ Sovg'a qiymati: ${lottery.giftValue} Stars\n📈 Sotilgan: ${lottery.soldTickets}/${lottery.maxTickets}`,
      `lottery_${lottery._id}`,
      'XTR',
      [{ label: '🎟 Bilet narxi', amount: lottery.ticketPrice }]
    );
    await writeLog('info', 'Invoice yuborildi', { userId: chatId, lotteryNum: lottery.number });
  } catch (err) {
    await writeLog('error', 'sendStarsInvoice xatosi', { err: err.message });
    throw err;
  }
}

async function handlePreCheckout(ctx) {
  try {
    const payload = ctx.preCheckoutQuery.invoice_payload;
    if (!payload.startsWith('lottery_')) {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Noto\'g\'ri to\'lov.' });
      return;
    }
    const lotteryId = payload.replace('lottery_', '').split('_')[0];
    const lottery = await Lottery.findById(lotteryId);

    if (!lottery) {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Lotereya topilmadi.' });
      return;
    }
    if (lottery.status !== 'active') {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Bu lotereya faol emas.' });
      return;
    }
    if (lottery.soldTickets >= lottery.maxTickets) {
      await ctx.answerPreCheckoutQuery(false, { error_message: 'Barcha biletlar sotilgan.' });
      return;
    }
    await ctx.answerPreCheckoutQuery(true);
  } catch (err) {
    await writeLog('error', 'handlePreCheckout xatosi', { err: err.message });
    try { await ctx.answerPreCheckoutQuery(false, { error_message: 'Serverda xato.' }); } catch {}
  }
}

async function handleSuccessfulPayment(ctx, bot) {
  try {
    const payment  = ctx.message.successful_payment;
    const userId   = ctx.from.id;
    const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ')
                   || ctx.from.username || String(userId);
    const chargeId  = payment.telegram_payment_charge_id;
    const amount    = payment.total_amount;
    const payload   = payment.invoice_payload;

    const existing = await Payment.findOne({ chargeId });
    if (existing) {
      await writeLog('warn', 'Takroriy to\'lov aniqlandi', { chargeId, userId });
      return;
    }

    const lotteryId = payload.replace('lottery_', '').split('_')[0];
    const lottery = await Lottery.findById(lotteryId);
    if (!lottery) {
      await writeLog('error', 'To\'lovda lotereya topilmadi', { payload, userId });
      return;
    }

    const paymentDoc = await Payment.create({
      userId, lotteryId: lottery._id, lotteryNum: lottery.number,
      amount, chargeId, status: 'pending',
    });

    const { ticket } = await createTicket(bot, lottery._id, userId, userName, chargeId, amount);

    await Payment.findByIdAndUpdate(paymentDoc._id, {
      status: 'success', ticketId: ticket._id, ticketNumber: ticket.ticketNumber,
    });

    await ctx.reply(
      `✅ <b>To'lov qabul qilindi!</b>\n\n` +
      `🎰 <b>Lotereya:</b> №${lottery.number}\n` +
      `🎟 <b>Bilet raqami:</b> <b>#${ticket.ticketNumber}</b>\n` +
      `⭐ <b>To'langan:</b> ${amount} Stars\n` +
      `🎁 <b>Sovg'a:</b> ${lottery.giftName}\n\n` +
      `🍀 Omad tilaymiz!`,
      { parse_mode: 'HTML' }
    );

    await writeLog('payment', 'To\'lov muvaffaqiyatli', {
      userId, lotteryNum: lottery.number, ticketNumber: ticket.ticketNumber, amount, chargeId,
    });
  } catch (err) {
    await writeLog('error', 'handleSuccessfulPayment xatosi', { err: err.message });
    try { await ctx.reply('⚠️ To\'lov qayta ishlanayotganda xato. Adminga murojaat qiling.'); } catch {}
  }
}

module.exports = { sendStarsInvoice, handlePreCheckout, handleSuccessfulPayment };
