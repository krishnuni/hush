import 'fake-indexeddb/auto';
import { File } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
vi.stubGlobal('File', File);
vi.stubGlobal('crypto', webcrypto);
