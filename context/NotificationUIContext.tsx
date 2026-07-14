import React, { createContext, useContext, useState, useCallback } from 'react';

interface NotificationUI {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const NotificationUIContext = createContext<NotificationUI>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

export const NotificationUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <NotificationUIContext.Provider value={{ isOpen, open, close }}>
      {children}
    </NotificationUIContext.Provider>
  );
};

export const useNotificationUI = () => useContext(NotificationUIContext);
