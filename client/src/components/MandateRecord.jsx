// A signed ruling, read-only. Shown to the magistrate and on the police docket.
import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { api } from '../lib/api';
import { saveBlob } from '../lib/files';
import { FormError, Icon } from './ui';

export const DECISION_ICONS = { RELEASE: 'door-open', EXTEND_CUSTODY: 'clock', PRE_TRIAL_DETENTION: 'building-shield' };

export default function MandateRecord({ caseId, mandate, title }) {
  const { t, formatDateTime } = useLanguage();
  const [error, setError] = useState(null);

  async function download() {
    setError(null);
    try {
      const { blob } = await api.download(`/cases/${caseId}/mandates/${mandate.mandateId}/document`);
      saveBlob(blob, mandate.signedDocumentName);
    } catch (e) {
      setError(e.code);
    }
  }

  return (
    <section className="border border-neutral-500 bg-white p-5">
      <h2 className="flex items-center gap-2 font-semibold"><Icon name="lock" />{title}</h2>
      <dl className="mt-4 grid grid-cols-[200px_1fr] gap-y-2 text-sm">
        <dt className="text-neutral-500">{t('mandate.suspect')}</dt><dd className="font-semibold">{mandate.suspectName}</dd>
        <dt className="text-neutral-500">{t('docket.decision')}</dt>
        <dd className="font-semibold"><Icon name={DECISION_ICONS[mandate.decision]} className="mr-2" />{t(`decision.${mandate.decision}`)}</dd>
        <dt className="text-neutral-500">{t('docket.notes')}</dt><dd className="max-w-3xl whitespace-pre-wrap leading-6">{mandate.rulingNotes}</dd>
        <dt className="text-neutral-500">{t('docket.signedDocument')}</dt>
        <dd>
          {mandate.signedDocumentName ? (
            <button type="button" className="text-action" onClick={download}>
              <Icon name="download" className="mr-1.5" />{mandate.signedDocumentName}
            </button>
          ) : t('mandate.noFile')}
        </dd>
        <dt className="text-neutral-500">{t('docket.issuedBy')}</dt><dd>{mandate.issuedBy}</dd>
        <dt className="text-neutral-500">{t('docket.issuedAt')}</dt><dd>{formatDateTime(mandate.issuedAt)}</dd>
      </dl>
      <FormError code={error} className="mt-3" />
    </section>
  );
}
