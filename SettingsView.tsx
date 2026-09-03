import React, { useState } from 'react';
import { CompanySettings, CustomFirebaseConfig, DirectPrinterConfig, DirectPrintDriver, AuthAccount } from '../types/pos';
import {
  Settings,
  Plus,
  Edit2,
  Trash2,
  Check,
  Save,
  Palette,
  Sun,
  Moon,
  Sparkles,
  Database,
  Cloud,
  AlertCircle,
  RefreshCw,
  Key,
  ShieldCheck,
  Printer,
  Usb,
  Zap,
  CheckCircle,
  Sliders,
  Users,
  UserCheck,
  Lock,
  Store,
  ShieldAlert,
  Type,
  AlignLeft,
  AlignCenter,
  FileText
} from 'lucide-react';
import defaultConfig from '../../firebase-applet-config.json';
import { CUSTOM_FIREBASE_KEY, getActiveFirebaseConfig } from '../services/firebase';
import { loadData, saveData, uid } from '../services/storage';
import { directPrintService } from '../services/directPrintService';

interface SettingsViewProps {
  settings: CompanySettings;
  departments: string[];
  reportEmailRecipient?: string;
  closingTime?: string;
  accounts?: AuthAccount[];
  onSaveSettings: (settings: CompanySettings) => void;
  onSaveDepartments: (depts: string[]) => void;
  onSaveEmailRecipient: (email: string) => void;
  onSaveClosingTime: (time: string) => void;
  onDeleteAccount?: (id: string) => void;
  onSaveAccount?: (account: AuthAccount) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  departments,
  reportEmailRecipient = '',
  closingTime = '23:59',
  accounts = [],
  onSaveSettings,
  onSaveDepartments,
  onSaveEmailRecipient,
  onSaveClosingTime,
  onDeleteAccount,
  onSaveAccount
}) => {
  const [name, setName] = useState(settings.name || 'HOTEL & RESTAURANT');
  const [address, setAddress] = useState(settings.address || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [currency, setCurrency] = useState(settings.currency || 'Rs.');
  const [footer, setFooter] = useState(settings.footer || '');
  const [receiptSize, setReceiptSize] = useState<'80' | '58' | 'a4'>(settings.receiptSize || '80');
  const [emailRecipient, setEmailRecipient] = useState(reportEmailRecipient);
  const [businessClosingTime, setBusinessClosingTime] = useState(closingTime);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(settings.themeMode || 'light');
  const [themeColor, setThemeColor] = useState<string>(settings.themeColor || 'amber');

  // Receipt Customization States
  const [receiptFontFamily, setReceiptFontFamily] = useState<'modern' | 'mono' | 'compact'>(
    settings.receiptFontFamily || 'modern'
  );
  const [receiptFontSize, setReceiptFontSize] = useState<'compact' | 'normal' | 'large'>(
    settings.receiptFontSize || 'normal'
  );
  const [receiptHeaderAlign, setReceiptHeaderAlign] = useState<'center' | 'left'>(
    settings.receiptHeaderAlign || 'center'
  );
  const [receiptLineStyle, setReceiptLineStyle] = useState<'dashed' | 'dotted' | 'solid' | 'double'>(
    settings.receiptLineStyle || 'dashed'
  );

  // Accounts Management State
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'CASHIER' | 'ADMIN'>('CASHIER');
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Firebase Config State
  const initialCustomFb = loadData<CustomFirebaseConfig | null>(CUSTOM_FIREBASE_KEY, null);
  const [fbApiKey, setFbApiKey] = useState(initialCustomFb?.apiKey || '');
  const [fbProjectId, setFbProjectId] = useState(initialCustomFb?.projectId || '');
  const [fbAuthDomain, setFbAuthDomain] = useState(initialCustomFb?.authDomain || '');
  const [fbAppId, setFbAppId] = useState(initialCustomFb?.appId || '');
  const [fbDatabaseId, setFbDatabaseId] = useState(initialCustomFb?.firestoreDatabaseId || '');
  const [fbStorageBucket, setFbStorageBucket] = useState(initialCustomFb?.storageBucket || '');
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState(initialCustomFb?.messagingSenderId || '');
  const [fbJsonInput, setFbJsonInput] = useState('');
  const [fbMsg, setFbMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Department state
  const [deptList, setDeptList] = useState<string[]>(departments);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [editingDeptIndex, setEditingDeptIndex] = useState<number | null>(null);
  const [editingDeptVal, setEditingDeptVal] = useState('');

  // Direct POS Hardware Printer State
  const [printerConfig, setPrinterConfig] = useState<DirectPrinterConfig>(
    settings.directPrinter || directPrintService.getConfig()
  );
  const [printerMsg, setPrinterMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);

  const [savedMsg, setSavedMsg] = useState('');

  const handlePairUsb = async () => {
    setIsTestingPrinter(true);
    setPrinterMsg({ type: 'info', text: 'Connecting to USB Thermal Printer...' });
    const res = await directPrintService.connectUsbPrinter(true);
    setIsTestingPrinter(false);
    if (res.success) {
      setPrinterMsg({
        type: 'success',
        text: `Successfully paired with ${res.deviceName || 'USB POS Printer'}!`
      });
    } else {
      setPrinterMsg({
        type: 'error',
        text: res.error || 'Failed to connect USB printer.'
      });
    }
  };

  const handleTestPrint = async () => {
    setIsTestingPrinter(true);
    setPrinterMsg({ type: 'info', text: 'Sending test print to physical printer...' });
    const currentSettings: CompanySettings = {
      ...settings,
      name,
      currency,
      receiptSize,
      directPrinter: printerConfig
    };
    try {
      const res = await directPrintService.printTest(currentSettings);
      if (res.success) {
        setPrinterMsg({ type: 'success', text: res.message || 'Direct test receipt printed!' });
      } else {
        setPrinterMsg({ type: 'error', text: res.message || 'Printer failed to respond.' });
      }
    } catch (err: any) {
      setPrinterMsg({ type: 'error', text: err.message || 'Error communicating with printer.' });
    } finally {
      setIsTestingPrinter(false);
    }
  };

  const handleTestCashDrawer = async () => {
    setIsTestingPrinter(true);
    setPrinterMsg({ type: 'info', text: 'Triggering cash drawer pulse...' });
    const currentSettings: CompanySettings = {
      ...settings,
      directPrinter: printerConfig
    };
    try {
      const res = await directPrintService.kickDrawer(currentSettings);
      if (res.success) {
        setPrinterMsg({ type: 'success', text: 'Drawer kick signal sent successfully!' });
      } else {
        setPrinterMsg({ type: 'error', text: res.message || 'Drawer signal failed.' });
      }
    } catch (err: any) {
      setPrinterMsg({ type: 'error', text: err.message || 'Drawer pulse error.' });
    } finally {
      setIsTestingPrinter(false);
    }
  };

  const handleSavePrinterSettings = () => {
    directPrintService.saveConfig(printerConfig);
    const updatedSettings: CompanySettings = {
      ...settings,
      name: name.trim() || 'HOTEL & RESTAURANT',
      address: address.trim(),
      phone: phone.trim(),
      currency: currency.trim() || 'Rs.',
      footer: footer.trim(),
      receiptSize: receiptSize,
      themeMode: themeMode,
      themeColor: themeColor,
      directPrinter: printerConfig
    };
    onSaveSettings(updatedSettings);
    setPrinterMsg({ type: 'success', text: 'Direct hardware printer settings saved!' });
    setTimeout(() => setPrinterMsg(null), 3000);
  };

  const handleApplyCustomFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbApiKey.trim() || !fbProjectId.trim()) {
      setFbMsg({ type: 'error', text: 'API Key and Project ID are required to connect your Firebase!' });
      return;
    }

    const customConfig: CustomFirebaseConfig = {
      apiKey: fbApiKey.trim(),
      projectId: fbProjectId.trim(),
      authDomain: fbAuthDomain.trim() || `${fbProjectId.trim()}.firebaseapp.com`,
      appId: fbAppId.trim(),
      firestoreDatabaseId: fbDatabaseId.trim() || undefined,
      storageBucket: fbStorageBucket.trim() || `${fbProjectId.trim()}.firebasestorage.app`,
      messagingSenderId: fbMessagingSenderId.trim()
    };

    saveData(CUSTOM_FIREBASE_KEY, customConfig);
    setFbMsg({
      type: 'success',
      text: 'Custom Firebase Account Configured! Reloading application to connect...'
    });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleParseFirebaseJson = () => {
    try {
      if (!fbJsonInput.trim()) return;
      // Clean possible JS object notation (e.g. const firebaseConfig = { ... })
      let cleanJson = fbJsonInput.trim();
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        cleanJson = match[0];
      }
      // Replace unquoted keys if pasted directly from JS
      cleanJson = cleanJson.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ');
      cleanJson = cleanJson.replace(/'/g, '"');
      const parsed = JSON.parse(cleanJson);
      if (parsed.apiKey) setFbApiKey(parsed.apiKey);
      if (parsed.projectId) setFbProjectId(parsed.projectId);
      if (parsed.authDomain) setFbAuthDomain(parsed.authDomain);
      if (parsed.appId) setFbAppId(parsed.appId);
      if (parsed.storageBucket) setFbStorageBucket(parsed.storageBucket);
      if (parsed.messagingSenderId) setFbMessagingSenderId(parsed.messagingSenderId);
      if (parsed.firestoreDatabaseId) setFbDatabaseId(parsed.firestoreDatabaseId);
      setFbJsonInput('');
      setFbMsg({ type: 'success', text: 'Firebase config JSON parsed successfully! Click "Save & Connect Firebase" to apply.' });
    } catch (e) {
      setFbMsg({ type: 'error', text: 'Could not parse JSON. Please enter fields manually or check JSON format.' });
    }
  };

  const handleResetToDefaultFirebase = () => {
    if (window.confirm('Reset back to default system Firebase database?')) {
      localStorage.removeItem(CUSTOM_FIREBASE_KEY);
      setFbApiKey('');
      setFbProjectId('');
      setFbAuthDomain('');
      setFbAppId('');
      setFbDatabaseId('');
      setFbStorageBucket('');
      setFbMessagingSenderId('');
      setFbMsg({ type: 'success', text: 'Reset to default Firebase. Reloading...' });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleAddDept = () => {
    const val = newDeptInput.trim();
    if (!val) return;
    if (deptList.some((d) => d.toLowerCase() === val.toLowerCase())) {
      alert('Department already exists.');
      return;
    }
    const updated = [...deptList, val];
    setDeptList(updated);
    onSaveDepartments(updated);
    setNewDeptInput('');
  };

  const handleSaveDeptEdit = (index: number) => {
    const val = editingDeptVal.trim();
    if (!val) return;
    const updated = [...deptList];
    updated[index] = val;
    setDeptList(updated);
    onSaveDepartments(updated);
    setEditingDeptIndex(null);
    setEditingDeptVal('');
  };

  const handleDeleteDept = (index: number) => {
    if (window.confirm(`Delete department "${deptList[index]}"?`)) {
      const updated = deptList.filter((_, i) => i !== index);
      setDeptList(updated);
      onSaveDepartments(updated);
    }
  };

  const handleThemeModeChange = (mode: 'light' | 'dark') => {
    setThemeMode(mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleThemeColorChange = (color: string) => {
    setThemeColor(color);
    document.documentElement.setAttribute('data-theme-color', color);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newUnitCode.trim().toUpperCase();
    const name = newUnitName.trim() || `${code} Counter`;
    const user = newUserName.trim() || 'Cashier';
    const pwd = newPassword.trim();

    if (!code || !pwd) {
      setAccountMsg({ type: 'error', text: 'Unit Code and Password/PIN are required!' });
      return;
    }

    if (accounts.some((a) => a.unitCode.toUpperCase() === code)) {
      setAccountMsg({ type: 'error', text: `Unit Code "${code}" already exists!` });
      return;
    }

    const newAcc: AuthAccount = {
      id: uid('acc'),
      unitCode: code,
      unitName: name,
      user: user,
      role: newRole,
      password: pwd,
      createdAt: new Date().toISOString()
    };

    if (onSaveAccount) {
      onSaveAccount(newAcc);
    }
    setAccountMsg({
      type: 'success',
      text: `Unit & Cashier "${code}" created and synchronized to Firebase Cloud!`
    });
    setNewUnitCode('');
    setNewUnitName('');
    setNewUserName('');
    setNewPassword('');
    setIsAddingAccount(false);
    setTimeout(() => setAccountMsg(null), 4000);
  };

  const handleDeleteUnitAccount = (acc: AuthAccount) => {
    setDeletingAccountId(acc.id || acc.unitCode);
  };

  const confirmDeleteUnitAccount = (acc: AuthAccount) => {
    if (onDeleteAccount) {
      onDeleteAccount(acc.id || acc.unitCode);
    }
    setDeletingAccountId(null);
    setAccountMsg({
      type: 'success',
      text: `Unit "${acc.unitCode}" deleted and removed from Firebase Cloud!`
    });
    setTimeout(() => setAccountMsg(null), 4000);
  };

  const handleSaveAccountEdit = (acc: AuthAccount) => {
    const updatedAcc: AuthAccount = {
      ...acc,
      unitName: editUnitName.trim() || acc.unitName,
      password: editPassword.trim() || acc.password
    };
    if (onSaveAccount) {
      onSaveAccount(updatedAcc);
    }
    setEditingAccountId(null);
    setEditUnitName('');
    setEditPassword('');
    setAccountMsg({
      type: 'success',
      text: `Unit "${acc.unitCode}" updated and synced to Firebase!`
    });
    setTimeout(() => setAccountMsg(null), 3000);
  };

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedSettings: CompanySettings = {
      ...settings,
      name: name.trim() || 'HOTEL & RESTAURANT',
      address: address.trim(),
      phone: phone.trim(),
      currency: currency.trim() || 'Rs.',
      footer: footer.trim(),
      receiptSize: receiptSize,
      receiptFontFamily: receiptFontFamily,
      receiptFontSize: receiptFontSize,
      receiptHeaderAlign: receiptHeaderAlign,
      receiptLineStyle: receiptLineStyle,
      themeMode: themeMode,
      themeColor: themeColor
    };
    onSaveSettings(updatedSettings);
    onSaveEmailRecipient(emailRecipient.trim());
    onSaveClosingTime(businessClosingTime);
    setSavedMsg('Settings & Theme updated successfully!');
    setTimeout(() => setSavedMsg(''), 3000);
  };

  return (
    <div className="space-y-4 max-w-4xl text-black">
      {savedMsg && (
        <div className="p-3 rounded-2xl bg-amber-50 text-amber-950 border border-amber-400 text-xs font-bold flex items-center gap-2 shadow-2xs">
          <Check className="w-4 h-4 text-amber-600" /> {savedMsg}
        </div>
      )}

      {/* POS Configuration Card */}
      <form onSubmit={handleSaveGeneral} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 text-black font-extrabold text-base pb-2 border-b border-slate-200">
          <Settings className="w-5 h-5 text-amber-600" /> POS System Settings
        </div>

        {/* Business Header Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Company / Store Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Store Address</label>
            <input
              type="text"
              value={address}
              placeholder="e.g. Main Street, Colombo"
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Telephone / Hotline</label>
            <input
              type="text"
              value={phone}
              placeholder="e.g. 011-2345678"
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Currency Symbol</label>
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Thermal Receipt Format</label>
            <select
              value={receiptSize}
              onChange={(e) => setReceiptSize(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 shadow-2xs"
            >
              <option value="80">80mm Standard POS Thermal Roll</option>
              <option value="58">58mm Compact Thermal Roll</option>
              <option value="a4">A4 Full Page</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
              Auto Shift Closing Time (ස්වයංක්‍රීයව දින අවසන් කිරීම)
            </label>
            <input
              type="time"
              value={businessClosingTime}
              onChange={(e) => setBusinessClosingTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Receipt & Thermal Print Customization (New Feature requested) */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <div className="flex items-center gap-2 font-bold text-sm text-black">
              <Printer className="w-4 h-4 text-amber-600" /> Receipt Typography &amp; Layout (රිසිට්පත් මුද්‍රණ සැකසුම්)
            </div>
            <span className="text-[11px] font-semibold text-slate-500">Live Preview Available</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Options Left Side (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              {/* Receipt Paper Size */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Receipt Paper Format (ප්‍රමාණය)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '80', label: '80mm Standard', desc: 'Standard Roll' },
                    { id: '58', label: '58mm Compact', desc: 'Mini Roll' },
                    { id: 'a4', label: 'A4 Page', desc: 'Full Invoice' }
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setReceiptSize(sz.id as any)}
                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all shadow-2xs ${
                        receiptSize === sz.id
                          ? 'bg-white border-2 border-amber-500 text-amber-950 font-black ring-1 ring-amber-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{sz.label}</div>
                      <div className="text-[10px] text-slate-500 font-normal">{sz.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Family Selection */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Font Style (අකුරු විලාසය)</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'modern', label: 'Modern Sans', sample: 'Aa Clean' },
                    { id: 'mono', label: 'Thermal Mono', sample: 'Aa 123' },
                    { id: 'compact', label: 'Compact Narrow', sample: 'Aa Tight' }
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setReceiptFontFamily(f.id as any)}
                      className={`p-2 rounded-xl border text-left cursor-pointer transition-all shadow-2xs ${
                        receiptFontFamily === f.id
                          ? 'bg-white border-2 border-amber-500 text-amber-950 font-black ring-1 ring-amber-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">{f.label}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{f.sample}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size & Alignment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Font Scale (ප්‍රමාණය)</label>
                  <select
                    value={receiptFontSize}
                    onChange={(e) => setReceiptFontSize(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
                  >
                    <option value="compact">Compact (Dense &amp; Paper Saver)</option>
                    <option value="normal">Normal (Recommended POS)</option>
                    <option value="large">Large (High Legibility)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Header Alignment</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptHeaderAlign('center')}
                      className={`p-2 rounded-xl border flex items-center justify-center gap-1 text-xs cursor-pointer shadow-2xs ${
                        receiptHeaderAlign === 'center'
                          ? 'bg-white border-2 border-amber-500 text-amber-950 font-black ring-1 ring-amber-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <AlignCenter className="w-3.5 h-3.5 text-amber-600" /> Centered
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptHeaderAlign('left')}
                      className={`p-2 rounded-xl border flex items-center justify-center gap-1 text-xs cursor-pointer shadow-2xs ${
                        receiptHeaderAlign === 'left'
                          ? 'bg-white border-2 border-amber-500 text-amber-950 font-black ring-1 ring-amber-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <AlignLeft className="w-3.5 h-3.5 text-amber-600" /> Left Align
                    </button>
                  </div>
                </div>
              </div>

              {/* Separator Line Style */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Section Divider Lines (වෙන් කරන ඉරි)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'dashed', label: 'Dashed ( - - - )' },
                    { id: 'dotted', label: 'Dotted ( · · · )' },
                    { id: 'solid', label: 'Solid ( ─── )' },
                    { id: 'double', label: 'Double ( ═══ )' }
                  ].map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setReceiptLineStyle(l.id as any)}
                      className={`p-2 rounded-xl border text-center cursor-pointer transition-all text-xs shadow-2xs ${
                        receiptLineStyle === l.id
                          ? 'bg-white border-2 border-amber-500 text-amber-950 font-black ring-1 ring-amber-400'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Mini Preview Right Side (5 cols) */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center bg-slate-100 p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-wider">Live Slip Preview</span>
              <div
                style={{
                  width: receiptSize === '58' ? '200px' : '230px',
                  fontFamily: receiptFontFamily === 'mono'
                    ? "'Courier New', Courier, monospace"
                    : receiptFontFamily === 'compact'
                    ? "'Arial Narrow', Arial, sans-serif"
                    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
                }}
                className={`bg-white text-black p-3 rounded-xl border border-slate-300 shadow-sm leading-tight select-none transition-all ${
                  receiptFontSize === 'large'
                    ? 'text-[12px]'
                    : receiptFontSize === 'compact'
                    ? 'text-[10px]'
                    : 'text-[11px]'
                }`}
              >
                <div className={receiptHeaderAlign === 'left' ? 'text-left' : 'text-center'}>
                  <div className="font-black uppercase text-xs">{name || 'HOTEL & RESTAURANT'}</div>
                  <div className="text-[9px] font-medium text-slate-600">Terminal: UNIT-01</div>
                </div>

                <div
                  style={{
                    borderBottom: receiptLineStyle === 'dotted'
                      ? '1px dotted #000'
                      : receiptLineStyle === 'solid'
                      ? '1px solid #000'
                      : receiptLineStyle === 'double'
                      ? '3px double #000'
                      : '1px dashed #000',
                    margin: '4px 0'
                  }}
                />

                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="font-normal text-slate-600">Bill:</span>
                    <span className="font-bold text-black font-mono">INV-1001</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal text-slate-600">Cashier:</span>
                    <span className="font-medium text-black">Admin</span>
                  </div>
                </div>

                <div
                  style={{
                    borderBottom: receiptLineStyle === 'dotted'
                      ? '1px dotted #000'
                      : receiptLineStyle === 'solid'
                      ? '1px solid #000'
                      : receiptLineStyle === 'double'
                      ? '3px double #000'
                      : '1px dashed #000',
                    margin: '4px 0'
                  }}
                />

                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between font-bold border-b pb-0.5 border-slate-200">
                    <span>ITEM</span>
                    <span>QTY</span>
                    <span>AMOUNT</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal truncate max-w-[90px]">Chicken Fried Rice</span>
                    <span className="font-normal text-slate-600">1x850</span>
                    <span className="font-semibold">850.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal truncate max-w-[90px]">Lime Juice</span>
                    <span className="font-normal text-slate-600">2x150</span>
                    <span className="font-semibold">300.00</span>
                  </div>
                </div>

                <div
                  style={{
                    borderBottom: receiptLineStyle === 'dotted'
                      ? '1px dotted #000'
                      : receiptLineStyle === 'solid'
                      ? '1px solid #000'
                      : receiptLineStyle === 'double'
                      ? '3px double #000'
                      : '1px dashed #000',
                    margin: '4px 0'
                  }}
                />

                <div className="flex justify-between font-black text-xs pt-0.5">
                  <span>TOTAL:</span>
                  <span>{currency} 1,150.00</span>
                </div>

                <div className="flex justify-between text-[10px] text-slate-700 pt-0.5">
                  <span className="font-normal">Payment: CASH</span>
                  <span className="font-bold">Balance: {currency} 850.00</span>
                </div>

                <div
                  style={{
                    borderBottom: receiptLineStyle === 'dotted'
                      ? '1px dotted #000'
                      : receiptLineStyle === 'solid'
                      ? '1px solid #000'
                      : receiptLineStyle === 'double'
                      ? '3px double #000'
                      : '1px dashed #000',
                    margin: '4px 0'
                  }}
                />

                <div className={`text-[9px] text-slate-500 pt-0.5 ${receiptHeaderAlign === 'left' ? 'text-left' : 'text-center'}`}>
                  {footer || 'Thank You! Please Come Again.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Theme Settings Selection (Requirement 7) */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-black">
            <Palette className="w-4 h-4 text-amber-600" /> UI Theme &amp; Accent Styling (තේමා සැකසුම්)
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Theme Mode */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Theme Mode</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleThemeModeChange('light')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs cursor-pointer shadow-2xs transition-all ${
                    themeMode === 'light'
                      ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" /> Clean Light Mode
                </button>

                <button
                  type="button"
                  onClick={() => handleThemeModeChange('dark')}
                  className={`p-2.5 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs cursor-pointer shadow-2xs transition-all ${
                    themeMode === 'dark'
                      ? 'bg-slate-900 border-2 border-amber-500 text-amber-400 font-black shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Moon className="w-4 h-4 text-indigo-400" /> Dark Slate Mode
                </button>
              </div>
            </div>

            {/* Accent Color Palette */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">POS Accent Color Theme</label>
              <div className="flex flex-wrap gap-2.5">
                {[
                  { id: 'amber', label: 'Amber Gold', hex: '#d97706' },
                  { id: 'emerald', label: 'Emerald Green', hex: '#059669' },
                  { id: 'blue', label: 'Sapphire Blue', hex: '#2563eb' },
                  { id: 'rose', label: 'Crimson Rose', hex: '#e11d48' },
                  { id: 'indigo', label: 'Deep Indigo', hex: '#4f46e5' }
                ].map((col) => {
                  const isSelected = themeColor === col.id;
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => handleThemeColorChange(col.id)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs transition-all ${
                        isSelected
                          ? 'border-2 border-slate-900 bg-white text-black font-black scale-105 shadow-xs ring-2 ring-slate-400'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs border border-white/40"
                        style={{ backgroundColor: col.hex }}
                      ></span>
                      <span>{col.label}</span>
                      {isSelected && <span className="text-[10px] font-black text-black">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
            Report Email Recipient (for Direct Email Sending on Close Sale)
          </label>
          <input
            type="email"
            placeholder="e.g. superservpos@gmail.com / manager@company.com"
            value={emailRecipient}
            onChange={(e) => setEmailRecipient(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 shadow-2xs"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Receipt Footer Message</label>
          <textarea
            rows={2}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
          >
            <Save className="w-4 h-4 text-amber-600" /> Save System &amp; Theme Settings
          </button>
        </div>
      </form>

      {/* Direct Hardware POS Thermal Printer Management Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white border border-amber-500 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-black flex items-center gap-2">
                Direct Physical POS Printer (කෙලින්ම බිල් මුද්‍රණය)
                <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-600 fill-emerald-500" /> Zero Dialog
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                1st-Click direct printing to physical ESC/POS hardware (bypasses browser print preview and window.print dialog).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePairUsb}
            disabled={isTestingPrinter}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all disabled:opacity-50"
          >
            <Usb className="w-3.5 h-3.5 text-amber-600" /> Pair USB Printer (1-Click)
          </button>
        </div>

        {printerMsg && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 shadow-2xs ${
              printerMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : printerMsg.type === 'error'
                ? 'bg-rose-50 text-rose-950 border-rose-300'
                : 'bg-amber-50 text-amber-950 border-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {printerMsg.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              <span>{printerMsg.text}</span>
            </div>
            <button
              onClick={() => setPrinterMsg(null)}
              className="text-slate-400 hover:text-black font-bold text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Driver Selector */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Hardware Driver</label>
            <select
              value={printerConfig.driver}
              onChange={(e) =>
                setPrinterConfig({
                  ...printerConfig,
                  driver: e.target.value as DirectPrintDriver
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
            >
              <option value="auto">Auto Detect (WebUSB / WebSerial / QZ / HTTP)</option>
              <option value="webusb">Direct WebUSB (Standard USB Thermal Printers)</option>
              <option value="webserial">Direct WebSerial (COM / Virtual USB Serial)</option>
              <option value="qztray">QZ Tray Desktop Bridge (Silent LAN/USB)</option>
              <option value="localhttp">Local HTTP Bridge Service (Port 9100/raw)</option>
            </select>
          </div>

          {/* Paper Width */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Thermal Paper Roll Width</label>
            <select
              value={printerConfig.paperWidth}
              onChange={(e) =>
                setPrinterConfig({
                  ...printerConfig,
                  paperWidth: e.target.value as '58mm' | '80mm'
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
            >
              <option value="80mm">80mm Standard POS (48 columns)</option>
              <option value="58mm">58mm Compact POS (32 columns)</option>
            </select>
          </div>

          {/* Serial Baud Rate (if serial) */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Serial Baud Rate (COM Port)</label>
            <select
              value={printerConfig.serialBaudRate || 9600}
              onChange={(e) =>
                setPrinterConfig({
                  ...printerConfig,
                  serialBaudRate: parseInt(e.target.value, 10)
                })
              }
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
            >
              <option value={9600}>9600 (Standard POS default)</option>
              <option value={19200}>19200</option>
              <option value={38400}>38400 (Epson default)</option>
              <option value={115200}>115200 (High Speed)</option>
            </select>
          </div>
        </div>

        {/* Optional QZ Tray / Local HTTP endpoints */}
        {(printerConfig.driver === 'qztray' || printerConfig.driver === 'auto') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                QZ Tray Printer Name (leave blank for default printer)
              </label>
              <input
                type="text"
                placeholder="e.g. POS-80 or EPSON TM-T20"
                value={printerConfig.qzPrinterName || ''}
                onChange={(e) =>
                  setPrinterConfig({
                    ...printerConfig,
                    qzPrinterName: e.target.value
                  })
                }
                className="w-full px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                QZ Tray Host / Port (Default: localhost:8182)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="localhost"
                  value={printerConfig.qzHost || 'localhost'}
                  onChange={(e) =>
                    setPrinterConfig({
                      ...printerConfig,
                      qzHost: e.target.value
                    })
                  }
                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
                />
                <input
                  type="number"
                  placeholder="8182"
                  value={printerConfig.qzPort || 8182}
                  onChange={(e) =>
                    setPrinterConfig({
                      ...printerConfig,
                      qzPort: parseInt(e.target.value, 10) || 8182
                    })
                  }
                  className="w-24 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Hardware Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isTestingPrinter}
              onClick={handleTestPrint}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-amber-600" /> Send Test Print
            </button>

            <button
              type="button"
              disabled={isTestingPrinter}
              onClick={handleTestCashDrawer}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-amber-600" /> Open Cash Drawer Pulse
            </button>
          </div>

          <button
            type="button"
            onClick={handleSavePrinterSettings}
            className="px-5 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-black text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
          >
            <Save className="w-4 h-4 text-amber-600" /> Save Hardware Printer Settings
          </button>
        </div>
      </div>

      {/* Credit Department Management Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
        <div>
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <h3 className="font-extrabold text-sm text-black">Credit Departments (ණය දෙපාර්තමේන්තු)</h3>
              <p className="text-xs text-slate-500">
                Department buttons displayed strictly on Credit sales (HR, Finance, Security, IT, Kitchen, etc.).
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter department name (e.g. Finance, Maintenance)..."
            value={newDeptInput}
            onChange={(e) => setNewDeptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddDept();
              }
            }}
            className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 shadow-2xs"
          />
          <button
            type="button"
            onClick={handleAddDept}
            className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Plus className="w-4 h-4 text-amber-600" /> Add Department
          </button>
        </div>

        <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
          {deptList.map((dept, index) => (
            <div key={index} className="p-3 flex items-center justify-between bg-white">
              {editingDeptIndex === index ? (
                <div className="flex items-center gap-2 flex-1 mr-2">
                  <input
                    type="text"
                    value={editingDeptVal}
                    onChange={(e) => setEditingDeptVal(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs font-bold rounded-lg border border-amber-500 bg-white text-black"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveDeptEdit(index)}
                    className="px-2.5 py-1 bg-white hover:bg-amber-50 border border-amber-500 text-amber-950 rounded-lg text-xs font-extrabold"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingDeptIndex(null)}
                    className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-black rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <span className="font-bold text-xs text-black">{dept}</span>
              )}

              <div className="flex items-center gap-1">
                {editingDeptIndex !== index && (
                  <button
                    onClick={() => {
                      setEditingDeptIndex(index);
                      setEditingDeptVal(dept);
                    }}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteDept(index)}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cashier Accounts & Counter Units Management Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white border border-amber-500 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-black">
                Counter Units &amp; Cashier Accounts (කවුන්ටර සහ අයකැමි කළමනාකරණය)
              </h3>
              <p className="text-xs text-slate-500">
                Manage billing terminals, cashier logins, and passwords. Deleting a unit removes all associated data from Firebase.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAddingAccount(!isAddingAccount)}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-amber-600" /> {isAddingAccount ? 'Cancel' : 'Add New Unit'}
          </button>
        </div>

        {accountMsg && (
          <div
            className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 shadow-2xs ${
              accountMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : 'bg-rose-50 text-rose-950 border-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {accountMsg.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{accountMsg.text}</span>
            </div>
            <button
              onClick={() => setAccountMsg(null)}
              className="text-slate-400 hover:text-black font-bold text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Add New Unit Form */}
        {isAddingAccount && (
          <form
            onSubmit={handleCreateAccount}
            className="p-4 bg-amber-50/40 rounded-2xl border border-amber-300 space-y-3 animate-in fade-in"
          >
            <div className="text-xs font-black uppercase text-amber-950 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-amber-600" /> Create New Terminal / Counter Unit
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  Unit Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UC02, BAR01"
                  value={newUnitCode}
                  onChange={(e) => setNewUnitCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-black uppercase text-black focus:outline-amber-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  Unit / Counter Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Restaurant Floor 2"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  Cashier Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cashier 2 / Nimal"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase block mb-1">
                  PIN / Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="e.g. 1234"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Account Role:</span>
                <button
                  type="button"
                  onClick={() => setNewRole('CASHIER')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    newRole === 'CASHIER'
                      ? 'bg-amber-500 text-black font-black border border-amber-600'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  Cashier POS
                </button>
                <button
                  type="button"
                  onClick={() => setNewRole('ADMIN')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    newRole === 'ADMIN'
                      ? 'bg-slate-900 text-white font-black border border-slate-900'
                      : 'bg-white border border-slate-300 text-slate-700'
                  }`}
                >
                  Administrator
                </button>
              </div>

              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-black text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
              >
                <Save className="w-3.5 h-3.5 text-amber-600" /> Save &amp; Sync to Firebase
              </button>
            </div>
          </form>
        )}

        {/* Existing Accounts List */}
        <div className="divide-y divide-slate-200 border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
          {accounts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No registered counter units. Click &quot;Add New Unit&quot; above to create one.
            </div>
          ) : (
            accounts.map((acc) => {
              const isEditing = editingAccountId === (acc.id || acc.unitCode);
              return (
                <div
                  key={acc.id || acc.unitCode}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white hover:bg-slate-50/60 transition-all"
                >
                  {isEditing ? (
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono font-black text-xs px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-300">
                        {acc.unitCode}
                      </span>
                      <input
                        type="text"
                        placeholder="Unit Name"
                        value={editUnitName}
                        onChange={(e) => setEditUnitName(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-amber-500 text-xs font-bold bg-white text-black"
                      />
                      <input
                        type="password"
                        placeholder="New PIN (optional)"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-amber-500 text-xs font-bold bg-white text-black w-28"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveAccountEdit(acc)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 border border-amber-500 text-amber-950 text-xs font-black cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingAccountId(null)}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-black cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-300 flex items-center justify-center font-mono font-black text-xs text-black">
                        {acc.unitCode.slice(0, 4)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-black">{acc.unitCode}</span>
                          <span className="text-xs font-bold text-slate-700">
                            {acc.unitName || acc.user || 'Counter Terminal'}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                              acc.role === 'ADMIN'
                                ? 'bg-slate-900 text-amber-400 border-slate-950'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            }`}
                          >
                            {acc.role || 'CASHIER'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                          <span>User: <b>{acc.user || 'Cashier'}</b></span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Lock className="w-3 h-3 text-slate-400" /> PIN: ••••
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      {deletingAccountId === (acc.id || acc.unitCode) ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 p-1.5 rounded-xl border border-rose-300 animate-in fade-in">
                          <span className="text-xs font-bold text-rose-900 px-1">Really delete {acc.unitCode}?</span>
                          <button
                            type="button"
                            onClick={() => confirmDeleteUnitAccount(acc)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs cursor-pointer"
                          >
                            Yes, Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingAccountId(null)}
                            className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountId(acc.id || acc.unitCode);
                              setEditUnitName(acc.unitName || '');
                              setEditPassword('');
                              setDeletingAccountId(null);
                            }}
                            className="px-2.5 py-1 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-amber-600" /> Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUnitAccount(acc)}
                            className="px-2.5 py-1 rounded-lg hover:bg-rose-50 text-rose-700 hover:text-rose-900 border border-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            title="Delete unit and remove from Firebase"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete Unit
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cloud Database & Firebase Account Sync Card */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="font-extrabold text-sm text-black">Firebase Account & Cloud Sync Settings (වෙනත් Firebase Account එකක් සම්බන්ධ කිරීම)</h3>
              <p className="text-xs text-slate-500">
                Connect your own Firebase Project / Database for real-time cloud persistence across multiple locations and cashier terminals.
              </p>
            </div>
          </div>
          {initialCustomFb ? (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Custom Firebase Active
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5 text-slate-500" /> Default Firebase Active
            </span>
          )}
        </div>

        {fbMsg && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-2xs ${
              fbMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border border-emerald-400'
                : 'bg-rose-50 text-rose-950 border border-rose-400'
            }`}
          >
            {fbMsg.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{fbMsg.text}</span>
          </div>
        )}

        {/* Quick Paste JSON option */}
        <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-2">
          <label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-amber-600" />
            Quick Import from Firebase Console (Paste firebaseConfig JSON snippet)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder='Paste firebaseConfig object or JSON here (e.g. { apiKey: "...", projectId: "..." })'
              value={fbJsonInput}
              onChange={(e) => setFbJsonInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono text-black focus:outline-amber-500 shadow-2xs"
            />
            <button
              type="button"
              onClick={handleParseFirebaseJson}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 font-bold text-xs cursor-pointer shadow-2xs"
            >
              Parse &amp; Fill
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Copy the configuration code block from <b>Firebase Console → Project Settings → Web apps</b> and paste above.
          </p>
        </div>

        {/* Manual Field Inputs */}
        <form onSubmit={handleApplyCustomFirebase} className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Project ID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. my-restaurant-pos-12345"
                value={fbProjectId}
                onChange={(e) => setFbProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Web API Key <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. AIzaSy..."
                value={fbApiKey}
                onChange={(e) => setFbApiKey(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Auth Domain</label>
              <input
                type="text"
                placeholder="e.g. my-restaurant-pos-12345.firebaseapp.com"
                value={fbAuthDomain}
                onChange={(e) => setFbAuthDomain(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">App ID</label>
              <input
                type="text"
                placeholder="e.g. 1:123456789:web:abcdef..."
                value={fbAppId}
                onChange={(e) => setFbAppId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                Firestore Database ID (Optional - default is '(default)')
              </label>
              <input
                type="text"
                placeholder="(default) or custom database name"
                value={fbDatabaseId}
                onChange={(e) => setFbDatabaseId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Storage Bucket (Optional)</label>
              <input
                type="text"
                placeholder="e.g. my-restaurant-pos-12345.firebasestorage.app"
                value={fbStorageBucket}
                onChange={(e) => setFbStorageBucket(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500 shadow-2xs"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
            {initialCustomFb ? (
              <button
                type="button"
                onClick={handleResetToDefaultFirebase}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Revert to Default Firebase
              </button>
            ) : (
              <div className="text-[11px] text-slate-500 font-medium">
                Currently utilizing cloud container Firebase instance.
              </div>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
            >
              <Save className="w-4 h-4 text-amber-600" /> Save &amp; Connect Custom Firebase
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
