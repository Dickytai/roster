interface StepWizardProps {
  currentStep: 1 | 2 | 3;
  onStepClick: (step: 1 | 2 | 3) => void;
}

export function StepWizard({ currentStep, onStepClick }: StepWizardProps) {
  const steps = [
    { num: 1, label: 'Year & Holidays' },
    { num: 2, label: 'Staff & Leave' },
    { num: 3, label: 'Preview & Download' },
  ];

  return (
    <div className="flex items-center justify-center gap-4 mb-8">
      {steps.map((step, i) => (
        <div key={step.num} className="flex items-center gap-4">
          <button
            onClick={() => step.num < currentStep && onStepClick(step.num as 1 | 2 | 3)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all
              ${currentStep === step.num
                ? 'bg-primary text-white'
                : step.num < currentStep
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }
            `}
            disabled={step.num > currentStep}
          >
            <span className={`
              w-6 h-6 rounded-full flex items-center justify-center text-xs
              ${currentStep === step.num ? 'bg-white/20' : ''}
            `}>
              {step.num}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
          </button>
          {i < steps.length - 1 && (
            <div className={`w-8 h-px ${step.num < currentStep ? 'bg-primary' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}
