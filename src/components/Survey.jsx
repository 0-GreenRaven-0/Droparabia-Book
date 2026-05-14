import { useState, useEffect, useRef } from 'react';

// ── SessionStorage helpers ────────────────────────────────────────────────────
const getTokens = () => {
  try { return JSON.parse(sessionStorage.getItem('userTokens') || '{}'); }
  catch { return {}; }
};

const getSavedUserData = () => {
  try { return JSON.parse(sessionStorage.getItem('userData') || '{}'); }
  catch { return {}; }
};

const createToken = (name) => {
  const value = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const tokens = getTokens();
  tokens[name] = value;
  sessionStorage.setItem('userTokens', JSON.stringify(tokens));
  return value;
};

// ── Questions ─────────────────────────────────────────────────────────────────
const questions = [
  {
    field: 'experience',
    title: 'Have you attempted dropshipping or e-commerce before?',
    options: [
      { value: 'yes_dropshipping', label: 'Yes, I have tried dropshipping before' },
      { value: 'yes_ecommerce',    label: 'I have tried e-commerce before' },
      { value: 'no',               label: 'No, I am completely new to this' },
    ]
  },
  {
    field: 'budget',
    title: 'We only work with users who have sufficient startup capital. To start a Local Dropshipping business, costs involve: Software & marketing. Do you have access to a minimum of $600 to get started?',
    options: [
      { value: 'yes',     label: 'Yes, I have the funds' },
      { value: 'partial', label: 'I have at least $600' },
      { value: 'no',      label: "No, I don't have the funds right now" },
    ]
  },
  {
    field: 'time',
    title: 'Starting a dropshipping business requires a bit of free time to learn and manage your business, do you have some free time?',
    options: [
      { value: 'yes',      label: 'Yes, I have free time' },
      { value: 'makeTime', label: 'I can make time for it' },
      { value: 'no',       label: 'No, my schedule is full' },
    ]
  },
  {
    field: 'effort',
    title: "This isn't a get-rich-quick scheme — it requires real work and effort to get the same results as our users. Are you willing to put in the work?",
    options: [
      { value: 'willing',  label: 'I am willing to put in the effort' },
      { value: 'whatever', label: "I'll do whatever is required" },
    ]
  },
  {
    field: 'startTime',
    title: "If we're a good fit, how soon could you start?",
    options: [
      { value: 'today',    label: 'Today' },
      { value: 'notReady', label: 'Not ready yet' },
    ]
  },
  {
    field: 'commitment',
    title: 'Is there any reason that will make you cancel the meeting other than a tsunami or an earthquake 😅?',
    options: [
      { value: 'yes1', label: "No, don't worry I will attend for sure" },
      { value: 'yes2', label: 'I will attend for sure' },
    ]
  }
];

const isQualified = (data) =>
  data.budget !== 'no' &&
  data.time   !== 'no' &&
  (data.effort === 'willing' || data.effort === 'whatever') &&
  data.startTime !== 'notReady';

// ── Component ─────────────────────────────────────────────────────────────────
export default function Survey() {
  const [valid, setValid] = useState(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setValid(!!getTokens().takeSurvey);

    const unlock = () => setValid(true);
    window.addEventListener('survey:unlock', unlock);

    const onUnload = () => {
      if (!completedRef.current) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: 'survey_abandoned' });
      }
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.removeEventListener('survey:unlock', unlock);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  const [page, setPage]           = useState(0);
  const [answers, setAnswers]     = useState({ experience: '', budget: '', time: '', effort: '', startTime: '', commitment: '' });
  const [fieldError, setFieldError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  if (valid === null) return null;

  if (!valid) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>
          Please subscribe first before taking the survey
        </h1>
        <a href="/survey" style={{ color: '#2563EB', textDecoration: 'underline' }}>← Go back</a>
      </div>
    );
  }

  const q     = questions[page];
  const total = questions.length;

  const handleNext = async () => {
    if (!answers[q.field]) {
      setFieldError('Please select an option to continue');
      return;
    }
    setFieldError('');

    if (page < total - 1) {
      setPage(page + 1);
      return;
    }

    // Survey complete
    completedRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    const qualified = isQualified(answers);
    const userData  = getSavedUserData();

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'survey_completed', survey_qualified: qualified, user_name: userData.name, user_email: userData.email, user_phone: userData.phone });

    createToken(qualified ? 'qualified' : 'unqualified');
    window.location.href = qualified ? '/choose-schedule' : '/get-free-program';
  };

  return (
    <div className="survey-wrap">
      <style>{`
        .survey-page { transition: transform .4s cubic-bezier(.4,0,.2,1), opacity .4s ease; position: absolute; width: 100%; left: 0; top: 0; }
        .survey-page--active { position: relative; transform: translateX(0); opacity: 1; }
        .survey-page--left   { transform: translateX(-100%); opacity: 0; pointer-events: none; }
        .survey-page--right  { transform: translateX(100%);  opacity: 0; pointer-events: none; }
        @keyframes shine { 0%{left:-100%} 50%{left:100%} 100%{left:100%} }
        .progress-shine { position: relative; overflow: hidden; }
        .progress-shine::after { content:''; position:absolute; top:0; left:-100%; width:30%; height:100%; background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.8),rgba(255,255,255,0)); animation:shine 2s ease-in-out infinite; transform:skewX(-20deg); }
      `}</style>

      <div className="survey-card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/Droparabia.png" alt="Droparabia" style={{ height: '40px', margin: '0 auto 0.75rem' }} />
          <h1 className="survey-title" style={{ fontSize: '1.2rem', lineHeight: 1.5 }}>
            Before we book you a call, we need to ask you a few questions to make sure we are the right fit for you
          </h1>
        </div>

        {/* Progress bar */}
        <div className="survey-progress-track">
          <div
            className="survey-progress-bar progress-shine"
            style={{ width: `${((page + 1) / total) * 100}%` }}
          />
        </div>
        <p className="survey-page-count">Question {page + 1} of {total}</p>

        {/* Questions */}
        <div className="survey-questions-wrap">
          {questions.map((question, i) => (
            <div
              key={i}
              className={`survey-page ${
                i === page ? 'survey-page--active' : i < page ? 'survey-page--left' : 'survey-page--right'
              }`}
            >
              <h2 className="survey-question">{question.title}</h2>
              <div className="survey-options">
                {question.options.map(opt => (
                  <label
                    key={opt.value}
                    className={`survey-option${answers[question.field] === opt.value ? ' survey-option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name={question.field}
                      value={opt.value}
                      checked={answers[question.field] === opt.value}
                      onChange={() => { setAnswers(p => ({ ...p, [question.field]: opt.value })); setFieldError(''); }}
                      className="survey-radio"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              {fieldError && i === page && (
                <p className="survey-error survey-error--field">{fieldError}</p>
              )}
            </div>
          ))}
        </div>

        {submitError && <p className="survey-error survey-error--submit">{submitError}</p>}

        {/* Navigation */}
        <div className="survey-nav">
          {page > 0 && (
            <button
              onClick={() => { setPage(page - 1); setFieldError(''); }}
              className="survey-btn survey-btn--secondary"
            >
              ← Previous
            </button>
          )}
          <button onClick={handleNext} disabled={submitting} className="survey-btn">
            {submitting ? 'Processing...' : page === total - 1 ? 'Complete ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
