import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Fingerprint, Loader2, Eye, EyeOff, UserPlus, KeyRound, CheckCircle, XCircle } from 'lucide-react';
import axios from 'axios';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const navigate = useNavigate();

  const toast = (type, message) => {
    window.dispatchEvent(new CustomEvent('toast', { detail: { type, message } }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('Authenticating...');
    setIsLoading(true);

    try {
      const res = await axios.post('/api/auth/login', {
        identifier: identifier.trim(),
        password,
        rememberMe,
      });

      if (res.data.success) {
        localStorage.setItem('vv_token', res.data.token);
        localStorage.setItem('vv_user', JSON.stringify(res.data.user));
        setStatusMsg('Login successful. Redirecting...');
        toast('success', `Welcome back, ${res.data.user.name}!`);
        setTimeout(() => { window.location.href = '/'; }, 500);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Login failed. Please try again.';
      setErrorMsg(msg);
      setStatusMsg('');
      toast('error', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen font-mono flex flex-col justify-between p-6 text-zinc-500 relative overflow-hidden select-none"
      style={{ background: 'radial-gradient(circle at center, #0c101b 0%, #030407 100%)' }}
    >
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        .tech-scanner-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(227, 227, 203, 0.4), transparent);
          box-shadow: 0 0 10px 1px #e3e3cb;
          animation: scan 4s ease-in-out infinite;
          pointer-events: none;
          z-index: 10;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
      `}</style>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 max-w-7xl w-full mx-auto my-8 relative z-10">

        {/* Left: Biometric Scan Viewport */}
        <div className="flex flex-col items-start w-full lg:w-1/2 max-w-xl">
          <div className="relative border border-zinc-800/80 bg-black/40 rounded-sm p-4 w-full aspect-[1.66] overflow-hidden flex items-center justify-center">
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />
            <div
              className="w-full h-full bg-cover bg-center bg-no-repeat opacity-80 rounded-sm border border-zinc-900"
              style={{ backgroundImage: `url('/login-bg.png')` }}
            />
            <div className="tech-scanner-line" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%] pointer-events-none" />
          </div>
          <span className="text-[10px] text-zinc-600 tracking-wider mt-4 animate-pulse uppercase">
            ANALYZING_NEURAL_PATTERNS...
          </span>
        </div>

        {/* Right: Login Form */}
        <div className="flex flex-col items-center lg:items-end w-full lg:w-auto">
          <div className="flex justify-between w-full max-w-md text-[9px] text-zinc-700 tracking-widest uppercase mb-1.5 px-1">
            <span>AUTH_SEQUENCE_INIT</span>
            <span>SEC_CONN_PENDING</span>
          </div>

          <div className="border border-zinc-800 bg-[#0c0c0c] rounded-sm p-8 w-full max-w-md relative flex flex-col">
            {/* Corner crosshairs */}
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />

            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 border border-zinc-800 rounded-sm flex items-center justify-center bg-black/40 text-zinc-300">
                <Fingerprint size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-sm font-black text-white tracking-widest uppercase">Neural Gateway</h1>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">BIOMETRIC IDENTITY VERIFICATION</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Error Message */}
              {errorMsg && (
                <div className="fade-in flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-sm p-3">
                  <XCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-red-300 leading-relaxed">{errorMsg}</span>
                </div>
              )}

              {/* Status Message */}
              {statusMsg && !errorMsg && (
                <div className="fade-in flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/60 rounded-sm p-3">
                  <CheckCircle size={14} className="text-emerald-400 flex-shrink-0" />
                  <span className="text-[10px] text-emerald-300">{statusMsg}</span>
                </div>
              )}

              {/* Email or Username */}
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  <span>User Identifier</span>
                  <span className="text-zinc-700">EMAIL / USERNAME</span>
                </div>
                <input
                  id="login-identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 px-4 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs tracking-wider"
                  placeholder="email@domain.com or username"
                  autoComplete="username"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  <span>Encrypted Key</span>
                  <span className="text-zinc-700">INPUT_B</span>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 px-4 pr-10 focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-700 text-xs tracking-widest"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="text-right mt-1.5">
                  <Link
                    to="/forgot-password"
                    className="text-[9px] text-zinc-500 hover:text-zinc-300 uppercase font-black tracking-widest transition-colors"
                  >
                    RECOVER_ACCESS
                  </Link>
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 bg-[#050505] border border-zinc-800 rounded-none focus:ring-0 cursor-pointer accent-zinc-500"
                />
                <label htmlFor="remember" className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider cursor-pointer">
                  Maintain authentication (30D)
                </label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="login-submit-btn"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-4 rounded-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[11px] tracking-widest shadow-md shadow-[#e3e3cb]/10"
              >
                {isLoading
                  ? <><Loader2 className="animate-spin text-zinc-950" size={16} /><span>Authenticating...</span></>
                  : <><Fingerprint size={16} strokeWidth={2} /><span>Initialize Login</span></>
                }
              </button>
            </form>

            {/* Create Account */}
            <div className="mt-6 pt-6 border-t border-zinc-800/60">
              <div className="flex items-center justify-center gap-2">
                <span className="text-[9px] text-zinc-600 uppercase tracking-wider">No account?</span>
                <Link
                  to="/register"
                  className="flex items-center gap-1 text-[9px] text-zinc-400 hover:text-[#e3e3cb] uppercase font-black tracking-widest transition-colors"
                >
                  <UserPlus size={11} />
                  CREATE_ACCOUNT
                </Link>
              </div>
            </div>

            {/* Footer indicator */}
            <span className="text-center text-[9px] text-zinc-700 tracking-widest uppercase mt-4 block font-bold">
              {isLoading ? 'VERIFYING_CREDENTIALS...' : 'Scanning Biometrics...'}
            </span>
          </div>

          {/* Secure Session Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/80 border border-zinc-900 text-[9px] text-zinc-500 font-black tracking-widest uppercase mt-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Encrypted Session: AES-256-GCM</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <KeyRound size={10} className="text-zinc-700" />
            <span className="text-[9px] text-zinc-700 tracking-widest uppercase">
              Default admin: <span className="text-zinc-600">admin@visionvault.local</span> / <span className="text-zinc-600">admin123</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="flex flex-col md:flex-row justify-between items-center text-[9px] text-zinc-700 tracking-widest uppercase gap-4 mt-4 border-t border-zinc-900 pt-6">
        <div className="flex flex-col text-center md:text-left gap-1">
          <span>VISIONVAULT SHIELD V2.0.0</span>
          <span className="text-zinc-800">© 2026 VISIONVAULT ENTERPRISE CORE.</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-zinc-500 transition-colors">SYSTEM_TERMS</a>
          <a href="#" className="hover:text-zinc-500 transition-colors">PRIVACY_DATA</a>
          <a href="/api/auth/health" target="_blank" rel="noreferrer" className="hover:text-zinc-500 transition-colors">NODE_STATUS</a>
        </div>
      </div>
    </div>
  );
}
