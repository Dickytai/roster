import { useState } from 'react';
import { useRosterStore } from './hooks/useRosterStore';
import { StepWizard } from './components/StepWizard';
import { Step1Basic } from './components/Step1Basic';
import { Step2Staff } from './components/Step2Staff';
import { Step3Preview } from './components/Step3Preview';

function App() {
  const store = useRosterStore();
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  const handleStepClick = (step: 1 | 2 | 3) => {
    setActiveStep(step);
  };

  const renderStep = () => {
    switch (activeStep) {
      case 1:
        return (
          <Step1Basic
            year={store.state.year}
            publicHolidays={store.state.publicHolidays}
            onYearChange={store.setYear}
            onNext={() => {
              store.nextStep();
              setActiveStep(2);
            }}
          />
        );
      case 2:
        return (
          <Step2Staff
            staff={store.state.staff}
            onAddStaff={store.addStaff}
            onRemoveStaff={store.removeStaff}
            onBack={() => {
              store.prevStep();
              setActiveStep(1);
            }}
            onNext={() => {
              store.generate();
              setActiveStep(3);
            }}
          />
        );
      case 3:
        return (
          <Step3Preview
            schedule={store.state.onCallSchedule!}
            onBack={() => {
              setActiveStep(2);
            }}
            onReset={store.reset}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-center mb-2 text-gray-900">
          Nurse Roster Generator
        </h1>
        <p className="text-center text-gray-500 mb-8">
          Generate annual on-call schedules in minutes
        </p>

        <StepWizard currentStep={activeStep} onStepClick={handleStepClick} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

export default App;
