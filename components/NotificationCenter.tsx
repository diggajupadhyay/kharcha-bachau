import React, { useState, useMemo, useRef } from 'react';
import { X, Bell, AlertCircle, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { AppNotification, NotificationPreferences, getNotificationPreferences, saveNotificationPreferences } from '../services/notificationService';
import { useStore } from '../context/StoreContext';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose
}) => {
  const { appNotifications, markAppNotificationRead, dismissAppNotification, markAllAppNotificationsRead } = useStore();
  const notifications = appNotifications;
  const [preferences, setPreferences] = useState<NotificationPreferences>(getNotificationPreferences());
  const [showPreferences, setShowPreferences] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);
  
  const handleMarkAsRead = (id: string) => {
    markAppNotificationRead(id);
  };
  
  const handleDismiss = (id: string) => {
    dismissAppNotification(id);
  };

  const handlePreferenceChange = (key: keyof NotificationPreferences, value: any) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    saveNotificationPreferences(updated);
  };
  
  const getSeverityIcon = (severity: AppNotification['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={18} className="text-rose-600" />;
      case 'warning':
        return <AlertTriangle size={18} className="text-amber-600" />;
      case 'info':
        return <Info size={18} className="text-blue-600" />;
      default:
        return <Bell size={18} className="text-slate-600" />;
    }
  };
  
  const getSeverityColor = (severity: AppNotification['severity']) => {
    switch (severity) {
      case 'error':
        return 'bg-rose-50 border-rose-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      case 'info':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-notification flex items-end sm:items-center justify-center p-0 sm:p-2 md:p-4 lg:p-6 overflow-x-hidden">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl rounded-t-xl sm:rounded-xl shadow-2xl relative z-10 flex flex-col max-h-[90vh] max-w-full animate-slide-up-bottom sm:animate-scale-in"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden" />
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-slate-700" />
            <h2 id="notification-title" className="text-base sm:text-lg font-bold text-slate-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-emerald-600 text-white text-[11px] font-bold rounded-full">{unreadCount}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPreferences(!showPreferences)} className="min-w-[44px] min-h-[44px] text-slate-600 hover:bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Preferences">
              <CheckCircle2 size={20} />
            </button>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] text-slate-600 hover:bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>
        
        {/* Preferences Panel */}
        {showPreferences && (
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50 flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Notification Preferences</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between min-h-[44px] px-3 bg-white rounded-lg cursor-pointer">
                <span className="text-sm text-slate-700">Budget Alerts</span>
                <input type="checkbox" checked={preferences.budgetAlerts} onChange={(e) => handlePreferenceChange('budgetAlerts', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              </label>
              <label className="flex items-center justify-between min-h-[44px] px-3 bg-white rounded-lg cursor-pointer">
                <span className="text-sm text-slate-700">Settlement Reminders</span>
                <input type="checkbox" checked={preferences.settlementReminders} onChange={(e) => handlePreferenceChange('settlementReminders', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              </label>
              <label className="flex items-center justify-between min-h-[44px] px-3 bg-white rounded-lg cursor-pointer">
                <span className="text-sm text-slate-700">Daily Reminders</span>
                <input type="checkbox" checked={preferences.dailyReminders} onChange={(e) => handlePreferenceChange('dailyReminders', e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              </label>
            </div>
          </div>
        )}
        
        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-2">
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell size={48} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No notifications</p>
            </div>
          ) : (
            <>
              {unreadCount > 0 && (
                <button onClick={markAllAppNotificationsRead} className="w-full text-xs text-emerald-600 font-medium mb-2 text-right min-h-[36px] hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500">Mark all as read</button>
              )}
              {notifications.map(notification => (
                <div key={notification.id} className={`p-3.5 rounded-xl border ${getSeverityColor(notification.severity)} ${!notification.read ? 'ring-2 ring-emerald-500/20' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">{getSeverityIcon(notification.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h4 className={`text-sm font-semibold ${notification.read ? 'text-slate-600' : 'text-slate-900'}`}>{notification.title}</h4>
                          <p className={`text-xs mt-1 ${notification.read ? 'text-slate-500' : 'text-slate-700'}`}>{notification.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{new Date(notification.timestamp).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!notification.read && (
                            <button onClick={() => handleMarkAsRead(notification.id)} className="min-w-[36px] min-h-[36px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Mark as read">
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button onClick={() => handleDismiss(notification.id)} className="min-w-[36px] min-h-[36px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label="Dismiss">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(NotificationCenter);

