// The navy panel: brand, current step and the vertical progress stepper.
import { Fragment } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { DoneIcon } from './icons';
import { STEPS } from './model';

const CIRCLE = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full';
const STATES = {
  done: { circle: `${CIRCLE} bg-[#2563eb]`, label: 'text-white/50' },
  active: { circle: `${CIRCLE} border-2 border-white text-[13px] font-semibold text-white`, label: 'font-semibold text-white' },
  upcoming: { circle: `${CIRCLE} border-2 border-white/30 text-[13px] font-semibold text-white/40`, label: 'text-white/40' },
};

export default function StepSidebar({ step }) {
  const { t } = useLanguage();
  return (
    <div className="flex w-[280px] shrink-0 flex-col bg-[#1a2744] px-7 py-8">
      <p className="mb-7 text-lg font-bold tracking-wide text-white">{t('app.short')}</p>
      <p className="mb-2 text-[22px] font-bold text-white">{t('wizard.stepNumber', { number: step })}</p>
      <p className="mb-9 text-[13px] leading-normal text-white/60">{t(`wizard.guide.${STEPS[step - 1]}`)}</p>
      <ol aria-label={t('wizard.progress')}>
        {STEPS.map((name, index) => {
          const number = index + 1;
          const state = (number < step && 'done') || (number === step && 'active') || 'upcoming';
          return (
            <Fragment key={name}>
              <li className="flex items-center gap-3.5" data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
                <span className={STATES[state].circle}>{state === 'done' ? <DoneIcon /> : number}</span>
                <span className={`text-sm ${STATES[state].label}`}>
                  {t(`wizard.steps.${name}`)}
                  {state === 'done' && <span className="sr-only"> ({t('wizard.completed')})</span>}
                </span>
              </li>
              {number < STEPS.length && (
                <li aria-hidden="true" className={`ml-[15px] h-10 w-0.5 ${state === 'done' ? 'bg-[#2563eb]' : 'bg-white/25'}`} />
              )}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
