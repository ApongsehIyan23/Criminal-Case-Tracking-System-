import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { CUSTODY_MS, formatBytes, formatRemaining, isUrgent, remainingMs } from '../../lib/custody';
import { useDraft } from '../../lib/useDraft';
import { CATEGORY_ICONS, CategoryField, FileField, useEvidenceUpload } from './evidence';

const Table = ({ columns, children }) => (
  <div className="overflow-x-auto border border-neutral-300">
    <table>
      <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const Empty = ({ span, children }) => (
  <tr><td colSpan={span} className="py-8 text-center text-neutral-500">{children}</td></tr>
);

export function Overview({ data }) {
  const { t, language, formatDateTime } = useLanguage();
  const { case: file, participants } = data;
  const details = [
    ['intake.offense', language === 'FR' ? file.offenseFr : file.offenseEn],
    ['intake.date', formatDateTime(file.incidentDatetime)],
    ['intake.station', file.unitName],
    ['docket.createdBy', file.createdBy],
    ['intake.narrative', file.narrative || '—'],
  ];
  return (
    <div className="space-y-7">
      <section>
        <h3 className="font-semibold">{t('docket.incidentDetails')}</h3>
        <dl className="mt-4 grid grid-cols-[180px_1fr] gap-y-3 text-sm">
          {details.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-neutral-500">{t(key)}</dt>
              <dd className="max-w-3xl whitespace-pre-wrap leading-6">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3 className="mb-3 font-semibold"><Icon name="users" className="mr-2" />{t('docket.participants')}</h3>
        <Table columns={['intake.role', 'intake.fullName', 'intake.nationalId', 'intake.phone', 'docket.custodyStatus'].map((k) => t(k))}>
          {participants.map((p) => (
            <tr key={p.participantId}>
              <td>{t(`participantRole.${p.role}`)}</td>
              <td className="font-medium">{p.fullName}</td>
              <td>{p.nationalId || '—'}</td>
              <td>{p.phone || '—'}</td>
              <td>{p.isDetained
                ? <span className="status"><Icon name="user-lock" className="mr-1.5" />{t(`timerStatus.${p.timerStatus}`)}</span>
                : '—'}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}

export function EvidencePanel({ data, locked, onUploaded }) {
  const { t, formatDateTime } = useLanguage();
  const { case: file, evidence, evidenceLimitBytes } = data;
  const [category, setCategory] = useDraft(`police.evidence.${file.caseId}`, '');
  const upload = useEvidenceUpload();
  const used = evidence.reduce((sum, e) => sum + e.fileSizeBytes, 0);

  async function submit(event) {
    event.preventDefault();
    if (await upload.submit(file.caseId, category)) {
      setCategory('');
      onUploaded();
    }
  }

  return (
    <div>
      {locked ? (
        <div className="flex items-center gap-2 border border-neutral-400 bg-neutral-50 p-4 text-sm font-semibold">
          <Icon name="lock" />{t('evidence.locked')}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="border border-neutral-300 bg-neutral-50 p-4">
          <div className="grid grid-cols-[220px_1fr_auto] items-start gap-4">
            <CategoryField value={category} error={upload.errors.category} onChange={setCategory} />
            <FileField upload={upload} />
            <button type="submit" className="button-primary mt-[26px]" disabled={upload.busy}>
              <Icon name={upload.busy ? 'spinner fa-spin' : 'cloud-arrow-up'} />{t('evidence.upload')}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            {t('evidence.rules')} {t('evidence.used', { used: formatBytes(used), limit: formatBytes(evidenceLimitBytes) })}
          </p>
          {upload.formError && upload.formError !== 'VALIDATION_FAILED' && (
            <p role="alert" className="mt-2 text-sm text-red-700">{t(`errors.${upload.formError}`)}</p>
          )}
        </form>
      )}
      <h3 className="mb-3 mt-6 font-semibold">{t('evidence.files')}</h3>
      <Table columns={['category', 'fileName', 'size', 'uploadedAt', 'uploadedBy', 'hash', 'scan'].map((k) => t(`evidence.${k}`))}>
        {evidence.map((e) => (
          <tr key={e.evidenceId}>
            <td><Icon name={CATEGORY_ICONS[e.category]} className="mr-2" />{t(`evidence.categories.${e.category}`)}</td>
            <td className="break-all font-medium">{e.fileName}</td>
            <td className="whitespace-nowrap">{formatBytes(e.fileSizeBytes)}</td>
            <td>{formatDateTime(e.uploadedAt)}</td>
            <td>{e.uploadedBy}</td>
            <td className="font-mono text-xs" title={e.sha256}>{e.sha256.slice(0, 12)}…</td>
            <td><span className="status"><Icon name="shield-halved" className="mr-1.5" />{t(`scan.${e.virusScanStatus}`)}</span></td>
          </tr>
        ))}
        {!evidence.length && <Empty span={7}>{t('evidence.none')}</Empty>}
      </Table>
    </div>
  );
}

export function CustodyPanel({ data, now }) {
  const { t, formatDateTime } = useLanguage();
  const detained = data.participants.filter((p) => p.timerId);
  return (
    <div className="grid grid-cols-2 items-start gap-6">
      <div className="space-y-4">
        {detained.map((p) => {
          const running = ['ACTIVE', 'EXTENDED', 'EXPIRED'].includes(p.timerStatus);
          const urgent = running && isUrgent(p.expiresAt, now);
          const elapsed = Math.min(100, Math.max(0, ((CUSTODY_MS - remainingMs(p.statutoryExpiresAt, now)) / CUSTODY_MS) * 100));
          return (
            <section key={p.timerId} className="border border-neutral-300 p-5">
              <h3 className="font-semibold"><Icon name="stopwatch" className="mr-2" />{p.fullName}</h3>
              <span className="status mt-2">{t(`timerStatus.${p.timerStatus}`)}</span>
              {running && (
                <div className={`mt-4 font-mono text-3xl font-semibold tabular-nums ${urgent ? 'text-red-500' : ''}`}>
                  {formatRemaining(p.expiresAt, now)}
                </div>
              )}
              {urgent && (
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-red-500">
                  <Icon name="triangle-exclamation" />
                  {t(remainingMs(p.expiresAt, now) ? 'custody.urgent' : 'custody.limitPassed')}
                </div>
              )}
              <div className="mt-4 h-3 border border-neutral-400 bg-neutral-100">
                <div className={`h-full ${urgent ? 'bg-red-500' : 'bg-neutral-700'}`} style={{ width: `${elapsed}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-[160px_1fr] gap-y-1 text-sm">
                <dt className="text-neutral-500">{t('custody.startedAt')}</dt><dd>{formatDateTime(p.startedAt)}</dd>
                <dt className="text-neutral-500">{t('custody.statutoryDeadline')}</dt><dd className="font-semibold">{formatDateTime(p.statutoryExpiresAt)}</dd>
                {p.expiresAt !== p.statutoryExpiresAt && (
                  <><dt className="text-neutral-500">{t('custody.currentDeadline')}</dt><dd className="font-semibold">{formatDateTime(p.expiresAt)}</dd></>
                )}
              </dl>
            </section>
          );
        })}
        {!detained.length && <p className="text-sm text-neutral-500">{t('custody.notInCustody')}</p>}
      </div>
      <section className="border border-neutral-300 p-5">
        <h3 className="font-semibold"><Icon name="envelope" className="mr-2" />{t('custody.dispatch')}</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{t('custody.dispatchIntro')}</p>
        {data.alerts.length ? (
          <ul className="mt-4 space-y-2">
            {data.alerts.map((a) => (
              <li key={a.notificationId} className="border border-neutral-300 bg-neutral-50 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <strong className="break-all">{a.recipient}</strong>
                  <span className="status">{t(`delivery.${a.deliveryStatus}`)}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">{t(`channel.${a.channel}`)} · {formatDateTime(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : <p className="mt-5 text-sm text-neutral-500">{t('custody.noAlert')}</p>}
      </section>
    </div>
  );
}

export function AuditPanel({ trail }) {
  const { t, formatDateTime } = useLanguage();
  return (
    <section>
      <p className="mb-4 text-sm text-neutral-600"><Icon name="lock" className="mr-2" />{t('docket.immutable')}</p>
      <Table columns={['time', 'actor', 'action'].map((k) => t(`audit.${k}`))}>
        {trail.map((entry) => (
          <tr key={entry.logId}>
            <td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
            <td>
              <div>{entry.actorEmail}</div>
              <div className="text-xs text-neutral-500">{t(`roles.${entry.actorRole}`)}</div>
            </td>
            <td>{t(`actions.${entry.actionType}`)}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
