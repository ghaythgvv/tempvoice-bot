# ELT Temp VC Bot

A temporary voice channel bot with a synced channel emoji, a full control
panel, and a trusted-member list for locked channels.

## What it does

- Members join **➕ Join to Create** and instantly get their own voice
  channel, named with a random emoji from a small themed set.
- Everyone who joins that channel gets the same emoji added to the front of
  their nickname — removed the moment they leave, and never stacked, even if
  someone hops between temp channels quickly.
- When the last person leaves, the channel is deleted right away.
- A control panel posts automatically in each channel's own chat as soon as
  it's created (open the chat icon on the voice channel to see it). Only the
  owner can use it, except Untrust and Transfer:
  - **Lock / Unlock**, **Rename**, **Limit**, **Kick**
  - **Change Emoji** — updates the channel and everyone currently in it
  - **Trust** / **Untrust** — trusted members can still join while the
    channel is locked
  - **Transfer Ownership** — hand the channel to someone else in it
  - **Delete**
- A live stats dashboard posts in its own channel (**📊│temp-vc-stats**) showing
  how many rooms are active, how many people are connected across all of
  them, which room's the most active right now, and a top-3 list. It updates
  itself immediately when a room is created or deleted, and every 20 seconds
  otherwise to catch people joining or leaving an existing room.
- Whatever you last set — emoji, name, member limit, locked state, and
  trusted list — is remembered per person. Leave and let your channel get
  deleted, then create a new one later, and it comes back exactly as you
  left it.

## 1. Create the bot application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open the **Bot** tab → **Reset Token** → copy it (this is your `DISCORD_TOKEN`).
3. On the same tab, scroll to **Privileged Gateway Intents** and turn on
   **Server Members Intent**. This is required — nicknames can't be changed
   without it, and the bot will fail to log in if it's off.
4. On the **General Information** tab, copy the **Application ID** (this is your `CLIENT_ID`).

## 2. Invite it to your server

Developer Portal → **OAuth2 → URL Generator**:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `View Channels`, `Manage Channels`, `Manage Roles`,
  `Manage Nicknames`, `Move Members`, `Send Messages`, `Embed Links`,
  `Read Message History`

Open the generated URL and add the bot to your server.

**Then in your server:** Settings → Roles → drag the bot's role **above** any
role whose nicknames it needs to change. Discord won't let a bot manage a
member with an equal or higher role — and it can *never* rename the server
owner, no matter where the role sits. That's a Discord limitation, not a bug.

## 3. Configure

Copy `.env.example` to `.env` and fill in the three values:

```
DISCORD_TOKEN=   # from step 1
CLIENT_ID=       # from step 1
GUILD_ID=        # right-click your server icon (Developer Mode must be on
                 # in Settings > Advanced) > Copy Server ID
```

## 4. Install & run

```bash
npm install
npm start
```

You should see `Logged in as YourBot#0000` in the console.

## 5. Set it up in Discord

Run `/tempvc-setup` once (needs "Manage Server" permission). It creates a
**Temp Channels** category with the join channel and the **📊│temp-vc-stats**
dashboard channel inside. Running it again just re-checks everything is
still in place — safe to repeat.

That's it — members can start joining ➕ **Join to Create**.

## Running it 24/7

Running `npm start` on your own PC only keeps the bot online while your PC
is on and awake. To have it survive your PC being off, run it on something
that stays on all the time instead — for example:

- A budget VPS (Hetzner, Vultr, DigitalOcean, Contabo and similar all run
  small bots comfortably for a few dollars a month).
- Oracle Cloud's free tier, which includes an always-free small instance.
- A platform made for deploying apps like this (Railway and similar), which
  trades a bit of setup simplicity for a monthly cost once you're past any
  free allowance.

On any of those, run `npm install && npm start`, and use a process manager
like **PM2** (`npm i -g pm2`, then `pm2 start index.js --name elt-tempvc`) so
it automatically restarts if it ever crashes.

## Custom icons (optional, for genuinely white icons)

A separate `elt-tempvc-icons.zip` has 9 small white PNGs — one per button.
Uploading them takes a few minutes and the bot picks them up automatically
on its next restart, no code changes needed:

1. Developer Portal → your application → **Emojis** tab (left sidebar) →
   **Upload Emoji**.
2. Upload each PNG one at a time. When it asks for a name, set it to
   **exactly** the filename without `.png` — the bot looks these up by name:
   - `lock_unlock` (Lock/Unlock)
   - `rename` (Rename)
   - `limit` (Limit)
   - `kick` (Kick)
   - `change_emoji` (Change Emoji)
   - `trust` (Trust)
   - `untrust` (Untrust)
   - `transfer` (Transfer Ownership)
   - `delete` (Delete)
3. Restart the bot (`Ctrl+C`, then `npm start` again). You'll see
   `[icons] loaded 9 custom application emoji` in the console if it found
   all of them.
4. Any temp channel created **after** the restart will show the new icons.
   Existing panels already posted won't update themselves — they'll just
   catch up the next time that channel gets recreated.

If you skip this entirely, or only upload some of them, everything still
works exactly as before — anything not found just uses its Unicode fallback,
per-icon, no errors either way.


- **Panel icons can be genuinely white, not just "close to it."** Standard
  Unicode emoji have fixed colors Discord won't let you change (🔒 renders
  gold, 🎁 renders red, etc. — no way around that for plain emoji). To get
  around it, the panel looks for **custom application emoji** uploaded to
  your bot first, and only falls back to a plain Unicode icon if it doesn't
  find one. A matching set of 9 clean white icons is included separately —
  see "Custom icons" below.
- **Emoji come from Unicode, not custom server emoji.** Discord doesn't allow
  custom uploaded emoji in channel names or nicknames — only standard ones.
  The lists live in `emojiPalette.js` as `EMOJI_SET_A` and `EMOJI_SET_B` —
  split in two only because Discord caps one select menu at 25 options, so
  the Change Emoji button shows both menus together. Add, remove, or move
  entries between them freely, just keep each set at 25 or fewer.
- **A member can only ever have one channel emoji on their name.** Applying
  or removing an emoji always strips any existing emoji prefix first (it
  looks for *any* emoji character at the start of the name, not just ones
  from the current list), so switching channels quickly can't stack two or
  three on top of each other — and it'll also clean up anything left over
  from before this was fixed.
- **Trust gives someone an explicit "allow" on that channel**, which is why
  it works even while the channel is locked — a permission set directly for
  a person overrides the locked `@everyone` setting. The channel owner
  always has this too, so locking a channel can never lock the owner out of
  it.
- **Channel renames are rate-limited by Discord** to 2 per 10 minutes per
  channel. Changing the emoji and renaming both rename the channel, so doing
  both back-to-back very quickly can briefly fail — just wait a moment.
- If a member's nickname doesn't update, it's almost always the role
  hierarchy or the server-owner limitation above, not a bug in the bot.
- **Settings are saved per person, not per channel.** They're captured the
  moment a channel is torn down (however that happens — emptying out,
  Delete, or a bot restart cleaning up an orphaned one) and applied again
  the next time that same person creates a channel. If ownership was
  transferred before deletion, the settings save under whoever the owner
  was at that point, not the original creator.
- All data (`data/*.json`) is plain JSON on disk — safe to back up, and
  fine to delete if you ever want a completely clean slate (deleting
  `userSettings.json` resets everyone's saved name/limit/lock/trust back to
  defaults; `userEmojis.json` does the same just for emoji).
