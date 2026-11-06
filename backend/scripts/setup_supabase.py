import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_LOCAL_PATH = ROOT_DIR / ".env.local"
PW_PATH = ROOT_DIR / "pw.txt"
MIGRATIONS_DIR = ROOT_DIR / "supabase" / "migrations"


def load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def ensure_storage_buckets(supabase_url: str, service_key: str) -> list[str]:
    """Create or update the private storage buckets via Supabase Storage REST API."""
    created_or_verified: list[str] = []
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    req_list = urllib.request.Request(
        f"{supabase_url}/storage/v1/bucket", headers=headers, method="GET"
    )
    with urllib.request.urlopen(req_list, timeout=15) as resp:
        existing_buckets = {b["id"] for b in json.loads(resp.read().decode())}

    for bucket_id in ("visiting-cards-original", "visiting-cards-processed"):
        payload = json.dumps(
            {
                "id": bucket_id,
                "name": bucket_id,
                "public": False,
                "file_size_limit": 10485760,
                "allowed_mime_types": [
                    "image/jpeg",
                    "image/jpg",
                    "image/png",
                    "image/webp",
                ],
            }
        ).encode("utf-8")

        if bucket_id in existing_buckets:
            req = urllib.request.Request(
                f"{supabase_url}/storage/v1/bucket/{bucket_id}",
                data=payload,
                headers=headers,
                method="PUT",
            )
        else:
            req = urllib.request.Request(
                f"{supabase_url}/storage/v1/bucket",
                data=payload,
                headers=headers,
                method="POST",
            )
        with urllib.request.urlopen(req, timeout=15) as resp:
            _ = resp.read()
        created_or_verified.append(bucket_id)

    return created_or_verified


def find_working_postgres_connection(project_ref: str, db_password: str):
    import psycopg2

    pw_encoded = urllib.parse.quote_plus(db_password)
    candidates = [
        f"postgresql://postgres:{pw_encoded}@db.{project_ref}.supabase.co:5432/postgres?sslmode=require",
        f"postgresql://postgres:{pw_encoded}@db.{project_ref}.supabase.co:6543/postgres?sslmode=require",
    ]
    regions = [
        "ap-south-1",
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "eu-central-1",
        "eu-west-1",
        "eu-west-2",
        "ap-southeast-1",
        "ap-northeast-1",
    ]
    for region in regions:
        candidates.append(
            f"postgresql://postgres.{project_ref}:{pw_encoded}@aws-0-{region}.pooler.supabase.com:5432/postgres?sslmode=require"
        )
        candidates.append(
            f"postgresql://postgres.{project_ref}:{pw_encoded}@aws-0-{region}.pooler.supabase.com:6543/postgres?sslmode=require"
        )

    for dsn in candidates:
        try:
            conn = psycopg2.connect(dsn, connect_timeout=5)
            return conn, dsn
        except Exception:
            continue
    return None, None


def main() -> None:
    env = load_env_file(ENV_LOCAL_PATH)
    supabase_url = env.get("SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL") or ""
    service_key = (
        env.get("SUPABASE_SECRET_KEY")
        or env.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    )
    if not supabase_url or not service_key:
        print("ERROR: Missing SUPABASE_URL or service key in .env.local")
        sys.exit(1)

    project_ref = supabase_url.split("://")[-1].split(".")[0]
    print(f"Setting up Supabase project ref: {project_ref}")

    buckets = ensure_storage_buckets(supabase_url, service_key)
    print(f"Verified private Supabase Storage buckets: {buckets}")

    # Ensure admin@cardflow.app exists in Supabase Auth (auth.users)
    try:
        admin_payload = json.dumps(
            {
                "email": "admin@cardflow.app",
                "password": "Admin@123456",
                "email_confirm": True,
                "user_metadata": {
                    "full_name": "CardFlow Admin",
                    "role": "admin",
                },
            }
        ).encode("utf-8")
        req_admin = urllib.request.Request(
            f"{supabase_url}/auth/v1/admin/users",
            data=admin_payload,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req_admin, timeout=15) as resp:
            _ = resp.read()
            print("Created admin@cardflow.app in Supabase Auth!")
    except urllib.error.HTTPError as e:
        if e.code in (400, 422):
            print("Verified admin@cardflow.app already exists in Supabase Auth.")
        else:
            print(f"Supabase Auth admin note: HTTP {e.code}")
    except Exception as exc:
        print(f"Supabase Auth admin check note: {exc}")

    if PW_PATH.exists():
        db_pw = PW_PATH.read_text(encoding="utf-8").strip()
        conn, dsn = find_working_postgres_connection(project_ref, db_pw)
        if conn is not None:
            print("Connected to Supabase PostgreSQL successfully!")
            conn.autocommit = True
            cur = conn.cursor()
            for mig_name in (
                "00001_initial_schema.sql",
                "00002_rls_policies.sql",
                "00003_storage_buckets.sql",
            ):
                sql_path = MIGRATIONS_DIR / mig_name
                sql_text = sql_path.read_text(encoding="utf-8")
                try:
                    cur.execute(sql_text)
                    print(f"Applied migration: {mig_name}")
                except Exception as exc:
                    print(f"Note while applying {mig_name}: {exc}")

            # Ensure compatibility columns for backend auth/profile fallback exist
            cur.execute(
                """
                ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT DEFAULT '';
                ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reset_token TEXT;
                ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
                """
            )
            cur.execute(
                """
                SELECT tablename, rowsecurity
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename;
                """
            )
            tables = cur.fetchall()
            print("Supabase public tables & RLS status:", tables)
            cur.close()
            conn.close()
        else:
            print("Direct PostgreSQL connection not reachable; checking REST API...")


if __name__ == "__main__":
    main()
