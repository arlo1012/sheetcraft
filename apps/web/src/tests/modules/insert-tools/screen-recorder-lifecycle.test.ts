// 未执行：按用户要求仅编写测试，不运行检查。
import { flushPromises, mount } from "@vue/test-utils";
import { effectScope, type EffectScope } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import ScreenRecordingTool from "../../../modules/insert-tools/components/ScreenRecordingTool.vue";
import { useScreenRecorder } from "../../../modules/insert-tools/useScreenRecorder";
import { createAppI18n } from "../../../shared/i18n";

const scopes: EffectScope[] = [];
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  for (const scope of scopes.splice(0)) scope.stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class Track extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  constructor(readonly kind: "video" | "audio") {
    super();
  }
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
  endSharing() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class Stream {
  constructor(private readonly tracks: Track[] = []) {}
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  addTrack(track: Track) {
    this.tracks.push(track);
  }
}

function browser() {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const screen = new Track("video");
  const systemAudio = new Track("audio");
  const mic = new Track("audio");
  const crop = new Track("video");
  const display = new Stream([screen, systemAudio]);
  const microphone = new Stream([mic]);
  const cropped = new Stream([crop]);
  const getDisplayMedia = vi.fn(
    async (_options?: DisplayMediaStreamOptions) => display as unknown as MediaStream,
  );
  const getUserMedia = vi.fn(
    async (_options?: MediaStreamConstraints) => microphone as unknown as MediaStream,
  );
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia, getUserMedia } });
  vi.stubGlobal("MediaStream", Stream);

  const recorders: Recorder[] = [];
  class Recorder {
    static isTypeSupported = vi.fn((type: string) => type.startsWith("video/webm"));
    state: RecordingState = "inactive";
    readonly mimeType: string;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(
      readonly stream: Stream,
      options: MediaRecorderOptions = {},
    ) {
      this.mimeType = options.mimeType ?? "video/webm";
      recorders.push(this);
    }
    start = vi.fn((_timeslice?: number) => {
      this.state = "recording";
    });
    pause = vi.fn(() => {
      this.state = "paused";
    });
    resume = vi.fn(() => {
      this.state = "recording";
    });
    stop = vi.fn(() => {
      this.state = "inactive";
    });
    data(blob: Blob) {
      this.ondataavailable?.({ data: blob });
    }
    finish(blob = new Blob(["recorded bytes"], { type: "video/webm" })) {
      this.data(blob);
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);

  const audioContexts: AudioMixer[] = [];
  class AudioMixer {
    close = vi.fn(async () => {});
    resume = vi.fn(async () => {});
    createMediaStreamDestination = vi.fn(() => ({ stream: new Stream([new Track("audio")]) }));
    createMediaStreamSource = vi.fn((_stream: Stream) => ({ connect: vi.fn() }));
    constructor() {
      audioContexts.push(this);
    }
  }
  vi.stubGlobal("AudioContext", AudioMixer);

  const createObjectURL = vi.fn(() => "blob:recording-preview");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const video = document.createElement("video");
  Object.defineProperties(video, {
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
    srcObject: { value: null, writable: true },
  });
  const play = vi.spyOn(video, "play").mockResolvedValue();
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const requestFrame = vi.fn(() => 17);
  const cancelFrame = vi.fn();
  Object.defineProperties(video, {
    requestVideoFrameCallback: { value: requestFrame, configurable: true },
    cancelVideoFrameCallback: { value: cancelFrame, configurable: true },
  });
  const canvas = document.createElement("canvas");
  const drawImage = vi.fn();
  vi.spyOn(canvas, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(canvas, "toBlob").mockImplementation((callback) =>
    callback(new Blob(["frame"], { type: "image/png" })),
  );
  const captureStream = vi.fn(() => cropped);
  Object.defineProperty(canvas, "captureStream", { value: captureStream, configurable: true });
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag, options) =>
    tag === "video" ? video : tag === "canvas" ? canvas : create(tag, options),
  );
  return {
    screen,
    systemAudio,
    mic,
    crop,
    display,
    microphone,
    getDisplayMedia,
    getUserMedia,
    recorders,
    audioContexts,
    createObjectURL,
    revokeObjectURL,
    video,
    play,
    pause,
    requestFrame,
    cancelFrame,
    captureStream,
    drawImage,
    setTime(value: number) {
      now = value;
    },
  };
}

