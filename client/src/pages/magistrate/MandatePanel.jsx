// M3: one binding ruling per suspect. Issued rulings are shown read-only.
import { useState } from 'react';
import MandateRecord, { DECISION_ICONS } from '../../components/MandateRecord';
import { Field, FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';

const DECISIONS = ['RELEASE', 'EXTEND_CUSTODY', 'PRE_TRIAL_DETENTION'];
const BLANK = { participantId: '', decision: '', notes: '' };
const inCustody = (p) => ['ACTIVE', 'EXTENDED', 'EXPIRED'].includes(p?.timerStatus);

function RulingForm({ data, pending, onIssued }) {
  const { t } = useLanguage();
  const { case: file } = data;
  const [draft, setDraft, resetDraft] = useDraft(`magistrate.mandate.${file.caseId}`, BLANK);
  const [confirming, setConfirming] = useDraft(`magistrate.confirm.${file.caseId}`, false);
  const [signed, setSigned] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  // With a single suspect left there is nothing to choose.
  const suspect = pending.find((p) => p.participantId === draft.participantId) || (pending.length === 1 ? pending[0] : null);
  const change = (changes) => {
    setDraft((d) => ({ ...d, ...changes }));
    setErrors({});
  };

  function review(event) {
    event.preventDefault();
    const found = {};
    if (!suspect) found.participantId = 'SUSPECT_REQUIRED';
    if (!draft.decision) found.decision = 'DECISION_REQUIRED';
    else if (draft.decision === 'EXTEND_CUSTODY' && suspect && !inCustody(suspect)) found.decision = 'EXTENSION_NEEDS_CUSTODY';
    if (!draft.notes.trim()) found.rulingNotes = 'RULING_NOTES_REQUIRED';
    if (signed && !/\.(jpe?g|png|pdf)$/i.test(signed.name)) found.document = 'FILE_TYPE_NOT_ALLOWED';
    else if (signed && signed.size > data.documentLimitBytes) found.document = 'DOCUMENT_TOO_LARGE';
    setErrors(found);
    setFormError(null);
    if (!Object.keys(found).length) setConfirming(true);
  }

  async function issue() {
    setBusy(true);
    const body = new FormData();
    body.append('participantId', suspect.participantId);
    body.append('decision', draft.decision);
    body.append('rulingNotes', draft.notes);
    if (signed) body.append('document', signed);
    try {
      await api.post(`/cases/${file.caseId}/mandate`, body);
      setConfirming(false);
      resetDraft();
      setSigned(null);
      onIssued();
    } catch (error) {
      setConfirming(false);
      setErrors(error.fields);
      setFormError(error.code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={review} noValidate className="border border-neutral-400 bg-white p-6">
      <h2 className="text-lg font-semibold"><Icon name="file-signature" className="mr-2" />{t('mandate.title')}</h2>
      <p className="mt-1.5 text-sm text-neutral-600">{t('mandate.intro')}</p>
      <div className="mt-5 max-w-xl">
        <Field label={t('mandate.suspect')} error={errors.participantId}>
          {(props) => (
            <select {...props} value={suspect?.participantId || ''} onChange={(e) => change({ participantId: e.target.value })}>
              <option value="">{t('mandate.selectSuspect')}</option>
              {pending.map((p) => <option key={p.participantId} value={p.participantId}>{p.fullName}{p.nationalId ? ` (${p.nationalId})` : ''}</option>)}
            </select>
          )}
        </Field>
      </div>
      <fieldset className="mt-5">
        <legend className="field-label">{t('mandate.decision')}</legend>
        <div className="grid grid-cols-3 gap-3">
          {DECISIONS.map((value) => (
            <button key={value} type="button" aria-pressed={draft.decision === value}
              disabled={value === 'EXTEND_CUSTODY' && Boolean(suspect) && !inCustody(suspect)}
              onClick={() => change({ decision: value })}
              className={`border p-4 text-left disabled:bg-neutral-50 disabled:text-neutral-400 ${
                draft.decision === value ? 'border-neutral-900 bg-neutral-100' : errors.decision ? 'border-red-600' : 'border-neutral-300'}`}>
              <div className="font-semibold"><Icon name={DECISION_ICONS[value]} className="mr-2" />{t(`decision.${value}`)}</div>
              <p className="mt-2 text-sm leading-5">{t(`mandate.help.${value}`)}</p>
            </button>
          ))}
        </div>
      </fieldset>
      {errors.decision && <p role="alert" className="mt-2 text-sm text-red-700">{t(`errors.${errors.decision}`)}</p>}
      <div className="mt-5">
        <Field label={t('mandate.notes')} error={errors.rulingNotes}>
          {(props) => <textarea {...props} className={`${props.className} h-auto min-h-28 resize-y py-3`} maxLength={10000}
            placeholder={t('intake.narrativeHint')} value={draft.notes} onChange={(e) => change({ notes: e.target.value })} />}
        </Field>
      </div>
      <div className="mt-5 max-w-xl">
        <Field label={t('mandate.upload')} error={errors.document}>
          {(props) => <input {...props} type="file" className={`${props.className} py-1.5`} accept=".jpg,.jpeg,.png,.pdf"
            onChange={(e) => { setSigned(e.target.files?.[0] || null); setErrors({}); }} />}
        </Field>
        <p className="mt-1.5 text-xs text-neutral-500">{t('mandate.uploadRules')}</p>
      </div>
      {formError !== 'VALIDATION_FAILED' && <FormError code={formError} className="mt-3" />}
      <div className="mt-6 flex justify-end">
        <button type="submit" className="button-primary"><Icon name="gavel" />{t('mandate.issue')}</button>
      </div>

      {confirming && suspect && draft.decision && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="mandate-confirm" className="w-full max-w-lg border border-neutral-400 bg-white shadow-xl">
            <div className="border-b border-neutral-300 p-5">
              <h3 id="mandate-confirm" className="text-lg font-semibold"><Icon name="gavel" className="mr-2" />{t('mandate.confirmTitle')}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-600">{t('mandate.warning')}</p>
            </div>
            <dl className="grid grid-cols-[170px_1fr] gap-y-3 p-5 text-sm">
              <dt className="text-neutral-500">{t('register.columns.caseId')}</dt><dd className="font-mono font-semibold">{file.caseId}</dd>
              <dt className="text-neutral-500">{t('mandate.suspect')}</dt><dd className="font-semibold">{suspect.fullName}</dd>
              <dt className="text-neutral-500">{t('docket.decision')}</dt><dd className="font-semibold">{t(`decision.${draft.decision}`)}</dd>
              <dt className="text-neutral-500">{t('docket.signedDocument')}</dt><dd className="break-all">{signed?.name || t('mandate.noFile')}</dd>
            </dl>
            <div className="flex justify-end gap-3 border-t border-neutral-300 bg-neutral-50 p-4">
              <button type="button" className="button-secondary" onClick={() => setConfirming(false)}>{t('invite.cancel')}</button>
              <button type="button" className="button-primary" disabled={busy} onClick={issue}>
                <Icon name={busy ? 'spinner fa-spin' : 'gavel'} />{t('mandate.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export default function MandatePanel({ data, onIssued }) {
  const { t } = useLanguage();
  const ruled = new Set(data.mandates.map((m) => m.participantId));
  const pending = data.participants.filter((p) => p.needsRuling && !ruled.has(p.participantId));
  const open = data.case.status === 'TRANSMITTED_TO_MAGISTRATE';

  return (
    <div className="mt-6 space-y-4">
      {data.mandates.map((mandate) => (
        <MandateRecord key={mandate.mandateId} caseId={data.case.caseId} mandate={mandate} title={t('mandate.record')} />
      ))}
      {/* Remounted after each ruling, so the next one starts with an empty form. */}
      {open && pending.length > 0 && (
        <RulingForm key={data.mandates.length} data={data} pending={pending} onIssued={onIssued} />
      )}
      {open && !pending.length && (
        <p className="border border-neutral-300 bg-white p-5 text-sm">{t('mandate.noSuspect')}</p>
      )}
    </div>
  );
}
