import React, { useEffect, useRef } from 'react';

export default function AdsterraNativeBanner({ className = '' }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (iframeRef.current) {
      const iframeDoc = iframeRef.current.contentDocument;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  background: transparent;
                  overflow: hidden;
                }
              </style>
            </head>
            <body>
              <div id="container-07daf68a9e786bf55c0980163fb30853"></div>
              <script type="text/javascript" src="https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js" data-cfasync="false" async></script>
            </body>
          </html>
        `);
        iframeDoc.close();
      }
    }
  }, []);

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 my-4 flex justify-center overflow-hidden ${className}`}>
      <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 min-h-[120px] flex items-center justify-center shadow-lg">
        <iframe
          ref={iframeRef}
          title="Adsterra Native Banner"
          className="w-full h-[100px] border-none overflow-hidden"
          scrolling="no"
        />
      </div>
    </div>
  );
}