/**
 * Telegram Bot Integration Example - Faculty Dashboard Integration
 * 
 * This file shows how to integrate Telegram registration into the Faculty Dashboard.
 * It provides UI components and API calls needed for the feature.
 */

// API Service Functions for Telegram Integration

export async function registerTelegramChat(
  facultyId: string,
  telegramChatId: number,
  telegramUsername?: string
) {
  const response = await fetch(`/api/faculty/${facultyId}/telegram/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      telegram_chat_id: telegramChatId,
      telegram_username: telegramUsername || null
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to register Telegram chat");
  }

  return await response.json();
}

export async function disconnectTelegramChat(facultyId: string) {
  const response = await fetch(`/api/faculty/${facultyId}/telegram/disconnect`, {
    method: "POST"
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to disconnect Telegram");
  }

  return await response.json();
}

export async function getTelegramStatus(facultyId: string) {
  const response = await fetch(`/api/faculty/${facultyId}/telegram/status`);

  if (!response.ok) {
    throw new Error("Failed to fetch Telegram status");
  }

  return await response.json();
}

// ============================================
// React Component Example for Faculty Dashboard
// ============================================

/*
import React, { useState, useEffect } from "react";
import { MessageCircle, AlertCircle, CheckCircle } from "lucide-react";
import { registerTelegramChat, disconnectTelegramChat, getTelegramStatus } from "./telegramService";

interface TelegramStatus {
  registered: boolean;
  is_active: boolean;
  telegram_username: string | null;
  registered_at: string | null;
}

export function TelegramNotificationsPanel({ facultyId }: { facultyId: string }) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatIdInput, setChatIdInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load current status
  useEffect(() => {
    fetchStatus();
  }, [facultyId]);

  const fetchStatus = async () => {
    try {
      const data = await getTelegramStatus(facultyId);
      setStatus(data);
    } catch (err: any) {
      console.error("Failed to fetch Telegram status:", err);
    }
  };

  const handleRegister = async () => {
    if (!chatIdInput.trim()) {
      setError("Please enter your Telegram Chat ID");
      return;
    }

    const chatId = parseInt(chatIdInput, 10);
    if (isNaN(chatId)) {
      setError("Chat ID must be a valid number");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await registerTelegramChat(facultyId, chatId);
      setSuccess("✅ Telegram registered successfully! You'll receive queue updates via Telegram.");
      setChatIdInput("");
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to register Telegram");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Are you sure you want to disable Telegram notifications?")) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await disconnectTelegramChat(facultyId);
      setSuccess("Telegram notifications disabled");
      await fetchStatus();
    } catch (err: any) {
      setError(err.message || "Failed to disconnect Telegram");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
      <div className="flex items-center mb-4">
        <MessageCircle className="w-6 h-6 text-blue-600 mr-3" />
        <h2 className="text-xl font-bold text-gray-800">Telegram Queue Notifications</h2>
      </div>

      <p className="text-gray-600 text-sm mb-4">
        Receive real-time queue updates and notifications directly on Telegram.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
          <span className="text-red-700 text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-4 flex items-start">
          <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
          <span className="text-green-700 text-sm">{success}</span>
        </div>
      )}

      {status?.registered && status?.is_active ? (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
            <p className="text-blue-800 text-sm">
              ✅ <strong>Telegram is Active</strong>
              <br />
              {status.telegram_username && (
                <>Username: @{status.telegram_username}<br /></>
              )}
              Registered: {new Date(status.registered_at || "").toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition"
          >
            {loading ? "Processing..." : "Disable Telegram Notifications"}
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How to get your Telegram Chat ID:
            </label>
            <ol className="text-sm text-gray-600 space-y-1 ml-4 list-decimal">
              <li>Search for <code className="bg-gray-100 px-1 rounded">@kiosk_queue_bot</code> on Telegram</li>
              <li>Click "Start" or send <code className="bg-gray-100 px-1 rounded">/start</code></li>
              <li>Copy your Chat ID from the bot message</li>
              <li>Paste it below and click Register</li>
            </ol>
          </div>

          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter your Telegram Chat ID (e.g., 123456789)"
              value={chatIdInput}
              onChange={(e) => setChatIdInput(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleRegister}
              disabled={loading || !chatIdInput.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition"
            >
              {loading ? "Registering..." : "Register Telegram"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Add to your Faculty Dashboard:
// <TelegramNotificationsPanel facultyId={currentFacultyId} />
*/

// ============================================
// Example Webhook Handler for Telegram Bot /start command
// (Optional - for future enhancement)
// ============================================

/*
// Add this to server.ts if you want to handle Telegram bot messages

app.post("/api/telegram/webhook", async (req, res) => {
  try {
    const update = req.body;

    // Handle /start command
    if (update.message?.text === "/start" && update.message?.chat?.id) {
      const chatId = update.message.chat.id;
      const username = update.message.chat.username || update.message.from?.username;

      if (telegramBot) {
        const message = 
          "👋 <b>Welcome to KIOSK Queue Bot!</b>\n\n" +
          "Your Telegram Chat ID is: <code>" + chatId + "</code>\n\n" +
          "Steps to register:\n" +
          "1. Log in to KIOSK Faculty Dashboard\n" +
          "2. Go to Settings → Telegram Notifications\n" +
          "3. Paste your Chat ID above\n" +
          "4. Click Register\n\n" +
          "You'll then receive real-time queue updates! 🎉";

        await telegramBot.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[Telegram Webhook] Error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// Also add this function to handle polling updates if needed:

async function setupTelegramBotHandlers() {
  if (!telegramBot) return;

  telegramBot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";

    if (text === "/start") {
      const message = 
        "👋 <b>Welcome to KIOSK Queue Bot!</b>\n\n" +
        "Your Telegram Chat ID is: <code>" + chatId + "</code>\n\n" +
        "Steps to register:\n" +
        "1. Log in to KIOSK Faculty Dashboard\n" +
        "2. Go to Settings → Telegram Notifications\n" +
        "3. Paste your Chat ID\n" +
        "4. Click Register\n\n" +
        "You'll receive queue updates automatically! 🎉";

      await telegramBot?.sendMessage(chatId, message, { parse_mode: "HTML" });
    }
  });

  console.log("✅ Telegram bot handlers initialized");
}

// Call this in setupTelegramBot() after creating the bot
*/
