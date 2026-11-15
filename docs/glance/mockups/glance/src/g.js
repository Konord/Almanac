window.untilTxt = (e) => `until ${hm(e.e)} ${ap(e.e)}`;
window.colOf = (e) => (e.who.length > 2 ? "orange" : P(e.who[0]).col);
window.todayItems = () => [
  ...D.chores.map((c) => ({ t: c.t, who: c.who, icon: c.icon, done: !!c.done })),
  ...D.todos.filter((t) => t.today).map((t) => ({ t: t.t, who: t.who })),
];
window.dockHtml = (on) =>
  `<nav class="dock">${D.nav.map((n) => `<button class="nav ${n.id === on ? "on" : ""}">${img(n.icon)}${n.label}</button>`).join("")}<button class="btn l primary add">${I.plus} Add</button></nav>`;
