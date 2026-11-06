import os
import threading
from typing import Any
import numpy as np

# Disable OneDNN / MKLDNN dynamic shape cache bug on Windows CPU in PaddlePaddle 3.x
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")

from ..config import OCR_LANGUAGE


class OcrEngineService:
    """
    Singleton wrapper around local PaddleOCR (PP-OCRv5) with thread-safe execution
    and structured bounding-box, polygon, confidence, and reading-order extraction.
    """

    _instance: "OcrEngineService | None" = None
    _lock = threading.Lock()

    def __init__(self, lang: str = OCR_LANGUAGE) -> None:
        self.lang = lang
        self._ocr: Any = None
        self._infer_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "OcrEngineService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(lang=OCR_LANGUAGE)
        return cls._instance

    def _ensure_loaded(self) -> Any:
        if self._ocr is None:
            with self._infer_lock:
                if self._ocr is None:
                    from paddleocr import PaddleOCR

                    low_mem = os.getenv("OCR_LOW_MEMORY_MODE", "0").lower() in (
                        "1",
                        "true",
                        "yes",
                    )
                    ocr_kwargs: dict[str, Any] = {
                        "use_doc_orientation_classify": False,
                        "use_doc_unwarping": False,
                        "use_textline_orientation": False,
                        "enable_mkldnn": False,
                        "lang": self.lang,
                    }
                    if low_mem:
                        ocr_kwargs["text_detection_model_name"] = "PP-OCRv5_mobile_det"
                        ocr_kwargs["text_recognition_model_name"] = "PP-OCRv5_mobile_rec"

                    self._ocr = PaddleOCR(**ocr_kwargs)
        return self._ocr

    def warmup(self) -> None:
        self._ensure_loaded()

    def run_ocr(self, image_bgr: np.ndarray) -> dict[str, Any]:
        """
        Execute PaddleOCR on a preprocessed BGR image array and return:
        - raw_ocr_text: newline-joined text in reading order
        - segments: list of { text, bbox, polygon, confidence, reading_order }
        - mean_confidence: average OCR confidence across detected segments
        """
        ocr = self._ensure_loaded()
        with self._infer_lock:
            results = list(ocr.predict(image_bgr))

        if not results:
            return {
                "raw_ocr_text": "",
                "segments": [],
                "mean_confidence": 0.0,
            }

        page = results[0]
        rec_texts = (
            page.get("rec_texts", [])
            if hasattr(page, "get")
            else getattr(page, "rec_texts", [])
        ) or []
        rec_scores = (
            page.get("rec_scores", [])
            if hasattr(page, "get")
            else getattr(page, "rec_scores", [])
        ) or []
        dt_polys = (
            page.get("rec_polys")
            if hasattr(page, "get") and page.get("rec_polys") is not None
            else (
                page.get("dt_polys", [])
                if hasattr(page, "get")
                else getattr(page, "dt_polys", [])
            )
        ) or []

        raw_items: list[dict[str, Any]] = []
        for idx, text in enumerate(rec_texts):
            cleaned_text = str(text).strip()
            if not cleaned_text:
                continue

            score = float(rec_scores[idx]) if idx < len(rec_scores) else 0.0
            poly_raw = dt_polys[idx] if idx < len(dt_polys) else None

            if poly_raw is not None:
                pts = np.array(poly_raw, dtype=float).reshape(-1, 2)
                polygon = [
                    [int(round(pt[0])), int(round(pt[1]))] for pt in pts
                ]
                x_coords = [p[0] for p in polygon]
                y_coords = [p[1] for p in polygon]
                bbox = [
                    int(min(x_coords)),
                    int(min(y_coords)),
                    int(max(x_coords)),
                    int(max(y_coords)),
                ]
            else:
                polygon = [[0, 0], [0, 0], [0, 0], [0, 0]]
                bbox = [0, 0, 0, 0]

            raw_items.append(
                {
                    "text": cleaned_text,
                    "bbox": bbox,
                    "polygon": polygon,
                    "confidence": round(min(max(score, 0.0), 1.0), 4),
                }
            )

        # Sort into natural reading order (top-to-bottom with 14px row banding, then left-to-right)
        raw_items.sort(key=lambda item: (item["bbox"][1] // 14, item["bbox"][0]))

        segments: list[dict[str, Any]] = []
        for order_idx, item in enumerate(raw_items):
            segments.append(
                {
                    "text": item["text"],
                    "bbox": item["bbox"],
                    "polygon": item["polygon"],
                    "confidence": item["confidence"],
                    "reading_order": order_idx,
                }
            )

        raw_ocr_text = "\n".join(seg["text"] for seg in segments)
        mean_conf = (
            round(
                float(np.mean([seg["confidence"] for seg in segments])),
                4,
            )
            if segments
            else 0.0
        )

        return {
            "raw_ocr_text": raw_ocr_text,
            "segments": segments,
            "mean_confidence": mean_conf,
        }
