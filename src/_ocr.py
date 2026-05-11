"""
캡차 OCR 엔진 — macOS Vision Live Text (무료, 80%+ 정확도).
Usage: python3 _ocr.py path/to/captcha.png
출력: 6자리 숫자만 (못 풀면 빈 문자열)
"""
import sys, tempfile, os
from PIL import Image
import numpy as np
import Vision
from Foundation import NSURL
from Quartz import CGImageSourceCreateWithURL, CGImageSourceCreateImageAtIndex


def _to_white_bg(path: str, upscale: int = 1) -> str:
    """RGBA → 흰 배경 합성 + 옵션 업스케일. 임시 PNG 경로 반환."""
    pil = Image.open(path)
    if pil.mode == "RGBA" or "A" in pil.getbands():
        bg = Image.new("RGB", pil.size, (255, 255, 255))
        bg.paste(pil, mask=pil.split()[-1])
        pil = bg
    else:
        pil = pil.convert("RGB")
    if upscale > 1:
        pil = pil.resize((pil.width * upscale, pil.height * upscale), Image.LANCZOS)
    fd, tmp = tempfile.mkstemp(suffix=".png", prefix="ocrin_")
    os.close(fd)
    pil.save(tmp)
    return tmp


def vision_ocr(path: str) -> str:
    src = CGImageSourceCreateWithURL(NSURL.fileURLWithPath_(path), None)
    if not src:
        return ""
    img = CGImageSourceCreateImageAtIndex(src, 0, None)
    if not img:
        return ""
    req = Vision.VNRecognizeTextRequest.alloc().init()
    req.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
    req.setUsesLanguageCorrection_(False)
    req.setRecognitionLanguages_(["en-US"])
    handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(img, {})
    handler.performRequests_error_([req], None)
    out = []
    for obs in (req.results() or []):
        cands = obs.topCandidates_(1)
        if cands:
            out.append(cands[0].string())
    return " ".join(out)


def solve(path: str) -> str:
    """캡차 풀이 → 6자리 숫자 또는 빈 문자열. raw → 4x upscale 순으로 시도."""
    for up in (1, 4):
        tmp = None
        try:
            tmp = _to_white_bg(path, upscale=up)
            raw = vision_ocr(tmp)
            digits = "".join(c for c in raw if c.isdigit())
            if len(digits) == 6:
                return digits
        finally:
            if tmp:
                try: os.unlink(tmp)
                except: pass
    return ""


if __name__ == "__main__":
    print(solve(sys.argv[1]))
