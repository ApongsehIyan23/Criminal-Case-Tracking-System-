// Right half of the review. A file is fetched, decrypted and verified by the
// server only when it is selected, and each fetch is recorded.
import { useEffect, useState } from 'react';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/custody';
import { saveBlob } from '../../lib/files';
import { useDraft } from '../../lib/useDraft';
import { CATEGORY_ICONS } from '../police/evidence';

function Preview({ caseId, item }) {
  const { t, formatDateTime } = useLanguage();
  const [file, setFile] = useState({ url: null, blob: null, error: null });

  useEffect(() => {
    let current = true;
    let url = null;
    setFile({ url: null, blob: null, error: null });
    api.download(`/magistrate/cases/${caseId}/evidence/${item.evidenceId}/content`)
      .then(({ blob }) => {
        if (!current) return;
        url = URL.createObjectURL(blob);
        setFile({ url, blob, error: null });
      })
      .catch((e) => current && setFile({ url: null, blob: null, error: e.code }));
    return () => {
      current = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [caseId, item.evidenceId]);

  const image = item.mimeType.startsWith('image/');
  return (
    <div className="mt-5 border border-neutral-400">
      <div className="flex items-center justify-between border-b border-neutral-300 bg-neutral-50 px-4 py-2">
        <span className="font-semibold"><Icon name="eye" className="mr-2" />{t('viewer.preview')}</span>
        {file.blob && (
          <button type="button" className="text-action" onClick={() => saveBlob(file.blob, item.fileName)}>
            <Icon name="download" className="mr-1.5" />{t('viewer.download')}
          </button>
        )}
      </div>
      <div className="flex min-h-80 items-center justify-center bg-neutral-100 p-5">
        {file.error && <FormError code={file.error} />}
        {!file.error && !file.url && <p className="text-sm"><Icon name="spinner fa-spin" /> {t('common.loading')}</p>}
        {file.url && (image
          ? <img src={file.url} alt={item.fileName} className="max-h-72 max-w-full border border-neutral-300 object-contain" />
          : <iframe src={file.url} title={item.fileName} className="h-72 w-full border border-neutral-300 bg-white" />)}
      </div>
      <dl className="grid grid-cols-[160px_1fr] gap-y-2 border-t border-neutral-300 p-4 text-sm">
        <dt className="text-neutral-500">{t('evidence.uploadedBy')}</dt><dd>{item.uploadedBy}</dd>
        <dt className="text-neutral-500">{t('evidence.uploadedAt')}</dt><dd>{formatDateTime(item.uploadedAt)}</dd>
        <dt className="text-neutral-500">{t('evidence.size')}</dt><dd>{formatBytes(item.fileSizeBytes)}</dd>
        <dt className="text-neutral-500">{t('evidence.hash')}</dt><dd className="break-all font-mono text-xs">{item.sha256}</dd>
        <dt className="text-neutral-500">{t('evidence.scan')}</dt>
        <dd><span className="status"><Icon name="shield-halved" className="mr-1.5" />{t(`scan.${item.virusScanStatus}`)}</span></dd>
      </dl>
    </div>
  );
}

export default function EvidenceViewer({ caseId, evidence }) {
  const { t } = useLanguage();
  const [selected, setSelected] = useDraft(`magistrate.evidence.${caseId}`, '');
  const item = evidence.find((e) => e.evidenceId === selected) || evidence[0];

  return (
    <section className="overflow-y-auto border border-neutral-300 bg-white">
      <h2 className="sticky top-0 z-10 border-b border-neutral-300 bg-neutral-50 px-5 py-4 font-semibold">{t('viewer.title')}</h2>
      <div className="p-5">
        {!evidence.length ? (
          <p className="border border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-500">{t('evidence.none')}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {evidence.map((e) => (
                <button key={e.evidenceId} type="button" aria-pressed={item.evidenceId === e.evidenceId}
                  onClick={() => setSelected(e.evidenceId)}
                  className={`flex items-center gap-3 border p-3 text-left text-sm ${item.evidenceId === e.evidenceId ? 'border-neutral-900 bg-neutral-100' : 'border-neutral-300'}`}>
                  <Icon name={CATEGORY_ICONS[e.category]} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.fileName}</span>
                    <span className="mt-0.5 block text-xs text-neutral-500">{t(`evidence.categories.${e.category}`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <Preview caseId={caseId} item={item} />
          </>
        )}
      </div>
    </section>
  );
}
