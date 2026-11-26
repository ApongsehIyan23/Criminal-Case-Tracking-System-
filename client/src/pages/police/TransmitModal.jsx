// Pre-transmission review: a fresh summary the officer confirms.
import { useEffect, useState } from 'react';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { formatBytes, formatRemaining, useServerNow } from '../../lib/custody';

export default function TransmitModal({ caseId, onClose, onTransmitted }) {
  const { t } = useLanguage();
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const now = useServerNow(review?.serverNow);

  useEffect(() => {
    api.get(`/cases/${caseId}/transmission-review`).then(setReview).catch((e) => setError(e.code));
  }, [caseId]);

  async function transmit() {
    setBusy(true);
    try {
      await api.post(`/cases/${caseId}/transmit`);
      onTransmitted();
    } catch (e) {
      setError(e.code);
      setBusy(false);
    }
  }

  const timers = review?.participants.filter((p) => ['ACTIVE', 'EXTENDED', 'EXPIRED'].includes(p.timerStatus)) || [];
  const bytes = review?.evidence.reduce((sum, e) => sum + e.fileSizeBytes, 0) || 0;

  return (
    <div className="modal-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby="transmit-title"
        className="flex max-h-full w-full max-w-lg flex-col border border-neutral-400 bg-white shadow-xl">
        <div className="border-b border-neutral-300 p-5">
          <h2 id="transmit-title" className="text-lg font-semibold"><Icon name="paper-plane" className="mr-2" />{t('transmit.title')}</h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">{t('transmit.warning')}</p>
        </div>
        <div className="overflow-y-auto p-5">
          {!review && !error && <p className="text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
          {review && (
            <dl className="grid grid-cols-[170px_1fr] gap-y-3 text-sm">
              <dt className="text-neutral-500">{t('register.columns.caseId')}</dt><dd className="font-mono font-semibold">{review.case.caseId}</dd>
              <dt className="text-neutral-500">{t('register.columns.summary')}</dt><dd>{review.case.incidentTitle}</dd>
              <dt className="text-neutral-500">{t('docket.participants')}</dt>
              <dd>{review.participants.map((p) => <div key={p.participantId}>{p.fullName} ({t(`participantRole.${p.role}`)})</div>)}</dd>
              <dt className="text-neutral-500">{t('evidence.files')}</dt>
              <dd>
                {review.evidence.length ? `${review.evidence.length} (${formatBytes(bytes)})` : t('evidence.none')}
                {review.evidence.map((e) => <div key={e.evidenceId} className="break-all text-xs text-neutral-600">{e.fileName}</div>)}
              </dd>
              <dt className="text-neutral-500">{t('transmit.custody')}</dt>
              <dd>
                {timers.length ? timers.map((p) => (
                  <div key={p.timerId}>{p.fullName}: <span className="font-mono">{formatRemaining(p.expiresAt, now)}</span></div>
                )) : t('custody.notInCustody')}
              </dd>
            </dl>
          )}
          <FormError code={error} className="mt-3" />
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-300 bg-neutral-50 p-4">
          <button type="button" className="button-secondary" onClick={onClose}>{t('invite.cancel')}</button>
          <button type="button" className="button-primary" disabled={!review || busy} onClick={transmit}>
            <Icon name={busy ? 'spinner fa-spin' : 'paper-plane'} />{t('transmit.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
