import os
from pathlib import Path
import sys
import tempfile


REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="ruby-rain-security-test-") as temp_dir:
        database_path = Path(temp_dir) / "security-test.db"
        os.environ.update(
            {
                "DATABASE_URL": f"sqlite:///{database_path.as_posix()}",
                "INITIAL_ADMIN_USERNAME": "security-test-admin",
                "INITIAL_ADMIN_DISPLAY_NAME": "Security Test",
                "INITIAL_ADMIN_PASSWORD": "Temporary-Test-Password-2026",
                "API_DOCS_ENABLED": "false",
                "SESSION_COOKIE_SECURE": "auto",
                "LOGIN_RATE_ACCOUNT_ATTEMPTS": "3",
            }
        )

        from fastapi.testclient import TestClient

        from backend.database import engine
        from backend.main import app
        from backend.routers.uploads import UPLOAD_DIR

        try:
            with TestClient(app, base_url="https://testserver") as client:
                assert client.get("/api/health").status_code == 200
                assert client.get("/docs").status_code == 404
                assert client.get("/uploads/not-present.jpg").status_code == 401

                proxy_headers = {
                    "X-Forwarded-Proto": "https",
                    "X-Forwarded-For": "203.0.113.10",
                }
                statuses = [
                    client.post(
                        "/api/auth/login",
                        headers=proxy_headers,
                        json={
                            "username": "security-test-admin",
                            "password": "wrong-password",
                        },
                    ).status_code
                    for _ in range(4)
                ]
                assert statuses == [401, 401, 401, 429], statuses

            with TestClient(app, base_url="https://testserver") as client:
                response = client.post(
                    "/api/auth/login",
                    headers={
                        "X-Forwarded-Proto": "https",
                        "X-Forwarded-For": "203.0.113.11",
                    },
                    json={
                        "username": "security-test-admin",
                        "password": "Temporary-Test-Password-2026",
                    },
                )
                assert response.status_code == 200, response.text
                cookie = response.headers.get("set-cookie", "")
                assert "HttpOnly" in cookie, cookie
                assert "Secure" in cookie, cookie
                assert "SameSite=lax" in cookie, cookie

                upload = next(
                    (path for path in UPLOAD_DIR.iterdir() if path.is_file()),
                    None,
                )
                if upload:
                    assert client.get(f"/uploads/{upload.name}").status_code == 200
        finally:
            engine.dispose()

    print("public security checks passed")


if __name__ == "__main__":
    main()
