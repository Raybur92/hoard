import { generateCode } from './inviteCodes';

describe('generateCode', () => {
  it('produces a string matching the regex ^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateCode()).toMatch(/^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
  });

  it('never emits the banned characters 0/O/1/I in the random portion', () => {
    // Run a large sample; statistically every position should be
    // exercised hundreds of times. If any banned char makes it
    // through, the alphabet is wrong. Note: the literal `HOARD-`
    // prefix contains an `O` and `A` — the check applies only to
    // the eight random characters, not the prefix.
    for (let i = 0; i < 5000; i++) {
      const c = generateCode();
      // Strip the literal prefix and dash separators, then check
      // only the random characters.
      const random = c.replace(/^HOARD-/, '').replace(/-/g, '');
      expect(random).not.toMatch(/[01OI]/);
    }
  });

  it('produces distinct codes across many calls (sanity check on randomness)', () => {
    // 100 calls with a 32^8 keyspace — collision probability ≈ 10^-7.
    // If we ever collide here, RNG is broken or the sample size is wrong.
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) codes.add(generateCode());
    expect(codes.size).toBe(100);
  });
});
