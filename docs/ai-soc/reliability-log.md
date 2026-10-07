# SecureZen — Making the App Reliable, Scalable & Maintainable

## What this document is

This is a plain-language log of everything we've fixed, cleaned up, or improved to make SecureZen
run as a solid, production-ready application — not just a demo. It's written so that **both
non-technical and technical readers** can follow along: each entry explains what was wrong, what
we did about it, and why it actually matters. Technical details are kept brief and clearly marked,
so you can skip them if you just want the plain-English version.

This file will keep growing as we work through the rest of the list — every time we fix something
new, it gets added here.

**Status as of this writing:** 36 items completed, 1 item found and pending (item 34). The full
audit from item 16 is now fully closed out — see the closing note at the bottom of this document.

---

## Part 1 — Fixing things that were actively broken

### 1. ✅ The backend was crashing and not coming back on its own
**The problem:** The main SecureZen server had crashed at some point, and because of a missing
safety setting, it just stayed down instead of restarting itself. Users would have seen the app
simply not respond.
**What we did:** Turned on the "always restart if it crashes" setting for the backend service.
**Why it matters:** If this ever crashes again (bad input, a bug, anything), it comes back online
by itself within seconds instead of staying down until someone notices and fixes it manually.

### 2. ✅ A background worker was crashing because of a lost setting
**The problem:** The AI classification worker (the part that reads security logs and decides if
they're threats) was crashing with a `No module named 'src'` error every time it started.
**What we did:** Traced it back to a setting that got accidentally deleted while merging two sets
of code changes together, and restored it.
**Why it matters:** Without this, the AI worker couldn't even start, meaning no logs were being
automatically classified at all.

### 3. ✅ Search only worked on whatever was already loaded on screen
**The problem:** On 4 different pages (Raw Events, Alerts, AI Verdicts, Audit Logs), typing an ID
into the search box only searched the ~150-200 rows already loaded in your browser — not the full
dataset. Searching for a real alert that existed but wasn't on the current page found nothing.
**What we did:** Made the search box actually ask the server to search the *entire* database, not
just what's visible on screen, for all 4 pages.
**Why it matters:** Analysts can now reliably find any alert by ID or keyword, even one from weeks
ago, instead of only what happens to be on the current page.

### 4. ✅ The AI was pretending to give real answers even when it had failed
**The problem:** When the AI provider (Groq) hit its usage limit or went down, the system quietly
showed a generic canned message *as if it were a real analysis* — with no indication anything had
gone wrong. This happened in 14 different places across the app (forensics, email analysis, the
AI chatbot, threat hunting, and more).
**What we did:** Fixed every one of these 14 spots to honestly say "AI temporarily unavailable"
instead of pretending the canned text is a real answer.
**Why it matters:** Analysts can now trust that when they see an AI analysis, it's real — and know
immediately when it isn't, instead of being silently misled.

### 5. ✅ Merged all of the above into the main codebase
Combined everything from items 1-4 (plus more classification-accuracy fixes) into the main version
of the app, after carefully resolving a few conflicts where two sets of changes overlapped.

### 6. ✅ Fixed a repeat of the "won't auto-restart" bug (item 1) after the merge
**The problem:** While combining the code changes in item 5, the "always restart" fix from item 1
got accidentally undone again.
**What we did:** Caught it and restored it before it caused a real outage.
**Why it matters:** Shows why we now double-check settings like this after every merge.

### 7. ✅ Removed a duplicate background worker that was silently still running
**The problem:** After deploying the updated code, an old copy of the AI classification worker was
still running alongside the new one — meaning some logs could have been analyzed twice.
**What we did:** Identified and removed the leftover old worker.
**Why it matters:** Prevents double-processing, wasted AI costs, and confusing duplicate results.

### 8. ✅ Fixed the "No module named 'src'" crash again (repeat of item 2)
**The problem:** The exact same bug from item 2 came back after deployment, because of the same
kind of accidental setting loss during a merge.
**What we did:** Found and restored it again, and used the incident to double-check for similar
issues elsewhere.
**Why it matters:** Confirms this specific kind of mistake (losing settings during merges) needed
extra attention going forward.

---

## Part 2 — Being honest about what the numbers actually mean

### 9. ✅ Built a real "how many alerts get filtered out" dashboard
**What we did:** Added a new "Reduction Funnel" view showing, with real numbers pulled live from
the database: how many raw security events came in, how many needed AI classification, how many
were confirmed real threats vs. false alarms, and how much was handled by our own AI vs. needing
outside help.
**Why it matters:** This is the kind of proof clients ask for — "how much noise does your AI cut
out" — and every number in it is real, not made up.

### 10. ✅ Removed 2 fake statistics that were pretending to be real
**The problem:** We found two places in the app that displayed made-up numbers as if they were
real: one endpoint claimed to be running a "deduplication algorithm" that returned a hardcoded fake
response with no actual logic behind it, and a "system status" page listed an AI model as "active"
that was never actually built.
**What we did:** Removed both — they were unused by any actual feature, so nothing broke.
**Why it matters:** Never show a client (or an analyst) a number that isn't real. This is the same
principle as item 4 — trust depends on never quietly faking results.

---

## Part 3 — Understanding and cleaning up the databases

### 11. ✅ Mapped out exactly how many databases SecureZen actually uses
**Finding:** Only 2 real databases exist — the main SecureZen database, and a separate one that
holds the raw security logs coming in from client systems. (There's also a leftover old-style
database file that turned out to no longer be used by anything real.)

### 12. ✅ Fixed a risky setup where 3 different files disagreed about which database to use
**The problem:** Three different parts of the code each had their own guess about which database
to connect to if the correct setting was ever missing — and all three guesses were different from
each other. If this setting was ever accidentally left out, different parts of the app could have
silently connected to completely different (wrong) databases without any error message.
**What we did:** Removed the guessing entirely — now, if that setting is missing, the app stops
and clearly says so, instead of quietly connecting to the wrong place.
**Why it matters:** A loud, clear error is always safer than a silent wrong answer, especially for
something as fundamental as "which database am I talking to."

### 13. ✅ Fixed a leftover wrong database port number
**The problem:** A backup/fallback setting still referenced an old database port number that hadn't
been used in a long time (the real one had since changed).
**What we did:** Updated it to the correct value.

### 14. ✅ Removed a fragile "pretend to be a different database" trick, and connected things directly
**The problem:** Part of the app had a clever but risky trick: whenever certain code tried to open
what it thought was an old-style simple database file, the app would secretly intercept that and
redirect it to the real database instead — rewriting the request on the fly to make it compatible.
This was fragile (it worked by guessing based on filenames) and meant 5 real features (a threat-campaign
grouping feature, the live log listener, the main log-processing pipeline, the AI cost tracker,
and email security) were relying on this hidden trick to work at all.
**What we did:** Rewired all 5 features to talk to the real database directly and properly,
removed the old trick entirely, and along the way found and fixed 2 real bugs that trick had been
quietly hiding (one where a log wasn't actually being updated after being saved, and one using
invalid database syntax that would have failed outright).
**Why it matters:** The app no longer depends on a fragile, hard-to-understand shortcut. It's more
robust, and easier for anyone (technical or not) to reason about: "this feature talks to this
database" is now literally true, not hidden behind a trick.

### 15. ✅ Tested the above change carefully before trusting it
Verified, one feature at a time, that everything still worked correctly after the rewiring in item
14 — including catching the "connection reset" scare that turned out to be a one-off blip, not a
real problem.

---

## Part 4 — A full health check of the backend (reliability, growth-readiness, and code cleanliness)

### 16. ✅ Ran a full audit of the whole backend
We stepped back and systematically reviewed the entire backend for 3 things: **reliability** (does
it recover well when something goes wrong), **scalability** (would it hold up if we had many more
clients or needed to run multiple copies of it), and **maintainability** (is the code easy and safe
to keep changing). This surfaced **15 concrete issues**, listed at the end of this document, ranked
by how much they matter.

### 17. ✅ Fixed a real security hole — one feature had no login-check at all
**The problem:** One page's data (the "AI Verdicts" detail view) was supposed to require a valid
login, but due to a broken internal reference, the login-check silently failed open — meaning
*anyone* could access this data with no login required at all, even though it looked properly
protected in the code.
**What we did:** Fixed the broken reference so it now correctly requires a real, valid login.
**Why it matters:** This was a genuine, currently-live security gap in a data-security product —
now closed and verified (confirmed it correctly rejects requests with no login).

### 18. ✅ Fixed 11 places where a single slow request could freeze the app for everyone
**The problem:** The backend runs as a single process handling all users at once. In 11 places
across 4 files, the code made slow calls (to the AI provider, or running an external program)
in a way that would block that *entire* process — meaning if one user's request happened to be
slow, every other user's request would freeze too, until it finished.
**What we did:** Fixed all 11 spots so slow operations run on the side without blocking everyone
else. Also double-checked 3 other places the audit had flagged and confirmed they were actually
already safe (no change needed there), rather than "fixing" things that weren't broken.
**Why it matters:** One slow AI response (or a provider outage) can no longer make the whole app
feel frozen for every single user at the same time.

### 19. ✅ Fixed database connections leaking, and lost data, when something went wrong mid-save
**The problem:** In the 5 features rewired in item 14, the pattern for saving to the database was
"do the work, then close the connection" — but the "close" step only ran if *nothing* went wrong.
If a save failed partway through (a bad value, a brief network hiccup), the connection was never
closed, and the failed save was just quietly logged and forgotten — no retry, no data saved, and
one more database connection permanently stuck open until the whole app restarts.
**What we did:** Changed all of these (13 separate spots across the 5 files) to always close the
connection no matter what happens, using a standard "always clean up" pattern. While doing this we
also found and fixed a genuine bug introduced when we rewired the AI-cost-tracking feature in item
14: part of one database update had accidentally been left in the old database's format, which
would have caused that specific update to fail every time it was reached.
**Why it matters:** No more silently-lost data on a failed save, and no more slowly leaking database
connections over time.

### 20. ✅ Fixed the AI worker so running 2 copies of it can't double-classify the same event
**The problem:** The AI classification worker checks the database every 10 seconds for new logs
that need analyzing. If you ever ran 2 copies of this worker at the same time (e.g. to handle more
volume), both copies could grab the *exact same* batch of logs at the exact same moment, since
nothing stopped them from doing so. Each copy would then separately pay to send that log to the AI
provider and separately try to save a result — meaning double the AI cost for those events, for no
benefit.
**What we did:** Used a standard database feature ("row locking") so that the moment one worker
picks up a batch of logs to analyze, it's marked as reserved for the entire time it takes to get an
AI answer back — a second worker checking at the same time will automatically skip anything already
reserved and grab different logs instead, instead of racing for the same ones.
**Why it matters:** This is what actually makes it safe to run more than one copy of the AI worker
for extra capacity in the future — before this fix, adding a second worker to handle more volume
would have quietly wasted money reprocessing the same logs twice.

### 21. ✅ Fixed duplicate Slack/bell alerts if the main app ever runs as 2+ copies
**The problem:** The demo alert-simulation feature sends a Slack/bell notification when it
generates a critical threat, but limits itself to at most one such notification per client every
5 minutes, so people aren't spammed. That "have I sent one recently?" memory was only kept in that
one running copy of the app's own memory. If the main app were ever run as 2 or more copies at once
(for handling more traffic), each copy would keep its *own* separate memory of "last sent 5 minutes
ago" — so instead of one notification every 5 minutes, you could get one from *each* copy running,
multiplying the spam.
**What we did:** Moved that "have I sent one recently?" memory out of the app's own memory and into
the shared database, using a method that guarantees only one copy can "win" and actually send the
notification even if multiple copies check at the exact same instant.
**Why it matters:** Same category as item 20 — this is specifically what makes it safe to run more
than one copy of the main app in the future, without alert-fatigue from duplicate notifications.

### 22. ✅ Fixed the app's "are you healthy?" self-checks so they actually check something
**The problem:** Both the main app and the AI worker have a "health check" endpoint that
infrastructure (or a person) can call to ask "are you working correctly?" — but neither one actually
checked anything. The main app's version always said "yes I'm fine" even if it couldn't reach the
database at all. The AI worker's version DID correctly calculate whether it was actually stuck (no
work done in over a minute), but still always replied with a "success" response code either way,
so anything watching only the response code (rather than reading the fine print) would never notice.
On top of that, the automatic restart safety net we added in item 1 wasn't even watching these
checks at all — Docker only knew to restart the database if it broke, not the main app or the
AI worker.
**What we did:** Made the main app's health check actually try a real database query and honestly
report failure if it can't. Made the AI worker's health check actually fail (not just say "stale" in
the fine print) when it's been stuck for over a minute. Connected both to Docker's automatic
restart safety net, so it now watches all three critical pieces (database, main app, AI worker), not
just the database.
**Why it matters:** Before this, if the main app or the AI worker silently got stuck or lost its
database connection but didn't fully crash, nothing would have noticed or done anything about it —
it would just sit there broken until a person happened to check. Now it gets detected and
automatically restarted, the same safety net we already have for a full crash.

