# LFLED Picks

Weekly parlay pool for the league. Everyone logs in with their name and a 4-digit PIN and enters one pick a week. The app then:

- pulls fantasy scores from ESPN or Sleeper automatically every Tuesday morning,
- flags the low scorer as the buyer for next week's parlay,
- lets the commissioner grade each leg, and
- tracks season records, times bought, and the parlay's own record.

## Setup (about 15 minutes)

### 1. Supabase
1. Create a new project at supabase.com.
2. Open **SQL Editor**, paste in all of `supabase/schema.sql`, and click **Run**. This creates the tables and seeds all 14 names, with Matty as commissioner. Then do the same with `supabase/migrate-002-matchups.sql`.
3. Go to **Project Settings → API** and copy the **Project URL** and the **service_role** key. Use the service_role key, not the anon key.

### 2. GitHub and Vercel
1. Push this folder to a new private GitHub repo.
2. In Vercel, import the repo.
3. Add these environment variables (see `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`: a long random string (`openssl rand -base64 32`)
   - `CRON_SECRET`: another long random string
   - `ESPN_S2` and `ESPN_SWID`: only needed if the league is on ESPN and set to private (see below)
4. Deploy, then send the URL to the group.

### 3. First login, as commissioner
1. Log in as Matty and set your PIN.
2. Go to **Commish → League settings**. Set the season, the current NFL week, the platform, and the league ID.
   - **ESPN:** the league ID is the `leagueId=` number in your league URL.
   - **Sleeper:** the league ID is the long number in `sleeper.com/leagues/<id>`.
3. Go to **Team matching**, click **Load league teams**, match each person to their team, and save.
4. Click **Pull week N scores** once to confirm scores come through.

### Private ESPN leagues
ESPN only shares a private league's data with a logged-in browser. To get the two cookies:
1. Log in at fantasy.espn.com.
2. Open DevTools → Application → Cookies.
3. Copy the values of `espn_s2` and `SWID` (keep the curly braces on SWID) into Vercel.

These cookies expire every so often. If syncing starts failing with a 401, grab fresh ones.

## How picks work
- **Weeks 1–2:** the commissioner types in each person's pick and result on the Commish page.
- **Week 3 on:** each person taps a team from that week's NFL slate to win straight up (moneyline) and writes a short reason, which everyone can see. Once a game is taken, both teams in it are off the board. Picks lock at kickoff, and results grade themselves when the game goes final.

## Weekly routine
Nothing, most weeks. Every morning at 8am ET the app moves to the current NFL week, refreshes the slate, grades finished games, and pulls fantasy scores for this week and last. The low scorer is flagged as next week's buyer once last week is final. Game results also refresh any time someone opens the page.

Optional: enter the stake, odds, and payout on the parlay ticket, and override a result if a game is postponed or cancelled.

## Notes
- PINs are hashed with bcrypt. After 5 wrong tries, that name is locked out for 15 minutes. The commissioner can reset anyone's PIN.
- Every table has Row Level Security turned on with no public policies, so the only way into the data is through this app's server.
- ESPN's API is unofficial and could change without notice. If it breaks, you can still type scores in by hand from the Commish page.
- If two people tie for low score, both are shown as buying. Split it or settle it however the league decides.
- To add or rename someone, edit the `members` table in Supabase's Table Editor.
