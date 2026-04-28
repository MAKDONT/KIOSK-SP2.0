import * as dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

// Load environment variables
dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is not set in .env.local");
  process.exit(1);
}

console.log("✅ Token found:", token.substring(0, 20) + "...");

// Initialize bot
const bot = new TelegramBot(token, { polling: false });

// Test 1: Get bot info
console.log("\n🤖 Testing bot connection...");
bot
  .getMe()
  .then((me) => {
    console.log("✅ Bot connected successfully!");
    console.log("   Bot name:", me.first_name);
    console.log("   Bot username:", me.username);
    console.log("   Bot ID:", me.id);

    // Test 2: Send test message (you need to provide a chat ID)
    const testChatId = process.argv[2];

    if (!testChatId) {
      console.log("\n📝 To send a test message, run:");
      console.log("   npx tsx test-telegram-bot.ts <YOUR_CHAT_ID>");
      console.log("\n💡 To get your Chat ID:");
      console.log("   1. Search for your bot in Telegram: @" + me.username);
      console.log("   2. Send /start to the bot");
      console.log("   3. The bot will reply with your Chat ID");
      console.log("   4. Then run this test again with your Chat ID");
      process.exit(0);
    }

    console.log("\n📨 Sending test message to chat ID:", testChatId);
    const testMessage = `🎉 Telegram Bot Test Message!\n\nBot Name: ${me.first_name}\nBot ID: ${me.id}\nTimestamp: ${new Date().toISOString()}`;

    return bot.sendMessage(testChatId, testMessage);
  })
  .then((sentMessage) => {
    console.log("✅ Test message sent successfully!");
    console.log("   Message ID:", sentMessage.message_id);
    console.log("   Chat ID:", sentMessage.chat.id);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Error:", error.message);
    if (error.message.includes("ETELEGRAM")) {
      console.error("   This usually means the token is invalid or bot doesn't exist");
    }
    process.exit(1);
  });