function fixture() {
  const api = browser();
  const scope = effectScope();
  scopes.push(scope);
  const actions = scope.run(() => useScreenRecorder())!;
  return { ...api, scope, actions };
}

describe("screen recorder bounded lifecycle", () => {
  test.each(["reset", "scope disposal"] as const)(
    "stops every late display track after closing through %s while the sharing picker is pending",
    async (close) => {
      const f = fixture();
      const shared = deferred<MediaStream>();
      f.getDisplayMedia.mockReturnValueOnce(shared.promise);
      const pending = f.actions.start(false, true, false);
      expect(f.actions.stage.value).toBe("sharing");
      if (close === "reset") f.actions.reset();
      else f.scope.stop();
      shared.resolve(f.display as unknown as MediaStream);
      await pending;

      expect(f.screen.stop).toHaveBeenCalledTimes(1);
      expect(f.systemAudio.stop).toHaveBeenCalledTimes(1);
      expect(f.recorders).toEqual([]);
      expect(f.actions.stage.value).toBe("setup");
      expect(f.actions.result.value).toBeUndefined();
      expect(f.actions.previewUrl.value).toBe("");
      expect(f.createObjectURL).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("stops an acquired display and a late microphone when canceled during microphone permission", async () => {
    const f = fixture();
    const microphone = deferred<MediaStream>();
    f.getUserMedia.mockReturnValueOnce(microphone.promise);
    const pending = f.actions.start(false, true, true);
    await flushPromises();
    expect(f.getUserMedia).toHaveBeenCalledWith({ audio: true });
    f.actions.reset();
    microphone.resolve(f.microphone as unknown as MediaStream);
    await pending;

    expect(f.screen.stop).toHaveBeenCalledTimes(1);
    expect(f.systemAudio.stop).toHaveBeenCalledTimes(1);
    expect(f.mic.stop).toHaveBeenCalledTimes(1);
    expect(f.recorders).toEqual([]);
    expect(f.actions.result.value).toBeUndefined();
    expect(f.actions.stage.value).toBe("setup");
  });

  test("pauses and resumes the same recorder while elapsed time excludes the paused interval", async () => {
    const f = fixture();
    await f.actions.start(false, true, false);
    const live = f.recorders[0]!;
    expect(f.actions.stage.value).toBe("recording");
    expect(f.actions.docked.value).toBe(true);
    expect(live.start).toHaveBeenCalledExactlyOnceWith(1000);
    live.data(new Blob(["first"]));
    live.data(new Blob([]));
    f.setTime(2500);
    vi.advanceTimersByTime(250);
    expect(f.actions.elapsed.value).toBe(2);
    f.actions.togglePause();
    expect(live.pause).toHaveBeenCalledTimes(1);
    expect(f.actions.stage.value).toBe("paused");
    f.setTime(9000);
    vi.advanceTimersByTime(750);
    expect(f.actions.elapsed.value).toBe(2);
    f.actions.togglePause();
    expect(live.resume).toHaveBeenCalledTimes(1);
    expect(f.actions.stage.value).toBe("recording");
    f.setTime(10750);
    vi.advanceTimersByTime(250);
    expect(f.actions.elapsed.value).toBe(4);
    f.actions.stop();
    expect(live.stop).toHaveBeenCalledTimes(1);
    expect(f.actions.stage.value).toBe("finishing");
    expect(f.actions.elapsed.value).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
    live.finish(new Blob(["last"]));

    expect(f.actions.stage.value).toBe("preview");
    expect(f.actions.docked.value).toBe(false);
    expect(f.actions.result.value).toBeInstanceOf(File);
    expect(f.actions.result.value!.type).toBe("video/webm");
    expect(await f.actions.result.value!.text()).toBe("firstlast");
    expect(f.actions.previewUrl.value).toBe("blob:recording-preview");
    expect(f.screen.stop).toHaveBeenCalledTimes(1);
    expect(f.systemAudio.stop).toHaveBeenCalledTimes(1);
    f.actions.reset();
    expect(f.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:recording-preview");
    expect(f.actions.result.value).toBeUndefined();
  });

  test.each(["recording", "paused"] as const)(
    "system sharing end while %s finalizes once and releases region video, audio, tracks, and timers",
    async (state) => {
      const f = fixture();
      await f.actions.start(true, true, true);
      expect(f.actions.stage.value).toBe("region");
      expect(f.actions.regionFrame.value).toBeInstanceOf(File);
      f.actions.begin({ x: 30, y: 40, width: 320, height: 180 });
      const live = f.recorders[0]!;
      if (state === "paused") f.actions.togglePause();
      expect(f.captureStream).toHaveBeenCalledExactlyOnceWith(30);
      expect(f.audioContexts).toHaveLength(1);
      f.screen.endSharing();
      expect(live.stop).toHaveBeenCalledTimes(1);
      expect(f.actions.stage.value).toBe("finishing");
      live.finish();

      expect(f.actions.stage.value).toBe("preview");
      expect(f.actions.result.value).toBeInstanceOf(File);
      expect(f.cancelFrame).toHaveBeenCalledExactlyOnceWith(17);
      expect(f.pause).toHaveBeenCalledTimes(1);
      expect(f.video.srcObject).toBeNull();
      for (const track of [f.screen, f.systemAudio, f.mic, f.crop])
        expect(track.stop).toHaveBeenCalledTimes(1);
      expect(f.audioContexts[0]!.close).toHaveBeenCalledTimes(1);
      expect(live.ondataavailable).toBeNull();
      expect(live.onstop).toBeNull();
      expect(live.onerror).toBeNull();
      expect(f.actions.regionFrame.value).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test("ending sharing before confirming a recording region discards the frame and releases the player", async () => {
    const f = fixture();
    await f.actions.start(true, false, false);
    expect(f.actions.stage.value).toBe("region");
    f.screen.endSharing();

    expect(f.actions.stage.value).toBe("setup");
    expect(f.actions.regionFrame.value).toBeUndefined();
    expect(f.actions.result.value).toBeUndefined();
    expect(f.recorders).toEqual([]);
    expect(f.pause).toHaveBeenCalledTimes(1);
    expect(f.video.srcObject).toBeNull();
    expect(f.screen.stop).toHaveBeenCalledTimes(1);
    expect(f.createObjectURL).not.toHaveBeenCalled();
  });

  test("reset discards an active recording and makes its retained stop callback inert", async () => {
    const f = fixture();
    await f.actions.start(false, true, false);
    const live = f.recorders[0]!;
    live.data(new Blob(["unsaved recording"]));
    const oldStop = live.onstop!;
    f.actions.reset();
    oldStop();

    expect(live.stop).toHaveBeenCalledTimes(1);
    expect(live.onstop).toBeNull();
    expect(live.ondataavailable).toBeNull();
    expect(f.actions.stage.value).toBe("setup");
    expect(f.actions.result.value).toBeUndefined();
    expect(f.createObjectURL).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test("canceling the recording tool during sharing does not insert a file and stops the late stream", async () => {
    const f = browser();
    const shared = deferred<MediaStream>();
    f.getDisplayMedia.mockReturnValueOnce(shared.promise);
    const wrapper = mount(ScreenRecordingTool, {
      attachTo: document.body,
      props: { canInsert: true },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    const start = wrapper
      .findAllComponents(Button)
      .find((button) => button.props("theme") === "primary")!;
    await start.trigger("click");
    expect(f.getDisplayMedia).toHaveBeenCalledTimes(1);
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toEqual([[]]);
    mounted.splice(mounted.indexOf(wrapper), 1);
    wrapper.unmount();
    shared.resolve(f.display as unknown as MediaStream);
    await flushPromises();

    expect(f.screen.stop).toHaveBeenCalledTimes(1);
    expect(f.systemAudio.stop).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("insert")).toBeUndefined();
    expect(f.recorders).toEqual([]);
    expect(f.createObjectURL).not.toHaveBeenCalled();
  });

  test("a rejected sharing picker leaves no recording, preview, or active timer", async () => {
    const f = fixture();
    f.getDisplayMedia.mockRejectedValueOnce(new DOMException("Canceled", "NotAllowedError"));
    await f.actions.start(false, false, false);
    expect(f.actions.stage.value).toBe("setup");
    expect(f.actions.error.value).toBe("denied");
    expect(f.actions.result.value).toBeUndefined();
    expect(f.recorders).toEqual([]);
    expect(f.createObjectURL).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
