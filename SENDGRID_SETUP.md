# SendGrid Email Setup Guide

## Step 1: Get SendGrid API Key

1. Go to [SendGrid](https://sendgrid.com)
2. Sign up for a FREE account
3. Go to **Settings → API Keys**
4. Click **Create API Key**
5. Name it (e.g., "Consultation System")
6. Copy the key immediately (you can only see it once!)

## Step 2: Add to Your Environment

Update `.env.local`:
```env
SENDGRID_API_KEY="your-actual-api-key-here"
SENDGRID_FROM_EMAIL="earist.queue.system@gmail.com"
```

Or on Render/Railway, add to Variables:
- `SENDGRID_API_KEY` = your API key
- `SENDGRID_FROM_EMAIL` = your sender email

## Step 3: Verify Sender Email

For free tier, you need to verify the sender email:

1. In SendGrid dashboard, go to **Settings → Sender Authentication**
2. Click **Verify a Single Sender**
3. Enter your email details
4. Check your email for verification link
5. Click the link to verify

## Step 4: Deploy

The app now uses SendGrid instead of Gmail!

```bash
git add .
git commit -m "Switch to SendGrid for email delivery"
git push origin main
```

## Free Tier Limits

- **100 emails/day** (free tier)
- Unlimited after you pay (but free tier is enough for testing)
- No sending limit on verified domains

## Benefits Over Gmail

✅ Works everywhere (no network restrictions)
✅ Reliable delivery
✅ Built for transactional email
✅ Easy to scale
✅ No SMTP port blocking

## Troubleshooting

### "Unauthorized" error
- Check API key is correct
- Make sure it's not expired
- Regenerate if needed

### Emails not sending
- Verify sender email in SendGrid dashboard
- Check SendGrid Activity feed for bounces
- Look at server logs

### Free tier sending limit reached
- Wait until next day (resets at UTC midnight)
- Or create paid account for higher limits

## Next Steps

Deploy to Render/Railway and emails will work!
