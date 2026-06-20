import {
  recordEvent,
  redisPipeline,
  sendTelegramMessage,
  telegramChatId,
  telegramRequest
} from './_analytics.js';

const USER_TTL = 60 * 60 * 24 * 30;
const LEAD_TTL = 60 * 60 * 24 * 400;

const TEXT = {
  ru: {
    welcome: '<b>TajCodeLAB</b> — разработка сайтов, приложений и автоматизации.\n\nРасскажи, что нужно сделать, и мы свяжемся с тобой.',
    chooseLanguage: 'Выбери язык / Забонро интихоб кунед:',
    services: '<b>Что мы делаем</b>\n\n• сайты и интернет-магазины\n• CRM и внутренние системы\n• Telegram-боты и автоматизация\n• мобильные приложения\n• поддержка и развитие проектов',
    about: '<b>TajCodeLAB</b> — IT-студия из Душанбе.\nБерём проект от анализа до запуска и поддержки.',
    contact: 'Написать менеджеру: @{username}',
    askName: 'Как тебя зовут или как называется компания?',
    badName: 'Имя слишком короткое. Введи от 2 до 100 символов.',
    askPhone: 'Отправь номер кнопкой ниже или введи его текстом.',
    badPhone: 'Не похоже на номер телефона. Пример: +992 900 00 00 00',
    askDescription: 'Коротко опиши задачу: что нужно сделать и для кого?',
    badDescription: 'Нужно чуть конкретнее: от 10 до 2000 символов.',
    askBudget: 'Какой ориентировочный бюджет?',
    created: 'Заявка <b>#{id}</b> отправлена.\nМенеджер изучит задачу и свяжется с тобой.',
    cancelled: 'Создание заявки отменено.',
    in_progress: 'Заявку <b>#{id}</b> взяли в работу.',
    done: 'Заявка <b>#{id}</b> закрыта. Спасибо за обращение.',
    rejected: 'По заявке <b>#{id}</b> сейчас не сможем помочь. Если вводные изменятся — напиши нам снова.',
    unknown: 'Используй кнопки меню — так быстрее.'
  },
  tg: {
    welcome: '<b>TajCodeLAB</b> — таҳияи сомонаҳо, барномаҳо ва автоматизатсия.\n\nНавишт, ки чӣ лозим аст — мо бо ту тамос мегирем.',
    chooseLanguage: 'Забонро интихоб кунед / Выбери язык:',
    services: '<b>Мо чӣ кор мекунем</b>\n\n• сомона ва интернет-мағоза\n• CRM ва системаҳои дохилӣ\n• Telegram-бот ва автоматизатсия\n• барномаҳои мобилӣ\n• дастгирӣ ва рушди лоиҳа',
    about: '<b>TajCodeLAB</b> — IT-студия аз Душанбе.\nЛоиҳаро аз таҳлил то оғоз ва дастгирӣ мебарем.',
    contact: 'Ба менеҷер навис: @{username}',
    askName: 'Номи ту ё номи ширкат чист?',
    badName: 'Ном хеле кӯтоҳ аст. Аз 2 то 100 аломат ворид кун.',
    askPhone: 'Рақамро бо тугма фирист ё дастӣ навис.',
    badPhone: 'Ин ба рақами телефон монанд нест. Мисол: +992 900 00 00 00',
    askDescription: 'Кӯтоҳ навис: чӣ сохтан лозим ва барои кӣ?',
    badDescription: 'Каме дақиқтар навис: аз 10 то 2000 аломат.',
    askBudget: 'Буҷаи тахминӣ чанд аст?',
    created: 'Дархости <b>#{id}</b> фиристода шуд.\nМенеҷер вазифаро меомӯзад ва бо ту тамос мегирад.',
    cancelled: 'Сохтани дархост бекор шуд.',
    in_progress: 'Дархости <b>#{id}</b> ба кор гирифта шуд.',
    done: 'Дархости <b>#{id}</b> пӯшида шуд. Раҳмат.',
    rejected: 'Ҳоло аз рӯйи дархости <b>#{id}</b> кумак карда наметавонем. Агар шартҳо иваз шаванд, боз навис.',
    unknown: 'Тугмаҳои менюро истифода бар — тезтар мешавад.'
  }
};

const BUDGETS = {
  '5k': 'до 5 000 сомонӣ',
  '15k': '5 000–15 000 сомонӣ',
  '15kplus': '15 000+ сомонӣ'
};

const userKey = (userId) => `bot:user:${userId}`;
const leadKey = (leadId) => `bot:lead:${leadId}`;

