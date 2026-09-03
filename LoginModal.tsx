import React, { useState, useEffect } from 'react';
import { AuthAccount, AuthSession, UserRole, CompanySettings } from '../types/pos';
import { uid, getNowParts, formatMoney } from '../services/storage';
import {
  Lock,
  UserCheck,
  Shield,
  ArrowLeft,
  DollarSign,
  Store,
  Eye,
  EyeOff,
  Sparkles,
  PlusCircle,
  CheckCircle2,
  KeyRound,
  LogIn,
  UserPlus,
  Radio,
  Building2
} from 'lucide-react';

interface LoginModalProps {
  accounts: AuthAccount[];
  activeSession?: AuthSession | null;
  settings?: CompanySettings;
  currency?: string;
  onRegisterAccount?: (account: AuthAccount) => void;
  onSaveAccount?: (account: AuthAccount) => void;
  onDeleteAccount?: (id: string) => void;
  onLoginSuccess: (session: AuthSession, openingFloat?: number) => void;
}

const FLOAT_DENOMS = [10, 20, 50, 100, 500, 1000, 2000, 5000];

export const LoginModal: React.FC<LoginModalProps> = ({
  accounts,
  activeSession,
  settings,
  currency = 'Rs.',
  onRegisterAccount,
  onSaveAccount,
  onDeleteAccount,
  onLoginSuccess
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [cashierMode, setCashierMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Cashier Login State (Selected Account + Password)
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('');
  const [enteredPassword, setEnteredPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Register New Counter State
  const [regUnitCode, setRegUnitCode] = useState('');
  const [regUnitName, setRegUnitName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);

  // Supervisor & Admin Password State
  const [adminSupervisorPw, setAdminSupervisorPw] = useState('');
  const [showAdminPw, setShowAdminPw] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Opening Float Modal State (triggered after cashier password verification)
  const [pendingCashierSession, setPendingCashierSession] = useState<AuthSession | null>(null);
  const [openingFloatAmount, setOpeningFloatAmount] = useState<number>(0);

  // Set default selected unit code from accounts if available
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const exists = accounts.some((a) => a.unitCode.toUpperCase() === selectedUnitCode.toUpperCase());
      if (!exists || !selectedUnitCode) {
        try {
          const lastId = localStorage.getItem('POS_LAST_ACCOUNT_ID');
          const found = accounts.find((a) => a.id === lastId);
          if (found) {
            setSelectedUnitCode(found.unitCode);
          } else {
            setSelectedUnitCode(accounts[0].unitCode);
          }
        } catch (err) {
          setSelectedUnitCode(accounts[0].unitCode);
        }
      }
    }
  }, [accounts, selectedUnitCode]);

  // If already logged in, do not show login gate
  if (activeSession && !pendingCashierSession) {
    return null;
  }

  // Active selected account object
  const activeAccount = accounts.find(
    (a) => a.unitCode.toUpperCase() === selectedUnitCode.trim().toUpperCase()
  );

  // Quick Keypad press handler for password input
  const handleKeypadPress = (val: string) => {
    if (val === 'CLEAR') {
      setEnteredPassword('');
    } else if (val === 'BACK') {
      setEnteredPassword((prev) => prev.slice(0, -1));
    } else {
      setEnteredPassword((prev) => prev + val);
    }
  };

  // Opening Float Screen (Step 3: After password verification)
  if (pendingCashierSession) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
        <div className="bg-white rounded-3xl shadow-2xl border-2 border-amber-500 w-full max-w-md p-6 space-y-4 text-black">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-amber-500 text-amber-600 flex items-center justify-center mx-auto mb-2 font-bold shadow-2xs">
              <DollarSign className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-black">OPEN CASH REGISTER</h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Enter opening float cash to begin your POS shift.
            </p>
            <div className="inline-block mt-2 px-3 py-1 bg-white text-amber-950 text-xs font-black rounded-full border-2 border-amber-500 shadow-2xs">
              {pendingCashierSession.unitName || pendingCashierSession.unitCode || 'Counter'} ({pendingCashierSession.unitCode || 'UNIT01'})
            </div>
          </div>

          <div className="bg-white border-2 border-amber-500 rounded-2xl p-4 text-center shadow-2xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Opening Float Amount
            </span>
            <div className="text-3xl font-black text-amber-950">
              {formatMoney(openingFloatAmount, currency)}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Quick Add Float Cash (10, 20, 50, 100, 500, 1000, 2000, 5000)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {FLOAT_DENOMS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOpeningFloatAmount((prev) => prev + val)}
                  className="py-2.5 rounded-xl bg-white hover:bg-amber-50 hover:border-amber-500 text-black hover:text-amber-950 border border-slate-300 text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs"
                >
                  +{val.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOpeningFloatAmount(0)}
                className="col-span-4 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs cursor-pointer shadow-2xs"
              >
                Clear Float
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Or Type Exact Float ({currency})
            </label>
            <input
              type="number"
              min="0"
              placeholder="0.00"
              value={openingFloatAmount || ''}
              onChange={(e) => setOpeningFloatAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-black text-black focus:outline-amber-500"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {openingFloatAmount <= 0 && (
              <p className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-xl p-2 text-center">
                ⚠️ කරුණාකර ආරම්භක මුදල (Opening Float) තෝරන්න (Select float amount to activate Start POS Billing).
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingCashierSession(null)}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-300 text-black font-bold text-xs hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={openingFloatAmount <= 0}
                onClick={() => {
                  if (openingFloatAmount <= 0) return;
                  onLoginSuccess(pendingCashierSession, openingFloatAmount);
                  setPendingCashierSession(null);
                }}
                className={`flex-2 py-3 rounded-xl font-black text-xs shadow-xs transition-all active:scale-98 ${
                  openingFloatAmount > 0
                    ? 'bg-amber-500 hover:bg-amber-600 text-black border-2 border-amber-600 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-60'
                }`}
              >
                START POS BILLING →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle Cashier Login with Password Verification (Requirement: Password MUST be typed & verified)
  const handleCashierLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const targetCode = selectedUnitCode.trim().toUpperCase();
    if (!targetCode) {
      setErrorMsg('Please select an account from the registered accounts list.');
      return;
    }

    if (!enteredPassword) {
      setErrorMsg('Please enter your account password to log in.');
      return;
    }

    // Find account in registered accounts
    const foundAcc = accounts.find((a) => a.unitCode.toUpperCase() === targetCode);
    if (!foundAcc) {
      setErrorMsg(`No account found with Unit Code "${targetCode}". Please create an account first.`);
      return;
    }

    // Strictly verify Password
    if (foundAcc.password && foundAcc.password !== enteredPassword) {
      setErrorMsg(`❌ Incorrect password for "${foundAcc.unitName}". Please check and re-enter.`);
      return;
    }

    try {
      localStorage.setItem('POS_LAST_ACCOUNT_ID', foundAcc.id);
    } catch (err) {}

    // Open opening float screen
    setPendingCashierSession({
      role: 'CASHIER',
      user: foundAcc.unitCode,
      unitCode: foundAcc.unitCode,
      unitName: foundAcc.unitName || foundAcc.unitCode || 'Counter'
    });
    setEnteredPassword('');
  };

  // Handle New Counter Registration
  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const code = regUnitCode.trim().toUpperCase();
    const name = regUnitName.trim();
    const pw = regPassword.trim();

    if (!code || !name) {
      setErrorMsg('Please enter both Unit Code and Counter Name.');
      return;
    }

    if (!pw) {
      setErrorMsg('Please set a password for the account.');
      return;
    }

    if (accounts.some((a) => a.unitCode.toUpperCase() === code)) {
      setErrorMsg(`Unit Code "${code}" is already registered. Please choose another code.`);
      return;
    }

    const newAccount: AuthAccount = {
      id: uid('unit'),
      unitCode: code,
      unitName: name,
      password: pw,
      createdAt: getNowParts().iso
    };

    if (onSaveAccount) {
      onSaveAccount(newAccount);
    } else if (onRegisterAccount) {
      onRegisterAccount(newAccount);
    }

    try {
      localStorage.setItem('POS_LAST_ACCOUNT_ID', newAccount.id);
    } catch (err) {}

    // Clear registration fields
    setRegUnitCode('');
    setRegUnitName('');
    setRegPassword('');

    // Switch to POS Login and preselect the new account
    setSelectedUnitCode(newAccount.unitCode);
    setEnteredPassword('');
    setCashierMode('LOGIN');
    setSuccessMsg(`✓ Account "${newAccount.unitName} (${newAccount.unitCode})" registered successfully! Enter password to log in.`);
  };

  // Handle Supervisor / Admin login
  const handleAdminSupervisorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (selectedRole === 'SUPERVISOR') {
      if (adminSupervisorPw === '123' || adminSupervisorPw === '1234') {
        onLoginSuccess({
          role: 'SUPERVISOR',
          user: 'Supervisor'
        });
      } else {
        setErrorMsg('Invalid Supervisor Password.');
      }
    } else if (selectedRole === 'ADMIN') {
      if (adminSupervisorPw === '1234') {
        onLoginSuccess({
          role: 'ADMIN',
          user: 'Admin'
        });
      } else {
        setErrorMsg('Invalid Admin Password.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col md:flex-row min-h-[520px] text-black">
        {/* Left Brand Panel */}
        <div className="w-full md:w-5/12 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white border-2 border-amber-500 text-amber-600 flex items-center justify-center mb-5 font-bold text-2xl shadow-2xs">
              <Store className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black tracking-wide text-black">
              {settings?.name || 'POS TERMINAL'}
            </h1>
            <p className="text-slate-600 text-xs mt-2 leading-relaxed font-medium">
              Multi-counter POS terminal with password-protected cashier shifts, stock billing, and real-time synchronization.
            </p>
          </div>

          <div className="relative z-10 pt-6 border-t border-slate-200 text-[11px] text-slate-700 space-y-2.5 font-medium">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-600" /> Password-Protected Cashier Login
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" /> Multi-Account Counter Registration
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" /> Direct Thermal Receipt Printing
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" /> Shift Float Cash Denomination
            </div>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="w-full md:w-7/12 p-6 md:p-8 flex flex-col justify-center bg-white text-black overflow-y-auto max-h-[90vh]">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-800 text-xs font-bold animate-in fade-in flex items-center justify-between">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                className="text-rose-500 hover:text-rose-800 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-xs font-bold flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg('')}
                className="text-amber-800 hover:text-black font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 1: SELECT ACCESS PORTAL (CASHIER / SUPERVISOR / ADMIN) */}
          {/* ============================================================ */}
          {!selectedRole && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-black text-black">Welcome</h2>
                <p className="text-xs text-slate-500 mt-1 font-medium">Select your portal to continue.</p>
              </div>

              <div className="space-y-3">
                {/* CASHIER PORTAL BUTTON */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('CASHIER');
                    setCashierMode('LOGIN');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="w-full p-4 rounded-2xl bg-white border-2 border-amber-500 hover:bg-amber-50/50 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-amber-400 text-amber-700 flex items-center justify-center font-bold">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <div className="font-extrabold text-sm text-black group-hover:text-amber-800">
                        CASHIER
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        POS Login & Account Registration
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-700 group-hover:translate-x-1 transition-transform">→</span>
                </button>

                {/* SUPERVISOR PORTAL */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('SUPERVISOR');
                    setAdminSupervisorPw('');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="w-full p-3.5 rounded-2xl bg-white border border-slate-300 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-300 text-amber-700 flex items-center justify-center font-bold">
                      <Shield className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-extrabold text-sm text-black group-hover:text-amber-800">
                        SUPERVISOR
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">Dashboard, Register Audits & Reports</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-amber-700">→</span>
                </button>

                {/* ADMIN PORTAL */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('ADMIN');
                    setAdminSupervisorPw('');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="w-full p-3.5 rounded-2xl bg-white border border-slate-300 hover:border-amber-500 hover:bg-amber-50/30 transition-all flex items-center justify-between group cursor-pointer shadow-2xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-300 text-amber-700 flex items-center justify-center font-bold">
                      <Lock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-left">
                      <div className="font-extrabold text-sm text-black group-hover:text-amber-800">
                        ADMIN
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">Products, Pricing, Settings & Controls</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-amber-700">→</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 2: CASHIER SECTION (WITH 2 DISTINCT BUTTONS: LOGIN & REGISTER) */}
          {/* ============================================================ */}
          {selectedRole === 'CASHIER' && (
            <div className="space-y-4">
              {/* Back Button */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole(null);
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Portals
                </button>
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  Cashier Portal
                </span>
              </div>

              {/* 2 DISTINCT SEPARATE BUTTONS: REGISTER ACCOUNT & POS LOGIN */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100/80 border border-slate-300 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setCashierMode('LOGIN');
                    setErrorMsg('');
                  }}
                  className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    cashierMode === 'LOGIN'
                      ? 'bg-white text-amber-950 border-2 border-amber-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:text-black hover:bg-white/60'
                  }`}
                >
                  <LogIn className="w-4 h-4 text-amber-600" />
                  <span>POS LOGIN</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCashierMode('REGISTER');
                    setErrorMsg('');
                  }}
                  className={`py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    cashierMode === 'REGISTER'
                      ? 'bg-white text-amber-950 border-2 border-amber-500 shadow-xs'
                      : 'bg-transparent text-slate-600 hover:text-black hover:bg-white/60'
                  }`}
                >
                  <UserPlus className="w-4 h-4 text-amber-600" />
                  <span>REGISTER ACCOUNT</span>
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SUB-VIEW 1: POS LOGIN (DISPLAY ACCOUNTS + PASSWORD REQUIRED)  */}
              {/* ------------------------------------------------------------- */}
              {cashierMode === 'LOGIN' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-base font-black text-black">SELECT ACCOUNT & ENTER PASSWORD</h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Click your counter account card, then enter its password to log in.
                    </p>
                  </div>

                    {/* DISPLAY ALL REGISTERED ACCOUNTS */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                        Registered Accounts ({accounts.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCashierMode('REGISTER');
                          setErrorMsg('');
                        }}
                        className="text-[11px] font-bold text-amber-700 hover:text-amber-950 underline cursor-pointer"
                      >
                        + Add New
                      </button>
                    </div>

                    {accounts.length === 0 ? (
                      <div className="p-3 rounded-xl bg-amber-50/60 border border-dashed border-amber-300 text-center space-y-1.5">
                        <p className="text-xs font-bold text-slate-600">
                          No cashier accounts registered yet.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCashierMode('REGISTER')}
                          className="px-3 py-1.5 bg-white text-amber-950 border-2 border-amber-500 rounded-lg text-xs font-black hover:bg-amber-50 shadow-2xs cursor-pointer"
                        >
                          ➕ Register First Account
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-xl">
                        {Array.from(new Map<string, AuthAccount>(accounts.map((a) => [a.id || a.unitCode, a])).values()).map((acc, index) => {
                          const isSelected =
                            selectedUnitCode.trim().toUpperCase() === acc.unitCode.trim().toUpperCase();
                          return (
                            <div
                              key={`${acc.id || acc.unitCode}_${index}`}
                              onClick={() => {
                                setSelectedUnitCode(acc.unitCode);
                                setErrorMsg('');
                              }}
                              className={`p-1.5 px-2 rounded-lg text-left border transition-all cursor-pointer relative group flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-50 border-2 border-amber-500 shadow-2xs font-bold'
                                  : 'bg-white border-slate-200 hover:border-amber-400 hover:bg-amber-50/20'
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-1">
                                <div className="font-extrabold text-[11px] text-black truncate leading-tight">
                                  {acc.unitName}
                                </div>
                                <div className="text-[9.5px] font-mono font-bold text-amber-800 leading-tight">
                                  {acc.unitCode}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {isSelected ? (
                                  <span className="w-3.5 h-3.5 rounded-full bg-amber-500 text-black flex items-center justify-center text-[9px] font-black">
                                    ✓
                                  </span>
                                ) : (
                                  <span className="w-2.5 h-2.5 rounded-full border border-slate-300" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* PASSWORD ENTRY FORM - ONLY LOGS IN WITH VALID PASSWORD */}
                  {accounts.length > 0 && (
                    <form onSubmit={handleCashierLoginSubmit} className="space-y-3 pt-1">
                      {activeAccount && (
                        <div className="px-3 py-1.5 bg-amber-50/60 border border-amber-300 rounded-xl flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-600">Selected Counter:</span>
                          <span className="font-black text-amber-950">
                            {activeAccount.unitName} ({activeAccount.unitCode})
                          </span>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-600 uppercase">
                            Account Password *
                          </label>
                          <span className="text-[10px] font-bold text-slate-400">
                            Required to login
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder={`Enter password for ${activeAccount ? activeAccount.unitName : 'selected account'}...`}
                            value={enteredPassword}
                            onChange={(e) => setEnteredPassword(e.target.value)}
                            className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
                            autoFocus
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Quick Numeric Keypad for fast Touch POS operation */}
                      <div className="pt-1">
                        <div className="grid grid-cols-6 gap-1">
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
                            <button
                              key={digit}
                              type="button"
                              onClick={() => handleKeypadPress(digit)}
                              className="py-1.5 rounded-lg bg-white hover:bg-amber-50 border border-slate-200 text-xs font-black text-black active:scale-95 cursor-pointer shadow-2xs"
                            >
                              {digit}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleKeypadPress('BACK')}
                            className="py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-black text-slate-700 active:scale-95 cursor-pointer shadow-2xs"
                          >
                            ⌫ Del
                          </button>
                          <button
                            type="button"
                            onClick={() => handleKeypadPress('CLEAR')}
                            className="py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-[11px] font-black text-rose-700 active:scale-95 cursor-pointer shadow-2xs"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-black text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer mt-2"
                      >
                        <Lock className="w-4 h-4 text-amber-600" />
                        VERIFY PASSWORD & OPEN REGISTER →
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SUB-VIEW 2: REGISTER ACCOUNT                                  */}
              {/* ------------------------------------------------------------- */}
              {cashierMode === 'REGISTER' && (
                <div className="space-y-3.5 animate-in fade-in duration-150">
                  <div>
                    <h3 className="text-base font-black text-black">REGISTER NEW COUNTER ACCOUNT</h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Create a new terminal account with unit code, name, and login password.
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-3 pt-1">
                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase block mb-1">
                        Unit Code (e.g. UNIT01, TAKEAWAY, BAR01, COUNTER2) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. UNIT02"
                        value={regUnitCode}
                        onChange={(e) => setRegUnitCode(e.target.value.toUpperCase())}
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm font-black text-black uppercase focus:outline-amber-500 shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase block mb-1">
                        Unit / Counter Name *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Counter 2 / Lobby Bar / Takeaway"
                        value={regUnitName}
                        onChange={(e) => setRegUnitName(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-600 uppercase block mb-1">
                        Account Password *
                      </label>
                      <div className="relative">
                        <input
                          type={showRegPw ? 'text' : 'password'}
                          placeholder="Set account password..."
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          className="w-full px-3.5 py-2 pr-10 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPw(!showRegPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black cursor-pointer"
                        >
                          {showRegPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setCashierMode('LOGIN')}
                        className="flex-1 py-3 rounded-xl bg-white border border-slate-300 text-black font-bold text-xs hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-2 py-3 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs shadow-xs transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-4 h-4 text-amber-600" />
                        CREATE ACCOUNT →
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* STEP 3: SUPERVISOR & ADMIN PASSWORD PROMPT                    */}
          {/* ============================================================ */}
          {(selectedRole === 'SUPERVISOR' || selectedRole === 'ADMIN') && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(null);
                  setErrorMsg('');
                  setSuccessMsg('');
                }}
                className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 mb-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Role Selection
              </button>

              <div>
                <h2 className="text-xl font-black text-black">
                  {selectedRole} AUTHENTICATION
                </h2>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Enter master PIN to unlock {selectedRole.toLowerCase()} control dashboard.
                </p>
              </div>

              <form onSubmit={handleAdminSupervisorLogin} className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase block mb-1">
                    Master Password / PIN
                  </label>
                  <div className="relative">
                    <input
                      type={showAdminPw ? 'text' : 'password'}
                      placeholder="••••"
                      value={adminSupervisorPw}
                      onChange={(e) => setAdminSupervisorPw(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white border border-slate-300 text-base font-bold text-black focus:outline-amber-500"
                      autoFocus
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPw(!showAdminPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black cursor-pointer"
                    >
                      {showAdminPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer mt-4"
                >
                  <Lock className="w-4 h-4 text-amber-600" /> UNLOCK {selectedRole} →
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
