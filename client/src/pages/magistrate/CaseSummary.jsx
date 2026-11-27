// Left half of the review: everything here is read-only.
import { Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';

export default function CaseSummary({ data, auditRef }) {
  const { t, language, formatDateTime } = useLanguage();
  const { case: file, participants, trail } = data;
  const details = [
    ['intake.incidentTitle', file.incidentTitle],
    ['intake.offense', language === 'FR' ? file.offenseFr : file.offenseEn],
    ['intake.date', formatDateTime(file.incidentDatetime)],
    ['intake.station', file.unitName],
    ['magistrate.officer', `${file.createdBy} (${file.createdByEmail})`],
    ['intake.narrative', file.narrative || '—'],
  ];
  return (
    <section className="overflow-y-auto border border-neutral-300 bg-white">
      <h2 className="sticky top-0 z-10 border-b border-neutral-300 bg-neutral-50 px-5 py-4 font-semibold">{t('magistrate.summary')}</h2>
      <div className="space-y-7 p-5">
        <section>
          <h3 className="font-semibold"><Icon name="file-lines" className="mr-2" />{t('docket.incidentDetails')}</h3>
          <dl className="mt-4 grid grid-cols-[155px_1fr] gap-y-3 text-sm">
            {details.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-neutral-500">{t(key)}</dt>
                <dd className="whitespace-pre-wrap leading-6">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h3 className="font-semibold"><Icon name="users" className="mr-2" />{t('docket.participants')}</h3>
          <div className="mt-3 overflow-x-auto border border-neutral-300">
            <table>
              <thead>
                <tr>{['intake.role', 'intake.fullName', 'intake.nationalId', 'docket.custodyStatus'].map((k) => <th key={k}>{t(k)}</th>)}</tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.participantId}>
                    <td>{t(`participantRole.${p.role}`)}</td>
                    <td>
                      <div className="font-medium">{p.fullName}</div>
                      {p.phone && <div className="text-xs text-neutral-500">{p.phone}</div>}
                    </td>
                    <td>{p.nationalId || '—'}</td>
                    <td>{p.timerStatus ? t(`timerStatus.${p.timerStatus}`) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section ref={auditRef} tabIndex={-1}>
          <h3 className="font-semibold"><Icon name="clock-rotate-left" className="mr-2" />{t('magistrate.auditTrail')}</h3>
          <div className="mt-3 overflow-x-auto border border-neutral-300">
            <table>
              <thead><tr>{['time', 'actor', 'action'].map((k) => <th key={k}>{t(`audit.${k}`)}</th>)}</tr></thead>
              <tbody>
                {trail.map((entry) => (
                  <tr key={entry.logId}>
                    <td className="text-xs">{formatDateTime(entry.createdAt)}</td>
                    <td className="break-all text-xs">{entry.actorEmail}</td>
                    <td className="text-xs">{t(`actions.${entry.actionType}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
