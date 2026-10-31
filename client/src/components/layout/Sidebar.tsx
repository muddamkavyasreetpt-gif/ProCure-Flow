import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  PlusCircle,
  FileText,
  CheckSquare,
  Building2,
  ShieldCheck,
  Bot
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();

  const navItems = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'New Request', to: '/requests/new', icon: PlusCircle, roles: ['employee', 'manager'] },
    { label: 'Requests', to: '/requests', icon: FileText },
    { label: 'Approvals', to: '/approvals', icon: CheckSquare, roles: ['manager', 'finance'] },
    { label: 'Vendors', to: '/vendors', icon: Building2 },
    { label: 'Audit Log', to: '/audit', icon: ShieldCheck, roles: ['manager', 'finance'] }
  ];

  const visibleItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  );

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950 flex flex-col h-screen shrink-0">
      <div className="h-16 flex items-center px-6 gap-3 border-b border-slate-800/80">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-base tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
            ProcureFlow
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-indigo-400 font-semibold font-mono">
            Multi-Agent AI (INR ₹)
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isRequestsItem = item.to === '/requests';
          const isNewRequestItem = item.to === '/requests/new';

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || isNewRequestItem || isRequestsItem}
              className={({ isActive }) => {
                const active =
                  (isActive && (!isRequestsItem || location.pathname === '/requests')) ||
                  (isRequestsItem && location.pathname.startsWith('/runs/'));
                return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`;
              }}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 font-semibold flex items-center justify-center text-xs">
            {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">
              {user?.fullName || user?.email}
            </p>
            <p className="text-[11px] text-slate-400 capitalize">{user?.role || 'Employee'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
