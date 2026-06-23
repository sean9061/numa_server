import { FlowDiagram } from '../services/FlowDiagram';
import { LogDrawer } from '../services/LogDrawer';

export function ServicesPanel() {
  return (
    <main className="services">
      <FlowDiagram />
      <LogDrawer />
    </main>
  );
}
