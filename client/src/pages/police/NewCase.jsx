// P2: digital case initiation and participant registration, in four steps.
// Everything typed, and the current step, is kept as a draft until the case is
// saved or the officer cancels.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormError, Icon } from '../../components/ui';
import { useLanguage } from '../../context/LanguageContext';
import { api } from '../../lib/api';
import { useDraft } from '../../lib/useDraft';
import { DocketIcon, IncidentIcon, NarrativeIcon, ParticipantsIcon, ReviewIcon } from './intake/icons';
import { STEPS, checkStep, emptyCase, hasProblems, stepWithProblem, withZone } from './intake/model';
import StepSidebar from './intake/StepSidebar';
import { IncidentStep, NarrativeStep, ParticipantsStep, ReviewStep } from './intake/Steps';

const ICONS = [IncidentIcon, NarrativeIcon, ParticipantsIcon, ReviewIcon];
const NO_ERRORS = { fields: {}, rows: {} };
const LAST = STEPS.length;

export default function NewCase() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm, resetForm] = useDraft('police.newCase', emptyCase);
  const [step, setStep, resetStep] = useDraft('police.newCase.step', 1);
  const [reference, setReference] = useState(null);
  const [errors, setErrors] = useState(NO_ERRORS);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef(null);
  const shownStep = useRef(step);

  useEffect(() => {
    api.get('/cases/reference').then((data) => {
      setReference(data);
      // Start on the officer's own station when it is one.
      setForm((f) => (f.originatingUnitId || !data.units.some((u) => u.unitId === data.officerUnitId)
        ? f : { ...f, originatingUnitId: data.officerUnitId }));
    }).catch((error) => setFormError(error.code));
  }, [setForm]);

  // Moving to another step starts reading from its title.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  const change = (changes) => setForm((f) => ({ ...f, ...changes }));

  function goTo(next, problems = NO_ERRORS) {
    setErrors(problems);
    setFormError(null);
    setStep(next);
  }

  async function save() {
    // A restored or edited draft is checked again, from the first step.
    for (let number = 1; number < LAST; number += 1) {
      const problems = checkStep(number, form);
      if (hasProblems(problems)) {
        goTo(number, problems);
        return;
      }
    }
    setErrors(NO_ERRORS);
    setFormError(null);
    setBusy(true);
    try {
      const { participants, incidentDatetime, ...incident } = form;
      const result = await api.post('/cases', {
        ...incident,
        incidentDatetime: withZone(incidentDatetime),
        participants: participants.map(({ key, ...p }) => p),
      });
      resetForm();
      resetStep();
      navigate(`/police/cases/${result.caseId}`, { state: { created: result } });
    } catch (error) {
      const problems = {
        fields: error.fields || {},
        rows: Object.fromEntries((error.rows || []).map((r) => [form.participants[r.index]?.key, r.errors])),
      };
      const target = stepWithProblem(problems);
      if (target) setStep(target);
      setErrors(problems);
      setFormError(error.code);
      setBusy(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (step === LAST) {
      save();
      return;
    }
    const problems = checkStep(step, form);
    if (hasProblems(problems)) setErrors(problems);
    else goTo(step + 1);
  }

  const cancel = () => { resetForm(); resetStep(); navigate('/police'); };
  const name = STEPS[step - 1];
  const StepIcon = ICONS[step - 1];

  return (
    <section className="case-wizard mx-auto w-full max-w-[860px] py-5">
      <h1 className="sr-only">{t('intake.title')}</h1>
      <div className="flex min-h-[520px] overflow-hidden rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        <StepSidebar step={step} />
        <form onSubmit={submit} noValidate className="min-w-0 flex-1 bg-white px-11 py-10">
          <div className="mb-3 flex items-start justify-between">
            <StepIcon />
            {/* Discards the draft. Kept apart from the step buttons so they match the design. */}
            <button type="button" className="text-sm font-medium text-[#6b7280] hover:text-[#1a2744]"
              disabled={busy} onClick={cancel}>
              {t('invite.cancel')}
            </button>
          </div>
          <h2 ref={heading} tabIndex={-1} className="mb-1.5 text-[26px] font-bold text-[#1a2744] outline-none">
            {t(`wizard.steps.${name}`)}
          </h2>
          <p className="mb-7 text-sm text-[#6b7280]">{t(`wizard.intro.${name}`)}</p>

          {step === 1 && <IncidentStep form={form} change={change} errors={errors} reference={reference} />}
          {step === 2 && <NarrativeStep form={form} change={change} errors={errors} />}
          {step === 3 && <ParticipantsStep form={form} setForm={setForm} errors={errors} />}
          {step === LAST && <ReviewStep form={form} reference={reference} goTo={goTo} />}

          <FormError code={formError} className="mt-4" />
          <div className="mt-8 flex items-center gap-3">
            {step > 1 && (
              <button type="button" className="case-button case-button-outline" disabled={busy} onClick={() => goTo(step - 1)}>
                {t('wizard.previous')}
              </button>
            )}
            {/* The second click of a double click must not also press the button that replaces this one. */}
            <button key={step === LAST ? 'save' : 'next'} type="submit" disabled={busy}
              className={`case-button ${step === LAST ? 'bg-[#1a2744] hover:bg-[#25365c]' : 'bg-[#2563eb] hover:bg-[#1d4ed8]'} text-white`}
              onClick={(e) => { if (e.detail > 1) e.preventDefault(); }}>
              {step === LAST && (busy ? <Icon name="spinner fa-spin" /> : <DocketIcon />)}
              {t(step === LAST ? 'intake.save' : 'wizard.next')}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
