"""
Cleanup Arena — Unified Database Service
Provides a clean, efficient data access layer supporting both:
1. Supabase PostgreSQL (when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured)
2. High-performance SQLite local database (for local dev, offline demo, and testing)

Includes atomic gameplay validation, dynamic HP calculation, duplicate-safe
seeding, and audit event recording.
"""

import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from config import Config

# Path for SQLite local engine
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cleanup_arena.db")


def is_supabase_configured() -> bool:
    """Checks if valid Supabase credentials are present."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return bool(url and key and "your-project-id" not in url and "your-supabase" not in key)


class LocalDB:
    """SQLite engine adhering strictly to the Cleanup Arena PostgreSQL schema."""

    @staticmethod
    @contextmanager
    def get_connection():
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        try:
            yield conn
        finally:
            conn.close()

    @classmethod
    def init_db(cls):
        """Initializes tables, constraints, and indexes."""
        with cls.get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS emails (
                    id TEXT PRIMARY KEY,
                    sender TEXT NOT NULL,
                    sender_email TEXT,
                    subject TEXT NOT NULL,
                    preview TEXT,
                    category TEXT NOT NULL CHECK(category IN ('spam', 'newsletter', 'notification', 'important')),
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'archived', 'starred', 'follow_up', 'spam')),
                    received_at TEXT,
                    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
                    updated_at TEXT NOT NULL DEFAULT (DATETIME('now')),
                    UNIQUE(sender_email, subject, received_at)
                );

                CREATE INDEX IF NOT EXISTS idx_emails_cat ON emails(category);
                CREATE INDEX IF NOT EXISTS idx_emails_stat ON emails(status);
                CREATE INDEX IF NOT EXISTS idx_emails_recv ON emails(received_at DESC);

                CREATE TABLE IF NOT EXISTS cleanup_events (
                    id TEXT PRIMARY KEY,
                    action TEXT NOT NULL,
                    category TEXT NOT NULL,
                    processed_count INTEGER NOT NULL CHECK(processed_count >= 0),
                    created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
                );

                CREATE INDEX IF NOT EXISTS idx_events_date ON cleanup_events(created_at DESC);

                CREATE TABLE IF NOT EXISTS player_progress (
                    id TEXT PRIMARY KEY,
                    xp INTEGER NOT NULL DEFAULT 0 CHECK(xp >= 0),
                    level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
                    total_emails_cleaned INTEGER NOT NULL DEFAULT 0 CHECK(total_emails_cleaned >= 0),
                    updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
                );
            """)

            # Seed player progress if empty
            cur = conn.cursor()
            cur.execute("SELECT id FROM player_progress WHERE id = '00000000-0000-0000-0000-000000000001'")
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO player_progress (id, xp, level, total_emails_cleaned)
                    VALUES ('00000000-0000-0000-0000-000000000001', 1300, 5, 142)
                """)
            conn.commit()


# Initialize local DB on module import
LocalDB.init_db()


class DatabaseService:
    """Unified service providing all data access for Flask APIs."""

    @classmethod
    def seed_demo_emails(cls) -> int:
        """
        Seeds the 52 standard demonstration emails into the database.
        Safe to call multiple times without creating duplicates.
        """
        from services.seed_db import SEED_EMAILS

        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            client.table("emails").upsert(
                SEED_EMAILS,
                on_conflict="sender_email,subject,received_at"
            ).execute()
            return len(SEED_EMAILS)
        else:
            inserted = 0
            with LocalDB.get_connection() as conn:
                for e in SEED_EMAILS:
                    email_id = str(uuid.uuid4())
                    cur = conn.execute("""
                        INSERT INTO emails (id, sender, sender_email, subject, preview, category, status, received_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(sender_email, subject, received_at) DO NOTHING
                    """, (
                        email_id,
                        e["sender"],
                        e["sender_email"],
                        e["subject"],
                        e["preview"],
                        e["category"],
                        e["status"],
                        e["received_at"]
                    ))
                    if cur.rowcount > 0:
                        inserted += 1
                conn.commit()
            return inserted

    @classmethod
    def get_emails(
        cls,
        category: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        sort: str = "newest",
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Retrieves emails with optional filtering, search, and sorting.
        """
        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            query = client.table("emails").select(
                "id, sender, sender_email, subject, preview, category, status, received_at, created_at"
            )
            if category and category != "all":
                query = query.eq("category", category)
            if status and status != "all":
                if status == "pending":
                    query = query.eq("status", "pending")
                elif status == "cleaned":
                    query = query.in_("status", ["archived", "spam"])
                elif status == "starred":
                    query = query.eq("status", "starred")
            if search:
                # Text search across subject, sender, preview
                query = query.or_(
                    f"subject.ilike.%{search}%,sender.ilike.%{search}%,preview.ilike.%{search}%"
                )
            query = query.order("received_at", desc=(sort == "newest")).limit(limit)
            res = query.execute()
            return res.data or []
        else:
            with LocalDB.get_connection() as conn:
                query_parts = ["SELECT id, sender, sender_email, subject, preview, category, status, received_at, created_at FROM emails WHERE 1=1"]
                params = []

                if category and category != "all":
                    query_parts.append("AND category = ?")
                    params.append(category)

                if status and status != "all":
                    if status == "pending":
                        query_parts.append("AND status = 'pending'")
                    elif status == "cleaned":
                        query_parts.append("AND status IN ('archived', 'spam')")
                    elif status == "starred":
                        query_parts.append("AND status = 'starred'")

                if search:
                    search_pattern = f"%{search.strip().lower()}%"
                    query_parts.append("AND (LOWER(subject) LIKE ? OR LOWER(sender) LIKE ? OR LOWER(preview) LIKE ?)")
                    params.extend([search_pattern, search_pattern, search_pattern])

                order_dir = "DESC" if sort == "newest" else "ASC"
                query_parts.append(f"ORDER BY received_at {order_dir} LIMIT ?")
                params.append(limit)

                cur = conn.execute(" ".join(query_parts), params)
                return [dict(row) for row in cur.fetchall()]

    @classmethod
    def get_player_progress(cls) -> Dict[str, Any]:
        """Returns the current player progress."""
        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            res = client.table("player_progress").select("*").limit(1).execute()
            if res.data:
                return res.data[0]
            return {"xp": 1300, "level": 5, "total_emails_cleaned": 142}
        else:
            with LocalDB.get_connection() as conn:
                cur = conn.execute("SELECT xp, level, total_emails_cleaned, updated_at FROM player_progress LIMIT 1")
                row = cur.fetchone()
                if row:
                    return dict(row)
                return {"xp": 1300, "level": 5, "total_emails_cleaned": 142}

    @classmethod
    def get_stats(cls) -> Dict[str, Any]:
        """
        Calculates dynamic monster HP values, category counts, and overall cleanup progress.
        Monster HP is calculated directly from pending email count vs baselines:
          - Spam Slime: 15 baseline
          - Newsletter Hydra: 15 baseline
          - Notification Goblin: 12 baseline
          - Mail Guardian: 10 baseline (Protection Progress)
        """
        emails = cls.get_emails(category="all", status="all", limit=500)

        baselines = {
            "spam": 15,
            "newsletter": 15,
            "notification": 12,
            "important": 10,
        }

        counts = {
            "spam": {"total": 0, "pending": 0, "cleaned": 0},
            "newsletter": {"total": 0, "pending": 0, "cleaned": 0},
            "notification": {"total": 0, "pending": 0, "cleaned": 0},
            "important": {"total": 0, "pending": 0, "protected": 0, "cleaned": 0},
        }

        for e in emails:
            cat = e["category"]
            if cat not in counts:
                continue
            counts[cat]["total"] += 1
            if e["status"] == "pending":
                counts[cat]["pending"] += 1
            elif cat == "important":
                if e["status"] in ("starred", "follow_up", "archived"):
                    counts["important"]["protected"] += 1
            else:
                if e["status"] in ("archived", "spam"):
                    counts[cat]["cleaned"] += 1

        # Calculate exact HP and percentage
        def make_monster_stat(cat_name: str, display_name: str, base_hp: int) -> Dict[str, Any]:
            pending = counts[cat_name]["pending"]
            current_hp = pending
            pct = int(round((current_hp / base_hp) * 100)) if base_hp > 0 else 0
            pct = max(0, min(100, pct))
            return {
                "name": display_name,
                "max_hp": base_hp,
                "current_hp": current_hp,
                "hp": current_hp,
                "hp_percent": pct,
                "pending": pending,
                "defeated": current_hp == 0,
            }

        spam_slime = make_monster_stat("spam", "Spam Slime", baselines["spam"])
        newsletter_hydra = make_monster_stat("newsletter", "Newsletter Hydra", baselines["newsletter"])
        notification_goblin = make_monster_stat("notification", "Notification Goblin", baselines["notification"])

        # Mail Guardian protection progress (increases as emails are safeguarded)
        guardian_protected = counts["important"]["protected"]
        guardian_pct = int(round((guardian_protected / baselines["important"]) * 100))
        guardian_pct = max(0, min(100, guardian_pct))

        mail_guardian = {
            "name": "Mail Guardian",
            "total_important": baselines["important"],
            "protected": guardian_protected,
            "pending": counts["important"]["pending"],
            "protection": guardian_pct,
            "protection_percent": guardian_pct,
            "status": "active",
        }

        # Check defeated clutter monsters
        monsters_defeated = sum([
            1 if spam_slime["defeated"] else 0,
            1 if newsletter_hydra["defeated"] else 0,
            1 if notification_goblin["defeated"] else 0,
        ])
        arena_cleared = (monsters_defeated == 3)

        # Overall arena cleanup percentage
        total_non_important = counts["spam"]["total"] + counts["newsletter"]["total"] + counts["notification"]["total"]
        cleaned_non_important = counts["spam"]["cleaned"] + counts["newsletter"]["cleaned"] + counts["notification"]["cleaned"]
        overall_cleanup_pct = int(round((cleaned_non_important / max(1, total_non_important)) * 100))

        return {
            "counts": counts,
            "monsters": {
                "spam_slime": spam_slime,
                "newsletter_hydra": newsletter_hydra,
                "notification_goblin": notification_goblin,
                "mail_guardian": mail_guardian,
            },
            "overall_cleanup_percentage": overall_cleanup_pct,
            "monsters_defeated": monsters_defeated,
            "arena_cleared": arena_cleared,
        }

    @classmethod
    def get_achievements(cls) -> List[Dict[str, Any]]:
        """Evaluates and returns player achievements based on live progress and stats."""
        stats = cls.get_stats()
        player = cls.get_player_progress()
        total_cleaned = player.get("total_emails_cleaned", 0)
        monsters_defeated = stats.get("monsters_defeated", 0)
        guardian_protected = stats["counts"]["important"]["protected"]

        achievements = [
            {
                "id": "first_cleanup",
                "title": "First Strike",
                "description": "Clean and purge your first batch of inbox clutter.",
                "icon": "⚔️",
                "unlocked": total_cleaned > 0,
                "progress": f"{total_cleaned} emails cleaned",
            },
            {
                "id": "monster_slayer",
                "title": "Monster Slayer",
                "description": "Completely reduce any clutter monster's HP to 0.",
                "icon": "🏆",
                "unlocked": monsters_defeated >= 1,
                "progress": f"{monsters_defeated} / 1 monster",
            },
            {
                "id": "arena_champion",
                "title": "Arena Champion",
                "description": "Defeat all three clutter monsters (Spam, Newsletters, Notifications).",
                "icon": "👑",
                "unlocked": monsters_defeated == 3,
                "progress": f"{monsters_defeated} / 3 defeated",
            },
            {
                "id": "guardian_protector",
                "title": "Shield of the Inbox",
                "description": "Safeguard and organize at least 5 important emails.",
                "icon": "🛡️",
                "unlocked": guardian_protected >= 5,
                "progress": f"{guardian_protected} / 5 protected",
            },
            {
                "id": "century_sweeper",
                "title": "Century Sweeper",
                "description": "Achieve 100+ total emails processed and archived.",
                "icon": "⚡",
                "unlocked": total_cleaned >= 100,
                "progress": f"{total_cleaned} / 100 emails",
            },
        ]
        return achievements

    @classmethod
    def preview_cleanup(cls, email_ids: List[str]) -> Dict[str, Any]:
        """
        Validates email IDs for cleanup eligibility and calculates preview details.
        Important emails are rejected from automated cleanup.
        """
        if not email_ids or not isinstance(email_ids, list):
            return {"eligible": [], "eligible_count": 0, "ineligible_count": 0, "xp_reward": 0}

        # Deduplicate incoming IDs
        unique_ids = list(set(email_ids))

        all_emails = cls.get_emails(category="all", status="all", limit=500)
        id_map = {str(e["id"]): e for e in all_emails}

        eligible = []
        ineligible_count = 0

        for eid in unique_ids:
            item = id_map.get(str(eid))
            if not item:
                ineligible_count += 1
                continue
            # Important emails cannot be batch-cleaned or deleted
            if item["category"] == "important":
                ineligible_count += 1
                continue
            # Must be currently pending
            if item["status"] != "pending":
                ineligible_count += 1
                continue

            # Determine proposed action
            action = "Archive"
            if item["category"] == "spam":
                action = "Delete & Block"
            elif item["category"] == "newsletter":
                action = "Unsubscribe & Delete"
            elif item["category"] == "notification":
                action = "Archive Notification"

            eligible.append({
                "id": item["id"],
                "sender": item["sender"],
                "subject": item["subject"],
                "category": item["category"],
                "proposed_action": action,
            })

        xp_reward = len(eligible) * 10

        return {
            "eligible": eligible,
            "eligible_count": len(eligible),
            "ineligible_count": ineligible_count,
            "xp_reward": xp_reward,
        }

    @classmethod
    def execute_cleanup(cls, email_ids: List[str]) -> Dict[str, Any]:
        """
        Atomically executes cleanup on verified eligible emails:
        1. Validates IDs.
        2. Updates database status to 'archived' or 'spam'.
        3. Records cleanup_event.
        4. Awards XP and increments player progress.
        5. Recalculates monster stats.
        """
        preview = cls.preview_cleanup(email_ids)
        eligible_items = preview["eligible"]
        processed_count = len(eligible_items)

        if processed_count == 0:
            return {
                "success": False,
                "processed_count": 0,
                "message": "No eligible emails found for cleanup.",
                "xp_awarded": 0,
            }

        # Capture pre-operation stats to detect boss defeats and arena victory
        stats_before = cls.get_stats()

        eligible_ids = [item["id"] for item in eligible_items]
        primary_category = eligible_items[0]["category"] if eligible_items else "various"
        base_xp_gain = processed_count * 10

        # Update database with email status change and audit event
        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            client.table("emails").update({"status": "archived"}).in_("id", eligible_ids).execute()
            client.table("cleanup_events").insert({
                "action": "cleanup_batch",
                "category": primary_category,
                "processed_count": processed_count,
            }).execute()
        else:
            with LocalDB.get_connection() as conn:
                placeholders = ",".join("?" for _ in eligible_ids)
                conn.execute(
                    f"UPDATE emails SET status = 'archived', updated_at = DATETIME('now') WHERE id IN ({placeholders})",
                    eligible_ids
                )
                conn.execute(
                    "INSERT INTO cleanup_events (id, action, category, processed_count) VALUES (?, ?, ?, ?)",
                    (str(uuid.uuid4()), "cleanup_batch", primary_category, processed_count)
                )
                conn.commit()

        # Capture post-operation stats
        stats_after = cls.get_stats()

        # Detect newly defeated monsters and award boss defeat bonuses (+100 XP each)
        defeated_monsters = []
        bonus_xp = 0
        clutter_bosses = ["spam_slime", "newsletter_hydra", "notification_goblin"]
        for b in clutter_bosses:
            if not stats_before["monsters"][b]["defeated"] and stats_after["monsters"][b]["defeated"]:
                defeated_monsters.append(stats_after["monsters"][b]["name"])
                bonus_xp += 100

        # Detect Arena Cleared victory (+250 XP champion bonus)
        arena_victory_now = (not stats_before["arena_cleared"] and stats_after["arena_cleared"])
        if arena_victory_now:
            bonus_xp += 250

        total_xp_awarded = base_xp_gain + bonus_xp

        # Persist updated player progress
        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            curr = cls.get_player_progress()
            new_xp = curr["xp"] + total_xp_awarded
            new_cleaned = curr["total_emails_cleaned"] + processed_count
            new_level = max(1, (new_xp // 500) + 1)
            client.table("player_progress").update({
                "xp": new_xp,
                "level": new_level,
                "total_emails_cleaned": new_cleaned,
            }).eq("id", "00000000-0000-0000-0000-000000000001").execute()
        else:
            with LocalDB.get_connection() as conn:
                conn.execute("""
                    UPDATE player_progress
                    SET xp = xp + ?,
                        total_emails_cleaned = total_emails_cleaned + ?,
                        level = ((xp + ?) / 500) + 1,
                        updated_at = DATETIME('now')
                    WHERE id = '00000000-0000-0000-0000-000000000001'
                """, (total_xp_awarded, processed_count, total_xp_awarded))
                conn.commit()

        # Fetch fresh progress and achievements
        progress = cls.get_player_progress()
        achievements = cls.get_achievements()

        msg = f"Successfully cleaned {processed_count} email(s) and earned +{base_xp_gain} XP!"
        if defeated_monsters:
            msg = f"💥 Monster Defeated: {', '.join(defeated_monsters)}! (+{bonus_xp} Bonus XP)"
        if arena_victory_now:
            msg = f"👑 ARENA CLEARED! All clutter monsters vanquished! (+{bonus_xp} Champion Bonus XP)"

        return {
            "success": True,
            "processed_count": processed_count,
            "base_xp": base_xp_gain,
            "bonus_xp": bonus_xp,
            "xp_awarded": total_xp_awarded,
            "defeated_monsters": defeated_monsters,
            "monster_defeated": len(defeated_monsters) > 0,
            "arena_victory": arena_victory_now,
            "arena_cleared": arena_victory_now,
            "player": progress,
            "stats": stats_after,
            "achievements": achievements,
            "message": msg,
        }

    @classmethod
    def execute_important_action(cls, email_id: str, action: str) -> Dict[str, Any]:
        """
        Executes individual protection actions for Important Mail Guardian:
        Allowed actions: 'keep', 'star', 'archive', 'follow_up'
        """
        valid_actions = {
            "keep": "starred",
            "star": "starred",
            "archive": "archived",
            "follow_up": "follow_up",
        }

        if action not in valid_actions:
            return {"success": False, "message": f"Invalid guardian action '{action}'."}

        target_status = valid_actions[action]
        xp_gain = 15

        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            client.table("emails").update({"status": target_status}).eq("id", email_id).eq("category", "important").execute()
            client.table("cleanup_events").insert({
                "action": f"guardian_{action}",
                "category": "important",
                "processed_count": 1,
            }).execute()

            curr = cls.get_player_progress()
            new_xp = curr["xp"] + xp_gain
            new_level = max(1, (new_xp // 500) + 1)
            client.table("player_progress").update({
                "xp": new_xp,
                "level": new_level,
            }).eq("id", "00000000-0000-0000-0000-000000000001").execute()
        else:
            with LocalDB.get_connection() as conn:
                conn.execute(
                    "UPDATE emails SET status = ?, updated_at = DATETIME('now') WHERE id = ? AND category = 'important'",
                    (target_status, email_id)
                )
                conn.execute(
                    "INSERT INTO cleanup_events (id, action, category, processed_count) VALUES (?, ?, 'important', 1)",
                    (str(uuid.uuid4()), f"guardian_{action}")
                )
                conn.execute("""
                    UPDATE player_progress
                    SET xp = xp + ?,
                        level = ((xp + ?) / 500) + 1,
                        updated_at = DATETIME('now')
                    WHERE id = '00000000-0000-0000-0000-000000000001'
                """, (xp_gain, xp_gain))
                conn.commit()

        stats = cls.get_stats()
        player = cls.get_player_progress()
        achievements = cls.get_achievements()

        return {
            "success": True,
            "action": action,
            "new_status": target_status,
            "xp_awarded": xp_gain,
            "player": player,
            "stats": stats,
            "achievements": achievements,
            "message": f"Guardian action '{action}' recorded (+{xp_gain} XP).",
        }

    @classmethod
    def get_cleanup_history(cls, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieves recent cleanup event audit records."""
        if is_supabase_configured():
            from services.supabase_client import get_supabase_client
            client = get_supabase_client()
            res = client.table("cleanup_events").select("*").order("created_at", desc=True).limit(limit).execute()
            return res.data or []
        else:
            with LocalDB.get_connection() as conn:
                cur = conn.execute("SELECT id, action, category, processed_count, created_at FROM cleanup_events ORDER BY created_at DESC LIMIT ?", (limit,))
                return [dict(row) for row in cur.fetchall()]