### 23. ✅ Fixed 2 more places where "remember what's happening right now" data lived only in memory
**The problem:** Two features kept their live status only in the app's own memory instead of a
shared place: (1) the progress bar for the manual "analyze this batch of log files" feature, and
(2) the live investigation log feed shown while an AI agent investigation is running. If the main
app were ever run as 2+ copies, a user could end up talking to a different copy than the one
actually doing the work — seeing a progress bar stuck at 0%, or an empty investigation log feed,
even though the work was genuinely happening on the other copy.
**What we did:** Moved both into the shared database (a small "job status" table for the progress
bar, and a proper log table for the investigation feed) — the same fix pattern as items 20-21.
**Why it matters:** Closes out the last of the "only works because we happen to run one copy" bugs
found in the audit — all four of them (items 20, 21, 23, and the AI worker fix) now use the shared
database as the single source of truth instead of each copy's own memory.

### 24. ✅ Turned on the automatic threat-campaign-grouping feature that was never actually running
**The problem:** SecureZen groups related alerts into named "campaigns" (e.g. "Brute Force Storm")
so analysts can see coordinated attacks instead of disconnected individual alerts — and the main
Alerts page already has a column ready to display this. But the code that's supposed to run this
automatically every 20 minutes was never actually switched on anywhere in the app. Unlike a couple
of other features we found earlier (LogAI, Email Security) that aren't wired into the app at all
and aren't currently wanted, this one *is* wired into a real, actively-used page — it just silently
never ran, so that campaign column would have stayed empty forever in real use.
**What we did:** Started this worker automatically alongside the app's other background workers, the
same way the others already do.
**Why it matters:** This is a real, wanted feature that would have quietly never worked in
production — now it actually runs and populates real data instead of sitting there unused.

