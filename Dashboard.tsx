import React, { useState, useMemo } from 'react';
import { Sale, Product, AuthSession, Register, CompanySettings, AuthAccount } from '../types/pos';
import { formatMoney, getNowParts } from '../services/storage';
import {
  TrendingUp,
  CreditCard,
  Banknote,
  FileText,
  ShoppingBag,
  PlusCircle,
  Clock,
  Ticket,
  DollarSign,
  Lock,
  ArrowRight,
  Store,
  Filter,
  UserCheck
} from 'lucide-react';

interface DashboardProps {
  sales: Sale[];
  products: Product[];
  session: AuthSession | null;
  activeRegister: Register | null;
  settings: CompanySettings;
  accounts?: AuthAccount[];
  onNavigate: (page: string) => void;
  onOpenCashManagement: () => void;
  onOpenCloseSale: () => void;
  onViewSale: (sale: Sale) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  sales,
  products,
  session,
  activeRegister,
  settings,
  accounts = [],
  onNavigate,
  onOpenCashManagement,
  onOpenCloseSale,
  onViewSale
}) => {
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string>('ALL');

  const now = getNowParts();
  const today = now.date;
  const currentMonth = today.slice(0, 7);

  // Isolate sales: Cashier only sees their own account's sales.
  // Admin/Supervisor can filter by unit or view all.
  const scopedSales = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'UNIT01';
      return sales.filter(
        (s) => s.unitCode === unit || (session?.user && s.cashier === session.user)
      );
    }
    if (selectedUnitFilter !== 'ALL') {
      return sales.filter((s) => s.unitCode === selectedUnitFilter);
    }
    return sales;
  }, [sales, session, selectedUnitFilter]);

  // Extract all distinct unit codes for Admin filter
  const distinctUnits = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => a.unitCode && set.add(a.unitCode.toUpperCase()));
    sales.forEach((s) => s.unitCode && set.add(s.unitCode.toUpperCase()));
    return Array.from(set);
  }, [accounts, sales]);

  // Calculations
  const todaySales = scopedSales.filter((s) => s.date === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.grandTotal, 0);
  const todayCash = todaySales
    .filter((s) => s.paymentMethod === 'CASH' || s.paymentMethod === 'CASH+CARD')
    .reduce((sum, s) => sum + (s.paymentMethod === 'CASH' ? s.grandTotal : s.cashAmount || 0), 0);
  const todayCard = todaySales
    .filter((s) => s.paymentMethod === 'CARD' || s.paymentMethod === 'CASH+CARD')
    .reduce((sum, s) => sum + (s.paymentMethod === 'CARD' ? s.grandTotal : s.cardAmount || 0), 0);
  const todayCredit = todaySales
    .filter((s) => s.paymentMethod === 'CREDIT')
    .reduce((sum, s) => sum + s.grandTotal, 0);

  const monthSales = scopedSales.filter((s) => s.date && s.date.slice(0, 7) === currentMonth);
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.grandTotal, 0);

  // Top products
  const productSalesMap: { [name: string]: { qty: number; revenue: number } } = {};
  todaySales.forEach((s) => {
    s.items.forEach((item) => {
      if (!productSalesMap[item.name]) {
        productSalesMap[item.name] = { qty: 0, revenue: 0 };
      }
      productSalesMap[item.name].qty += item.qty;
      productSalesMap[item.name].revenue += item.qty * item.price;
    });
  });

  const topProducts = Object.entries(productSalesMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 6);

  const recentSales = scopedSales.slice(-6).reverse();

  return (
    <div className="space-y-4 bg-white text-black">
      {/* Account Context Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 border border-amber-400 flex items-center justify-center font-black text-xs">
            <Store className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <div className="text-xs font-black text-black flex items-center gap-1.5">
              <span>Current Account:</span>
              <span className="px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-400 text-amber-950 font-black">
                {session?.unitCode || session?.user || 'System'} ({session?.unitName || session?.unitCode || 'Counter'})
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                • {session?.role}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {session?.role === 'CASHIER'
                ? 'Isolated Account Mode: Only sales & cash movements for this account are tracked.'
                : 'Management Mode: View individual counter terminal data or consolidated business sales.'}
            </p>
          </div>
        </div>

        {/* Admin / Supervisor Unit Filter */}
        {session?.role !== 'CASHIER' && distinctUnits.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-bold text-slate-600">Filter Account / Unit:</span>
            <select
              value={selectedUnitFilter}
              onChange={(e) => setSelectedUnitFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
            >
              <option value="ALL">All Accounts &amp; Counters (Total Business)</option>
              {distinctUnits.map((u) => (
                <option key={u} value={u}>
                  Counter / Unit: {u}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {/* Cashier Quick Action Bar */}
      {session?.role === 'CASHIER' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('pos')}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-amber-600" /> NEW SALE
            </button>
            <button
              onClick={() => onNavigate('sales')}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-black hover:text-amber-950 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <ShoppingBag className="w-4 h-4 text-amber-600" /> SALES
            </button>
            <button
              onClick={() => onNavigate('token')}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-black hover:text-amber-950 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Ticket className="w-4 h-4 text-amber-600" /> TOKEN
            </button>
            <button
              onClick={onOpenCashManagement}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-black hover:text-amber-950 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <DollarSign className="w-4 h-4 text-amber-600" /> CASH IN / OUT
            </button>
          </div>

          <button
            onClick={onOpenCloseSale}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border-2 border-rose-400 font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            <Lock className="w-4 h-4 text-rose-600" /> CLOSE SALE
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Today's Sales</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 border border-amber-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-black">
              {formatMoney(todayRevenue, settings.currency)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">{todaySales.length} transactions</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cash Sales</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 border border-amber-300 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-black">
              {formatMoney(todayCash, settings.currency)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Physical cash</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Card Sales</span>
            <div className="w-7 h-7 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-blue-700">
              {formatMoney(todayCard, settings.currency)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Card POS</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Credit Sales</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-amber-700">
              {formatMoney(todayCredit, settings.currency)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">Dept Receivables</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Month Sales</span>
            <div className="w-7 h-7 rounded-xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-lg font-black text-purple-700">
              {formatMoney(monthRevenue, settings.currency)}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">{currentMonth}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Drawer</span>
            <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-600 border border-amber-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs font-black text-black truncate">
              {activeRegister ? activeRegister.cashier : 'No Active Shift'}
            </div>
            <div className="text-[11px] font-mono text-amber-950 font-bold">
              {activeRegister ? activeRegister.unitCode : 'Off'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Top Selling Items & Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Top Selling Products */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
              <h3 className="font-extrabold text-sm text-black">Top Selling Items Today</h3>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs text-amber-950 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              View Report <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              No sales completed today yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 space-y-1">
              {topProducts.map(([name, data], idx) => (
                <div key={idx} className="pt-2 first:pt-0 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-black">{name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-950 text-[10px] font-bold border border-amber-300">
                      {data.qty} sold
                    </span>
                    <span className="font-black text-black">
                      {formatMoney(data.revenue, settings.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-600" />
              <h3 className="font-extrabold text-sm text-black">Recent Invoices</h3>
            </div>
            <button
              onClick={() => onNavigate('sales')}
              className="text-xs text-amber-950 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              All Sales <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {recentSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              No transactions recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 space-y-1">
              {recentSales.map((sale) => (
                <div
                  key={sale.invoiceNumber}
                  onClick={() => onViewSale(sale)}
                  className="pt-2 first:pt-0 flex items-center justify-between text-xs hover:bg-amber-50/50 p-1.5 rounded-xl cursor-pointer transition-colors"
                >
                  <div>
                    <div className="font-mono font-bold text-black">{sale.invoiceNumber}</div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {sale.date} • {sale.time} ({sale.items.length} items)
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-black">
                      {formatMoney(sale.grandTotal, settings.currency)}
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                        sale.paymentMethod === 'CASH'
                          ? 'bg-amber-100 text-amber-950 border border-amber-300'
                          : sale.paymentMethod === 'CARD'
                          ? 'bg-blue-100 text-blue-900'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {sale.paymentMethod}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