function flatHash(value) {
  const result = {};
  if (!Array.isArray(value)) return result;
  for (let index = 0; index < value.length; index += 2) {
    result[String(value[index])] = String(value[index + 1] ?? '');
  }
  return result;
}

function clean(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function format(template, values) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}

const languageOf = (user) => user.language === 'tg' ? 'tg' : 'ru';
const managerUsername = () => clean(process.env.MANAGER_USERNAME || 'd122145', 64).replace(/^@/, '');

function adminIds() {
  const configured = String(process.env.BOT_ADMIN_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const analyticsId = telegramChatId();
  if (/^-?\d+$/.test(analyticsId)) configured.push(String(analyticsId));
  return new Set(configured);
}

function mainMenu(language) {
  const labels = language === 'tg'
    ? ['📝 Дархост мондан', '🧩 Хизматҳо', '🏢 Дар бораи мо', '💬 Тамос']
    : ['📝 Оставить заявку', '🧩 Услуги', '🏢 О нас', '💬 Связаться'];
  return {
    inline_keyboard: [
      [{ text: labels[0], callback_data: 'lead:start' }],
      [
        { text: labels[1], callback_data: 'info:services' },
        { text: labels[2], callback_data: 'info:about' }
      ],
      [{ text: labels[3], callback_data: 'info:contact' }],
      [{ text: '🌐 RU / TJ', callback_data: 'language:choose' }]
    ]
  };
}

function languageMenu() {
  return {
    inline_keyboard: [[
      { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
      { text: '🇹🇯 Тоҷикӣ', callback_data: 'lang:tg' }
    ]]
  };
}

function phoneKeyboard(language) {
  return {
    keyboard: [[{
      text: language === 'tg' ? '📱 Фиристодани рақам' : '📱 Отправить номер',
      request_contact: true
    }]],
    resize_keyboard: true,
    one_time_keyboard: true
  };
}

function budgetKeyboard(language) {
  const labels = language === 'tg'
    ? ['То 5 000 сомонӣ', '5 000–15 000 сомонӣ', 'Аз 15 000 сомонӣ']
    : ['До 5 000 сомонӣ', '5 000–15 000 сомонӣ', '15 000+ сомонӣ'];
  return {
    inline_keyboard: labels.map((label, index) => [{
      text: label,
      callback_data: `budget:${['5k', '15k', '15kplus'][index]}`
    }])
  };
}

function adminKeyboard(leadId, inProgress = false) {
  if (inProgress) {
    return {
      inline_keyboard: [[
        { text: '✅ Завершить', callback_data: `admin:done:${leadId}` },
        { text: '❌ Отказать', callback_data: `admin:rejected:${leadId}` }
      ]]
    };
  }
  return {
    inline_keyboard: [
      [
        { text: '▶️ В работу', callback_data: `admin:in_progress:${leadId}` },
        { text: '❌ Отказать', callback_data: `admin:rejected:${leadId}` }
      ]
    ]
  };
}

async function getUser(userId) {
  const [result] = await redisPipeline([['HGETALL', userKey(userId)]]);
  return flatHash(result);
}

async function updateUser(userId, fields) {
  const values = Object.entries(fields).flatMap(([key, value]) => [key, String(value)]);
  await redisPipeline([
    ['HSET', userKey(userId), ...values],
    ['EXPIRE', userKey(userId), USER_TTL]
  ]);
}

async function clearForm(userId) {
  await redisPipeline([['HDEL', userKey(userId), 'state', 'name', 'phone', 'description']]);
}

async function answerCallback(callbackId, text = '', showAlert = false) {
  await telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
    show_alert: showAlert
  });
}

async function sendMenu(chatId, language) {
  await sendTelegramMessage(chatId, TEXT[language].welcome, {
    parse_mode: 'HTML',
    reply_markup: mainMenu(language)
  });
}

async function start(chatId, from) {
  const user = await getUser(from.id);
  await updateUser(from.id, {
    language: languageOf(user),
    username: clean(from.username, 64),
    fullName: clean([from.first_name, from.last_name].filter(Boolean).join(' '), 160),
    state: 'idle'
  });
  await sendTelegramMessage(chatId, TEXT.ru.chooseLanguage, { reply_markup: languageMenu() });
}

