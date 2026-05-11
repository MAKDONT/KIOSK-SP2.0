import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ".env.local" });

const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;
const testEmail = "mackadoodledoo100@gmail.com";

console.log("🔧 SendGrid API Test");
console.log("━".repeat(50));
console.log(`API Key: ${apiKey?.substring(0, 10)}...${apiKey?.substring(-10)}`);
console.log(`From Email: ${fromEmail}`);
console.log(`Test Recipient: ${testEmail}`);
console.log("━".repeat(50));

if (!apiKey) {
  console.error("❌ ERROR: SENDGRID_API_KEY is not set in .env.local");
  process.exit(1);
}

if (!fromEmail) {
  console.error("❌ ERROR: SENDGRID_FROM_EMAIL is not set in .env.local");
  process.exit(1);
}

sgMail.setApiKey(apiKey);

async function testSendEmail() {
  try {
    console.log("\n📧 Sending test email...\n");

    const msg = {
      to: testEmail,
      from: fromEmail,
      subject: "Password Reset - Test Email 🔑",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f5f1ed 0%, #faf8f5 100%); padding: 40px; border-radius: 20px; text-align: center;">
            <h1 style="color: #2c2416; margin: 0;">Password Reset</h1>
            <p style="color: #6b5d51; font-size: 16px;">This is a test email from your Student Consultation System</p>
            
            <div style="background: white; padding: 30px; border-radius: 15px; margin: 20px 0;">
              <p style="color: #2c2416; font-size: 18px; margin: 0;">If you requested a password reset, click the link below:</p>
              <a href="http://localhost:3000/reset-password?token=TEST_TOKEN&email=${encodeURIComponent(testEmail)}" 
                 style="display: inline-block; margin-top: 20px; padding: 15px 30px; background: #d4a574; color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              This is a test email. If you didn't request this, please ignore it.
            </p>
          </div>
        </div>
      `,
      text: "Test email from Student Consultation System"
    };

    const response = await sgMail.send(msg);
    
    console.log("✅ SUCCESS: Email sent successfully!");
    console.log(`\n📊 Response Status: ${response[0].statusCode}`);
    console.log(`📧 Message ID: ${response[0].headers["x-message-id"]}`);
    console.log(`\n✨ Check your inbox at ${testEmail} for the test email.\n`);
    
  } catch (error: any) {
    console.error("❌ ERROR: Failed to send email");
    console.error(`\n📋 Error Details:`);
    console.error(`   Status: ${error.code || error.status}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.response?.body?.errors) {
      console.error(`   SendGrid Errors:`);
      error.response.body.errors.forEach((err: any) => {
        console.error(`   - ${err.message}`);
      });
    }
    
    if (error.code === 401 || error.status === 401) {
      console.error(`\n💡 Tip: This 401 error usually means:`);
      console.error(`   1. The API key is invalid or expired`);
      console.error(`   2. The API key doesn't have Send Email permissions`);
      console.error(`   3. The account is restricted or has limits`);
      console.error(`\n🔧 Solution: Generate a new API key from SendGrid dashboard`);
    }
    
    process.exit(1);
  }
}

testSendEmail();
