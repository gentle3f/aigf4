import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryManager } from '../managers.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const OWNER_EMAIL = 'gentle3f@gmail.com';

const installBrowser = () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, String(value)); },
            removeItem: (key: string) => { storage.delete(key); },
        },
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true },
    });
    const target = new EventTarget() as EventTarget & {
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
        location: { origin: string; pathname: string };
    };
    target.setTimeout = setTimeout;
    target.clearTimeout = clearTimeout;
    target.location = { origin: 'https://example.test', pathname: '/' };
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: target,
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: new EventTarget(),
    });
};

const createManager = () => {
    installBrowser();
    const states: Array<{ phase: string; detail: string }> = [];
    const sync = new SupabaseCloudSyncManager(
        new MemoryManager(),
        new RoomManager(),
        {
            onStateChange: state => states.push({ phase: state.phase, detail: state.detail }),
            onRemoteApplied: () => undefined,
        },
    );
    return { sync, internal: sync as any, states };
};

test('magic-link transport throw exits sending_link into error state', async () => {
    const { sync, internal } = createManager();
    internal.client = {
        auth: {
            signInWithOtp: async () => {
                throw new Error('模擬 magic-link transport 失敗');
            },
        },
    };

    await assert.rejects(
        () => sync.sendMagicLink(OWNER_EMAIL),
        /模擬 magic-link transport 失敗/,
    );

    assert.equal(internal.state.phase, 'error');
    assert.match(internal.state.detail, /magic-link transport 失敗/);
});

test('password-login transport throw exits connecting into error state', async () => {
    const { sync, internal } = createManager();
    internal.client = {
        auth: {
            signInWithPassword: async () => {
                throw new Error('模擬 password transport 失敗');
            },
        },
    };

    await assert.rejects(
        () => sync.signInWithPassword(OWNER_EMAIL, 'valid-password'),
        /模擬 password transport 失敗/,
    );

    assert.equal(internal.state.phase, 'error');
    assert.match(internal.state.detail, /password transport 失敗/);
});

test('invalid credentials still use signed_out instead of transport error state', async () => {
    const { sync, internal } = createManager();
    internal.client = {
        auth: {
            signInWithPassword: async () => ({
                data: { session: null },
                error: { message: 'Invalid login credentials' },
            }),
        },
    };

    await assert.rejects(
        () => sync.signInWithPassword(OWNER_EMAIL, 'wrong-password'),
        /電郵或雲端密碼不正確/,
    );

    assert.equal(internal.state.phase, 'signed_out');
    assert.match(internal.state.detail, /電郵或雲端密碼不正確/);
});

test('password-update transport throw exits connecting into error state', async () => {
    const { sync, internal } = createManager();
    internal.session = { user: { id: 'owner', email: OWNER_EMAIL } };
    internal.client = {
        auth: {
            updateUser: async () => {
                throw new Error('模擬 updateUser transport 失敗');
            },
        },
    };

    await assert.rejects(
        () => sync.setPassword('12345678'),
        /模擬 updateUser transport 失敗/,
    );

    assert.equal(internal.state.phase, 'error');
    assert.match(internal.state.detail, /updateUser transport 失敗/);
});

test('manual sign-out transport throw preserves current runtime and enters error state', async () => {
    const { sync, internal } = createManager();
    const channel = {};
    internal.session = { user: { id: 'owner', email: OWNER_EMAIL } };
    internal.initializedUserId = 'owner';
    internal.channel = channel;
    internal.client = {
        removeChannel: async () => undefined,
        auth: {
            signOut: async () => {
                throw new Error('模擬 signOut transport 失敗');
            },
        },
    };

    await assert.rejects(
        () => sync.signOut(),
        /模擬 signOut transport 失敗/,
    );

    assert.equal(internal.state.phase, 'error');
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(internal.channel, channel);
});

test('getSession transport throw becomes retryable error instead of rejected promise', async () => {
    const { internal } = createManager();
    let retries = 0;
    internal.started = true;
    internal.scheduleAuthSessionRetry = () => { retries += 1; };
    internal.client = {
        auth: {
            getSession: async () => {
                throw new Error('模擬 getSession transport 失敗');
            },
        },
    };

    assert.equal(await internal.refreshAuthSession(), false);
    assert.equal(retries, 1);
    assert.equal(internal.state.phase, 'error');
    assert.match(internal.state.detail, /getSession transport 失敗/);
});

