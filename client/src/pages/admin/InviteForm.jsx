import { useEffect, useRef, useState } from 'react';
import { Field, FormError, Icon, Notice } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

const ROLES = ['SYSTEM_ADMINISTRATOR', 'JUDICIAL_POLICE_OFFICER', 'EXAMINING_MAGISTRATE'];
const MAX_ACCOUNTS = 25;

export default function InviteForm({ onCreated }) {
  const { t } = useLanguage();
  const nextKey = useRef(0);
  const blank = () => ({
    key: nextKey.current++, fullName: '', email: '', role: '', organizationalUnitId: '', preferredLanguage: 'EN',
  });
  const [rows, setRows] = useState(() => [blank()]);
  const [units, setUnits] = useState([]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [result, setResult] = useState(null);
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
    setResult(null);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const data = await api.post('/admin/invitations', {
        accounts: rows.map(({ key, organizationalUnitId, ...row }) => ({
          ...row, organizationalUnitId: organizationalUnitId || null,
        })),
      });
      setResult(data.created);
      setRows([blank()]);
      onCreated();
    } catch (error) {
      // The server reports problems by row position.
      setErrors(Object.fromEntries(error.rows.map((r) => [rows[r.index].key, r.errors])));
      setFormError(error.code);
    } finally {
      setBusy(false);
    }
  }

  const failed = result?.filter((r) => !r.emailSent) || [];

  return (
    <section className="card p-0">
      <div className="border-b border-neutral-300 px-5 py-4">
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="user-plus" />{t('invite.title')}</h2>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        {rows.map((row, index) => {
          const rowErrors = errors[row.key] || {};
          return (
            <fieldset key={row.key} className="border border-neutral-200 p-4">
              <legend className="px-1 text-sm font-semibold">{t('invite.account', { number: index + 1 })}</legend>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Field label={t('invite.fullName')} error={rowErrors.fullName}>
                  {(props) => <input {...props} maxLength={150} autoComplete="off" value={row.fullName}
                    onChange={update(row.key, 'fullName')} />}
                </Field>
                <Field label={t('invite.email')} error={rowErrors.email}>
                  {(props) => <input {...props} type="email" autoComplete="off" value={row.email}
                    onChange={update(row.key, 'email')} />}
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
              {rows.length > 1 && (
                <button type="button" className="btn mt-3" onClick={() => setRows(rows.filter((r) => r.key !== row.key))}>
                  <Icon name="user-minus" />{t('invite.remove')}
                </button>
              )}
            </fieldset>
          );
        })}
        <FormError code={formError} />
        {result && (failed.length === 0
          ? <Notice icon="circle-check">{t('invite.success', { count: result.length })}</Notice>
          : <Notice icon="triangle-exclamation">{t('invite.partial', { emails: failed.map((f) => f.email).join(', ') })}</Notice>)}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-action" disabled={rows.length >= MAX_ACCOUNTS}
            onClick={() => setRows([...rows, blank()])}>
            <Icon name="plus" />{t('invite.add')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name={busy ? 'spinner fa-spin' : 'paper-plane'} />{t('invite.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}
