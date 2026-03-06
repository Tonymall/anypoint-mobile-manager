// Main route — read-only view from Settings
import TermsConditionsScreen from '../../src/screens/legal/TermsConditionsScreen';

export default function TermsReadOnlyRoute() {
  return <TermsConditionsScreen mode="readOnly" />;
}
