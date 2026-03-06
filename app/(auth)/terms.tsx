// Auth route — required acceptance flow (mandatory gate after env selection)
import TermsConditionsScreen from '../../src/screens/legal/TermsConditionsScreen';

export default function TermsRoute() {
  return <TermsConditionsScreen mode="requiredAcceptance" />;
}
