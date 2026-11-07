import test from 'node:test';
import assert from 'node:assert/strict';
import { winterCampSelection } from '../src/scripts/winter-camp-selection.js';

for (const [code, days, holiday] of [
  ['WINTER_CHRISTMAS_2026', ['21', '22', '23'], '24'],
  ['WINTER_BREAK_2026', ['28', '29', '30'], '31'],
]) {
  const select = hours => winterCampSelection({
    code, basePrice: 32000, hourlyPrice: 1000, availableDays: days,
    pickups: days.map((day, index) => ({ day, hours: hours[index] })),
  });

  test(`${code}: base week and every combination of hourly pickups`, () => {
    for (let first = 0; first <= 3; first++) {
      for (let second = 0; second <= 3; second++) {
        for (let third = 0; third <= 3; third++) {
          const hours = [first, second, third];
          const selection = select(hours);
          assert.equal(selection.valid, true);
          assert.equal(selection.price, 32000 + (first + second + third) * 1000);
          assert.deepEqual(selection.codes, [code, ...days.flatMap((day, index) => hours[index] ? [`${code}_CARE${day}_H${hours[index]}`] : [])]);
        }
      }
    }
    assert.equal(select([0, 0, 0]).price, 32000);
    assert.equal(select([3, 3, 3]).price, 41000);
  });

  test(`${code}: excludes holiday care and invalid hour counts`, () => {
    for (const pickup of [{ day: holiday, hours: 1 }, { day: days[0], hours: 4 }, { day: days[0], hours: -1 }, { day: days[0], hours: 1.5 }]) {
      const selection = winterCampSelection({ code, basePrice: 32000, hourlyPrice: 1000, availableDays: days, pickups: [pickup] });
      assert.equal(selection.valid, false);
      assert.equal(selection.price, null);
      assert.deepEqual(selection.codes, []);
    }
  });
}
