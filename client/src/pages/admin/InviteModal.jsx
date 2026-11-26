import { useEffect, useRef, useState } from 'react';
import { Field, FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

const ROLES = ['SYSTEM_ADMINISTRATOR', 'JUDICIAL_POLICE_OFFICER', 'EXAMINING_MAGISTRATE'];
const MAX_ACCOUNTS = 25;

// Batch account creation. Closing the dialog discards what was typed.
export default function InviteModal({ onClose, onCreated }) {
  const { t } = useLanguage();
  const nextKey = useRef(0);
  const blank = () => ({
    key: nextKey.current++, fullName: '', email: '', role: '', organizationalUnitId: '', preferredLanguage: 'EN',
  });
  const [rows, setRows] = useState(() => [blank()]);
  const [units, setUnits] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/units').then((data) => setUnits(data.units)).catch((error) => setFormError(error.code));
  }, []);

  const update = (key, field) => (event) => {
    const { value } = event.target;
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  };

  function validate() {
    const found = {};
    const seen = new Set();
    rows.forEach((row) => {
      const problems = {};
      const email = row.email.trim().toLowerCase();
      if (!row.fullName.trim()) problems.fullName = 'FULL_NAME_REQUIRED';
      if (!email) problems.email = 'EMAIL_REQUIRED';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.email = 'EMAIL_INVALID';
      else if (seen.has(email)) problems.email = 'EMAIL_DUPLICATED_IN_BATCH';
      seen.add(email);
      if (!row.role) problems.role = 'ROLE_REQUIRED';
      if (Object.keys(problems).length) found[row.key] = problems;
    });
    return found;
  }

  async function submit(event) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const data = await api.post('/admin/invitations', {
        accounts: rows.map(({ key, organizationalUnitId, ...row }) => ({
          ...row, organizationalUnitId: organizationalUnitId || null,
        })),
      });
      onCreated(data.created);
    } catch (error) {
      // The server reports problems by row position.
      setErrors(Object.fromEntries(error.rows.map((r) => [rows[r.index].key, r.errors])));
      setFormError(error.code);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="invite-title"
        className="w-full max-w-4xl border border-neutral-400 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-neutral-300 p-6">
          <h2 id="invite-title" className="text-xl font-semibold">{t('invite.title')}</h2>
          <button type="button" className="text-xl leading-none" onClick={onClose}
            aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="xmark" />
          </button>
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto p-6">
          {rows.map((row, index) => {
            const rowErrors = errors[row.key] || {};
            return (
              <fieldset key={row.key} className="border-b border-neutral-200 pb-4 last-of-type:border-0">
                <legend className="sr-only">{t('invite.account', { number: index + 1 })}</legend>
                <div className="grid grid-cols-[1fr_36px] items-start gap-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Field label={t('invite.fullName')} error={rowErrors.fullName}>
                      {(props) => <input {...props} autoFocus={index === rows.length - 1} maxLength={150}
                        autoComplete="off" value={row.fullName} onChange={update(row.key, 'fullName')} />}
                    </Field>
                    <Field label={t('invite.email')} error={rowErrors.email}>
                      {(props) => <input {...props} type="email" autoComplete="off" placeholder="name@example.cm"
                        value={row.email} onChange={update(row.key, 'email')} />}
                    </Field>
                    <Field label={t('invite.role')} error={rowErrors.role}>
                      {(props) => (
                        <select {...props} value={row.role} onChange={update(row.key, 'role')}>
                          <option value="">{t('invite.chooseRole')}</option>
                          {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label={t('invite.unit')} error={rowErrors.organizationalUnitId}>
                      {(props) => (
                        <select {...props} value={row.organizationalUnitId} onChange={update(row.key, 'organizationalUnitId')}>
                          <option value="">{t('invite.noUnit')}</option>
                          {units.map((unit) => <option key={unit.unitId} value={unit.unitId}>{unit.unitName}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label={t('invite.preferredLanguage')} error={rowErrors.preferredLanguage}>
                      {(props) => (
                        <select {...props} value={row.preferredLanguage} onChange={update(row.key, 'preferredLanguage')}>
                          <option value="EN">{t('language.EN')}</option>
                          <option value="FR">{t('language.FR')}</option>
                        </select>
                      )}
                    </Field>
                  </div>
                  <button type="button" className={`mt-7 h-9 w-9 text-xl ${index === 0 ? 'invisible' : ''}`}
                    onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                    aria-label={t('invite.remove')} title={t('invite.remove')}>
                    <Icon name="xmark" />
                  </button>
                </div>
              </fieldset>
            );
          })}
          <button type="button" className="text-action" disabled={rows.length >= MAX_ACCOUNTS}
            onClick={() => setRows([...rows, blank()])}>
            <Icon name="plus" className="mr-1.5" />{t('invite.add')}
          </button>
          <FormError code={formError} />
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-300 bg-neutral-50 p-4">
          <button type="button" className="button-secondary" onClick={onClose}>{t('invite.cancel')}</button>
          <button type="submit" className="button-primary" disabled={busy}>
            <Icon name={busy ? 'spinner fa-spin' : 'user-plus'} />{t('invite.submit')}
          </button>
        </div>
      </form>
    </div>
  );
}