test('unauthorized session stays locally signed out even if automatic sign-out throws', async () => {
    const { internal } = createManager();
    internal.client = {
        removeChannel: async () => undefined,
        auth: {
            signOut: async () => {
                throw new Error('模擬 unauthorized signOut transport 失敗');
            },
        },
    };
    internal.initializedUserId = 'old-owner';

    await internal.applySession({
        user: { id: 'other', email: 'other@example.com' },
    });

    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(internal.state.phase, 'error');
    assert.match(internal.state.detail, /unauthorized signOut transport 失敗/);
});


test('password update completion cannot overwrite a newer cloud session state', async () => {
    const { sync, internal } = createManager();
    const ownerSession = { user: { id: 'owner', email: OWNER_EMAIL } };
    let resolveUpdate!: (value: unknown) => void;
    const updateResult = new Promise(resolve => { resolveUpdate = resolve; });

    internal.session = ownerSession;
    internal.sessionGeneration = 10;
    internal.client = {
        auth: {
            updateUser: () => updateResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;

    const updating = sync.setPassword('12345678');
    await Promise.resolve();
    assert.equal(internal.state.phase, 'connecting');

    await internal.applySession(null);
    await internal.applySession(ownerSession);
    assert.equal(internal.sessionGeneration, 12);
    assert.equal(internal.session?.user.id, 'owner');

    resolveUpdate({ error: null });
    await updating;

    assert.notEqual(internal.state.phase, 'synced');
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.sessionGeneration, 12);
});


test('stale password update failure does not overwrite signed-out state', async () => {
    const { sync, internal } = createManager();
    let rejectUpdate!: (reason: unknown) => void;
    const updateResult = new Promise((_resolve, reject) => { rejectUpdate = reject; });

    internal.session = { user: { id: 'owner', email: OWNER_EMAIL } };
    internal.sessionGeneration = 20;
    internal.client = {
        auth: {
            updateUser: () => updateResult,
        },
        removeChannel: async () => undefined,
    };

    const updating = sync.setPassword('12345678');
    await Promise.resolve();
    await internal.applySession(null);
    assert.equal(internal.state.phase, 'signed_out');

    rejectUpdate(new Error('stale update failure'));
    await assert.rejects(() => updating, /stale update failure/);

    assert.equal(internal.state.phase, 'signed_out');
    assert.equal(internal.session, null);
});


test('stale manual sign-out success cannot clear a newer re-login session', async () => {
    const { sync, internal } = createManager();
    const ownerSession = { user: { id: 'owner', email: OWNER_EMAIL } };
    let resolveSignOut!: (value: unknown) => void;
    const signOutResult = new Promise(resolve => { resolveSignOut = resolve; });

    internal.session = ownerSession;
    internal.sessionGeneration = 30;
    internal.initializedUserId = 'owner';
    internal.client = {
        auth: {
            signOut: () => signOutResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;

    const signingOut = sync.signOut();
    await Promise.resolve();

    await internal.applySession(null);
    await internal.applySession(ownerSession);
    assert.equal(internal.sessionGeneration, 32);
    assert.equal(internal.session?.user.id, 'owner');

    resolveSignOut({ error: null });
    await signingOut;

    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.sessionGeneration, 32);
    assert.notEqual(internal.state.phase, 'signed_out');
});


test('stale manual sign-out failure cannot overwrite a newer re-login state', async () => {
    const { sync, internal } = createManager();
    const ownerSession = { user: { id: 'owner', email: OWNER_EMAIL } };
    let rejectSignOut!: (reason: unknown) => void;
    const signOutResult = new Promise((_resolve, reject) => { rejectSignOut = reject; });

    internal.session = ownerSession;
    internal.sessionGeneration = 40;
    internal.initializedUserId = 'owner';
    internal.client = {
        auth: {
            signOut: () => signOutResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;

    const signingOut = sync.signOut();
    await Promise.resolve();

    await internal.applySession(null);
    await internal.applySession(ownerSession);
    assert.equal(internal.sessionGeneration, 42);

    rejectSignOut(new Error('stale sign-out failure'));
    await assert.rejects(() => signingOut, /stale sign-out failure/);

    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.sessionGeneration, 42);
    assert.notEqual(internal.state.phase, 'error');
});


test('late invalid password result cannot overwrite a newer signed-in auth state', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    let resolveLogin!: (value: unknown) => void;
    const loginResult = new Promise(resolve => { resolveLogin = resolve; });

    internal.authStateChangeEpoch = 50;
    internal.client = {
        auth: {
            signInWithPassword: () => loginResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const loggingIn = sync.signInWithPassword(OWNER_EMAIL, 'old-password');
    await Promise.resolve();

    internal.authStateChangeEpoch = 51;
    await internal.applySession(newerSession);
    assert.equal(internal.state.phase, 'synced');

    resolveLogin({
        data: { session: null },
        error: { message: 'Invalid login credentials' },
    });
    await assert.rejects(() => loggingIn, /電郵或雲端密碼不正確/);

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});


test('late successful password login cannot replace a newer same-user session object', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    const staleSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'stale-token',
    };
    let resolveLogin!: (value: unknown) => void;
    const loginResult = new Promise(resolve => { resolveLogin = resolve; });

    internal.authStateChangeEpoch = 60;
    internal.client = {
        auth: {
            signInWithPassword: () => loginResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const loggingIn = sync.signInWithPassword(OWNER_EMAIL, 'old-password');
    await Promise.resolve();

    internal.authStateChangeEpoch = 61;
    await internal.applySession(newerSession);
    assert.equal(internal.session?.access_token, 'newer-token');

    resolveLogin({
        data: { session: staleSession },
        error: null,
    });
    await loggingIn;

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});


test('late password-login transport failure cannot overwrite a newer auth state', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    let rejectLogin!: (reason: unknown) => void;
    const loginResult = new Promise((_resolve, reject) => { rejectLogin = reject; });

    internal.authStateChangeEpoch = 70;
    internal.client = {
        auth: {
            signInWithPassword: () => loginResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const loggingIn = sync.signInWithPassword(OWNER_EMAIL, 'old-password');
    await Promise.resolve();

    internal.authStateChangeEpoch = 71;
    await internal.applySession(newerSession);

    rejectLogin(new Error('stale password transport failure'));
    await assert.rejects(() => loggingIn, /stale password transport failure/);

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});


test('late magic-link success cannot overwrite a newer signed-in auth state', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    let resolveMagicLink!: (value: unknown) => void;
    const magicLinkResult = new Promise(resolve => { resolveMagicLink = resolve; });

    internal.authStateChangeEpoch = 80;
    internal.client = {
        auth: {
            signInWithOtp: () => magicLinkResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const sending = sync.sendMagicLink(OWNER_EMAIL);
    await Promise.resolve();

    internal.authStateChangeEpoch = 81;
    await internal.applySession(newerSession);
    assert.equal(internal.state.phase, 'synced');

    resolveMagicLink({ error: null });
    await sending;

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});


test('late magic-link API error cannot overwrite a newer signed-in auth state', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    let resolveMagicLink!: (value: unknown) => void;
    const magicLinkResult = new Promise(resolve => { resolveMagicLink = resolve; });

    internal.authStateChangeEpoch = 90;
    internal.client = {
        auth: {
            signInWithOtp: () => magicLinkResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const sending = sync.sendMagicLink(OWNER_EMAIL);
    await Promise.resolve();

    internal.authStateChangeEpoch = 91;
    await internal.applySession(newerSession);

    resolveMagicLink({ error: { message: 'stale magic-link API error' } });
    await assert.rejects(() => sending, /stale magic-link API error/);

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});


test('late magic-link transport failure cannot overwrite a newer signed-in auth state', async () => {
    const { sync, internal } = createManager();
    const newerSession = {
        user: { id: 'owner', email: OWNER_EMAIL },
        access_token: 'newer-token',
    };
    let rejectMagicLink!: (reason: unknown) => void;
    const magicLinkResult = new Promise((_resolve, reject) => { rejectMagicLink = reject; });

    internal.authStateChangeEpoch = 100;
    internal.client = {
        auth: {
            signInWithOtp: () => magicLinkResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => {
        internal.setState('synced', 'newer auth state');
    };
    internal.startRealtime = async () => undefined;

    const sending = sync.sendMagicLink(OWNER_EMAIL);
    await Promise.resolve();

    internal.authStateChangeEpoch = 101;
    await internal.applySession(newerSession);

    rejectMagicLink(new Error('stale magic-link transport failure'));
    await assert.rejects(() => sending, /stale magic-link transport failure/);

    assert.equal(internal.session?.access_token, 'newer-token');
    assert.equal(internal.state.phase, 'synced');
});
