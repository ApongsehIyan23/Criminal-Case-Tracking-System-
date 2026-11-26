import CustodyAlerts from '../components/CustodyAlerts';
import { Icon } from '../components/ui';
import { useLanguage } from '../context/LanguageContext';

// Stands in for the police and magistrate dashboards until their phases.
export default function Placeholder({ area, icon }) {
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-[1440px] p-7">
      <CustodyAlerts />
      <section className="border border-neutral-300 bg-white p-8 text-center">
        <Icon name={icon} className="text-3xl text-neutral-500" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t(`placeholder.${area}`)}</h1>
        <p className="mt-1.5 text-sm text-neutral-600">{t('placeholder.body')}</p>
      </section>
    </main>
  );
}
