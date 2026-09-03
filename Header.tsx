import React, { useState, useEffect } from 'react';
import { AuthSession, CompanySettings, Register } from '../types/pos';
import {
  Menu,
  Keyboard,
  LogOut,
  Clock,
  Store,
  Wifi,
  WifiOff,
  RefreshCw
} from 'lucide-react';

interface HeaderProps {
  session: AuthSession | null;
  settings: CompanySettings;
  activeRegister?: Register | null;
  sidebarCollapsed?: boolean;
  keyboardEnabled: boolean;
  isOnline: boolean;
  pendingSyncCount?: number;
  onToggleSidebar: () => void;
  onToggleKeyboard: () => void;
  onLogout: () => void;
  onTriggerSync?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  settings,
  activeRegister,
  keyboardEnabled,
  isOnline,
  pendingSyncCount = 0,
  onToggleSidebar,
  onToggleKeyboard,
  onLogout,
  onTriggerSync
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      };
      setTimeStr(d.toLocaleDateString('en-US', options));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const displayUnitName =
    session?.role === 'CASHIER'
      ? session.unitName || session.unitCode || settings.name
      : session?.role === 'SUPERVISOR'
      ? 'Supervisor Portal'
      : 'Admin Management';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-30 shadow-2xs text-black">
      {/* Left items: Menu collapse toggle & Brand title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-xl bg-white border border-slate-300 hover:border-amber-500 hover:bg-amber-50 text-black hover:text-amber-950 transition-all cursor-pointer shadow-2xs"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white border-2 border-amber-500 text-amber-950 flex items-center justify-center font-bold text-base shadow-2xs">
            <Store className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="font-extrabold text-sm text-black leading-tight">
              {displayUnitName}
            </div>
            {session?.unitCode && (
              <div className="text-[11px] font-mono font-bold text-amber-950">
                {session.unitCode}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right controls: Live Clock, Cloud sync indicator, Keyboard Toggle, Role Badge & Logout */}
      <div className="flex items-center gap-2.5">
        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-black font-semibold px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>{timeStr}</span>
        </div>

        {/* Cloud Sync status */}
        <button
          type="button"
          onClick={() => {
            if (isOnline && onTriggerSync) {
              onTriggerSync();
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-2xs transition-all cursor-pointer ${
            isOnline
              ? pendingSyncCount > 0
                ? 'bg-amber-100 border-amber-500 text-amber-950 animate-pulse'
                : 'bg-emerald-50 border-emerald-400 text-emerald-950 hover:bg-emerald-100'
              : 'bg-rose-50 border-rose-300 text-rose-700'
          }`}
          title={
            isOnline
              ? pendingSyncCount > 0
                ? `${pendingSyncCount} items pending sync. Click to sync now.`
                : 'Connected to Cloud Firestore (Auto-Sync Active). Click to re-sync.'
              : 'Offline Mode: All sales & tokens are stored locally on this device. When internet reconnects, all offline data will auto-sync to Firestore.'
          }
        >
          {isOnline ? (
            <>
              {pendingSyncCount > 0 ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-700 animate-spin" />
                  <span className="hidden sm:inline">Syncing ({pendingSyncCount})</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Cloud Synced</span>
                </>
              )}
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              <span className="hidden sm:inline">
                Offline {pendingSyncCount > 0 ? `(${pendingSyncCount} queued)` : '(Data Safe)'}
              </span>
            </>
          )}
        </button>

        {/* Virtual Keyboard Toggle button */}
        <button
          onClick={onToggleKeyboard}
          className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
            keyboardEnabled
              ? 'bg-white text-amber-950 border-2 border-amber-500 shadow-xs'
              : 'bg-white text-black hover:bg-slate-100 border-slate-300'
          }`}
          title="Toggle On-Screen Virtual Keyboard"
        >
          <Keyboard className="w-4 h-4 text-amber-600" />
          <span className="hidden sm:inline">Keyboard</span>
        </button>

        {/* User Badge */}
        <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 shadow-2xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span className="text-xs font-extrabold text-black">{session?.user}</span>
          <span className="text-[10px] font-black uppercase text-amber-950 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300">
            {session?.role}
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="p-2 rounded-xl bg-white border border-slate-300 hover:border-rose-400 hover:bg-rose-50 text-slate-700 hover:text-rose-600 transition-all cursor-pointer shadow-2xs"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
