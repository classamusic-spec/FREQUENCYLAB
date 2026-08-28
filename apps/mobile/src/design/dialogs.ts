import { Alert, Platform } from 'react-native';

/**
 * Cross-platform dialogs.
 *
 * `react-native-web` ships `Alert` as `class Alert { static alert() {} }` — a
 * literal no-op. Every `Alert.alert` in the app therefore did nothing at all in
 * the browser build, which silently removed the confirmation step from
 * destructive actions: "Delete all data" asked nothing and deleted nothing,
 * because the delete lived in a button handler the dialog never rendered.
 *
 * These two helpers are the only way the app should ask or tell. Both are
 * promise-based so a destructive action reads as a single linear flow rather
 * than a callback that may never fire.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label for the action that proceeds. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive on platforms that distinguish. */
  destructive?: boolean;
}

/**
 * Asks the user to confirm, resolving true only if they actively agreed.
 *
 * Dismissal resolves false on every platform: a dialog swiped away, or a
 * `window.confirm` cancelled, must never be read as consent.
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  const { title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive } = options;

  if (Platform.OS === 'web') {
    // `window.confirm` has no custom labels, so the title carries the question
    // and the message the consequence.
    const text = message ? `${title}\n\n${message}` : title;
    const agreed = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(text)
      : false;
    return Promise.resolve(agreed);
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

/** Tells the user something, with no decision attached. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
