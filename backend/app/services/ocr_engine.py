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
                        "use_doc_orientation_classify": True,
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

        merged_items = _merge_same_line_segments(raw_items)

        segments: list[dict[str, Any]] = []
        for order_idx, item in enumerate(merged_items):
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

        # Determine upright image dimensions after PaddleOCR doc orientation preprocessor
        doc_prep = (
            page.get("doc_preprocessor_res")
            if hasattr(page, "get")
            else getattr(page, "doc_preprocessor_res", None)
        )
        upright_shape = image_bgr.shape[:2]
        upright_image = image_bgr
        if doc_prep is not None:
            out_img = (
                doc_prep.get("output_img")
                if hasattr(doc_prep, "get")
                else getattr(doc_prep, "output_img", None)
            )
            if out_img is not None and hasattr(out_img, "shape"):
                upright_shape = out_img.shape[:2]
                upright_image = out_img

        return {
            "raw_ocr_text": raw_ocr_text,
            "segments": segments,
            "mean_confidence": mean_conf,
            "upright_shape": upright_shape,
            "upright_image": upright_image,
        }


def _merge_same_line_segments(raw_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Merge horizontally adjacent word boxes on the same text line (e.g. wide-kerned words
    like 'Bangalore' '560' '051.' or 'VARDHAMAN' 'SCALES') while preserving multi-column separation.
    """
    if not raw_items:
        return []

    # Sort top-to-bottom by vertical center
    items_by_cy = sorted(
        raw_items,
        key=lambda it: (0.5 * (it["bbox"][1] + it["bbox"][3]), it["bbox"][0]),
    )

    rows: list[list[dict[str, Any]]] = []
    for item in items_by_cy:
        y1, y2 = item["bbox"][1], item["bbox"][3]
        h = max(1, y2 - y1)
        placed = False
        for row in rows:
            ry1 = int(np.median([r["bbox"][1] for r in row]))
            ry2 = int(np.median([r["bbox"][3] for r in row]))
            rh = max(1, ry2 - ry1)
            overlap = min(y2, ry2) - max(y1, ry1)
            min_h = min(h, rh)
            max_h = max(h, rh)
            if overlap >= 0.42 * min_h and max_h <= 1.9 * min_h:
                row.append(item)
                placed = True
                break
        if not placed:
            rows.append([item])

    # Sort rows top-to-bottom by median y1
    rows.sort(key=lambda r: float(np.median([x["bbox"][1] for x in r])))

    merged_all: list[dict[str, Any]] = []
    for row in rows:
        row.sort(key=lambda x: x["bbox"][0])
        curr = dict(row[0])
        for nxt in row[1:]:
            curr_h = max(1, curr["bbox"][3] - curr["bbox"][1])
            nxt_h = max(1, nxt["bbox"][3] - nxt["bbox"][1])
            avg_h = 0.5 * (curr_h + nxt_h)
            x_gap = nxt["bbox"][0] - curr["bbox"][2]

            if -0.45 * max(avg_h, 14.0) <= x_gap <= 1.65 * max(avg_h, 14.0):
                t1 = curr["text"].strip()
                t2 = nxt["text"].strip()
                joiner = (
                    ""
                    if t1.endswith("-") or t2.startswith((",", ".", ":", ";", ")"))
                    else " "
                )
                joined_text = f"{t1}{joiner}{t2}"
                bx1 = min(curr["bbox"][0], nxt["bbox"][0])
                by1 = min(curr["bbox"][1], nxt["bbox"][1])
                bx2 = max(curr["bbox"][2], nxt["bbox"][2])
                by2 = max(curr["bbox"][3], nxt["bbox"][3])
                w1 = max(1, len(t1))
                w2 = max(1, len(t2))
                merged_conf = round(
                    (curr["confidence"] * w1 + nxt["confidence"] * w2) / (w1 + w2),
                    4,
                )
                curr = {
                    "text": joined_text,
                    "bbox": [bx1, by1, bx2, by2],
                    "polygon": [[bx1, by1], [bx2, by1], [bx2, by2], [bx1, by2]],
                    "confidence": merged_conf,
                }
            else:
                merged_all.append(curr)
                curr = dict(nxt)
        merged_all.append(curr)

    return merged_all