async function handleText(message, user) {
  const chatId = message.chat.id;
  const language = languageOf(user);
  const value = clean(message.text, 2000);
  const command = value.toLowerCase().split('@')[0];

  if (command === '/cancel') {
    await clearForm(message.from.id);
    await sendTelegramMessage(chatId, TEXT[language].cancelled, {
      reply_markup: { remove_keyboard: true }
    });
    await sendMenu(chatId, language);
    return;
  }

  if (user.state === 'name') {
    if (value.length < 2 || value.length > 100) {
      await sendTelegramMessage(chatId, TEXT[language].badName);
      return;
    }
    await updateUser(message.from.id, { name: value, state: 'phone' });
    await sendTelegramMessage(chatId, TEXT[language].askPhone, {
      reply_markup: phoneKeyboard(language)
    });
    return;
  }

  if (user.state === 'phone') {
    const phone = clean(message.contact?.phone_number || value, 32);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      await sendTelegramMessage(chatId, TEXT[language].badPhone);
      return;
    }
    await updateUser(message.from.id, { phone, state: 'description' });
    await sendTelegramMessage(chatId, TEXT[language].askDescription, {
      reply_markup: { remove_keyboard: true }
    });
    return;
  }

  if (user.state === 'description') {
    if (value.length < 10 || value.length > 2000) {
      await sendTelegramMessage(chatId, TEXT[language].badDescription);
      return;
    }
    await updateUser(message.from.id, { description: value, state: 'budget' });
    await sendTelegramMessage(chatId, TEXT[language].askBudget, {
      reply_markup: budgetKeyboard(language)
    });
    return;
  }

  if (user.state === 'budget' && value) {
    await createLead(message.from, chatId, value);
    return;
  }

  await sendTelegramMessage(chatId, TEXT[language].unknown, {
    reply_markup: mainMenu(language)
  });
}

async function createLead(from, chatId, budget) {
  const claimScript = "if redis.call('HGET', KEYS[1], 'state') == 'budget' then redis.call('HSET', KEYS[1], 'state', 'processing'); return 'ok' end; return 'busy'";
  const [claimed] = await redisPipeline([['EVAL', claimScript, '1', userKey(from.id)]]);
  if (claimed !== 'ok') return;

  const user = await getUser(from.id);
  if (!user.name || !user.phone || !user.description) {
    await updateUser(from.id, { state: 'budget' });
    return;
  }

  const [leadId] = await redisPipeline([['INCR', 'bot:lead:sequence']]);
  const key = leadKey(leadId);
  await redisPipeline([
    ['HSET', key,
      'id', leadId,
      'userId', from.id,
      'chatId', chatId,
      'language', languageOf(user),
      'username', clean(from.username, 64),
      'name', user.name,
      'phone', user.phone,
      'description', user.description,
      'budget', clean(budget, 100),
      'status', 'new',
      'createdAt', new Date().toISOString()
    ],
    ['EXPIRE', key, LEAD_TTL],
    ['HSET', userKey(from.id), 'state', 'idle'],
    ['HDEL', userKey(from.id), 'name', 'phone', 'description']
  ]);

  const language = languageOf(user);
  await sendTelegramMessage(chatId, format(TEXT[language].created, { id: leadId }), {
    parse_mode: 'HTML',
    reply_markup: mainMenu(language)
  });

  const username = from.username ? `@${escapeHtml(from.username)}` : 'нет';
  const card = [
    `<b>Новая заявка #${leadId}</b>`,
    '',
    `<b>Клиент:</b> ${escapeHtml(user.name)}`,
    `<b>Телефон:</b> <code>${escapeHtml(user.phone)}</code>`,
    `<b>Telegram:</b> ${username}`,
    `<b>Бюджет:</b> ${escapeHtml(budget)}`,
    '',
    '<b>Задача:</b>',
    escapeHtml(user.description)
  ].join('\n');

  const destination = telegramChatId();
  if (destination) {
    await sendTelegramMessage(destination, card, {
      parse_mode: 'HTML',
      reply_markup: adminKeyboard(leadId)
    });
  }

  await recordEvent({
    event: 'lead',
    visitorId: `tg:${from.id}`,
    sessionId: `tg:${from.id}`,
    path: '/telegram-bot',
    source: 'Telegram bot'
  }).catch((error) => console.error('Bot lead analytics error:', error.message));
}

