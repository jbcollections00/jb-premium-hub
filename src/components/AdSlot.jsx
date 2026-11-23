import React, { useEffect, useMemo, useRef, useState } from "react";

// JB Premium Hub native-banner placement. A blocked/no-fill native ad should
// NEVER leave a permanent white iframe or 300px blank gap on Home.
const NATIVE_SCRIPT_URL =
  "https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js";
const NATIVE_CONTAINER_ID = "container-07daf68a9e786bf55c0980163fb30853";

const POSITIONS = {
  top: "mb-4",
  middle: "my-5",
  modal: "my-2",
  footer: "mt-6",
};

const MIN_HEIGHT = 90;
const MAX_HEIGHT = 320;
const EMPTY_TIMEOUT_MS = 12000;

function nativeFrameHtml(instanceId) {
  // Keep vendor code in an opaque-origin, sandboxed iframe, not in the app's
  // privileged page. The exact advertising network controls actual fill.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { width: 100%; min-height: 0; margin: 0; padding: 0; overflow: hidden;
      background: transparent; scrollbar-width: none; }
    body { display: flex; justify-content: center; align-items: flex-start; }
    #${NATIVE_CONTAINER_ID} { width: 100%; max-width: 320px; margin: 0 auto; }
    #${NATIVE_CONTAINER_ID} img { display: block; max-width: 100%; height: auto; }
    ::-webkit-scrollbar { display: none; }
  </style>
</head>
<body>
  <script async data-cfasync="false" src="${NATIVE_SCRIPT_URL}"><\/script>
  <div id="${NATIVE_CONTAINER_ID}"><\/div>
  <script>
    (function () {
      var container = document.getElementById("${NATIVE_CONTAINER_ID}");
      var instanceId = ${JSON.stringify(instanceId)};
      var started = Date.now();
      var ready = false;
      var timer;
      var observer;
      var cleanups = [];

      function notify(state, height) {
        parent.postMessage({
          source: "jb-native-ad-slot",
          instanceId: instanceId,
          state: state,
          height: Math.max(${MIN_HEIGHT}, Math.min(${MAX_HEIGHT}, Math.ceil(height || 0)))
        }, "*");
      }
      function hasCreative() {
        if (!container) return false;
        // Placeholder/script/style nodes are NOT a rendered advertisement.
        var links = container.querySelectorAll("a[href]");
        for (var i = 0; i < links.length; i++) {
          var link = links[i];
          if (link.getBoundingClientRect().height > 4 &&
              (link.innerText.trim() || link.querySelector("img,svg,iframe,video"))) return true;
        }
        var images = container.querySelectorAll("img");
        for (var j = 0; j < images.length; j++) {
          var img = images[j];
          if (img.complete && img.naturalWidth > 1 &&
              img.getBoundingClientRect().height > 4) return true;
        }
        var frames = container.querySelectorAll("iframe,video");
        for (var k = 0; k < frames.length; k++) {
          var el = frames[k];
          if (el.getBoundingClientRect().height > 30) return true;
        }
        var text = (container.innerText || "").trim();
        return text.length > 15 && container.getBoundingClientRect().height > 25;
      }
      function measure() {
        if (hasCreative()) {
          ready = true;
          var height = Math.max(container.scrollHeight, container.getBoundingClientRect().height);
          notify("filled", height + 8);
        } else if (ready) {
          notify("empty", 0);
          ready = false;
        } else if (Date.now() - started >= ${EMPTY_TIMEOUT_MS}) {
          notify("empty", 0);
          stop();
        }
      }
      function stop() {
        if (timer) clearInterval(timer);
        if (observer) observer.disconnect();
        cleanups.forEach(function (f) { f(); });
        cleanups = [];
      }
      observer = new MutationObserver(measure);
      observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
      timer = setInterval(measure, 500);
      window.addEventListener("load", measure);
      cleanups.push(function () { window.removeEventListener("load", measure); });
      measure();
    })();
  <\/script>
</body>
</html>`;
}

export default function AdSlot({ position = "top", enabled = true }) {
  const frameRef = useRef(null);
  const instanceId = useRef(null);
  if (instanceId.current === null) instanceId.current = "native-" + Math.random().toString(36).slice(2);
  const [state, setState] = useState("loading");
  const [height, setHeight] = useState(250);

  const frameHtml = useMemo(() => nativeFrameHtml(instanceId.current), []);

  useEffect(() => {
    if (!enabled) return undefined;
    setState("loading");
    setHeight(250);
    const onMessage = (event) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== "jb-native-ad-slot" ||
          data.instanceId !== instanceId.current) return;
      if (data.state === "filled" && Number.isFinite(data.height)) {
        setHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, data.height)));
        setState("filled");
      } else if (data.state === "empty") {
        setState("empty");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-label="Sponsored content"
      data-jb-native-ad={position}
      className={`mx-auto w-full max-w-[340px] ${POSITIONS[position] || POSITIONS.top} ${state === "empty" ? "h-0 !my-0 overflow-hidden" : ""}`}
    >
      <div
        className={`relative mx-auto w-full max-w-[320px] overflow-hidden rounded-xl ${state === "filled" ? "bg-transparent" : "bg-slate-900/50"}`}
        style={{ height: state === "empty" ? 0 : state === "loading" ? 250 : height }}
      >
        {state === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500" aria-hidden="true">
            Loading sponsored content…
          </div>
        )}
        <iframe
          ref={frameRef}
          srcDoc={frameHtml}
          title={`Sponsored native advertisement - ${position}`}
          className="absolute inset-0 w-full border-0"
          style={{ height: Math.max(250, height), opacity: state === "filled" ? 1 : 0 }}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer-when-downgrade"
          scrolling="no"
          loading="lazy"
        />
      </div>
    </div>
  );
}
