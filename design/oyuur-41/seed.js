// Засев для проверки OYUUR-41 (Playwright: page.evaluate(seed, 'dark' | 'light')).
// Семь деревьев всех пород на разных стадиях, тема — из аргумента.
(theme) => {
  const day = (back) => {
    const d = new Date(Date.now() - 3 * 3600e3 - back * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const plan = [
    ['oak', 0], ['sakura', 2], ['spruce', 6], ['birch', 14], ['maple', 30], ['apple', 60], ['palm', 120],
  ];
  const trees = plan.map(([skin, age], i) => {
    const checkins = [];
    for (let b = age; b >= 1; b--) checkins.push(day(b));
    const id = `t${i}-${skin}`;
    return {
      id, lineageId: id, name: `Привычка ${i + 1}`, kind: 'do', visibility: 'private', skin,
      plantedOn: day(age), checkins, frozen: [], chancesLeft: 3, refilledMonth: day(0).slice(0, 7),
      settledThrough: day(1), diedOn: null, completedOn: null, generation: 1, parentId: null,
      nickname: null, namedOn: null, nameAsks: 3, nameAskedOn: null, nameLaterOn: null,
      openHours: [{ from: day(age), hour: 0 }],
    };
  });
  localStorage.setItem('elevate/v1', JSON.stringify({
    version: 6, trees,
    settings: { theme, animations: true, vibration: false, sounds: false, menuHintSeen: true, language: 'ru', dayOffset: 0, minuteOffset: 0, widgetNames: false },
  }));
  return trees.length;
}
