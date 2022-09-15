/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Awareness } from 'y-protocols/awareness.js';
import type { Doc } from 'yjs';

import {
    IndexedDBProvider,
    KeckProvider,
    SQLiteProvider,
    WebsocketProvider,
} from '@toeverything/jwt-rpc';

import type { BucketBackend } from '../types';
import type { Connectivity } from './types';

type YContext = {
    awareness: Awareness;
    doc: Doc;
    token?: string | undefined;
    workspace: string;
    emitState: (connectivity: Connectivity) => void;
};

export type YProviderFactory = (context: YContext) => Promise<void>;

export type YProviderType = 'idb' | 'sqlite' | 'ws' | 'keck';

export type YProviderOptions = {
    enabled: YProviderType[];
    backend: typeof BucketBackend[keyof typeof BucketBackend];
    params?: Record<string, string>;
    importData?: () => Promise<Uint8Array> | Uint8Array | undefined;
    exportData?: (binary: Uint8Array) => Promise<void> | undefined;
    hasExporter?: () => boolean;
};

export const getYProviders = (
    options: YProviderOptions
): Record<string, YProviderFactory> => {
    // eslint-disable-next-line no-console
    console.log('getYProviders', options);
    return {
        indexeddb: async (context: YContext) => {
            if (options.enabled.includes('idb')) {
                await new IndexedDBProvider(context.workspace, context.doc)
                    .whenSynced;
            }
        },
        sqlite: async (context: YContext) => {
            if (options.enabled.includes('sqlite')) {
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                const fsHandle = setInterval(async () => {
                    if (options.hasExporter?.()) {
                        clearInterval(fsHandle);
                        const fs = new SQLiteProvider(
                            context.workspace,
                            context.doc,
                            await options.importData?.()
                        );
                        if (options.exportData) {
                            fs.registerExporter(options.exportData);
                        }
                        await fs.whenSynced;
                    }
                }, 500);
            }
        },
        ws: async (context: YContext) => {
            if (options.enabled.includes('ws')) {
                if (context.token) {
                    const ws = new WebsocketProvider(
                        context.token,
                        options.backend,
                        context.workspace,
                        context.doc,
                        {
                            awareness: context.awareness,
                            params: options.params,
                        }
                    );

                    // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
                    return new Promise((resolve, reject) => {
                        // TODO: synced will also be triggered on reconnection after losing sync
                        // There needs to be an event mechanism to emit the synchronization state to the upper layer
                        ws.once('synced', () => resolve());
                        ws.once('lost-connection', () => resolve());
                        ws.once('connection-error', () => reject());
                        ws.on('synced', () => context.emitState('connected'));
                        ws.on('lost-connection', () =>
                            context.emitState('retry')
                        );
                        ws.on('connection-error', () =>
                            context.emitState('retry')
                        );
                    });
                }
            }
        },
        keck: async (context: YContext) => {
            if (options.enabled.includes('keck')) {
                if (context.token) {
                    const ws = new KeckProvider(
                        context.token,
                        options.backend,
                        context.workspace,
                        context.doc,
                        {
                            params: options.params,
                        }
                    );

                    // Wait for ws synchronization to complete, otherwise the data will be modified in reverse, which can be optimized later
                    return new Promise((resolve, reject) => {
                        // TODO: synced will also be triggered on reconnection after losing sync
                        // There needs to be an event mechanism to emit the synchronization state to the upper layer
                        ws.once('synced', () => resolve());
                        ws.once('lost-connection', () => resolve());
                        ws.once('connection-error', () => reject());
                        ws.on('synced', () => context.emitState('connected'));
                        ws.on('lost-connection', () =>
                            context.emitState('retry')
                        );
                        ws.on('connection-error', () =>
                            context.emitState('retry')
                        );
                    });
                }
            }
        },
    };
};
