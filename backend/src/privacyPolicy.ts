export function renderPrivacyPolicyHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MuleOps Privacy Policy</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #07111f;
        color: #dce7f7;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }
      h1, h2 {
        color: #ffffff;
        letter-spacing: -0.02em;
      }
      h1 {
        font-size: 2.2rem;
        margin-bottom: 8px;
      }
      h2 {
        font-size: 1.15rem;
        margin-top: 28px;
        margin-bottom: 10px;
      }
      p, li {
        color: #b7c6dc;
        line-height: 1.7;
        font-size: 0.98rem;
      }
      .card {
        background: linear-gradient(180deg, #0a1730, #081224);
        border: 1px solid rgba(124, 163, 215, 0.18);
        border-radius: 20px;
        padding: 28px;
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
      }
      .muted {
        color: #88a3c7;
      }
      a {
        color: #31c1ff;
      }
      ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="card">
        <h1>Privacy Policy</h1>
        <p class="muted">Last updated: March 9, 2026</p>

        <p>
          MuleOps is an independent mobile operations companion for authorized users of MuleSoft Anypoint Platform.
          This Privacy Policy explains what data the app processes, how it is used, and how users can contact us.
        </p>

        <h2>Who this policy applies to</h2>
        <p>
          This policy applies to the MuleOps mobile application and related support services, including backend services
          used for bug reporting and alert history synchronization.
        </p>

        <h2>What data the app processes</h2>
        <ul>
          <li>Authentication details entered by the user to access MuleSoft services.</li>
          <li>Selected control plane, organization, and environment context needed to call supported APIs.</li>
          <li>Operational data retrieved from MuleSoft APIs, such as applications, alerts, logs, deployments, and monitoring results.</li>
          <li>Optional bug reports submitted by the user, including email address, username, app version, control plane, and description of the issue.</li>
          <li>Local app preferences such as theme, notification preferences, accepted legal terms, and cached notification history.</li>
          <li>Biometric preference state used to support secure local authentication features when enabled by the user.</li>
        </ul>

        <h2>How data is used</h2>
        <ul>
          <li>To authenticate the user against MuleSoft services.</li>
          <li>To display operational information the user is authorized to access.</li>
          <li>To send local notifications and maintain alert history for the signed-in user.</li>
          <li>To receive, store, and deliver bug reports sent by the user.</li>
          <li>To enforce app configuration such as minimum supported version and operational feature flags.</li>
        </ul>

        <h2>Data sharing</h2>
        <p>
          MuleOps does not sell user data. Data may be transmitted to:
        </p>
        <ul>
          <li>MuleSoft / Salesforce services requested by the user through the app.</li>
          <li>The MuleOps backend for bug reporting, alert history synchronization, and remote configuration.</li>
          <li>Email delivery infrastructure used to forward bug reports to support.</li>
        </ul>

        <h2>Local storage</h2>
        <p>
          The app stores some information locally on the device, including preferences, accepted legal terms, cached notifications,
          and secure authentication material required for the current session.
        </p>

        <h2>Retention</h2>
        <p>
          Bug reports and server-synced alert history may be retained on the MuleOps backend for operational support, diagnostics,
          and product improvement. Local cached data remains on the device until the user signs out, clears app data, or removes the app.
        </p>

        <h2>Security</h2>
        <p>
          MuleOps uses HTTPS for network communication and uses platform secure storage where supported for sensitive local values.
          No mobile application can guarantee absolute security, and users remain responsible for securing their devices and accounts.
        </p>

        <h2>Children</h2>
        <p>
          MuleOps is intended for professional or administrative use and is not directed to children.
        </p>

        <h2>Contact</h2>
        <p>
          For privacy questions or data handling requests, contact:
          <a href="mailto:malliotisantonis@gmail.com">malliotisantonis@gmail.com</a>
        </p>

        <h2>Policy changes</h2>
        <p>
          This policy may be updated from time to time. Material changes should be reflected in the app and store metadata as appropriate.
        </p>
      </div>
    </main>
  </body>
</html>`;
}
