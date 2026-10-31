"""
Cleanup Arena — Full-Stack Automated Test Suite
Validates database integrity, constraints, idempotency, API endpoints,
gameplay mechanics, double-click exploit prevention, and Guardian actions.
"""

import os
import unittest
import json
from app import app
from services.db import DatabaseService, LocalDB, DB_PATH


class CleanupArenaFullStackTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

        # Re-initialize clean test state
        if os.path.exists(DB_PATH):
            try:
                os.remove(DB_PATH)
            except OSError:
                pass
        LocalDB.init_db()
        DatabaseService.seed_demo_emails()

    def test_01_homepage_renders(self):
        """Verify homepage loads successfully with HTTP 200 and required copy."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        self.assertIn(b"Cleanup Arena", res.data)
        self.assertIn(b"Fight digital clutter", res.data)
        self.assertIn(b"Protect what matters", res.data)

    def test_02_database_constraints(self):
        """Verify CHECK constraints reject invalid category and status."""
        with LocalDB.get_connection() as conn:
            # Invalid category must fail CHECK constraint
            with self.assertRaises(Exception):
                conn.execute(
                    "INSERT INTO emails (id, sender, subject, category, status) VALUES ('bad-1', 'Test', 'Subj', 'invalid_cat', 'pending')"
                )

            # Invalid status must fail CHECK constraint
            with self.assertRaises(Exception):
                conn.execute(
                    "INSERT INTO emails (id, sender, subject, category, status) VALUES ('bad-2', 'Test', 'Subj', 'spam', 'invalid_status')"
                )

    def test_03_seed_idempotency(self):
        """Verify re-running seed does not duplicate records."""
        count_before = len(DatabaseService.get_emails(category="all", status="all"))
        inserted = DatabaseService.seed_demo_emails()
        count_after = len(DatabaseService.get_emails(category="all", status="all"))
        self.assertEqual(inserted, 0)
        self.assertEqual(count_before, count_after)

    def test_04_get_emails_filtering_and_search(self):
        """Verify GET /api/emails with category, status, and search filters."""
        # Category filter: spam
        res = self.client.get("/api/emails?category=spam&status=all")
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertTrue(data["success"])
        self.assertEqual(data["count"], 15)
        for e in data["data"]:
            self.assertEqual(e["category"], "spam")

        # Category filter: newsletter
        res = self.client.get("/api/emails?category=newsletter&status=all")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["count"], 15)

        # Category filter: notification
        res = self.client.get("/api/emails?category=notification&status=all")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["count"], 12)

        # Category filter: important
        res = self.client.get("/api/emails?category=important&status=all")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["count"], 10)

        # Search test
        res = self.client.get("/api/emails?search=crypto&status=all")
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.json["count"], 1)

    def test_05_cleanup_preview(self):
        """Verify POST /api/cleanup/preview validates eligibility and calculates XP reward."""
        newsletters = self.client.get("/api/emails?category=newsletter&status=pending").json["data"]
        ids = [newsletters[0]["id"], newsletters[1]["id"], newsletters[2]["id"]]

        res = self.client.post("/api/cleanup/preview", json={"email_ids": ids})
        self.assertEqual(res.status_code, 200)
        data = res.json["data"]
        self.assertEqual(data["eligible_count"], 3)
        self.assertEqual(data["xp_reward"], 30)

    def test_06_important_emails_excluded_from_automated_cleanup(self):
        """Verify important emails are strictly excluded from automated cleanup preview."""
        important = self.client.get("/api/emails?category=important&status=all").json["data"]
        imp_id = important[0]["id"]

        res = self.client.post("/api/cleanup/preview", json={"email_ids": [imp_id]})
        self.assertEqual(res.status_code, 200)
        data = res.json["data"]
        self.assertEqual(data["eligible_count"], 0)
        self.assertEqual(data["ineligible_count"], 1)

    def test_07_cleanup_execute_and_exploit_prevention(self):
        """Verify atomic cleanup execution, XP award, and double-click prevention."""
        notifications = self.client.get("/api/emails?category=notification&status=pending").json["data"]
        target_ids = [notifications[0]["id"], notifications[1]["id"]]

        progress_before = self.client.get("/api/progress").json["data"]

        # First execution: should succeed
        res = self.client.post("/api/cleanup/execute", json={"email_ids": target_ids})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["processed_count"], 2)
        self.assertEqual(res.json["xp_awarded"], 20)

        # Progress should be updated
        progress_after = self.client.get("/api/progress").json["data"]
        self.assertEqual(progress_after["xp"], progress_before["xp"] + 20)
        self.assertEqual(progress_after["total_emails_cleaned"], progress_before["total_emails_cleaned"] + 2)

        # Second execution with same IDs (Double-Click exploit test): MUST fail
        repeat_res = self.client.post("/api/cleanup/execute", json={"email_ids": target_ids})
        self.assertEqual(repeat_res.status_code, 400)
        self.assertFalse(repeat_res.json["success"])

    def test_08_important_guardian_actions(self):
        """Verify Important Mail Guardian actions: keep, star, archive, follow_up."""
        important = self.client.get("/api/emails?category=important&status=all").json["data"]
        target_email = important[0]

        # Test 'keep'
        res = self.client.post("/api/important/action", json={"email_id": target_email["id"], "action": "keep"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["new_status"], "starred")

        # Test 'follow_up'
        res = self.client.post("/api/important/action", json={"email_id": target_email["id"], "action": "follow_up"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["new_status"], "follow_up")

        # Test 'archive'
        res = self.client.post("/api/important/action", json={"email_id": target_email["id"], "action": "archive"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json["new_status"], "archived")

    def test_09_arena_stats_and_dynamic_hp(self):
        """Verify /api/stats returns dynamic monster HP values and overall progress."""
        res = self.client.get("/api/stats")
        self.assertEqual(res.status_code, 200)
        stats = res.json["data"]

        self.assertIn("monsters", stats)
        monsters = stats["monsters"]
        self.assertIn("spam_slime", monsters)
        self.assertIn("newsletter_hydra", monsters)
        self.assertIn("notification_goblin", monsters)
        self.assertIn("mail_guardian", monsters)

        # Verify HP ranges
        self.assertGreaterEqual(monsters["spam_slime"]["hp"], 0)
        self.assertLessEqual(monsters["spam_slime"]["hp"], 100)
        self.assertGreaterEqual(monsters["mail_guardian"]["protection"], 0)
        self.assertLessEqual(monsters["mail_guardian"]["protection"], 100)

    def test_10_cleanup_history_logging(self):
        """Verify /api/history returns logged cleanup and guardian events."""
        res = self.client.get("/api/history")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json["success"])
        self.assertGreaterEqual(len(res.json["data"]), 1)

    def test_11_health_check(self):
        """Verify GET /api/health returns HTTP 200 with healthy status and metadata."""
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "cleanup-arena")
        self.assertIn("timestamp", data)
        self.assertIn("database", data)

    def test_12_achievements_endpoint(self):
        """Verify GET /api/achievements returns 5 game achievements with metadata."""
        res = self.client.get("/api/achievements")
        self.assertEqual(res.status_code, 200)
        data = res.json
        self.assertTrue(data["success"])
        achievements = data["data"]
        self.assertEqual(len(achievements), 5)
        ids = [a["id"] for a in achievements]
        self.assertIn("first_cleanup", ids)
        self.assertIn("monster_slayer", ids)
        self.assertIn("arena_champion", ids)
        self.assertIn("guardian_protector", ids)
        self.assertIn("century_sweeper", ids)

    def test_13_boss_defeat_and_arena_victory_mechanic(self):
        """Verify defeating monsters grants bonus XP and clearing all 3 clutter bosses triggers Arena Victory."""
        # 1. Defeat Notification Goblin (remaining pending notifications)
        notifs = self.client.get("/api/emails?category=notification&status=pending").json["data"]
        if notifs:
            notif_ids = [n["id"] for n in notifs]
            res = self.client.post("/api/cleanup/execute", json={"email_ids": notif_ids})
            self.assertEqual(res.status_code, 200)
            data = res.json
            self.assertTrue(data["monster_defeated"])
            self.assertIn("Notification Goblin", data["defeated_monsters"])
            self.assertGreaterEqual(data["bonus_xp"], 100)

        # 2. Defeat Spam Slime
        spams = self.client.get("/api/emails?category=spam&status=pending").json["data"]
        if spams:
            spam_ids = [s["id"] for s in spams]
            res = self.client.post("/api/cleanup/execute", json={"email_ids": spam_ids})
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.json["monster_defeated"])
            self.assertIn("Spam Slime", res.json["defeated_monsters"])

        # 3. Defeat Newsletter Hydra -> triggers Arena Cleared!
        news = self.client.get("/api/emails?category=newsletter&status=pending").json["data"]
        if news:
            news_ids = [n["id"] for n in news]
            res = self.client.post("/api/cleanup/execute", json={"email_ids": news_ids})
            self.assertEqual(res.status_code, 200)
            self.assertTrue(res.json["monster_defeated"])
            self.assertTrue(res.json["arena_cleared"])
            self.assertGreaterEqual(res.json["bonus_xp"], 350)  # 100 monster + 250 arena cleared

        # 4. Verify /api/stats confirms all 3 defeated and arena cleared
        stats = self.client.get("/api/stats").json["data"]
        self.assertEqual(stats["monsters_defeated"], 3)
        self.assertTrue(stats["arena_cleared"])
        self.assertTrue(stats["monsters"]["spam_slime"]["defeated"])
        self.assertTrue(stats["monsters"]["newsletter_hydra"]["defeated"])
        self.assertTrue(stats["monsters"]["notification_goblin"]["defeated"])

        # 5. Verify Achievements reflect Arena Champion & Monster Slayer unlocked
        ach_res = self.client.get("/api/achievements").json["data"]
        ach_map = {a["id"]: a["unlocked"] for a in ach_res}
        self.assertTrue(ach_map["monster_slayer"])
        self.assertTrue(ach_map["arena_champion"])


if __name__ == "__main__":
    unittest.main()
