import React, { useState } from 'react';
import { CashMovement, Register, AuthSession } from '../types/pos';
import { formatMoney, uid, getNowParts } from '../services/storage';
import { ArrowDownLeft, ArrowUpRight, X, DollarSign } from 'lucide-react';

interface CashManagementModalProps {
  isOpen?: boolean;
  activeRegister?: Register | null;
  session?: AuthSession | null;
  currency?: string;
  onClose: () => void;
  onSaveMovement?: (movement: CashMovement) => void;
  onAddMovement?: (type: 'CASH_IN' | 'CASH_OUT' | 'IN' | 'OUT', amount: number, reason: string) => void;
  onAddCashMovement?: (type: 'CASH_IN' | 'CASH_OUT' | 'IN' | 'OUT', amount: number, reason: string) => void;
}

const DENOMINATIONS = [10, 20, 50, 100, 500, 1000, 2000, 5000];

const REASONS = [
  'Change Replenishment',
  'Opening Float Adjustment',
  'Petty Cash Deposit',
  'Expense / Purchase',
  'Bank / Safe Drop',
  'Supplier Cash Payout',
  'Owner Cash Draw',
  'Other'
];

export const CashManagementModal: React.FC<CashManagementModalProps> = ({
  isOpen = true,
  activeRegister,
  session,
  currency = 'Rs.',
  onClose,
  onSaveMovement,
  onAddMovement,
  onAddCashMovement
}) => {
  const [type, setType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_IN');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');

  if (isOpen === false) return null;

  const handleDenomClick = (val: number) => {
    setAmount((prev) => prev + val);
  };

  const handleSave = () => {
    if (amount <= 0) {
      alert('Please enter a valid cash amount greater than 0.');
      return;
    }

    const finalReason = customReason.trim() ? customReason.trim() : reason;
    const now = getNowParts();

    const movement: CashMovement = {
      id: uid('csh'),
      type: type,
      amount: amount,
      reason: finalReason,
      date: now.date,
      time: now.time,
      timestamp: `${now.date} ${now.time}`,
      cashier: session?.user || 'Cashier',
      unit: session?.unitCode || activeRegister?.unitCode || 'UNIT-01',
      registerId: activeRegister?.id || 'default_reg'
    };

    if (onSaveMovement) {
      onSaveMovement(movement);
    }
    if (onAddCashMovement) {
      onAddCashMovement(type, amount, finalReason);
    } else if (onAddMovement) {
      onAddMovement(type, amount, finalReason);
    }

    setAmount(0);
    setCustomReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-black">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white border border-amber-500 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-black text-base">Cash Management</h3>
              <div className="text-[11px] text-slate-500">
                {activeRegister ? `${activeRegister.unitName || activeRegister.unitCode} (Drawer Active)` : 'Drawer Cash Adjustment'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Type Selector (Cash In vs Cash Out) */}
          <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
            <button
              type="button"
              onClick={() => setType('CASH_IN')}
              className={`py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'CASH_IN'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 shadow-2xs'
                  : 'text-black hover:bg-slate-50 border border-transparent'
              }`}
            >
              <ArrowDownLeft className="w-4 h-4 text-amber-600" /> Cash In (+)
            </button>
            <button
              type="button"
              onClick={() => setType('CASH_OUT')}
              className={`py-2.5 rounded-lg font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                type === 'CASH_OUT'
                  ? 'bg-white border-2 border-rose-600 text-rose-950 shadow-2xs'
                  : 'text-black hover:bg-slate-50 border border-transparent'
              }`}
            >
              <ArrowUpRight className="w-4 h-4 text-rose-600" /> Cash Out (-)
            </button>
          </div>

          {/* Amount Display */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 text-center shadow-2xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Amount to {type === 'CASH_IN' ? 'Add (Float / In)' : 'Withdraw (Payout / Out)'}
            </span>
            <div className="text-3xl font-black text-black">
              {formatMoney(amount, currency)}
            </div>
          </div>

          {/* Quick Denomination Buttons */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Quick Add Currency (Tap to Add)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {DENOMINATIONS.map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleDenomClick(val)}
                  className="py-2.5 rounded-xl bg-white hover:bg-amber-50 hover:border-amber-500 hover:text-amber-900 border border-slate-300 text-black font-extrabold text-xs transition-all active:scale-95 cursor-pointer shadow-2xs"
                >
                  +{val.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(0)}
                className="py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 font-bold text-xs cursor-pointer shadow-2xs"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Manual Input */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Or Type Exact Amount
            </label>
            <input
              type="number"
              min="0"
              step="10"
              placeholder="0.00"
              value={amount || ''}
              onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-base font-bold text-black focus:outline-amber-500"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Reason / Category
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500 mb-2"
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Custom description note (optional)"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500"
            />
          </div>
        </div>

        {/* Foot Buttons */}
        <div className="p-3 border-t border-slate-200 bg-white flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-sm cursor-pointer shadow-2xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-5 py-2.5 rounded-xl font-extrabold text-sm border-2 transition-all active:scale-95 cursor-pointer shadow-xs ${
              type === 'CASH_IN'
                ? 'bg-white hover:bg-amber-50 text-amber-950 border-amber-500'
                : 'bg-white hover:bg-rose-50 text-rose-950 border-rose-600'
            }`}
          >
            Record {type === 'CASH_IN' ? 'Cash In' : 'Cash Out'}
          </button>
        </div>
      </div>
    </div>
  );
};
