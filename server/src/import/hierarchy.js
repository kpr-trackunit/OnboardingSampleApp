/**
 * Parent References Within a File
 * A chart of accounts is a tree: each account's parentCode must be the code of another
 * account in the same file. Orphans are rejected rather than stored with a dangling parent.
 */

/**
 * Rejects rows whose parent is missing from the file, was itself rejected, or forms a loop.
 * Runs until stable, so a rejected parent also rejects its children (and their children).
 * @param {{ line: number, record: Object }[]} accepted - Rows that passed the row-level checks
 * @param {{ line: number, record: Object }[]} all - Every row in the file, including rejected ones
 * @param {{ keyField: string, parentField: string, parentColumn: string|null }} options
 * @returns {{ accepted: { line: number, record: Object }[], errors: { line: number, field: string, column: string|null, value: string, message: string }[] }}
 */
function checkParents(accepted, all, { keyField, parentField, parentColumn }) {
  const label = `\`${parentColumn || parentField}\``;
  const inFile = new Set(all.map(({ record }) => record[keyField]).filter(Boolean));
  const parentOf = new Map(accepted.map(({ record }) => [record[keyField], record[parentField]]));
  const errors = [];
  let remaining = accepted;

  const reject = (row, reason) => {
    const parent = row.record[parentField];
    errors.push({ line: row.line, field: parentField, column: parentColumn, value: parent, message: `${label} '${parent}' ${reason}` });
  };

  // Walks up from a code; true when the chain comes back to it. A child hanging off a
  // loop isn't in it: it is rejected on the next pass because its parent was.
  const inLoop = code => {
    const seen = new Set();
    let current = code;
    while (current) {
      if (seen.has(current)) return current === code;
      seen.add(current);
      current = parentOf.get(current);
    }
    return false;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const valid = new Set(remaining.map(({ record }) => record[keyField]));
    const next = [];

    remaining.forEach(row => {
      const parent = row.record[parentField];
      if (!parent) {
        next.push(row);
      } else if (parent === row.record[keyField]) {
        reject(row, 'is the account itself');
      } else if (!inFile.has(parent)) {
        reject(row, 'does not exist in this file');
      } else if (!valid.has(parent)) {
        reject(row, 'was rejected, so this account has no parent');
      } else if (inLoop(row.record[keyField])) {
        reject(row, 'makes a loop of parent accounts');
      } else {
        next.push(row);
      }
    });

    if (next.length !== remaining.length) {
      changed = true;
      remaining.filter(row => !next.includes(row)).forEach(row => parentOf.delete(row.record[keyField]));
      remaining = next;
    }
  }

  return { accepted: remaining, errors };
}

module.exports = {
  checkParents
};
