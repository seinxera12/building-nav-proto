import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export default function QRScanner({ onScan, onClose, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('requesting');
  const [timedOut, setTimedOut] = useState(false); // 7.1

  useEffect(() => {
    let cancelled = false;

    function stopCamera() {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || cancelled) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          { inversionAttempts: 'dontInvert' },
        );

        if (code?.data) {
          stopCamera();
          onScan(code.data);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(scanLoop);
    }

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API unavailable');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('active');
        scanLoop();
      } catch (err) {
        if (cancelled) return;
        console.error('Camera error:', err);
        setStatus('error');
        onError?.(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied'
            : 'Camera unavailable',
        );
      }
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [onError, onScan]);

  // 7.1 — 30-second timeout when camera becomes active
  useEffect(() => {
    if (status !== 'active') return;
    const timerId = setTimeout(() => setTimedOut(true), 30_000);
    return () => clearTimeout(timerId);
  }, [status]);

  return (
    <div className="qr-scanner" role="dialog" aria-modal="true" aria-label="QR scanner">
      <video
        ref={videoRef}
        playsInline
        muted
        className="qr-scanner__video"
      />
      <canvas ref={canvasRef} className="qr-scanner__canvas" />

      {status !== 'error' && (
        <div className="qr-scanner__viewfinder" aria-hidden="true">
          <div className="qr-scanner__frame">
            <span className="qr-scanner__corner qr-scanner__corner--tl" />
            <span className="qr-scanner__corner qr-scanner__corner--tr" />
            <span className="qr-scanner__corner qr-scanner__corner--bl" />
            <span className="qr-scanner__corner qr-scanner__corner--br" />
            {status === 'active' && <span className="qr-scanner__line" />}
          </div>
        </div>
      )}

      <div className="qr-scanner__status">
        {status === 'requesting' && <p>Requesting camera access...</p>}
        {status === 'active' && !timedOut && <p>Point at a QR code</p>}
      </div>

      {/* 7.2 — timeout prompt banner */}
      {status === 'active' && timedOut && (
        <div className="qr-scanner__timeout" role="status">
          <p>Having trouble? Try selecting your location from the list.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onClose}
          >
            Select Manually
          </button>
        </div>
      )}

      {/* 10.3 — renamed button to "Select location manually" */}
      {status === 'error' && (
        <div className="qr-scanner__error">
          <div className="qr-scanner__error-icon" aria-hidden="true">📵</div>
          <p>Camera access is unavailable. Allow camera access in browser settings, or select your location manually.</p>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Select location manually
          </button>
        </div>
      )}

      <button
        type="button"
        className="qr-scanner__close"
        onClick={onClose}
        aria-label="Close scanner"
      >
        ✕
      </button>
    </div>
  );
}
