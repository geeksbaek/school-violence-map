"""
캡차 전처리 실험. 여러 전처리 + 여러 OCR 조합 비교.
Usage: python3 src/_captcha_lab.py
"""
import sys, os, cv2, numpy as np, time
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))

TRUTH = ["133575", "829320", "848057", "100094", "215967"]


def load_gray(path: str) -> np.ndarray:
    """캡차 PNG는 RGBA — alpha를 흰 배경에 합성 후 grayscale 변환."""
    pil = Image.open(path)
    if pil.mode == "RGBA" or "A" in pil.getbands():
        bg = Image.new("RGB", pil.size, (255, 255, 255))
        bg.paste(pil, mask=pil.split()[-1])
        pil = bg
    pil = pil.convert("L")
    return np.array(pil)


# ─── 전처리 변형들 ─────────────────────────────────
def p_raw(img):
    return img

def p_upscale(img):
    return cv2.resize(img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)

def p_remove_lines(img):
    """가로줄 검출 후 inpaint."""
    img = p_upscale(img)
    _, bw = cv2.threshold(img, 100, 255, cv2.THRESH_BINARY_INV)
    h, w = bw.shape
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(40, w // 8), 1))
    horiz = cv2.morphologyEx(bw, cv2.MORPH_OPEN, horiz_kernel, iterations=2)
    # inpaint
    inv = 255 - bw
    result = cv2.inpaint(inv, horiz, 3, cv2.INPAINT_TELEA)
    return result

def p_aggressive(img):
    """더 강한 가로줄 제거 + 글자 강화."""
    img = cv2.resize(img, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
    # adaptive threshold
    bw = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY_INV, 25, 10)
    h, w = bw.shape
    # 가로줄 검출 (얇은 가로 직선)
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(60, w // 6), 1))
    lines_mask = cv2.morphologyEx(bw, cv2.MORPH_OPEN, horiz_kernel, iterations=2)
    # 줄 영역 dilate (조금 더 넓게)
    lines_mask = cv2.dilate(lines_mask, np.ones((5, 5), np.uint8), iterations=1)
    # inpaint 복원
    inv = 255 - bw
    inpainted = cv2.inpaint(inv, lines_mask, 3, cv2.INPAINT_TELEA)
    # 다시 binarize + close (글자 끊긴 부분 복원)
    _, final = cv2.threshold(inpainted, 100, 255, cv2.THRESH_BINARY)
    final = cv2.morphologyEx(final, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return final

def p_row_filter(img):
    """row별로 가로줄(연속 검정)인지 판정 후 흰색으로 채움."""
    img = cv2.resize(img, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
    _, bw = cv2.threshold(img, 100, 255, cv2.THRESH_BINARY)
    h, w = bw.shape
    out = bw.copy()
    for r in range(h):
        row = bw[r]
        # 검정(=line) 픽셀 비율이 매우 높은 row → 가로줄
        black = (row < 128).sum()
        if black > w * 0.6:
            out[r] = 255
    return out


PREPROCESSORS = {
    "raw": p_raw,
    "upscale": p_upscale,
    "removelines": p_remove_lines,
    "aggressive": p_aggressive,
    "rowfilter": p_row_filter,
}


# ─── OCR 엔진들 ─────────────────────────────────
def ocr_tesseract(img):
    import subprocess, tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        cv2.imwrite(f.name, img)
        tmp = f.name
    try:
        for psm in (7, 8, 6, 13):
            r = subprocess.run(["tesseract", tmp, "-",
                               "-c", "tessedit_char_whitelist=0123456789",
                               "--psm", str(psm)],
                              capture_output=True, text=True)
            d = "".join(c for c in r.stdout if c.isdigit())
            if len(d) == 6: return d
        return ""
    finally:
        os.unlink(tmp)

_easyocr_reader = None
def ocr_easy(img):
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr
        _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    res = _easyocr_reader.readtext(img, allowlist="0123456789", detail=0)
    return "".join(res).replace(" ", "")

_ddddocr = None
def ocr_dddd(img):
    global _ddddocr
    if _ddddocr is None:
        import ddddocr
        _ddddocr = ddddocr.DdddOcr(show_ad=False)
    _, buf = cv2.imencode(".png", img)
    return _ddddocr.classification(buf.tobytes())

def ocr_mac(img):
    from _macocr import ocr
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        cv2.imwrite(f.name, img)
        tmp = f.name
    try:
        res = ocr(tmp)
        return "".join(c for c in res if c.isdigit())
    finally:
        os.unlink(tmp)

OCRS = {
    "tess": ocr_tesseract,
    "easy": ocr_easy,
    "dddd": ocr_dddd,
    "mac":  ocr_mac,
}


# ─── 평가 ─────────────────────────────────
def main():
    rows = []
    for pre_name, pre_fn in PREPROCESSORS.items():
        for ocr_name, ocr_fn in OCRS.items():
            hit = 0
            preds = []
            t0 = time.time()
            for i, t in enumerate(TRUTH, 1):
                img = load_gray(f"data/_sample_captcha_{i}.png")
                if img is None: continue
                pp = pre_fn(img)
                try:
                    pred = ocr_fn(pp)
                except Exception as e:
                    pred = f"ERR:{e}"
                preds.append((pred, pred == t))
                if pred == t: hit += 1
            dt = (time.time() - t0) / 5 * 1000
            rows.append((pre_name, ocr_name, hit, dt, preds))

    # 결과 정렬 (정확도 ↓, 속도 ↑)
    rows.sort(key=lambda r: (-r[2], r[3]))
    print(f"\n{'전처리':<12} {'OCR':<6} {'정확':<6} {'속도':<10}")
    print("─" * 60)
    for pre, ocr, hit, dt, preds in rows:
        print(f"{pre:<12} {ocr:<6} {hit}/5    {dt:.0f}ms")
    print()

    # 상위 결과의 상세 출력
    print("=== 최고 조합 상세 ===")
    for pre, ocr, hit, dt, preds in rows[:3]:
        print(f"[{pre} + {ocr}] hit {hit}/5")
        for i, (p, ok) in enumerate(preds, 1):
            print(f"  {i} truth={TRUTH[i-1]} pred={p!r} {'OK' if ok else 'X'}")

if __name__ == "__main__":
    main()
