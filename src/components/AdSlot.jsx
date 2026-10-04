import React from "react";

const NATIVE_SCRIPT_URL =
  "https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js";

const NATIVE_CONTAINER_ID =
  "container-07daf68a9e786bf55c0980163fb30853";

const SLOT_STYLES = {
  top: {
    wrapper:
      "w-full flex flex-col items-center justify-center mb-6 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
    label: "Advertisement",
    labelClass:
      "text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-widest",
    iframeClass:
      "w-full min-h-[220px] sm:min-h-[250px] md:min-h-[280px] border-0",
  },

  middle: {
    wrapper:
      "w-full flex flex-col items-center justify-center my-8 p-3 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
    label: "Advertisement",
    labelClass:
      "text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-widest",
    iframeClass:
      "w-full min-h-[220px] sm:min-h-[250px] md:min-h-[280px] border-0",
  },

  modal: {
    wrapper:
      "w-full flex flex-col items-center justify-center my-4 p-3 bg-slate-950/80 border border-slate-700 rounded-xl overflow-hidden shadow-md",
    label: "Sponsored",
    labelClass:
      "text-[9px] text-slate-500 font-semibold mb-1 uppercase tracking-widest",
    iframeClass:
      "w-full min-h-[200px] sm:min-h-[220px] md:min-h-[250px] border-0",
  },

  footer: {
    wrapper:
      "w-full flex flex-col items-center justify-center mt-10 p-3 bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden shadow-lg",
    label: "Advertisement",
    labelClass:
      "text-[10px] text-slate-500 font-semibold mb-1 uppercase tracking-widest",
    iframeClass:
      "w-full min-h-[220px] sm:min-h-[250px] md:min-h-[280px] border-0",
  },
};

export default function AdSlot({ position = "top", enabled = true }) {
  if (!enabled) return null;

  const style = SLOT_STYLES[position] || SLOT_STYLES.top;

  const adHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            background: transparent;
            overflow-x: hidden;
            overflow-y: auto;
          }
          body {
            display: flex;
            align-items: flex-start;
            justify-content: center;
          }
        </style>
      </head>
      <body>
        <script async="async" data-cfasync="false" src="${NATIVE_SCRIPT_URL}"></script>
        <div id="${NATIVE_CONTAINER_ID}"></div>
      </body>
    </html>
  `;

  return (
    <div className={style.wrapper}>
      <span className={style.labelClass}>{style.label}</span>
      <iframe
        srcDoc={adHtml}
        className={style.iframeClass}
        scrolling="auto"
        title={`Advertisement - ${position}`}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}