import { computed, onScopeDispose, ref, shallowRef } from "vue";
import type { CaptureRegion } from "./capture-region";

type RecorderStage =
  | "setup"
  | "sharing"
  | "region"
  | "recording"
  | "paused"
  | "finishing"
  | "preview";
export function useScreenRecorder() {
  const stage = ref<RecorderStage>("setup");
  const regionFrame = shallowRef<File>();
  const result = shallowRef<File>();
  const previewUrl = ref("");
  const elapsed = ref(0);
  const error = ref<"denied" | "failed">();
  const canRecord =
    typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  let source: MediaStream | undefined;
  let microphone: MediaStream | undefined;
  let cropped: MediaStream | undefined;
  let mix: AudioContext | undefined;
  let mixedAudio: MediaStream | undefined;
  let player: HTMLVideoElement | undefined;
  let recorder: MediaRecorder | undefined;
  let frameRequest = 0;
  let clock: ReturnType<typeof setInterval> | undefined;
  let accumulated = 0;
  let startedAt = 0;
  let generation = 0;

  function stopTracks(stream?: MediaStream) {
    stream?.getTracks().forEach((track) => track.stop());
  }
  function stopClock() {
    clearInterval(clock);
    clock = undefined;
  }
  function release() {
    stopClock();
    if (player) {
      if (frameRequest) player.cancelVideoFrameCallback(frameRequest);
      player.pause();
      player.srcObject = null;
    }
    frameRequest = 0;
    player = undefined;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorder = undefined;
    }
    stopTracks(source);
    stopTracks(microphone);
    stopTracks(cropped);
    stopTracks(mixedAudio);
    mixedAudio = undefined;
    source = undefined;
    microphone = undefined;
    cropped = undefined;
    if (mix) {
      void mix.close();
      mix = undefined;
    }
    regionFrame.value = undefined;
  }
  function reset() {
    generation++;
    release();
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = "";
    result.value = undefined;
    error.value = undefined;
    stage.value = "setup";
    elapsed.value = 0;
  }
  function preview(file: File) {
    reset();
    result.value = file;
    previewUrl.value = URL.createObjectURL(file);
    stage.value = "preview";
  }
  function failed(cause: unknown) {
    reset();
    error.value =
      cause instanceof DOMException && cause.name === "NotAllowedError" ? "denied" : "failed";
  }
  function rememberTime() {
    if (stage.value === "recording") accumulated += performance.now() - startedAt;
    elapsed.value = Math.floor(accumulated / 1000);
  }
  function stop() {
    if (!recorder || recorder.state === "inactive") return;
    rememberTime();
    stopClock();
    stage.value = "finishing";
    recorder.stop();
  }
  function togglePause() {
    if (recorder?.state === "recording") {
      recorder.pause();
      rememberTime();
      stage.value = "paused";
    } else if (recorder?.state === "paused") {
      recorder.resume();
      startedAt = performance.now();
      stage.value = "recording";
    }
  }
  function begin(region?: CaptureRegion) {
    if (!source) return;
    try {
      const token = generation;
      let videoTrack = source.getVideoTracks()[0]!;
      if (videoTrack.readyState !== "live") throw new Error("Screen sharing ended.");
      if (region && player) {
        const video = player,
          canvas = document.createElement("canvas");
        canvas.width = region.width;
        canvas.height = region.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable.");
        const draw = () => {
          context.drawImage(
            video,
            region.x,
            region.y,
            region.width,
            region.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          frameRequest = video.requestVideoFrameCallback(draw);
        };
        draw();
        cropped = canvas.captureStream(30);
        videoTrack = cropped.getVideoTracks()[0]!;
      }
      const recordingStream = new MediaStream([videoTrack]);
      const audioTracks = [...source.getAudioTracks(), ...(microphone?.getAudioTracks() ?? [])];
      if (audioTracks.length === 1) recordingStream.addTrack(audioTracks[0]!);
      if (audioTracks.length > 1) {
        mix = new AudioContext();
        const destination = mix.createMediaStreamDestination();
        for (const track of audioTracks)
          mix.createMediaStreamSource(new MediaStream([track])).connect(destination);
        void mix.resume();
        mixedAudio = destination.stream;
        recordingStream.addTrack(mixedAudio.getAudioTracks()[0]!);
      }
      const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/mp4"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const live = new MediaRecorder(recordingStream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2500000,
      });
      recorder = live;
      const chunks: Blob[] = [];
      live.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      live.onerror = () => failed(new Error("Recording failed."));
      live.onstop = () => {
        if (token !== generation) return;
        const mime = live.mimeType.split(";")[0] || "video/webm";
        const file = new File(
          chunks,
          "Recording-" +
            new Date().toISOString().replace(/[:.]/g, "-") +
            "." +
            (mime === "video/mp4" ? "mp4" : "webm"),
          { type: mime },
        );
        if (!file.size) {
          failed(new Error("No recording data."));
          return;
        }
        preview(file);
      };
      live.start(1000);
      regionFrame.value = undefined;
      stage.value = "recording";
      accumulated = 0;
      elapsed.value = 0;
      startedAt = performance.now();
      clock = setInterval(() => {
        if (stage.value === "recording")
          elapsed.value = Math.floor((accumulated + performance.now() - startedAt) / 1000);
      }, 250);
    } catch (cause) {
      failed(cause);
    }
  }
  async function start(area: boolean, systemAudio: boolean, micAudio: boolean) {
    reset();
    const token = generation;
    stage.value = "sharing";
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: systemAudio,
      });
      if (token !== generation) {
        stopTracks(display);
        return;
      }
      source = display;
      display.getVideoTracks()[0]!.addEventListener(
        "ended",
        () => {
          if (token !== generation) return;
          if (stage.value === "recording" || stage.value === "paused") stop();
          else if (stage.value !== "finishing") reset();
        },
        { once: true },
      );
      if (micAudio) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (token !== generation) {
          stopTracks(mic);
          return;
        }
        microphone = mic;
      }
      if (!area) {
        begin();
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = display;
      player = video;
      await video.play();
      if (token !== generation) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable.");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (token !== generation) return;
      if (!blob) throw new Error("No preview frame.");
      regionFrame.value = new File([blob], "region.png", { type: "image/png" });
      stage.value = "region";
    } catch (cause) {
      if (token === generation) failed(cause);
    }
  }
  onScopeDispose(reset);
  const docked = computed(() => ["recording", "paused", "finishing"].includes(stage.value));
  return {
    stage,
    regionFrame,
    result,
    previewUrl,
    elapsed,
    error,
    canRecord,
    docked,
    start,
    begin,
    stop,
    togglePause,
    preview,
    reset,
  };
}
