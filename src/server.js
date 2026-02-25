require('dotenv').config()
const { Telegraf, Markup } = require('telegraf')
const { Pool } = require('pg')

const bot = new Telegraf(process.env.BOT_TOKEN)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

/* -------------------- داده استان و شهر -------------------- */

const provinces = {
  "تهران": ["تهران", "ری", "اسلامشهر", "پردیس"],
  "خوزستان": ["اهواز", "آبادان", "دزفول", "خرمشهر"],
  "خراسان رضوی": ["مشهد", "نیشابور", "سبزوار"],
  "اصفهان": ["اصفهان", "کاشان", "نجف‌آباد"],
  "فارس": ["شیراز", "مرودشت", "لار"],
  "آذربایجان شرقی": ["تبریز", "مراغه", "مرند"],
  "مازندران": ["ساری", "بابل", "آمل"],
  "گیلان": ["رشت", "انزلی", "لاهیجان"],
  "کرمان": ["کرمان", "رفسنجان", "جیرفت"],
  "البرز": ["کرج", "نظرآباد"]
}

/* -------------------- ابزارها -------------------- */

function buildKeyboardFromArray(arr, perRow = 3) {
  const rows = []
  let row = []

  arr.forEach(item => {
    row.push(item)
    if (row.length === perRow) {
      rows.push(row)
      row = []
    }
  })

  if (row.length > 0) rows.push(row)

  return Markup.keyboard(rows).resize()
}

function ageKeyboard() {
  const ages = []
  for (let i = 19; i <= 69; i++) {
    ages.push(String(i))
  }
  return buildKeyboardFromArray(ages, 4)
}

function normalizeNumber(input) {
  return input
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .trim()
}

async function ensureUser(telegramId) {
  await pool.query(`
    INSERT INTO app_users (telegram_user_id)
    VALUES ($1)
    ON CONFLICT (telegram_user_id)
    DO NOTHING
  `, [telegramId])
}

async function getSession(telegramId) {
  const { rows } = await pool.query(
    'SELECT * FROM flow_sessions WHERE telegram_user_id = $1',
    [telegramId]
  )
  return rows[0]
}

async function saveSession(telegramId, step, state) {
  await pool.query(`
    INSERT INTO flow_sessions (telegram_user_id, current_step, state)
    VALUES ($1, $2, $3)
    ON CONFLICT (telegram_user_id)
    DO UPDATE SET current_step = EXCLUDED.current_step,
                  state = EXCLUDED.state
  `, [telegramId, step, state])
}

async function clearSession(telegramId) {
  await pool.query(
    'DELETE FROM flow_sessions WHERE telegram_user_id = $1',
    [telegramId]
  )
}

/* -------------------- بات -------------------- */

bot.start(async (ctx) => {
  const userId = ctx.from.id

  await ensureUser(userId)
  await saveSession(userId, 'ask_name', {})

  ctx.reply('سلام 👋\nاسمت چیه؟', Markup.removeKeyboard())
})

bot.on('text', async (ctx) => {
  const userId = ctx.from.id
  const text = ctx.message.text.trim()

  try {
    const session = await getSession(userId)
    if (!session) return ctx.reply('لطفاً اول /start را بزن.')

    const state = session.state || {}
    const step = session.current_step

    switch (step) {

      case 'ask_name':
        state.name = text
        await saveSession(userId, 'ask_province', state)

        return ctx.reply(
          'از کدوم استانی؟',
          buildKeyboardFromArray(Object.keys(provinces), 2)
        )

      case 'ask_province':
        if (!provinces[text]) {
          return ctx.reply('لطفاً یکی از استان‌های داخل کیبورد را انتخاب کن.')
        }

        state.province = text
        await saveSession(userId, 'ask_city', state)

        return ctx.reply(
          'شهرت رو انتخاب کن:',
          buildKeyboardFromArray(provinces[text], 2)
        )

      case 'ask_city':
        if (!provinces[state.province].includes(text)) {
          return ctx.reply('لطفاً یکی از شهرهای داخل کیبورد را انتخاب کن.')
        }

        state.city = text
        await saveSession(userId, 'ask_age', state)

        return ctx.reply('چند سالته؟', ageKeyboard())

      case 'ask_age': {
        const normalized = normalizeNumber(text)
        const age = Number(normalized)

        if (isNaN(age) || age < 19 || age > 69) {
          return ctx.reply('لطفاً یکی از سن‌های داخل کیبورد را انتخاب کن.')
        }

        state.age = age
        await saveSession(userId, 'confirm', state)

        return ctx.reply(
          `اطلاعاتت اینه:\n
اسم: ${state.name}
استان: ${state.province}
شهر: ${state.city}
سن: ${state.age}

تایید می‌کنی؟`,
          Markup.keyboard([
            ['تایید ✅'],
            ['اصلاح ❌']
          ]).resize()
        )
      }

      case 'confirm':
        if (text === 'تایید ✅') {

          await pool.query(
            'INSERT INTO test_submissions(name, age) VALUES($1, $2)',
            [state.name, state.age]
          )

          await clearSession(userId)

          return ctx.reply('ثبت شد ✅', Markup.removeKeyboard())
        }

        if (text === 'اصلاح ❌') {
          await saveSession(userId, 'ask_name', {})
          return ctx.reply('دوباره شروع کنیم.\nاسمت چیه؟', Markup.removeKeyboard())
        }

        return ctx.reply('لطفاً یکی از گزینه‌ها را انتخاب کن.')

      default:
        return ctx.reply('وضعیت نامعتبر. /start بزن.')
    }

  } catch (err) {
    console.error(err)
    ctx.reply('خطا در ذخیره اطلاعات ❌')
  }
})

bot.launch()
console.log('Bot is running...')