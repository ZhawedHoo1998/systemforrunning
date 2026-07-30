import unittest
from datetime import datetime
from unittest.mock import patch

from backend.models import CreatorAccount, CreatorAccountNote
from backend.routers import ai as ai_router
from backend.routers.ai import ChatRequest, build_creator_note_context, build_image_prompt
from backend.routers.creator_accounts import _history_archive_summary
from backend.routers.creator_accounts import (
    _merge_creator_note_source_data,
    _restore_note_media_from_raw_detail,
)


class AiCreatorNoteContextTests(unittest.TestCase):
    def tearDown(self):
        ai_router._openai_clients.clear()

    def test_chat_request_normalizes_creator_note_ids(self):
        request = ChatRequest(
            creator_note_ids=[" note-2 ", "note-1", "note-2", ""],
            messages=[{"role": "user", "content": "继续讨论"}],
        )

        self.assertEqual(request.creator_note_ids, ["note-2", "note-1"])

    def test_creator_note_context_preserves_selected_order_and_body(self):
        notes = [
            CreatorAccountNote(
                xhs_note_id="note-2",
                title="第二篇",
                content="第二篇正文",
                liked_count=20,
                collected_count=8,
                comment_count=3,
                share_count=1,
                tags=["车载香氛"],
                published_at=datetime(2026, 7, 20, 10, 30),
            ),
            CreatorAccountNote(
                xhs_note_id="note-1",
                title="第一篇",
                content="第一篇正文",
                liked_count=10,
                collected_count=4,
                comment_count=2,
                share_count=0,
                tags=[],
            ),
        ]

        context = build_creator_note_context(notes)

        self.assertLess(context.index("第二篇"), context.index("第一篇"))
        self.assertIn("共选择 2 篇旧帖", context)
        self.assertIn("最高点赞：20（《第二篇》）", context)
        self.assertIn("最高收藏：8（《第二篇》）", context)
        self.assertIn("最高评论：3（《第二篇》）", context)
        self.assertIn("最高转发：1（《第二篇》）", context)
        self.assertIn("最高综合互动：36（《第二篇》）", context)
        self.assertIn("正文：第二篇正文", context)
        self.assertIn("赞 20、藏 8、评 3、转 1", context)
        self.assertIn("标签：车载香氛", context)

    def test_image_prompt_includes_creator_note_text_tags_and_metrics(self):
        context = build_creator_note_context([
            CreatorAccountNote(
                title="高互动旧帖",
                content="完整正文内容",
                liked_count=88,
                collected_count=21,
                comment_count=9,
                share_count=5,
                tags=["车载香氛", "夏日用车"],
            )
        ])

        prompt = build_image_prompt(
            "生成新的产品场景图",
            2,
            [],
            "比亚迪 / 汉L",
            "",
            context,
        )

        self.assertIn("所选账号旧帖的文字、标签与公开表现数据", prompt)
        self.assertIn("最高点赞：88", prompt)
        self.assertIn("正文：完整正文内容", prompt)
        self.assertIn("标签：车载香氛、夏日用车", prompt)
        self.assertIn("赞 88、藏 21、评 9、转 5", prompt)

    @patch.object(ai_router, "AsyncOpenAI")
    def test_openai_client_is_reused_for_the_same_relay(self, openai_client):
        client = object()
        openai_client.return_value = client

        first = ai_router.get_client("test-key", "https://relay.example/v1")
        second = ai_router.get_client("test-key", "https://relay.example/v1")

        self.assertIs(first, client)
        self.assertIs(second, client)
        openai_client.assert_called_once()

    def test_writing_plan_schema_limits_response_size(self):
        properties = ai_router.WRITING_PLAN_SCHEMA["properties"]

        self.assertEqual(properties["titles"]["maxItems"], 8)
        self.assertEqual(properties["directions"]["maxItems"], 4)


class CreatorHistoryArchiveTests(unittest.TestCase):
    def test_listing_sync_preserves_detail_media_urls(self):
        merged = _merge_creator_note_source_data(
            {
                "image_urls": ["https://example.com/one.webp", "https://example.com/two.webp"],
                "raw_detail": {"noteId": "note-1"},
                "detail_fetched_at": "2026-07-29T10:00:00",
                "local_attachments": [{"path": "/uploads/local.webp"}],
            },
            {
                "image_urls": ["https://example.com/cover.webp"],
                "raw_listing": {"id": "note-1"},
            },
        )

        self.assertEqual(merged["image_urls"], [
            "https://example.com/one.webp",
            "https://example.com/two.webp",
        ])
        self.assertIn("raw_listing", merged)
        self.assertIn("local_attachments", merged)

    def test_raw_detail_restores_all_image_urls(self):
        note = CreatorAccountNote(source_data={
            "image_urls": ["https://example.com/cover.webp"],
            "raw_detail": {
                "noteId": "note-1",
                "imageList": [
                    {"urlDefault": "https://example.com/one.webp"},
                    {"urlDefault": "https://example.com/two.webp"},
                ],
            },
        })

        restored = _restore_note_media_from_raw_detail(note)

        self.assertTrue(restored)
        self.assertEqual(note.source_data["image_urls"], [
            "https://example.com/one.webp",
            "https://example.com/two.webp",
        ])

    def test_archive_summary_counts_only_public_notes_with_bodies(self):
        account = CreatorAccount(analysis={"history_archive": {"status": "running"}})
        notes = [
            CreatorAccountNote(
                content="公开正文",
                is_private=False,
                source_data={
                    "detail_fetched_at": "2026-07-29T10:00:00",
                    "media_archived_at": "2026-07-29T10:01:00",
                    "media_source_urls": [],
                },
            ),
            CreatorAccountNote(content="", is_private=False),
            CreatorAccountNote(content="私密正文", is_private=True),
        ]

        summary = _history_archive_summary(account, notes)

        self.assertEqual(summary["status"], "running")
        self.assertEqual(summary["total_notes"], 2)
        self.assertEqual(summary["body_note_count"], 1)
        self.assertEqual(summary["missing_body_count"], 1)
        self.assertEqual(summary["detail_note_count"], 1)
        self.assertEqual(summary["missing_detail_count"], 1)
        self.assertEqual(summary["media_note_count"], 1)
        self.assertEqual(summary["missing_media_count"], 1)
        self.assertEqual(summary["local_image_count"], 0)
        self.assertEqual(summary["local_video_count"], 0)


if __name__ == "__main__":
    unittest.main()
