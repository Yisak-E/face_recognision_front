'use client';

import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { useEffect, useRef, useState } from 'react';
import { loadFaceModels } from '@/lib/faceApi';

const API_BASE = 'http://127.0.0.1:8000';

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.5,
});

type FaceLabel = {
  box: faceapi.Box;
  name: string;
  confidence: number;
};

export default function FaceCapture() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Loading models…');
  const [labels, setLabels] = useState<FaceLabel[]>([]);

  // ✅ 1. Load models ONCE
  useEffect(() => {
    loadFaceModels().then(() => {
      setReady(true);
      setStatus('Models loaded');
    });
  }, []);

  // ✅ 2. Face registration (button click)
  async function registerFace() {
    if (!ready || !webcamRef.current || !name) {
      alert('Models not ready or name missing');
      return;
    }

    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    const img = await faceapi.fetchImage(imageSrc);

    const detection = await faceapi
      .detectSingleFace(img, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setStatus('❌ No face detected');
      return;
    }

    await fetch(`${API_BASE}/face/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: name,
        embedding: Array.from(detection.descriptor),
      }),
    });

    setStatus(`✅ Face registered for ${name}`);
    setName('');
  }

  // ✅ 3. Live detection + recognition (FIXED useEffect)
  useEffect(() => {
    if (!ready) return; // 👈 SAFE: dependency array still exists

    const interval = setInterval(async () => {
      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState !== 4) return;

      const displaySize = {
        width: video.videoWidth,
        height: video.videoHeight,
      };

      faceapi.matchDimensions(canvas, displaySize);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const detections = await faceapi
        .detectAllFaces(video, detectorOptions)
        .withFaceLandmarks()
        .withFaceDescriptors();

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (detections.length === 0) {
        setStatus('❌ No face detected');
        setLabels([]);
        return;
      }

      setStatus(`✅ ${detections.length} face(s) detected`);

      const resized = faceapi.resizeResults(detections, displaySize);

      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);

      const newLabels: FaceLabel[] = [];

      for (const det of resized) {
        const res = await fetch(`${API_BASE}/face/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embedding: Array.from(det.descriptor),
          }),
        });

        const data = await res.json();

        if (data.match) {
          newLabels.push({
            box: det.detection.box,
            name: data.username,
            confidence: data.confidence,
          });
        }
      }

      // Draw names
      newLabels.forEach((f) => {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(f.box.x, f.box.y - 26, f.box.width, 24);

        ctx.fillStyle = 'white';
        ctx.font = '14px Arial';
        ctx.fillText(
          `${f.name} (${(f.confidence * 100).toFixed(1)}%)`,
          f.box.x + 6,
          f.box.y - 8
        );
      });

      setLabels(newLabels);
    }, 500);

    return () => clearInterval(interval);
  }, [ready]); // ✅ ALWAYS SAME DEPENDENCY ARRAY

  return (
    <div className="flex flex-col items-center gap-4">
      <h1 className="text-xl font-bold">Face Recognition Demo</h1>

      <div className="relative">
        <Webcam ref={webcamRef} className="rounded-lg" />
        <canvas ref={canvasRef} className="absolute top-0 left-0" />
      </div>

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter name"
          className="border px-3 py-2 rounded"
        />
        <button
          onClick={registerFace}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Register Face
        </button>
      </div>

      <p className="font-semibold">{status}</p>
    </div>
  );
}
