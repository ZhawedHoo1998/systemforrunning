import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from backend.account_monitor import build_seven_day_analysis, monitor_schedule_status
from backend.auth import require_account_query_operator
from backend.models import User


def note(note_id: str, published_at: datetime, likes: int, collections: int, comments: int = 0, shares: int = 0) -> dict:
    return {
        "id": note_id,
        "title": note_id,
        "source_url": f"https://example.test/{note_id}",
        "published_at": published_at,
        "liked_count": likes,
        "collected_count": collections,
        "comment_count": comments,
        "share_count": shares,
    }


class AccountMonitorAnalysisTests(unittest.TestCase):
    def test_seven_day_analysis_marks_new_high_performer(self):
        now = datetime(2026, 7, 29, 2, 0)
        historical = [
            note(f"old-{index}", datetime(2026, 7, 10 + index, 2), 5, 2)
            for index in range(6)
        ]
        recent = [
            note("steady", datetime(2026, 7, 27, 2), 4, 2),
            note("winner", datetime(2026, 7, 28, 2), 28, 14, 5, 2),
        ]
        previous = {
            "steady": {"liked_count": 4, "collected_count": 2, "comment_count": 0, "share_count": 0},
            "winner": {"liked_count": 8, "collected_count": 4, "comment_count": 1, "share_count": 0},
        }

        analysis = build_seven_day_analysis(recent, historical, previous, now, followers=320, follower_delta=7)

        self.assertEqual(analysis["post_count"], 2)
        self.assertEqual(analysis["followers"], 320)
        self.assertEqual(analysis["follower_delta"], 7)
        self.assertEqual(analysis["totals"]["liked_count"], 32)
        self.assertEqual(analysis["totals"]["collected_count"], 16)
        self.assertEqual(analysis["deltas"]["liked_count"], 20)
        self.assertEqual(analysis["high_performing_notes"][0]["id"], "winner")
        self.assertTrue(analysis["high_performing_notes"][0]["should_alert"])

    def test_daily_schedule_uses_shanghai_time(self):
        with patch.dict(os.environ, {
            "XHS_OWNED_MONITOR_HOUR": "9",
            "XHS_OWNED_MONITOR_TIMEZONE": "Asia/Shanghai",
        }, clear=False):
            status = monitor_schedule_status(datetime(2026, 7, 29, 2, 0, tzinfo=timezone.utc))

        self.assertEqual(status["time_label"], "每天 09:00")
        self.assertEqual(status["timezone"], "Asia/Shanghai")
        self.assertEqual(status["strategy"], "tikhub_metrics_cli_fallback")
        self.assertEqual(status["window_days"], 7)
        self.assertEqual(status["detail_notes"], 0)
        self.assertTrue(status["next_run_at"].startswith("2026-07-30T09:00:00"))


class AccountQueryPermissionTests(unittest.TestCase):
    def test_only_writer_and_admin_can_query_account_data(self):
        self.assertEqual(require_account_query_operator(User(role="writer")).role, "writer")
        self.assertEqual(require_account_query_operator(User(role="admin")).role, "admin")
        with self.assertRaises(HTTPException) as raised:
            require_account_query_operator(User(role="manager"))
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