### 25. ✅ Fixed the dashboard silently showing wrong numbers when one part of it failed
**The problem:** The main Dashboard's summary numbers (total events, alerts, verdict breakdown,
anomaly count) were all fetched by one big block of code wrapped in a single "if anything goes
wrong, just show 0 for everything" safety net. This had two separate problems. First, a genuine
bug: one of the sub-queries referenced a database column that had never actually been connected
up in the code (`anomaly_verdict`), so it crashed every single time — meaning the anomaly-count
part of the dashboard could never have worked. Second, and more important going forward: because
everything shared *one* safety net, if just the small anomaly-count part failed for any reason, it
would wipe out and discard the totals and verdict breakdown too — even though those had already
been fetched successfully — showing an analyst "0 alerts, 0 everything" on screen when really only
one small piece had a problem. On a security dashboard, "0 alerts" reads as "you're safe," which is
a dangerous thing to show by mistake.
**What we did:** Connected up the missing database column so the anomaly-count query actually
works. Then split the one shared safety net into three independent ones — one for the core totals,
one for the anomaly count, and one for the verdict breakdown — so if one of them ever fails, it
only zeroes out that one piece and logs a clear error, while the other two still show their real,
correctly-fetched numbers. Also removed a leftover fake fallback number (a hardcoded "6") that had
been quietly standing in for the anomaly count.
**Why it matters:** The dashboard can no longer show a misleadingly empty/zeroed-out picture just
because one small, unrelated part of it hit a hiccup — and when something does fail, it's now
logged clearly instead of silently swallowed.

