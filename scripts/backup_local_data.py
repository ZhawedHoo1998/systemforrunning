import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import zipfile


REPO_ROOT = Path(__file__).resolve().parent.parent
DATABASE_PATH = REPO_ROOT / "data" / "materials.db"
UPLOAD_DIR = REPO_ROOT / "backend" / "uploads"


def create_database_snapshot(target: Path) -> None:
    source_connection = sqlite3.connect(DATABASE_PATH)
    target_connection = sqlite3.connect(target)
    try:
        source_connection.backup(target_connection)
        integrity = target_connection.execute("PRAGMA integrity_check").fetchone()
        if not integrity or integrity[0] != "ok":
            raise RuntimeError("SQLite backup failed its integrity check")
    finally:
        target_connection.close()
        source_connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create a consistent Ruby Rain database and upload archive."
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=REPO_ROOT / "backups",
        help="Backup directory. Prefer a synced or external drive path.",
    )
    args = parser.parse_args()

    if not DATABASE_PATH.is_file():
        raise FileNotFoundError(f"Database not found: {DATABASE_PATH}")

    destination = args.destination.expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    archive_path = destination / f"ruby-rain-backup-{timestamp}.zip"
    temporary_archive = destination / f".{archive_path.name}.tmp"

    database_handle, database_snapshot_name = tempfile.mkstemp(
        prefix="ruby-rain-database-",
        suffix=".db",
        dir=destination,
    )
    os.close(database_handle)
    database_snapshot = Path(database_snapshot_name)

    try:
        create_database_snapshot(database_snapshot)
        upload_files = [path for path in UPLOAD_DIR.rglob("*") if path.is_file()]
        manifest = {
            "created_at": datetime.now().astimezone().isoformat(),
            "database": "data/materials.db",
            "upload_file_count": len(upload_files),
            "upload_bytes": sum(path.stat().st_size for path in upload_files),
        }

        with zipfile.ZipFile(
            temporary_archive,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        ) as archive:
            archive.write(database_snapshot, "data/materials.db")
            for upload_path in upload_files:
                relative_path = upload_path.relative_to(REPO_ROOT)
                archive.write(upload_path, relative_path.as_posix())
            archive.writestr(
                "manifest.json",
                json.dumps(manifest, ensure_ascii=False, indent=2),
            )

        os.replace(temporary_archive, archive_path)
    finally:
        database_snapshot.unlink(missing_ok=True)
        temporary_archive.unlink(missing_ok=True)

    print(archive_path)


if __name__ == "__main__":
    main()
