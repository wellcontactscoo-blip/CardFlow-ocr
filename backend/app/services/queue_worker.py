import logging
import queue
import threading
from datetime import datetime, timezone

from ..config import (
    MAX_CONCURRENT_OCR_WORKERS,
    ORIGINAL_BUCKET_DIR,
)
from ..database import CardScanModel, ScanBatchModel, SessionLocal
from ..storage import save_to_private_bucket
from .extractor import extract_contact_from_ocr
from .ocr_engine import OcrEngineService
from .preprocessor import preprocess_card_image

logger = logging.getLogger("cardflow.queue_worker")


def recompute_batch_counts(db, batch_id: str | None) -> None:
    """Atomically recompute completed, failed, pending counts and status for a batch."""
    if not batch_id:
        return
    batch = db.query(ScanBatchModel).filter(ScanBatchModel.id == batch_id).first()
    if not batch:
        return

    scans = db.query(CardScanModel).filter(CardScanModel.batch_id == batch_id).all()
    total = len(scans)
    completed = sum(
        1 for s in scans if s.status in ("completed", "review_required")
    )
    failed = sum(1 for s in scans if s.status == "failed")
    pending = sum(
        1 for s in scans if s.status in ("uploaded", "queued", "processing")
    )

    batch.total_images = total
    batch.completed_count = completed
    batch.failed_count = failed
    batch.pending_count = pending

    if pending > 0:
        batch.status = "processing"
        batch.completed_at = None
    else:
        batch.completed_at = datetime.now(timezone.utc)
        if failed == 0 and completed == total and total > 0:
            batch.status = "completed"
        elif completed > 0 and failed > 0:
            batch.status = "partially_completed"
        elif failed == total and total > 0:
            batch.status = "failed"
        else:
            batch.status = "completed"

    db.commit()


def process_single_scan_job(scan_id: str, rotation_degrees: int = 0) -> None:
    """
    Execute OpenCV preprocessing + PaddleOCR + Hybrid Extraction for a single CardScanModel.
    Persists job state transitions: queued -> processing -> completed / review_required / failed.
    """
    db = SessionLocal()
    try:
        scan = db.query(CardScanModel).filter(CardScanModel.id == scan_id).first()
        if not scan:
            return

        scan.status = "processing"
        scan.error_message = None
        db.commit()
        recompute_batch_counts(db, scan.batch_id)

        orig_abs_path = (ORIGINAL_BUCKET_DIR / scan.original_image_path).resolve()
        if not orig_abs_path.exists():
            raise FileNotFoundError(
                f"Original card image not found at {scan.original_image_path}"
            )

        raw_bytes = orig_abs_path.read_bytes()

        # Step 1: OpenCV Preprocessing (preserves original image untouched)
        prep = preprocess_card_image(raw_bytes, rotation_degrees=rotation_degrees)

        # Step 2: Local PaddleOCR Execution (auto-orients 90/180/270 deg cards upright)
        ocr_service = OcrEngineService.get_instance()
        ocr_result = ocr_service.run_ocr(prep.processed_image)

        upright_img = ocr_result.get("upright_image")
        proc_jpeg = prep.processed_jpeg_bytes
        if upright_img is not None and upright_img.shape[:2] != prep.processed_shape:
            import cv2 as _cv2

            ok_enc, enc_buf = _cv2.imencode(
                ".jpg", upright_img, [int(_cv2.IMWRITE_JPEG_QUALITY), 95]
            )
            if ok_enc:
                proc_jpeg = enc_buf.tobytes()

        proc_rel_path = save_to_private_bucket(
            "visiting-cards-processed",
            scan.user_id,
            scan.id,
            "processed.jpg",
            proc_jpeg,
        )

        # Step 3: Hybrid Information Extraction & Separate Confidence Scoring
        extraction = extract_contact_from_ocr(
            ocr_result["segments"],
            image_shape=ocr_result.get("upright_shape", prep.processed_shape),
        )

        scan.processed_image_path = proc_rel_path
        scan.raw_ocr_text = ocr_result["raw_ocr_text"]
        scan.ocr_output = ocr_result["segments"]
        scan.extracted_data = extraction["extracted_data"]
        scan.extraction_confidence = extraction["extraction_confidence"]
        scan.status = (
            "review_required"
            if extraction["needs_human_review"]
            else "completed"
        )
        scan.processed_at = datetime.now(timezone.utc)
        scan.error_message = None
        db.commit()
        recompute_batch_counts(db, scan.batch_id)

    except Exception as exc:
        logger.exception("OCR job failed for scan_id=%s", scan_id)
        try:
            scan = (
                db.query(CardScanModel).filter(CardScanModel.id == scan_id).first()
            )
            if scan:
                scan.status = "failed"
                scan.error_message = str(exc)
                scan.processed_at = datetime.now(timezone.utc)
                db.commit()
                recompute_batch_counts(db, scan.batch_id)
        except Exception:
            db.rollback()
    finally:
        db.close()


class PersistentJobQueueManager:
    """
    Persistent background worker pool with configurable concurrency.
    Recovers unfinished ('uploaded', 'queued', 'processing') jobs from the database on startup
    and processes batch scans asynchronously without blocking HTTP requests.
    """

    _instance: "PersistentJobQueueManager | None" = None
    _lock = threading.Lock()

    def __init__(self, concurrency: int = MAX_CONCURRENT_OCR_WORKERS) -> None:
        self.concurrency = max(1, concurrency)
        self._queue: queue.Queue[tuple[str, int]] = queue.Queue()
        self._workers: list[threading.Thread] = []
        self._started = False

    @classmethod
    def get_instance(cls) -> "PersistentJobQueueManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(concurrency=MAX_CONCURRENT_OCR_WORKERS)
        return cls._instance

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        for i in range(self.concurrency):
            t = threading.Thread(
                target=self._worker_loop,
                name=f"cardflow-ocr-worker-{i+1}",
                daemon=True,
            )
            t.start()
            self._workers.append(t)

        # Recover any interrupted jobs from previous process runs
        self._recover_unfinished_jobs()

    def _recover_unfinished_jobs(self) -> None:
        db = SessionLocal()
        try:
            unfinished = (
                db.query(CardScanModel)
                .filter(
                    CardScanModel.status.in_(["uploaded", "queued", "processing"])
                )
                .order_by(CardScanModel.created_at.asc())
                .all()
            )
            for scan in unfinished:
                scan.status = "queued"
                db.commit()
                self._queue.put((scan.id, 0))
        finally:
            db.close()

    def enqueue_scan(self, scan_id: str, rotation_degrees: int = 0) -> None:
        self.start()
        self._queue.put((scan_id, rotation_degrees))

    def _worker_loop(self) -> None:
        while True:
            scan_id, rotation = self._queue.get()
            try:
                process_single_scan_job(scan_id, rotation_degrees=rotation)
            finally:
                self._queue.task_done()

