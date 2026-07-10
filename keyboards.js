const { Keyboard, InlineKeyboard } = require('grammy');
const config = require('./config');

const adminKeyboard = new Keyboard()
  .text('🎰 Lotereya yaratish').text('📋 Faol lotereyalar').row()
  .text('📦 Yakunlangan lotereyalar').text('👥 Foydalanuvchilar').row()
  .text('📊 Statistika').text('💳 To\'lovlar').row()
  .text('📢 Xabar yuborish').text('📣 Reklama yuborish').row()
  .text('🎁 Sovg\'alar').text('📢 Kanallar').row()
  .text('⭐ Narx sozlamalari').text('⚙️ Sozlamalar').row()
  .text('🔒 Majburiy obuna').text('👑 Adminlar').row()
  .text('🗂 Backup').text('📝 Loglar').row()
  .text('❌ Lotereyani tugatish').text('🏆 G\'olibni tanlash')
  .resized();

const userKeyboard = new Keyboard()
  .text('🎰 Faol lotereyalar').text('🎟 Mening biletlarim').row()
  .text('🏆 Oxirgi g\'oliblar').text('📜 Tarix').row()
  .text('👤 Profil').text('⭐ To\'lovlarim').row()
  .text('🎁 Sovg\'alar').text('📢 Yangiliklar').row()
  .text('❓ Yordam').text('📞 Admin')
  .resized();

function subscribeKeyboard(channels) {
  const kb = new InlineKeyboard();
  channels.forEach(ch => {
    const url = ch.inviteLink || `https://t.me/${ch.username.replace('@', '')}`;
    kb.url(`📢 ${ch.title || ch.username}`, url).row();
  });
  kb.text('✅ Tekshirish', 'check_subscription');
  return kb;
}

function lotteryCardKeyboard(lottery) {
  // Kanal postidagi tugmalar botga (private chatga) olib o'tadi — shu yerda
  // "Bilet sotib olish" bosilganda foydalanuvchi to'g'ridan-to'g'ri Stars
  // to'lov oynasini ko'radi.
  const buyUrl = `https://t.me/${config.BOT_USERNAME}?start=buy_${lottery._id}`;
  const detailUrl = `https://t.me/${config.BOT_USERNAME}?start=detail_${lottery._id}`;
  return new InlineKeyboard()
    .url('🎟 Bilet sotib olish', buyUrl)
    .url('📄 Batafsil', detailUrl);
}

// Bot ichida (private chatda) ko'rsatiladigan lotereya kartochkasi — bu yerda
// foydalanuvchi allaqachon bot bilan chatda, shuning uchun oddiy callback
// tugmalar ishlatiladi (tezroq, sahifa qayta ochilmaydi).
function lotteryBuyKeyboard(lottery) {
  return new InlineKeyboard()
    .text('🎟 Bilet sotib olish', `buy_ticket:${lottery._id}`)
    .text('📄 Batafsil', `lottery_detail:${lottery._id}`);
}

function lotteryAdminKeyboard(lottery) {
  const kb = new InlineKeyboard();
  if (lottery.status === 'active') {
    kb.text('⏸ To\'xtatish', `lottery_pause:${lottery._id}`)
      .text('❌ Bekor qilish', `lottery_cancel:${lottery._id}`).row();
    kb.text('🏆 G\'olibni tanlash', `lottery_finish:${lottery._id}`).row();
  } else if (lottery.status === 'paused') {
    kb.text('▶️ Davom ettirish', `lottery_resume:${lottery._id}`)
      .text('❌ Bekor qilish', `lottery_cancel:${lottery._id}`).row();
    kb.text('🏆 G\'olibni tanlash', `lottery_finish:${lottery._id}`).row();
  }
  kb.text('👥 Ishtirokchilar', `lottery_participants:${lottery._id}`)
    .text('🎟 Biletlar', `lottery_tickets:${lottery._id}`);
  return kb;
}

async function channelSelectKeyboard(channels) {
  const kb = new InlineKeyboard();
  channels.forEach((ch, i) => {
    kb.text(ch.title || ch.username, `select_channel:${ch.chatId}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  kb.row().text('❌ Bekor qilish', 'cancel_action');
  return kb;
}

function paginationKeyboard(page, total, prefix) {
  const kb = new InlineKeyboard();
  if (page > 0) kb.text('◀️ Oldingi', `${prefix}:${page - 1}`);
  kb.text(`${page + 1}/${total}`, 'noop');
  if (page < total - 1) kb.text('Keyingi ▶️', `${prefix}:${page + 1}`);
  return kb;
}

const cancelKeyboard = new InlineKeyboard().text('❌ Bekor qilish', 'cancel_action');
const backKeyboard = new InlineKeyboard().text('◀️ Orqaga', 'go_back');

module.exports = {
  adminKeyboard, userKeyboard, subscribeKeyboard,
  lotteryCardKeyboard, lotteryBuyKeyboard, lotteryAdminKeyboard,
  channelSelectKeyboard, paginationKeyboard,
  cancelKeyboard, backKeyboard,
};
