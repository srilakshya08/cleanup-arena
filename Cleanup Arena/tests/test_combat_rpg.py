"""
Cleanup Arena — Combat Animations & RPG System Automated Tests
Validates frontend template bindings, CSS animation rules, combat endpoint contracts,
authoritative backend state tracking, and Guardian protection workflows.
"""

import os
import unittest
from app import app
from services.db import DatabaseService, LocalDB, DB_PATH


class CombatRPGEngineTests(unittest.TestCase):

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

    def test_01_index_contains_all_rpg_elements(self):
        """Verify index.html contains all battle stage, reader panel, and audio/motion controls."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        html = res.data.decode("utf-8")

        # Battle Stage & Boss HUD
        self.assertIn('id="battle-stage"', html)
        self.assertIn('id="attack-theater"', html)
        self.assertIn('id="boss-pedestal"', html)
        self.assertIn('id="active-boss-avatar"', html)
        self.assertIn('id="boss-defeat-banner"', html)
        self.assertIn('id="boss-hud-name"', html)
        self.assertIn('id="boss-hp-bar"', html)
        self.assertIn('id="boss-ghost-fill"', html)
        self.assertIn('id="boss-instant-fill"', html)
        self.assertIn('id="btn-stage-attack"', html)
        self.assertIn('id="combat-log-container"', html)
        self.assertIn('id="battle-log-stream"', html)

        # In-Arena Email Reader Panel
        self.assertIn('id="email-reader-panel"', html)
        self.assertIn('id="reader-subject"', html)
        self.assertIn('id="reader-sender"', html)
        self.assertIn('id="reader-date"', html)
        self.assertIn('id="reader-body-text"', html)
        self.assertIn('id="btn-reader-strike"', html)
        self.assertIn('id="btn-reader-star"', html)
        self.assertIn('id="btn-reader-archive"', html)
        self.assertIn('id="btn-reader-followup"', html)

        # Nav Audio & Motion Controls
        self.assertIn('id="btn-sound-toggle"', html)
        self.assertIn('id="sound-volume"', html)
        self.assertIn('id="btn-motion-toggle"', html)

    def test_02_css_contains_all_monster_animations(self):
        """Verify CSS defines all 5 states (idle, hit, attack, low-hp, defeat) for all monsters."""
        css_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "css", "style.css")
        with open(css_path, "r", encoding="utf-8") as f:
            css = f.read()

        # Spam Slime states
        self.assertIn(".slime-art.state-idle", css)
        self.assertIn(".slime-art.state-hit", css)
        self.assertIn(".slime-art.state-attack", css)
        self.assertIn(".slime-art.state-low-hp", css)
        self.assertIn(".slime-art.state-defeat", css)

        # Newsletter Hydra states
        self.assertIn(".hydra-art.state-idle", css)
        self.assertIn(".hydra-art.state-hit", css)
        self.assertIn(".hydra-art.state-attack", css)
        self.assertIn(".hydra-art.state-low-hp", css)
        self.assertIn(".hydra-art.state-defeat", css)

        # Notification Goblin states
        self.assertIn(".goblin-art.state-idle", css)
        self.assertIn(".goblin-art.state-hit", css)
        self.assertIn(".goblin-art.state-attack", css)
        self.assertIn(".goblin-art.state-low-hp", css)
        self.assertIn(".goblin-art.state-defeat", css)

        # Mail Guardian states
        self.assertIn(".guardian-art.state-idle", css)
        self.assertIn(".guardian-art.state-protect", css)
        self.assertIn(".guardian-art.state-celebrate", css)

        # Spells and Attack theater effects
        self.assertIn(".spell-slash-effect", css)
        self.assertIn(".spell-lightning-effect", css)
        self.assertIn(".spell-blast-effect", css)
        self.assertIn(".spell-holy-effect", css)

        # Ghost Health bar and Accessibility
        self.assertIn(".hp-ghost-fill", css)
        self.assertIn(".hp-instant-fill", css)
        self.assertIn(".boss-hp-box.low-hp", css)
        self.assertIn(".combat-particle", css)
        self.assertIn(".floating-critical", css)
        self.assertIn("prefers-reduced-motion", css)

    def test_03_cleanup_combat_payload_integrity(self):
        """Verify POST /api/cleanup/execute provides authoritative data for combat animations."""
        spams = self.client.get("/api/emails?category=spam&status=pending").json["data"]
        self.assertGreaterEqual(len(spams), 2)
        attack_ids = [spams[0]["id"], spams[1]["id"]]

        res = self.client.post("/api/cleanup/execute", json={"email_ids": attack_ids})
        self.assertEqual(res.status_code, 200)
        data = res.json

        # Required fields for combat orchestration
        self.assertTrue(data["success"])
        self.assertEqual(data["processed_count"], 2)
        self.assertEqual(data["base_xp"], 20)
        self.assertIn("xp_awarded", data)
        self.assertIn("stats", data)
        self.assertIn("defeated_monsters", data)
        self.assertIn("monster_defeated", data)
        self.assertIn("arena_victory", data)
        self.assertIn("message", data)

        # HP must decrease directly in backend response
        stats = data["stats"]["monsters"]["spam_slime"]
        self.assertEqual(stats["current_hp"], 15 - 2)
        self.assertFalse(stats["defeated"])

    def test_04_failed_action_does_not_mutate_state(self):
        """Verify invalid or failed actions do not reduce HP or award XP."""
        # 1. Invalid empty IDs
        res = self.client.post("/api/cleanup/execute", json={"email_ids": []})
        self.assertEqual(res.status_code, 400)

        # 2. Re-executing already cleaned emails (exploit prevention)
        spams = self.client.get("/api/emails?category=spam&status=archived").json["data"]
        cleaned_id = spams[0]["id"]

        progress_before = self.client.get("/api/progress").json["data"]
        stats_before = self.client.get("/api/stats").json["data"]

        fail_res = self.client.post("/api/cleanup/execute", json={"email_ids": [cleaned_id]})
        self.assertEqual(fail_res.status_code, 400)

        # State must remain identical
        progress_after = self.client.get("/api/progress").json["data"]
        stats_after = self.client.get("/api/stats").json["data"]
        self.assertEqual(progress_before["xp"], progress_after["xp"])
        self.assertEqual(
            stats_before["monsters"]["spam_slime"]["current_hp"],
            stats_after["monsters"]["spam_slime"]["current_hp"]
        )

    def test_05_guardian_action_payload_integrity(self):
        """Verify Guardian protection action awards XP and increases protection percentage."""
        important = self.client.get("/api/emails?category=important&status=all").json["data"]
        target = important[0]

        res = self.client.post("/api/important/action", json={"email_id": target["id"], "action": "star"})
        self.assertEqual(res.status_code, 200)
        data = res.json

        self.assertTrue(data["success"])
        self.assertEqual(data["new_status"], "starred")
        self.assertEqual(data["xp_awarded"], 15)
        self.assertIn("stats", data)
        self.assertIn("mail_guardian", data["stats"]["monsters"])
        self.assertGreaterEqual(data["stats"]["monsters"]["mail_guardian"]["protection_percent"], 10)


if __name__ == "__main__":
    unittest.main()
