"""
캡차 전처리 + tesseract OCR.
Usage: python3 _captcha_solve.py path/to/captcha.png
"""
import sys, subprocess, tempfile, os
import cv2
import numpy as np

def solve(path: str) -> str:
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return ""

    # Upscale 3x — 작은 이미지에서 OCR 정확도 ↑
    img = cv2.resize(img, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)

    # Binarize
    _, bw = cv2.threshold(img, 128, 255, cv2.THRESH_BINARY)

    # 가로 직선 검출 (전체 너비의 ~50% 이상으로 긴 선)
    h, w = bw.shape
    inv = 255 - bw  # 글자/선이 흰색
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w // 8), 1))
    lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, horiz_kernel, iterations=1)

    # 검출된 가로선을 흰색(배경)으로 덮어 제거
    bw_clean = bw.copy()
    contours, _ = cv2.findContours(lines, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        cv2.drawContours(bw_clean, [c], -1, 255, 8)  # 굵게 덮음

    # 잔여 노이즈 제거 (median blur)
    bw_clean = cv2.medianBlur(bw_clean, 3)

    # tesseract 호출
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        tmp = f.name
    try:
        cv2.imwrite(tmp, bw_clean)
        for psm in (7, 8, 6, 13):
            res = subprocess.run(
                ["tesseract", tmp, "-", "-c", "tessedit_char_whitelist=0123456789",
                 "--psm", str(psm)],
                capture_output=True, text=True
            )
            digits = "".join(c for c in res.stdout if c.isdigit())
            if len(digits) == 6:
                return digits
        # 6자리 안 나오면 가장 길게 찾은 것 반환
        return ""
    finally:
        os.unlink(tmp)

if __name__ == "__main__":
    print(solve(sys.argv[1]))
