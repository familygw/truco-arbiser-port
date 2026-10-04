/** Original deal, CS:1381–143E and 1612–1729: draw IDs 0..39,
 * retry duplicates, player first and CPU second. No Fisher–Yates shuffle. */
export function originalDealIds(random: () => number): [number[], number[]] {
  const ids: number[] = [];
  while (ids.length < 6) {
    const id = Math.floor(random() * 40);
    if (!ids.includes(id)) ids.push(id);
  }
  return [ids.slice(0, 3), ids.slice(3)];
}
