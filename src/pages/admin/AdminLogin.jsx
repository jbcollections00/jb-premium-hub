import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AdminLogin() {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleAdminLogin = (e) => {
    e.preventDefault();
    // SECRET ADMIN PASSCODE (Palitan mo kung gusto mo)
    if (passcode === 'admin123') {
      localStorage.setItem('isAdminAuthenticated', 'true');
      navigate('/admin-vault-secret');
    } else {
      setError('Invalid Admin Security Key!');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-red-900/50 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
        <div className="w-16 h-16 bg-red-600/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl border border-red-500/30">
          🛡️
        </div>
        <h2 className="text-2xl font-bold text-white mb-1">Admin Security Portal</h2>
        <p className="text-gray-400 text-xs mb-6">Restricted Access • Authorized Personnel Only</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
          <input
            type="password"
            required
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter Admin Passcode"
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-4 py-3 text-center text-lg focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl transition-all cursor-pointer"
          >
            Authenticate Admin
          </button>
        </form>
      </div>
    </div>
  );
}