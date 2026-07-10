const config = require('./config');
const { writeLog } = require('./database');
const { User, Settings, Channel } = require('./schema');

const spamMap = new Map();

function checkSpam(userId) {
  const now = Date.now();
  const rl = config.RATE_LIMIT;
  let rec = spamMap.get(userId);

  if (!rec) {
    spamMap.set(userId, { count: 1, firstMsg: now, blocked: false, blockedUntil: 0 });
    return false;
  }

  if (rec.blocked && now > rec.blockedUntil) {
    spamMap.set(userId, { count: 1, firstMsg: now, blocked: false, blockedUntil: 0 });
    return false;
  }

  if (rec.blocked) return true;

  if (now - rec.firstMsg > rl.WINDOW_MS) {
    spamMap.set(userId, { count: 1, firstMsg: now, blocked: false, blockedUntil: 0 });
    return false;
  }

  rec.count++;
  if (rec.count > rl.MAX_MESSAGES) {
    rec.blocked = true;
    rec.blockedUntil = now + rl.BLOCK_DURATION;
    writeLog('warn', 'Spam aniqlandi', { userId });
    return true;
  }

  return false;
}

function isSuperAdmin(userId) {
  return config.ADMIN_IDS.includes(userId);
}

async function isAdmin(userId) {
  if (isSuperAdmin(userId)) return true;
  const user = await User.findOne({ telegramId: userId });
  return user?.isAdmin === true;
}

async function upsertUser(from) {
  try {
    const existing = await User.exists({ telegramId: from.id });
    const update = {
      firstName:    from.first_name || '',
      lastName:     from.last_name  || '',
      username:     from.username   || '',
      lastActivity: new Date(),
    };
    const user = await User.findOneAndUpdate(
      { telegramId: from.id },
      { $set: update, $setOnInsert: { telegramId: from.id, joinedAt: new Date() } },
      { upsert: true, new: true }
    );
    return { user, isNew: !existing };
  } catch (err) {
    writeLog('error', 'upsertUser xatosi', { err: err.message, userId: from.id });
    return { user: null, isNew: false };
  }
}

async function checkSubscription(bot, userId) {
  try {
    if (isSuperAdmin(userId)) return { ok: true, missing: [] };
    const channels = await Channel.find();
    if (channels.length === 0) return { ok: true, missing: [] };

    const missing = [];
    for (const ch of channels) {
      try {
        const member = await bot.api.getChatMember(ch.chatId, userId);
        if (!['member', 'administrator', 'creator'].includes(member.status)) {
          missing.push(ch);
        }
      } catch {}
    }
    return { ok: missing.length === 0, missing };
  } catch (err) {
    writeLog('error', 'checkSubscription xatosi', { err: err.message });
    return { ok: true, missing: [] };
  }
}

function getReferralLink(telegramId) {
  return `https://t.me/${config.BOT_USERNAME}?start=ref_${telegramId}`;
}

// Foydalanuvchi kimningdir referral havolasi orqali kirgan bo'lsa va endi
// barcha majburiy kanallarga obuna bo'lsa — referalni tasdiqlaymiz va
// taklif qilgan odamning hisobiga qo'shamiz. Faqat bir marta ishlaydi.
async function confirmReferralIfNeeded(userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    if (!user || !user.referredBy || user.referralConfirmed) return;

    await User.updateOne({ telegramId: userId }, { $set: { referralConfirmed: true } });
    await User.updateOne({ telegramId: user.referredBy }, { $inc: { confirmedReferrals: 1 } });
    writeLog('info', 'Referral tasdiqlandi', { userId, referrerId: user.referredBy });
  } catch (err) {
    writeLog('error', 'confirmReferralIfNeeded xatosi', { err: err.message, userId });
  }
}

// Foydalanuvchi majburiy kanallardan birortasidan chiqib ketsa, avval
// tasdiqlangan referali bekor qilinadi va taklif qilgan odamning hisobidan ayiriladi.
async function revokeReferralIfNeeded(bot, userId) {
  try {
    const user = await User.findOne({ telegramId: userId });
    if (!user || !user.referredBy || !user.referralConfirmed) return;

    const { ok } = await checkSubscription(bot, userId);
    if (ok) return; // hali ham barcha kanallarga obuna — referral bekor qilinmaydi

    await User.updateOne({ telegramId: userId }, { $set: { referralConfirmed: false } });
    await User.updateOne({ telegramId: user.referredBy }, { $inc: { confirmedReferrals: -1 } });
    writeLog('info', 'Referral bekor qilindi (kanaldan chiqib ketdi)', { userId, referrerId: user.referredBy });
  } catch (err) {
    writeLog('error', 'revokeReferralIfNeeded xatosi', { err: err.message, userId });
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getUserName(user) {
  if (!user) return 'Noma\'lum';
  const name = [user.firstName || user.first_name, user.lastName || user.last_name]
    .filter(Boolean).join(' ');
  return name || user.username || `ID: ${user.telegramId || user.id}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function getSetting(key, defaultValue = null) {
  try {
    const doc = await Settings.findOne({ key });
    return doc ? doc.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setSetting(key, value) {
  try {
    await Settings.findOneAndUpdate(
      { key },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    writeLog('error', 'setSetting xatosi', { key, err: err.message });
  }
}

function progressBar(sold, max, length = 10) {
  const pct = max > 0 ? Math.min(sold / max, 1) : 0;
  const filled = Math.round(pct * length);
  return `[${'█'.repeat(filled)}${'░'.repeat(length - filled)}] ${Math.round(pct * 100)}%`;
}

module.exports = {
  checkSpam, isSuperAdmin, isAdmin, upsertUser,
  checkSubscription, randomInt, formatDate,
  getUserName, escapeHtml, getSetting, setSetting, progressBar,
  getReferralLink, confirmReferralIfNeeded, revokeReferralIfNeeded,
};
