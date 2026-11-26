// P3: the case docket workspace.
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormError, Icon, Notice, Toast } from '../../components/ui';
import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { formatRemaining, isUrgent, useServerNow } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';
import { AuditPanel, CustodyPanel, EvidencePanel, Overview } from './DocketPanels';
import TransmitModal from './TransmitModal';

const TABS = [['overview', 'file-lines'], ['evidence', 'cloud-arrow-up'], ['custody', 'stopwatch'], ['audit', 'clock-rotate-left']];

const soonest = (participants) => participants
  .filter((p) => ['ACTIVE', 'EXTENDED', 'EXPIRED'].includes(p.timerStatus))
  .map((p) => p.expiresAt)
  .sort()[0];

function DocketView({ caseId }) {
  const { t, formatDateTime } = useLanguage();
  const { version } = useCustodySync();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'overview';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [reviewing, setReviewing] = useDraft(`police.transmit.${caseId}`, false);
  const [notice, setNotice] = useState(() => (location.state?.created ? { created: location.state.created } : null));
  const [toast, setToast] = useState(false);
  const closeToast = useCallback(() => setToast(false), []);
  const now = useServerNow(data?.serverNow);

  useEffect(() => {
    let current = true;
    api.get(`/cases/${caseId}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [caseId, version, reload]);

  // A custody card's Transmit button opens the review directly. The navigation
  // note is then cleared so a refresh does not reopen a closed dialog.
  useEffect(() => {
    if (!location.state) return;
    if (location.state.transmit) setReviewing(true);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate, setReviewing]);

  if (!data) {
    return (
      <section>
        <Link className="text-action" to="/police"><Icon name="arrow-left" className="mr-1.5" />{t('police.back')}</Link>
        {error ? <FormError code={error} className="mt-4" />
          : <p className="mt-4 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
      </section>
    );
  }

  const { case: file, participants, mandate } = data;
  const locked = file.status !== 'IN_INVESTIGATION';
  const expiresAt = soonest(participants);
  const urgent = expiresAt && isUrgent(expiresAt, now);

  return (
    <section>
      <Link className="text-action" to="/police"><Icon name="arrow-left" className="mr-1.5" />{t('police.back')}</Link>
      <div className="mt-4 border border-neutral-400 bg-white p-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{file.caseId}</h1>
              <span className="status">{t(`caseStatus.${file.status}`)}</span>
              {locked && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                  <Icon name="lock" />{t('docket.readOnly')}
                </span>
              )}
            </div>
            <h2 className="mt-2 text-base font-medium">{file.incidentTitle}</h2>
            {expiresAt && (
              <p role="timer" className={`mt-3 text-sm ${urgent ? 'font-semibold text-red-500' : 'text-neutral-600'}`}>
                <Icon name={urgent ? 'triangle-exclamation' : 'stopwatch'} className="mr-1.5" />
                <span className="font-mono tabular-nums">{formatRemaining(expiresAt, now)}</span>
              </p>
            )}
          </div>
          {!locked && (
            <button type="button" className="button-primary" onClick={() => setReviewing(true)}>
              <Icon name="paper-plane" />{t('docket.transmit')}
            </button>
          )}
        </div>
      </div>

      {notice?.created && (
        <Notice className="mt-4" title={t('common.confirmation')} onClose={() => setNotice(null)}>
          {t(notice.created.custodyTimers ? 'intake.createdWithTimer' : 'intake.created', { caseId: file.caseId })}
          {notice.created.nameMismatches.map((m) => (
            <p key={m.nationalId} className="mt-1">
              <Icon name="triangle-exclamation" className="mr-1.5" />{t('intake.nameMismatch', m)}
            </p>
          ))}
        </Notice>
      )}
      {notice?.transmitted && (
        <Notice className="mt-4" title={t('common.confirmation')} onClose={() => setNotice(null)}>{t('docket.transmitted')}</Notice>
      )}

      {mandate && (
        <div className="mt-4 border border-neutral-500 bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="gavel" />{t('docket.ruling')}</h2>
          <dl className="mt-4 grid grid-cols-[180px_1fr] gap-y-2 text-sm">
            <dt className="text-neutral-500">{t('docket.decision')}</dt><dd className="font-semibold">{t(`decision.${mandate.decision}`)}</dd>
            <dt className="text-neutral-500">{t('docket.notes')}</dt><dd className="whitespace-pre-wrap">{mandate.rulingNotes}</dd>
            <dt className="text-neutral-500">{t('docket.issuedBy')}</dt><dd>{mandate.issuedBy}</dd>
            <dt className="text-neutral-500">{t('docket.issuedAt')}</dt><dd>{formatDateTime(mandate.issuedAt)}</dd>
            {mandate.signedDocumentName && (
              <><dt className="text-neutral-500">{t('docket.signedDocument')}</dt><dd>{mandate.signedDocumentName}</dd></>
            )}
          </dl>
        </div>
      )}
      <FormError code={error} className="mt-3" />

      <div className="mt-5 border border-neutral-300 bg-white">
        <div role="tablist" className="flex gap-6 border-b border-neutral-300 px-5">
          {TABS.map(([id, icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id}
              className={`border-b-2 py-4 text-sm font-semibold ${tab === id ? 'border-neutral-900' : 'border-transparent text-neutral-500'}`}
              onClick={() => setParams({ tab: id }, { replace: true })}>
              <Icon name={icon} className="mr-2" />{t(`docket.tabs.${id}`)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="p-6">
          {tab === 'overview' && <Overview data={data} />}
          {tab === 'evidence' && (
            <EvidencePanel data={data} locked={locked} onUploaded={() => { setToast(true); setReload((n) => n + 1); }} />
          )}
          {tab === 'custody' && <CustodyPanel data={data} now={now} />}
          {tab === 'audit' && <AuditPanel trail={data.trail} />}
        </div>
      </div>

      {reviewing && !locked && (
        <TransmitModal caseId={caseId} onClose={() => setReviewing(false)} onTransmitted={() => {
          setReviewing(false);
          setNotice({ transmitted: true });
          setReload((n) => n + 1);
        }} />
      )}
      <Toast message={toast && t('evidence.uploaded')} onDone={closeToast} />
    </section>
  );
}

// Keyed by case so that moving between dockets starts clean.
export default function Docket() {
  const { caseId } = useParams();
  return <DocketView key={caseId} caseId={caseId} />;
}
