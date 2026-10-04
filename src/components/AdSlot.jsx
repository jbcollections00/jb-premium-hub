import React, { useState, useEffect, useRef } from "react";

const NATIVE_SCRIPT_URL =
  "https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js";

const NATIVE_CONTAINER_ID =
  "container-07daf68a9e786bf55c0980163fb30853";

const SLOT_STYLES = {
  top: {
    wrapper:
      "w-[320px] max-w-full h-[300px] mx-auto flex items-center justify-center mb-4 p-2 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
  },

  middle: {
    wrapper:
      "w-[320px] max-w-full h-[300px] mx-auto flex items-center justify-center my-6 p-2 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
  },

  modal: {
    wrapper:
      "w-[320px] max-w-full h-[300px] mx-auto flex items-center justify-center my-2 p-2 bg-slate-950/80 border border-slate-700 rounded-xl overflow-hidden shadow-md",
  },

  footer: {
    wrapper:
      "w-[320px] max-w-full h-[300px] mx-auto flex items-center justify-center mt-6 p-2 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
  },
};

export default function AdSlot({ position = "top", enabled = true }) {
  // Set initial default height to 160px for compact load
  const [adHeight, setAdHeight] = useState(160);
  const iframeRef = useRef(null);
  const style = SLOT_STYLES[position] || SLOT_STYLES.top;

  useEffect(() => {
    const handleMessage = (event) => {
      if (
        iframeRef.current &&
        event.source === iframeRef.current.contentWindow &&
        event.data &&
        event.data.type === "AD_RESIZE" &&
        event.data.height
      ) {
        setAdHeight(event.data.height);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!enabled) return null;

  const adHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          * {
            box-sizing: border-box;
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            background: transparent;
            overflow: hidden;
          }
          ::-webkit-scrollbar { display: none; }
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding-bottom: 4px;
          }
          #${NATIVE_CONTAINER_ID} {
            width: 100%;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            align-items: center;
          }
          #${NATIVE_CONTAINER_ID} img {
            max-width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
          }
        </style>
      </head>
      <body>
        <script async="async" data-cfasync="false" src="${NATIVE_SCRIPT_URL}"></script>
        <div id="${NATIVE_CONTAINER_ID}"></div>
        <script>
          function sendHeight() {
            const body = document.body;
            const html = document.documentElement;
            const contentHeight = Math.max(
              body.scrollHeight, body.offsetHeight,
              html.clientHeight, html.scrollHeight, html.offsetHeight
            );
            if (contentHeight > 0) {
              window.parent.postMessage({ type: 'AD_RESIZE', height: contentHeight + 10 }, '*');
            }
          }

          // 1. Primary size tracking
          const observer = new ResizeObserver(sendHeight);
          observer.observe(document.body);

          // 2. Standard load trigger
          window.addEventListener('load', sendHeight);

          // 3. Self-terminating fallback loop (runs 10 times max = 8s)
          let pollCount = 0;
          const pollInterval = setInterval(() => {
            sendHeight();
            pollCount++;
            if (pollCount >= 10) {
              clearInterval(pollInterval);
            }
          }, 800);
        </script>
      </body>
    </html>
  `;

  return (
    <div className={style.wrapper}>
      <iframe
        ref={iframeRef}
        srcDoc={adHtml}
        style={{ height: `${Math.min(adHeight, 284)}px`, width: "100%" }}
        className="border-0 transition-all duration-300 ease-out"
        scrolling="no"
        title={`Advertisement - ${position}`}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}