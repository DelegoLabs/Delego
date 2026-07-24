const checkedAt = new Date(health.checkedAt).getTime();

expect(checkedAt).toBeGreaterThan(0);
expect(Number.isNaN(checkedAt)).toBe(false);
expect(checkedAt).toBeCloseTo(Date.now(), -3);