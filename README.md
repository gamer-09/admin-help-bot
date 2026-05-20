# Admin Help Bot

A Discord server management bot with welcome messages and a full progressive discipline system.

## Features

- **Auto Welcome** — Posts a welcome embed in #welcome whenever a new member joins
- **Progressive Discipline** — `/warn` auto-escalates:
  - 1st offense → Warning (DM sent)
  - 2nd offense → 10-minute Timeout (DM sent)
  - 3rd offense → Final Warning (DM sent)
  - 4th offense → Permanent Ban
- **Moderation** — `/timeout`, `/untimeout`, `/kick`, `/ban`, `/unban`
- **Records** — `/infractions`, `/clearwarnings`
- **Admin Tools** — `/purge`, `/announce`, `/slowmode`, `/lock`, `/unlock`, `/role`
- **Info** — `/serverinfo`, `/userinfo`, `/help`

## Deploy to Render

### 1. Fork / push this repo to GitHub

### 2. Create your bot at discord.com/developers/applications
- Create a New Application → Bot tab → Reset Token → copy your token
- Under **Privileged Gateway Intents**, enable **Server Members Intent**
- Save Changes

### 3. Invite the bot to your server
Use this URL (replace `YOUR_APP_ID`):
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APP_ID&permissions=1099780080694&scope=bot%20applications.commands
```

### 4. Create a Render Background Worker
1. Go to [render.com](https://render.com) → New → Background Worker
2. Connect your GitHub repo
3. Set **Root Directory** to `render-bot` (if this folder is inside a larger repo)
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

### 5. Set Environment Variables in Render
| Key | Value |
|-----|-------|
| `DISCORD_BOT_TOKEN` | Your bot token |
| `DISCORD_GUILD_ID` | Your server ID |
| `DISCORD_WELCOME_CHANNEL` | `welcome` (or your channel name) |

The bot uses a local `bot-data.json` file to store warning records. On Render free tier, this resets on redeploy — upgrade to a paid plan or swap the database module for a persistent store (PostgreSQL, Redis, etc.) if you need permanent records.

## Local Development

```bash
cp .env.example .env
# fill in .env
npm install
npm run build
npm start
```
