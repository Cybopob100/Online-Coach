// Версия для веба. Alert из React Native в браузере ничего не показывает,
// а window.alert/confirm блокируются во встроенных окнах, поэтому рисуем свой диалог.
// На телефоне используется alert.native.ts.
type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };

const DARK = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
const C = DARK
  ? { bg: '#1A1A1A', text: '#F2F2F2', muted: '#9A9A9A', border: '#2A2A2A', accent: '#F05A28', danger: '#E5584A' }
  : { bg: '#FFFFFF', text: '#141414', muted: '#6B6B6B', border: '#E2E0D9', accent: '#D9481C', danger: '#C0392B' };

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const list: AlertButton[] = buttons && buttons.length ? buttons : [{ text: 'OK' }];

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '9999', background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });

  const box = document.createElement('div');
  Object.assign(box.style, {
    background: C.bg, color: C.text, borderRadius: '16px', padding: '20px', width: '100%',
    maxWidth: '320px', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: '10px',
  });

  const h = document.createElement('div');
  h.textContent = title;
  Object.assign(h.style, { fontSize: '17px', fontWeight: '700', whiteSpace: 'pre-line' });
  box.appendChild(h);

  if (message) {
    const p = document.createElement('div');
    p.textContent = message;
    Object.assign(p.style, { fontSize: '15px', color: C.muted, lineHeight: '1.4', whiteSpace: 'pre-line' });
    box.appendChild(p);
  }

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap' });

  const close = () => overlay.remove();
  list.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.text ?? 'OK';
    const primary = b.style !== 'cancel' && i === list.length - 1;
    const color = b.style === 'destructive' ? C.danger : primary ? '#FFFFFF' : C.text;
    Object.assign(btn.style, {
      minHeight: '44px', padding: '0 18px', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer',
      border: `1.5px solid ${b.style === 'destructive' ? C.danger : primary ? C.accent : C.border}`,
      background: primary && b.style !== 'destructive' ? C.accent : 'transparent', color,
    });
    btn.onclick = () => {
      close();
      b.onPress?.();
    };
    row.appendChild(btn);
  });
  box.appendChild(row);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  (row.lastChild as HTMLButtonElement | null)?.focus();
}

/** Диалог «Да / Нет», возвращает выбор. */
export function confirmDialog(title: string, message: string, okText: string, cancelText: string) {
  return new Promise<boolean>((resolve) =>
    showAlert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: okText, onPress: () => resolve(true) },
    ]),
  );
}
