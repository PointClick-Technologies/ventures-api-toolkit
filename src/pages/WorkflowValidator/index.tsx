import { useState } from 'react';
import LoanIntakeFlow from './LoanIntakeFlow';
import ServicingTicklers from './ServicingTicklers';
import ApiDiscovery from './ApiDiscovery';
import { GitBranch, Clock, Compass } from 'lucide-react';

type Tab = 'loan' | 'ticklers' | 'discovery';

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; desc: string }> = [
  { id: 'loan',      label: 'Loan Intake Follow-Up', icon: GitBranch, desc: 'Workflow 1' },
  { id: 'ticklers',  label: 'Servicing Ticklers',     icon: Clock,     desc: 'Workflow 2' },
  { id: 'discovery', label: 'API Discovery',           icon: Compass,   desc: 'Workflow 3' },
];

export default function WorkflowValidator() {
  const [active, setActive] = useState<Tab>('loan');

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl">
        {tabs.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active === id
                ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            <Icon size={15} />
            <div className="text-left hidden sm:block">
              <div>{label}</div>
              <div className="text-[10px] opacity-60">{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fade-in">
        {active === 'loan'      && <LoanIntakeFlow />}
        {active === 'ticklers'  && <ServicingTicklers />}
        {active === 'discovery' && <ApiDiscovery />}
      </div>
    </div>
  );
}
