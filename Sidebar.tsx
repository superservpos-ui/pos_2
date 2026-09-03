import React from 'react';
import { AuthSession } from '../types/pos';
import {
  LayoutDashboard,
  ShoppingCart,
  ShoppingBag,
  BarChart3,
  Ticket,
  PlusSquare,
  DollarSign,
  FileSpreadsheet,
  Settings
} from 'lucide-react';

interface SidebarProps {
  activePage: string;
  session: AuthSession | null;
  collapsed: boolean;
  onSelectPage: (page: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  session,
  collapsed,
  onSelectPage
}) => {
  const role = session?.role || 'CASHIER';

  // Navigation definition based on user role requirements
  const getNavItems = () => {
    if (role === 'CASHIER') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'pos', label: 'POS Billing', icon: ShoppingCart },
        { id: 'sales', label: 'Sales History', icon: ShoppingBag },
        { id: 'token', label: 'Token Orders', icon: Ticket },
        { id: 'reports', label: 'Reports', icon: BarChart3 }
      ];
    }
    if (role === 'SUPERVISOR') {
      return [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'reports', label: 'Reports', icon: BarChart3 }
      ];
    }
    // ADMIN (NO POS Billing)
    return [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'products', label: 'Product Add / Edit', icon: PlusSquare },
      { id: 'price-update', label: 'Price Update', icon: DollarSign },
      { id: 'sales', label: 'Sales History', icon: ShoppingBag },
      { id: 'token', label: 'Token Orders', icon: Ticket },
      { id: 'reports', label: 'Reports', icon: BarChart3 },
      { id: 'import-export', label: 'Import / Export', icon: FileSpreadsheet },
      { id: 'settings', label: 'Settings', icon: Settings }
    ];
  };

  const navItems = getNavItems();

  return (
    <aside
      className={`bg-white border-r border-slate-200 transition-all duration-200 flex flex-col justify-between shrink-0 z-20 text-black ${
        collapsed ? 'w-14' : 'w-44'
      }`}
    >
      <div className="p-2 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-bold transition-all cursor-pointer bg-white ${
                isActive
                  ? 'text-amber-950 font-black border-2 border-amber-500 shadow-2xs bg-amber-50/70'
                  : 'text-black hover:bg-amber-50/50 hover:border-amber-400 hover:text-amber-950 border border-slate-200 shadow-2xs'
              } ${collapsed ? 'justify-center px-0' : ''}`}
              title={item.label}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-600' : 'text-slate-600'}`} />
              {!collapsed && <span className="font-extrabold truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom Profile Info */}
      {!collapsed && session && (
        <div className="p-2 m-1.5 bg-white rounded-xl border border-slate-200 text-[10px] shadow-2xs">
          <div className="font-extrabold text-black truncate">
            {session.unitName || session.user}
          </div>
          <div className="text-amber-950 font-mono text-[9px] font-bold">
            {session.unitCode || session.role}
          </div>
        </div>
      )}
    </aside>
  );
};
