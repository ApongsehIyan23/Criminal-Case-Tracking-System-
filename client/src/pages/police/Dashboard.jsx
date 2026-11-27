import { useCallback, useEffect, useState } from 'react';
import CustodyAlerts from '../../components/CustodyAlerts';
import { FormError, PageHeader, Toast } from '../../components/ui';
import { useCustodySync } from '../../context/CustodySyncContext';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';
import CustodyHub from './CustodyHub';
import QuickEvidenceModal from './QuickEvidenceModal';

export default function Dashboard() {
  const { t } = useLanguage();
  const { version } = useCustodySync();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  // null when closed, otherwise the case chosen in the dialog.
  const [upload, setUpload] = useDraft('police.quickUpload', null);
  const [toast, setToast] = useState(false);
  const closeToast = useCallback(() => setToast(false), []);

  useEffect(() => {
    let current = true;
    api.get('/cases/dashboard')
      .then((result) => { if (current) { setData(result); setError(null); } })
      .catch((e) => current && setError(e.code));
    return () => { current = false; };
  }, [version, reload]);

  return (
    <section>
      <CustodyAlerts linkTo={(item) => `/police/cases/${item.caseId}`} />
      <PageHeader title={t('police.dashboard')} />
      <FormError code={error} className="mt-3" />
      <CustodyHub data={data} onUpload={(caseId) => setUpload({ caseId, category: '' })} />
      {upload && (
        <QuickEvidenceModal draft={upload} onChange={setUpload} onClose={() => setUpload(null)}
          onUploaded={() => { setUpload(null); setToast(true); setReload((n) => n + 1); }} />
      )}
      <Toast message={toast && t('evidence.uploaded')} onDone={closeToast} />
    </section>
  );
}
