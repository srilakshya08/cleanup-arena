"""
Cleanup Arena — Database Seeding Script
Populates Supabase with the exact 52 frontend demonstration emails
and initial player progress using idempotent batch operations.
"""

import os
import sys
from datetime import datetime, timezone

# Add parent directory to sys.path if running as standalone script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.supabase_client import get_supabase_client

# 52 demonstration email records exactly matching frontend app.js
SEED_EMAILS = [
    # ── SPAM (15 records) ──
    {
        "sender": "Prince Mfundo",
        "sender_email": "urgent.claim@treasury-royal-holding.za",
        "subject": "CONFIDENTIAL PROPOSAL: Transfer of $14,500,000 USD",
        "preview": "Dear beloved friend, with supreme trust I contact you regarding an unclaimed fund transfer...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-31T08:42:00Z",
    },
    {
        "sender": "MegaCrypto Gains",
        "sender_email": "moonshot@x1000-tokens-invest.io",
        "subject": "🚀 10,000% Guaranteed Returns in 48 Hours!",
        "preview": "Don't miss the next PepeDoge rocket. Deposit 0.05 BTC now before our secret private sale closes...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-31T07:15:00Z",
    },
    {
        "sender": "Apple Security Alert",
        "sender_email": "noreply@id-verify-apple-cloud-portal.xyz",
        "subject": "Your iCloud account has been locked due to suspicious activity",
        "preview": "We detected unauthorized login from Vladivostok. Verify your identity within 2 hours or face suspension...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-30T22:50:00Z",
    },
    {
        "sender": "Luxury Swiss Timepieces",
        "sender_email": "vip@geneva-rolex-replicas-outlet.biz",
        "subject": "Exclusive 95% discount on Submariner & Daytona models",
        "preview": "Grade AAA Swiss automatic mechanical movements at warehouse liquidation prices. Free shipping...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-30T19:24:00Z",
    },
    {
        "sender": "Dr. Alistair Vance",
        "sender_email": "herbal.miracle@fast-health-cure.net",
        "subject": "Cardiologists are FURIOUS: 1 strange trick cleans your arteries",
        "preview": "Big pharma tried to ban this Japanese ancient mineral extract. Watch the shocking video before it's taken down...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-30T16:11:00Z",
    },
    {
        "sender": "IRS Tax Settlement",
        "sender_email": "claim-relief@irs-agent-case-review.top",
        "subject": "FINAL NOTICE: Claim your $4,280 tax rebate immediately",
        "preview": "Your pending stimulus and overpayment refund has expired. Click here to confirm routing details...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-30T13:05:00Z",
    },
    {
        "sender": "Casino Royale Club",
        "sender_email": "jackpot@spins-free-bonanza.click",
        "subject": "🎰 Claim 250 Free Spins + $1,500 Match Bonus today!",
        "preview": "Play Vegas slots on your phone. Instant withdrawal, no KYC required for your first payout...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-30T11:30:00Z",
    },
    {
        "sender": "Express Courier Global",
        "sender_email": "tracking@parcels-usps-delivery-status.cc",
        "subject": "Undelivered package #US9827419: Address incomplete",
        "preview": "Your parcel is held at the local depot. Pay $2.85 re-delivery fee to release the package...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-29T21:18:00Z",
    },
    {
        "sender": "Miracle Weight Loss",
        "sender_email": "keto.magic@burn-fat-overnight.info",
        "subject": "Lose 15 lbs in 7 days without exercise or diet changes",
        "preview": "New clinical trial proves dormant ketone enzymes can be activated with a bedtime tea...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-29T18:04:00Z",
    },
    {
        "sender": "Global Grant Bureau",
        "sender_email": "awards@un-grant-foundation-payout.org",
        "subject": "Notification of UN Humanitarian Award $750,000",
        "preview": "Your email was randomly selected during our annual worldwide philanthropy sweepstakes draw...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-29T14:40:00Z",
    },
    {
        "sender": "Online Pharmacist",
        "sender_email": "orders@rx-direct-discount-meds.co",
        "subject": "Generic Viagra & Cialis - 80% off brand names",
        "preview": "No prescription needed. Discreet packaging, worldwide priority express courier delivery...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-29T10:12:00Z",
    },
    {
        "sender": "Meta Ads Verification",
        "sender_email": "security-case@meta-business-appeal.net",
        "subject": "Account Notice: Your Facebook business page is scheduled for deletion",
        "preview": "Copyright violation report #884129. Submit your counter-appeal within 24 hours to prevent permanent ban...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-28T23:35:00Z",
    },
    {
        "sender": "Easy Cash Loans",
        "sender_email": "preapproved@quick-funds-express.loan",
        "subject": "Instant Approval: $5,000 cash deposit into your checking account",
        "preview": "Bad credit? No problem. Borrow up to $5,000 with zero upfront collateral or background checks...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-28T17:19:00Z",
    },
    {
        "sender": "Geek Squad Renewal",
        "sender_email": "invoice@bestbuy-geekservice-billing.link",
        "subject": "Auto-Renewal Receipt: $499.00 charged for Antivirus Protection",
        "preview": "Thank you for renewing your annual plan. If you did not authorize this charge, call +1-888-FAKE-NUM...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-28T12:05:00Z",
    },
    {
        "sender": "Work From Home Opportunity",
        "sender_email": "recruiting@easy-remote-income24.com",
        "subject": "Earn $450/day reviewing online shopping products from home",
        "preview": "Flexible 2 hours per day. No prior experience necessary. Receive weekly direct deposits...",
        "category": "spam",
        "status": "pending",
        "received_at": "2026-10-28T09:22:00Z",
    },

    # ── NEWSLETTERS (15 records) ──
    {
        "sender": "Substack: The Pragmatic Engineer",
        "sender_email": "gergely@pragmaticengineer.com",
        "subject": "#148: What Big Tech looks for in Senior Staff Engineers",
        "preview": "In this issue: Archetypes of leadership, interview rubrics from Stripe and Meta, and compensation trends...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-31T06:30:00Z",
    },
    {
        "sender": "TLDR Tech Digest",
        "sender_email": "dan@tldr.tech",
        "subject": "TLDR 2026-10-31: Quantum speedups in silicon & new OSS models",
        "preview": "ByteDance open sources video foundation model; Anthropic upgrades reasoning bounds; Google announces...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-31T06:00:00Z",
    },
    {
        "sender": "Nike Member Exclusive",
        "sender_email": "news@nike.mail.com",
        "subject": "👟 Early Access: Air Max Flyknit retro collection drops at noon",
        "preview": "As a Nike Club member, you get first dibs before the public release. Check out the three colorways...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-30T20:15:00Z",
    },
    {
        "sender": "Frontend Focus",
        "sender_email": "editors@cooperpress.com",
        "subject": "Issue #630: CSS Container Style Queries are finally everywhere",
        "preview": "Plus: Vanilla JS state machines, WebAssembly graphics benchmarks, and debugging CSS Grid with DevTools...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-30T17:45:00Z",
    },
    {
        "sender": "Steam Weekend Deals",
        "sender_email": "store@steampowered.com",
        "subject": "⚔️ An item on your wishlist is on sale: Hades II is 30% off",
        "preview": "The Autumn Roguelike Festival has begun! Over 400 titles discounted until Monday morning...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-30T14:10:00Z",
    },
    {
        "sender": "Coursera Weekly Recommendation",
        "sender_email": "updates@coursera.org",
        "subject": "Expand your career: Machine Learning Specialization with Stanford",
        "preview": "Based on your interest in Python and Algorithms, we selected these 3 top-rated professional certificates...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-30T10:00:00Z",
    },
    {
        "sender": "Sephora Beauty Insider",
        "sender_email": "beauty@sephora.com",
        "subject": "💄 Your 20% Off Holiday Savings Event code is inside!",
        "preview": "Use promo code TIMETOSAVE at checkout for Rouge and VIB tiers. Free two-day shipping included...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-29T19:30:00Z",
    },
    {
        "sender": "PyCoder's Weekly",
        "sender_email": "curators@pycoders.com",
        "subject": "Issue #652: What's New in Python 3.14 and Modern AsyncIO",
        "preview": "Articles, tutorials, and project releases from the Python community. Dive into pattern matching idioms...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-29T15:20:00Z",
    },
    {
        "sender": "Airbnb Wanderlust",
        "sender_email": "trips@airbnb.com",
        "subject": "Cozy cabin retreats within 3 hours of your city",
        "preview": "Escape for the weekend with woodstoves, mountain vistas, and hot tubs. Check out top guest favorites...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-29T12:45:00Z",
    },
    {
        "sender": "Scott's Cheap Flights",
        "sender_email": "deals@going.com",
        "subject": "✈️ Mistake fare alert: Roundtrip to Tokyo from $480",
        "preview": "Nonstop flights on ANA and Delta from major US hubs. Fares usually return to normal within hours...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-29T08:10:00Z",
    },
    {
        "sender": "Medium Daily Digest",
        "sender_email": "noreply@medium.com",
        "subject": "Stories for Hero: How I built a micro-SaaS with Flask and HTMX",
        "preview": "Recommended based on your reading history: Software Architecture Pitfalls, 10 Clean Code Rules...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-28T21:00:00Z",
    },
    {
        "sender": "Grammarly Weekly Writing",
        "sender_email": "insights@grammarly.com",
        "subject": "Your Weekly Writing Stats: 12,410 words checked!",
        "preview": "You were more productive than 88% of Grammarly users. Your top tone: Friendly and Confident...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-28T16:30:00Z",
    },
    {
        "sender": "Duolingo",
        "sender_email": "duo@duolingo.com",
        "subject": "🦉 These 5 minutes could keep your 45-day streak alive!",
        "preview": "Don't let Duo down. Practice Spanish for just 5 minutes before midnight to earn a double XP potion...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-28T14:15:00Z",
    },
    {
        "sender": "Product Hunt Daily",
        "sender_email": "hello@producthunt.com",
        "subject": "Top 10 products of yesterday: AI code reviewers and browser extensions",
        "preview": "Check out #1 product: SuperClean AI, an agent that tidies your workspace automatically...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-28T11:00:00Z",
    },
    {
        "sender": "Uber Eats Special",
        "sender_email": "offers@uber.com",
        "subject": "🍔 Get $15 off your next dinner order of $30+",
        "preview": "Craving sushi or burgers tonight? Tap into local favorites with exclusive free delivery all weekend...",
        "category": "newsletter",
        "status": "pending",
        "received_at": "2026-10-28T08:45:00Z",
    },

    # ── NOTIFICATIONS (12 records) ──
    {
        "sender": "GitHub Notifications",
        "sender_email": "notifications@github.com",
        "subject": "[srilakshya08/cleanup-arena] Workflow 'CI Build' passed on main",
        "preview": "Run #14 completed successfully for commit 09f19a2. All 12 unit tests and lint checks verified...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-31T08:30:00Z",
    },
    {
        "sender": "LinkedIn Updates",
        "sender_email": "messages-noreply@linkedin.com",
        "subject": "Sarah Chen and 4 other people viewed your profile this week",
        "preview": "See who's curious about your software engineering work. 2 recruiters reached out in your area...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-31T07:45:00Z",
    },
    {
        "sender": "Slack Workspace",
        "sender_email": "notifications@slack.com",
        "subject": "New mention from @alex in #hackathon-dev: 'Can you check the Flask routes?'",
        "preview": "@alex mentioned you: 'Hey Hero, check out the updated schema for the monster battles when you have a sec'...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-30T22:10:00Z",
    },
    {
        "sender": "Amazon Delivery Status",
        "sender_email": "auto-confirm@amazon.com",
        "subject": "Delivered: Your package containing 'Ergonomic Vertical Mouse'",
        "preview": "Your package was left near the front door. Photo confirmation is available in your order history...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-30T18:25:00Z",
    },
    {
        "sender": "Linear Team",
        "sender_email": "notifications@linear.app",
        "subject": "CLA-42 was assigned to you: 'Refactor monster animation CSS'",
        "preview": "Priority: High. Due date: Nov 2. Milestone: Sprint 1 Frontend Polish. Attached Figma specs...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-30T15:40:00Z",
    },
    {
        "sender": "Google Cloud Platform",
        "sender_email": "billing-noreply@google.com",
        "subject": "Billing Alert: Monthly spending reached $15.20 for project 'cleanup-arena-prod'",
        "preview": "Your budget threshold (50% of $30.00 limit) was triggered on Cloud Run services and Artifact Registry...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-30T11:15:00Z",
    },
    {
        "sender": "Twitter / X",
        "sender_email": "notify@x.com",
        "subject": "Guillermo Rauch liked your post about building game UI in Vanilla JS",
        "preview": "Your post received 14 reposts and 82 likes in the last 24 hours. Check out the quote tweets...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-29T20:00:00Z",
    },
    {
        "sender": "Spotify Family",
        "sender_email": "no-reply@spotify.com",
        "subject": "Payment processed: $16.99 for your Premium Family subscription",
        "preview": "Your receipt for renewal date Oct 29. Next billing cycle begins on Nov 29, 2026...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-29T16:50:00Z",
    },
    {
        "sender": "Notion Automated",
        "sender_email": "updates@notion.so",
        "subject": "Elena commented on 'Cleanup Arena Product Architecture' doc",
        "preview": "'Great breakdown of the Supabase PostgreSQL schema. Let's make sure we index the user_id column'...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-29T13:10:00Z",
    },
    {
        "sender": "Discord Community",
        "sender_email": "noreply@discord.com",
        "subject": "14 unread messages in #announcements on 'Indie Game Devs'",
        "preview": "Game jam voting starts tomorrow. Don't forget to submit your demo links and gameplay trailers...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-29T09:30:00Z",
    },
    {
        "sender": "Zoom Meetings",
        "sender_email": "no-reply@zoom.us",
        "subject": "Meeting Recording Available: 'Hackathon Sprint Planning & Demo'",
        "preview": "Your cloud recording from 10:00 AM is ready to view. Passcode: *9A#kL2. Audio transcript processed...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-28T15:00:00Z",
    },
    {
        "sender": "Figma Comments",
        "sender_email": "notifications@figma.com",
        "subject": "Marcus left 3 comments on 'Monster Battle Frames'",
        "preview": "Review frame #4: 'Love the Mail Guardian shield glow! Can we add a soft pulsing aura?'...",
        "category": "notification",
        "status": "pending",
        "received_at": "2026-10-28T10:45:00Z",
    },

    # ── IMPORTANT (10 records) ──
    {
        "sender": "Stripe Talent Acquisition",
        "sender_email": "recruiting@stripe.com",
        "subject": "Invitation to Interview: Senior Full-Stack Engineer position",
        "preview": "Hi Hero, your background in high-performance web applications caught our attention. We'd love to schedule a 30-min conversation...",
        "category": "important",
        "status": "starred",
        "received_at": "2026-10-31T09:05:00Z",
    },
    {
        "sender": "Chase Private Client Bank",
        "sender_email": "service@chase.com",
        "subject": "Urgent Security Verification: New wire transfer authorization",
        "preview": "Please verify authorization for wire transaction #WT-99214 for $3,200 to Escrow Services LLC...",
        "category": "important",
        "status": "follow_up",
        "received_at": "2026-10-31T08:00:00Z",
    },
    {
        "sender": "Dr. Evelyn Reed (Metro Health)",
        "sender_email": "appointments@metrohealth.org",
        "subject": "Appointment Confirmation & Lab Results for Nov 4, 10:30 AM",
        "preview": "Your annual checkup is confirmed with Dr. Reed at Suite 400. Please review pre-visit fasting instructions...",
        "category": "important",
        "status": "pending",
        "received_at": "2026-10-30T21:00:00Z",
    },
    {
        "sender": "Delta Airlines Bookings",
        "sender_email": "ticketconfirmation@delta.com",
        "subject": "Flight Itinerary & E-Ticket #006-281940: SFO to JFK (Nov 12)",
        "preview": "Confirmation code: H8X9LQ. Passenger: Hero. Seat 12A (Window, Main Cabin Extra). Baggage allowance...",
        "category": "important",
        "status": "starred",
        "received_at": "2026-10-30T17:00:00Z",
    },
    {
        "sender": "Robert Sterling, CPA",
        "sender_email": "rsterling@sterling-taxgroup.com",
        "subject": "Q3 Estimated Tax Filing & Depreciation Schedule Review",
        "preview": "Attached is the draft of your quarterly state and federal estimated tax filings. Please sign Form 8879 before Tuesday...",
        "category": "important",
        "status": "follow_up",
        "received_at": "2026-10-30T12:30:00Z",
    },
    {
        "sender": "Apex Legal Partners",
        "sender_email": "counsel@apexlegal.com",
        "subject": "Countersigned Master Services Agreement & IP Assignment",
        "preview": "Both parties have executed the final agreement. Stored with tamper-proof cryptographic audit trail. Please retain...",
        "category": "important",
        "status": "archived",
        "received_at": "2026-10-29T18:45:00Z",
    },
    {
        "sender": "University Housing & Registrar",
        "sender_email": "registrar@polytech.edu",
        "subject": "Official Transcript Request #TR-4401 Completed",
        "preview": "Your certified electronic transcript has been processed and made available for download until Dec 15...",
        "category": "important",
        "status": "pending",
        "received_at": "2026-10-29T14:00:00Z",
    },
    {
        "sender": "Landlord: Highline Lofts",
        "sender_email": "management@highlinelofts.com",
        "subject": "Lease Renewal Option & Parking Stall Agreement 2027",
        "preview": "Your current lease expires Dec 31. We are pleased to offer a 12-month extension at current terms if executed by Nov 15...",
        "category": "important",
        "status": "follow_up",
        "received_at": "2026-10-29T11:20:00Z",
    },
    {
        "sender": "Vanguard Retirement",
        "sender_email": "statements@vanguard.com",
        "subject": "Quarterly Portfolio Summary & Annual 401(k) Contribution Notice",
        "preview": "Your Q3 statement is ready to review. Total portfolio return year-to-date: +14.2%. Maximize your deduction...",
        "category": "important",
        "status": "pending",
        "received_at": "2026-10-28T19:10:00Z",
    },
    {
        "sender": "National Identity Services",
        "sender_email": "passports@travel.state.gov",
        "subject": "Passport Renewal Application #PP-8190: Shipped via Priority",
        "preview": "Your new passport book has been printed and dispatched. Expected arrival date: Monday, Nov 3. Tracking #...",
        "category": "important",
        "status": "starred",
        "received_at": "2026-10-28T13:50:00Z",
    },
]


def seed_database():
    """
    Executes idempotent batch insertion of demo emails and initial player progress.
    """
    client = get_supabase_client()

    print(f"[*] Starting batch seed of {len(SEED_EMAILS)} demonstration emails...")

    # Batch upsert emails based on the composite unique natural key
    # (sender_email, subject, received_at)
    response = client.table("emails").upsert(
        SEED_EMAILS,
        on_conflict="sender_email,subject,received_at",
    ).execute()

    print(f"[+] Successfully seeded emails table. Records count: {len(SEED_EMAILS)}")

    # Seed single demo player progress record
    player_data = {
        "id": "00000000-0000-0000-0000-000000000001",
        "xp": 1300,
        "level": 5,
        "total_emails_cleaned": 142,
    }

    client.table("player_progress").upsert(
        player_data,
        on_conflict="id",
    ).execute()

    print("[+] Successfully seeded initial player progress record.")
    return True


if __name__ == "__main__":
    seed_database()
