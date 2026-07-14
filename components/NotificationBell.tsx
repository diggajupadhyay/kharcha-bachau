import React from 'react';
import { Bell } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useNotificationUI } from '../context/NotificationUIContext';

interface NotificationBellProps {
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className = '' }) => {
  const { appNotifications } = useStore();
  const { open } = useNotificationUI();
  const unreadCount = appNotifications.filter(n => !n.read).length;

  return (
    <button
      onClick={open}
      className={`relative w-11 h-11 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center active:scale-95 hover:bg-slate-100 hover:shadow-xl transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${className}`}
      aria-label="Notifications"
    >
      <Bell size={18} className="text-slate-700" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default NotificationBell;
