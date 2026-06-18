import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Loader2, Fingerprint } from 'lucide-react';
import axios from 'axios';

const GoogleIcon = () => (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="currentColor" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="currentColor" />
  </svg>
);

const GithubIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const res = await axios.post('/api/auth/login', { email, password });
      if (res.data.success) {
        localStorage.setItem('vv_token', res.data.token);
        localStorage.setItem('vv_user', JSON.stringify(res.data.user));
        window.dispatchEvent(new CustomEvent('toast', { detail: { type: 'success', message: 'Welcome back!' } }));
        window.location.href = '/'; // force reload to initialize auth state globally
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('toast', { 
        detail: { type: 'error', message: err.response?.data?.error || 'Login failed' } 
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen font-mono flex flex-col justify-between p-6 text-zinc-500 relative overflow-hidden select-none" style={{ background: 'radial-gradient(circle at center, #0c101b 0%, #030407 100%)' }}>
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
      `}</style>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 max-w-7xl w-full mx-auto my-8 relative z-10">
        
        {/* Left Side: Biometric Face Scan Viewport */}
        <div className="flex flex-col items-start w-full lg:w-1/2 max-w-xl">
          {/* Framed Monitor */}
          <div className="relative border border-zinc-800/80 bg-black/40 rounded-sm p-4 w-full aspect-[1.66] overflow-hidden flex items-center justify-center">
            {/* Corner Crosshairs */}
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />
            {/* Image Asset */}
            <div 
              className="w-full h-full bg-cover bg-center bg-no-repeat opacity-80 rounded-sm border border-zinc-900"
              style={{ backgroundImage: `url('/login-bg.png')` }}
            />
            {/* Cybernetic Scan Line */}
            <div className="tech-scanner-line" />
            {/* Monitor Grid Pattern Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%] pointer-events-none" />
          </div>
          {/* Status logs */}
          <span className="text-[10px] text-zinc-600 tracking-wider mt-4 animate-pulse uppercase">
            ANALYZING_NEURAL_PATTERNS...
          </span>
        </div>

        {/* Right Side: Biometric Neural Gateway Form */}
        <div className="flex flex-col items-center lg:items-end w-full lg:w-auto">
          {/* Card Metadata Header */}
          <div className="flex justify-between w-full max-w-md text-[9px] text-zinc-700 tracking-widest uppercase mb-1.5 px-1">
            <span>AUTH_SEQUENCE_INIT</span>
            <span>SEC_CONN_PENDING</span>
          </div>
          {/* Login Card */}
          <div className="border border-zinc-800 bg-[#0c0c0c] rounded-sm p-8 w-full max-w-md relative flex flex-col">
            {/* Corner Crosshairs */}
            <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-zinc-700" />
            <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-zinc-700" />
            <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-zinc-700" />
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-zinc-700" />

            {/* Card Header */}
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 border border-zinc-800 rounded-sm flex items-center justify-center bg-black/40 text-zinc-300">
                <Fingerprint size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-sm font-black text-white tracking-widest uppercase">Neural Gateway</h1>
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">BIOMETRIC IDENTITY VERIFICATION</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              {/* Field 1: User Identifier */}
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  <span>User Identifier</span>
                  <span className="text-zinc-700">INPUT_A</span>
                </div>
                <div className="flex flex-col items-start mb-2">
                  <Fingerprint size={16} strokeWidth={1.5} className="text-zinc-500" />
                </div>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 text-center focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-800 text-xs tracking-wider"
                  placeholder="ENT_ID@AETHERIS.SEC"
                  required
                />
              </div>

              {/* Field 2: Encrypted Key */}
              <div>
                <div className="flex justify-between text-[9px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">
                  <span>Encrypted Key</span>
                  <span className="text-zinc-700">INPUT_B</span>
                </div>
                <div className="flex flex-col items-start mb-2">
                  <Fingerprint size={16} strokeWidth={1.5} className="text-zinc-500" />
                </div>
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-black border border-zinc-800 text-zinc-200 rounded-sm py-3.5 text-center focus:outline-none focus:border-zinc-500 transition-all font-mono placeholder:text-zinc-800 text-xs tracking-widest"
                  placeholder="••••••••"
                  required
                />
                <div className="text-right mt-1.5">
                  <a href="#" className="text-[9px] text-zinc-500 hover:text-zinc-300 uppercase font-black tracking-widest transition-colors">RECOVER_ACCESS</a>
                </div>
              </div>

              {/* Remember checkbox */}
              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="remember"
                  className="w-3.5 h-3.5 bg-[#050505] border border-zinc-800 rounded-none text-zinc-800 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-zinc-500" 
                />
                <label htmlFor="remember" className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider cursor-pointer">
                  Maintain authentication (30D)
                </label>
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-[#e3e3cb] hover:bg-[#d5d5b9] text-zinc-950 font-black py-4 rounded-sm transition-all active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed uppercase text-[11px] tracking-widest shadow-md shadow-[#e3e3cb]/10"
              >
                {isLoading ? <Loader2 className="animate-spin text-zinc-950" size={16} /> : (
                  <>
                    <Fingerprint size={16} strokeWidth={2} />
                    <span>Initialize Login</span>
                  </>
                )}
              </button>
            </form>

            {/* Federated Auth */}
            <div className="mt-8">
              <div className="flex items-center gap-3 text-[9px] text-zinc-700 font-bold uppercase tracking-wider mb-4">
                <div className="flex-1 h-[1px] bg-zinc-800/80" />
                <span>Federated Auth</span>
                <div className="flex-1 h-[1px] bg-zinc-800/80" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button className="bg-transparent border border-zinc-800 text-zinc-300 py-3 rounded-sm text-[10px] font-black tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-zinc-900/50 transition-colors">
                  <GoogleIcon />
                  <span>Google</span>
                </button>
                <button className="bg-transparent border border-zinc-800 text-zinc-300 py-3 rounded-sm text-[10px] font-black tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-zinc-900/50 transition-colors">
                  <GithubIcon className="w-3.5 h-3.5 text-zinc-300" />
                  <span>Github</span>
                </button>
              </div>
            </div>

            {/* Footer indicator */}
            <span className="text-center text-[9px] text-zinc-700 tracking-widest uppercase mt-6 block font-bold">
              Scanning Biometrics...
            </span>
          </div>

          {/* Secure Session Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm bg-zinc-950/80 border border-zinc-900 text-[9px] text-zinc-500 font-black tracking-widest uppercase mt-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Encrypted Session: AES-256-GCM</span>
          </div>

        </div>
      </div>

      {/* Bottom Footer Section */}
      <div className="flex flex-col md:flex-row justify-between items-center text-[9px] text-zinc-700 tracking-widest uppercase gap-4 mt-4 border-t border-zinc-900 pt-6">
        <div className="flex flex-col text-center md:text-left gap-1">
          <span>VISIONVAULT SHIELD V2.0.0</span>
          <span className="text-zinc-800">© 2026 VISIONVAULT ENTERPRISE CORE.</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-zinc-500 transition-colors">SYSTEM_TERMS</a>
          <a href="#" className="hover:text-zinc-500 transition-colors">PRIVACY_DATA</a>
          <a href="#" className="hover:text-zinc-500 transition-colors">NODE_STATUS</a>
        </div>
      </div>
    </div>
  );
}
