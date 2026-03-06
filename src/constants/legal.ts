// ============================================================
// Legal Constants — Terms & Conditions
//
// Bump TERMS_VERSION whenever the terms text changes.
// All users must re-accept when the version changes.
// ============================================================

export const TERMS_VERSION = '2026-03';
export const TERMS_LAST_UPDATED = 'March 6, 2026';

export interface TermsSection {
  title: string;
  body: string;
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'Introduction',
    body: 'Welcome to MuleOps, a community-built mobile management companion for the MuleSoft Anypoint Platform. By using this application, you agree to the following terms and conditions. MuleOps is an independent, open-source project and is not affiliated with, endorsed by, or officially supported by MuleSoft or Salesforce.',
  },
  {
    title: 'Important Notice',
    body: 'MuleOps is provided as a convenience tool for managing your Anypoint Platform resources on the go. This application interacts with MuleSoft Anypoint Platform APIs using credentials you provide. You are solely responsible for any actions taken through this application, including but not limited to deploying, restarting, or modifying applications and configurations.',
  },
  {
    title: 'Account & Credentials',
    body: 'Your Anypoint Platform credentials are used exclusively to authenticate with MuleSoft APIs. Credentials are stored securely on your device using platform-native secure storage and are never transmitted to any third-party servers. You are responsible for maintaining the confidentiality of your credentials and for all activities that occur under your account.',
  },
  {
    title: 'Acceptable Use',
    body: 'You agree to use MuleOps only for lawful purposes and in compliance with your organization\'s policies and MuleSoft\'s terms of service. You must not use this application to perform unauthorized actions, circumvent access controls, or violate any applicable laws or regulations.',
  },
  {
    title: 'Data & Privacy',
    body: 'MuleOps does not collect, store, or transmit any personal data or telemetry to external servers. All data displayed in the application is fetched directly from your Anypoint Platform account via official MuleSoft APIs. Application preferences and settings are stored locally on your device.',
  },
  {
    title: 'Disclaimer of Warranties',
    body: 'MuleOps is provided "as is" and "as available" without warranties of any kind, either express or implied. The developers make no warranty that the application will be uninterrupted, error-free, or free of harmful components. Use of this application is at your own risk.',
  },
  {
    title: 'Limitation of Liability',
    body: 'In no event shall the MuleOps developers or contributors be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of data, revenue, or business opportunities, arising out of or in connection with your use of this application.',
  },
  {
    title: 'Changes to Terms',
    body: 'We reserve the right to modify these terms at any time. When terms are updated, the version number will change and you will be required to review and accept the new terms before continuing to use the application. Continued use after accepting updated terms constitutes agreement to the revised terms.',
  },
];
