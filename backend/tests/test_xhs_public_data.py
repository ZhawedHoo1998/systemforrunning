import os
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException

from backend import xhs_public_data


def listing_note(
    note_id: str,
    likes: int = 10,
    published_at: datetime | None = None,
) -> dict:
    result = {
        "note_id": note_id,
        "display_title": f"笔记 {note_id}",
        "type": "normal",
        "interact_info": {
            "liked_count": str(likes),
            "collected_count": "3",
            "comment_count": "2",
            "share_count": "1",
        },
    }
    if published_at:
        result["create_time"] = int(published_at.timestamp())
    return result


class PublicDataNormalizationTests(unittest.TestCase):
    def test_note_detail_does_not_erase_listing_metrics(self):
        listing = xhs_public_data.normalize_note(listing_note("note-1", likes=88))
        detail = xhs_public_data.normalize_note({
            "note_id": "note-1",
            "title": "完整标题",
            "desc": "完整正文",
            "interact_info": {},
        })

        merged = xhs_public_data.merge_note_detail(listing, detail)

        self.assertEqual(merged["title"], "完整标题")
        self.assertEqual(merged["content"], "完整正文")
        self.assertEqual(merged["liked_count"], 88)
        self.assertEqual(merged["collected_count"], 3)

    def test_zero_detail_limit_returns_no_candidates(self):
        note = xhs_public_data.normalize_note(listing_note("note-1"))
        self.assertEqual(xhs_public_data._detail_candidates([note], 0), [])

    def test_discovery_ranking_deduplicates_same_note(self):
        note = xhs_public_data.normalize_note(listing_note("note-1", likes=50))
        candidate = {
            "user_id": "user-1",
            "red_id": "red-1",
            "nickname": "账号一",
            "avatar_url": "",
            "keyword": "车载香薰",
            "note": note,
        }

        ranked = xhs_public_data._rank_discovery([candidate, candidate])

        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0]["matched_notes"], 1)
        self.assertEqual(ranked[0]["total_likes"], 50)


class PublicDataSyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_tikhub_payment_required_has_actionable_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(402, request=request, json={"message": "Payment Required"})

        async with httpx.AsyncClient(
            base_url="https://api.tikhub.io",
            transport=httpx.MockTransport(handler),
        ) as client:
            with self.assertRaises(HTTPException) as raised:
                await xhs_public_data._tikhub_get(client, "/test", {})

        self.assertIn("余额", raised.exception.detail)

    @patch.dict(os.environ, {"XHS_ACCOUNT_DETAIL_NOTES": "0", "XHS_CLI_REQUEST_DELAY_SECONDS": "0.5"})
    @patch("backend.xhs_public_data.asyncio.sleep", new_callable=AsyncMock)
    @patch("backend.xhs_public_data.run_xhs_command", new_callable=AsyncMock)
    async def test_cli_sync_follows_cursor_until_complete(self, run_command, _sleep):
        async def command_result(command, target, timeout_seconds, *, extra_args=None):
            if command == "user":
                return {
                    "basic_info": {"nickname": "测试账号", "red_id": "123456"},
                    "interactions": [{"type": "fans", "count": "200"}],
                }
            if command == "user-posts" and not extra_args:
                return {"notes": [listing_note("note-1")], "has_more": True, "cursor": "cursor-2"}
            if command == "user-posts" and extra_args == ["--cursor", "cursor-2"]:
                return {"notes": [listing_note("note-2")], "has_more": False, "cursor": ""}
            raise AssertionError((command, target, timeout_seconds, extra_args))

        run_command.side_effect = command_result
        result = await xhs_public_data.sync_with_cli("65a38b4d000000000b0293f6", 5)

        self.assertEqual(result["pages_fetched"], 2)
        self.assertEqual(len(result["notes"]), 2)
        self.assertFalse(result["has_more"])
        self.assertFalse(result["page_limit_reached"])

    @patch.dict(os.environ, {"XHS_ACCOUNT_DETAIL_NOTES": "0"})
    @patch("backend.xhs_public_data.run_xhs_command", new_callable=AsyncMock)
    async def test_cli_sync_reports_page_limit(self, run_command):
        async def command_result(command, target, timeout_seconds, *, extra_args=None):
            if command == "user":
                return {"basic_info": {"nickname": "测试账号"}, "interactions": []}
            if command == "user-posts":
                return {"notes": [listing_note("note-1")], "has_more": True, "cursor": "cursor-2"}
            raise AssertionError(command)

        run_command.side_effect = command_result
        result = await xhs_public_data.sync_with_cli("65a38b4d000000000b0293f6", 1)

        self.assertTrue(result["has_more"])
        self.assertTrue(result["page_limit_reached"])
        self.assertIn("同步上限", result["warnings"][0])

    @patch.dict(os.environ, {"XHS_ACCOUNT_DETAIL_NOTES": "0", "XHS_CLI_REQUEST_DELAY_SECONDS": "0.5"})
    @patch("backend.xhs_public_data.asyncio.sleep", new_callable=AsyncMock)
    @patch("backend.xhs_public_data.run_xhs_command", new_callable=AsyncMock)
    async def test_cli_sync_stops_after_seven_day_window_without_stopping_on_pinned_note(
        self,
        run_command,
        _sleep,
    ):
        async def command_result(command, target, timeout_seconds, *, extra_args=None):
            if command == "user":
                return {"basic_info": {"nickname": "测试账号"}, "interactions": []}
            if command == "user-posts" and not extra_args:
                return {
                    "notes": [
                        listing_note("old-pinned", published_at=datetime(2026, 7, 1, tzinfo=timezone.utc)),
                        listing_note("recent", published_at=datetime(2026, 7, 28, tzinfo=timezone.utc)),
                    ],
                    "has_more": True,
                    "cursor": "cursor-2",
                }
            if command == "user-posts" and extra_args == ["--cursor", "cursor-2"]:
                return {
                    "notes": [
                        listing_note("boundary-new", published_at=datetime(2026, 7, 23, tzinfo=timezone.utc)),
                        listing_note("boundary-old", published_at=datetime(2026, 7, 21, tzinfo=timezone.utc)),
                    ],
                    "has_more": True,
                    "cursor": "cursor-3",
                }
            raise AssertionError((command, target, timeout_seconds, extra_args))

        run_command.side_effect = command_result
        result = await xhs_public_data.sync_with_cli(
            "65a38b4d000000000b0293f6",
            5,
            published_since=datetime(2026, 7, 22),
        )

        post_calls = [call for call in run_command.await_args_list if call.args[0] == "user-posts"]
        self.assertEqual(len(post_calls), 2)
        self.assertTrue(result["has_more"])
        self.assertTrue(result["window_covered"])
        self.assertFalse(result["page_limit_reached"])

    @patch.dict(os.environ, {"TIKHUB_API_KEY": "test-key", "XHS_PUBLIC_DATA_SOURCE": "auto"})
    @patch("backend.xhs_public_data.sync_with_cli", new_callable=AsyncMock)
    @patch("backend.xhs_public_data.sync_with_tikhub", new_callable=AsyncMock)
    async def test_auto_source_prefers_cli_when_tikhub_is_configured(self, sync_tikhub, sync_cli):
        sync_cli.return_value = {
            "source": "cli",
            "profile": {},
            "notes": [],
            "pages_fetched": 1,
            "has_more": False,
            "page_limit_reached": False,
            "warnings": [],
        }

        result = await xhs_public_data.sync_public_account("target-user", "auto", 3)

        self.assertEqual(result["source"], "cli")
        sync_cli.assert_awaited_once_with("target-user", 3, None, None)
        sync_tikhub.assert_not_awaited()

    @patch.dict(os.environ, {"TIKHUB_API_KEY": "test-key", "XHS_PUBLIC_DATA_SOURCE": "auto"})
    @patch("backend.xhs_public_data.sync_with_cli", new_callable=AsyncMock)
    @patch("backend.xhs_public_data.sync_with_tikhub", new_callable=AsyncMock)
    async def test_daily_metric_strategy_can_prefer_tikhub(self, sync_tikhub, sync_cli):
        sync_tikhub.return_value = {
            "source": "tikhub",
            "profile": {},
            "notes": [],
            "pages_fetched": 1,
            "has_more": False,
            "page_limit_reached": False,
            "warnings": [],
        }
        cutoff = datetime(2026, 7, 22)

        result = await xhs_public_data.sync_public_account(
            "target-user",
            "auto",
            3,
            detail_notes=0,
            preferred_source="tikhub",
            published_since=cutoff,
        )

        self.assertEqual(result["source"], "tikhub")
        sync_tikhub.assert_awaited_once_with("target-user", 3, 0, cutoff)
        sync_cli.assert_not_awaited()

    @patch.dict(os.environ, {"TIKHUB_API_KEY": "test-key", "XHS_PUBLIC_DATA_SOURCE": "tikhub"})
    @patch("backend.xhs_public_data.sync_with_cli", new_callable=AsyncMock)
    @patch("backend.xhs_public_data.sync_with_tikhub", new_callable=AsyncMock)
    async def test_auto_source_falls_back_to_cli(self, sync_tikhub, sync_cli):
        sync_tikhub.side_effect = HTTPException(status_code=502, detail="TikHub 暂时不可用")
        sync_cli.return_value = {
            "source": "cli",
            "profile": {},
            "notes": [],
            "pages_fetched": 1,
            "has_more": False,
            "page_limit_reached": False,
            "warnings": [],
        }

        result = await xhs_public_data.sync_public_account("target-user", "auto", 3)

        self.assertEqual(result["source"], "cli")
        self.assertIn("已回退到 CLI", result["warnings"][0])


if __name__ == "__main__":
    unittest.main()