async function handleAdminCallback(callback, status, leadId) {
  if (!adminIds().has(String(callback.from.id))) {
    await answerCallback(callback.id, 'Нет доступа', true);
    return;
  }

  const transitionScript = [
    "local current = redis.call('HGET', KEYS[1], 'status')",
    "if not current then return 'missing' end",
    "if current == 'new' and (ARGV[1] == 'in_progress' or ARGV[1] == 'rejected') then redis.call('HSET', KEYS[1], 'status', ARGV[1]); return 'ok' end",
    "if current == 'in_progress' and (ARGV[1] == 'done' or ARGV[1] == 'rejected') then redis.call('HSET', KEYS[1], 'status', ARGV[1]); return 'ok' end",
    'return current'
  ].join('; ');
  const [transition] = await redisPipeline([[
    'EVAL', transitionScript, '1', leadKey(leadId), status
  ]]);

  if (transition !== 'ok') {
    await answerCallback(callback.id, 'Статус уже изменён или переход запрещён', true);
    return;
  }

  const [stored] = await redisPipeline([['HGETALL', leadKey(leadId)]]);
  const lead = flatHash(stored);
  const labels = { in_progress: 'в работе', done: 'завершена', rejected: 'отказ' };
  await answerCallback(callback.id, `Заявка: ${labels[status]}`);
  await telegramRequest('editMessageReplyMarkup', {
    chat_id: callback.message.chat.id,
    message_id: callback.message.message_id,
    reply_markup: status === 'in_progress'
      ? adminKeyboard(leadId, true)
      : { inline_keyboard: [] }
  });
  await sendTelegramMessage(callback.message.chat.id, `Заявка <b>#${leadId}</b>: ${labels[status]}.`, {
    parse_mode: 'HTML'
  });

  if (lead.chatId) {
    const language = lead.language === 'tg' ? 'tg' : 'ru';
    await sendTelegramMessage(
      lead.chatId,
      format(TEXT[language][status], { id: leadId }),
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
}

async function handleCallback(callback) {
  const data = String(callback.data || '');
  const chatId = callback.message?.chat?.id;
  if (!chatId) return;

  if (data.startsWith('admin:')) {
    const [, status, leadId] = data.split(':');
    if (!['in_progress', 'done', 'rejected'].includes(status) || !/^\d+$/.test(leadId)) {
      await answerCallback(callback.id, 'Некорректная команда', true);
      return;
    }
    await handleAdminCallback(callback, status, leadId);
    return;
  }

  const user = await getUser(callback.from.id);
  const language = languageOf(user);

  if (data === 'language:choose') {
    await answerCallback(callback.id);
    await sendTelegramMessage(chatId, TEXT[language].chooseLanguage, {
      reply_markup: languageMenu()
    });
    return;
  }

  if (data === 'lang:ru' || data === 'lang:tg') {
    const selected = data.endsWith(':tg') ? 'tg' : 'ru';
    await updateUser(callback.from.id, { language: selected, state: 'idle' });
    await answerCallback(callback.id, selected === 'tg' ? 'Забон нигоҳ дошта шуд' : 'Язык сохранён');
    await sendMenu(chatId, selected);
    return;
  }

  if (data === 'lead:start') {
    await updateUser(callback.from.id, { state: 'name' });
    await answerCallback(callback.id);
    await sendTelegramMessage(chatId, TEXT[language].askName);
    return;
  }

  if (data.startsWith('info:')) {
    const section = data.split(':')[1];
    await answerCallback(callback.id);
    if (section === 'contact') {
      await sendTelegramMessage(
        chatId,
        format(TEXT[language].contact, { username: managerUsername() }),
        { reply_markup: mainMenu(language) }
      );
    } else if (section === 'services' || section === 'about') {
      await sendTelegramMessage(chatId, TEXT[language][section], {
        parse_mode: 'HTML',
        reply_markup: mainMenu(language)
      });
    }
    return;
  }

  if (data.startsWith('budget:') && user.state === 'budget') {
    const budget = BUDGETS[data.split(':')[1]];
    await answerCallback(callback.id);
    if (budget) await createLead(callback.from, chatId, budget);
    return;
  }

  await answerCallback(callback.id);
}

export async function handleClientBotUpdate(update) {
  const event = update.callback_query || update.message;
  if (!event) return false;

  const [deduplicated] = await redisPipeline([[
    'SET', `bot:update:${update.update_id}`, '1', 'EX', 60 * 60, 'NX'
  ]]);
  if (deduplicated !== 'OK') return true;

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return true;
  }

  const message = update.message;
  if (message.chat?.type !== 'private' || !message.from?.id) return false;
  const rawText = clean(message.text, 2000);
  if (/^\/start(?:@\w+)?(?:\s|$)/i.test(rawText)) {
    await start(message.chat.id, message.from);
    return true;
  }

  const user = await getUser(message.from.id);
  if (!user.language) {
    await start(message.chat.id, message.from);
    return true;
  }

  await updateUser(message.from.id, {
    username: clean(message.from.username, 64),
    fullName: clean([message.from.first_name, message.from.last_name].filter(Boolean).join(' '), 160)
  });
  await handleText(message, user);
  return true;
}
