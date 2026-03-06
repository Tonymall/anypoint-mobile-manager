/**
 * Query Key Scoping Tests
 *
 * Verifies that runtime query keys include org/env IDs,
 * so switching tenant context prevents stale cache reuse.
 */

import { runtimeKeys } from '../hooks/queries/useRuntimeQueries';
import { useAuthStore } from '../stores/authStore';

describe('runtimeKeys — org/env scoping', () => {
  afterEach(() => {
    // Reset store to initial state
    useAuthStore.setState({
      currentOrganization: null,
      currentEnvironment: null,
    });
  });

  it('should include org and env IDs when set', () => {
    useAuthStore.setState({
      currentOrganization: { id: 'org-123', name: 'Test Org' } as any,
      currentEnvironment: { id: 'env-456', name: 'Sandbox' } as any,
    });

    const key = runtimeKeys.applications();
    expect(key).toContain('org-123');
    expect(key).toContain('env-456');
    expect(key).toContain('applications');
  });

  it('should use placeholder when org/env are null', () => {
    useAuthStore.setState({
      currentOrganization: null,
      currentEnvironment: null,
    });

    const key = runtimeKeys.applications();
    expect(key).toContain('_');
    expect(key).toContain('applications');
  });

  it('should produce DIFFERENT keys for different orgs', () => {
    useAuthStore.setState({
      currentOrganization: { id: 'org-AAA', name: 'Org A' } as any,
      currentEnvironment: { id: 'env-111', name: 'Prod' } as any,
    });
    const keyA = runtimeKeys.applications();

    useAuthStore.setState({
      currentOrganization: { id: 'org-BBB', name: 'Org B' } as any,
      currentEnvironment: { id: 'env-222', name: 'Sandbox' } as any,
    });
    const keyB = runtimeKeys.applications();

    expect(keyA).not.toEqual(keyB);
  });

  it('should produce DIFFERENT keys for same org but different env', () => {
    useAuthStore.setState({
      currentOrganization: { id: 'org-123', name: 'Org' } as any,
      currentEnvironment: { id: 'env-PROD', name: 'Production' } as any,
    });
    const keyProd = runtimeKeys.application('my-app');

    useAuthStore.setState({
      currentOrganization: { id: 'org-123', name: 'Org' } as any,
      currentEnvironment: { id: 'env-SAND', name: 'Sandbox' } as any,
    });
    const keySand = runtimeKeys.application('my-app');

    expect(keyProd).not.toEqual(keySand);
    // Both should still contain the app domain
    expect(keyProd).toContain('my-app');
    expect(keySand).toContain('my-app');
  });

  it('all() should return scoped prefix array', () => {
    useAuthStore.setState({
      currentOrganization: { id: 'org-X', name: 'X' } as any,
      currentEnvironment: { id: 'env-Y', name: 'Y' } as any,
    });
    const prefix = runtimeKeys.all();
    expect(prefix).toEqual(['runtime', 'org-X', 'env-Y']);
  });

  it('logs key should include domain and scope', () => {
    useAuthStore.setState({
      currentOrganization: { id: 'org-1', name: 'O' } as any,
      currentEnvironment: { id: 'env-2', name: 'E' } as any,
    });
    const key = runtimeKeys.logs('my-api');
    expect(key).toContain('org-1');
    expect(key).toContain('env-2');
    expect(key).toContain('logs');
    expect(key).toContain('my-api');
  });
});
