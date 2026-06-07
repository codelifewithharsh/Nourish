# LinkedIn Content — Master Context

This folder contains everything Claude needs to write LinkedIn posts about Nourish that sound like they come from a senior engineer.

## How to use this with Claude

Start a fresh Claude conversation. Paste the contents of these two files first, in this order:

1. **This file** (the master context) — explains what Nourish is, who I am, what tone the posts should have, what to avoid.
2. **[style-guide.md](./style-guide.md)** — the rules for what a "good Nourish LinkedIn post" looks like.

Then say: *"Now write a post based on [topics/<filename>.md]. Pull the technical details from there."*

Each topic file is self-contained — Claude doesn't need to read the codebase to write a post about it.

---

## About Nourish

**One-line:** An AI-powered Indian nutrition app that builds a personalised 7-day vegetarian meal plan around your goal, body, kitchen, and taste — and updates as you do.

**What makes it different:**
- Indian-first (not "western app with paneer added"). Plans are built in north-Indian, south-Indian, indo-Chinese, Indian-fusion vocabulary.
- Kitchen-aware. The plan uses what you already have, not what HealthifyMe assumes you have.
- AI-powered nutrition lookup — type "2 chapati with sabzi", get macros instantly.
- Built solo by one engineer in ~6 weeks.

**Tech stack (the engineer reader cares about this):**
- React Native + Expo (SDK 56, New Architecture)
- Supabase (Postgres + RLS + Edge Functions on Deno)
- OpenAI `gpt-4o-mini` for everything AI
- PostHog for product analytics + crash reporting
- EAS Build for distribution
- No Redux/Zustand. No GraphQL. No React Query. Direct DB calls with RLS as the security boundary.

**The economics:**
- Real per-user OpenAI cost: under ₹0.50/month. Caching is the reason.
- Free for all early users via a "Pro membership" that's currently just a status badge.
- A real paid tier will exist later; for now everyone gets everything.

---

## About me (the post author)

- Solo founder + engineer building Nourish.
- Background: software engineer with experience shipping production apps.
- Voice: confident but not arrogant. Curious about the craft. Genuinely engineering-first, not marketing-first.
- I'm OK saying "I was wrong about X, here's what I changed." I'm not OK with humblebrag or vague founder-speak.

---

## What posts should NOT do

- ❌ Sound like a press release or product launch announcement.
- ❌ Use hustle-culture vocabulary ("crushing it", "to the moon", "founders", "10x").
- ❌ Open with "Excited to share..." or "Thrilled to announce...".
- ❌ Use AI-generated em-dashes everywhere, generic LinkedIn-isms, or rhetorical questions in bold ("Want to know what changed everything?").
- ❌ Pitch the app at the end like a sales close. If a post is good, the link drives downloads naturally.
- ❌ Pretend technical decisions were obvious. Show the tradeoff and the wrong path we considered.
- ❌ Talk about "users" abstractly. Talk about *one* user, *one* moment, *one* decision.

---

## What posts SHOULD do

- ✅ Lead with a concrete engineering moment (a bug, a decision, a number that surprised me).
- ✅ Show real numbers wherever possible (build minutes, cost per user, tokens per call, lines of code removed).
- ✅ Reveal a "non-obvious to a non-engineer" insight in the middle.
- ✅ End with one thing the reader can take back to their own work. Not a CTA — a takeaway.
- ✅ Sound like one engineer talking to other engineers, not a brand talking at strangers.

---

## How to pick a topic

The `topics/` folder has one file per post idea. Each one has:
- A working title.
- The technical content (what actually happened, with numbers and code snippets where useful).
- The "what the reader takes away" angle.
- The "what NOT to over-claim" reminder.

You can ask Claude for: *"Pick three from `topics/` that would resonate most with backend engineers"* or *"Generate three different opens for the post in `topics/expo-go-broke.md`."*

---

## Workflow each time

1. Paste this README into a fresh Claude conversation.
2. Paste `style-guide.md`.
3. Paste the chosen `topics/*.md`.
4. Ask: *"Write the post."* Or: *"Give me three different opens, then I'll pick one."*
5. Iterate. Tell Claude what's working and what isn't.
6. Once a post is solid, save the final version inside `topics/<filename>.md` under a `## Final post` heading so we don't lose it.