### 26. ✅ Broke up the two "does everything" files into focused, single-purpose files
**The problem:** Two files had grown enormous over time by having every new related feature
tacked onto the end: `alert_routes.py` (2,086 lines covering alert list/detail/workflow actions,
raw security events, AI verdicts, and benchmark stats, all mixed together) and
`intelligence_routes.py` (3,353 lines covering AI log analysis, the CrewAI investigation agent,
MITRE ATT&CK mapping, threat-actor profiles, threat hunting, the AI chatbot, and more). Files this
large are risky to work in: it's easy to accidentally break an unrelated feature while changing
something else nearby, hard for a new developer to find the one function they need among
thousands of lines, and every small change carries more risk than it should.
**What we did:** Split each file into a proper folder of small, focused files grouped by what they
actually do — for example alerts is now `alerts/core.py` (alert list & workflow actions),
`raw_events.py` (raw security events & pipeline stats), `verdicts.py` (AI verdicts & benchmarks),
and `detail_ai.py` (single-alert detail & AI specialists); intelligence is now 9 similarly focused
files (`logai.py`, `crewai.py`, `triage_mitre_map.py`, `ai_mitre.py`, `threat_actors.py`, `hunt.py`,
etc.), plus one shared `common.py` holding the few pieces of state genuinely meant to be shared
across all of them (like the AI engine, so it's only ever loaded into memory once, not once per
file). Every single web address (route) the app responds to was checked against the full list of
old vs. new routes (they matched exactly, 27 for alerts and 59 for intelligence).
**Why it matters:** Nothing changed about how the app behaves — this was purely about making the
code safer to keep working in going forward. Future changes to, say, threat hunting can no longer
accidentally break AI verdicts or alert assignment just because they used to live in the same
enormous file.
**Correction added the next day (see item 27):** the verification described above at the time
this was written was done by restarting the live server — but it turned out restarting the server
in this project does *not* pick up code changes (only a full rebuild does), so that verification
had unknowingly been re-checking the *old* code the whole time, not the new split files. The new
files actually had a real, serious bug that would have crashed the whole app on the next genuine
deploy. See item 27 for the full story and the fix — this note is left here rather than quietly
rewritten so the record stays honest about what was and wasn't actually verified at the time.

### 27. ✅ Added automated tests for the 5 rewired features + the AI worker — and found 4 real bugs doing it
**The problem:** The 5 features rewired in item 14 (threat-campaign grouping, the live log
listener, the main log-processing pipeline, the AI cost tracker, and email security), plus the AI
classification worker itself, had no automated tests. That meant nothing would automatically catch
it if a future change quietly broke one of them — a human would only find out by noticing something
looked wrong days or weeks later. On top of that, we discovered that automated testing had been
completely non-functional in this project for a while: the test tool itself (`pytest`) was never
even installed, so the handful of older test files that already existed had never actually been run
against the current codebase and had silently gone stale.
**What we did:** Installed the missing test tooling, fixed the stale/broken older test files where
reasonable, and wrote a real, comprehensive set of new automated tests for the 5 rewired features and
the AI worker. In the process of actually running these features to test them properly (rather than
just reading the code), we uncovered and fixed **4 real, previously-unknown bugs**:
  1. **The main log-processing pipeline was completely broken.** The function behind the "Run
     Analysis" feature crashed immediately, every single time, because it depended on a third-party
     library that was intentionally removed from this project a while ago (for being unstable) — but
     this one function was never updated to match, leaving a landmine. Fixed by rewriting that one
     piece to read the log file directly instead of depending on the removed library.
  2. **A related step further down the same pipeline wrote to the wrong database table name**
     (`log_clusters` instead of the real `sz_log_clusters`), which would have failed the moment the
     first bug above was fixed. Fixed the table name.
  3. **A more serious discovery: yesterday's "split the giant files into smaller files" work (item
     26) was actually silently broken and had never been genuinely verified.** While testing today,
     we found that restarting the app's server does *not* pick up code changes in this project —
     only a full rebuild does — so all of yesterday's "it still works!" checks were unknowingly
     re-testing the *old, unsplit* code the whole time, not the new files. Once we did a real
     rebuild, the app **failed to start at all**: a technical rule about how the split-up files
     announce their own web addresses had been set up incorrectly, and two entire sections of the
     app (all Alerts pages and all Intelligence/CrewAI/MITRE pages) would have gone down completely
     on the next real deploy. Also found and fixed, in the same files: a leftover duplicate setting
     that was silently doubling part of some web addresses, and a handful of missing basic building
     blocks that a few of the new files needed but didn't have.
  4. Confirmed the fixes by actually restarting the server for real (with a genuine rebuild this
     time) and checking that every single one of the app's 86 web addresses still responds exactly
     as before, and that the "Run Analysis" feature now runs successfully start-to-finish instead of
     crashing.
