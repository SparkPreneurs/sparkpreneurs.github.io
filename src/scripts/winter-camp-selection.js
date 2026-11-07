export function winterCampSelection({ code, basePrice, hourlyPrice, availableDays, pickups }) {
  const care = pickups.filter(({ hours }) => hours > 0);
  const valid = pickups.every(({ day, hours }) => availableDays.includes(day) && Number.isInteger(hours) && hours >= 0 && hours <= 3)
    && new Set(pickups.map(({ day }) => day)).size === pickups.length;
  const careHours = care.reduce((sum, { hours }) => sum + hours, 0);
  const carePrice = careHours * hourlyPrice;
  return {
    valid, care, careHours, carePrice,
    price: valid && basePrice !== null ? basePrice + carePrice : null,
    codes: valid ? [code, ...care.map(({ day, hours }) => `${code}_CARE${day}_H${hours}`)] : [],
  };
}
