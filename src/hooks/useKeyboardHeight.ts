import { useEffect, useState } from 'react';
import { isNative } from '../lib/platform';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isNative) return;

    let willShowHandle: ReturnType<typeof import('@capacitor/keyboard').Keyboard.addListener> | undefined;
    let willHideHandle: ReturnType<typeof import('@capacitor/keyboard').Keyboard.addListener> | undefined;

    import('@capacitor/keyboard').then(({ Keyboard }) => {
      willShowHandle = Keyboard.addListener('keyboardWillShow', (info) => {
        setKeyboardHeight(info.keyboardHeight);
      });
      willHideHandle = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardHeight(0);
      });
    });

    return () => {
      willShowHandle?.then((h) => h.remove());
      willHideHandle?.then((h) => h.remove());
    };
  }, []);

  return keyboardHeight;
}
