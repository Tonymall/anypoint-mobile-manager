// ============================================================
// Legal Constants — Terms & Conditions
//
// Bump TERMS_VERSION whenever the terms text changes.
// All users must re-accept when the version changes.
// ============================================================

export const TERMS_VERSION = '2026-03.1';
export const TERMS_LAST_UPDATED = 'March 6, 2026';

export interface TermsSection {
  title: string;
  body: string;
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    title: 'Introduction',
    body: 'These Terms & Conditions govern your use of MuleOps. By accessing or using the application, you agree to these terms. If you do not agree, you must not use the application.',
  },
  {
    title: 'Community Application',
    body: 'MuleOps is a free community application built for users of the MuleSoft ecosystem. It is an independent project and is not an official MuleSoft or Salesforce product unless explicitly stated otherwise.',
  },
  {
    title: 'Platform Access',
    body: 'MuleOps does not provide MuleSoft or Anypoint Platform accounts, subscriptions, or registrations. You must already have valid access to the MuleSoft services you connect through the application.',
  },
  {
    title: 'Use of Service',
    body: 'You agree to use MuleOps only in compliance with applicable laws, your organization policies, and the terms that govern your MuleSoft or Anypoint Platform accounts. You are responsible for every action taken through the application using your credentials and tenant access.',
  },
  {
    title: 'Credentials, Data & Privacy',
    body: 'MuleOps uses the credentials or tokens you provide to authenticate with connected MuleSoft APIs. App settings and accepted legal state may be stored locally on your device. Data shown in the application is retrieved from the MuleSoft services you are authorized to access. You remain responsible for protecting access to your device, accounts, and environments.',
  },
  {
    title: 'No Ownership Claim',
    body: 'MuleOps and its maintainers do not claim ownership of MuleSoft, Anypoint Platform, Salesforce, or any third-party services accessed through the application. All trademarks, service marks, and product names remain the property of their respective owners.',
  },
  {
    title: 'No Warranty',
    body: 'MuleOps is provided on an "as is" and "as available" basis, without warranties of any kind, express or implied. The application may contain errors, omissions, interruptions, or unsupported functionality. Use of the application is at your own risk.',
  },
  {
    title: 'Limitation of Liability',
    body: 'To the maximum extent permitted by law, the authors, contributors, and maintainers of MuleOps are not liable for direct, indirect, incidental, consequential, or other damages arising from or related to your use of the application, including platform actions, service interruptions, or data loss.',
  },
  {
    title: 'Changes to Terms',
    body: 'These terms may be updated from time to time. When the terms change, MuleOps will require you to review and accept the updated version before continuing to use the application.',
  },
];
