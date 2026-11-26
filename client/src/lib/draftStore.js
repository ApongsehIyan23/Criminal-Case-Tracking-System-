const PREFIX = 'ccts.draft.';
const keyFor = (owner, name) => `${PREFIX}${owner}.${name}`;

const draftKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith(PREFIX));

export const draftStore = {
  read(owner, name) {
    try {
      return JSON.parse(sessionStorage.getItem(keyFor(owner, name)));
    } catch {
      return null;
    }
  },
  write(owner, name, value) {
    try {
      sessionStorage.setItem(keyFor(owner, name), JSON.stringify(value));
    } catch { /* storage full or blocked: the form still works */ }
  },
  remove: (owner, name) => sessionStorage.removeItem(keyFor(owner, name)),
  clearAll: () => draftKeys().forEach((key) => sessionStorage.removeItem(key)),
  // On a shared computer, signing in must not expose someone else's typing.
  keepOnly(owner) {
    draftKeys()
      .filter((key) => !key.startsWith(keyFor(owner, '')) && !key.startsWith(keyFor('guest', '')))
      .forEach((key) => sessionStorage.removeItem(key));
  },
};
