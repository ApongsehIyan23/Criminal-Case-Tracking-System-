// P2: digital case initiation and participant registration. Everything typed is
// kept as a draft until the case is saved or the officer cancels.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Field, FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';

const ROLES = ['SUSPECT', 'VICTIM', 'WITNESS'];
const person = (role) => ({ key: crypto.randomUUID(), role, fullName: '', nationalId: '', phone: '', detained: false });
const emptyCase = () => ({
  incidentTitle: '', offenseCategoryId: '', incidentDatetime: '', originatingUnitId: '', narrative: '',
  participants: [person('SUSPECT')],
});

export default function NewCase() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm, resetForm] = useDraft('police.newCase', emptyCase);
  const [reference, setReference] = useState(null);
  const [errors, setErrors] = useState({ fields: {}, rows: {} });
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/cases/reference').then((data) => {
      setReference(data);
      // Start on the officer's own station when it is one.
      setForm((f) => (f.originatingUnitId || !data.units.some((u) => u.unitId === data.officerUnitId)
        ? f : { ...f, originatingUnitId: data.officerUnitId }));
    }).catch((error) => setFormError(error.code));
  }, [setForm]);

  const set = (field) => (event) => {
    const { value } = event.target;
    setForm((f) => ({ ...f, [field]: value }));
  };
  const setPerson = (key, changes) => setForm((f) => ({
    ...f, participants: f.participants.map((p) => (p.key === key ? { ...p, ...changes } : p)),
  }));

  function validate() {
    const fields = {};
    if (!form.incidentTitle.trim()) fields.incidentTitle = 'INCIDENT_TITLE_REQUIRED';
    if (!form.offenseCategoryId) fields.offenseCategoryId = 'OFFENSE_REQUIRED';
    if (!form.incidentDatetime) fields.incidentDatetime = 'INCIDENT_DATE_REQUIRED';
    if (!form.originatingUnitId) fields.originatingUnitId = 'STATION_REQUIRED';
    const rows = {};
    form.participants.forEach((p) => {
      const problems = {};
      if (!p.fullName.trim()) problems.fullName = 'PARTICIPANT_NAME_REQUIRED';
      if (p.role === 'SUSPECT' && p.detained && !p.nationalId.trim()) problems.nationalId = 'CUSTODY_ID_REQUIRED';
      if (Object.keys(problems).length) rows[p.key] = problems;
    });
    return { fields, rows };
  }

  async function submit(event) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found.fields).length || Object.keys(found.rows).length) return;
    setBusy(true);
    try {
      const { participants, incidentDatetime, ...incident } = form;
      const result = await api.post('/cases', {
        ...incident,
        // Entered times are Cameroon local time (UTC+1, no daylight saving).
        incidentDatetime: `${incidentDatetime}:00+01:00`,
        participants: participants.map(({ key, ...p }) => p),
      });
      resetForm();
      navigate(`/police/cases/${result.caseId}`, { state: { created: result } });
    } catch (error) {
      setErrors({
        fields: error.fields,
        rows: Object.fromEntries(error.rows.map((r) => [form.participants[r.index]?.key, r.errors])),
      });
      setFormError(error.code);
      setBusy(false);
    }
  }

  const cancel = () => { resetForm(); navigate('/police'); };
  const label = (offense) => (language === 'FR' ? offense.labelFr : offense.labelEn);

  return (
    <section className="mx-auto max-w-5xl">
      <Link className="text-action" to="/police"><Icon name="arrow-left" className="mr-1.5" />{t('police.back')}</Link>
      <h1 className="mt-4 text-2xl font-semibold">{t('intake.title')}</h1>
      <form onSubmit={submit} noValidate className="mt-6 space-y-6">
        <div className="border border-neutral-300 bg-white p-6">
          <h2 className="font-semibold"><Icon name="folder-plus" className="mr-2" />{t('intake.incident')}</h2>
          <div className="mt-5 grid grid-cols-2 gap-5">
            <Field label={t('intake.incidentTitle')} error={errors.fields.incidentTitle}>
              {(props) => <input {...props} maxLength={200} value={form.incidentTitle} onChange={set('incidentTitle')} />}
            </Field>
            <Field label={t('intake.offense')} error={errors.fields.offenseCategoryId}>
              {(props) => (
                <select {...props} value={form.offenseCategoryId} onChange={set('offenseCategoryId')}>
                  <option value="">{t(reference ? 'intake.selectOffense' : 'common.loading')}</option>
                  {reference?.offenses.map((o) => <option key={o.offenseCategoryId} value={o.offenseCategoryId}>{label(o)}</option>)}
                </select>
              )}
            </Field>
            <Field label={t('intake.date')} error={errors.fields.incidentDatetime}>
              {(props) => <input {...props} type="datetime-local" value={form.incidentDatetime} onChange={set('incidentDatetime')} />}
            </Field>
            <Field label={t('intake.station')} error={errors.fields.originatingUnitId}>
              {(props) => (
                <select {...props} value={form.originatingUnitId} onChange={set('originatingUnitId')}>
                  <option value="">{t(reference ? 'intake.selectStation' : 'common.loading')}</option>
                  {reference?.units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
                </select>
              )}
            </Field>
            <div className="col-span-2">
              <Field label={t('intake.narrative')} error={errors.fields.narrative}>
                {(props) => <textarea {...props} className={`${props.className} h-auto min-h-28 resize-y py-3`} value={form.narrative}
                  placeholder={t('intake.narrativeHint')} onChange={set('narrative')} />}
              </Field>
            </div>
          </div>
        </div>

        <div className="border border-neutral-300 bg-white p-6">
          <h2 className="font-semibold"><Icon name="users" className="mr-2" />{t('intake.participants')}</h2>
          <div className="mt-5 space-y-5">
            {form.participants.map((p, index) => {
              const rowErrors = errors.rows[p.key] || {};
              return (
                <fieldset key={p.key} className="border border-neutral-300 bg-neutral-50 p-4">
                  <legend className="sr-only">{t('intake.participant', { number: index + 1 })}</legend>
                  <div className="grid grid-cols-4 gap-4">
                    <Field label={t('intake.role')} error={rowErrors.role}>
                      {(props) => (
                        <select {...props} value={p.role}
                          onChange={(e) => setPerson(p.key, { role: e.target.value, detained: false })}>
                          {ROLES.map((role) => <option key={role} value={role}>{t(`participantRole.${role}`)}</option>)}
                        </select>
                      )}
                    </Field>
                    <Field label={t('intake.fullName')} error={rowErrors.fullName}>
                      {(props) => <input {...props} maxLength={150} autoComplete="off" value={p.fullName}
                        onChange={(e) => setPerson(p.key, { fullName: e.target.value })} />}
                    </Field>
                    <Field label={t('intake.nationalId')} error={rowErrors.nationalId}>
                      {(props) => <input {...props} maxLength={30} autoComplete="off" value={p.nationalId}
                        onChange={(e) => setPerson(p.key, { nationalId: e.target.value })} />}
                    </Field>
                    <Field label={t('intake.phone')} error={rowErrors.phone}>
                      {(props) => <input {...props} type="tel" maxLength={25} autoComplete="off" value={p.phone}
                        onChange={(e) => setPerson(p.key, { phone: e.target.value })} />}
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    {p.role === 'SUSPECT' ? (
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input type="checkbox" checked={p.detained} onChange={(e) => setPerson(p.key, { detained: e.target.checked })} />
                        <Icon name="user-lock" />{t('intake.detained')}
                      </label>
                    ) : <span />}
                    {index > 0 && (
                      <button type="button" className="text-action"
                        onClick={() => setForm((f) => ({ ...f, participants: f.participants.filter((x) => x.key !== p.key) }))}>
                        {t('intake.remove')}
                      </button>
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <button type="button" className="button-secondary mt-4"
            onClick={() => setForm((f) => ({ ...f, participants: [...f.participants, person('VICTIM')] }))}>
            <Icon name="plus" />{t('intake.add')}
          </button>
        </div>
        <FormError code={formError} />
        <div className="flex justify-end gap-3">
          <button type="button" className="button-secondary" onClick={cancel}>{t('invite.cancel')}</button>
          <button type="submit" className="button-primary" disabled={busy}>
            <Icon name={busy ? 'spinner fa-spin' : 'folder-plus'} />{t('intake.save')}
          </button>
        </div>
      </form>
    </section>
  );
}
