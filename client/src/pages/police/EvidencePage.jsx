// Choose a case still under investigation, then upload to it and see its files.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Field, FormError, Icon, PageHeader, Toast } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';
import { EvidencePanel } from './DocketPanels';

export default function EvidencePage() {
  const { t } = useLanguage();
  const [caseId, setCaseId] = useDraft('police.evidencePage', '');
  const [cases, setCases] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState(false);
  const closeToast = useCallback(() => setToast(false), []);

  useEffect(() => {
    api.get('/cases/open').then((r) => setCases(r.items)).catch((e) => { setCases([]); setError(e.code); });
  }, []);

  // A remembered choice is dropped once that case is no longer open.
  const selected = cases?.some((c) => c.caseId === caseId) ? caseId : '';

  useEffect(() => {
    if (!selected) return undefined;
    let current = true;
    api.get(`/cases/${selected}`)
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [selected, reload]);

  const shown = data?.case.caseId === selected ? data : null;

  return (
    <section>
      <PageHeader title={t('sidebar.evidence')} />
      <div className="mt-7 border border-neutral-300 bg-white p-5">
        <div className="max-w-xl">
          <Field label={t('evidence.activeCase')}>
            {(props) => (
              <select {...props} value={selected} onChange={(event) => setCaseId(event.target.value)}>
                <option value="">{t(cases ? 'evidence.selectCase' : 'common.loading')}</option>
                {(cases || []).map((c) => <option key={c.caseId} value={c.caseId}>{c.caseId} — {c.incidentTitle}</option>)}
              </select>
            )}
          </Field>
        </div>
        <FormError code={error} className="mt-3" />
        {selected && !shown && !error && <p className="mt-5 text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
        {shown && (
          <div className="mt-5">
            <Link className="text-action mb-4 inline-block" to={`/police/cases/${selected}`}>
              <Icon name="folder-open" className="mr-1.5" />{t('police.openCase')}
            </Link>
            <EvidencePanel key={selected} data={shown} locked={shown.case.status !== 'IN_INVESTIGATION'}
              onUploaded={() => { setToast(true); setReload((n) => n + 1); }} />
          </div>
        )}
      </div>
      <Toast message={toast && t('evidence.uploaded')} onDone={closeToast} />
    </section>
  );
}
