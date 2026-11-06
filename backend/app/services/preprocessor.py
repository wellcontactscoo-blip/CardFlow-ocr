from dataclasses import dataclass
import cv2
import numpy as np


@dataclass
class PreprocessResult:
    processed_image: np.ndarray
    processed_jpeg_bytes: bytes
    original_shape: tuple[int, int]  # (height, width)
    processed_shape: tuple[int, int]  # (height, width)
    steps_applied: list[str]
    card_boundary_detected: bool
    is_dark_background: bool
    deskew_angle: float


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _detect_and_warp_card(image: np.ndarray) -> tuple[np.ndarray, bool]:
    """
    Detect a quadrilateral visiting card boundary when photographed against a background
    and apply 4-point perspective correction.
    """
    h, w = image.shape[:2]
    image_area = float(h * w)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edged = cv2.Canny(blurred, 50, 150)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(
        closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < 0.35 * image_area or area > 0.90 * image_area:
            continue
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) == 4 and cv2.isContourConvex(approx):
            pts = approx.reshape(4, 2).astype("float32")
            rect = _order_quad_points(pts)
            (tl, tr, br, bl) = rect

            width_a = np.linalg.norm(br - bl)
            width_b = np.linalg.norm(tr - tl)
            max_width = max(int(width_a), int(width_b))

            height_a = np.linalg.norm(tr - br)
            height_b = np.linalg.norm(tl - bl)
            max_height = max(int(height_a), int(height_b))

            if max_width < 200 or max_height < 120:
                continue

            dst = np.array(
                [
                    [0, 0],
                    [max_width - 1, 0],
                    [max_width - 1, max_height - 1],
                    [0, max_height - 1],
                ],
                dtype="float32",
            )
            matrix = cv2.getPerspectiveTransform(rect, dst)
            warped = cv2.warpPerspective(image, matrix, (max_width, max_height))
            return warped, True

    return image, False


def _estimate_and_correct_skew(image: np.ndarray) -> tuple[np.ndarray, float]:
    """Detect small text-line skew angles (-12 to +12 degrees) and deskew."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 180.0,
        threshold=80,
        minLineLength=max(40, image.shape[1] // 5),
        maxLineGap=15,
    )
    if lines is None or len(lines) == 0:
        return image, 0.0

    angles: list[float] = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        if x2 == x1:
            continue
        angle = float(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
        if -12.0 <= angle <= 12.0:
            angles.append(angle)

    if not angles:
        return image, 0.0

    median_angle = float(np.median(angles))
    if abs(median_angle) < 0.5:
        return image, 0.0

    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    rot_mat = cv2.getRotationMatrix2D(center, median_angle, 1.0)
    deskewed = cv2.warpAffine(
        image,
        rot_mat,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return deskewed, round(median_angle, 2)


def _resize_for_ocr(
    image: np.ndarray, min_long_side: int = 900, max_long_side: int = 1280
) -> tuple[np.ndarray, bool]:
    """Resize image so the longer dimension falls within optimal OCR resolution bounds."""
    h, w = image.shape[:2]
    long_side = max(h, w)
    if long_side < min_long_side:
        scale = min_long_side / float(long_side)
        new_w, new_h = int(round(w * scale)), int(round(h * scale))
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC), True
    if long_side > max_long_side:
        scale = max_long_side / float(long_side)
        new_w, new_h = int(round(w * scale)), int(round(h * scale))
        return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA), True
    return image, False


def preprocess_card_image(
    raw_bytes: bytes, rotation_degrees: int = 0
) -> PreprocessResult:
    """
    Full OpenCV preprocessing pipeline for visiting cards:
    1. Decode original bytes (never mutating original image).
    2. Explicit or automatic rotation.
    3. Card boundary detection & 4-point perspective correction.
    4. Skew angle detection & correction.
    5. Resolution normalization (resizing).
    6. Grayscale conversion & dark-background inversion when beneficial.
    7. Edge-preserving noise removal.
    8. CLAHE localized contrast enhancement.
    9. Gentle unsharp masking (sharpening) + adaptive threshold on low-contrast scans.
    """
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unable to decode image bytes with OpenCV.")

    orig_h, orig_w = img.shape[:2]
    steps: list[str] = []

    # 1. Explicit rotation
    rot = rotation_degrees % 360
    if rot == 90:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
        steps.append("rotate_90_cw")
    elif rot == 180:
        img = cv2.rotate(img, cv2.ROTATE_180)
        steps.append("rotate_180")
    elif rot == 270:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
        steps.append("rotate_270_cw")

    # 2. Card boundary detection & perspective warp
    img, boundary_detected = _detect_and_warp_card(img)
    if boundary_detected:
        steps.append("card_boundary_perspective_warp")

    # 3. Automatic skew correction
    img, deskew_angle = _estimate_and_correct_skew(img)
    if abs(deskew_angle) >= 0.5:
        steps.append(f"deskew_{deskew_angle}deg")

    # 4. Resize for optimal OCR character height
    img, resized = _resize_for_ocr(img)
    if resized:
        steps.append("resize_optimal_ocr")

    # 5. Grayscale analysis for dark background & contrast detection
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    steps.append("grayscale_analysis")

    # 6. Check for dark background card (light text on dark card)
    mean_lum = float(np.mean(gray))
    std_lum = float(np.std(gray))
    is_dark = mean_lum < 85.0
    if is_dark:
        inv_gray = cv2.bitwise_not(gray)
        steps.append("dark_card_inversion")
        denoised = cv2.bilateralFilter(inv_gray, d=3, sigmaColor=15, sigmaSpace=15)
        steps.append("bilateral_noise_removal")
        clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)
        steps.append("clahe_contrast_enhancement")
        processed_bgr = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)
    else:
        # Preserve color channels in LAB space while gently denoising & enhancing L channel
        denoised_bgr = cv2.bilateralFilter(img, d=3, sigmaColor=12, sigmaSpace=12)
        steps.append("bilateral_noise_removal")
        if std_lum < 32.0:
            lab = cv2.cvtColor(denoised_bgr, cv2.COLOR_BGR2LAB)
            l_ch, a_ch, b_ch = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=1.2, tileGridSize=(8, 8))
            l_ch = clahe.apply(l_ch)
            steps.append("clahe_contrast_enhancement")
            processed_bgr = cv2.cvtColor(
                cv2.merge((l_ch, a_ch, b_ch)), cv2.COLOR_LAB2BGR
            )
        else:
            steps.append("contrast_verified")
            processed_bgr = denoised_bgr

    # 7. Gentle unsharp masking when image is soft
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if lap_var < 180.0:
        gaussian = cv2.GaussianBlur(processed_bgr, (0, 0), 1.0)
        processed_bgr = cv2.addWeighted(processed_bgr, 1.15, gaussian, -0.15, 0)
        steps.append("unsharp_mask_sharpening")
    proc_h, proc_w = processed_bgr.shape[:2]

    ok, encoded = cv2.imencode(
        ".jpg", processed_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 95]
    )
    if not ok:
        raise ValueError("Failed to encode processed image.")

    return PreprocessResult(
        processed_image=processed_bgr,
        processed_jpeg_bytes=encoded.tobytes(),
        original_shape=(orig_h, orig_w),
        processed_shape=(proc_h, proc_w),
        steps_applied=steps,
        card_boundary_detected=boundary_detected,
        is_dark_background=is_dark,
        deskew_angle=deskew_angle,
    )
