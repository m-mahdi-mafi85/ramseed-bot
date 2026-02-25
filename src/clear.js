require('dotenv').config()
const { Telegraf } = require('telegraf')

const bot = new Telegraf(process.env.BOT_TOKEN)

bot.telegram.deleteWebhook().then(() => {
  console.log('Webhook deleted')
  process.exit()
})