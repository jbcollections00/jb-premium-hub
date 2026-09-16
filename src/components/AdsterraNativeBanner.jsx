import React, { useEffect, useRef } from 'react';

export default function AdsterraNativeBanner({ className = '' }) {
  const adRef = useRef(null);

  useEffect(() => {
    const containerNode = adRef.current;
    if (!containerNode) return;

    // Clear previous elements to avoid duplicates on re-renders/route changes
    containerNode.innerHTML = '';

    const containerDiv = document.createElement('div');
    containerDiv.id = 'container-07daf68a9e786bf55c0980163fb30853';

    const script = document.createElement('script');
    script.src = 'https://deeprootedpressure.com/07daf68a9e786bf55c0980163fb30853/invoke.js';
    script.async = true;
    script.setAttribute('data-cfasync', 'false');

    containerNode.appendChild(containerDiv);
    containerNode.appendChild(script);

    return () => {
      if (containerNode) {
        containerNode.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 my-4 flex justify-center overflow-hidden ${className}`}>
      <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 min-h-[120px] flex items-center justify-center shadow-lg">
        <div ref={adRef} className="w-full flex justify-center" />
      </div>
    </div>
  );
}