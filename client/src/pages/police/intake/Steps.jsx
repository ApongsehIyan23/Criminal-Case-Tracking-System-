// The form fields of steps 1 to 3 and the review of step 4.
import { Field, FormError } from '../../../components/ui';
import { useLanguage } from '../../../context/LanguageContext';
import { PlusIcon } from './icons';
import { MAX_PARTICIPANTS, PARTICIPANT_ROLES, person } from './model';

const offenseName = (offense, language) => (language === 'FR' ? offense.labelFr : offense.labelEn);

export function IncidentStep({ form, change, errors, reference }) {
  const { t, language } = useLanguage();
  const set = (field) => (event) => change({ [field]: event.target.value });
  return (
    <div className="grid grid-cols-2 gap-5">
      <Field label={t('intake.incidentTitle')} error={errors.fields.incidentTitle}>
        {(props) => <input {...props} maxLength={200} placeholder={t('wizard.placeholders.title')}
          value={form.incidentTitle} onChange={set('incidentTitle')} />}
      </Field>
      <Field label={t('intake.offense')} error={errors.fields.offenseCategoryId}>
        {(props) => (
          <select {...props} data-empty={!form.offenseCategoryId} value={form.offenseCategoryId}
            onChange={set('offenseCategoryId')}>
            <option value="">{t(reference ? 'intake.selectOffense' : 'common.loading')}</option>
            {reference?.offenses.map((o) => (
              <option key={o.offenseCategoryId} value={o.offenseCategoryId}>{offenseName(o, language)}</option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('intake.date')} error={errors.fields.incidentDatetime}>
        {(props) => <input {...props} type="datetime-local" data-empty={!form.incidentDatetime}
          value={form.incidentDatetime} onChange={set('incidentDatetime')} />}
      </Field>
      <Field label={t('intake.station')} error={errors.fields.originatingUnitId}>
        {(props) => (
          <select {...props} data-empty={!form.originatingUnitId} value={form.originatingUnitId}
            onChange={set('originatingUnitId')}>
            <option value="">{t(reference ? 'intake.selectStation' : 'common.loading')}</option>
            {reference?.units.map((u) => <option key={u.unitId} value={u.unitId}>{u.unitName}</option>)}
          </select>
        )}
      </Field>
    </div>
  );
}

export function NarrativeStep({ form, change, errors }) {
  const { t } = useLanguage();
  return (
    <Field label={t('intake.narrative')} error={errors.fields.narrative}>
      {(props) => <textarea {...props} value={form.narrative} placeholder={t('intake.narrativeHint')}
        onChange={(e) => change({ narrative: e.target.value })} />}
    </Field>
  );
}

export function ParticipantsStep({ form, setForm, errors }) {
  const { t } = useLanguage();
  const setPerson = (key, changes) => setForm((f) => ({
    ...f, participants: f.participants.map((p) => (p.key === key ? { ...p, ...changes } : p)),
  }));
  const add = () => setForm((f) => ({ ...f, participants: [...f.participants, person()] }));
  const remove = (key) => setForm((f) => ({ ...f, participants: f.participants.filter((p) => p.key !== key) }));

  return (
    <div>
      <div className="space-y-4">
        {form.participants.map((p, index) => {
          const rowErrors = errors.rows[p.key] || {};
          const textField = (name, label, placeholder, extra) => (
            <Field label={t(label)} error={rowErrors[name]}>
              {(props) => <input {...props} {...extra} autoComplete="off" placeholder={t(placeholder)} value={p[name]}
                onChange={(e) => setPerson(p.key, { [name]: e.target.value })} />}
            </Field>
          );
          return (
            <fieldset key={p.key} className="rounded-[10px] border-[1.5px] border-[#e5e7eb] p-5">
              <legend className="sr-only">{t('intake.participant', { number: index + 1 })}</legend>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('intake.role')} error={rowErrors.role}>
                  {(props) => (
                    <select {...props} value={p.role}
                      onChange={(e) => setPerson(p.key, { role: e.target.value, detained: false })}>
                      {PARTICIPANT_ROLES.map((role) => <option key={role} value={role}>{t(`participantRole.${role}`)}</option>)}
                    </select>
                  )}
                </Field>
                {textField('fullName', 'intake.fullName', 'wizard.placeholders.fullName', { maxLength: 150 })}
                {textField('nationalId', 'intake.nationalId', 'wizard.placeholders.nationalId', { maxLength: 30 })}
                {textField('phone', 'intake.phone', 'wizard.placeholders.phone', { type: 'tel', maxLength: 25 })}
              </div>
              {/* Only a suspect can be detained, and only a detention starts a custody timer. */}
              {(p.role === 'SUSPECT' || form.participants.length > 1) && (
                <div className="mt-4 flex items-center justify-between gap-4">
                  {p.role === 'SUSPECT' ? (
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#374151]">
                      <input type="checkbox" className="h-4 w-4 cursor-pointer accent-[#2563eb]" checked={p.detained}
                        onChange={(e) => setPerson(p.key, { detained: e.target.checked })} />
                      {t('intake.detained')}
                    </label>
                  ) : <span />}
                  {form.participants.length > 1 && (
                    <button type="button" className="case-link" onClick={() => remove(p.key)}>{t('intake.remove')}</button>
                  )}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
      <FormError code={errors.fields.participants} className="mt-3" />
      <button type="button" className="mt-4 flex items-center gap-1.5 rounded-lg border-[1.5px] border-[#2563eb] bg-white px-[18px] py-2.5 text-[13px] font-semibold text-[#2563eb] hover:bg-[#eff6ff] disabled:opacity-50"
        disabled={form.participants.length >= MAX_PARTICIPANTS} onClick={add}>
        <PlusIcon />{t('intake.add')}
      </button>
    </div>
  );
}

const Value = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs text-[#6b7280]">{label}</dt>
    <dd className="mt-0.5 break-words text-[13px] text-[#1a1a1a]">{children || '—'}</dd>
  </div>
);

function Section({ title, onEdit, children }) {
  const { t } = useLanguage();
  return (
    <section className="border-b border-[#e5e7eb] px-5 py-4 last:border-b-0" aria-label={title}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1a2744]">{title}</h3>
        <button type="button" className="case-link !text-xs" aria-label={t('wizard.editSection', { section: title })}
          onClick={onEdit}>
          {t('wizard.edit')}
        </button>
      </div>
      {children}
    </section>
  );
}

export function ReviewStep({ form, reference, goTo }) {
  const { t, language } = useLanguage();
  const offense = reference?.offenses.find((o) => o.offenseCategoryId === form.offenseCategoryId);
  const unit = reference?.units.find((u) => u.unitId === form.originatingUnitId);
  // Shown as typed (Cameroon time), without converting to this computer's zone.
  const when = form.incidentDatetime && new Intl.DateTimeFormat(language === 'FR' ? 'fr-FR' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC',
  }).format(new Date(`${form.incidentDatetime}:00Z`));

  return (
    <div className="overflow-hidden rounded-[10px] border-[1.5px] border-[#e5e7eb]">
      <Section title={t('wizard.steps.incident')} onEdit={() => goTo(1)}>
        <dl className="grid grid-cols-2 gap-2">
          <Value label={t('intake.incidentTitle')}>{form.incidentTitle}</Value>
          <Value label={t('intake.offense')}>{offense && offenseName(offense, language)}</Value>
          <Value label={t('wizard.review.dateTime')}>{when}</Value>
          <Value label={t('wizard.review.station')}>{unit?.unitName}</Value>
        </dl>
      </Section>
      <Section title={t('wizard.steps.narrative')} onEdit={() => goTo(2)}>
        <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-[13px] text-[#1a1a1a]">
          {form.narrative.trim() || '—'}
        </p>
      </Section>
      <Section title={t('wizard.review.participants')} onEdit={() => goTo(3)}>
        <ul className="space-y-3">
          {form.participants.map((p) => (
            <li key={p.key}>
              <dl className="grid grid-cols-4 gap-2">
                <Value label={t('wizard.review.role')}>{t(`participantRole.${p.role}`)}</Value>
                <Value label={t('intake.fullName')}>{p.fullName}</Value>
                <Value label={t('wizard.review.nationalId')}>{p.nationalId}</Value>
                <Value label={t('docket.custodyStatus')}>{t(p.detained ? 'wizard.yes' : 'wizard.no')}</Value>
                {p.phone.trim() && <Value label={t('intake.phone')}>{p.phone}</Value>}
              </dl>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