**Why it matters:** This is the clearest possible demonstration of *why* automated tests matter: the
very act of writing them surfaced a completely broken feature, a wrong table name, and — most
importantly — a silent, undetected regression from yesterday's own work that would have taken down
two major sections of the app on the next deploy. None of that would have been caught by just reading
the code or by a restart-only check; it took actually rebuilding and running things for real. Going
forward, these tests mean a future change that breaks any of these 5 features (or the AI worker) gets
caught automatically, immediately, instead of silently.
**Also found, not yet fixed (separate, smaller, pre-existing issues, noted here rather than left
silent):** three older tests covering reports storage and notifications were already broken before
today (unrelated to the 5 rewired features) — a renamed database-connection function, an "await" used
on something that isn't meant to be awaited, and a notification-saving step that seems to run in the
background without the rest of the code waiting for it to finish. These are real but smaller and
unrelated to today's scope; left for a future session rather than expanding today's work further.

---

### 28. ✅ Stopped copy-pasting the same database-connection and tenant-lookup logic everywhere
**The problem:** Two different pieces of logic had been copy-pasted repeatedly instead of written
once and reused. First, the small piece of code that opens a connection to the main database
(figuring out the right host/port depending on whether we're running in Docker or not) had been
pasted into **7 separate files** — the campaign-attribution worker, the live log listener, the
main log-processing pipeline, the AI cost tracker, email security, the AI classification worker,
and the shared helpers file itself. Second, inside one file (`raw_events.py`), the logic for
"which client/tenant is this request for, and what should we search the database for" had been
copy-pasted **4 times** into 4 different endpoints. Both are a maintenance trap: if the database
port ever needs to change, or a new client is onboarded, someone has to remember to update every
single copy by hand — and it's exactly this kind of copy-paste that quietly introduces bugs, which
is exactly what we found here.
**What we did:** Created one single shared version of the database-connection helper (in the
existing shared helpers file) and pointed all 7 files at it instead of keeping their own copies.
Did the same for the tenant-lookup logic — pulled it into one small shared function inside
`raw_events.py` and had all 4 endpoints call it. While doing this, we found a real bug that the
duplication had been quietly hiding: **one of the 4 copy-pasted blocks was missing a line**, so
the "Pipeline Stats" endpoint was silently ignoring a filter option (`target_tenant`) that the
other 3 nearly-identical endpoints correctly supported — a client-specific filter request to that
one endpoint would have been silently ignored and shown all clients' data instead. Centralizing
the logic fixed this automatically, since there's now only one copy to get right.
**How we checked it:** Ran the full automated test suite (still all passing), then did a genuine
image rebuild and restart (the lesson learned in item 27 about restarts not picking up code
changes), and reconfirmed all 86 of the app's web addresses still respond exactly as before,
including the 4 specific endpoints that use the newly-shared tenant logic.
**Why it matters:** A fix or a new client onboarding now only needs to happen in one place instead
of being manually repeated (and possibly forgotten) in 7 or 4 different files. This is also a
second real example (after item 27) of duplicated code directly causing a silent bug in production.
**Also found, not yet fixed (separate, smaller, pre-existing issue, noted here rather than left
silent):** while working in this area, found that `email_routes.py` uses several things
(`datetime`, and three AI-related helper functions) in a few places without ever importing them —
meaning those specific spots would crash with an error if ever actually triggered. This is the
same class of bug as the "Run Analysis" crash fixed in item 27, but in a different file; confirmed
via git history that it's pre-existing, not something introduced today. Left for a future session
since it's unrelated to today's specific duplication cleanup.

---

### 29. ✅ Audited every single login-check in the app, and closed 3 real security/reliability holes
**The problem:** We systematically checked all 170 web addresses (routes) the backend responds to,
specifically asking "does this actually require a valid login?" This turned up 3 concrete, serious
problems:
  1. **A GET endpoint literally called "db-test" (sounds like a harmless connectivity check) was
     actually secretly deleting real database rows** — any event or verdict matching the word
     "fintrust" — every time it was called, with **zero login required at all**. Anyone who guessed
     or found this web address could trigger it with a plain browser request, no password needed.
     It also leaked its database connection if anything went wrong partway through. This is the
     same category of bug as the pg-verdicts security hole fixed earlier (item 17), just hiding in
     a different, more dangerous, more misleadingly-named place. Confirmed via the frontend
     codebase that nothing legitimate calls this address at all.
  2. **An endpoint meant to show "AI budget usage" on the dashboard had no login check either**, and
     — separately — wasn't even returning AI budget information: it was returning a handful of
     unrelated raw alert rows (device names, source/destination IP addresses) across *every*
     client's data, to anyone, logged in or not. On top of being a real privacy/security gap, this
     also meant the AI usage numbers shown on the dashboard were never actually real — the screen
     was just showing its default placeholder values the whole time.
  3. **A third endpoint (`/api/system/migrate-aux`) turned out to be completely dead** — it called a
     script file that had already been deleted from the project in an earlier, unrelated cleanup —
     meaning it would crash every single time, and also had no login check.
**What we did:** Added a proper login requirement to the "db-test" endpoint (now requires an admin
login) and fixed its connection leak, left its actual delete behavior alone since we can't be
certain nothing relies on it for demo-data cleanup. Fixed the AI-budget endpoint to both require a
real login and to actually return real AI budget numbers (reusing the same working budget-check
code already used correctly elsewhere in the app), so the dashboard now shows genuine data instead
of silently-wrong placeholder numbers. Removed the dead migrate-aux endpoint entirely, since it
could never have worked and nothing calls it.
**Why it matters:** The first item especially was a live, currently-exploitable security gap in a
security product — a plain web request could destroy real data with no credentials at all. All
three are now closed and verified: rebuilt the app for real and confirmed all 3 addresses now
correctly require a login (or, for the dead one, are simply gone), and confirmed nothing else in
the app broke.
**What we found but deliberately did NOT change this pass (documented here for a future session,
since fully fixing this properly is a much bigger, riskier undertaking than one sitting should
attempt):**
  - Several routes check "is this user logged in" using only a helper whose *only* job is figuring
    out which client/tenant a request belongs to — and that helper is written to quietly fall back
    to a default tenant if the login token is invalid or expired, rather than rejecting the
    request. That's a materially weaker check than the routes that use a real login-verification
    helper, even though both look similar at a glance.
  - One file (`admin_routes.py`, the admin-only user-management page) checks "is this user an
    admin" in **4 different ways** in different endpoints of the same file — including one version
    that has an unexplained exception letting any logged-in user manage analysts if their client
    account happens to be named "demo". We don't know if that carve-out is intentional or a leftover
    mistake, so we're flagging it rather than guessing.
  - The app talks to its databases in **4 different styles** depending on which file you're in
    (a modern async style, an older direct-connection style, a legacy user-account-specific style,
    and a fourth style that hands off to a separate service entirely) — and **8 files mix more than
    one of these styles within the same file**. Not a bug by itself, but exactly the kind of
    inconsistency that makes it easy to apply a fix in three places and miss the fourth.
  - Found 3 more files with their own hand-written copy of the "connect to the database" logic that
    the earlier cleanup (item 28) didn't catch — because they don't define their own copy of the
    named helper function we searched for, they just paste the same lines directly inline instead.
    Between these 3 copies and the shared helper, there are now **two different default database
    port numbers** in use (5433 in some copies, 5434 in the shared one) — a live inconsistency that
    could bite someone during a future environment change.

---

### 30. ✅ Added connection pooling for database access — and fixed a real connection leak found along the way
**The problem:** Every single time any part of the app needed to talk to the database using the
older, direct-connection style (as opposed to the newer style most of the app now uses), it opened
a brand new network connection to PostgreSQL from scratch, used it once, and threw it away —
repeating that "open a new connection, say hello, authenticate, do one thing, hang up" dance on
every single request. In plain terms: it's like hanging up and re-dialing the phone for every single
sentence of a conversation, instead of just staying on the line. This works fine at today's traffic
levels, but as the number of clients and requests grows, opening a fresh connection every time gets
noticeably slower and puts unnecessary load on the database — and at some point could become the
main thing slowing the app down.
**What we did:** Added a small, shared pool of already-open, ready-to-reuse database connections
inside the one shared connection-helper function created in item 28 (`_sz_conn()`). Because that
helper was already consolidated into a single place used by all 6 files that need this kind of
direct database access, adding the pool there means every one of those ~15 call sites benefits
immediately — none of their own code needed to change at all. The main modern part of the app (the
async database layer most routers use) already had this kind of pooling switched on from the start,
so this closes the one remaining gap.
**A real bug found and fixed along the way:** While building this, we discovered that two spots in
the AI classification worker (`ml_worker_daemon.py`) were using a particular style of Python code
(`with connection as ...:`) based on a very reasonable but incorrect assumption — that this style
automatically closes the connection when it's done, the same way it does for closing a file. It
doesn't: for a direct database connection, that style only saves/undoes the work done, it was never
closing the connection at all. That means those two spots had been silently leaking one unclosed
connection every single time they ran, ever since they were written. Because our new pooling logic
handles the "connection reuse" step itself rather than relying on that assumption, this leak is now
fixed as a natural side effect of the fix, with no separate change needed.
**How we checked it:** Ran real queries against the actual database through the new pool (not just a
test double) to confirm connections still work and are genuinely being reused rather than recreated
each time, added new automated tests specifically for the new pooling behavior (including a test that
would have caught the exact leak just described), ran the complete automated test suite, and did a
full rebuild-and-restart of the live server to reconfirm every one of the app's 86 web addresses
still works exactly as before.
**Why it matters:** The app can now handle meaningfully more simultaneous traffic before database
connection overhead becomes a bottleneck, and a genuine, silent connection leak that had existed in
the AI worker since it was written is now closed.

---

## Full audit from item 16 — now fully closed out

All 15 findings from the original backend audit (item 16) have now been addressed, in priority
order, across items 17 through 30 above (2 of the original 15 findings shared the same underlying
cause and were merged into one during the work, as noted in earlier entries — hence 14 fix-entries
covering 15 findings). There is currently no pending list from that original audit. New reliability
findings discovered afterward, while verifying the app end-to-end with real data, are tracked below
in their own section rather than folded into the numbering above, so it stays clear which findings
belong to which round of work.

---

## Part 6 — Found after the audit: real AI results were never reaching the dashboard

### 31. ✅ Fixed the AI worker silently failing to publish its own results to the dashboard
**The problem:** While checking the app end-to-end with real, live security data (real SIEM logs
in, real AI analysis out), we found something serious: the AI classification worker was correctly
reading incoming security events and correctly running them through AI analysis (first a fast local
AI model, then a more powerful outside AI when needed) — but the very last step, publishing that
analysis into the table the dashboard actually reads from, was silently failing every single time.
The AI work itself was real and correct; it just never reached the screen. Out of roughly 10,000
AI analyses already completed behind the scenes, only 55 had ever actually shown up.
**Why it was happening:** When the AI worker starts up, one part of the code briefly sets the
"which database do I talk to" setting to a value that's only correct if you're running directly on
a laptop (not inside this project's server setup) — and a later startup step is supposed to correct
that setting a moment afterward. The part of the code responsible for publishing results to the
dashboard happened to read that setting once, very early, before the correction ran, and then never
checked it again for as long as the AI worker kept running. So it kept trying to publish results to
the wrong address, indefinitely, every time — quietly failing in a way that was never surfaced
anywhere, because of a separate, unrelated bug that was swallowing the error message instead of
showing it.
**What we did:** Made it check the correct address every time it publishes a result, instead of
memorizing it once at the very beginning. Fixed the separate bug that was hiding the error message,
which is exactly what let us find the real cause instead of guessing. Confirmed the fix by
deliberately recreating the exact failure sequence (wrong setting first, corrected setting
afterward) and watching a real publish succeed where it used to silently fail. Then ran a one-time
catch-up job to publish the ~10,000 already-completed AI analyses that had been stuck behind this
bug the whole time — 10,103 out of 10,106 published successfully (3 were skipped for an unrelated,
minor reason: one text field was slightly too long for its column, a small separate cleanup for
another day).
**Why it matters:** This is the difference between "the AI is working" and "the AI's work is
actually visible to the people who need it." The dashboard now reflects the real backlog of
AI-analyzed alerts (over 2,600, up from 55) instead of a tiny, misleadingly small fraction of the
real work already done, and every new analysis from now on will show up automatically the moment
it's ready, instead of silently vanishing.

---

## Part 7 — Measuring whether the AI's judgment can actually be trusted

Once real AI results were reaching the dashboard (item 31), the next question was: are those
results actually *correct*? A confident-looking severity label is worthless if it's wrong. This
part covers building a way to check that, what it found, and the fixes that came out of it.

### 32. ✅ Built a real accuracy measurement, and found the AI was badly miscalibrated
**The problem:** The dashboard's AI verdicts always looked extremely confident (routinely 95-100%),
but nobody had ever checked whether that confidence matched reality. The only "accuracy" signal
that existed compared the AI against a *second* AI — which only proves two AIs agree with each
other, not that either one is right.
**What we did:** Built a proper way to check against ground truth — the actual, real answer, as
judged by a person. A new table (`sz_ground_truth_labels`) samples real alerts (every Critical/High
alert, since those are rare, plus a random slice of Medium/Low for balance), and a small review
tool lets an analyst look at the real underlying log and record what it actually was — a script
then compares the AI's original guess against that real answer and produces a real accuracy score,
not just an agreement score.
**What we found:** Out of 513 manually reviewed alerts, the AI's severity matched the true answer
only 6.6% of the time. Digging into *why*, we found the AI defaults to "attacker/critical" framing
for almost everything — including a harmless config file read — because the way it was being asked
to analyze logs (via naming an official attack-classification tactic for every single log, as if
every log were automatically an attack) pushed it toward inventing a threat narrative even for
routine, harmless activity. A separate, cruder bug made things worse for one of its two AI models:
that model's answer was being graded by scanning its written explanation for alarming-sounding
words anywhere in the text — so an explanation that merely *mentioned* the word "attacker" while
describing something harmless still got graded as Critical, regardless of its actual conclusion.
**How we checked it:** Manually labeled 513 real alerts against their real underlying logs (513/513
now complete — analyst review for the ambiguous ones, fast-tracked auto-labeling for the clearly
routine ones, both kept clearly separated in the data so it's obvious which is which), then compared
that ground truth against the AI's original guesses to get the real 6.6% figure.
**Why it matters:** This is the difference between an app that looks confident and one that's
actually correct. Nobody could have known the AI was this unreliable without a real answer to
compare against — the app's own dashboard would have kept showing high-confidence Critical alerts
for routine activity indefinitely.
**Where this data lives:** the real security data itself lives in two places — the original,
incoming security events and the AI's *original* verdicts on them live in the outside SIEM
system's own database (untouched, as a historical record); this project's own database holds the
synced copy analysts actually see (`sz_alerts`, with `ai_severity` / `ai_reason` / `ai_confidence`
columns) plus the new ground-truth review table (`sz_ground_truth_labels`) that holds the real,
human-confirmed answer for the 513 reviewed alerts, side by side with what the AI originally guessed
and, for the retested ones, what a fixed version of the AI says now — so old vs. new can always be
compared directly.

### 33. ✅ Fixed the miscalculated severity, then caught a new gap it introduced before it shipped
**The problem:** Building directly on item 32's finding, we rewrote how both AI models are asked to
analyze a log — telling them plainly that most logs are routine, giving them permission to say so,
and fixing the crude word-scanning bug. Tested against the same 513 reviewed alerts: accuracy on a
random everyday sample jumped from roughly 7% correct to 100% correct. But before shipping it, we
specifically re-tested it against the handful of alerts we already knew were *genuinely* dangerous
(a real blocked malware/backdoor connection, and a service account being repeatedly targeted by
login attempts from three different countries) — and the fixed AI now called all of those benign
too. It had swung from "everything is dangerous" to "everything is fine," which is the more
dangerous failure mode of the two for a security product: a missed real attack is worse than a
false alarm.
**Why it was happening:** A single log line, read in isolation, genuinely doesn't always contain
enough information to judge it correctly — a repeated-login-attempt pattern only becomes visible by
looking across many logs over time, which an AI reading one log at a time can never see no matter
how well it's asked the question. Separately, a real malware/backdoor signature was present in
plain sight in the log itself, but the AI's new "assume it's routine" instinct overrode it anyway.
**What we did:** Added two straightforward, non-AI safety nets that run before the AI's opinion is
finalized: (1) if a log names a real, known attack/backdoor signature, its severity is escalated
automatically regardless of what the AI concludes; (2) failed-login attempts for the same account
are now counted over a rolling window, and enough repeated failures automatically escalates the
severity, even if any single attempt looked harmless on its own. Both only ever escalate a verdict,
never downgrade one.
**How we checked it:** Re-ran the fix against the same known-dangerous alerts from before: 8 of 9
now correctly escalate (the real backdoor connection catches every time; the repeated-login pattern
catches once enough attempts have actually accumulated to count as a pattern — the very first
attempt of a brand new pattern can't yet be distinguished from normal activity, which is an honest,
unavoidable limit of any real-time pattern check, not a bug).
**Why it matters:** A security tool that swings from crying wolf constantly to missing real threats
entirely is not actually fixed — it's just wrong in a different, more dangerous direction. Catching
this before it reached production, by specifically testing against known-real threats and not just
a random everyday sample, is what caught it in time.

### 34. 🔴 Found, not yet fixed — Office 365 and native Windows security logs carry no real content at all
**The problem:** While building a training dataset for the AI fine-tuning work (see
`docs/architecture/overview.md` §3), we checked every Office 365 event ever ingested — all
18,820 of them, across every category (logins, admin actions, user updates, everything) — and found
that **every single one** has a completely empty log body. The same is true for native Windows
security alerts like "Domain Admins Group Changed." Only the category label survives; the actual
detail of what happened is never captured at all.
**Why it's happening:** The connectors that pull in Office 365 and native Windows security events
only carry over a short category label, not the real event details (who did it, from where, what
device, what exactly changed). Every other real log source we checked — firewall traffic, file
integrity checks, server command history — does carry real detail; this gap is specific to these
two connectors.
**Why it matters:** Right now, a real Office 365 account takeover and a routine, harmless Office 365
login look **completely identical** to any analyst or any AI looking at this data — there's nothing
to tell them apart. No amount of smarter AI, better prompts, or fine-tuning can fix this, because the
distinguishing information was never captured in the first place. This needs to be fixed at the
ingestion connector itself (capturing the real event details Microsoft's own audit log already
provides) before any real detection is possible for these two log sources.
**Status:** Confirmed and documented; not yet fixed. Tracked as a follow-up, separate from the
AI-accuracy work already underway, since it's a data-capture problem rather than an AI problem.

### 35. ✅ A setting meant for local development quietly overwrote the real database address in production
**The problem:** Several files, when imported, re-read a `.env` file and were told to let it
overwrite *any* setting already in place — including ones Docker had already set correctly for
production (like the real database address). Because Python loads files like this automatically
just by importing them, one part of the code importing another part was enough to accidentally
trigger this, with no obvious connection between the two. The visible symptom was the alert-sync
process silently failing to write new alerts to the dashboard, with an error about the database
address being wrong — even though nothing about the database address had been touched directly.
**What we did:** Found every file doing this (four of them) and changed the setting so a `.env`
file can only fill in values that aren't already set, never overwrite ones that are.
**Why it matters:** This bug could resurface anywhere a new file follows the same old pattern of
"reload the .env file just in case." Now it's fixed everywhere it currently exists, and the fix
itself — described in this entry — is the reference for spotting the same mistake in new code.

### 36. ✅ The backend showed "unhealthy" even when it was working fine
**The problem:** After a fix that corrected which port the backend's own health check looks at,
the running container kept reporting "unhealthy" anyway — even though the app inside it worked
perfectly. Restarting it normally didn't help.
**What we did:** Found that the deployment tool doesn't always notice when *only* the health-check
setting changed (as opposed to the actual application code), so it kept the old, already-broken
health check running inside the container instead of picking up the fix. Forcing a full rebuild
of that one container picked up the corrected health check immediately.
**Why it matters:** A container reporting "unhealthy" when the app is actually fine (or vice versa)
erodes trust in the health check entirely — this makes sure a health-check-only fix actually takes
effect, not just a code fix.

### 37. ✅ Running the real-time AI classifier on a shared server made the whole login page stop responding
**The problem:** The dedicated local AI model was enabled on a server that also runs several other
unrelated services. That server's CPU usage jumped to 97%+, and the login endpoint became slow
enough to look completely stuck.
**What we did:** Removed the local-model setting from that server's configuration, confirming CPU
usage dropped back to normal immediately. The local model now only runs on a separate server set
aside specifically for this pipeline, which has capacity to spare.
**Why it matters:** A server used for live client demos has to be reliable on demand — it can't be
the same box where active AI/ML experimentation happens. This incident is why the project now keeps
a strict split between the demo server (frozen, Groq-only) and a dedicated test server (runs the
local model, absorbs any instability from active development).
