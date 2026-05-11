#!/usr/bin/env node

/**
 * SendGrid Email Service Test Script
 * Tests SendGrid API connectivity and sender verification
 * 
 * Usage: node test-sendgrid-direct.js
 */

import dotenv from "dotenv";
import sgMail from "@sendgrid/mail";

// Load environment variables
dotenv.config({ path: ".env.local" });

const API_KEY = process.env.SENDGRID_API_KEY?.trim();
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL?.trim();
const TEST_TO_EMAIL = process.env.TEST_EMAIL || "test@example.com";

console.log("========================================");
console.log("  SendGrid Email Service Test");
console.log("========================================\n");

// Validate configuration
console.log("📋 Configuration Check:");
console.log(`   API_KEY: ${API_KEY ? `${API_KEY.substring(0, 15)}...` : "❌ NOT SET"}`);
console.log(`   FROM_EMAIL: ${FROM_EMAIL || "❌ NOT SET"}`);
console.log(`   TEST_TO_EMAIL: ${TEST_TO_EMAIL}`);

if (!API_KEY) {
  console.error("\n❌ ERROR: SENDGRID_API_KEY is not set in .env.local");
  process.exit(1);
}

if (!FROM_EMAIL) {
  console.error("\n❌ ERROR: SENDGRID_FROM_EMAIL is not set in .env.local");
  process.exit(1);
}

// Initialize SendGrid
console.log("\n🔧 Initializing SendGrid...");
try {
  sgMail.setApiKey(API_KEY);
  console.log("✅ SendGrid API key set successfully");
} catch (error: any) {
  console.error(`❌ Failed to set API key: ${error.message}`);
  process.exit(1);
}

// Test email send
async function testSendEmail() {
  console.log("\n📧 Sending test email...");
  
  const msg = {
    to: TEST_TO_EMAIL,
    from: FROM_EMAIL,
    subject: "SendGrid Test Email - Password Reset",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">SendGrid Test Email</h1>
        <p style="color: #666; margin-bottom: 15px;">This is a test email to verify SendGrid is working correctly.</p>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 10px;">
          <p style="color: #999; font-size: 12px;">
            <strong>Test Details:</strong><br>
            From: ${FROM_EMAIL}<br>
            To: ${TEST_TO_EMAIL}<br>
            Time: ${new Date().toISOString()}
          </p>
        </div>
      </div>
    `,
    custom_args: {
      test_type: "sendgrid_verification"
    }
  };

  try {
    const [response] = await sgMail.send(msg);
    const messageId = response?.headers?.["x-message-id"] || "N/A";
    
    console.log(`\n✅ SUCCESS! Email sent successfully`);
    console.log(`   Status Code: ${response?.statusCode}`);
    console.log(`   Message ID: ${messageId}`);
    console.log(`\n📬 Check your email at ${TEST_TO_EMAIL} for the test message`);
    return true;
  } catch (error: any) {
    const statusCode = error?.code || error?.response?.statusCode || "Unknown";
    const errorMessage = error?.message || JSON.stringify(error);
    
    console.error(`\n❌ FAILED to send email`);
    console.error(`   Status Code: ${statusCode}`);
    console.error(`   Error Message: ${errorMessage}`);
    
    // Provide specific troubleshooting advice
    if (statusCode === 401 || statusCode === "Unauthorized") {
      console.error(`\n🔍 401 Unauthorized - This typically means:`);
      console.error(`   • API key is invalid or revoked`);
      console.error(`   • Sender email (${FROM_EMAIL}) is NOT verified in SendGrid`);
      console.error(`   • API key lacks "Mail Send" permission`);
      console.error(`\n💡 Fix: Go to https://app.sendgrid.com/settings/sender_authentication`);
      console.error(`   and verify that ${FROM_EMAIL} is in your verified senders list`);
    } else if (statusCode === 403 || statusCode === "Forbidden") {
      console.error(`\n🔍 403 Forbidden - This typically means:`);
      console.error(`   • API key lacks proper permissions`);
      console.error(`   • Account has usage restrictions`);
      console.error(`\n💡 Fix: Generate a new API key with "Mail Send" permission`);
    } else if (statusCode === 429 || statusCode === "Too Many Requests") {
      console.error(`\n🔍 429 Rate Limited - This typically means:`);
      console.error(`   • Too many emails sent in a short time`);
      console.error(`   • Account daily limit exceeded`);
      console.error(`\n💡 Fix: Wait before retrying or upgrade SendGrid plan`);
    }
    
    console.error(`\n📋 Full Error Details:`);
    console.error(JSON.stringify(error, null, 2));
    return false;
  }
}

// Run test
(async () => {
  const success = await testSendEmail();
  
  console.log("\n========================================");
  console.log("  Test Complete");
  console.log("========================================\n");
  
  process.exit(success ? 0 : 1);
})();
