const { writeLog } = require('./database');
const { checkSubscription, confirmReferralIfNeeded } = require('./functions');
const { subscribeKeyboard } = require('./keyboards');
const { handleBuyTicket, handleLotteryDetail, showMyTickets, showMyPayments } = require('./user');
const { handleLotteryAction, handleChannelSelect, showFinishedLotteries, showUsers, showPayments } = require('./admin');

async function handleCallback(ctx, bot) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const userId = ctx.from.id;

  try {
    if (data === 'check_subscription') {
      const { ok, missing } = await checkSubscription(bot, userId);
      if (ok) {
        await confirmReferralIfNeeded(userId);
        await ctx.answerCallbackQuery('✅ Tekshirildi!');
        try { await ctx.deleteMessage(); } catch {}
        const { sendUserMenu } = require('./user');
        await sendUserMenu(ctx);
      } else {
        await ctx.answerCallbackQuery('❌ Hali barcha kanallarga obuna bo\'lmadingiz.');
        await ctx.editMessageReplyMarkup({ reply_markup: subscribeKeyboard(missing) });
      }
      return;
    }

    if (data.startsWith('buy_ticket:')) {
      await handleBuyTicket(ctx, data.split(':')[1]); return;
    }

    if (data.startsWith('lottery_detail:')) {
      await handleLotteryDetail(ctx, data.split(':')[1]); return;
    }

    const adminActions = ['lottery_pause','lottery_resume','lottery_cancel','lottery_finish','lottery_participants','lottery_tickets'];
    for (const action of adminActions) {
      if (data.startsWith(`${action}:`)) {
        await handleLotteryAction(ctx, bot, action, data.split(':')[1]); return;
      }
    }

    if (data.startsWith('select_channel:')) {
      await handleChannelSelect(ctx, bot, data.replace('select_channel:', '')); return;
    }

    if (data.startsWith('my_tickets_page:')) { await showMyTickets(ctx, parseInt(data.split(':')[1])); return; }
    if (data.startsWith('my_payments_page:')) { await showMyPayments(ctx, parseInt(data.split(':')[1])); return; }
    if (data.startsWith('finished_page:')) { await showFinishedLotteries(ctx, parseInt(data.split(':')[1])); return; }
    if (data.startsWith('users_page:')) { await showUsers(ctx, parseInt(data.split(':')[1])); return; }
    if (data.startsWith('payments_page:')) { await showPayments(ctx, parseInt(data.split(':')[1])); return; }

    if (data === 'cancel_action') {
      const { clearSession } = require('./admin');
      clearSession(userId);
      await ctx.answerCallbackQuery('❌ Bekor qilindi.');
      try { await ctx.deleteMessage(); } catch {}
      return;
    }

    if (data === 'noop') { await ctx.answerCallbackQuery(); return; }
    if (data === 'go_back') { await ctx.answerCallbackQuery(); try { await ctx.deleteMessage(); } catch {} return; }
    if (data === 'channels_list') {
      const { showChannels } = require('./admin');
      await ctx.answerCallbackQuery();
      await showChannels(ctx);
      return;
    }

    await ctx.answerCallbackQuery();
    await writeLog('warn', 'Noma\'lum callback', { data, userId });

  } catch (err) {
    await writeLog('error', 'handleCallback xatosi', { data, err: err.message });
    try { await ctx.answerCallbackQuery('❌ Xato yuz berdi.'); } catch {}
  }
}

module.exports = { handleCallback };
