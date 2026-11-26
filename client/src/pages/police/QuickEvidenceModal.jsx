import { useEffect, useState } from 'react';
import { Field, FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { CategoryField, FileField, useEvidenceUpload } from './evidence';

// `draft` holds the chosen case and category, so they survive a refresh.
export default function QuickEvidenceModal({ draft, onChange, onClose, onUploaded }) {
  const { t } = useLanguage();
  const upload = useEvidenceUpload();
  const [cases, setCases] = useState(null);

  useEffect(() => {
    api.get('/cases/open').then((r) => setCases(r.items)).catch(() => setCases([]));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (await upload.submit(draft.caseId, draft.category)) onUploaded();
  }

  return (
    <div className="modal-backdrop">
      <form onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="quick-title"
        className="w-full max-w-lg border border-neutral-400 bg-white shadow-xl">
        <div className="flex justify-between border-b border-neutral-300 p-5">
          <h2 id="quick-title" className="text-lg font-semibold"><Icon name="cloud-arrow-up" className="mr-2" />{t('evidence.quickTitle')}</h2>
          <button type="button" className="text-xl" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            <Icon name="xmark" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Field label={t('evidence.activeCase')} error={upload.errors.caseId}>
            {(props) => (
              <select {...props} value={draft.caseId} onChange={(e) => onChange({ ...draft, caseId: e.target.value })}>
                <option value="">{t(cases ? 'evidence.selectCase' : 'common.loading')}</option>
                {(cases || []).map((c) => <option key={c.caseId} value={c.caseId}>{c.caseId} — {c.incidentTitle}</option>)}
              </select>
            )}
          </Field>
          <CategoryField value={draft.category} error={upload.errors.category}
            onChange={(category) => onChange({ ...draft, category })} />
          <FileField upload={upload} />
          <p className="text-xs text-neutral-500">{t('evidence.rules')}</p>
          {upload.formError !== 'VALIDATION_FAILED' && <FormError code={upload.formError} />}
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-300 bg-neutral-50 p-4">
          <button type="button" className="button-secondary" onClick={onClose}>{t('invite.cancel')}</button>
          <button type="submit" className="button-primary" disabled={upload.busy}>
            <Icon name={upload.busy ? 'spinner fa-spin' : 'cloud-arrow-up'} />{t('evidence.upload')}
          </button>
        </div>
      </form>
    </div>
  );
}
