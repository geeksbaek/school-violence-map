"""
macOS Vision Live Text로 캡차 OCR.
Usage: python3 _macocr.py path/to/img.png
"""
import sys
import Vision
from Foundation import NSURL
from Quartz import CGImageSourceCreateWithURL, CGImageSourceCreateImageAtIndex

def ocr(path: str) -> str:
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

if __name__ == "__main__":
    print(ocr(sys.argv[1]))
