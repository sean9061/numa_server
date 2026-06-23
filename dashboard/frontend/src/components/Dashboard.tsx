import { useStore } from '../store/useStore';
import { Header } from './Header';
import { ServerPanel } from './panels/ServerPanel';
import { ServicesPanel } from './panels/ServicesPanel';
import { HomePanel } from './panels/HomePanel';

export function Dashboard() {
  const panel = useStore(s => s.activePanel);
  return (
    <div className="app">
      <Header />
      {panel === 'services' ? <ServicesPanel />
        : panel === 'home'  ? <HomePanel />
        : <ServerPanel />}
    </div>
  );
}
