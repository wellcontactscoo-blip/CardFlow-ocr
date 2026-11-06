import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Use isolated test SQLite DB
TEST_DB_PATH = BACKEND_DIR / "data" / "test_cardflow.db"
if TEST_DB_PATH.exists():
    try:
        TEST_DB_PATH.unlink()
    except OSError:
        pass
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH.as_posix()}"

from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db
from scripts.generate_sample_cards import generate_all_samples

init_db()
SAMPLE_PATHS = generate_all_samples()
client = TestClient(app)


def test_01_health_check():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["max_batch_size"] == 50
    assert body["storage_buckets"]["visiting-cards-original"] is True
    assert body["storage_buckets"]["visiting-cards-processed"] is True


def test_02_ocr_test_endpoint_and_non_hallucination():
    # Card 1 has full fields
    card1_path = SAMPLE_PATHS[0]
    with open(card1_path, "rb") as f:
        res1 = client.post(
            "/api/v1/ocr/test",
            files={"file": (card1_path.name, f, "image/jpeg")},
        )
    assert res1.status_code == 200
    data1 = res1.json()
    ext1 = data1["extracted_data"]
    conf1 = data1["extraction_confidence"]

    assert ext1["full_name"] == "Aarav Mehta"
    assert ext1["first_name"] == "Aarav"
    assert ext1["last_name"] == "Mehta"
    assert ext1["phone"] == "+919876543210"
    assert ext1["alternate_phone"] == "+918040928811"
    assert ext1["email"] == "aarav@mehtatech.in"
    assert ext1["postal_code"] == "560001"
    assert ext1["city"] == "Bengaluru"
    assert ext1["state"] == "Karnataka"
    assert "ocr_confidence" in conf1["email"]
    assert "classification_confidence" in conf1["email"]

    # Card 4 (Ananya Reddy) has NO alternate_phone and NO linkedin_url -> must remain None
    card4_path = SAMPLE_PATHS[3]
    with open(card4_path, "rb") as f:
        res4 = client.post(
            "/api/v1/ocr/test",
            files={"file": (card4_path.name, f, "image/jpeg")},
        )
    assert res4.status_code == 200
    ext4 = res4.json()["extracted_data"]
    assert ext4["full_name"] == "Ananya Reddy"
    assert ext4["email"] == "ananya@deccanbiotech.in"
    assert ext4["alternate_phone"] is None
    assert ext4["linkedin_url"] is None


def test_03_auth_and_rls_user_isolation():
    # Register User A
    reg_a = client.post(
        "/api/v1/auth/register",
        json={
            "email": "usera@cardflow.test",
            "password": "password123",
            "full_name": "User Alpha",
            "organization_name": "Alpha Org",
        },
    )
    assert reg_a.status_code == 200
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # Register User B
    reg_b = client.post(
        "/api/v1/auth/register",
        json={
            "email": "userb@cardflow.test",
            "password": "password123",
            "full_name": "User Beta",
            "organization_name": "Beta Org",
        },
    )
    assert reg_b.status_code == 200
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Forgot & Reset Password flow for User A
    fp = client.post(
        "/api/v1/auth/forgot-password", json={"email": "usera@cardflow.test"}
    )
    assert fp.status_code == 200
    reset_tok = fp.json()["reset_token"]
    assert reset_tok

    rp = client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": "usera@cardflow.test",
            "reset_token": reset_tok,
            "new_password": "newpassword123",
        },
    )
    assert rp.status_code == 200

    # User A uploads a single card scan
    with open(SAMPLE_PATHS[0], "rb") as f:
        scan_res = client.post(
            "/api/v1/scans/single",
            headers=headers_a,
            files={"file": ("card_01.jpg", f, "image/jpeg")},
        )
    assert scan_res.status_code == 200
    scan_a = scan_res.json()
    scan_id = scan_a["id"]
    signed_url = scan_a["original_image_url"]
    assert signed_url is not None

    # Verify private signed URL works when valid, fails when tampered
    rel_signed = signed_url.split("http://127.0.0.1:8000")[-1]
    img_ok = client.get(rel_signed)
    assert img_ok.status_code == 200

    img_tampered = client.get(rel_signed + "tampered")
    assert img_tampered.status_code == 403

    # User A saves contact from scan
    contact_res = client.post(
        "/api/v1/contacts",
        headers=headers_a,
        json={
            "scan_id": scan_id,
            **scan_a["extracted_data"],
            "notes": "Initial meeting note",
        },
    )
    assert contact_res.status_code == 200
    contact_a = contact_res.json()
    contact_id = contact_a["id"]

    # RLS Isolation Verification: User B cannot access User A's scan or contact
    assert (
        client.get(f"/api/v1/scans/{scan_id}", headers=headers_b).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/v1/contacts/{contact_id}", headers=headers_b
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/v1/contacts/{contact_id}", headers=headers_b
        ).status_code
        == 404
    )
    list_b = client.get("/api/v1/contacts", headers=headers_b).json()
    assert list_b["total"] == 0

    # Duplicate Detection Verification for User A
    dup_res = client.post(
        "/api/v1/contacts/check-duplicates",
        headers=headers_a,
        json={
            "full_name": "Aarav Mehta",
            "phone": "098765 43210",
            "email": "aarav@mehtatech.in",
        },
    )
    assert dup_res.status_code == 200
    dups = dup_res.json()["duplicates"]
    assert len(dups) == 1
    assert dups[0]["contact"]["id"] == contact_id


def test_04_bulk_batch_10_20_and_50_cards():
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "userb@cardflow.test", "password": "password123"},
    )
    assert login.status_code == 200
    headers_b = {"Authorization": f"Bearer {login.json()['access_token']}"}

    card_bytes = SAMPLE_PATHS[0].read_bytes()

    # 1. Verify 51 images exceeds limit (HTTP 400)
    files_51 = [
        ("files", (f"card_{i}.jpg", card_bytes, "image/jpeg"))
        for i in range(51)
    ]
    res_51 = client.post(
        "/api/v1/batches",
        headers=headers_b,
        data={"batch_name": "Oversized Batch"},
        files=files_51,
    )
    assert res_51.status_code == 400

    # 2. Verify 10, 20, and 50 image batch creations succeed without blocking HTTP
    for count in (10, 20, 50):
        files_n = [
            ("files", (f"batch_{count}_card_{i}.jpg", card_bytes, "image/jpeg"))
            for i in range(count)
        ]
        t0 = time.time()
        res_n = client.post(
            "/api/v1/batches",
            headers=headers_b,
            data={"batch_name": f"Batch of {count}"},
            files=files_n,
        )
        elapsed = time.time() - t0
        assert res_n.status_code == 200
        body = res_n.json()
        assert body["batch"]["total_images"] == count
        assert len(body["scans"]) == count
        # Ensure batch creation returns immediately (< 3 seconds even for 50 images)
        assert elapsed < 3.0


if __name__ == "__main__":
    test_01_health_check()
    print("PASS: test_01_health_check")
    test_02_ocr_test_endpoint_and_non_hallucination()
    print("PASS: test_02_ocr_test_endpoint_and_non_hallucination")
    test_03_auth_and_rls_user_isolation()
    print("PASS: test_03_auth_and_rls_user_isolation")
    test_04_bulk_batch_10_20_and_50_cards()
    print("PASS: test_04_bulk_batch_10_20_and_50_cards")
    print("ALL E2E BACKEND TESTS PASSED!")

