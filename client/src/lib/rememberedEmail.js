// "Remember me" keeps the email address only, on this computer. The password is
// never stored and the session length does not change.
const KEY = 'ccts.email';

export const rememberedEmail = {
  get() {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  },
  set(email) {
    try {
      if (email) localStorage.setItem(KEY, email);
      else localStorage.removeItem(KEY);
    } catch { /* storage blocked: sign-in still works */ }
  },
};
