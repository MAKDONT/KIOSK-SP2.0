# Keep Your Render App Running 24/7 - External Monitoring Setup

## Problem
Render puts free tier apps to sleep after 15 minutes of inactivity. This causes your KIOSK app to become unreachable until someone visits it again.

## Solution
Use a free external monitoring service to "ping" your app every 5-10 minutes, keeping it awake.

---

## Step 1: Verify Health Check Endpoints

Your app now has three health check endpoints available:

| Endpoint | Response | Purpose |
|----------|----------|---------|
| `https://your-app.onrender.com/ping` | Plain text "OK" | Simple uptime checks |
| `https://your-app.onrender.com/health` | Plain text "OK" | Alternative simple endpoint |
| `https://your-app.onrender.com/api/health` | JSON response | Detailed system info |

**Use `/ping` or `/health` for monitoring services** - they're lightweight and return instantly.

---

## Step 2: Choose a Monitoring Service

### Option A: UptimeRobot (Recommended - Most Popular)
**Sign up:** https://uptimerobot.com/

#### Setup:
1. Sign up for a free account
2. Click **"Add New Monitor"**
3. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `KIOSK App Health Check`
   - **URL:** `https://your-app-name.onrender.com/ping`
   - **Monitoring Interval:** `5 minutes` (free tier allows this)
   - Leave other settings as default
4. Click **"Create Monitor"**
5. Your app will be pinged every 5 minutes!

---

### Option B: Cron-Job.org (Alternative)
**Sign up:** https://cron-job.org/

#### Setup:
1. Sign up for a free account
2. Click **"CREATE CRONJOB"**
3. Configure:
   - **URL:** `https://your-app-name.onrender.com/ping`
   - **Execution time:** Every `5 minutes` or `10 minutes`
   - Leave other settings as default
4. Click **"Create"**
5. Your app will stay active!

---

### Option C: Freshping (Also Popular)
**Sign up:** https://www.freshworks.com/freshping/

Similar to UptimeRobot - create HTTP monitor pointing to `/ping` endpoint.

---

## Step 3: Find Your Render App URL

Your endpoint URL will be:
```
https://your-app-name.onrender.com/ping
```

Replace `your-app-name` with your actual Render service name.

**Where to find it:**
- Go to your Render dashboard
- Click your service
- Copy the URL from the top of the page
- Append `/ping`

---

## Step 4: Test It Works

### Test from Command Line:
```bash
# Test the ping endpoint
curl https://your-app-name.onrender.com/ping

# Test the health endpoint
curl https://your-app-name.onrender.com/health

# Test the detailed health endpoint
curl https://your-app-name.onrender.com/api/health
```

All three should return `200 OK` status.

---

## Step 5: Verify Monitoring is Running

After setting up your monitoring service:

1. **Check status in UptimeRobot:**
   - Dashboard shows green checkmark = app is being monitored
   - Last check timestamp updates every 5 minutes

2. **Check Render uptime:**
   - Go to Render dashboard → your service → Logs
   - You should see requests from UptimeRobot every 5 minutes
   - Example: `GET /ping HTTP/1.1 200` entries appearing regularly

3. **Wait overnight:**
   - Leave your app unattended for several hours
   - Next morning, visit your app - it should load instantly
   - Without monitoring, it would be sleeping and take ~30 seconds to start

---

## How It Works

```
Your Monitoring Service (runs every 5 min)
        ↓
    Makes HTTP request to /ping
        ↓
Your App Responds with 200 OK
        ↓
Render sees activity → Keeps service warm
        ↓
No sleep! ✅
```

---

## Cost Breakdown
- **UptimeRobot Free Tier:** ✅ Free (up to 50 monitors, checks every 5 min)
- **Cron-Job.org Free Tier:** ✅ Free (limited executions)
- **Your Render App:** ✅ Still free tier (enough for monitoring + actual traffic)
- **Total Cost:** $0 🎉

---

## Best Practices

✅ **DO:**
- Use `/ping` or `/health` endpoint (lightweight)
- Set interval to 5-10 minutes
- Test the endpoint works before and after setup
- Keep monitoring service running continuously
- Check logs monthly to ensure it's still working

❌ **DON'T:**
- Create endpoints that hit the database on every ping
- Set interval shorter than 5 minutes (overkill)
- Use expensive resources in health checks
- Forget to renew free monitoring service accounts

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Monitoring says endpoint is down | Check if Render app deployed successfully, verify URL is correct |
| App still going to sleep | Increase monitoring frequency or add another monitoring service as backup |
| Getting 502 errors on ping | Render might be deploying, try again in 1-2 minutes |
| Monitoring service account expired | Sign back in and reactivate monitor |

---

## Next Steps

1. ✅ **Deploy this code** (health check endpoints added)
2. ✅ **Sign up for UptimeRobot** (takes 2 minutes)
3. ✅ **Add monitor** pointing to `/ping` endpoint
4. ✅ **Verify** it's working in Render logs
5. ✅ **Done!** Your app is now always warm

---

## Monitoring Service Comparison

| Feature | UptimeRobot | Cron-Job | Freshping |
|---------|------------|----------|-----------|
| Free Tier | ✅ Yes | ✅ Yes | ✅ Yes |
| Min Interval | 5 min | 5 min | 5 min |
| Checks per month | ~8,640 | ~8,640 | ~8,640 |
| Dashboard UI | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Notifications | ✅ Email/SMS | ⭐ Basic | ✅ Full |
| Recommended | **BEST** | Good | Good |

---

## Questions?

If monitoring stops working:
1. Check Render logs for `/ping` requests
2. Verify monitoring service still has your URL configured
3. Try testing endpoint manually with curl
4. Check if your custom domain is still active

All endpoints are **automatic** and require **no authentication**, so they're safe to monitor publicly.
