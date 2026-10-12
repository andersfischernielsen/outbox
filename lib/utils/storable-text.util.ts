/**
 * What a string holds that the SQL stores can't keep, or `undefined`: U+0000, which PostgreSQL refuses in `text` and
 * `jsonb`, or a lone UTF-16 surrogate, which isn't Unicode text (PostgreSQL and MySQL both refuse it in JSON).
 */
export function unstorableText(text: string): string | undefined {
  if (text.includes('\u0000')) {
    return 'U+0000';
  }
  if (!text.isWellFormed()) {
    return 'a lone UTF-16 surrogate';
  }
  return undefined;
}

interface Step {
  readonly value: unknown;
  /** The object key this value sits under: checked too. */
  readonly key?: string;
  readonly parent: Step | undefined;
  readonly name: string;
}

/**
 * The first string of a JSON value (what `JSON.parse()` returns), a value or an object's key, that `unstorableText()`
 * refuses, with its path (`$.lines[0].note`), or `undefined`. Walks with a stack of its own, so a value as deep as
 * `JSON.stringify()` takes can't overflow the call stack.
 */
export function findUnstorableText(value: unknown): { path: string; problem: string } | undefined {
  const pending: Step[] = [{ value, parent: undefined, name: '$' }];
  for (let step = pending.pop(); step; step = pending.pop()) {
    const keyProblem = step.key === undefined ? undefined : unstorableText(step.key);
    if (keyProblem) {
      return { path: `${pathOf(step)} (its key)`, problem: keyProblem };
    }

    const current = step.value;
    if (typeof current === 'string') {
      const problem = unstorableText(current);
      if (problem) {
        return { path: pathOf(step), problem };
      }
    } else if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) {
        pending.push({ value: current[i], parent: step, name: `[${i}]` });
      }
    } else if (current !== null && typeof current === 'object') {
      const keys = Object.keys(current);
      for (let i = keys.length - 1; i >= 0; i--) {
        const key = keys[i]!;
        pending.push({ value: (current as Record<string, unknown>)[key], key, parent: step, name: member(key) });
      }
    }
  }
  return undefined;
}

function member(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function pathOf(step: Step): string {
  let path = '';
  for (let at: Step | undefined = step; at; at = at.parent) {
    path = at.name + path;
  }
  return path;
}
