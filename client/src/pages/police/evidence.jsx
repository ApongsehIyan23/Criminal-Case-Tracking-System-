// Shared by the docket's upload row and the quick upload dialog.
import { useState } from 'react';
import { Field } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';

export const CATEGORIES = ['CRIME_SCENE_PHOTO', 'WITNESS_STATEMENT', 'MEDICAL_REPORT'];
export const CATEGORY_ICONS = { CRIME_SCENE_PHOTO: 'camera', WITNESS_STATEMENT: 'file-lines', MEDICAL_REPORT: 'file-medical' };
export const LIMIT_BYTES = 500 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf';

export function useEvidenceUpload() {
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a success to empty the file control.
  const [inputKey, setInputKey] = useState(0);

  async function submit(caseId, category) {
    const problems = {};
    if (!caseId) problems.caseId = 'CASE_REQUIRED';
    if (!category) problems.category = 'CATEGORY_REQUIRED';
    if (!file) problems.file = 'FILE_REQUIRED';
    else if (!/\.(jpe?g|png|pdf)$/i.test(file.name)) problems.file = 'FILE_TYPE_NOT_ALLOWED';
    else if (file.size > LIMIT_BYTES) problems.file = 'EVIDENCE_LIMIT_EXCEEDED';
    setErrors(problems);
    setFormError(null);
    if (Object.keys(problems).length) return false;

    const body = new FormData();
    body.append('category', category);
    body.append('file', file);
    setBusy(true);
    try {
      await api.post(`/cases/${caseId}/evidence`, body);
      setFile(null);
      setInputKey((k) => k + 1);
      return true;
    } catch (error) {
      setErrors(error.fields);
      setFormError(error.code);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { setFile, errors, setErrors, formError, busy, inputKey, submit };
}

export function CategoryField({ value, error, onChange }) {
  const { t } = useLanguage();
  return (
    <Field label={t('evidence.category')} error={error}>
      {(props) => (
        <select {...props} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t('evidence.selectCategory')}</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{t(`evidence.categories.${c}`)}</option>)}
        </select>
      )}
    </Field>
  );
}

export function FileField({ upload }) {
  const { t } = useLanguage();
  return (
    <Field label={t('evidence.chooseFile')} error={upload.errors.file}>
      {(props) => <input {...props} key={upload.inputKey} className={`${props.className} py-1.5`} type="file" accept={ACCEPT}
        onChange={(event) => {
          upload.setFile(event.target.files?.[0] || null);
          upload.setErrors({});
        }} />}
    </Field>
  );
}
