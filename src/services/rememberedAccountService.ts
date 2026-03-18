import { getRegionUrl } from '../config/regions';
import { useAuthStore, type RememberedAccountSession } from '../stores/authStore';
import logger from '../utils/logger';
import {
  clearHeaders,
  setAuthHeader,
  setEnvironmentHeader,
  setOrganizationHeader,
  setRegion,
  storeTokens,
} from './api';
import * as authService from './authService';

type ActiveSessionSnapshot = Pick<
  RememberedAccountSession,
  'user' | 'tokens' | 'isAuthenticated' | 'selectedRegion' | 'currentOrganization' | 'currentEnvironment'
>;

function getActiveSessionSnapshot(): ActiveSessionSnapshot | null {
  const state = useAuthStore.getState();
  if (!state.user || !state.tokens) {
    return null;
  }

  return {
    user: state.user,
    tokens: state.tokens,
    isAuthenticated: state.isAuthenticated,
    selectedRegion: state.selectedRegion,
    currentOrganization: state.currentOrganization,
    currentEnvironment: state.currentEnvironment,
  };
}

async function applyApiSession(session: {
  tokens: RememberedAccountSession['tokens'];
  selectedRegion: RememberedAccountSession['selectedRegion'];
  currentOrganization: RememberedAccountSession['currentOrganization'];
  currentEnvironment: RememberedAccountSession['currentEnvironment'];
}): Promise<void> {
  await authService.logout();
  await setRegion(session.selectedRegion);
  await storeTokens(session.tokens.accessToken, session.tokens.refreshToken);
  setAuthHeader(session.tokens.accessToken);
  clearHeaders();

  if (session.currentOrganization) {
    setOrganizationHeader(session.currentOrganization.id);
  }

  if (session.currentEnvironment) {
    setEnvironmentHeader(session.currentEnvironment.id);
  }
}

export async function activateRememberedAccount(accountId: string): Promise<void> {
  const state = useAuthStore.getState();
  const rememberedAccount = state.rememberedAccounts[accountId];

  if (!rememberedAccount) {
    throw new Error('Saved account not found on this device.');
  }

  const previousSession = getActiveSessionSnapshot();

  try {
    await applyApiSession(rememberedAccount);
    const verifiedUser = await authService.getCurrentUser(
      rememberedAccount.tokens.accessToken,
      getRegionUrl(rememberedAccount.selectedRegion),
    );

    const latestState = useAuthStore.getState();
    latestState.useRememberedAccount(accountId);
    latestState.setUser(verifiedUser);

    logger.log('[Accounts] Activated remembered account:', verifiedUser.email || verifiedUser.username);
  } catch (error: any) {
    const status = error?.response?.status;
    logger.warn(
      '[Accounts] Failed to activate remembered account:',
      status ?? error?.message ?? 'unknown error',
    );

    if (previousSession) {
      await applyApiSession(previousSession);
    } else {
      await authService.logout();
      clearHeaders();
    }

    if (status === 401 || status === 403) {
      useAuthStore.getState().removeRememberedAccount(accountId);
      throw Object.assign(new Error('Saved session expired. Please sign in again.'), {
        code: 'REMEMBERED_ACCOUNT_EXPIRED',
        accountId,
        username: rememberedAccount.user.username,
        email: rememberedAccount.user.email,
        selectedRegion: rememberedAccount.selectedRegion,
      });
    }

    throw new Error('Unable to switch accounts right now. Please try again.');
  }
}
