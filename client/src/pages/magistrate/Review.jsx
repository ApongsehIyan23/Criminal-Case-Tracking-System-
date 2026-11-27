// M2: split-screen review, with M3 (the mandate panel) anchored below it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FormError, Icon, Toast } from '../../components/ui';
import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../../lib/custody';
import CaseSummary from './CaseSummary';
import EvidenceViewer from './EvidenceViewer';
import MandatePanel from './MandatePanel';

function ReviewView({ caseId }) {
  const { t } = useLanguage();
  const { version } = useCustodySync();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState(false);
  const closeToast = useCallback(() => setToast(false), []);
  const auditRef = useRef(null);
  const mandateRef = useRef(null);
  const focused = useRef(false);
  const now = useServerNow(data?.serverNow);

  useEffect(() => {
    let current = true;
    api.get(`/magistrate/cases/${caseId}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [caseId, version, reload]);

  // A dashboard shortcut scrolls to the requested section, once.
  useEffect(() => {
    if (!data || focused.current) return;
    focused.current = true;
    const target = { audit: auditRef, mandate: mandateRef }[focus]?.current;
    target?.scrollIntoView?.({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [data, focus]);

  const back = (
    <Link className="text-action" to="/magistrate"><Icon name="arrow-left" className="mr-1.5" />{t('police.back')}</Link>
  );
  if (!data) {
    return (
      <section>
        {back}
        {error ? <FormError code={error} className="mt-4" />
          : <p className="mt-4 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      </section>
    );
  }

  const { case: file, participants } = data;
  const expiresAt = participants
    .filter((p) => ['ACTIVE', 'EXTENDED', 'EXPIRED'].includes(p.timerStatus))
    .map((p) => p.expiresAt).sort()[0];
  const urgent = expiresAt && isUrgent(expiresAt, now);

  return (
    <section>
      {back}
      <header className="mt-4 border border-neutral-400 bg-white p-5">
        <div className="flex items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <Icon name="table-columns" />
              <h1 className="text-2xl font-semibold">{file.caseId}</h1>
              <span className="status">{t(`magistrate.review.${file.status === 'MANDATE_ISSUED' ? 'ISSUED' : 'PENDING'}`)}</span>
            </div>
            <div className="mt-2 text-sm text-neutral-600">{file.unitName}</div>
          </div>
          {expiresAt && (
            <span role="timer" className={`font-mono text-sm font-semibold ${urgent ? 'text-red-500' : ''}`}>
              <Icon name={urgent ? 'triangle-exclamation' : 'stopwatch'} className="mr-2" />{formatRemaining(expiresAt, now)}
            </span>
          )}
        </div>
      </header>
      <FormError code={error} className="mt-3" />

      <div className="mt-5 grid h-[720px] grid-cols-2 gap-4">
        <CaseSummary data={data} auditRef={auditRef} />
        <EvidenceViewer caseId={caseId} evidence={data.evidence} />
      </div>

      <div ref={mandateRef} tabIndex={-1}>
        <MandatePanel data={data} onIssued={() => { setToast(true); setReload((n) => n + 1); }} />
      </div>
      <Toast message={toast && t('mandate.issuedToast')} onDone={closeToast} />
    </section>
  );
}

// Keyed by case so that moving between reviews starts clean.
export default function Review() {
  const { caseId } = useParams();
  return <ReviewView key={caseId} caseId={caseId} />;
}
