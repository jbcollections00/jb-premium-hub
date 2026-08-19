import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LandingPage() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const navigate = useNavigate();

  const handleEnterClick = () => {
    setShowDisclaimer(true);
  };

  const handleConfirmAge = () => {
    // Kapag 18+ na, papuntahin sila sa Login/Signup page
    navigate('/login');
  };

  const handleExit = () => {
    window.location.href = 'https://www.google.com';
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white px-4 relative">
      <div className="text-center max-w-2xl">
        <span className="inline-block bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-semibold px-3 py-1 rounded-full mb-4">
          18+ ADULT CONTENT ONLY
        </span>
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
          JB Premium Hub
        </h1>
        <p className="text-gray-400 text-lg mb-8">
          The ultimate vault for premium media collections. Strictly for adult audiences only.
        </p>
        <button 
          onClick={handleEnterClick}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 px-8 rounded-full transition-all shadow-lg shadow-blue-500/30 cursor-pointer"
        >
          Enter the Vault
        </button>
      </div>

      {/* Age Verification Modal Pop-up */}
      {showDisclaimer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 p-6 md:p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold border border-red-500/20">
              18+
            </div>
            <h2 className="text-2xl font-bold mb-2 text-white">Age Verification Required</h2>
            <p className="text-gray-400 text-sm mb-6">
              This website contains adult material. You must be at least 18 years old or of legal age in your jurisdiction to view this content.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleConfirmAge}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
              >
                I am 18 or older - Enter
              </button>
              <button
                onClick={handleExit}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-xl transition-all cursor-pointer"
              >
                I am under 18 - Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}