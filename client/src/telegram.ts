import { useEffect } from 'react';

export interface TgWebApp {
  initData: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready: () => void;
  expand: () => void;
  MainButton: {
    setText: (t: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

export const tg: TgWebApp | undefined = (window as any).Telegram?.WebApp;

// Fuori da Telegram (browser di sviluppo) platform è "unknown":
// in quel caso usiamo i fallback in-page al posto di MainButton/BackButton.
export const isTelegram = !!tg && tg.platform !== 'unknown';

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  document.documentElement.dataset.scheme = tg.colorScheme;
}

export const haptic = {
  light: () => tg?.HapticFeedback?.impactOccurred('light'),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  error: () => tg?.HapticFeedback?.notificationOccurred('error'),
};

export function useBackButton(onBack: () => void, enabled = true): boolean {
  useEffect(() => {
    if (!enabled || !isTelegram || !tg) return;
    const bb = tg.BackButton;
    bb.show();
    bb.onClick(onBack);
    return () => {
      bb.offClick(onBack);
      bb.hide();
    };
  }, [onBack, enabled]);
  return enabled && isTelegram;
}
