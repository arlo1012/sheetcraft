/** Captures one frame only after the browser's user-mediated source picker resolves. */
export async function captureScreen(): Promise<File | null> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen capture is unavailable.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") return null;
    throw error;
  }
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  try {
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Screen capture timed out."));
      }, 15000);
      const cleanup = () => {
        clearTimeout(timeout);
        video.onloadeddata = null;
        video.onerror = null;
      };
      video.onloadeddata = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("Screen capture failed."));
      };
      void video.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
    if (!video.videoWidth || !video.videoHeight) throw new Error("Empty capture.");
    const ratio = Math.min(1, 4096 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Capture encoding failed."))),
        "image/png",
      ),
    );
    return new File([blob], "screenshot.png", { type: "image/png" });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.pause();
    video.srcObject = null;
  }
}
