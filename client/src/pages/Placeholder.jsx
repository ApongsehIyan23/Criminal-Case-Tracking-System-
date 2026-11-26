import { Icon } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';

// Stands in for the police and magistrate dashboards until their phases.
export default function Placeholder({ area, icon }) {
  const { t } = useLanguage();
  return (
    <section className="card text-center">
      <Icon name={icon} className="text-3xl" />
      <h1 className="mt-2 text-xl font-semibold">{t(`placeholder.${area}`)}</h1>
      <p className="mt-1 text-sm text-neutral-600">{t('placeholder.body')}</p>
    </section>
  );
}
