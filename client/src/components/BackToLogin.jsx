import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './ui';

export function BackToLogin() {
  const { t } = useLanguage();
  return (
    <p className="mt-5 text-center">
      <Link to="/login" className="text-sm font-medium text-[#1a1a1a] hover:text-[#4a5568]">
        <Icon name="arrow-left" className="mr-1.5" />{t('activate.toLogin')}
      </Link>
    </p>
  );
}
