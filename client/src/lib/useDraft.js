// State that survives a page refresh. Drafts live in sessionStorage, so they
// disappear when the tab closes, and are filed under the signed-in user. Never
// use this for passwords or files.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { draftStore } from './draftStore';

export function useDraft(name, initial) {
  const { user } = useAuth();
  const owner = user?.userId || 'guest';
  const fresh = () => (typeof initial === 'function' ? initial() : initial);
  const [value, setValue] = useState(() => draftStore.read(owner, name) ?? fresh());

  useEffect(() => { draftStore.write(owner, name, value); }, [owner, name, value]);

  // Forget the draft and start again, for example after a successful save.
  const reset = useCallback(() => {
    draftStore.remove(owner, name);
    setValue(fresh());
  }, [owner, name]); // eslint-disable-line react-hooks/exhaustive-deps

  return [value, setValue, reset];
}
