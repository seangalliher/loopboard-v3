import type { Board } from '../src/model';

export function buildSeed(today: string): Board;

export default function setup(page: {
  evaluate(fn: (arg: [string, string]) => void, arg: [string, string]): Promise<void>;
  reload(options: { waitUntil: 'networkidle' }): Promise<unknown>;
}): Promise<void>;
