import React from 'react';

export default function PageAdGate({ children }) {
  // All ad scripts, popunders, click-triggers, and ad-block checks removed
  return <>{children}</>;
}